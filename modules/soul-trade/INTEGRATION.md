# Wiring Soul-Trade into SuperCitadel

Drop-in, following the exact pattern the api loader already uses for `soul-manager` /
`soul-inventory`. Five small steps.

## 1) Copy the module + web page
```
cp -r modules/soul-trade            <repo>/modules/soul-trade
cp -r apps/web/app/soul-trade       <repo>/apps/web/app/soul-trade
```
Then install (adds `ccxt` + `pg`):
```
pnpm install
```

## 2) Register routes in the api loader
`services/api/src/modules/loader.ts` — add one import and one builder entry
(same shape as the other soul-* modules):
```ts
import { buildSoulTradeRoutes } from '@citadel/module-soul-trade/server/host-adapter.js';

const builders: Record<string, Builder> = {
  // …existing…
  'soul-trade': (d) => buildSoulTradeRoutes({
    requireAuth: d.requireAuth,
    gate: d.requireModule(d.db, 'soul-trade'),
  }),
};
```
The catalog is built from manifests automatically (`buildCatalogFromManifests()`), so
`manifest.json` shows up in the store with its Ôm pricing — nothing else to do there.

## 3) Migrations
The module ships its own migrations and runs them from `onInstall`
(`0000_init.sql`, `0001_rls.sql`, `0002_memory_vector.sql`). When the host installs the
module it calls the hook; the `st_*` tables + RLS policies are created, and on the
`pgvector/pgvector:pg16` image the `embedding vector(1536)` column + ivfflat index too.
(If you migrate out-of-band, just run those three files in order against the DB.)

## 4) RLS needs a non-superuser role
`0001_rls.sql` uses `FORCE ROW LEVEL SECURITY` and is FAIL-CLOSED. The host-adapter opens
a per-request transaction and runs `set_config('app.current_org_id', <org>, true)` before
any query — so isolation is automatic. Just make sure the api connects to Postgres as a
**non-superuser** role (superusers bypass FORCE RLS), exactly as the other modules require.

## 5) LLM + local model config
The host already exposes the multi-provider env the module reads:
`LLM_BASE_URL / LLM_MODEL / LLM_API_KEY` and `LLM2_*`. To run an agent on a **local model**,
set the agent's `llm.baseUrl` to your server (e.g. `http://localhost:11434/v1` for Ollama,
or LM Studio's endpoint), or set `OLLAMA_BASE_URL` and use a `local/<model>` name. No LLM
configured ⇒ the module falls back to an offline stub (safe, deterministic).

Per-bot brain example (store in `st_bots.llm` or pass to `soul-trade.bot.create`):
```jsonc
{ "agents": [
  { "name": "signal-agent",   "enabled": true,  "llm": { "model": "cc/claude-sonnet-4-6" } },
  { "name": "risk-agent",     "enabled": true,  "llm": { "baseUrl": "http://localhost:11434/v1", "model": "llama3.1" } },
  { "name": "sentiment-agent","enabled": false }
] }
```

## Verify
```
pnpm --filter @citadel/module-soul-trade test        # 86 checks (tsx + pglite)
pnpm --filter @citadel/module-soul-trade typecheck    # tsc --noEmit
```
Endpoints are then live under the api (mounted at the module's routes, e.g.
`GET /trade/bots`, `POST /trade/backtest`), the web dashboard at `/soul-trade`, and Tiểu Tâm
gains 13 tools + 11 intents (registered on `onActivate`).

## What I could NOT run here (be aware)
- The full monorepo stack (Postgres + Redis + api + ws + web via docker-compose) doesn't run
  in this sandbox, so end-to-end wasn't executed. Every piece that *can* be run in isolation
  was: all logic, the DB/memory/analytics layer (on pglite — Postgres in-memory), agent
  orchestration, and a full typecheck of src + server + tests.
- RLS *enforcement* can't be exercised on pglite (it runs as superuser and bypasses FORCE RLS);
  the migration is written for the real non-superuser host, and service-layer org-scoping
  (`WHERE org_id`) is the tested backstop.
- Real exchange calls (ccxt → Bybit/Binance) need network + keys; tests use the synthetic source.

## 6) Background worker — the auto-trade loop

`turn.evaluate` runs ONE turn. To make bots trade continuously, hold a `RunnerManager` in a
worker (a tiny script next to the api, or inside it) and give each running bot a `BotRunner`:

```ts
// services/api/src/workers/soul-trade.worker.ts (example)
import { BotRunner, RunnerManager, makeDataSource, makeExecutor } from '@citadel/module-soul-trade';
import { withOrgCtx, hostEnv } from '@citadel/module-soul-trade/server/runtime.js';

const mgr = new RunnerManager();

export async function attachBot(orgId: string, bot: { name: string; exchange: string; mode: 'paper'|'live'; equity: number; risk?: any; api?: { apiKey: string; secret: string } }) {
  const source = makeDataSource(bot.exchange);
  const executor = makeExecutor(bot.mode, {
    startEquity: Number(bot.equity) || 1000, risk: bot.risk,
    exchangeId: bot.exchange, keys: bot.api,            // live only; keys decrypted by host
  });
  const runner = new BotRunner(
    bot.name,
    (fn) => withOrgCtx(orgId, 'worker', fn),            // fail-closed RLS per tick
    source, executor, hostEnv(),
    { intervalMs: 30_000, useAgents: true, onEvent: (ev) => bus.emit(`trade.${ev.type}`, { org_id: orgId, ...ev }) },
  );
  mgr.register(orgId, bot.name, runner);
  runner.start();
}
// on bot.start/bot.stop actions → mgr.startBot / mgr.stopBot; on shutdown → mgr.stopAll()
```

The runner already honors `st_bots.status` each tick, so `soul-trade.bot.stop` (API/Tiểu Tâm)
pauses it even before the manager reacts. Events map 1:1 to `docs/EVENTS.md`
(`turn`→`trade.turn.evaluated`, `open`→`trade.trade.opened`, `close`→`trade.trade.closed`).

## 7) Offline UI preview

`ui/demo.html` is a standalone, no-backend preview of the dashboard (mock data, everything
clickable). Open it directly in a browser to review UI/UX before wiring the stack.
