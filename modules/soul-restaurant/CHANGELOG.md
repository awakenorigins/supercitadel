# CHANGELOG — Soul-Restaurant

## v1.2.0 · 2026-07-07

Khối "Bảng điều khiển vận hành (sống 100%) + Ra món theo lượt" — nâng 40→42 năng lực. KHÔNG đổi schema (không migration mới).

- **Bảng điều khiển**: `src/ui-catalog.ts` (`restoUiCatalog`) là nguồn sự thật cho nút — audit ép 1:1 với registry (không nút chết). Endpoint `GET /restaurant/capabilities` trả catalog cho UI render động. `web/RestaurantConsole.tsx` (React, apps/web) + `web/api-client.ts` + `web/soul-restaurant-console.html` (demo bấm được, mock + live) + `web/README.md`.
- **Dashboard**: `resto.console.dashboard` — tổng quan vận hành thời gian thực (đơn mở, hàng đợi bếp theo trạm, doanh thu hôm nay, KM đang chạy, khách nhiều điểm).
- **Fire-by-course**: `resto.order.fire_course` — gửi bếp từng course theo trình tự; event `resto.order.course_fired`. `sendKitchen` refactor tách helper `emitKots` dùng chung (+ filter `only_course`).
- +2 tool, +3 route (fire-course, dashboard, capabilities), +1 event, +2 intent. Audit thêm mục "UI phủ đủ nút".
- Smoke test 126/126; audit 58/58; `tsc` sạch. Không phá vỡ v1.0/v1.1.
- **Audit hardening**: bổ sung `exports` cho `./web/RestaurantConsole.js`, `./web/api-client.js`, `./ui-catalog.js` (sửa lỗi import UI từ apps/web); thêm test promo×tách-bill (Σ bill == tổng đơn, giảm KM phân bổ tỷ lệ, không lệch 1đ); cross-check độc lập manifest↔code↔docs↔catalog và mô phỏng demo mock (mở bàn→gọi món→thu, số tiền khớp).

## v1.1.0 · 2026-07-07

Khối "Khuyến mãi & Khách hàng thân thiết" — nâng 31→40 năng lực, 18→22 bảng.

- **Khuyến mãi**: `resto_promotions` + `resto_promo_redemptions`. Voucher (mã) / happy-hour (khung giờ +07:00, `days_mask`) / auto. Giảm %/tiền, `min_subtotal`, `max_discount`, cửa sổ `starts_at`/`ends_at`, `usage_limit` + `per_customer_limit`. Áp mã gộp vào `discount_total` → tách bill vẫn phân bổ đúng. Tools: `promo.upsert`, `promo.apply` (kèm remove), `promo.list`.
- **Khách hàng thân thiết**: `resto_customers` (khóa SĐT) + `resto_loyalty_ledger`. 1 điểm = 1đ. Tích `earn_pct% × (grand − điểm_đã_đổi)` khi đóng đơn; đổi điểm qua `bill.pay method=points`; điều chỉnh tay. Tools: `customer.upsert`, `customer.lookup`, `customer.list`, `order.set_customer`, `loyalty.adjust`, `loyalty.history`.
- **Cấu hình mới**: `loyalty_enabled`, `loyalty_earn_pct`, `loyalty_min_redeem`.
- **Đơn**: thêm `customer_id`, `promo_id`, `promo_code`, `promo_discount`; `bill.pay` nhận `customer_phone` để gắn khách + tích/đổi điểm; mở takeaway kèm SĐT tự gắn khách; hủy đơn trả lại lượt khuyến mãi.
- +6 quyền (`promo`/`customer`/`loyalty` × read/write), +9 route, +8 event, +8 intent. 5 action lớp 2 (thêm `loyalty.adjust`).
- Migrations 0002 (bảng + ALTER) & 0003 (RLS 4 bảng mới, fail-closed). RLS 22/22.
- Smoke test 117/117; audit 45/45; `tsc` sạch. Không phá vỡ hành vi v1.0 (mọi số cũ giữ nguyên khi không dùng KM/điểm).

## v1.0.0 · 2026-07-06

Phát hành đầu tiên.

- 18 bảng `resto_*` (DDL idempotent) + FORCE RLS fail-closed 18/18, không COALESCE.
- 31 năng lực Tiểu Tâm (12 read + 19 action; 4 action lớp 2, 4 action sensitive lớp 1) — dry-run→confirm.
- 20 intents Việt/Anh · 31 HTTP routes Zod-tại-biên · 29 events.
- Máy tính tiền BigInt: options/combo, giảm giá, phí phục vụ, VAT gộp/cộng ngoài; tách bill phân bổ tỷ lệ + bill cuối nhận dư.
- Thanh toán 1 câu: auto-create bill → thu → tiền thối → đóng đơn → thả bàn → event trừ kho (combo bung thành phần, gộp SKU).
- Đặt bàn chống trùng khung giờ, seat mở đơn một chạm.
- Báo cáo doanh thu (bill paid) + top món.
- Smoke test 95/95 trên PGlite (Postgres thật, role không superuser).
- Docs đủ ⑧: README, GUIDE, TOOLS (31 anchor), TUTORIAL, INSTALL, EVENTS, CHANGELOG.
