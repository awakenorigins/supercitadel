# SOUL-RESTAURANT — AUDIT_REPORT.md

**Kết quả: 58/58 checks đạt** · sinh bởi `npm run audit` · 2026-07-07T12:08:45.255Z

## ① Manifest — nguồn sự thật
✅ id/version khớp giữa 2 manifest
✅ Permissions đồng nhất core↔store (21)
✅ Mọi permission store có description + actions
✅ Store listing đủ: pricing buy/rent/trial + tagline + highlights
✅ Conflicts khai module restaurant cũ
✅ Docs đủ 4 thành phần (readme/guides/examples ⑧)
✅ Hooks đủ 4 pha vòng đời ②

## ⑥ Tools — registry thật ↔ manifest
✅ Registry: 31 năng lực (12 read + 19 action)
✅ Manifest tools = 42 == 42
✅ Parity tên+kind+permission: 42/42
✅ Mọi tool registry có schema + mô tả + docs path
✅ 5 action lớp 2 đúng danh sách
✅ Mọi permission tool nằm trong manifest permissions

## ⑧ Docs — giáo trình Tiểu Tâm
✅ TOOLS.md phủ 42/42 năng lực, anchor khớp manifest
✅ TOOLS.md có mục công thức tiền (nguồn duy nhất)
✅ Có README.md
✅ Có CHANGELOG.md
✅ Có docs/GUIDE.md
✅ Có docs/TUTORIAL.md
✅ Có docs/INSTALL.md
✅ Có docs/EVENTS.md
✅ Có WIRING.patch

## Routes — 31 endpoint sống
✅ Manifest routes 43 == 43 và có handler thật 43/43
✅ src/routes.ts không có endpoint ngoài manifest (43 == 43)
✅ Mọi route POST parse Zod tại biên ⑦

## Intents — 20 mẫu câu Việt/Anh
✅ Registry intents = 30 == 30
✅ Mọi intent trỏ tool tồn tại + có patterns VI + ví dụ
✅ Manifest trỏ đúng file intents

## ⑤ Events — bản khai ↔ code
✅ Mọi event code phát đều khai trong manifest (38/38)
✅ Mọi event manifest khai đều có code phát (38/38)
✅ Mọi topic đúng format outbox host (domain.entity.verb)
✅ Có cầu nối trừ kho resto.stock.deduct_requested
✅ Không import chéo module khác (cấm gọi thẳng ⑤)

## ④ Dữ liệu một khuôn + RLS fail-closed
✅ 22 bảng resto_* trong DDL (22)
✅ Mọi bảng có org_id uuid NOT NULL (hoặc PRIMARY KEY)
✅ Mọi bảng có index dẫn đầu org_id (22/22)
✅ Drizzle schema khớp DDL (22/22)
✅ RLS: ENABLE 22/22 · FORCE 22/22 · POLICY 22/22 · GUC 46
✅ RLS KHÔNG có coalesce fallback trong policy (fail-closed)
✅ Migration idempotent (IF NOT EXISTS + DROP POLICY IF EXISTS)

## Số học BigInt + org_id tường minh trong service
✅ 12/12 service không Number() trên tiền + lọc org tường minh (12/12, 234 chỗ dùng ctx.orgId)
✅ money.ts là nguồn số học duy nhất (BigInt)

## Bí mật & scripts
✅ Không secret nào trong src/server/scripts
✅ package.json đủ scripts typecheck/test/audit
✅ Module standalone: không dependency @citadel/core

## UI · Bảng điều khiển phủ đủ nút (không nút chết)
✅ Catalog UI = 42 mục == 42 năng lực
✅ Mọi tool có nút trên bảng điều khiển (42/42, 1:1)
✅ Mọi mục UI trỏ tool tồn tại (không nút thừa)
✅ Mọi mục UI khớp kind của tool
✅ Mọi nút UI ánh xạ đúng route trong manifest
✅ Mọi nhóm nút đã khai trong UI_GROUPS
✅ Có endpoint /capabilities phục vụ UI render động
✅ Có web/RestaurantConsole.tsx
✅ Có web/soul-restaurant-console.html
✅ Có web/api-client.ts
✅ Có web/README.md
✅ Console React render từ catalog (tham chiếu restoUiCatalog)
✅ Demo HTML nhúng đủ 42 mục năng lực

---
Đối chiếu: manifest(①) · lifecycle hooks(②) · permission(③ qua ⑥) · dữ liệu+RLS(④) · event-only(⑤) · tool chuẩn(⑥) · Zod tại biên(⑦) · docs giáo trình(⑧).
Smoke test riêng: `npm run test` → 95/95 trên PGlite.
