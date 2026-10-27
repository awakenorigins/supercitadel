# Automato — Nghiên cứu Đòn Bẩy (Leverage) + Audit + Kế hoạch

Ngày: 2026-07-08. Yêu cầu anh Nấng: nghiên cứu đòn bẩy futures, tìm repo auto-leverage; Automato hiện chưa có option đòn bẩy.

## 1) Repo / framework tham chiếu
- **Freqtrade** — futures + CCXT; đòn bẩy qua callback `leverage()` trong strategy; hỗ trợ isolated/cross; backtest, money management.
- **Jesse** — first-class leveraged trading + short-selling; risk mgmt gọn; strategy bằng Python.
- **Botara 3.0** — dynamic leverage theo ATR (biến động cao → hạ đòn bẩy, ổn định → tăng); cấu hình cứng vd 5x; ATR-based SL.
- **Coinrule (concept auto-leverage)** — điều chỉnh hệ số theo volatility + hiệu suất, có min/max bound.
- **ccxt** — `exchange.setLeverage(leverage, symbol)` (Binance USD-M = `binanceusdm`); `marginMode` isolated/cross; một số sàn nhận leverage qua `params` của `create_order`.
- Position sizing refs: volatility-scaled positioning, max-drawdown control (Medium guide), calc-trade (margin + position size theo leverage).

## 2) Audit code hiện tại (soul-trade module)
- `executor.ts`: LiveExecutor ĐÃ có `opts.leverage` + gọi `ex.setLeverage(leverage, symbol)` khi openPosition. `makeExecutor` nhận `leverage`. → hạ tầng có sẵn.
- `risk.ts`: default `leverage: 3`. `types.ts`: có field `leverage`.
- **LỖ HỔNG:** `automato.service.ts` KHÔNG dùng leverage ở đâu cả:
  - config allowed fields (dòng ~35) không có `leverage`/`margin_mode`.
  - presets (cautious/standard/active) không set leverage.
  - `automatoHeartbeat` tính size: `size = (capital*riskPct/100)/(livePrice*stopPct/100)` — thuần risk%, KHÔNG nhân đòn bẩy, không set leverage lên sàn.
  - UI page.tsx: risk shell không có ô đòn bẩy.
→ Kết luận: Automato hiện = 0 đòn bẩy. Đúng như anh Nấng nói.

## 3) Kế hoạch triển khai (2 tầng)
### Tầng 1 — Đòn bẩy CỐ ĐỊNH
- Thêm config: `leverage` (1..MAX), `margin_mode` ('isolated'|'cross').
- Migration cột DB + allowed fields + presets (mặc định leverage an toàn, vd 3x).
- Executor: truyền `leverage` + `marginMode` khi vào lệnh thật (setLeverage + setMarginMode nếu sàn hỗ trợ).
- Paper/sim: phản ánh đòn bẩy vào notional/P&L cho đúng (P&L% theo vốn = moveP% × leverage nếu chọn mô hình B; hoặc giữ nguyên nếu mô hình A).
- UI: ô nhập leverage + chọn isolated/cross cạnh risk shell; badge "Thanh lý ~X%" = ~ (100/leverage)% ngược chiều (ước lượng, trừ phí/funding).

### Tầng 2 — Đòn bẩy ĐỘNG (Auto-Leverage)
- Toggle `auto_leverage` + `lev_min`, `lev_max`.
- Chọn leverage theo ATR/volatility: vol cao → gần lev_min; vol thấp/ổn định → gần lev_max.
- Luôn cap theo risk/lệnh + max loss phiên để không vượt SL phiên.

## 4) QUYẾT ĐỊNH CẦN ANH NẤNG CHỐT (trước khi code)
Mô hình rủi ro khi bật đòn bẩy:
- (A) Giữ nguyên risk%/lệnh; đòn bẩy chỉ GIẢM ký quỹ cần. An toàn, khuyến nghị.
- (B) Đòn bẩy KHUẾCH ĐẠI size → risk% thực nhân lên. Mạnh nhưng dễ cháy.
Và: trần đòn bẩy tối đa cho phép (vd 10x / 20x / 125x).

## Trạng thái
- Đã báo cáo qua chat (gateway đang bận queue, retry). File này là bản lưu nguồn.
