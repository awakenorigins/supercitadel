# SUPERCITADEL — SECURITY (R8)

## Auth & Token
- Đăng nhập bằng **token 13 ký tự** (ADR-0001), hash bằng **argon2id** (`@node-rs/argon2`) — KHÔNG lưu plain text. Lookup theo prefix, verify hash.
- Sau login phát **JWT** (jose). Role: `owner / manager / staff` (ROLE_RANK).
- JWT_SECRET bắt buộc ≥16 ký tự ở production (API fail-fast nếu default/placeholder).

## Tenant Isolation
- Mọi bảng tenant-scoped có `org_id uuid NOT NULL` + index; mọi query filter `org_id` từ JWT (`orgOf(c)`).
- Roadmap R9+: bật Postgres **Row-Level Security** (`SET LOCAL app.current_org_id`) làm lớp bảo hiểm tầng DB.

## CORS (R8)
- Production (`NODE_ENV=production`): CHỈ origin trong `CORS_ORIGIN` (danh sách phẩy). Origin lạ không được cấp CORS header.
- Development: thêm `http://localhost:3000`, `http://127.0.0.1:3000`.

## Deploy an toàn
- Production dùng overlay: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`
  - Postgres/Redis KHÔNG expose ra ngoài; API/WS/Web chỉ bind 127.0.0.1; public qua reverse proxy 80/443.
- API **fail-fast** khi NODE_ENV=production mà JWT_SECRET/DB_PASSWORD còn default/placeholder.
- `.env` untracked — không bao giờ commit secret. CI có secret scan gate.

## RBAC Permission Registry (R8.5)
- Quyền được khai báo tập trung trong `packages/core/src/permissions.ts` theo dạng `module.resource.action` kèm mô tả tiếng Việt, module, securityLevel và cờ sensitive.
- API dùng `requirePermission(permission)` sau `requireAuth`: thiếu quyền trả `403` tiếng Việt kèm `PERMISSION_DENIED`; thiếu bảo mật lớp 2 trả `SECURITY_LEVEL_REQUIRED`/hướng dẫn gắn email hoặc SĐT.
- `GET /api/v1/permissions` trả registry + quyền đã resolve theo role + `securityLevel` để UI/Tiểu Tâm biết năng lực hiện tại.

| Role | Quyền chính | Giới hạn |
|---|---|---|
| `super_admin` | Toàn bộ registry | Dùng cho vận hành hệ thống |
| `owner` | Toàn bộ quyền trong org (`*`) | Hành động sensitive vẫn cần securityLevel đủ |
| `manager` | CRUD nghiệp vụ: accounting/crm/hr/inventory/om/report/audit | Không được đổi role, không hủy voucher nhạy cảm |
| `staff` | Quyền nhẹ: đọc ví/report, thêm contact, check-in/out | Không tạo phiếu thu/chi/hóa đơn, không điều chỉnh kho, không đổi role |

## AI (Tiểu Tâm) Safety
- Action layer gate theo module đang bật (`requireModule`), RBAC permission registry và securityLevel per-action; mọi action mutate ghi **audit log**.
- Action nhạy cảm (phiếu thu/chi/hóa đơn, điều chỉnh kho lớn…) chạy **dry-run trước**: trả preview + `pendingAction`, chỉ ghi DB khi client/user gửi `confirm=true`. Audit ghi cả `tieu_tam.action_dryrun` và `tieu_tam.action`.

## Audit Log
- Mọi mutation quan trọng (`tieu_tam.action`, `store.item_purchase`, `item.use`, `company_module.request`, …) ghi bảng audit kèm org + user + detail.

## Báo lỗi bảo mật
Mở issue GitHub (không kèm PoC khai thác chi tiết) hoặc liên hệ chủ repo.
