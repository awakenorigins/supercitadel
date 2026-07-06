# SOUL-INVENTORY v2.0 — Hướng dẫn cài đặt & vận hành (GUIDE)

> Dành cho **host SuperCitadel** (dev tích hợp) và **Tiểu Tâm**.
> Mục tiêu: gắn vào là chạy — plug and play với SuperCitadel v10.0.1.

---

## 1. Yêu cầu môi trường

| Thành phần | Phiên bản | Ghi chú |
|---|---|---|
| Node.js | >= 20 | ESM |
| PostgreSQL | >= 14 | gen_random_uuid() builtin |
| Drizzle ORM | >= 0.36 | Driver bất kỳ (node-postgres, pglite...) |
| Zod | >= 3.23 | Validate tại biên |
| xlsx (SheetJS) | >= 0.18 | Nhập/xuất Excel — dependency duy nhất thêm ở v2 |

**Bắt buộc bảo mật:** app kết nối DB bằng role **KHÔNG PHẢI superuser**. Module FORCE RLS trên cả 17 bảng — superuser luôn bypass RLS (đặc tính Postgres), vi phạm Hiến pháp #1:

```sql
CREATE ROLE citadel_app LOGIN PASSWORD '...';
GRANT USAGE ON SCHEMA public TO citadel_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO citadel_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO citadel_app;
```

## 2. Cài đặt — 3 bước

### Bước 1 — Migrations (theo thứ tự, idempotent)

```bash
psql $DATABASE_URL -f migrations/0000_init.sql           # 8 bảng nền + lot/avg_cost
psql $DATABASE_URL -f migrations/0001_rls.sql            # FORCE RLS 8 bảng nền
psql $DATABASE_URL -f migrations/0002_backfill_legacy.sql # hút inventory cũ (tự bỏ qua nếu không có)
psql $DATABASE_URL -f migrations/0003_v2_final.sql       # 9 bảng v2: UoM/BOM/reorder/LC/scrap/counters/layers
psql $DATABASE_URL -f migrations/0004_v2_rls.sql         # FORCE RLS 9 bảng v2
psql $DATABASE_URL -f migrations/0005_v2_1_automation.sql # 4 bảng automation + xyz_class
psql $DATABASE_URL -f migrations/0006_v2_1_rls.sql       # FORCE RLS bảng automation
```

Hoặc host gọi hook `onInstall(host)` — tự chạy cả bảy.

### Bước 2 — Đăng ký module

**Cách A — WIRING.patch (khuyến nghị):** `git apply modules/soul-inventory/WIRING.patch` — vá 4 điểm chạm: loader, tool-registry, actions, routes.

**Cách B — thủ công:**
```ts
import * as si from '@citadel/module-soul-inventory';

await si.onActivate({ db, bus, registry });   // 23 tools/actions + 22 intents
si.createKhoRoutes(app);                       // 9 routes nền
si.createSoulInventoryExtraRoutes(app);        // 3 routes v1.1
si.createSoulInventoryV2Routes(app);           // 16 routes v2
si.createSoulInventoryAutomationRoutes(app);   // 6 routes automation v2.1
```

Mount **SAU** chuỗi middleware chuẩn: `requestId -> auth -> rbac -> tenant-rls -> routes`.

### Bước 3 — Nối Tiểu Tâm

Thứ tự nạp giáo trình:
1. `manifest.json` — 29 định nghĩa (13 read `kind:"tool"` + 16 write `kind:"action"` kèm sensitive/securityLevel), permissions, store
2. `docs/TOOLS.md` — cách gọi từng cái, hội thoại mẫu, bảng mã lỗi 15 codes
3. `docs/TUTORIAL.md` — 19 bài dẫn tour người dùng + checklist onboarding
4. `docs/EVENTS.md` — 26 events để chủ động (nghe kho.stock.low + kho.automation.ran)
5. `src/intents.ts` — 28 patterns Việt/Anh

**Dry-run→confirm (QUAN TRỌNG):** actions `sensitive: true` host thực thi qua `executeAction` (src/contract.ts):
- Lượt 1 (chưa confirm) → trả `{dry_run: true, message, input}` — KHÔNG ghi DB, audit 'dryrun'
- Tiểu Tâm đọc preview cho người dùng → đồng ý → gọi lại `{...input, confirm: true}` → chạy thật, audit 'ok'/'error'
- Mỗi action trả `message` tiếng Việt sẵn — Tiểu Tâm đọc lại, không tự soạn số liệu

## 3. Ngữ cảnh tenant (QUAN TRỌNG)

```ts
await db.transaction(async (tx) => {
  await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
  const ctx = { db: tx, orgId, userId, bus };
  await tool.handler(ctx, input);
});
```

**Fail-closed:** quên set org → query lỗi ngay (không lộ dữ liệu). Đây là hành vi đúng thiết kế.

## 3b. Scheduler — automation KHÔNG tự chạy ngầm (v2.1)

Module **không spawn cron nội bộ** (giữ plug-and-play + minh bạch). Host chọn một trong hai:

