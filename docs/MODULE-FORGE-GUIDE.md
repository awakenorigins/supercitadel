# SUPERCITADEL — MODULE FORGE GUIDE (v1.0 · R7.6)

> **Tài liệu này dành cho AI assistant / developer bên ngoài.**
> Đọc xong file này, bạn phải đủ hiểu SUPERCITADEL để: (1) thiết kế một module nghiệp vụ mới plug-and-play, (2) đánh giá một repo open-source có fork được thành module không, (3) viết code đúng contract mà không cần hỏi thêm.
> English summary at the bottom.

---

## 1. SUPERCITADEL LÀ GÌ

Hệ điều hành quản trị doanh nghiệp Việt (business operating system for Vietnamese SMEs): mỗi tổ chức (org/tenant) bật các **module nghiệp vụ** (CRM, Kho, Kế toán, Nhân sự…) từ Cửa hàng Module, trả bằng tiền tệ nội bộ **Om**. Trợ lý AI **Tiểu Tâm** (LLM engine: Claude Sonnet 4.6 mặc định + GPT 5.5, hoán đổi được) đọc/ghi dữ liệu thật của module qua **action tools** — người dùng ra lệnh tiếng Việt, AI thao tác DB thật.

- **Live demo:** https://supercitadel.62.146.238.213.sslip.io (token demo: xem README)
- **Repo:** https://github.com/NachaFromMars/supercitadel

## 2. TECH STACK (chính xác, để match repo khi fork)

| Layer | Công nghệ | Version | Ghi chú |
|---|---|---|---|
| Ngôn ngữ | **TypeScript** (100%, ESM `type: module`) | TS 5.x | KHÔNG Python/Go/Java |
| Monorepo | **pnpm workspaces + turbo** | pnpm 9 | `packages/* services/* modules/* apps/*` |
| API | **Hono** (Node adapter) | ^4.6 | REST `/api/v1/*`, KHÔNG Express/Nest |
| ORM | **Drizzle ORM** | ^0.36 | schema-first TS, KHÔNG Prisma/TypeORM |
| DB | **PostgreSQL 16 + pgvector** | 16 | multi-tenant bằng cột `org_id` (KHÔNG schema-per-tenant) |
| Cache/queue | **Redis 7** | 7 | pub/sub cho realtime |
| Realtime | **ws** (WebSocket service riêng) | — | API bắn event qua `/internal/publish` |
| Frontend | **Next.js 15 App Router + React 19** | 15 / 19 | CSS thuần design-token trong `globals.css` — **KHÔNG Tailwind, KHÔNG UI lib** |
| Auth | JWT (jose), login bằng token seed | — | role: owner / manager / staff |
| AI engine | OpenAI-compatible chat completions + function calling | — | adapter pattern, đổi model = đổi env |
| Deploy | Docker Compose (`node:22-slim`) + Caddy reverse proxy | Node 22 | ports 3000 web / 3001 api / 3002 ws |
| Test | `tsx` test files + script audit endpoint | — | `pnpm -r test`, KHÔNG jest/vitest |

## 3. KIẾN TRÚC THƯ MỤC

```
supercitadel/
├── apps/web/                  # Next.js 15 — mỗi module có app/<route>/page.tsx
├── services/
│   ├── api/                   # Hono gateway: mount routes, auth, audit, tool registry
│   │   └── src/tieu-tam/      # AI: action tools + chat routes (persistence, multi-turn)
│   └── ws/                    # WebSocket + Redis pub/sub
├── packages/
│   ├── core/                  # types + env + AppError
│   ├── db/                    # Drizzle schema chung + migrations/*.sql (đánh số 0001…)
│   └── tieu-tam/              # AI engine: adapters (sonnet-4.6/gpt-5.5/stub), persona, memory
└── modules/<id>/              # ★ MODULE NGHIỆP VỤ — đơn vị plug-and-play
    ├── manifest.json          # id, name, tier, priceOm, permissions, tools, routes
    ├── package.json           # "@citadel/module-<id>", exports ./server/*.js → *.ts
    ├── migrations/*.sql       # bảng riêng của module (LUÔN có cột org_id)
    └── server/
        ├── schema.ts          # Drizzle pgTable — mọi bảng có org_id + index (org_id, …)
        ├── service.ts         # business logic thuần (db, orgId, params) → row
        ├── routes.ts          # buildXxxRoutes({ db, requireAuth, gate }) → Hono app
        ├── tools.ts           # (optional) AI tools đọc dữ liệu cho Tiểu Tâm
        └── *.test.ts          # test chạy bằng tsx
```

## 4. CONTRACT MODULE PLUG-AND-PLAY (6 bước bắt buộc)

Một module mới tên `<id>` phải có đúng các mảnh sau:

