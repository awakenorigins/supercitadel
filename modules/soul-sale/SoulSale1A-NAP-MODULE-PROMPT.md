# NẠP-MODULE: Soul-Sale 1A vào SuperCitadel (>=11.4.0)

> Prompt này dành cho AI agent làm việc TRONG repo SuperCitadel. Làm đúng 8 beat, **mỗi beat chạy lệnh kiểm chứng thật** trước khi sang beat kế. Không mô tả suông. Nếu một beat fail — dừng, sửa, chạy lại, rồi mới đi tiếp.

**Gói đầu vào:** `soul-sale-1a.zip` (module tự đủ: src/server/tests/migrations/docs/fe/integration/scripts).

---

## Beat 1 — Giải nén & test độc lập
```bash
mkdir -p modules/soul-sale && unzip -o soul-sale-1a.zip -d modules/soul-sale
cd modules/soul-sale && npm install && npm test && npx tsc --noEmit
```
**Gate:** 9 suite in `102/102`-tổng (17+14+11+15+9+9+6+10+11), typecheck 0 lỗi. Fail ở đây = gói hỏng, dừng.

## Beat 2 — Nạp 21 permission
Mở `modules/soul-sale/integration/permissions-block.ts`, copy khối `p(...)` vào `PERMISSION_REGISTRY` trong `packages/core/src/permissions.ts` (đặt cạnh block các module soul-* khác). Thêm `'soulsale.*'` vào wildcard của role **manager** (tìm nơi các module khác thêm wildcard — làm y hệt).
**Gate:**
```bash
cd modules/soul-sale && npx tsx scripts/validate-manifest.mts
```
Phải in `✅ validateManifest PASS`. *Lưu ý: script này tự inject key để mô phỏng — sau khi mày đã chèn thật vào permissions.ts thì có thể xoá phần inject trong script, kết quả vẫn phải PASS.*

## Beat 3 — Migrations
Chạy 2 file theo thứ tự bằng migration-runner của host (tách câu theo `--> statement-breakpoint`):
`modules/soul-sale/migrations/0000_init.sql` → `0001_rls.sql`.
**Gate:** `psql -c "\dt soulsale.*" | wc -l` ≈ 38 bảng; `SELECT relrowsecurity FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE nspname='soulsale' AND relkind='r' AND NOT relrowsecurity;` → **0 dòng**.

## Beat 4 — Mount routes vào loader
Trong `services/api/src/modules/loader.ts`, đăng ký theo đúng pattern các module soul-* hiện có:
```ts
import { buildSoulSaleRoutes } from '../../../../modules/soul-sale/server/host-adapter.js';
// trong danh sách module:
app.route('/api/v1/soul-sale', buildSoulSaleRoutes({ db, requireAuth, gate, audit, emit }));
```
`requireAuth` phải set `c.set('auth', payload)` với `{sub, org_id, roles}`; `gate(perm)` là RBAC middleware của host; `emit(orgId, topic, payload)` nối outbox.
**Gate:** khởi động API — log loader phải có `soul-sale` và **`Từ chối 0`** (0 module bị reject). Nếu bị từ chối: xem Troubleshooting.

## Beat 5 — Đăng ký Tiểu Tâm (23 tools + 34 actions)
Nơi host đăng ký tool/action các module khác (`toolRegistry` + `services/api/src/tieu-tam/actions.ts`):
```ts
import { soulSaleTools, soulSaleTieuTamActions } from '../../../../modules/soul-sale/server/host-adapter.js';
for (const t of soulSaleTools) registerTool(t);
for (const a of soulSaleTieuTamActions) registerAction(a);
```
**Gate:** `curl -H "Authorization: Bearer $TOKEN" localhost:3001/api/v1/soul-sale/tools | jq length` → `23`; `/actions` → `34`.

