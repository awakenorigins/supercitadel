# Soul-Trade — CHANGELOG

## 1.1.0 — 2026-07-08

### ui/demo.html — demo offline có menu 2 khu
- **Control Room**: giữ nguyên 100% nội dung & hành vi V1 (bots, agents, decision memory, recall, backtest lab, walk-forward).
- **AUTOMATO (tab mới)** — 4 trang: Auto · Phân tích · Shield · Nhật ký.

### AUTOMATO · Auto
- Núm **ARM** trung tâm: vòng ring quanh núm chính là đồng hồ ngưỡng phiên, fill về +TP (xanh) hoặc −SL (đỏ) theo cấu hình; 4 trạng thái standby → quét → giữ vị thế → ngắt.
- **Risk shell**: rủi ro/lệnh, giới hạn lệnh/phiên, TP/SL phiên; dòng **ước tính rủi ro** ("xấu nhất phiên −x% ≈ −$y").
- **Preset**: Thận trọng / Chuẩn / Chủ động + nút **✦ AI gợi ý** đặt cấu hình theo regime, kèm lý do.
- **Quản lý lệnh**: dời SL về hoà vốn ở +1R · trailing (đỉnh −0.7R) · chốt 50% ở +1R · time-stop lệnh ì.
- **Ngắt mạch**: nghỉ sau 3 lệnh THẬT thua liên tiếp · né cửa sổ funding/tin vĩ mô · khung giờ giao dịch.
- OOS walk-forward theo strategy (win rate / PF / maxDD / số lệnh) + khung **Minh bạch**.

### AUTOMATO · Chế độ vốn — Giả lập (shadow)
- Công tắc **Giả lập**: chạy trên dữ liệu & khớp lệnh thật, **không dùng vốn**; ledger giả lập tách riêng (chip theo dõi trên đầu tab).
- Khi chạy pure-shadow: risk shell (TP/SL/giới hạn lệnh) áp lên ledger giả lập để dry-run trọn vòng đời phiên.

### AUTOMATO · Super Automato
- 3 chế độ: **Soft Think** (đợi 3 lệnh giả lập thua liên tiếp) · **Hard Think** (đợi 5) · **Custom** (đợi 2–10, % lãi dồn 0–50%, trần stake ×2–10).
- Vòng lặp: giả lập gom chuỗi thua đủ dài → chuyển **VỐN THẬT**; thắng thì cộng % lãi vừa ăn vào stake lệnh sau (chặn trần); **thua đúng 1 lệnh thật** → quay về giả lập chờ chuỗi mới.
- Bất biến đã kiểm bằng harness 200.000 lệnh/cấu hình: chuyển pha **chỉ tại lúc đóng lệnh**; hoà không tính là thua; stake không bao giờ vượt trần; drawdown vốn thật mỗi vòng ≤ 1 stake hiện tại.
- Mọi lệnh gắn tag **SIM/THẬT**; báo cáo phiên tách 2 ledger; feed ghi từng lần chuyển pha & dồn lãi.

### Ghi chú trung thực (đặt ngay trong UI)
- Theo xác suất thống kê toán học: nếu các lệnh độc lập, chuỗi thua giả lập **không** làm lệnh kế tiếp dễ thắng hơn. Cơ chế Super chỉ có giá trị nếu hiệu suất strategy có tính đảo chiều theo giai đoạn — kiểm chứng bằng walk-forward A/B trước khi dùng vốn thật.
- Giả lập dùng chung engine & phí với vốn thật để chuỗi thắng/thua khớp thực tế.

### docs
- Thêm `docs/AUTOMATO.md` — semantics, máy trạng thái, bất biến & giới hạn thống kê của Super Automato.

### manifest
- `version`: 1.0.0 → **1.1.0**.

## 1.0.0
- Bản đầu: bots cô lập per-org, runner auto-trade, risk shell, strategies (rsi_ema / donchian_breakout / bollinger_meanrev), executor paper/live (ccxt), LLM turn + agents, decision memory + recall, backtest & walk-forward, Telegram, demo offline.
