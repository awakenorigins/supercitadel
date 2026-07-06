# AUDIT REPORT — @citadel/module-kho v2.1.0

> audit-module-docs · 2026-07-05T23:33:54.559Z · **144 PASS / 0 FAIL**

## ① Manifest

| Kiểm tra | Kết quả |
|---|---|
| manifest.json parse được | ✅ PASS |
| có trường "id" | ✅ PASS |
| có trường "name" | ✅ PASS |
| có trường "version" | ✅ PASS |
| có trường "description" | ✅ PASS |
| có trường "permissions" | ✅ PASS |
| có trường "tools" | ✅ PASS |
| có trường "intents" | ✅ PASS |
| có trường "routes" | ✅ PASS |
| có trường "docs" | ✅ PASS |
| có trường "hooks" | ✅ PASS |
| version đúng semver | ✅ PASS |
| khai ≥5 tools (thực tế 29) | ✅ PASS |
| dependencies/conflicts khai tường minh | ✅ PASS |
| conflicts khai module inventory cũ | ✅ PASS |

## ① Store

| Kiểm tra | Kết quả |
|---|---|
| store entry tồn tại và listed | ✅ PASS |
| giá MUA đúng 1000 Ôm — _buy=1000 om_ | ✅ PASS |
| giá THUÊ đúng 150 Ôm / 30 ngày — _rent=150/30d_ | ✅ PASS |
| có tagline + highlights cho trang cửa hàng | ✅ PASS |

## ② Vòng đời

| Kiểm tra | Kết quả |
|---|---|
| hook onInstall tồn tại | ✅ PASS |
| hook onActivate tồn tại | ✅ PASS |
| hook onDisable tồn tại | ✅ PASS |
| hook onRemove tồn tại | ✅ PASS |
| onDisable thu hồi đăng ký (unregisterModule) | ✅ PASS |
| onRemove mặc định KHÔNG drop dữ liệu (opt-in dropData) | ✅ PASS |
| contract.ts tồn tại (mirror + executeAction) | ✅ PASS |
| WIRING.patch tồn tại (gắn host một lệnh) | ✅ PASS |
| GUIDE có mục scheduler minh bạch (host cron, không tự chạy ngầm) | ✅ PASS |
| automation service KHÔNG tự spawn cron/setInterval | ✅ PASS |
| runScheduledTasks export từ index (cho host cron) | ✅ PASS |

## ③ Quyền

| Kiểm tra | Kết quả |
|---|---|
| mọi permission theo cú pháp module.resource.action — _kho.item.read, kho.item.write, kho.stock.read, kho.stock.write, kho.reservation.read, kho.reservation.write, kho.stocktake.read, kho.stocktake.write_ | ✅ PASS |
| mọi tool đều gắn permission | ✅ PASS |
| permission của tool đều được khai trong manifest.permissions | ✅ PASS |

## ④ Dữ liệu

| Kiểm tra | Kết quả |
|---|---|
| phát hiện 8 bảng trong migration — _kho_items, kho_locations, kho_stock_levels, kho_movements, kho_reservations, kho_stocktakes, kho_stocktake_lines, kho_lots_ | ✅ PASS |
| kho_items: có org_id NOT NULL | ✅ PASS |
| kho_items: có index org_id | ✅ PASS |
| kho_items: có created_at | ✅ PASS |
| kho_locations: có org_id NOT NULL | ✅ PASS |
| kho_locations: có index org_id | ✅ PASS |
| kho_locations: có created_at | ✅ PASS |
| kho_stock_levels: có org_id NOT NULL | ✅ PASS |
| kho_stock_levels: có index org_id | ✅ PASS |
| kho_stock_levels: có created_at | ✅ PASS |
| kho_movements: có org_id NOT NULL | ✅ PASS |
| kho_movements: có index org_id | ✅ PASS |
| kho_movements: có created_at | ✅ PASS |
| kho_reservations: có org_id NOT NULL | ✅ PASS |
| kho_reservations: có index org_id | ✅ PASS |
| kho_reservations: có created_at | ✅ PASS |
| kho_stocktakes: có org_id NOT NULL | ✅ PASS |
| kho_stocktakes: có index org_id | ✅ PASS |
| kho_stocktakes: có created_at | ✅ PASS |
| kho_stocktake_lines: có org_id NOT NULL | ✅ PASS |
| kho_stocktake_lines: có index org_id | ✅ PASS |
| kho_stocktake_lines: có created_at | ✅ PASS |
| kho_lots: có org_id NOT NULL | ✅ PASS |
| kho_lots: có index org_id | ✅ PASS |
| kho_lots: có created_at | ✅ PASS |

