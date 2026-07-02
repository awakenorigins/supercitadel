# Kế Toán (accounting)

## Giới thiệu
Module Kế Toán là module M0 mặc định của Citadel — sổ cái kép (GL) bất biến fork từ domain model ERPNext Accounts, với chart tài khoản chuẩn VN (TT133 rút gọn 14 TK). Mọi nghiệp vụ (hóa đơn bán/mua, phiếu thu/chi, bút toán tay) đều đi qua một engine posting duy nhất đảm bảo Σ Nợ = Σ Có tuyệt đối; hủy chứng từ là bút toán đảo, không bao giờ xóa/sửa GL đã ghi. Báo cáo (sổ cái, cân đối thử, lãi lỗ, công nợ) tính trực tiếp từ GL — một nguồn sự thật.

## Chức năng
| Tên | Endpoint | Quyền cần | Mô tả |
|---|---|---|---|
| Khởi tạo hệ thống TK | POST /api/v1/accounting/chart/seed | accounting:write | Seed 14 tài khoản chuẩn VN (111, 112, 131, 152, 331, 411, 511, 632, 642…), idempotent |
| Danh sách tài khoản | GET /api/v1/accounting/accounts | accounting:read | Chart of accounts của tổ chức |
| Số dư 1 tài khoản | GET /api/v1/accounting/accounts/:number/balance | accounting:read | Số dư hiện tại (dư Nợ với asset/expense, dư Có với phần còn lại) |
| Bút toán tay | POST /api/v1/accounting/journal | accounting:write | Ghi sổ trực tiếp — lines theo accountNumber, bắt buộc Σ Nợ = Σ Có |
| Danh sách chứng từ | GET /api/v1/accounting/vouchers | accounting:read | JV / INV / PAY, đánh số tự động per org |
| Hủy chứng từ | POST /api/v1/accounting/vouchers/:id/cancel | accounting:write (+ bảo mật lớp 2 với phiếu thu/chi) | Bút toán ĐẢO; HĐ đã thu tiền không hủy được (hủy phiếu thu trước) |
| Tạo hóa đơn | POST /api/v1/accounting/invoices | accounting:write | Bán: Nợ 131/Có 511 · Mua: Nợ 642 (hoặc TK chi phí)/Có 331 — GL ghi tự động |
| Danh sách hóa đơn | GET /api/v1/accounting/invoices?type=sales\|purchase | accounting:read | Kèm công nợ còn lại + trạng thái |
| Tạo phiếu thu/chi | POST /api/v1/accounting/payments | accounting:write | receive: Nợ quỹ/Có 131 · pay: Nợ 331/Có quỹ; gắn invoiceId → knock-off công nợ, chặn thu vượt nợ |
| Danh sách phiếu | GET /api/v1/accounting/payments | accounting:read | Phiếu thu/chi đã ghi |
| Sổ cái 1 TK | GET /api/v1/accounting/reports/general-ledger?account=&from=&to= | accounting:read | Dòng GL + số dư lũy kế |
| Cân đối thử | GET /api/v1/accounting/reports/trial-balance?from=&to= | accounting:read | Σ Nợ/Σ Có từng TK + cờ balanced |
| Lãi lỗ | GET /api/v1/accounting/reports/profit-loss?from=&to= | accounting:read | Doanh thu − chi phí = lãi ròng |
| Công nợ đối tác | GET /api/v1/accounting/reports/outstanding?type= | accounting:read | Ai đang nợ bao nhiêu, từ hóa đơn còn outstanding |
| Xuất sổ cái Excel | GET /api/v1/accounting/export/general-ledger.xlsx?from=&to= | accounting:read | File .xlsx thật, header tiếng Việt (Số CT, Ngày, TK Nợ, TK Có, Số tiền, Đối tác, Diễn giải) |
| Xuất hóa đơn Excel | GET /api/v1/accounting/export/invoices.xlsx | accounting:read | Danh sách hóa đơn + công nợ + trạng thái |
| Xuất cân đối thử Excel | GET /api/v1/accounting/export/trial-balance.xlsx?from=&to= | accounting:read | Kèm dòng TỔNG + trạng thái sổ cân/lệch |
| Xuất lãi lỗ Excel | GET /api/v1/accounting/export/profit-loss.xlsx?from=&to= | accounting:read | Doanh thu, chi phí từng khoản, lãi ròng |
| Sổ cái JSON cho AI | GET /api/v1/accounting/export/general-ledger.json?from=&to= | accounting:read | Cùng data với .xlsx dạng JSON — cầu cho AI làm việc trên bảng tính |
| Nhập hóa đơn từ Excel | POST /api/v1/accounting/import/invoices.xlsx | accounting:write | Multipart field `file` hoặc JSON {fileBase64}; validate từng dòng tại cửa, lỗi tiếng Việt kèm số dòng; dòng hợp lệ tạo hóa đơn + GL tự động |