1. **`modules/<id>/manifest.json`** — khai báo:
```json
{
  "id": "<id>", "name": "Tên hiển thị", "version": "1.0.0",
  "tier": "paid|core|custom", "priceOm": 400,
  "icon": "i-<icon>", "description": "…",
  "permissions": ["<id>:read", "<id>:write"],
  "tools": ["<id>.query_x"],
  "routes": "/api/v1/<id>",
  "docs": "docs/GUIDE.md"
}
```
2. **Schema + migration** — mọi bảng: `id uuid pk default gen_random_uuid()`, **`org_id uuid NOT NULL`** (tenant isolation — bắt buộc), index `(org_id, ...)`. Migration đặt ở `modules/<id>/migrations/0001_<id>.sql` (hoặc `packages/db/migrations/` nếu đụng bảng chung). Runner: `pnpm --filter @citadel/db exec tsx src/migrate.ts` + deploy.sh tự áp module migrations.
3. **Service** — hàm thuần `(db, orgId, params) → row`. KHÔNG đọc request, KHÔNG biết Hono. Validate bằng `Errors.validation(...)` từ `@citadel/core`.
4. **Routes** — factory `buildXxxRoutes({ db, requireAuth, gate })` trả Hono app. Mount trong `services/api/src/index.ts`:
```ts
app.route('/api/v1/<id>', buildXxxRoutes({ db: getDb(), requireAuth, gate: requireModule(getDb(), '<id>') }));
```
`gate` chặn org chưa mua/bật module (HTTP 403). `orgOf(c)` lấy org từ JWT — **mọi query PHẢI filter org_id**.
5. **Catalog entry** — thêm vào `services/api/src/modules/catalog.ts` (`MODULE_CATALOG`): id, name, icon, desc, tier, priceOm, group, route FE, status (`ready|demo|coming_soon|open`).
6. **Frontend** — `apps/web/app/<route>/page.tsx`, dùng CSS tokens có sẵn trong `globals.css` (`.card .btn-p .chip .dt .biz-main .biz-aside`…), fetch qua `lib/api.ts` (tự gắn Bearer). Layout nghiệp vụ chuẩn: 2 cột `biz-main + biz-aside`, mobile-first 480px.

**Tùy chọn nâng cao:**
- **AI tools** (`server/tools.ts`): đăng ký vào `toolRegistry` để Tiểu Tâm ĐỌC dữ liệu; muốn Tiểu Tâm LÀM hành động (ghi DB) → thêm action vào `services/api/src/tieu-tam/actions.ts` (khuôn: `gate → service → audit → result`, xem `hr.add_employee`).
- **Realtime**: POST `/internal/publish` của ws service để đẩy event.
- **Audit**: gọi `audit(c, { action, resource, resourceId, detail })` cho mọi mutation.
- **Tutorial tour**: thêm tour vào `apps/web/components/Tutorial.tsx` (`TOURS`), anchor bằng `data-tut="..."`.

## 5. QUY TẮC BẤT DI BẤT DỊCH

1. `org_id` trên mọi bảng + mọi query — RÒ TENANT = FAIL.
2. Không thêm dependency mới khi chưa thật cần (UI = CSS thuần, không lib).
3. Typecheck + test + build pass trước mọi commit: `pnpm -r typecheck && pnpm -r test && pnpm -r build`.
4. Tiếng Việt là ngôn ngữ sản phẩm (UI text, message lỗi, docs người dùng).
5. Không commit secret — `.env` untracked; mẫu biến trong README.
6. Commit prefix theo round: `SUPERCITADEL-R<n>: <mô tả>`.
7. Mutation quan trọng → ghi audit log.

## 6. TÌM REPO OPEN-SOURCE ĐỂ FORK — TỪ KHÓA & TIÊU CHÍ

### 6.1 Thuật ngữ tìm kiếm hiệu quả (GitHub search)
| Nghiệp vụ cần | Từ khóa tìm repo | Ví dụ repo đáng xem |
|---|---|---|
| ERP tổng | `erp typescript postgres`, `open source erp nodejs` | ERPNext (Python — chỉ tham khảo thiết kế DocType), Ever-Gauzy (TS/NestJS) |
| CRM | `crm typescript self-hosted`, `headless crm api` | Twenty (TS+React+Postgres ★), frappe/crm (Vue) |
| Kế toán | `double entry accounting library typescript`, `ledger nodejs` | medici (Mongo — port logic), akaunting (PHP — tham khảo schema) |
| Kho/tồn kho | `inventory management nodejs postgres`, `warehouse api typescript` | Ever-Gauzy inventory, ERPNext stock (tham khảo valuation) |
| Nhân sự/chấm công | `hrms open source`, `attendance payroll typescript` | frappe/hrms (Python — tham khảo 13 sub-module), horilla (Python) |
| POS | `pos system typescript react`, `point of sale postgres` | — đang coming_soon, ưu tiên forge mới |
| E-invoice VN | `vietnam e-invoice`, `hóa đơn điện tử api` | viettel/vnpt sdk wrappers |
| Booking/lịch hẹn | `appointment scheduling typescript self-hosted` | cal.com (TS ★ dễ port nhất) |
| Helpdesk/ticket | `helpdesk typescript open source` | frappe/helpdesk, peppermint (TS) |

