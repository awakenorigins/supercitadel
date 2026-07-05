# Kế Toán 10A (ke-toan-10a)

## Giới thiệu
Kế Toán 10A là module kế toán kép **hoàn chỉnh** cho SuperCitadel — thế hệ thứ 10, hợp nhất tinh hoa của toàn bộ dòng module kế toán trước đó và chạy **độc lập tuyệt đối** (schema Postgres riêng `ketoan10a`, không đụng bảng của module Kế Toán cũ `acc_*` hay bất kỳ module nào khác; có thể bật song song). Nền tảng: tiền BigInt `numeric(20,2)` chính xác tuyệt đối, sổ cái **bất biến** (hủy = bút toán đảo, không xóa/sửa), Σ Nợ = Σ Có cưỡng bức cả tầng service lẫn CHECK tầng DB, tenant isolation `org_id` trên mọi bảng/truy vấn. Bao phủ 4 tầng nghiệp vụ: **sổ sách cốt lõi** (chart TT133/TT200 tùy biến JSON, phiếu thu/chi, hóa đơn bán/mua nhiều dòng + thuế GTGT, công nợ knock-off, đảo chứng từ), **tuân thủ VN** (kết chuyển 911→421 + khóa niên độ, Lưu chuyển tiền tệ, Tờ khai GTGT + bảng kê, sổ TT133, credit/debit note, sao kê công nợ, nhắc hạn), **vận hành sâu** (tạm ứng/đặt cọc 3 loại, giao dịch định kỳ tự sinh, nhập CSV, hạn mức tín dụng chặn vượt), **phân tích nâng cao** (đối chiếu ngân hàng tự khớp + rule engine, lãi lỗ theo bộ phận/dự án, TSCĐ + khấu hao đường thẳng, đánh giá lại tỷ giá 515/635, dự toán ngân sách vs thực tế). Tiểu Tâm điều khiển 100%: **15 tool đọc** (toolRegistry) + **17 action ghi** chuẩn RBAC + dry-run v8.5 (hành động nhạy cảm xem trước → xác nhận mới chạy thật) + xuất **Excel**. Đã kiểm chứng bằng 200+ test tự động.

