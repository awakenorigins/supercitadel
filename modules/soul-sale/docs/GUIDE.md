# Soul-Sale 1A — Bán Hàng & Kênh Phân Phối

## Giới thiệu

Soul-Sale 1A là module CRM + DMS hợp nhất cho SME Việt Nam trên nền SuperCitadel: quản lý khách hàng và cây kênh phân phối (NPP → đại lý → điểm bán), vòng đời lead → deal → báo giá → đơn hàng đi qua **cổng công nợ**, máy giá tầng (giá chung / theo cấp đại lý / theo segment / đích danh khách, bậc số lượng, cửa sổ khuyến mãi), chỉ tiêu doanh số, hoa hồng, chốt kỳ công nợ, và **Splitter** — bộ đối soát bảng kê Excel do đại lý gửi về, tách dòng tiền thành doanh thu / ship / cọc / chiết khấu / công nợ có kiểm soát ngoại lệ.

Tiểu Tâm điều khiển 100% nghiệp vụ qua 23 read tools + 34 write actions; 14 action nhạy cảm (tiền, cấu trúc kênh, chốt sổ) đi theo protocol **dry-run → confirm**: xem trước tác động thật rồi mới thực thi. Tiền tệ duy nhất VND, lưu nguyên đồng (`numeric(18,0)`). Module chạy schema PostgreSQL riêng `soulsale`, prefix bảng `ss_`, RLS bật fail-closed trên cả 38 bảng, mọi dòng đều gắn `org_id`.

Giới hạn trung thực của bản 1A: chưa có POS/ca thu ngân; không tự xuất hoá đơn điện tử (bắn sự kiện cho module kế toán); không đa tiền tệ; forecast/churn/lead-score là rule-based minh bạch chứ không phải ML; đơn đã giao/xuất hoá đơn không hủy trực tiếp mà đi đường chứng từ đảo bên kế toán.

## Chức năng

| Nhóm | Endpoint | Mô tả |
|---|---|---|
| Sức khỏe | `GET /api/v1/soul-sale/health` | Kiểm tra module sống (public) |
| Khám phá | `GET /api/v1/soul-sale/tools` · `GET /api/v1/soul-sale/actions` | Liệt kê 23 tools / 34 actions cho Tiểu Tâm & FE |
| RPC đọc | `POST /api/v1/soul-sale/tools/:name` | Gọi bất kỳ read tool nào (body = tham số) |
| RPC ghi | `POST /api/v1/soul-sale/actions/:name` | Gọi write action; L2 không `confirm` → trả `dry_run + preview` |
| Khách hàng | `GET /api/v1/soul-sale/customers` · `GET /api/v1/soul-sale/customers/:id` | Tìm kiếm (bỏ dấu) và hồ sơ 360° |
| Kênh | `GET /api/v1/soul-sale/agency-tree` | Cây NPP → đại lý → điểm bán dạng lồng |
| Lead | `GET /api/v1/soul-sale/leads` | Danh sách lead theo trạng thái |
| Pipeline | `GET /api/v1/soul-sale/pipeline/summary` | Số deal, tổng tiền, giá trị trọng số theo stage |
| Đơn hàng | `GET /api/v1/soul-sale/orders` · `PATCH /api/v1/soul-sale/orders/:id/advance` | Tìm đơn; tiến trạng thái tuyến tính confirmed→…→closed |
| Công nợ | `GET /api/v1/soul-sale/debt/summary` | Chi tiết một khách hoặc top khách nợ |
| Đối soát | `GET /api/v1/soul-sale/import/batches` | Tình trạng các batch bảng kê Splitter |
| Trợ lý | `GET /api/v1/soul-sale/intel/next-best` | Việc nên làm ngay (rule-based) |
| Tự động | `POST /api/v1/soul-sale/automation/run` | 6 job đêm: hết hạn báo giá, health deal, churn, quét trùng, rollup chỉ tiêu, tuổi nợ |
| Kích hoạt | `POST /api/v1/soul-sale/setup` | Seed mặc định per-org (idempotent): pipeline MAIN, 5 điều khoản thanh toán, price book |

Chi tiết hợp đồng 57 tác vụ (tham số, permission, ví dụ): xem `docs/TOOLS.md`.

