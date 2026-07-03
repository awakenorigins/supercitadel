# SUPERCITADEL — Pháo đài quản trị doanh nghiệp Việt

![release](https://img.shields.io/badge/release-r7.1.0-jade) ![stack](https://img.shields.io/badge/stack-Next.js%20%2B%20Hono%20%2B%20Postgres-blue) ![pnpm](https://img.shields.io/badge/pnpm-monorepo-orange) ![beta](https://img.shields.io/badge/beta-open%20access-violet)

SUPERCITADEL là nền tảng quản trị doanh nghiệp Việt theo mô hình **pháo đài số**: mỗi tổ chức có tenant riêng, ví Om riêng, module nghiệp vụ riêng và trợ lý AI **Tiểu Tâm** sống trong hệ thống để hỗ trợ vận hành bằng ngôn ngữ tự nhiên.

## Kiến trúc

- **Web:** Next.js App Router (`apps/web`), Design System v2 trong `globals.css`, không Tailwind.
- **API:** Hono (`services/api`) với JWT tenant isolation, audit log, rate limit.
- **DB:** PostgreSQL + Drizzle schema/migrations (`packages/db`).
- **Realtime:** Redis/WebSocket cho chat/notification.
- **AI:** package `@citadel/tieu-tam`, action layer gắn vào các module nghiệp vụ.
- **Monorepo:** pnpm workspace + Turborepo.

## Module catalog

| Nhóm | Module | Trạng thái | Ghi chú |
|---|---|---:|---|
| Cốt lõi | Chat | ready | Chat nội bộ realtime |
| Cốt lõi | Notification | ready | Thông báo realtime |
| Cốt lõi | Ví Om | ready | Đồng Om nội bộ |
| Kinh doanh | CRM | paid | Khách hàng, deal, chăm sóc |
| Vận hành | Kho Hàng | paid | Nhập xuất tồn, cảnh báo |
| Nhân sự | Nhân Sự & Ca | paid | Ca làm, nhân viên, phép |
| Tài chính | Kế Toán | paid | Sổ cái kép, phiếu thu/chi |
| AI Automation | Automato Thư Ký | demo | Thư ký AI tự động, thuê demo |
| May Đo Doanh Nghiệp | Module Company | custom/open | Hồ sơ công ty riêng → Citadel forge module riêng |
| Kinh doanh | POS | coming | Order, hóa đơn, ca thu ngân |

## Điểm nổi bật theo release

- **v7a:** nền tảng tenant, auth token 13 ký tự, audit log, Tiểu Tâm soul/memory tách engine, item economy.
- **r3:** rental module, OwnedBar, landing polish.
- **r4:** layout 2 cột, polish marketplace/module card.
- **r5:** tutorial spotlight toàn app, xác nhận mua item, Automato Thư Ký demo widget.
- **r6:** Tiểu Tâm **Sonnet 4.6** action layer, 13 actions chạy thật trên CRM/Kho/Kế toán/Om.
- **r7:** Module Company wizard — mô tả công ty riêng, chấp nhận điều khoản beta, tạo hồ sơ forge tenant-scoped.

### Ví dụ lệnh Tiểu Tâm action layer r6

| Nhóm | Ví dụ |
|---|---|
| Kế toán | “Tạo phiếu thu 500k của khách A”, “cho em xem sổ cái hôm nay” |
| CRM | “Thêm khách Nguyễn An số 090...” |
| Kho | “Nhập 20 kg cà phê hạt”, “mặt hàng nào sắp hết?” |
| Om | “Kiểm tra số dư Om”, “ghi nhận chi Om cho module” |

Action layer r6 gồm 13 actions: nhận diện ý định, tạo khách/deal, đọc pipeline, nhập/xuất kho, đọc tồn kho/cảnh báo, tạo phiếu thu/chi, đọc sổ cái, đọc số dư Om, ghi audit và phản hồi tự nhiên qua Tiểu Tâm.

## Module Forge cho công ty riêng

Người dùng có thể vào **Cửa Hàng Module → Module Company → Add Module Company** để điền wizard 5 bước theo mẫu `docs/Mo-Ta-Cong-Ty-Form.txt` / `docs/Mo-Ta-Cong-Ty-Form.pdf`:

1. Thông tin chung.
2. Phòng ban & phân quyền.
3. Vận hành hằng ngày.
4. Dữ liệu, báo cáo, module dùng chung, việc giao AI.
5. Ưu tiên & điều cấm kỵ.

Sau khi đồng ý điều khoản beta, API lưu hồ sơ vào `company_module_requests`, audit `company_module.request`, trạng thái khởi tạo `received`. Hook build module riêng được chừa cho round forge sau.

## Beta open access

SUPERCITADEL đang mở beta: token seed cho owner/manager/super-admin, module paid có thể mua/thuê bằng Om demo, Module Company nhận hồ sơ để đội Citadel review và báo giá Om sau.

## Deploy nhanh

```bash
pnpm install
pnpm db:migrate
pnpm -r typecheck
pnpm -r test
pnpm -r build
./deploy.sh
# hoặc
PROJECT=supercitadel docker compose -p supercitadel up -d --build web api
```

### Env chính

| Biến | Mục đích |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis realtime/cache |
| `JWT_SECRET` | Ký access token |
| `CORS_ORIGIN` | Origin web production |
| `PORT` | API port |
| `NEXT_PUBLIC_API_URL` | URL API cho web |
| `CITADEL_SUPER_ADMIN_TOKEN` | Token seed super admin |
| `CITADEL_OWNER_TOKEN` | Token seed owner |
| `CITADEL_MANAGER_TOKEN` | Token seed manager |
| `LLM_PROVIDER` | Provider AI mặc định |
| `LLM_MODEL` | Model mặc định cho Tiểu Tâm |
| `LLM_API_KEY` | API key provider — không commit |
| `LLM_BASE_URL` | Base URL nếu dùng gateway/proxy |
| `LLM_TIEU_TAM_MODEL` | Override model Tiểu Tâm |
| `LLM_ACTIONS_ENABLED` | Bật/tắt action layer |
| `LLM_TIMEOUT_MS` | Timeout gọi LLM |

## Cấu trúc thư mục

```text
apps/web/              Next.js UI
services/api/          Hono API + routes nghiệp vụ
packages/db/           Drizzle schema + migrations + seed
packages/tieu-tam/     AI soul/action registry
modules/*              Module domain packages
docs/                  Tài liệu vận hành + Module Forge form
scripts/               Audit/acceptance helpers
```

## Audit & acceptance

```bash
pnpm -r typecheck
pnpm -r test
pnpm -r build
pnpm --filter @citadel/api audit-endpoints   # 92/92
pnpm --filter @citadel/api acceptance        # 9/9
pnpm audit-buttons                           # expected 0
```

Báo cáo liên quan: [`R5-AUDIT.md`](./R5-AUDIT.md), [`R6-AUDIT.md`](./R6-AUDIT.md).

## An toàn

- Không commit `.env`, token, private key.
- Mọi bảng tenant-scoped phải có `org_id` và route lọc theo JWT org.
- Hành động nghiệp vụ quan trọng phải ghi audit log.
- Không sửa `/etc/caddy/Caddyfile` khi deploy live.