## Chức năng
| Tên | Endpoint | Quyền cần | Mô tả |
|---|---|---|---|
| Khởi tạo hệ thống TK (chọn chuẩn) | POST /api/v1/ke-toan-10a/setup | ke-toan-10a:write | Seed TT133 (mặc định, 34 TK) hoặc TT200 (~52 TK) hoặc chart JSON tùy biến; idempotent — FE tự gọi lần đầu |
| Danh sách / tạo tài khoản | GET·POST /api/v1/ke-toan-10a/accounts | read·write | Chart of accounts của org; thêm TK chi tiết |
| Số dư một TK | GET /api/v1/ke-toan-10a/accounts/:code/balance | ke-toan-10a:read | Số dư theo chiều bình thường tại thời điểm |
| Phiếu thu / phiếu chi | POST /api/v1/ke-toan-10a/receipts · /payments | ke-toan-10a:write | Ghi sổ ngay (Nợ tiền/Có đối ứng và ngược lại) |
| Bút toán tay nhiều dòng | POST /api/v1/ke-toan-10a/journals | ke-toan-10a:write | Bắt buộc Σ Nợ = Σ Có, chặn kỳ đã khóa, gắn được bộ phận/dự án từng dòng |
| Đảo chứng từ (bất biến) | POST /api/v1/ke-toan-10a/journals/:id/reverse | write (+ lớp 2 nếu host cấu hình reverseGate) | Ghi bút toán ngược, giữ nguyên dấu vết |
| Hóa đơn bán (nhiều dòng + thuế) | POST /api/v1/ke-toan-10a/invoices | ke-toan-10a:write | Nợ 131 / Có 511 + Có 3331; chặn vượt hạn mức tín dụng (override được) |
| Thu tiền theo hóa đơn (knock-off) | POST /api/v1/ke-toan-10a/invoices/:id/payments | ke-toan-10a:write | Cấn trừ công nợ, chặn thu vượt nợ |
| Điều chỉnh giảm bán (credit note) | POST /api/v1/ke-toan-10a/invoices/:id/credit-note | ke-toan-10a:write | Hàng trả lại / giảm giá — bút toán ngược phần điều chỉnh |
| Hóa đơn mua + debit note | POST /api/v1/ke-toan-10a/bills · /bills/:id/debit-note | ke-toan-10a:write | Nợ 156/642 + 1331 / Có 331; trả hàng mua |
| Tạm ứng / đặt cọc + cấn trừ | POST /api/v1/ke-toan-10a/advances · /advances/:id/apply | ke-toan-10a:write | 3 loại: khách đặt cọc · ứng NCC · tạm ứng NV |
| Giao dịch định kỳ | POST /api/v1/ke-toan-10a/recurring · /recurring/run | ke-toan-10a:write | Mẫu tự sinh chứng từ (thuê, lương…), bắt kịp kỳ bỏ lỡ |
| Hạn mức tín dụng | PATCH /api/v1/ke-toan-10a/contacts/:id · GET …/credit-status | write · read | Đặt hạn mức + điều khoản; xem trạng thái còn nợ được bao nhiêu |
| Nhập CSV danh mục | POST /api/v1/ke-toan-10a/import/accounts.csv · contacts.csv | ke-toan-10a:write | Onboarding nhanh, validate từng dòng |
| Đối chiếu ngân hàng | POST /api/v1/ke-toan-10a/bank/import · /auto-match · /apply-rules · GET /bank/reconciliation | write · read | Nhập sao kê CSV → tự khớp với sổ → rule engine sinh chứng từ → báo cáo khớp |
| Bộ phận / dự án (dimensions) | POST·GET /api/v1/ke-toan-10a/cost-centers · GET /reports/profit-by-cost-center | write · read | Gắn chiều vào bút toán, lãi lỗ theo từng bộ phận/dự án |
| TSCĐ + khấu hao | POST·GET /api/v1/ke-toan-10a/assets · POST /assets/depreciation | write · read | Khấu hao đường thẳng Nợ 642/Có 214, bắt kịp kỳ, tự chốt khi đủ |
| Dự toán ngân sách | POST·GET /api/v1/ke-toan-10a/budgets · GET /reports/budget-vs-actual | write · read | Đặt ngân sách năm (upsert), so thực tế, cảnh báo vượt |
| Đánh giá lại tỷ giá | POST /api/v1/ke-toan-10a/fx/revalue | ke-toan-10a:write | Số dư ngoại tệ cuối kỳ → lãi Có 515 / lỗ Nợ 635 đúng chiều |
| Kết chuyển & khóa niên độ | POST /api/v1/ke-toan-10a/fiscal-years · /closing/close | ke-toan-10a:write | 511/515/711 & 632…821 → 911 → 421, khóa kỳ chặn sửa số |
| Cân đối thử · Sổ cái · KQKD · CĐKT | GET /api/v1/ke-toan-10a/reports/trial-balance · general-ledger · profit-loss · balance-sheet | ke-toan-10a:read | Bộ báo cáo chuẩn, tính trực tiếp từ GL |
| Lưu chuyển tiền tệ · Tờ khai GTGT | GET /api/v1/ke-toan-10a/reports/cash-flow · vat-declaration | ke-toan-10a:read | LCTT trực tiếp (B03) · 01/GTGT + bảng kê mua vào bán ra |
| Sổ TT133 (NKC, sổ quỹ) · Sao kê công nợ · Tuổi nợ · Nhắc hạn | GET /api/v1/ke-toan-10a/reports/… | ke-toan-10a:read | general-journal · cash-book · statement · aging · due-reminders |
| Xuất Excel | GET /api/v1/ke-toan-10a/export/*.xlsx | ke-toan-10a:read | Trial balance, sổ cái, công nợ, KQKD dạng .xlsx |
| Tự-audit toàn vẹn sổ | GET /api/v1/ke-toan-10a/health/integrity | ke-toan-10a:read | Σ Nợ=Σ Có toàn sổ · từng chứng từ cân · không dòng mồ côi |
| Actions cho tự động hóa | GET /api/v1/ke-toan-10a/actions · POST /actions/:id | read · write | 40 action Zod-validated (tầng HTTP, dùng cho automation/API) |

## Hướng dẫn sử dụng
1. Mua + kích hoạt **Kế Toán 10A** trong Cửa hàng Module (`/modules`). Mở trang `/ke-toan-10a` — lần đầu hệ thống **tự khởi tạo** hệ thống tài khoản TT133; muốn dùng TT200 hoặc chart riêng, bấm nút Khởi tạo và chọn chuẩn (chỉ chọn một lần, idempotent).
2. Tab **Sổ quỹ**: ghi PHIẾU THU / PHIẾU CHI (đối tác + số tiền + ghi chú). Số dư 111/112 và bảng chứng từ cập nhật ngay; chứng từ sai thì **Đảo** (bút toán ngược, giữ vết).
3. Tab **Hóa đơn**: tạo hóa đơn BÁN/MUA kèm thuế GTGT và hạn thanh toán; bấm **Thu tiền** trên từng hóa đơn để cấn trừ công nợ (chặn thu vượt nợ). Khách vượt hạn mức tín dụng sẽ bị chặn lập hóa đơn mới.
4. Tab **Vận hành**: ghi tạm ứng/đặt cọc; đặt giao dịch định kỳ (tiền thuê, lương) và bấm **Chạy định kỳ** để sinh chứng từ tới hạn; nhập danh mục từ CSV.
5. Tab **Phân tích**: dán sao kê ngân hàng (CSV) → **Đối chiếu** để tự khớp; quản lý TSCĐ và **Chạy khấu hao**; đặt ngân sách và xem **Ngân sách vs thực tế**; tạo bộ phận/dự án để xem lãi lỗ theo chiều.
6. Tab **Báo cáo**: KPI nhanh (tiền, phải thu/trả, lãi lỗ), cân đối thử (badge SỔ CÂN/LỆCH), KQKD, CĐKT, LCTT, tờ khai GTGT, tuổi nợ, tải **Excel**, nút **Kiểm tra toàn vẹn sổ**. Cuối năm: **Kết chuyển & khóa kỳ** (911→421).
7. Hoặc không cần mở trang — **ra lệnh cho Tiểu Tâm** bằng tiếng Việt: hành động ghi sổ sẽ hiện thẻ **xem trước (dry-run)**, bấm Xác nhận mới chạy thật (chuẩn an toàn v8.5).

## Ví dụ
- **"Còn bao nhiêu tiền mặt, sổ sách có cân không?"** → Tiểu Tâm đọc tool `ke_toan_10a.cash_position` + `trial_balance`: số dư 111/112 và cờ SỔ CÂN.
- **"Tạo phiếu thu 10A 5 triệu từ Anh Ba"** → action `k10a.thu_tien` (nhạy cảm): Tiểu Tâm hiện thẻ xem trước; bấm Xác nhận → phiếu PT ghi sổ, báo lại số chứng từ.
- **"Ai đang nợ quá hạn lâu nhất?"** → tool `ke_toan_10a.aging` (type=sales): công nợ chia nhóm 1-30/31-60/61-90/>90 ngày, ai nặng nhất trước.
- **"Chạy khấu hao 10A đến tháng này rồi cho biết khoản nào vượt ngân sách"** → action `k10a.chay_khau_hao` (xác nhận) + tool `ke_toan_10a.budget_status`: số kỳ khấu hao đã ghi và danh sách TK vượt dự toán.
- **"Đối chiếu ngân hàng 10A tài khoản 112"** → action `k10a.doi_chieu_ngan_hang`: tự khớp sao kê + áp quy tắc, trả về số dòng khớp/chưa khớp.

## Changelog
- 1.0.0: Thế hệ 10A hợp nhất — chart TT133/TT200/JSON tùy biến; đầy đủ 4 tầng nghiệp vụ (cốt lõi · tuân thủ VN · vận hành · phân tích) với 56+ endpoint, 12 báo cáo, Excel; sổ bất biến BigInt + integrity self-audit; **cầu Tiểu Tâm chuẩn v8.5**: 15 tool đọc + 17 action ghi có RBAC permission (`ke-toan-10a.*`), securityLevel, dry-run→confirm cho hành động nhạy cảm, regex lệnh nhanh không giẫm module cũ; schema `ketoan10a` độc lập chạy song song mọi module kế toán khác; 200+ test (unit · integration · HTTP · Tiểu Tâm · PGlite · store-flow).
