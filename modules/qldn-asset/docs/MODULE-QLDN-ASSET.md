# QLDN Asset & Equipment

Beat 14 delivers module `qldn-asset` for tenant-scoped asset operations.

## Tables
- `qas_assets`: asset/equipment master. Soft refs: `supplier_ref`, `accounting_asset_ref`, `inventory_item_ref`, `location_ref`, `custodian_ref`.
- `qas_asset_assignments`: assignment and return lifecycle.
- `qas_asset_transfers`: transfer history.
- `qas_vehicles`: vehicle profile bound one-to-one to an asset.
- `qas_usage_logs`: vehicle/equipment usage and odometer logs.
- `qas_maintenance_orders`: maintenance/repair work orders.
- `qas_inspections`: inspection/check records.
- `qas_incidents`: incident reporting with optional repair work order.

## Rules
- Every service and route filters by `org_id`; cross-org reads return 404.
- Assign only from `available`/`returned`; return only active assignment; retired/lost/disposed assets cannot transfer/use/maintain.
- Idempotency keys are supported for assignment, transfer and usage logs.
- Vehicle creation may create an asset wrapper and never duplicates accounting/inventory vehicle entities.
- Incident with `createMaintenanceOrder` opens a repair order and links it.

## Permissions
Manifest and registry expose `qldn-asset.*` permission gates for read/write/admin operations. Manager+ roles receive wildcard access; staff does not.

## Events
Emits lifecycle events for asset created/assigned/transferred/returned, vehicle created, usage logged, maintenance opened/completed, inspection recorded and incident reported. Events use the shared `emitEvent` / outbox contract.

## Giới thiệu
Quản lý tài sản/thiết bị, xe, cấp phát/thu hồi, sử dụng, bảo trì, kiểm định và sự cố. Mọi dữ liệu được cô lập theo tổ chức và module được nạp qua manifest loader.

## Chức năng
| Chức năng | Endpoint | Quyền |
|---|---|---|
| Kiểm tra module | `GET /api/v1/qldn-asset/health` | Đăng nhập |
| Danh sách nghiệp vụ | `GET /api/v1/qldn-asset/...` | `qldn-asset.asset.read` |
| Thao tác nghiệp vụ | `POST /api/v1/qldn-asset/...` | `qldn-asset.asset.write` |

## Hướng dẫn sử dụng
Mở module từ catalog, chọn nhóm nghiệp vụ, tạo hoặc cập nhật hồ sơ rồi theo dõi trạng thái. API luôn lấy `org_id` từ JWT; không truyền tổ chức thay người dùng. Các thao tác nhạy cảm yêu cầu permission tương ứng trong manifest.

## Ví dụ
- **"Cho tôi xem danh sách nghiệp vụ QLDN — Asset & Equipment"** → Tiểu Tâm gọi endpoint danh sách với quyền đọc.
- **"Tạo hồ sơ mới và cho tôi biết trạng thái"** → Tiểu Tâm kiểm quyền, gọi endpoint tạo và trả về mã hồ sơ.

## Changelog
- 1.0.0 — Hoàn thiện module, manifest, loader, tài liệu và audit Beat 18.
