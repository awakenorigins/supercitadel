# Soul-Trade — Hướng dẫn vận hành (Guide)

Hướng dẫn đầy đủ để cài, cấu hình và chạy module Soul-Trade trong SuperCitadel.

## 1. Cài đặt

Xem `INTEGRATION.md` cho các bước drop-in. Tóm tắt:
1. Copy `modules/soul-trade/` + `apps/web/app/soul-trade/page.tsx` vào repo.
2. `pnpm install` (kéo `ccxt`, `pg`).
3. Thêm 2 dòng builder vào `services/api/src/modules/loader.ts`.
4. (tuỳ chọn) thêm `soulTradeTieuTamActions()` vào `services/api/src/tieu-tam/actions.ts`.
5. Host chạy `onInstall` → tạo bảng `st_*` + RLS (+ pgvector trên image pgvector).

Kiểm tra:
```
pnpm --filter @citadel/module-soul-trade test        # 70 checks
pnpm --filter @citadel/module-soul-trade typecheck
```

## 2. Tạo bot

Qua API `POST /trade/bots`, qua UI `/soul-trade`, hoặc bảo Tiểu Tâm: *"tạo bot paper trên
bybit, chiến lược donchian, cặp BTC"*.

Trường của một bot:
| Trường | Ý nghĩa | Mặc định |
|---|---|---|
| `name` | tên bot (duy nhất trong org) | — |
| `exchange` | `bingx` `binance` `bybit` `okx` `gate` `kucoin` `mexc` | `bingx` |
| `market_type` | `swap` (futures) hoặc `spot` | `swap` |
| `symbols` | danh sách cặp, ví dụ `["BTC/USDT:USDT"]` | `["BTC/USDT:USDT"]` |
| `strategy` | `rsi_ema` `donchian_breakout` `bollinger_meanrev` | `rsi_ema` |
| `params` | override tham số chiến lược | `{}` |
| `risk` | override rủi ro (xem §5) | `{}` |
| `mode` | `paper` (ảo) hoặc `live` (thật) | `paper` |
| `llm` | cấu hình não/agent (xem §4) | `{}` |

> **Paper mode không cần key** — chạy trên giá THẬT của sàn bằng tiền ảo. Live mới cần key.

## 3. Nguồn dữ liệu coin thật

Dữ liệu đi qua ccxt. Backtest / walk-forward / evaluate đều nhận `exchange` để chọn nguồn.
Ví dụ:
```
POST /trade/backtest
{ "strategy":"donchian_breakout", "symbol":"BTC/USDT:USDT",
  "timeframe":"1h", "exchange":"binance", "candles":1500 }
```
Không có mạng/khoá? dùng `"exchange":"synthetic"` để chạy dữ liệu giả tất định.

## 4. Não riêng cho từng bot + tự chia agent + local model

Cấu hình trong `st_bots.llm` (hoặc trường `llm` khi tạo bot):

```jsonc
{
  "agents": [
    { "name": "signal-agent",  "enabled": true,  "role": "technical analyst",
      "systemPrompt": "Judge trend + momentum; favor the setup when momentum confirms.",
      "llm": { "model": "cc/claude-sonnet-4-6" } },              // ← cloud gateway của host

    { "name": "risk-agent",    "enabled": true,  "role": "risk manager",
      "systemPrompt": "Veto in dangerous volatility. Capital preservation first.",
      "llm": { "baseUrl": "http://localhost:11434/v1",           // ← LOCAL model (Ollama)
               "model": "llama3.1" } },

    { "name": "sentiment-agent","enabled": false, "role": "sentiment",
      "systemPrompt": "Weigh recent price action as sentiment. Prefer flat when mixed." }
  ]
}
```

**Cách provider được chọn** (`resolveProvider`): ưu tiên `agent.llm` → rồi env host.
- có `baseUrl` hoặc model `local/*` → server OpenAI-compatible cục bộ (Ollama `:11434/v1`,
  LM Studio, llama.cpp),
- model `cx/*` + `LLM2_BASE_URL` → model host thứ hai,
- không cấu hình → stub tất định (an toàn offline).

**Cách agent hoạt động**: khi bot chạy một lượt (`turn.evaluate` với `use_agents: true`),
tín hiệu kỹ thuật đề xuất một hướng; các agent (mỗi con một model) bỏ phiếu; đồng thuận có
trọng số confirm hoặc **veto** hướng đó, và điều chỉnh size. Mọi phiếu bầu được lưu vào trí nhớ.

