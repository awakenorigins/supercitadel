# Soul-Trade — AI Trading module for SuperCitadel

A plug-and-play SuperCitadel module (`modules/soul-trade/`) that turns the Citadel into
an AI crypto trading desk: isolated bots, pluggable strategies, look-ahead-safe backtesting,
**real exchange data** (Bybit / Binance / BingX / OKX via ccxt), a **per-bot LLM with agent
splitting**, **local-model support**, and **persistent decision memory + cross-turn & aggregate
analytics** — all multi-tenant with fail-closed RLS, driven by Tiểu Tâm in Vietnamese.

Follows the Citadel module contract exactly: `manifest.module.json`, lifecycle hooks
(`src/index.ts`), framework-neutral routes (`src/routes.ts`), Tiểu Tâm tools (`src/tools/`),
intents (`src/intents.ts`), Drizzle schema (`src/db/schema.ts`), and SQL migrations with RLS.

## What it does

- **Bots** — each row in `st_bots` is an isolated engine: own exchange, symbols, strategy,
  risk, mode (paper/live), and LLM/agent config. Isolated per org by RLS.
- **Strategies** — `rsi_ema`, `donchian_breakout`, `bollinger_meanrev` (pluggable registry).
- **Data sources** — `makeDataSource(exchangeId)` → ccxt-backed real data for Bybit, Binance,
  BingX, OKX, Gate, KuCoin, MEXC. `synthetic` source powers offline demos + tests.
- **Per-bot LLM + agents** — a bot's brain is split into agents (`signal-agent`, `risk-agent`,
  `sentiment-agent`). Each agent can run on its **own model** — cloud gateway or a **local model**
  (Ollama / LM Studio / llama.cpp) via `baseUrl`. A confidence-weighted consensus confirms or
  vetoes the technical signal.
- **Auto-trade runner** — `BotRunner` (`runner.ts`) is the loop that makes a bot trade BY
  ITSELF: every tick it fetches fresh candles, runs the shared assessment (strategy → AI →
  optional agents), checks SL/TP, opens/closes through an `Executor`, records trades +
  decision memory + equity, and emits events. Cooldown after stops, daily-loss kill-switch,
  re-entrancy guard, per-symbol error isolation. `RunnerManager` holds one per (org, bot).
- **Walk-forward** — grid-search in-sample, validate out-of-sample, roll forward; only the
  stitched OOS curve is reported (`optimize.ts`).
- **Live/paper execution** — `PaperExecutor` (deterministic sim) and `LiveExecutor` (real
  ccxt orders: market entry + reduce-only SL/TP, leverage) behind one `Executor` interface.
- **Memory & analytics** — every evaluation writes a decision to `st_decisions` (strategy signal +
  AI score + agent votes = the bot's memory). `st_trades` holds fills. Analytics roll up per bot,
  per strategy, and per agent (win rate, profit factor, PnL, avg R, agent agreement), across turns
  and across total trades. `st_decisions.embedding vector(1536)` is pgvector-ready for semantic recall.

## Configure a bot's brain (per-bot LLM + local model)

```jsonc
// st_bots.llm  (or via soul-trade.bot.create input `llm`)
{
  "agents": [
    { "name": "signal-agent",  "enabled": true,  "role": "technical analyst",
      "systemPrompt": "...", "llm": { "model": "cc/claude-sonnet-4-6" } },     // cloud gateway
    { "name": "risk-agent",    "enabled": true,  "role": "risk manager",
      "systemPrompt": "...", "llm": { "baseUrl": "http://localhost:11434/v1",  // LOCAL model
                                       "model": "llama3.1" } },
    { "name": "sentiment-agent","enabled": false, "role": "sentiment", "systemPrompt": "..." }
  ]
}
```

Providers resolve from the per-agent `llm` first, then the host env (`LLM_BASE_URL`, `LLM_MODEL`,
`LLM_API_KEY`, and `LLM2_*`). Model prefix `local/*` or an explicit `baseUrl` routes to a local
OpenAI-compatible server; no config falls back to an offline stub.

## Tools for Tiểu Tâm (9 read · 6 write)

Read: `bot.list`, `bot.status`, `trades.recent`, `analytics.summary`, `analytics.org`,
`memory.recent`, `memory.recall` (semantic), `agents.contribution`.
Write: `bot.create`, `bot.start`, `bot.stop`, `bot.delete`, `backtest.run`, `walkforward.run`, `turn.evaluate`.
See `docs/TOOLS.md`. Intents (VN/EN) in `src/intents.ts`.

## Install into SuperCitadel

See `INTEGRATION.md`. Short version:
1. Copy `modules/soul-trade/` into the repo and `pnpm i` (adds `ccxt`).
2. The host runs the migrations via `onInstall` (creates `st_*` tables + RLS; pgvector column on
   the pgvector image).
3. The api registers the module's routes; `onActivate` registers tools + intents with Tiểu Tâm.
4. Copy `apps/web/app/soul-trade/page.tsx` for the dashboard.
5. Set LLM env (or per-bot `llm`) for real agents; point `baseUrl` at a local model to run offline.

## Tests

`pnpm --filter @citadel/module-soul-trade test` — **86 checks across 8 suites** (tsx + pglite),
matching Citadel's own test approach:
- `logic` (13): indicators, strategies, exact risk sizing, look-ahead-safe backtest, R-multiples.
- `smoke` (14): migrations apply, org isolation, per-turn memory, analytics, agent contribution.
- `agents` (10): consensus, veto/confirm, provider resolution (incl. local model), stub fallback.
- `turn` (5): backtest saved to DB, evaluateTurn records memory (with & without agents).
- `optimize` (9): grid product, walk-forward windows, OOS trades, stitched equity continuity.
- `embeddings` (7): deterministic embedder, cosine bounds, semantic ranking, vector literal.
- `executor` (12): paper open/close, R-multiples, intrabar SL/TP, MTM, live-mode guards.
- `runner` (16): END-TO-END AUTO-TRADE — 500 simulated ticks: opens+closes trades by itself,
  records them to st_trades + memory + equity, exact R, equity conservation (1000+ΣPnL==realized),
  kill-switch gating, paused-status honor, error isolation, RunnerManager.

## UI
- `apps/web/app/soul-trade/page.tsx` — full brass-on-slate dashboard (canvas sparklines,
  memory feed, agents + semantic recall, backtest + walk-forward labs).
- `ui/demo.html` — standalone OFFLINE preview of the same UI with mock data; double-click to
  open, no stack needed.

## Documentation
`docs/ARCHITECTURE.md` (design cross-sections) · `docs/GUIDE.md` (operator guide) ·
`docs/TUTORIAL.md` (step-by-step) · `docs/TOOLS.md` (tool reference) · `docs/EVENTS.md` (events) ·
`INTEGRATION.md` (wiring into SuperCitadel).

## ⚠ Reminder

Paper mode is the default and needs no keys. Backtest + paper first; the bundled strategies are
starting points, not edges. Give live API keys Read + Trade only. Leveraged futures can lose everything.