## Hướng dẫn sử dụng
1. Mở trang **Kế Toán** (menu /accounting) — lần đầu hệ thống tự seed chart 14 tài khoản.
2. Tab **Thu Chi**: chọn PHIẾU THU hoặc PHIẾU CHI → nhập đối tượng + số tiền + ghi chú → bấm **Ghi sổ** (chi: Nợ 642/Có 111 · thu: Nợ 111/Có 511). Số dư 111/112 cập nhật ngay phía trên.
3. Tab **Công nợ**: chọn HĐ BÁN (phải thu) hoặc HĐ MUA (phải trả) → nhập tên đối tác + tổng tiền + nội dung → **Tạo hóa đơn**. Khi khách trả tiền, bấm **Thu tiền (knock-off)** trên hóa đơn và nhập số thu — hệ thống chặn thu vượt nợ.
4. Tab **Báo cáo**: xem lãi lỗ tháng, doanh thu/chi phí từng khoản, badge SỔ CÂN/SỔ LỆCH.
5. **Xuất Excel**: bấm nút "Xuất Excel" → chọn 1 trong 4 báo cáo (Sổ cái GL · Hóa đơn · Cân đối thử · Lãi lỗ) → file .xlsx tải về máy.
6. **Nhập hóa đơn từ Excel**: bấm "Nhập hóa đơn từ Excel" → chọn file .xlsx theo mẫu cột: Loại (bán/mua) | Đối tác | Ngày (YYYY-MM-DD hoặc DD/MM/YYYY) | Diễn giải | Số lượng | Đơn giá. Kết quả hiện N thành công / M lỗi kèm số dòng cụ thể — dòng lỗi không tạo gì, dòng hợp lệ vào sổ ngay.

## Ví dụ (hỏi Tiểu Tâm)
- **"Làm sao tạo hóa đơn?"** → Vào trang Kế Toán, tab Công nợ, chọn HĐ BÁN hoặc HĐ MUA, nhập tên đối tác + tổng tiền + nội dung rồi bấm Tạo hóa đơn — công nợ ghi tự động vào sổ (Nợ 131/Có 511 với HĐ bán).
- **"Tháng này lãi lỗ thế nào?"** → Tiểu Tâm đọc báo cáo profit-loss: doanh thu, chi phí, lãi ròng của kỳ; kèm gợi ý xem sổ quỹ chi tiết.
- **"Xuất sổ sách ra Excel cho kế toán ngoài xem"** → Bấm nút Xuất Excel trong trang Kế Toán, chọn Sổ cái GL — file so-cai-gl.xlsx có đủ Số CT, Ngày, TK Nợ/Có, Số tiền, Diễn giải.

## Changelog
- 1.1.0 (V7A P4): Excel connect — export 4 báo cáo .xlsx + sổ cái JSON cho AI + import hóa đơn từ Excel có validate tại cửa; docs/GUIDE.md.
- 1.0.0 (V8): GL sổ kép bất biến, chart VN TT133, hóa đơn bán/mua, thu chi knock-off, hủy = bút toán đảo, 4 báo cáo từ GL.
