# Soul-Wallet 1A — Giáo Trình Ví Cá Nhân

## Giới thiệu

Soul-Wallet là **trung tâm chỉ huy tài chính cá nhân** cho từng thành viên trong org SuperCitadel: chủ SME người Việt quản tiền túi lẫn dòng tiền cá nhân đan xen công việc. Khác các module org-scope (Kho, HR, Kế Toán), dữ liệu Soul-Wallet scope theo **(org_id, owner_user_id)** — mỗi người một két riêng, cùng org cũng không nhìn được ví của nhau.

Triết lý sổ sách:
- **Sổ kép mini**: số dư KHÔNG lưu cứng — luôn derive từ `opening_balance + Σ bút toán delta`. Không con số nào chạy rong.
- **Hủy = bút toán đảo** (`reversal_of`), không bao giờ DELETE. Audit log ghi mọi mutation, kể cả dry-run.
- **Đối soát được**: snapshot/summary rebuild 100% từ ledger; lệch thực tế → giao dịch `adjust` có dấu, có dấu vết.
- **Tiểu Tâm là thủ quỹ**: 12 tool tra cứu + 13 write-action theo protocol **dry-run → confirm** cho mọi thao tác đụng tiền.

Semantics bút toán delta trên tài khoản thật: `income:+ · expense:− · fee:− · refund:+ · transfer:−nguồn/+đích (Σ=0) · adjust:± theo meta.sign`.

## Chức năng

| Nghiệp vụ | Endpoint | Quyền |
|---|---|---|
| Tạo ví/tài khoản (cash/bank/ewallet/credit_card/savings...) | `POST /api/v1/soul-wallet/accounts` | sw.account.write |
| Sửa / Đóng ví (archive, chặn khi còn tiền) | `POST /api/v1/soul-wallet/accounts/update` · `/accounts/close` | sw.account.write |
| Danh sách ví + số dư derive | `GET /api/v1/soul-wallet/accounts` | sw.account.read |
| Số dư 1 ví (tùy chọn as-of) | `GET /api/v1/soul-wallet/accounts/:id/balance` | sw.account.read |
| Danh bạ payee/chủ nợ | `POST·GET /api/v1/soul-wallet/contacts` | sw.contact.write / read |
| Danh mục 2 cấp + seed bộ VN | `POST·GET /api/v1/soul-wallet/categories` · `POST /categories/seed` | sw.contact.write / read |
| Tags | `POST·GET /api/v1/soul-wallet/tags` | sw.contact.write / read |
| Ghi thu/chi/hoàn/phí (+splits, tags, đính kèm) | `POST /api/v1/soul-wallet/transactions` | sw.tx.write |
| Chuyển tiền giữa 2 ví | `POST /api/v1/soul-wallet/transfer` | sw.tx.write |
| ĐẢO giao dịch (hủy chuẩn sổ kép) | `POST /api/v1/soul-wallet/transactions/reverse` | sw.tx.write |
| Duyệt draft (recurring sinh) | `POST /api/v1/soul-wallet/transactions/post-draft` | sw.tx.write |
| Tìm giao dịch full-filter | `POST /api/v1/soul-wallet/transactions/search` | sw.tx.read |
| Ngân sách envelope + rollover | `POST /api/v1/soul-wallet/budgets` | sw.budget.write |
| Áp preset 6 Hũ từ thu nhập | `POST /api/v1/soul-wallet/budgets/six-jars` | sw.budget.write |
| Trạng thái hũ (spent/%, dự phóng, cờ vượt) | `GET /api/v1/soul-wallet/budgets/status` | sw.budget.read |
| Hũ mục tiêu: tạo / nạp / tiến độ | `POST /goals` · `/goals/contribute` · `GET /goals` | sw.goal.write / read |
| Sổ nợ: ghi khoản vay-cho vay | `POST /api/v1/soul-wallet/debts` | sw.debt.write |
| Trả/thu nợ (chặn trả vượt) | `POST /api/v1/soul-wallet/debts/pay` | sw.debt.write |
| Danh sách nợ + lãi đơn cộng dồn | `GET /api/v1/soul-wallet/debts` | sw.debt.read |
| Aging 5 bucket receivable/payable | `GET /api/v1/soul-wallet/debts/aging` | sw.debt.read |
| Khoản định kỳ / subscription | `POST /api/v1/soul-wallet/recurring` | sw.recurring.write |
| Sắp trừ tiền + cờ tăng giá | `GET /api/v1/soul-wallet/recurring/upcoming` | sw.recurring.read |
| Chạy kỳ đến hạn (catch-up) | `POST /api/v1/soul-wallet/recurring/run` | sw.recurring.write |
| Rule tự phân loại + chạy thử | `POST·GET /rules` · `POST /rules/test` | sw.rule.write |
| Import sao kê: upload → preview → commit | `POST /import` · `/import/preview` · `/import/commit` | sw.import.run |
| Xuất sổ ledger CSV | `GET /api/v1/soul-wallet/export/ledger-csv` | sw.export.sensitive |
| Xuất báo cáo tháng Excel (3 sheet) | `GET /api/v1/soul-wallet/export/report-xlsx` | sw.export.sensitive |
| Đối soát số dư thực tế | `POST /api/v1/soul-wallet/reconcile` | sw.tx.write |
| Chart: donut / nến / waterfall / heatmap / trend | `GET /api/v1/soul-wallet/charts/*` | sw.report.read |
| Insights: bất thường / runway | `GET /insights/anomalies` · `/insights/runway` | sw.report.read |
| 8 báo cáo quản trị + thuật lại tiếng Việt | `GET /api/v1/soul-wallet/reports/*` | sw.report.read |
| Rebuild snapshot từ ledger | `POST /maintenance/rebuild-snapshots` | sw.tx.write |
| Việc đêm thủ công (recurring+nợ+snapshot+networth+anomaly) | `POST /api/v1/soul-wallet/scheduled/run` | sw.recurring.write |
| Audit log | `GET /api/v1/soul-wallet/audit` | sw.report.read |

