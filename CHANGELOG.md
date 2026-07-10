# CHANGELOG — SUPERCITADEL LAB

> Nhánh lab (sandbox) fork từ supercitadel v11.5.0 — nơi phát triển nóng các tính năng trước khi hợp nhất về bản chính.
> Live: https://supercitadellab.62.146.238.213.sslip.io

## v11.8.0 — 2026-07-10 — "Tiểu Tâm Hồi Sinh + Bảng Lương Excel"

### 🧠 Tiểu Tâm — hồi phục 2 engine + kiến trúc bao trùm
- **Fix Opus 4.6 nghẽn toàn bộ:** 1 tool trong 205 ACTION_TOOLS thiếu `type:'object'` làm Anthropic proxy trả 400 `tools.N.custom.input_schema.type: Field required` → sập nguyên request với MỌI model. Thêm `normalizeParams()` ép mọi tool schema luôn đủ `type` + `properties` — module tương lai quên khai schema cũng không sập hệ thống.
- **Fix GPT 5.5 trả rỗng:** proxy 9route trả `finish_reason:'in_progress'` + content rỗng khi payload tools vượt ~16KB (>~50 tools). Engine gpt-5.5 tự cap tool theo `LLM2_MAX_TOOLS` (mặc định 48) + guard chống-trả-rỗng: nếu không content + không tool_calls → tự retry không tools. Tiểu Tâm không bao giờ im lặng nữa.
- **Opus 4.6 làm engine mặc định** (DB default + UI ENGINES), GPT 5.5 làm engine phụ.

### 💰 Soul-Manager — Xuất Excel bảng lương (mới hoàn toàn)
- API `GET /api/v1/soul-manager/payroll/export.xlsx?year=&month=` — file .xlsx thật từ payslips: mã NV, họ tên, gross, bảo hiểm, thuế TNCN, thực nhận + dòng TỔNG.
- Nút "⤓ Xuất Excel" cạnh "Chạy lương" trong tab Bảng lương.
- Tool Tiểu Tâm `hr.payroll.export_excel` — nói "xuất bảng lương excel kỳ 7/2026" là có nút tải ngay trong chat.

### ⭐ downloadUrl pattern — module mới tự động full năng lực
- `Shell.tsx` nhận diện generic: BẤT KỲ tool result nào có `data.downloadUrl` → khung chat Tiểu Tâm tự render nút tải file (kèm Bearer auth). Module mới chỉ cần trả `downloadUrl` + `filename` trong action result — KHÔNG cần sửa Tiểu Tâm/Shell.
- Kết hợp ACTION_TOOLS tự gom tool từ mọi module active → add module mới = Tiểu Tâm tự có đủ năng lực điều khiển + xuất file.

### 🔑 Beta onboarding
- Token schema nới 8-24 ký tự A-Za-z0-9, phân biệt hoa thường (đăng nhập sai case bị 401).
- UI login bỏ ép uppercase, nhận 24 ký tự.
- Script seed org sạch `scripts/seed-jolipoli.mjs` (idempotent, bật đủ 15 modules gồm core, cấp Om khởi tạo, engine mặc định opus-4.6). Lưu ý vận hành: DB host port 5452 (không phải 5432).

### 🔒 Bảo mật repo
- Gỡ `.env.lab.backup` khỏi toàn bộ git history (filter-branch + reflog expire + gc), thêm vào .gitignore. Secret scan sạch trước khi push.

## v11.7.x — 2026-07-08 → 09 (R11.7a–h) — Soul-Trade Automato
- Nguồn giá LIVE thật (ccxt Binance/Bybit public), chế độ AUTOMATO ULTRA (scalping, risk ≤1%/lệnh, TP ≥2% + trailing), 10 cặp coin click-là-chạy.
- %P&L real-time khi giữ vị thế, panel state machine 4 trạng thái, nút KILL, vòng lặp bot tự chạy.
- Nút ARM tròn 3D nổi khối (inset shadow nhiều lớp + radial gradient), tên cặp coin + %P&L + mũi tên hướng trên nút.
- Biểu đồ nến candlestick OHLCV từ ccxt (route `/automato/ohlcv`, badge ccxt-live/synthetic).
- Đa lệnh song song tối đa 10 (bảng `st_automato_orders`, background worker tick 8s — thoát UI vẫn chạy).
- Vốn giả lập `sim_capital`, fix NaN inputs, min 0.1%, nhận dấu phẩy VN.
- **Gắn tài khoản sàn THẬT (BingX):** AES-256-GCM encrypt-at-rest, verify key bằng fetchBalance/fetchPositions thật trước khi lưu, UI modal hướng dẫn + masked key + số dư live. (V9)
- **Trang 2 cặp coin biến động dữ dội:** fetchTopMovers thật, điểm dữ dội = |%24h| + ½ range, cache 30s. (V10)
- **Fix ARM delay:** pool ccxt client + micro-cache + dedup in-flight (ohlcv 1.02s→0.1s), Promise.all 4 API, optimistic UI + rollback, chống poll ghi đè. ARM 196ms. (V8)

## v11.6.x — 2026-07-06 → 07 (R11.6) — Chat Tiểu Tâm + 2 module ngoài
- Chat Tiểu Tâm: invoice card + xuất PDF/Excel hóa đơn, nhớ file vừa gửi, caption kèm file chạy lệnh luôn, reply-to-message.
- File upload đủ loại: ảnh (vision), xlsx/csv/txt/json, PDF render 5 trang ảnh.
- Memory dài: 120 lượt + auto-summary. Dry-run confirm cho lệnh nhạy cảm.
- Nạp 2 module ngoài: **Soul-Wallet** (ví cá nhân) + **Soul-Sale 1A** (57 capabilities: 23 read + 34 write, 9 nhóm nghiệp vụ).
- Kế Toán 10A: 4 form mới (mẫu định kỳ, hạn mức tín dụng, đánh giá tỷ giá, kết chuyển + khóa kỳ) + quiz tutorial. (V7)
- Soul-Sale UI: 8 tab, 57 tác vụ surface đủ, tab "Tất cả tác vụ". (V7)

---
# (Lịch sử bản chính supercitadel — xem README.md mục "Điểm nổi bật theo release": v7a → r3 → r4 → r5 → r6 → r7 → r7.2 → v9.0.0 → v10.0.0 → v11.0.0 → v11.5.0)
