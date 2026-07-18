# QLDN Marketing
Owns campaign planning, channels, assets/content publication, market research, product messaging, marketing tasks and budget-request orchestration. It deliberately references CRM customers/segments and Sales products/orders only by external identifiers; it does not duplicate those entities.

## Security and workflows
All service reads/writes include `org_id`; child relations use composite `(org_id,id)` foreign keys. Permissions are split into read, write and approve. Campaign and publication transitions are explicit allow-lists. Creation idempotency stores tenant-scoped request hashes and rejects key reuse with a different payload. Budget submission/approval emits transactional core outbox events consumed by workflow/finance adapters; workflow approval/rejection handlers update only the event tenant.

## API
`GET /campaigns|channels|budgets|assets|research|publications|tasks`; `POST /campaigns`, `/budgets`; transition endpoints for campaigns, budgets, publications. Every endpoint requires authentication, module entitlement and permission.

## Giới thiệu
Campaign, content, research and budget orchestration without CRM/Sales duplication. Mọi dữ liệu được cô lập theo tổ chức và module được nạp qua manifest loader.

## Chức năng
| Chức năng | Endpoint | Quyền |
|---|---|---|
| Kiểm tra module | `GET /api/v1/qldn-marketing/health` | Đăng nhập |
| Danh sách nghiệp vụ | `GET /api/v1/qldn-marketing/...` | `qldn-marketing.campaign.read` |
| Thao tác nghiệp vụ | `POST /api/v1/qldn-marketing/...` | `qldn-marketing.campaign.write` |

## Hướng dẫn sử dụng
Mở module từ catalog, chọn nhóm nghiệp vụ, tạo hoặc cập nhật hồ sơ rồi theo dõi trạng thái. API luôn lấy `org_id` từ JWT; không truyền tổ chức thay người dùng. Các thao tác nhạy cảm yêu cầu permission tương ứng trong manifest.

## Ví dụ
- **"Cho tôi xem danh sách nghiệp vụ QLDN — Marketing"** → Tiểu Tâm gọi endpoint danh sách với quyền đọc.
- **"Tạo hồ sơ mới và cho tôi biết trạng thái"** → Tiểu Tâm kiểm quyền, gọi endpoint tạo và trả về mã hồ sơ.

## Changelog
- 1.0.0 — Hoàn thiện module, manifest, loader, tài liệu và audit Beat 18.
