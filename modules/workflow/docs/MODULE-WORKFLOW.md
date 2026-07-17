# MODULE-WORKFLOW — Quy trình & Phê duyệt

## Giới thiệu
`workflow` là module core của SUPERCITADEL dùng để định nghĩa và vận hành quy trình phê duyệt đa cấp cho các module nghiệp vụ. Module quản lý definition, instance, step, action log, SLA và phát outbox event để notification hoặc module khác xử lý bất đồng bộ.

## Chức năng
| Endpoint | Quyền | Mô tả |
|---|---|---|
| `GET /api/v1/workflow/definitions` | `workflow.definition.read` | Liệt kê định nghĩa quy trình theo org, lọc active/domain. |
| `POST /api/v1/workflow/definitions` | `workflow.definition.write` | Tạo definition gồm steps_config và threshold_rules. |
| `PATCH /api/v1/workflow/definitions/:id` | `workflow.definition.write` | Cập nhật definition trong org hiện tại. |
| `GET /api/v1/workflow/instances` | `workflow.instance.read` | Liệt kê hồ sơ quy trình, lọc status/entityType. |
| `POST /api/v1/workflow/instances/start` | `workflow.instance.write` | Khởi tạo instance và materialize các bước duyệt. |
| `GET /api/v1/workflow/instances/:id` | `workflow.instance.read` | Xem instance, steps và approval actions. |
| `POST /api/v1/workflow/steps/:id/approve` | `workflow.step.approve` | Duyệt bước active, tự kích hoạt bước tiếp theo hoặc đóng approved. |
| `POST /api/v1/workflow/steps/:id/reject` | `workflow.step.reject` | Từ chối và đóng instance rejected. |
| `POST /api/v1/workflow/steps/:id/return` | `workflow.step.reject` | Trả hồ sơ về trạng thái chờ sửa, giữ audit trail. |
| `POST /api/v1/workflow/steps/:id/delegate` | `workflow.step.delegate` | Ủy quyền bước cho user khác. |
| `GET /api/v1/workflow/admin/*` | `workflow.admin.manage` + owner | Xem rollout, compliance test, SLA admin. |

## Hướng dẫn sử dụng
1. Owner/manager tạo definition bằng `code`, `domain`, `entityType`, `stepsConfig` và `thresholdRules`.
2. Module nghiệp vụ gọi `POST /instances/start` hoặc service `start(tx, ...)` trong transaction nghiệp vụ.
3. Người có quyền duyệt dùng các endpoint step để approve/reject/return/delegate.
4. SLA scanner do host API gọi qua `startWorkflowSlaScanner(db, listActiveOrgIds)` mỗi 60 giây. Step quá hạn vẫn giữ `status='active'`, chỉ set `metadata.slaExpiredNotified=true` và emit `workflow.step.expired` một lần.
5. Mọi query/mutation luôn scope theo `org_id` từ JWT; không nhận org_id từ client.

## Ví dụ
- **"Tạo quy trình duyệt chi 2 cấp cho phiếu thanh toán"** → Tiểu Tâm tạo `wf_definition` với bước KTT và Giám đốc, kèm SLA từng bước.
- **"Duyệt hồ sơ thanh toán này giúp anh"** → Tiểu Tâm kiểm quyền `workflow.step.approve`, gọi endpoint approve cho step active và ghi audit.
- **"Hồ sơ nào đang quá hạn SLA?"** → Tiểu Tâm đọc admin SLA endpoint cho owner và hiển thị các bước đã được scanner đánh dấu.

## Changelog
- `1.0.0` — Beat 1/2: schema, service core, routes, loader registration, SLA scanner, UI admin và docs.
