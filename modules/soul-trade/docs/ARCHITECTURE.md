# Soul-Trade — Kiến trúc (Architecture)

Module giao dịch crypto AI cho SuperCitadel, viết theo đúng hợp đồng module (giống
`soul-manager` / `soul-inventory`). Tài liệu này mô tả các **mặt cắt** của module: từ dữ
liệu, chiến lược, AI/agent, tới biên tích hợp với host.

```
                         ┌───────────────────────────────────────────┐
   người dùng / Tiểu Tâm │  apps/web/app/soul-trade/page.tsx (UI)     │
                         │  services/api  ──►  host-adapter (Hono)    │
                         └───────────────┬───────────────────────────┘
                                         │ per-request tx: SET app.current_org_id  (RLS)
                         ┌───────────────▼───────────────────────────┐
                         │  routes.ts → tools/index.ts (Zod @ biên)   │
                         │       │                                    │
                         │  services/*  ── memory · analytics · bot   │
                         │  turn.service ── evaluate / backtest / WF  │
                         │       │                                    │
                         │  strategies · signal · decision · risk     │  ← lõi tính toán
                         │  agents ── llm (cloud/local/stub)          │  ← bộ não
                         │  datasource ── ccxt (Bybit/Binance/…)      │  ← nguồn dữ liệu
                         │  embeddings ── pgvector recall             │  ← trí nhớ ngữ nghĩa
                         │  executor ── paper / live (ccxt)           │  ← đặt lệnh
                         └───────────────┬───────────────────────────┘
                                         │
                         ┌───────────────▼───────────────────────────┐
                         │  Postgres + pgvector  (st_* tables, RLS)   │
                         └────────────────────────────────────────────┘
```

## ① Nguồn dữ liệu — `datasource.ts`
`DataSource` là một interface tối giản (`fetchOHLCV`, `fetchPrice`). Hai hiện thực:
- **`CcxtSource`** — dữ liệu THẬT qua ccxt: `bingx`, `binance`, `bybit`, `okx`, `gate`,
  `kucoin`, `mexc`. Đổi sàn = đổi một chuỗi. ccxt được `import` động ⇒ chạy paper/test
  không cần cài ccxt.
- **`SyntheticSource`** — random-walk tất định (seeded), không mạng — cho demo & test.

`makeDataSource(exchangeId, opts)` là factory. Live cần keys (host giải mã + tiêm).

## ② Lõi tính toán (thuần, không side-effect)
- **`indicators.ts`** — EMA/RSI/ATR/MACD/ROC (thuần mảng, không NaN).
- **`strategies.ts`** — 3 chiến lược cắm được qua registry: `rsi_ema`, `donchian_breakout`,
  `bollinger_meanrev`. Mỗi cái nhận `(candles, indicators, i, params)` → `StrategyDecision`.
- **`signal.ts`** — AI ensemble: chuẩn hoá điểm về `[-1,+1]` (trend/rsi/macd/roc, hệ số biến
  động). Sẵn hook cho model ML.
- **`decision.ts`** — `combineSignals`: logic gộp DÙNG CHUNG cho cả live lẫn backtest (không
  drift). Chiến lược là chính; AI chỉ veto khi đối nghịch rõ, và trim size khi trung tính.
- **`risk.ts`** — sizing 1% rủi ro/lệnh, SL theo ATR, TP theo bội R.
- **`backtest.ts`** — chống nhìn-trước: quyết định ở đóng nến `i` → vào lệnh ở mở nến `i+1`;
  SL/TP kiểm trong nến (stop trước nếu chạm cả hai). Metrics: return, win rate, max DD,
  profit factor (cap 999), Sharpe, R từng lệnh.
- **`optimize.ts`** — walk-forward: grid-search in-sample → validate out-of-sample → cuộn tới;
  chỉ báo cáo đường OOS đã ghép (thứ bạn KHÔNG tối ưu lên).

## ③ Bộ não — `agents.ts` + `llm.ts`
- **`llm.ts`** — một interface `LLMProvider`, ba đường cắm:
  - Cloud gateway (env `LLM_*` của host, ví dụ `cc/claude-sonnet-4-6`),
  - **Local model** (Ollama/LM Studio/llama.cpp) qua `baseUrl` — OpenAI-compatible,
  - Stub tất định (offline / khi chưa cấu hình).
  `resolveProvider(cfg, env)` chọn provider theo prefix model (`local/*`, `cx/*`) hoặc `baseUrl`.