## ④ RLS

| Kiểm tra | Kết quả |
|---|---|
| kho_items: ENABLE ROW LEVEL SECURITY | ✅ PASS |
| kho_items: FORCE ROW LEVEL SECURITY | ✅ PASS |
| kho_items: policy tenant_isolation (USING + WITH CHECK) | ✅ PASS |
| kho_locations: ENABLE ROW LEVEL SECURITY | ✅ PASS |
| kho_locations: FORCE ROW LEVEL SECURITY | ✅ PASS |
| kho_locations: policy tenant_isolation (USING + WITH CHECK) | ✅ PASS |
| kho_stock_levels: ENABLE ROW LEVEL SECURITY | ✅ PASS |
| kho_stock_levels: FORCE ROW LEVEL SECURITY | ✅ PASS |
| kho_stock_levels: policy tenant_isolation (USING + WITH CHECK) | ✅ PASS |
| kho_movements: ENABLE ROW LEVEL SECURITY | ✅ PASS |
| kho_movements: FORCE ROW LEVEL SECURITY | ✅ PASS |
| kho_movements: policy tenant_isolation (USING + WITH CHECK) | ✅ PASS |
| kho_reservations: ENABLE ROW LEVEL SECURITY | ✅ PASS |
| kho_reservations: FORCE ROW LEVEL SECURITY | ✅ PASS |
| kho_reservations: policy tenant_isolation (USING + WITH CHECK) | ✅ PASS |
| kho_stocktakes: ENABLE ROW LEVEL SECURITY | ✅ PASS |
| kho_stocktakes: FORCE ROW LEVEL SECURITY | ✅ PASS |
| kho_stocktakes: policy tenant_isolation (USING + WITH CHECK) | ✅ PASS |
| kho_stocktake_lines: ENABLE ROW LEVEL SECURITY | ✅ PASS |
| kho_stocktake_lines: FORCE ROW LEVEL SECURITY | ✅ PASS |
| kho_stocktake_lines: policy tenant_isolation (USING + WITH CHECK) | ✅ PASS |
| kho_lots: ENABLE ROW LEVEL SECURITY | ✅ PASS |
| kho_lots: FORCE ROW LEVEL SECURITY | ✅ PASS |
| kho_lots: policy tenant_isolation (USING + WITH CHECK) | ✅ PASS |
| policy dùng app.current_org_id | ✅ PASS |

## ⑤ Event

| Kiểm tra | Kết quả |
|---|---|
| mọi emit đều prefix "kho." (26 event khác nhau) | ✅ PASS |
| mọi emit payload đều có org_id | ✅ PASS |
| docs/EVENTS.md tồn tại và liệt kê event | ✅ PASS |

## ⑥ Tool

| Kiểm tra | Kết quả |
|---|---|
| ≥5 tools định nghĩa trong code (thực tế 29) | ✅ PASS |
| mỗi tool có permission + inputSchema + docs + handler | ✅ PASS |
| handler validate Zod tại biên (inputSchema.parse) | ✅ PASS |
| tách read/write theo v10.0.1 (13 tool + 16 action) | ✅ PASS |
| manifest tools đều khai kind | ✅ PASS |
| mọi action khai sensitive (boolean) + securityLevel (1|2) | ✅ PASS |
| >=7 actions sensitive (dry-run protocol) — _sensitive=8_ | ✅ PASS |
| đủ 29 định nghĩa trong manifest (13 tool + 16 action) | ✅ PASS |
| tools trong code khớp 1-1 với manifest | ✅ PASS |

## ⑦ Biên

| Kiểm tra | Kết quả |
|---|---|
| routes: mutation nào cũng .parse() trước service | ✅ PASS |
| lỗi nghiệp vụ có mã máy đọc (KhoError code) | ✅ PASS |
| schemas Zod tập trung tại validation/schemas.ts | ✅ PASS |

## ⑧ Docs

