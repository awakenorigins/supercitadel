# AUTOMATO — tab "1 nút" của Soul-Trade

Tài liệu này mô tả semantics của tab Automato trong `ui/demo.html` (V1.1). Đây là spec chuẩn để port sang `apps/web/app/soul-trade/page.tsx` và nối vào engine thật (`src/runner.ts`, `src/risk.ts`).

## 1. Vòng đời phiên (núm ARM)

```
standby ──ARM──► scanning ──tín hiệu đủ mạnh──► live ──đóng lệnh──► scanning …
   ▲                                              │
   └────────────── RESET ◄──── halted ◄───────────┘  (chạm TP/SL phiên · đủ số lệnh · KILL)
```

- Vòng ring quanh núm = đồng hồ ngưỡng phiên: fill về +TP (xanh) hoặc −SL (đỏ) mà người dùng đặt.
- **Risk shell** (bắt buộc cấu hình trước ARM): rủi ro %/lệnh · giới hạn lệnh/phiên · TP phiên · SL phiên.
- **Quản lý lệnh** (mức vị thế): dời SL về hoà vốn ở +1R · trailing (đỉnh −0.7R, kích hoạt sau +1R) · chốt 50% ở +1R (khoá +0.5R) · time-stop cho lệnh ì.
- **Ngắt mạch**: nghỉ sau 3 lệnh THẬT thua liên tiếp · hoãn tín hiệu quanh cửa sổ funding / tin vĩ mô · khung giờ giao dịch.
- Mức lệnh mặc định: SL −1R, TP +2R. Với chốt 50%: PnL hiệu dụng `eff(r) = 0.5 + 0.5·r` sau khi đã chốt nửa ở +1R.

## 2. Chế độ vốn

| Chế độ | Dữ liệu | Vốn | Ledger áp risk shell |
|---|---|---|---|
| Vốn (paper/live) | thật | có | ledger THẬT |
| **Giả lập (shadow)** | thật | **không** | ledger GIẢ LẬP (dry-run trọn phiên) |
| **Super Automato** | thật | tự chuyển | ledger THẬT (giả lập chạy kênh phụ, không giới hạn) |

Giả lập phải dùng **chung engine + mô hình phí/trượt giá** với vốn thật — nếu không, chuỗi thắng/thua giả lập sẽ không khớp thực tế và mọi cơ chế dựa trên chuỗi trở nên vô nghĩa.

## 3. Super Automato — máy trạng thái

Chế độ: **Soft Think** N=3 · **Hard Think** N=5 · **Custom** (N=2–10, dồn lãi p=0–50%, trần stake c=×2–10, mặc định ×5).

```
[GIẢ LẬP] ── thua liên tiếp đủ N ──► [VỐN THẬT, stake = cơ bản]
    ▲                                   │ thắng: stake += p% × lãi (chặn ≤ c × cơ bản)
    └───── thua đúng 1 lệnh thật ◄──────┘ hoà (|pnl|≈0): giữ nguyên pha & stake
```

Quy tắc cứng (đã kiểm bằng harness 200.000 lệnh/cấu hình, 0 vi phạm):
1. Chuyển pha **chỉ tại thời điểm đóng lệnh** — không bao giờ giữa vị thế, kể cả khi người dùng gạt công tắc giữa chừng.
2. Hoà **không** tính là thua (không reset chuỗi thắng, không quay về giả lập).
3. Stake không bao giờ vượt `c × stake cơ bản`; quay về giả lập là stake reset về cơ bản.
4. Drawdown vốn thật mỗi vòng bị chặn ≤ 1 stake hiện tại (vì thua 1 lệnh là thoát).
5. Ngắt mạch chuỗi thua chỉ đếm lệnh THẬT; chuỗi thua giả lập là *nhiên liệu* của Super, không kích ngắt mạch.
6. Kill-switch đóng lệnh đang mở (bất kể SIM/THẬT) và ngắt phiên; không kích hoạt chuyển pha.

## 4. Giới hạn thống kê — đọc trước khi dùng vốn thật

- Theo xác suất thống kê toán học: nếu các lệnh **độc lập**, chuỗi thua giả lập không làm lệnh kế tiếp dễ thắng hơn. Super chỉ có giá trị nếu hiệu suất strategy có **tính đảo chiều theo giai đoạn** (drawdown của strategy có xu hướng hồi) — đây là giả thuyết thực nghiệm, phải kiểm chứng, không phải định lý.
- Cách kiểm chứng đúng: chạy **walk-forward A/B** trên cùng chuỗi tín hiệu — baseline (vào mọi lệnh) vs overlay Super (chỉ vào theo quy tắc) — so PnL, maxDD, số lệnh thật. `src/optimize.ts` dùng được cho việc này.
- Chuỗi thua thường **cụm theo regime xấu**: vào vốn thật ngay sau chuỗi thua có thể bắt đúng đoạn regime còn đang xấu.
- Chi phí cơ hội đo được (mô hình thắng 52%/+2R): vốn thật chỉ hoạt động ~11% số lệnh ở Soft, ~2.3% ở Hard — phần lớn lệnh thắng rơi vào lúc giả lập.
- Kết luận vận hành: Super Automato là **bộ lọc thời điểm bơm vốn**, không phải nguồn edge. Edge vẫn nằm ở strategy + risk shell.

## 5. Port checklist (page.tsx + engine)

- [ ] Ledger THẬT / GIẢ LẬP tách bảng (`st_trades.src = 'real' | 'sim'`), báo cáo phiên tách 2 cột.
- [ ] Super state (`phase, lossStreak, winStreak, stake, base, cap`) lưu per-bot, khôi phục sau restart; transition ghi vào decision memory.
- [ ] Shadow executor = Paper executor + cùng fee model; cùng đường tín hiệu với Live.
- [ ] Trần stake và "thua 1 lệnh thật → về giả lập" enforce ở server (risk.ts), không chỉ ở UI.
- [ ] Telegram: báo chuyển pha (⚡ vào vốn thật / ↩ về giả lập) + stake mới.
