# SUPERCITADEL — MODULE FORGE GUIDE (v2.0 · R9 STRICT LOADER)

> Dành cho AI assistant / developer bên ngoài. Sau khi đọc, bạn phải đủ hiểu để forge module nghiệp vụ plug-and-play cho SUPERCITADEL mà không phá multi-tenant, không lệch manifest, và không cần sửa core loader.

---

## 1. SUPERCITADEL LÀ GÌ

SUPERCITADEL là hệ điều hành quản trị doanh nghiệp Việt cho SME: mỗi tổ chức bật module nghiệp vụ (CRM, Kế toán, Nhân sự, Kho, OM wallet, Chat...) từ catalog, trả bằng Om. Trợ lý AI Tiểu Tâm đọc/ghi dữ liệu thật qua action tools có kiểm quyền.

- Live demo: `https://supercitadel.62.146.238.213.sslip.io`
- Repo: `https://github.com/NachaFromMars/supercitadel`
- Ngôn ngữ sản phẩm: tiếng Việt.

## 2. TECH STACK

| Layer | Công nghệ | Ghi chú |
|---|---|---|
| Monorepo | pnpm workspaces + turbo | `packages/* services/* modules/* apps/*` |
| API | Hono, TypeScript ESM | REST `/api/v1/*` |
| DB | PostgreSQL 16 + Drizzle | multi-tenant qua `org_id` |
| Realtime | Redis pub/sub + ws service | API publish nội bộ |
| Frontend | Next.js App Router | CSS tokens thuần, không Tailwind/UI lib |
| Auth | JWT | role owner/manager/staff |
| Deploy | Docker Compose + Caddy | không sửa Caddy khi forge module |
| Test | `tsx` scripts | không Jest/Vitest |

## 3. MODULE LÀ GÌ

Một module là thư mục `modules/<id>/`:

```text
modules/<id>/
├── manifest.json          # nguồn sự thật để loader quyết định nạp/từ chối
├── package.json           # package module, ESM
├── migrations/*.sql       # bảng riêng, luôn có org_id
└── server/
    ├── schema.ts          # Drizzle pgTable
    ├── service.ts         # business logic thuần
    ├── routes.ts          # Hono route factory
    ├── tools.ts           # optional AI read tools
    └── events.ts          # optional từ R10: outbox handlers
```

Từ R9, catalog và mount route lấy từ manifest hợp lệ. Không thêm catalog hardcode cho module thật.

## 4. MANIFEST SCHEMA v2 — BẮT BUỘC

`modules/<id>/manifest.json` phải đúng schema v2:

```json
{
  "id": "inventory",
  "name": "Kho",
  "version": "1.0.0",
  "tier": "paid",
  "priceOm": 400,
  "icon": "i-box",
  "description": "Quản lý tồn kho theo tổ chức.",
  "permissions": [
    "inventory.item.read",
    "inventory.item.write"
  ],
  "routes": "/api/v1/inventory",
  "docs": "docs/MODULE-FORGE-GUIDE.md",
  "dependsOn": [],
  "engine": "^1.0.0"
}
```

### Field rules

| Field | Bắt buộc | Quy tắc |
|---|---:|---|
| `id` | yes | `^[a-z][a-z0-9-]*$`, trùng tên thư mục module |
| `name` | yes | string không rỗng, tiếng Việt tốt nhất |
| `version` | yes | semver `x.y.z` |
| `tier` | yes | `core`, `paid`, `demo`, hoặc `custom` |
| `priceOm` | yes | number `>= 0` |
| `icon` | yes | string không rỗng |
| `description` | yes | string không rỗng |
| `permissions` | yes | array permission key dạng `module.resource.action` |
| `routes` | yes | prefix `/api/v1/...` |
| `docs` | yes | path tài liệu trong repo |
| `dependsOn` | optional | array module id; dependency thiếu/bị reject thì module cũng bị reject |
| `engine` | optional | semver range contract, ví dụ `^1.0.0` |

### Strict loader

- Manifest sai field bắt buộc → module bị từ chối nạp, server vẫn chạy.
- `dependsOn` không tồn tại hoặc dependency bị reject → từ chối dây chuyền.
- Module có manifest hợp lệ nhưng chưa có route builder đăng ký trong loader → từ chối.
- Field lạ không làm crash, nhưng được warning để dọn schema.
- Admin xem trạng thái tại `GET /api/v1/modules/loader-status` (owner+; staff 403).