## Hướng dẫn sử dụng

1. **Kích hoạt cho org**: host gọi `POST /setup` một lần (idempotent) — có ngay pipeline `MAIN` (Mới 10% → Liên hệ 30% → Báo giá 60% → Thắng/Thua), 5 điều khoản (COD/DEP30/NET7/NET15/NET30), bảng giá `DEFAULT`.
2. **Dựng kênh**: tạo NPP (`soulsale.agency.create`, level 1) → đại lý cấp 2 (`parentAgencyCustomerId`) → điểm bán (`soulsale.retailer.create`). Cây dùng closure table nên `agency.tree`, `retailer.by-agency` (cả tuyến dưới), `sellthrough.summary` đều trả tức thì; `agency.move` là L2 vì kéo cả tuyến dưới và ảnh hưởng rollup/hoa hồng.
3. **Đặt giá**: `soulsale.price.rule-set` (L2). Resolve theo đặc hiệu: đích danh khách > segment > cấp đại lý > giá chung; cùng đặc hiệu thì `priority` cao thắng, bậc `minQty` sâu thắng. Khuyến mãi đặt `validFrom/validTo` — tự hết hiệu lực.
4. **Bán hàng**: lead vào từ `lead.create` (tự chấm điểm theo nguồn + hoạt động) → `lead.convert` (trùng SĐT tự tái dùng khách cũ) → `quote.create` (tự tra giá tầng) → `order.create` từ báo giá → `order.confirm` (L2) đi qua **cổng công nợ**: khách bị khoá nợ → chặn; vượt hạn mức → chặn kèm số liệu, muốn cho qua phải duyệt tường minh `order.hold-toggle {overrideCredit:true}`.
5. **Tiền về**: `payment.record` (L2) — deposit/payment/refund; refund không vượt số đã thu. Phơi nhiễm công nợ = đơn mở − đã thu, xem bằng `credit.check`/`debt.summary`.
6. **Cuối kỳ**: `commission.post` (idempotent, xem trước bằng `commission.preview`) và `debt.snapshot-close` (opening kỳ trước + phát sinh − đã thu = closing).
7. **Đối soát bảng kê đại lý**: `import.statement-upload` (Excel base64 hoặc rows JSON, header tiếng Việt linh hoạt) → `import.batch-reconcile` (match mã > SĐT > tên bỏ dấu; dòng trùng/thiếu khách/lệch tiền thành case) → xử lý từng case bằng `import.row-resolve` → `import.split-confirm` (L2, yêu cầu 0 case mở) sinh statement chính thức cho sell-through.

## Ví dụ

- **"Pipeline tháng này thế nào?"** → Tiểu Tâm gọi `soulsale.pipeline.summary` → trả số deal, tổng tiền và giá trị trọng số từng stage.
- **"Xác nhận đơn SO-202607-0001"** → `soulsale.order.confirm` không confirm → preview hạn mức/đang nợ/còn khả dụng; người dùng chốt → gọi lại `confirm:true`.
- **"Nạp file bảng kê tháng 6 của NPP Đồng Tháp"** → `soulsale.import.statement-upload` với Excel đính kèm → đối soát → báo "2 dòng khớp, 2 case cần xử lý".
- **"Ai đang nợ nhiều nhất, khoá công nợ Shop X giúp tao"** → `soulsale.debt.summary` rồi `soulsale.credit.hold-toggle` (L2, bắt buộc lý do).
- **"Chốt hoa hồng tháng 6"** → `soulsale.commission.post` dry-run trả tổng tiền + số entry theo từng người hưởng → confirm ghi sổ idempotent.

## Changelog

- **1.0.0 (2026-07-06)** — Bản đầu tiên: 38 bảng schema `soulsale` (RLS fail-closed), 23 read tools + 34 write actions (14 L2 dry-run→confirm), cây kênh closure table, máy giá tầng có cửa sổ hiệu lực, cổng công nợ khi xác nhận đơn, hoa hồng & chốt kỳ nợ idempotent, Splitter đối soát Excel với case workflow, 6 job automation đêm, 14 sự kiện emit / 3 subscribe, 102 test PGlite xanh.
