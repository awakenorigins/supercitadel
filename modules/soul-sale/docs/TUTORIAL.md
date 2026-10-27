# Soul-Sale 1A — TUTORIAL.md (kịch bản 15 phút cùng Tiểu Tâm)

Kịch bản: công ty phân bón có 1 NPP miền Tây, bán qua đại lý + shop, cuối tháng nhận bảng kê Excel.

1. **"Mở NPP tên Cửu Long, cấp 1, khu vực Mekong"** → `agency.create` → có KH-0001.
2. **"Thêm đại lý Sông Tiền cấp 2 thuộc Cửu Long, rồi Shop Hoa Mai bán lẻ dưới Sông Tiền, SĐT 0911222333"** → `agency.create` + `retailer.create` → cây 3 tầng (`agency.tree` xem lại).
3. **"Giá NPK 16-16-8: giá chung 520k, đại lý cấp 2 lấy 480k"** → 2 lần `price.rule-set` (L2 — Tiểu Tâm hiện preview giá hiện hành trước khi mày confirm).
4. **"Cho Sông Tiền công nợ NET15, hạn mức 50 triệu"** → `credit.limit-set` (L2, preview đang nợ/khả dụng).
5. **"Có khách hỏi qua Zalo tên Anh Bảy, SĐT 0933111222"** → `lead.create` (điểm 30 nguồn zalo +10 mới).
6. **"Anh Bảy chốt rồi, convert thành deal 25 triệu"** → `lead.convert` — nếu SĐT trùng khách cũ, Tiểu Tâm tái dùng và nói rõ.
7. **"Báo giá cho Sông Tiền 10 thùng NPK, hiệu lực tới 20/07"** → `quote.create` tự tra 480k/thùng.
8. **"Khách đồng ý, lên đơn từ báo giá đó, xác nhận luôn"** → `order.create` → `order.confirm` (L2). Nếu vượt hạn mức: Tiểu Tâm báo con số và hỏi có duyệt vượt không (`hold-toggle overrideCredit`).
9. **"Sông Tiền chuyển 20 triệu cho đơn vừa rồi"** → `payment.record` (L2) — công nợ giảm ngay (`credit.check`).
10. **Cuối tháng: "Nạp bảng kê tháng 7 của Cửu Long"** (đính Excel) → upload → reconcile → Tiểu Tâm liệt kê case → mày xử lý từng dòng → **"chốt batch"** → `split-confirm` (L2) hiện bảng tách tiền trước khi ghi.
11. **"Chốt công nợ và hoa hồng tháng 7"** → `debt.snapshot-close` + `commission.post` (đều L2, preview số liệu, idempotent chạy lại không nhân đôi).
12. Sáng hôm sau hỏi **"hôm nay nên làm gì trước?"** → `intel.next-best`: chốt báo giá sắp hết hạn, nhắc nợ top, gọi lại khách im ắng.