## Hướng dẫn sử dụng

**1. Khởi tạo két (1 phút).** Vào trang `/soul-wallet` → hệ tự seed 16 nhóm danh mục VN (Ăn uống, Server & AI, Grab/Taxi...). Tạo các ví: Tiền mặt, VCB, Momo, thẻ tín dụng (khai ngày sao kê + hạn trả), sổ tiết kiệm (kỳ hạn + lãi suất). Nhập `opening_balance` theo số thực tế hôm nay.

**2. Ghi sổ hằng ngày.** Nói với Tiểu Tâm hoặc dùng tab **Sổ tiền**: chọn loại, tiền, ví, danh mục. Chi 1 hóa đơn nhiều mục → dùng `splits` (tổng splits phải bằng amount, lệch là hệ chặn). Ghi nhầm → bấm **Đảo** — hệ sinh bút toán ngược, số dư trở về, lịch sử còn nguyên.

**3. Kỷ luật 6 Hũ.** Tab **Hũ & Mục tiêu** → nhập thu nhập tháng → **Áp 6 Hũ**. Mapping chi tiêu → hũ (v1): `PLAY=Giải trí · EDU=Giáo dục · GIVE=Từ thiện · LTS=Tiết kiệm & Đầu tư · FFA=nạp tay (spent luôn 0) · NEC=tổng chi − 4 hũ kia`. Muốn siết mục nào → tạo thêm envelope theo danh mục (ngân sách cha tự gộp chi của danh mục con). Bật `rollover` để dư kỳ trước cộng dồn.

**4. Sổ nợ.** Ghi "Anh B mượn 5 triệu, hạn cuối tháng" → hệ tự tạo contact, tính lãi đơn theo ngày nếu khai lãi suất. Gắn `account_id` → sinh giao dịch dòng tiền thật (cho vay = tiền RA khỏi ví dạng chi, nhận vay = tiền VÀO dạng thu; thu nợ về = thu 'Thu nợ' — chuẩn dòng tiền, KHÔNG phải P&L kế toán, xem giới hạn bên dưới). Aging 5 bucket cho biết khoản nào mốc meo.

**5. Định kỳ & subscription.** Khai Netflix/Server/tiền nhà một lần. `auto_post=true` → đêm tự ghi; `false` → sinh **draft** chờ mày duyệt (`post-draft`). Khoản nào âm thầm tăng giá so kỳ trước → gắn cờ ⬆.

**6. Import sao kê.** Tab **Import** → chọn preset bank (VCB/TCB/MB/ACB/BIDV/generic) + ví nhận → thả file .xlsx/.csv. Hệ dò header thông minh (bỏ dấu), nhai tiền "1.234.567" lẫn Excel serial date, băm `dup-hash` chống import 2 lần (kể cả giữa các phiên), chạy rule gợi ý danh mục. **Preview trước — Commit sau**, không bao giờ ghi thẳng.

