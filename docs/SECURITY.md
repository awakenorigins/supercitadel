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

## AI (Tiểu Tâm) Safety
- Action layer gate theo module đang bật (`requireModule`); mọi action mutate ghi **audit log**.
- Roadmap R8.5: permission registry `module.resource.action` + securityLevel per-tool + dry-run action nhạy cảm.

## Audit Log
- Mọi mutation quan trọng (`tieu_tam.action`, `store.item_purchase`, `item.use`, `company_module.request`, …) ghi bảng audit kèm org + user + detail.

## Báo lỗi bảo mật
Mở issue GitHub (không kèm PoC khai thác chi tiết) hoặc liên hệ chủ repo.
