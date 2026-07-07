# SOUL-RESTAURANT — INSTALL.md

## Yêu cầu
- Node ≥ 20, PostgreSQL 16 (host SuperCitadel đã có), Drizzle ORM, Hono.
- Role kết nối DB **không superuser** (FORCE RLS mới hiệu lực).
- Tùy chọn: Soul-Inventory (để tự trừ kho — không bắt buộc).

## 1. Đặt module & cài đặt

```bash
# giải nén / copy vào repo host
modules/soul-restaurant/
npm install            # trong thư mục module (standalone)
npm run typecheck && npm run test && npm run audit
```

## 2. Migrations (idempotent)

`onInstall` của module tự chạy, hoặc chạy tay theo thứ tự:

```bash
psql $DATABASE_URL -f modules/soul-restaurant/migrations/0000_init.sql        # 18 bảng gốc
psql $DATABASE_URL -f modules/soul-restaurant/migrations/0001_rls.sql         # FORCE RLS 18
psql $DATABASE_URL -f modules/soul-restaurant/migrations/0002_v1_1_loyalty.sql # +4 bảng KM/khách + ALTER
psql $DATABASE_URL -f modules/soul-restaurant/migrations/0003_v1_1_rls.sql     # FORCE RLS 4 bảng mới
```

Mọi lệnh `IF NOT EXISTS` / `DROP POLICY IF EXISTS` — chạy lại vô hại. DDL và
RLS tách file theo chuẩn hệ thống.

## 3. Wiring vào host — 4 điểm chạm (chi tiết: `WIRING.patch`)

```bash
git apply modules/soul-restaurant/WIRING.patch   # hoặc sửa tay 4 chỗ dưới
```

Host dùng **transactional outbox** (`emitEvent(tx, {orgId, topic, payload})` từ
`@citadel/core`) — module ghi event TRONG cùng transaction nghiệp vụ (atomic).

1. **Routes** — `services/api/src/modules/loader.ts`:
   ```ts
   import { buildSoulRestaurantRoutes } from '@citadel/module-soul-restaurant/server/host-adapter.js';
   import { emitEvent } from '@citadel/core';
   const restoEmitTx = (tx, topic, payload) =>
     emitEvent(tx, { orgId: (payload as any).org_id, topic, payload });

   BUILDERS['soul-restaurant'] = (d) => buildSoulRestaurantRoutes({
     db: d.db, requireAuth: d.requireAuth,
     gate: d.requireModule(d.db, 'soul-restaurant'),
     audit: d.audit, emitTx: restoEmitTx,
   });
   // mount: /api/v1/soul-restaurant/*
   ```
2. **Read tools cho Tiểu Tâm** — `services/api/src/index.ts` (cạnh soulInventoryTools):
   ```ts
   try { soulRestaurantTools(getDb()).forEach((t) => toolRegistry.register(t as any)); } catch (e) { /* idempotent */ }
   ```
3. **Write actions cho Tiểu Tâm** — `services/api/src/tieu-tam/actions.ts`:
   ```ts
   defs.push(...(soulRestaurantTieuTamActions(restoEmitTx) as unknown as TieuTamAction[]));
   //                                         ^^^^^^^^^^^ BẮT BUỘC truyền emitTx
   // để resto.stock.deduct_requested vào outbox → Soul-Inventory trừ kho.
   // Không truyền → bus noop: thao tác vẫn đúng nhưng KHÔNG tự trừ kho.
   ```
4. **Subscriber trừ kho** — `services/api/src/outbox.ts#registerBuiltinOutboxSubscribers`
   (mẫu đầy đủ trong WIRING.patch): `subscribeOutbox('resto.stock.deduct_requested', …)`
   → lặp `lines` gọi `kho.stock.issue` của Soul-Inventory trong 1 transaction
   (all-or-nothing; outbox retry ≤5 nếu cả handler fail).

   **Manifest**: loader đọc `modules/soul-restaurant/manifest.json`
   (id `soul-restaurant`, conflicts `["restaurant"]` — gỡ module restaurant cũ nếu có).

## 4. Nối trừ kho Soul-Inventory (tùy chọn nhưng nên)

Đăng ký subscriber theo mẫu trong `docs/EVENTS.md` (đoạn cuối WIRING.patch):
`resto.stock.deduct_requested` → lặp `lines` → `kho.stock.issue`. Nhớ
idempotency key `(org_id, order_code, trigger)` nếu bus có retry.

## 5. Kiểm tra pre-flight (bắt buộc trước khi bật)

```bash
# 1) Không đụng prefix bảng của module khác (bài học sm_* vs hr_*)
psql $DATABASE_URL -c "SELECT tablename FROM pg_tables WHERE tablename LIKE 'resto_%';"
# → phải RỖNG trước khi migrate (hoặc chỉ chứa bảng của chính module này khi re-run)

# 2) Role app không superuser / không BYPASSRLS
psql $DATABASE_URL -c "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;"

# 3) Sau khi bật: smoke nhanh
curl -H "Authorization: Bearer $JWT" $HOST/api/v1/soul-restaurant/settings
curl -H "Authorization: Bearer $JWT" $HOST/api/v1/soul-restaurant/tables/map
```

## 6. Cửa hàng

`manifest.module.json` đã đủ điều kiện lên kệ (docs 4 thành phần ⑧):
**Mua 1.000 Ôm · Thuê 150 Ôm/30 ngày · Dùng thử 7 ngày.**

## Gỡ module

`onDisable` thu hồi sạch tool/intent/route — dữ liệu giữ nguyên.
`onRemove({ dropData: true })` mới xóa 22 bảng (CASCADE).

### Bảng điều khiển (tùy chọn)
Mount `web/RestaurantConsole.tsx` tại `/restaurant` trong apps/web, hoặc để UI bất kỳ đọc
`GET /api/v1/soul-restaurant/capabilities` rồi tự dựng nút. Xem `web/README.md`. Không cần
migration thêm cho v1.2 (dashboard/fire-course dùng cột `course_no` sẵn có).