## Beat 6 — Events
Subscribe 3 topic qua bus của host:
```ts
import { soulSaleEventHandlers, SOUL_SALE_SUBSCRIBES } from '../../../../modules/soul-sale/server/host-adapter.js';
for (const topic of SOUL_SALE_SUBSCRIBES) bus.subscribe(topic, (evt) => soulSaleEventHandlers[topic]({ db }, evt));
```
**Gate:** publish thử `accounting.payment.created` với payload `{soulsale_order_id:'<uuid bất kỳ>'}` cho 1 org → `SELECT * FROM soulsale.ss_inbox_events` có 1 dòng `processed=true` đúng org.

## Beat 7 — FE + cron + setup
1. `cp modules/soul-sale/fe/page.tsx apps/web/app/soul-sale/page.tsx`; thêm nav item (label "Soul-Sale", icon `target`, group "Kinh doanh") đúng chỗ các module soul-* khác.
2. Cron đêm per-org gọi `POST /api/v1/soul-sale/automation/run`.
3. Khi activate module cho một org: gọi `POST /api/v1/soul-sale/setup` (idempotent).
**Gate:** `next build` (hoặc dev) không lỗi trang soul-sale.

## Beat 8 — Nghiệm thu sống
```bash
npx tsx scripts/audit-module-docs.mts        # từ repo root — soul-sale PASS
cd modules/soul-sale && npm run audit         # self-audit + validate-manifest PASS
```
Bump số module trong test loader của host (vd `loaded.length` trong v9.test.ts: +1) rồi chạy test host.
**Live acceptance (bằng TOKEN manager của một org thật):**
1. `POST /setup` → 200.
2. `POST /actions/soulsale.agency.create` `{name:"NPP Smoke",level:1,confirm:true?}` (L1 — không cần confirm) → có `code KH-...`.
3. `POST /actions/soulsale.price.rule-set` `{productCode:"SMK",unitPrice:"100000"}` KHÔNG confirm → nhận `dry_run:true` + preview; gọi lại `confirm:true` → ghi thật.
4. `POST /actions/soulsale.order.create` (+items) rồi `soulsale.order.confirm` dry-run → preview công nợ; confirm → `status:"confirmed"`; kiểm `SELECT * FROM soulsale.ss_action_audit` có `dryrun` + `ok`.
5. Mở `/soul-sale` trên web → 5 tab hiển thị, dữ liệu smoke hiện ra.

---

## Troubleshooting loader-rejection
| Triệu chứng | Nguyên nhân thường gặp | Sửa |
|---|---|---|
| `permission không tồn tại: soulsale.*` | Beat 2 chưa chèn / chèn sau khi permSet snapshot | Chèn vào `permissions.ts` rồi restart API |
| `engine mismatch` | Host < 11.4.0 | Nâng host hoặc dừng — module không hạ cấp |
| `icon không hợp lệ` | Registry icon host đổi | Đổi `manifest.json → icon` sang icon có thật (giữ `target` nếu còn) |
| `duplicate route /api/v1/soul-sale` | Mount 2 lần trong loader | Giữ 1 dòng `app.route` duy nhất |
| `Cannot find module host-adapter.js` | Sai độ sâu đường dẫn import | Đếm lại `../` từ vị trí loader tới `modules/soul-sale/server/` |
| 401 mọi route | `requireAuth` không set `c.set('auth')` đúng shape `{sub, org_id}` | Bọc middleware host cho khớp |
| `VALIDATION` khi gọi action | Body thiếu field zod bắt buộc | Đọc `docs/TOOLS.md` — hợp đồng tham số từng action |

## Definition of Done ✅
- [ ] Beat 1: 102/102 + typecheck 0 lỗi trong `modules/soul-sale`
- [ ] Beat 2: 21 permission trong registry, `validate-manifest` PASS
- [ ] Beat 3: 38 bảng schema `soulsale`, RLS bật 100%
- [ ] Beat 4: loader log `Từ chối 0`, `GET /health` 200
- [ ] Beat 5: `/tools`=23, `/actions`=34 qua HTTP
- [ ] Beat 6: inbox nhận event đúng org, `processed=true` khi có `soulsale_order_id`
- [ ] Beat 7: trang `/soul-sale` build & render, cron + setup nối xong
- [ ] Beat 8: audit repo PASS, self-audit PASS, live acceptance 5 bước xanh, audit-trail `dryrun→ok` có thật trong DB