### Lỗi thường gặp

| Lỗi | Kết quả | Cách sửa |
|---|---|---|
| `id: "Inventory"` | reject | đổi thành `inventory` |
| `version: "1"` | reject | dùng `1.0.0` |
| `tier: "enterprise"` | reject | dùng `paid/custom/demo/core` |
| `priceOm: -1` | reject | số `>= 0` |
| `permissions: ["inventory:read"]` | reject | đổi sang `inventory.item.read` |
| `routes: "/inventory"` | reject | đổi sang `/api/v1/inventory` |
| `dependsOn: ["missing"]` | reject | thêm module dependency hoặc bỏ dependsOn |

## 5. CONTRACT CODE MODULE

1. **Schema + migration**: mọi bảng business phải có `org_id uuid NOT NULL`, index `(org_id, ...)`. Migration đặt trong `modules/<id>/migrations/` nếu module riêng; chỉ dùng `packages/db/migrations/` khi tạo bảng chung.
2. **Service thuần**: hàm dạng `(db, orgId, params) => row`. Không đọc Hono request trong service. Validate bằng `Errors.validation(...)` từ `@citadel/core`.
3. **Routes**: export factory `buildXxxRoutes({ db, requireAuth, gate })`. Mọi query filter `org_id` từ JWT. Mọi mutation quan trọng ghi audit.
4. **Permissions**: permission key trong manifest phải khớp registry và middleware format `module.resource.action`.
5. **Frontend**: `apps/web/app/<route>/page.tsx`, dùng CSS token có sẵn (`card`, `btn-p`, `chip`, `biz-main`, `biz-aside`), không thêm UI dependency.
6. **AI tools/actions**: tools đọc đặt trong module; action ghi qua service + gate + audit.

## 6. VERIFY TRƯỚC KHI MERGE

Chạy tối thiểu:

```bash
pnpm -r typecheck
pnpm -r test
pnpm -r build
pnpm --filter @citadel/api exec tsx ../../scripts/audit-manifests.mts
pnpm --filter @citadel/api exec tsx ../../scripts/audit-module-docs.mts
pnpm --filter @citadel/api exec tsx ../../scripts/audit-buttons.mts
```

Live R9 phải chứng minh:

- `/api/v1/modules` trả catalog từ manifest thật.
- `/api/v1/modules/loader-status` owner 200, staff 403.
- Routes của module hợp lệ còn sống.
- Login/chat/action cũ không gãy.

## 7. QUY TẮC BẤT DI BẤT DỊCH

1. `org_id` trên mọi bảng + mọi query. Rò tenant = fail.
2. Không thêm dependency mới nếu chưa thật cần.
3. Typecheck/test/build pass trước commit.
4. UI/API/docs hướng người dùng bằng tiếng Việt.
5. Không commit secret, token, `.env` thật.
6. Commit prefix theo round: `SUPERCITADEL-R<n>:`.
7. Không sửa logic module `inventory` khi không được yêu cầu; module kho riêng sẽ cắm vào contract outbox R10.

## 8. GỢI Ý FORGE MODULE KHO/NGHIỆP VỤ MỚI

Khi forge module `<id>`:

1. Đọc guide này + module mẫu (`crm`, `hr`, `accounting`).
2. Thiết kế schema có `org_id`, endpoint REST, quyền, action audit, UI page.
3. Viết manifest v2 trước, chạy audit manifest sớm.
4. Viết service trước route để test tenant isolation dễ.
5. Thêm route builder vào loader map nếu đây là module built-in trong repo.
6. Verify org A không đọc/ghi dữ liệu org B.

## English Summary

SUPERCITADEL modules are TypeScript ESM folders under `modules/<id>`. Since R9, `manifest.json` schema v2 is the source of truth for catalog and loading. The strict loader validates manifests, rejects invalid modules without crashing the API, rejects missing dependencies, and exposes owner-only `/api/v1/modules/loader-status`. A valid manifest requires `id`, `name`, semver `version`, `tier`, non-negative `priceOm`, `icon`, `description`, `permissions` in `module.resource.action` format, `/api/v1/...` `routes`, and `docs`; `dependsOn` and `engine` are optional. Every table and query must be org-scoped with `org_id`. No new dependencies, no secrets, Vietnamese product text, and typecheck/test/build/audit gates must pass before commit.