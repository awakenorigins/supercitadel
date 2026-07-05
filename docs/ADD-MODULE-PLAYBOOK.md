# SuperCitadel — Quy Trình Thêm Module (Add-Module Playbook)

> Đúc kết từ R11 (Kế Toán 10A) và R11.3 (Soul-Manager). Tham khảo mỗi lần thêm module mới.

## 0. Nguyên tắc an toàn (bất di)
1. **Backup trước:** `git tag backup-before-<mod>` + `git branch backup/pre-<mod>` tại HEAD sạch. Không OK → revert về đây.
2. **Không đụng dữ liệu prod.** Migration mới chỉ THÊM. Không sửa migration đã chạy prod.
3. **Không trùng tên bảng** với module đang chạy. Trùng = `CREATE TABLE IF NOT EXISTS` sẽ bỏ qua âm thầm → services đọc cột không có → vỡ. → **namespace bảng bằng tiền tố riêng** (vd `sm_`).
4. **Audit kỹ:** mọi claim có bằng chứng chạy thật (test output, curl live, loader log, CI).

## 1. Nhận diện & audit module
- Giải nén vào staging (`/tmp/<mod>-stage`), đọc `manifest.json`, `README`, `AUDIT_REPORT`.
- Chạy audit/test native của module (nếu có) để biết nó tự chạy được không.
- **Deep audit (spawn sub-agent read-only):** schema safety (collision tên bảng!), RLS, luật nghiệp vụ, permission list, dep mismatch, test inventory, top risks.
- Query DB LIVE xem có bảng trùng tên không: `\dt` / `information_schema.tables`.

## 2. Hợp đồng manifest của host (BẮT BUỘC khớp)
`validateManifest` (packages/core/src/manifest.ts) yêu cầu:
- `permissions`: **mảng chuỗi** `module.resource.action`, và **mọi key phải có trong PERMISSION_REGISTRY**.
- `routes`: **chuỗi** bắt đầu `/api/v1/<id>` (KHÔNG phải mảng route).
- `priceOm` số ≥ 0, `tier` ∈ core|paid|demo|custom, `docs` chuỗi, `id` khớp `^[a-z][a-z0-9-]*$`.
- `events.emits/subscribes` topic `module.entity.verb`.
- Field lạ → chỉ warning (bị bỏ qua), không lỗi.
→ Nếu module gốc dùng manifest "rich" (nested permission, tools[], store...): giữ nguyên thành `manifest.module.json`, viết `manifest.json` mới đúng shape host.

## 3. Namespace bảng (khi trùng)
- Rename `hr_` → `sm_` **chỉ trong string literal DB** (schema.ts `pgTable('...')`/`index('...')`, các file .sql, DROP list, raw SQL test). **KHÔNG** đổi symbol TS (`hrTools`), tool id (`hr.employee.read`), event topic (`hr.*`), type (`HrCtx`).
- Backfill legacy migration → **loại khỏi auto-deploy** (guard `*backfill*` trong deploy.sh), chỉ chạy thủ công có chủ đích.

## 4. Đăng ký permission (packages/core/src/permissions.ts)
- Thêm block `p('<key>','mô tả', securityLevel?, sensitive?)` cho MỌI permission manifest khai.
- `owner:['*']` + `manager:['<module>.*',...]` tự cấp qua wildcard — thường không cần sửa ROLE_PERMISSIONS.

## 5. Route builder (services/api/src/modules/loader.ts)
- Loader auto-discover manifest NHƯNG **bắt buộc có builder** trong `builders{}` — thiếu = module bị `rejected`.
- Thêm: `'<id>': (d) => build<Mod>Routes({ db, requireAuth, gate: d.requireModule(d.db,'<id>'), audit })`.
- Nếu module framework-neutral (trả route DEF, không phải Hono app): viết **host-adapter** trong `modules/<id>/server/host-adapter.ts` dựng Hono từ route defs.

## 6. RLS-aware adapter (nếu module dùng RLS)
- Host db = postgres-js pool, role `citadel` **có BYPASSRLS + superuser** → **RLS KHÔNG lọc trên host này** (defense-in-depth thôi, không phải isolation thật).
- **Isolation thật = app-level:** adapter LUÔN dùng `auth.orgId` từ JWT (không nhận org từ client), services luôn `eq(table.orgId, ctx.orgId)`.
- Vẫn nên set GUC per-txn để RLS hoạt động nếu sau này đổi sang role non-bypass:
  `db.transaction(tx => { tx.execute(sql\`SELECT set_config('app.current_org_id', ${orgId}, true)\`); ... })`.

## 7. Tiểu Tâm hấp thụ module
- **Read tools:** `services/api/src/index.ts` → `<mod>Tools(getDb()).forEach(t => toolRegistry.register(t))`. ToolDef shape: `{ name, module, description, requiresPermission?, handler(input, ctx) }`.
- **Write actions:** `services/api/src/tieu-tam/actions.ts` → `defs.push(...<mod>TieuTamActions())`. Action shape: `{ name, description, requiredModule, permission, securityLevel, sensitive, parameters, execute(ctx,p) }`.
- payroll/tiền → `securityLevel:2, sensitive:true`.

## 8. Deps & workspace
- `modules/*` đã trong `pnpm-workspace.yaml`.
- `services/api/package.json` → thêm `"@citadel/module-<id>": "workspace:*"`.
- `modules/<id>/package.json`: align dep versions với host (drizzle-orm ^0.36, zod ^3, hono ^4.6, pglite ^0.2), thêm `exports` cho host-adapter + tieu-tam-actions, thêm `@citadel/core workspace:*` nếu dùng.
- `pnpm install`.

## 9. Deploy list (deploy.sh)
- Thêm `<id>` vào vòng `for m in ... <id>; do`.
- Guard bỏ qua `*backfill*`.

## 10. Cổng chất lượng (trước commit)
- `pnpm --filter @citadel/module-<id> typecheck` + `pnpm --filter @citadel/api typecheck` = 0.
- `pnpm --filter @citadel/module-<id> test` (native) PASS.
- `pnpm -r test` toàn xanh. **Bump test đếm module** (vd v9.test.ts `loaded.length`) lên số mới, assert module mới có trong loaded + routes đúng.
- `pnpm --filter @citadel/web build` = 0.

## 11. Deploy live + verify thật
- Apply migration lên DB live (0000 tables + 0001 RLS; **KHÔNG** chạy backfill). Verify bảng + RLS + **bảng module cũ còn nguyên** (count trước/sau).
- `docker compose -p supercitadel up -d --build api web`. Chờ api healthy.
- Loader log phải `Nạp N module · Từ chối 0` (N tăng đúng 1).
- Activate module cho org test (`org_modules`), chạy `scripts/verify-<r>.py`: create→read-back qua API thật (chứng minh adapter + isolation), + regression module cũ (vd `/api/v1/hr` vẫn 200).
- Dọn data test sau verify.

## 12. Ship
- Secret scan → commit `SUPERCITADEL-R<x>:` → push (`set -a; source ~/.config/tt-github/env; set +a; git -c credential.helper=... push ... master:main`).
- Release tag `vX.Y.Z` (GitHub từ chối r-prefix). Chờ CI Actions SUCCESS thật.
- Update STATE + playbook này nếu có bài học mới.