```ts
// Cách 1 — host cron (khuyến nghị): chạy mỗi đêm cho từng org active
import { runScheduledTasks } from '@citadel/module-soul-inventory';
cron.schedule('0 2 * * *', async () => {
  for (const orgId of await activeOrgs()) {
    await withTenant(orgId, (ctx) => runScheduledTasks(ctx));
  }
});
// Cách 2 — Tiểu Tâm gọi action kho.automation.run khi người dùng yêu cầu
```

Pipeline mỗi lần chạy: demand stats → forecast (MA/SES) → cập nhật safety stock + reorder point → quét cảnh báo bổ hàng + hàng chết. Mọi lần chạy ghi `kho_automation_runs` (task, items_touched, findings) — không có chuyện "chạy ngầm im lặng". Automation chỉ TÍNH TOÁN + ĐỀ XUẤT, không bao giờ tự tạo đơn mua hay tự trừ tồn.

## 4. Golden path v2.0 (đủ cả bán lẻ + sản xuất)

```
 1. item.upsert       BIA-333 (lon, barcode) + SUA-TH (track_lot)
 2. uom.upsert        1 thùng = 24 lon, barcode thùng riêng
 3. receive           2 thùng @240k → tự thành 48 lon @10k (PNK-)
 4. receive           sữa 3 lô khác hạn dùng
 5. picking.suggest   xuất 35 → kế hoạch FEFO lô cận hạn trước
 6. issue             theo plan từng lô (PXK-)
 7. bom.upsert        giỏ quà = 1 rượu + 2 bánh
 8. bom.info          max_buildable
 9. assembly.execute  lắp 3 giỏ → backflush NL + giá vốn tự tính (LSX-)
10. reorder.rule      min 60 / max 200 / NCC Sabeco
11. reorder.suggest   → đặt 152 lon
12. landed_cost.apply 96k ship vào PNK- → avg_cost +2k/lon (LC-)
13. stock.scrap       5 hộp vỡ → SCR- + loss_value
14. abc.run           phân lớp A/B/C
15. analytics.report  aging + cycle count due
16. excel import/export danh mục, tồn đầu kỳ, báo cáo
--- v2.1 AUTOMATION ---
17. replenish.params_set  service 95%, lead 7d, order_cost → SS/ROP/EOQ tự tính
18. automation.run        pipeline: stats → forecast → cập nhật ROP → cảnh báo
19. replenish.suggest     hàng chạm ROP → đề xuất đặt theo EOQ
20. forecast.projected    days_to_stockout + risk high/medium/low
21. xyz.run               ma trận ABC-XYZ 9 ô + chiến lược
22. analytics.dead_stock  hàng ế + vốn đọng
```

## 5. Đối chiếu chứng từ VN

| Nghiệp vụ | Chứng từ | Doc prefix |
|---|---|---|
| receive | Phiếu nhập kho 01-VT | PNK- |
| issue | Phiếu xuất kho 02-VT | PXK- |
| stocktake | Biên bản kiểm kê 05-VT | KK- |
| stock_card | Sổ chi tiết vật liệu S10-DN | — |
| assembly | Lệnh sản xuất / tháo dỡ | LSX- / LTD- |
| landed cost | Chứng từ phân bổ chi phí | LC- |
| scrap | Biên bản hủy | SCR- |
| avg_cost | Giá vốn bình quân gia quyền | — |

## 6. Store & phân phối

Manifest khai store: **mua vĩnh viễn 1.000 Ôm** / **thuê 150 Ôm mỗi 30 ngày**, trial 7 ngày. Host store đọc `manifest.store.pricing` để hiển thị và xử lý qua ví Ôm — module không tự xử lý tiền.

## 7. Kiểm thử & audit

```bash
npm install
npm run test:smoke   # 34 — golden path nền + RLS cross-tenant (role non-superuser)
npm run test:v11     # 27 — lot/serial/expiry, avg cost, backfill
npm run test:v2      # 53 — UoM, BOM, FEFO, reorder, LC, scrap, ABC, Excel, RLS bảng mới
npm run test:v21     # 34 — automation: SS/ROP/EOQ, forecast MA+SES, projected, XYZ, dead stock, RLS
npm run audit        # hợp đồng 8 mặt cắt -> AUDIT_REPORT.md
```

## 8. FAQ

**Q: LOT_REQUIRED khi nhập/xuất?** Item bật track_lot/track_serial — truyền lot_no/serial_no. Gợi ý: xuất hàng lô nên chạy picking.suggest trước.
**Q: unrecognized configuration parameter "app.current_org_id"?** Transaction chưa set org — middleware tenant chưa chạy. Fail-closed đúng thiết kế.
**Q: UOM_NOT_FOUND?** Đơn vị chưa khai — kho.uom.upsert trước, hoặc bỏ field uom để dùng đơn vị gốc.
**Q: Muốn tồn âm?** Không hỗ trợ (CHECK + guard SQL) — chống lệch sổ.
**Q: Số trả về "30.000"?** Numeric scale 3 giữ string — format khi hiển thị, so sánh theo giá trị.
**Q: Module cũ inventory?** conflicts:["inventory"] — host disable module cũ; data đã backfill ở 0002.
**Q: Import Excel lại 2 lần có nhân đôi tồn?** CÓ với import-stock (mỗi lần = một lần nhập thật). Import danh mục thì idempotent theo SKU. Chỉ import tồn đầu kỳ MỘT lần.
