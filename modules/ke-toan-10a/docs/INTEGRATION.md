# KẾ TOÁN 10A — GẮN VÀO SUPERCITADEL R10 (strict loader + outbox) — 6 mối nối

> Áp cho repo HEAD (≥ v10.0.1 — Store Group Hotfix). Từ R9, **catalog + mount + loader-status tự động lấy từ `manifest.json` hợp lệ** — KHÔNG hardcode catalog cho module thật. Manifest 10A đã đúng schema v2 (đã PASS `scripts/audit-manifests.mts` gốc), permission dạng `module.resource.action`, `engine ^1.0.0`, và `group: "Tài chính"` (v10.0.1) để đứng cùng nhóm với module Kế Toán cũ trong Cửa hàng.

**Bước 0 — copy:** thư mục gói này → `modules/ke-toan-10a/` · file `web/page.tsx` → `apps/web/app/ke-toan-10a/page.tsx`. Workspace pnpm tự nhận `modules/*`.

> Schema Postgres riêng `ketoan10a` — không đụng `acc_*` hay bất kỳ module nào; chạy song song module Kế Toán cũ.

---

### 1. Registry quyền — `packages/core/src/permissions.ts` ⚠️ LÀM TRƯỚC TIÊN
Validator manifest tra từng permission trong `PERMISSION_REGISTRY` — **thiếu bước này loader sẽ từ chối module** (`permission … chưa có trong PERMISSION_REGISTRY`).

**a)** Thêm 16 entry vào mảng `PERMISSION_REGISTRY` (khớp `KE_TOAN_10A_PERMISSIONS` export từ gói):
```ts
  // ── Kế Toán 10A ──
  p('ke-toan-10a.receipt.create','Kế Toán 10A — Tạo phiếu thu',2,true),
  p('ke-toan-10a.payment.create','Kế Toán 10A — Tạo phiếu chi',2,true),
  p('ke-toan-10a.invoice.create','Kế Toán 10A — Tạo hóa đơn bán/mua',2,true),
  p('ke-toan-10a.invoice.collect','Kế Toán 10A — Thu tiền theo hóa đơn',2,true),
  p('ke-toan-10a.advance.create','Kế Toán 10A — Tạm ứng/đặt cọc',2,true),
  p('ke-toan-10a.recurring.create','Kế Toán 10A — Đặt giao dịch định kỳ',2,true),
  p('ke-toan-10a.recurring.run','Kế Toán 10A — Chạy giao dịch định kỳ',2,true),
  p('ke-toan-10a.credit.limit-set','Kế Toán 10A — Đặt hạn mức tín dụng',2,true),
  p('ke-toan-10a.bank.reconcile','Kế Toán 10A — Đối chiếu ngân hàng',2,true),
  p('ke-toan-10a.asset.create','Kế Toán 10A — Ghi nhận TSCĐ',2,true),
  p('ke-toan-10a.asset.depreciate','Kế Toán 10A — Chạy khấu hao',2,true),
  p('ke-toan-10a.fx.revalue','Kế Toán 10A — Đánh giá lại tỷ giá',2,true),
  p('ke-toan-10a.period.close','Kế Toán 10A — Kết chuyển & khóa niên độ',2,true),
  p('ke-toan-10a.budget.set','Kế Toán 10A — Đặt ngân sách'),
  p('ke-toan-10a.budget.read','Kế Toán 10A — Xem ngân sách vs thực tế'),
  p('ke-toan-10a.report.read','Kế Toán 10A — Xem báo cáo nhanh'),
```
**b)** Manager toàn quyền module — thêm wildcard vào `ROLE_PERMISSIONS`:
```ts
manager: [ …giữ nguyên…, 'ke-toan-10a.*'],
```
*(Muốn staff xem báo cáo nhanh: thêm `'ke-toan-10a.report.read'` vào mảng staff.)*

### 2. Strict loader — `services/api/src/modules/loader.ts`
Catalog, mount `/api/v1/ke-toan-10a`, và `loader-status` sẽ **tự động** khi thêm builder:

**a) Import** (cạnh `buildAccountingRoutes`):
```ts
import { buildKeToan10aRoutes } from '@citadel/module-ke-toan-10a/server/routes.js';
```
**b) Entry trong map `builders`** (ngay sau dòng `accounting:`):
```ts
  'ke-toan-10a': (d) => buildKeToan10aRoutes({
    db: d.db, requireAuth: d.requireAuth,
    gate: d.requireModule(d.db, 'ke-toan-10a'),
    audit: d.audit,
    // đảo phiếu thu/chi = nhạy cảm → tái dùng cancelGate lớp 2 của host
    reverseGate: d.cancelGate,
  }),
```
Loader sẽ đọc `modules/ke-toan-10a/manifest.json`, validate v2, mount route từ `manifest.routes`, đưa vào catalog Cửa hàng (tier paid · 700 Om), và hiện trong `GET /api/v1/modules/loader-status`.

*(Tùy chọn realtime: thêm `publish: async (e) => fetch(WS_INTERNAL + '/internal/publish', …)` vào deps builder — module bắn `k10a.depreciation.posted / recurring.generated / bank.rules_applied / credit_limit.blocked`, lỗi tự nuốt.)*

