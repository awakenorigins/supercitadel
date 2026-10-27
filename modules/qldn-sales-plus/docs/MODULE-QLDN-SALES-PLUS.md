# QLDN — Sales Plus (Beat 16)

Paid overlay over CRM/OM masters. It owns 16 `qsa_` tables only; `customer_id`, `deal_id`, `sales_order_id`, `item_id`, and `supplier_id` remain references. Sales tenders explicitly reject procurement-bid payloads.

## Capabilities
- Return lifecycle `draft → submitted → approved/rejected → received → resolved`; receipt emits an inventory-directed outbox event. Creation and transitions are idempotent.
- Deterministic promotion evaluator: tenant/date/segment/minimum/SKU eligibility, priority ordering, stable tie-break, caps, exclusive-vs-stack behavior.
- Sales tender, guarantee, field visit/report, franchise review, import/export shipment tracking, customer materials, and versioned fulfillment overlay.
- Fulfillment transitions require idempotency keys, maintain monotonic versions, persist event proof, and emit OM/inventory outbox messages transactionally.

All reads/writes scope by JWT `orgId`; composite tenant FKs protect child rows. Routes mount at `/api/v1/qldn-sales-plus` through the manifest loader and module entitlement gate. Permissions are domain-specific `qldn-sales-plus.*`.

## Giới thiệu
Returns, promotions, sales tenders/guarantees, field visits, franchise applications, import/export shipments and fulfillment state overlays without duplicating OM/CRM masters. Mọi dữ liệu được cô lập theo tổ chức và module được nạp qua manifest loader.

## Chức năng
| Chức năng | Endpoint | Quyền |
|---|---|---|
| Kiểm tra module | `GET /api/v1/qldn-sales-plus/health` | Đăng nhập |
| Danh sách nghiệp vụ | `GET /api/v1/qldn-sales-plus/...` | `qldn-sales-plus.return.read` |
| Thao tác nghiệp vụ | `POST /api/v1/qldn-sales-plus/...` | `qldn-sales-plus.return.write` |

## Hướng dẫn sử dụng
Mở module từ catalog, chọn nhóm nghiệp vụ, tạo hoặc cập nhật hồ sơ rồi theo dõi trạng thái. API luôn lấy `org_id` từ JWT; không truyền tổ chức thay người dùng. Các thao tác nhạy cảm yêu cầu permission tương ứng trong manifest.

## Ví dụ
- **"Cho tôi xem danh sách nghiệp vụ QLDN — Sales Plus"** → Tiểu Tâm gọi endpoint danh sách với quyền đọc.
- **"Tạo hồ sơ mới và cho tôi biết trạng thái"** → Tiểu Tâm kiểm quyền, gọi endpoint tạo và trả về mã hồ sơ.

## Changelog
- 1.0.0 — Hoàn thiện module, manifest, loader, tài liệu và audit Beat 18.
