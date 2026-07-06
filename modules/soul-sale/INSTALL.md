# Soul-Sale 1A — INSTALL.md

> Cách nhanh nhất: đưa `SoulSale1A-NAP-MODULE-PROMPT.md` cho AI agent trong repo SuperCitadel — 8 beat tự động có kiểm chứng. Dưới đây là bản tay.

1. **Giải nén** vào `modules/soul-sale/` (repo root). `cd modules/soul-sale && npm install && npm test` — phải 102/102.
2. **Permissions**: chèn khối trong `integration/permissions-block.ts` vào `PERMISSION_REGISTRY` (`packages/core/src/permissions.ts`), thêm `'soulsale.*'` vào wildcard role manager.
3. **Migrations**: chạy `migrations/0000_init.sql` + `0001_rls.sql` bằng runner của host (theo thứ tự, tách theo `--> statement-breakpoint`).
4. **Loader/API**: đăng ký module trong `services/api/src/modules/loader.ts` (mount `buildSoulSaleRoutes` tại `/api/v1/soul-sale`, truyền `db/requireAuth/gate/audit/emit`).
5. **Tiểu Tâm**: đăng ký `soulSaleTools` vào toolRegistry và `soulSaleTieuTamActions` vào actions registry (import từ `server/host-adapter.ts`).
6. **Events**: subscribe 3 topic qua `soulSaleEventHandlers`; nối `emit` của routes vào outbox host.
7. **FE**: copy `fe/page.tsx` → `apps/web/app/soul-sale/page.tsx`, thêm nav (icon `target`, group "Kinh doanh").
8. **Kích hoạt org**: `POST /api/v1/soul-sale/setup` (idempotent) + cron đêm gọi `POST /automation/run` per-org.
9. **Kiểm chứng**: loader log `Từ chối 0`; `GET /health` 200; `pnpm tsx scripts/audit-module-docs.mts` pass; trang `/soul-sale` hiển thị.