### 3. Tiểu Tâm write-actions (dry-run) — `services/api/src/tieu-tam/actions.ts`
Khuôn v8.5 giữ nguyên ở R10.
```ts
import { keToan10aTieuTamActions, detectK10aAction } from '@citadel/module-ke-toan-10a/server/tieu-tam-actions.js';
```
Sau mảng `const defs: TieuTamAction[] = [ … ];`:
```ts
defs.push(...(keToan10aTieuTamActions(getDb()) as unknown as TieuTamAction[]));
```
17 action `k10a.*` mang sẵn `permission/securityLevel/sensitive/parameters` — `executeAction` host tự lo gate → RBAC → lớp bảo mật → **dry-run preview → confirm**, audit `tieu_tam.action_dryrun`/`tieu_tam.action`.
*(Tùy chọn lệnh nhanh)* — đầu hàm `detectAction()`:
```ts
const k10a = detectK10aAction(message); if (k10a) return k10a;
```
Mọi regex 10A **đòi chữ "10a"** trong câu → không giẫm `acc.*` module cũ.

### 4. Read-tools cho Tiểu Tâm — `services/api/src/index.ts`
Cạnh dòng `crmTools(getDb())…`:
```ts
import { keToan10aTools } from '@citadel/module-ke-toan-10a/server/tools.js';
try { keToan10aTools(getDb()).forEach((t) => toolRegistry.register(t)); } catch (e) { /* idempotent */ }
```

### 5. Auto-migrate — `deploy.sh`
```sh
for m in chat notification crm om inventory hr accounting ke-toan-10a; do
```
Migration `modules/ke-toan-10a/migrations/0000_init.sql` là SQL thuần idempotent (tự tạo schema `ketoan10a`).

### 6. Frontend + tour
- Copy `web/page.tsx` → `apps/web/app/ke-toan-10a/page.tsx` (auto-setup TT133 lần đầu — khách mua xong mở trang là chạy). Sau copy: `pnpm --filter web typecheck` (gói không chứa Next — khai báo trung thực).
- Thêm tour vào `apps/web/components/Tutorial.tsx` → `TOURS`:
```ts
'/ke-toan-10a': { id: 'ke-toan-10a-v1', steps: [
  { title: 'Kế Toán 10A 🧾', text: 'Sổ kép hoàn chỉnh chạy độc lập — thao tác tại đây hoặc ra lệnh Tiểu Tâm.' },
  { sel: '[data-tut="k10a-kpi"]', title: 'Nhịp tim tài chính', text: 'Tiền, phải thu/trả, lãi lỗ — badge SỔ CÂN xác nhận Σ Nợ = Σ Có.' },
  { sel: '[data-tut="k10a-quy"]', title: 'Sổ quỹ', text: 'Phiếu thu/chi 5 giây; sai thì Đảo (bút toán ngược, không xóa).' },
  { sel: '[data-tut="k10a-hd"]', title: 'Hóa đơn & công nợ', text: 'Kèm thuế GTGT; Thu tiền cấn trừ, chặn thu vượt nợ.' },
  { sel: '[data-tut="k10a-bank"]', title: 'Đối chiếu ngân hàng', text: 'Dán sao kê CSV — tự khớp với sổ, báo dòng lệch.' },
  { sel: '[data-tut="k10a-report"]', title: 'Báo cáo & Excel', text: 'KQKD, cân đối thử, Excel, toàn vẹn sổ; cuối năm kết chuyển 911→421.' },
  { sel: '[data-tut="k10a-demo"]', title: 'Dữ liệu mẫu', text: 'Bấm để sinh nghiệp vụ mẫu, khám phá thoải mái.' },
] },
```

---

## Outbox R10 — trạng thái của 10A
Manifest v1.0.0 **chưa khai `events`** (trường optional — loader chấp nhận). Realtime tức thời đã có qua `deps.publish` (mục 2). Khi cần liên-module (vd Notification subscribe hóa đơn 10A), bản 10A.1 sẽ thêm `emitEvent(tx, { topic: 'ke-toan-10a.invoice.created', … })` trong transaction service + khai `events.emits` — đúng contract mục 6 của FORGE-GUIDE v2.1.

## Kiểm chứng sau khi gắn
```bash
pnpm install
pnpm --filter @citadel/api exec tsx ../../scripts/audit-manifests.mts    # [manifest] OK ke-toan-10a v1.0.0 · PASSED 8/8
pnpm --filter @citadel/api exec tsx ../../scripts/audit-module-docs.mts  # ✓ ke-toan-10a
pnpm -r typecheck && pnpm -r test && pnpm -r build                       # module test = PGlite 13 ✓, không cần PG ngoài
bash deploy.sh
```
Live: `GET /api/v1/modules` thấy Kế Toán 10A trong catalog (từ manifest, nhóm **Tài chính**) · `GET /api/v1/modules/loader-status` (owner) liệt kê `ke-toan-10a v1.0.0` ở `loaded` · mua 700 Om → mở `/ke-toan-10a` tự seed → hỏi Tiểu Tâm *"tạo phiếu thu 10a 2 triệu từ Anh Ba"* → thẻ xem trước → Xác nhận → vào sổ. Tắt module → 403 `MODULE_INACTIVE`; bật lại → dữ liệu nguyên (test tự động `tests/store-flow.ts` đã chứng minh).