- **`agents.ts`** — TỰ CHIA AGENT: mỗi bot có một dàn agent chuyên biệt
  (`signal-agent`, `risk-agent`, `sentiment-agent`), **mỗi agent một model riêng** (qua
  `agent.llm`). `orchestrate` chạy song song, `aggregateVotes` gộp bằng đồng thuận có trọng
  số theo confidence, `applyConsensus` dùng đồng thuận đó để confirm/veto tín hiệu kỹ thuật.

## ④ Trí nhớ — `st_decisions` + `embeddings.ts`
- Mỗi lượt đánh giá ghi một dòng `st_decisions` (chiến lược + điểm AI + phiếu bầu agent +
  hành động cuối) = "trí nhớ" của bot.
- **`embeddings.ts`** — nhúng mỗi quyết định (OpenAI-compatible `/embeddings`, cloud hoặc
  local; stub offline) vào cột `st_decisions.embedding vector(1536)`. `recallSimilar` hồi
  tưởng bằng khoảng cách cosine của pgvector (`<=>`).

## ⑤ Phân tích — `services/analytics.service.ts`
- **Qua các lượt**: `turns_by_action` (long/short/flat theo lượt), `memory.recent`.
- **Tổng lượt trade**: win rate, profit factor, PnL, avg R (per bot); theo chiến lược
  (org-wide); đóng góp từng agent (bao nhiêu % agent đồng thuận với hành động cuối).

## ⑥ Đặt lệnh — `executor.ts`
- **`PaperExecutor`** — mô phỏng tất định (phí + slippage), kiểm SL/TP trong nến, MTM. Test được.
- **`LiveExecutor`** — lệnh THẬT qua ccxt: market entry + reduce-only SL/TP (best-effort theo
  từng sàn), `setLeverage`, `fetchPositions`, `fetchBalance`.
- `makeExecutor(mode, cfg)` — guard: live bắt buộc có `exchangeId` + keys.

## ⑦ Biên tích hợp — `tools/` · `routes.ts` · `server/`
- **`tools/index.ts`** — 15 tool cho Tiểu Tâm: 9 read (`tool`) + 6 write (`action`). Mỗi tool
  Zod-parse đầu vào TẠI BIÊN trước khi chạm service.
- **`routes.ts`** — bản khai route framework-neutral (host bind vào Hono). HTTP → tool.
- **`server/runtime.ts`** — pool pg + `withOrgCtx`: mở transaction, `SET LOCAL
  app.current_org_id` ⇒ RLS fail-closed có hiệu lực; services vẫn tự lọc `WHERE org_id`
  (isolation kép).
- **`server/host-adapter.ts`** — dựng Hono app từ routes (loader của api mount).
- **`server/tieu-tam-actions.ts`** — sinh action def cho Tiểu Tâm (start/delete = sensitive
  → confirm trước).

## ⑧ Đa tenant + vòng đời
- **RLS**: mọi bảng `st_*` bật `FORCE ROW LEVEL SECURITY`, policy
  `org_id = current_setting('app.current_org_id')::uuid`, FAIL CLOSED. App phải nối bằng role
  KHÔNG superuser.
- **Lifecycle** (`src/index.ts`): `onInstall` chạy migrations → `onActivate` đăng ký
  tool/intent vào registry → `onDisable` thu hồi sạch → `onRemove` (tuỳ chọn `dropData`).

## Bảng dữ liệu (`st_*`)
| Bảng | Vai trò |
|---|---|
| `st_settings` | cấu hình per-org (defaults, llm) |
| `st_bots` | định nghĩa bot (sàn, symbols, chiến lược, risk, mode, llm/agents, equity, keys mã hoá) |
| `st_trades` | lịch sử lệnh (entry/exit/pnl/R/reason) |
| `st_decisions` | trí nhớ từng lượt (+ `embedding vector(1536)`) |
| `st_backtests` | backtest & walk-forward đã lưu |