| Kiểm tra | Kết quả |
|---|---|
| README.md tồn tại và không rỗng (5617 chars) | ✅ PASS |
| CHANGELOG.md tồn tại và không rỗng (5447 chars) | ✅ PASS |
| docs/GUIDE.md tồn tại và không rỗng (7844 chars) | ✅ PASS |
| docs/TOOLS.md tồn tại và không rỗng (18868 chars) | ✅ PASS |
| docs/EVENTS.md tồn tại và không rỗng (3736 chars) | ✅ PASS |
| docs/TUTORIAL.md tồn tại và không rỗng (11471 chars) | ✅ PASS |
| TOOLS.md có mục cho kho.stock.query | ✅ PASS |
| TOOLS.md có mục cho kho.stock.low_alerts | ✅ PASS |
| TOOLS.md có mục cho kho.lot.expiry_alerts | ✅ PASS |
| TOOLS.md có mục cho kho.report.stock_card | ✅ PASS |
| TOOLS.md có mục cho kho.report.summary | ✅ PASS |
| TOOLS.md có mục cho kho.picking.suggest | ✅ PASS |
| TOOLS.md có mục cho kho.bom.info | ✅ PASS |
| TOOLS.md có mục cho kho.reorder.suggest | ✅ PASS |
| TOOLS.md có mục cho kho.analytics.report | ✅ PASS |
| TOOLS.md có mục cho kho.replenish.suggest | ✅ PASS |
| TOOLS.md có mục cho kho.forecast.projected | ✅ PASS |
| TOOLS.md có mục cho kho.analytics.dead_stock | ✅ PASS |
| TOOLS.md có mục cho kho.item.upsert | ✅ PASS |
| TOOLS.md có mục cho kho.uom.upsert | ✅ PASS |
| TOOLS.md có mục cho kho.stock.receive | ✅ PASS |
| TOOLS.md có mục cho kho.stock.issue | ✅ PASS |
| TOOLS.md có mục cho kho.stock.transfer | ✅ PASS |
| TOOLS.md có mục cho kho.reservation.manage | ✅ PASS |
| TOOLS.md có mục cho kho.stocktake.execute | ✅ PASS |
| TOOLS.md có mục cho kho.bom.upsert | ✅ PASS |
| TOOLS.md có mục cho kho.assembly.execute | ✅ PASS |
| TOOLS.md có mục cho kho.reorder.rule_upsert | ✅ PASS |
| TOOLS.md có mục cho kho.stock.scrap | ✅ PASS |
| TOOLS.md có mục cho kho.landed_cost.apply | ✅ PASS |
| TOOLS.md có mục cho kho.abc.run | ✅ PASS |
| TOOLS.md có mục cho kho.replenish.params_set | ✅ PASS |
| TOOLS.md có mục cho kho.xyz.run | ✅ PASS |
| TOOLS.md có mục cho kho.automation.run | ✅ PASS |
| TOOLS.md có mục cho kho.barcode.lookup | ✅ PASS |
| TOOLS.md có ví dụ hội thoại (giáo trình Tiểu Tâm) | ✅ PASS |
| GUIDE.md có golden path + hướng dẫn cài đặt | ✅ PASS |
| README có bảng tuân thủ 8 mặt cắt | ✅ PASS |
| TUTORIAL có >=17 bài học (## Bài) — _bài=19_ | ✅ PASS |
| TOOLS.md đủ 29 định nghĩa (## kho.*) — _docs=29_ | ✅ PASS |
| TOOLS.md có 6 định nghĩa automation v2.1 | ✅ PASS |
| TOOLS.md có mục dry-run/confirm cho Tiểu Tâm | ✅ PASS |
| TUTORIAL có checklist onboarding | ✅ PASS |
| TOOLS.md có bảng mã lỗi cho Tiểu Tâm | ✅ PASS |

## Độc lập

| Kiểm tra | Kết quả |
|---|---|
| không import module Citadel khác (chỉ nhận qua DI) | ✅ PASS |
| module stateless (không giữ state RAM: không có biến let cấp module chứa dữ liệu nghiệp vụ) | ✅ PASS |

## Kết luận

**PASS toàn bộ.** Module đạt hợp đồng Citadel 8 mặt cắt, đủ điều kiện gắn vào SuperCitadel.