Env host mà module đọc (đã có sẵn trong compose):
`LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`, `LLM2_BASE_URL`, `LLM2_MODEL`, `LLM2_API_KEY`,
`OLLAMA_BASE_URL`.

## 5. Rủi ro (risk)

Override qua `st_bots.risk`. Mặc định: rủi ro 1%/lệnh, tối đa 3 vị thế, đòn bẩy 3, SL = 2×ATR,
TP = 2R, kill-switch lỗ ngày 5%, cooldown 3 nến, phí taker 0.05%, slippage 0.05%.
```jsonc
{ "riskPerTrade": 0.01, "stopAtrMult": 2.0, "takeProfitR": 2.0, "leverage": 3, "maxPositions": 3 }
```

## 6. Trí nhớ & phân tích

- **Từng lượt**: `GET /trade/bots/:name/memory` — các quyết định gần đây (chiến lược + AI +
  phiếu agent + hành động cuối).
- **Hồi tưởng ngữ nghĩa**: `GET /trade/bots/:name/recall?query=BTC breakout uptrend` — tìm các
  lượt quá khứ giống tình huống mô tả (pgvector). Cần một embedding provider (cloud/local);
  không có thì dùng stub.
- **Tổng lượt trade**: `GET /trade/bots/:name/analytics` — win rate, profit factor, PnL, avg R.
- **Theo chiến lược (toàn org)**: `GET /trade/analytics`.
- **Đóng góp agent**: `GET /trade/bots/:name/agents` — % mỗi agent đồng thuận với hành động cuối.

## 7. Backtest & Walk-forward

- **Backtest**: `POST /trade/backtest` — chống nhìn-trước, trả metrics + đường equity + lệnh.
- **Walk-forward**: `POST /trade/walkforward` — tối ưu in-sample, kiểm out-of-sample, cuộn tới.
  Chỉ tin đường OOS. Ví dụ `grid: {"channel":[10,20,30]}`.

## 8. Vòng lặp AUTO-TRADE (BotRunner)

Bot tự trade bằng `BotRunner` (`src/runner.ts`): mỗi tick nó fetch nến mới → chạy pipeline
đánh giá dùng chung (chiến lược → AI ensemble → agents nếu bật) → kiểm SL/TP vị thế đang mở →
vào lệnh mới qua `Executor` → ghi lệnh vào `st_trades`, quyết định vào `st_decisions` (kèm
auto-embed nếu cấu hình), cập nhật equity → phát event.

An toàn tích hợp sẵn: **cooldown** sau khi dính stop, **kill-switch lỗ ngày** (`maxDailyLoss`,
qua ngày tự reset), **re-entrancy guard** (tick trước chưa xong thì bỏ qua, không chồng),
**cô lập lỗi per-symbol** (một cặp lỗi không giết vòng lặp), và mỗi tick đều đọc lại
`st_bots.status` — bấm Stop trên UI/Tiểu Tâm là bot đứng ngay ở tick kế.

Cách nối vào host: xem `INTEGRATION.md §6` (giữ `RunnerManager` trong worker, mỗi bot một
`BotRunner`, mọi tick chạy trong transaction org-scoped nên RLS có hiệu lực).

Paper: `PaperExecutor` mô phỏng tất định. Live: tạo bot `mode:"live"` + key sàn (Read + Trade,
KHÔNG rút tiền) — key mã hoá at-rest; `LiveExecutor` đặt lệnh market + SL/TP reduce-only,
`setLeverage` theo cấu hình.

> ⚠️ SL/TP do sàn giữ, nên sự kiện đóng lệnh live có thể không bắn về feed tức thì (đã ghi
> chú trong `executor.ts`). Reconcile bằng `fetchPositions` khi cần.

## 9. Bảo mật & an toàn

- RLS fail-closed cô lập từng org tận DB; app phải nối bằng role KHÔNG superuser.
- Key sàn mã hoá at-rest, không bao giờ trả qua API.
- Paper + backtest trước. Chiến lược kèm sẵn là điểm khởi đầu, KHÔNG phải "chén thánh" — validate
  bằng walk-forward trước khi bỏ tiền thật. Futures đòn bẩy có thể mất sạch.