### 6.2 Tiêu chí chấm repo TRƯỚC khi fork (chấm nhanh 5 điểm)
1. **Ngôn ngữ TS/JS?** — TS = port thẳng service logic; Python/PHP/Go = CHỈ lấy thiết kế schema + business rules, viết lại TS (thường nhanh hơn port).
2. **Postgres?** — cùng DB = migration dịch gần 1:1; Mongo/MySQL = phải map lại kiểu dữ liệu.
3. **Business logic tách API không?** — có service layer sạch = port dễ; logic trộn controller = mất công gỡ.
4. **License** — MIT/Apache-2.0 = fork thoải mái; AGPL (ERPNext, cal.com…) = chỉ THAM KHẢO THIẾT KẾ, không copy code nguyên văn vào repo closed-source.
5. **Multi-tenant sẵn chưa?** — hầu hết repo là single-tenant → khi port PHẢI thêm org_id vào mọi bảng/query (đây là việc chính của người forge).

### 6.3 Chiến lược đã chứng minh (từ docs/FORK-PLAN.md — deepdive ERPNext thật)
> ERPNext accounts = 192 DocTypes, stock = 78 — KHÔNG port nguyên khối. Chiến lược đúng: **lấy 15-20% bề mặt nghiệp vụ mà SME Việt cần**, thiết kế lại bằng Drizzle schema gọn, giữ đúng business rules (sổ kép, valuation, leave allocation…), bỏ enterprise features (multi-currency phức tạp, manufacturing, asset).

**Pipeline forge chuẩn:** đọc schema repo nguồn → chọn bảng lõi → viết Drizzle schema (+org_id) → viết service.ts theo business rules → routes theo contract §4 → catalog + FE + AI tools → test + audit endpoint.

## 7. CHO AI BOX: PROMPT KHUNG KHI THIẾT KẾ MODULE

Khi được đưa link repo này + yêu cầu forge module `<X>`, hãy:
1. Đọc file này + `docs/DEV_GUIDE.md` + 1 module mẫu (khuyên: `modules/crm/` — đủ schema/service/routes/tools, hoặc `modules/hr/` — có service-v2 + leave).
2. Trả lời đủ: bảng nào (schema + org_id + index), endpoint nào (REST CRUD + nghiệp vụ đặc thù), quyền gì (owner/manager/staff), AI tools/actions nào cho Tiểu Tâm, FE page layout nào, giá Om + tier + group nào.
3. Code theo đúng contract §4, quy tắc §5. Mọi text hướng người dùng bằng tiếng Việt.
4. Test tối thiểu: tạo/đọc đúng org, org khác không thấy (tenant isolation), gate 403 khi module chưa bật.

---

## English Summary (for non-Vietnamese AI assistants)

**SUPERCITADEL** is a TypeScript business-OS monorepo for Vietnamese SMEs: **pnpm + turbo**, **Hono** REST API (`services/api`), **Drizzle ORM + PostgreSQL 16** (multi-tenant via `org_id` column on every table), **Redis** pub/sub + dedicated **ws** WebSocket service, **Next.js 15 / React 19** frontend with plain CSS design tokens (no Tailwind), JWT auth, Docker Compose deploy (Node 22). An LLM assistant ("Tiểu Tâm", OpenAI-compatible function calling, Claude Sonnet 4.6 default + GPT 5.5 switchable) executes real business actions against module data.

A **module** is a folder `modules/<id>/` with: `manifest.json` (id/tier/priceOm/permissions/tools/routes), SQL migrations (every table MUST have `org_id uuid NOT NULL` + composite index), `server/schema.ts` (Drizzle), `server/service.ts` (pure functions `(db, orgId, params)`), `server/routes.ts` (Hono factory `buildXxxRoutes({db, requireAuth, gate})` mounted at `/api/v1/<id>` in `services/api/src/index.ts`), a catalog entry in `services/api/src/modules/catalog.ts`, a Next.js page in `apps/web/app/<route>/`, and optionally AI tools (read) in `server/tools.ts` plus AI actions (write) in `services/api/src/tieu-tam/actions.ts`.

Hard rules: tenant isolation via `org_id` everywhere; no new dependencies without strong need; `pnpm -r typecheck && test && build` must pass; Vietnamese product language; never commit secrets; commit prefix `SUPERCITADEL-R<n>:`.

When evaluating open-source repos to fork: prefer TypeScript + Postgres + clean service layer + MIT/Apache license; AGPL sources may only be used as design reference. Most OSS is single-tenant — adding `org_id` scoping is the core porting work. Do not port giant ERPs wholesale; extract the 15-20% of tables/rules that Vietnamese SMEs actually need and re-implement them against the contract above.