**7. Đối soát cuối tuần.** Đếm ví thực tế → `POST /reconcile {actual_balance}` → hệ sinh giao dịch `adjust` đúng dấu kèm memo "sổ X → thực tế Y", audit đầy đủ. Khớp rồi thì hệ báo `RECONCILE_NO_DIFF` và không ghi gì.

**8. Đọc số như CEO.** Tab **Tổng quan**: tài sản ròng, tiền lỏng, waterfall tháng, **nến số dư theo ngày** (open/high/low/close như chứng khoán), donut cơ cấu, heatmap ngày đốt tiền, runway "còn cầm cự N ngày", danh sách bất thường (giao dịch lớn lệch σ, danh mục tăng vọt, nghi trùng, subscription tăng giá).

**Vận hành RLS (khuyến cáo):** module ship policy `tenant_isolation` FORCE trên cả 25 bảng theo `app.current_org_id`. Hàng rào CHÍNH là app-level — mọi service lọc `(org_id, owner_user_id)` lấy từ JWT. Nếu host chạy role non-BYPASSRLS + set session var (như test PGlite của module), RLS thành lớp giáp thứ hai đúng nghĩa.

## Ví dụ

- **"Ghi chi 320k cafe tiếp khách sáng nay từ tiền mặt"** → Tiểu Tâm dry-run preview → mày confirm → `sw.tx.create` ghi sổ, trả "Đã ghi chi 320.000đ (SW-TX-2026-000001)".
- **"Lương 20 triệu, chia 6 hũ giúp tao"** → `sw.budget.upsert {six_jars_income}` → NEC 11tr · FFA 2tr · EDU 2tr · LTS 2tr · PLAY 2tr · GIVE 1tr.
- **"Tháng này tao tiêu sao rồi?"** → `sw.report.narrate` → "📊 Thu 28tr · Chi 19tr · Ròng +9tr; chi nhiều nhất: Server & AI 6tr2; ⚠️ hũ PLAY vượt."
- **"Anh B mượn 5 triệu, hẹn trả cuối tháng"** → `sw.debt.create` receivable, tự tạo contact, nhắc khi đến hạn qua event `sw.debt.due`.
- **"Ai đang nợ tao, khoản nào quá hạn?"** → `sw.debt.list` + `sw.debt.aging` → bảng 5 bucket, khoản 90+ tô đỏ.
- **"Với đà này tao cầm cự được bao lâu?"** → `sw.forecast.runway` → burn rate trọng số 30/90 ngày + subscription sắp trừ → "~47 ngày".
- **"Hủy giao dịch 1 triệu vừa ghi nhầm"** → `sw.tx.reverse` → bút toán đảo, số dư về nguyên, bản gốc giữ status `reversed`.

**Giới hạn v1 (nói thẳng):** chưa kết nối bank tự động (import file thủ công); VND-only (schema có cột `currency` chờ v2); danh mục đầu tư chỉ theo dõi tay qua account type `investment`; OCR hóa đơn/PDF sao kê để phase 2; giao dịch dòng-nợ khi gắn ví được tính vào thu-chi tháng (đúng cash-flow, khác chuẩn P&L kế toán — cần P&L thật thì dùng Module Kế Toán 10A); hũ FFA không tự tính spent.

## Changelog

- **1.0.0** — Bản đầu: 25 bảng (`sw_` + RLS FORCE), sổ kép mini delta-ledger, đảo bút toán, splits, doc_no `SW-TX-YYYY-NNNNNN`, seed 16 nhóm danh mục VN, ngân sách envelope + rollover + preset 6 Hũ, hũ mục tiêu, sổ nợ lãi đơn + aging 5 bucket + nhắc hạn, recurring catch-up + draft + bắt tăng giá, rule engine first-match, import sao kê 6 preset + dup-hash + preview→commit, export CSV/XLSX, reconcile adjust có dấu, snapshot OHLC ngày (nến cash-range) + monthly/category/networth summary rebuild-từ-ledger, anomaly 5 loại, runway forecast, 8 báo cáo + narrate tiếng Việt, 12 read tools + 13 write actions dry-run→confirm cho Tiểu Tâm, 17 intents, FE dashboard 6 tab SVG thuần, nightly automation per (org, owner). Test: 134/134 trên PGlite role non-superuser (RLS thật).
