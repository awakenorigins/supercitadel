# SOUL-RESTAURANT — GUIDE.md · Nghiệp vụ & Kiến trúc

Module quản lý nhà hàng/quán ăn/cafe cho SuperCitadel — tuân thủ trọn hợp đồng
8 mặt cắt (§05 blueprint): manifest, vòng đời, quyền `resto.*`, bảng một khuôn
`resto_*` + RLS, giao tiếp chỉ qua event, tool một chuẩn, validate Zod tại biên,
tự tài liệu như một repo.

## 1. Bức tranh nghiệp vụ

```
ĐẶT BÀN ──seat──▶ MỞ ĐƠN ──▶ GỌI MÓN ──▶ GỬI BẾP (KOT theo trạm)
   │                │            │              │
   │ conflict check │ TABLE_BUSY │ options/combo│ KDS: queued→preparing→ready
   ▼                ▼            ▼              ▼
 no_show/cancel   takeaway    sold-out chặn   LÊN MÓN (served)
                                                 │
                       GIẢM GIÁ · CHUYỂN BÀN · GỘP BÀN · HỦY MÓN/ĐƠN
                                                 │
                    TÁCH BILL (phân bổ giảm giá, bill cuối nhận dư)
                                                 │
                    THANH TOÁN (đa phương thức, tiền thối, 1 câu là xong)
                                                 │
              ĐÓNG ĐƠN → THẢ BÀN → EVENT TRỪ KHO → BÁO CÁO
```

## 2. Hai mươi hai bảng dữ liệu (`resto_*`)

| Nhóm | Bảng |
|---|---|
| Sàn | `resto_areas`, `resto_tables` |
| Menu | `resto_menu_categories`, `resto_menu_items`, `resto_option_groups`, `resto_options`, `resto_item_option_groups`, `resto_combo_items`, `resto_stations`, `resto_recipes` |
| Vận hành | `resto_orders`, `resto_order_items`, `resto_kots` |
| Tiền | `resto_bills`, `resto_bill_items`, `resto_payments` |
| Khác | `resto_reservations`, `resto_settings` |
| Khách & KM (v1.1) | `resto_customers`, `resto_promotions`, `resto_promo_redemptions`, `resto_loyalty_ledger` |

Mọi bảng: `id, org_id (index), created_at, updated_at` — khuôn ④. Giá/tiền lưu
`numeric(15,2)`, lượng `numeric(15,3)`; tầng service tính **BigInt fixed-point**
qua `src/lib/money.ts` (mulPriceQty, pctOf, taxFromGross, roundDivNonNeg…),
**không `Number()`** trên nghiệp vụ tiền.

## 3. Cô lập tenant — RLS fail-closed

`migrations/0001_rls.sql` + `0003_v1_1_rls.sql`: **22/22 bảng** `ENABLE + FORCE ROW LEVEL SECURITY`,
policy duy nhất:

```sql
org_id = current_setting('app.current_org_id')::uuid
```

**Không** `COALESCE` fallback — phiên quên `set_config` sẽ **LỖI** thay vì trả
rỗng lặng lẽ (fail-closed, đã có test §9). Vận hành bắt buộc:
- App **kết nối bằng role KHÔNG superuser** (superuser/BYPASSRLS vô hiệu FORCE RLS).
- Mỗi request bọc transaction: `SELECT set_config('app.current_org_id', $org, true)`.
- Service vẫn lọc `org_id` tường minh ở mọi query — belt & suspenders.

## 4. Máy tính tiền

Nguồn công thức duy nhất: `order.service.ts#computeAndStoreTotals` (xem
TOOLS.md §C). Điểm cần nhớ:

- **VAT gộp trong giá** là mặc định VN (`price_includes_tax: true`, 8%):
  khách trả đúng `gross`, thuế được **bóc ra** để báo cáo: `tax = gross×r/(100+r)`.
- **Phí phục vụ** tính trên `subtotal − discount`.
- **Tách bill**: giảm giá đơn phân bổ tỷ lệ theo tạm tính từng bill
  (`round(disc × billSub / orderSub)`), riêng **bill gom phần còn lại nhận trọn
  phần dư** → bất biến `Σ discount(bill) == discount(đơn)` và trong thực tế
  `Σ grand(bill) == grand(đơn)` (test chứng minh: 4.736,84 + 5.263,16 = 10.000;
  42.276,32 + 46.973,68 = 89.250). Về lý thuyết phí/thuế làm tròn **từng bill**
  (mỗi bill là một chứng từ độc lập) nên có thể lệch ±0,01 so với tạm tính đơn
  ở tổ hợp số hiếm — chuẩn fiscal per-bill.
- **Payment ghi số ÁP VÀO**: khách đưa 200k cho bill 99.225 → sổ ghi 99.225,
  `change 100.775` chỉ nằm trong response. Doanh thu không bao giờ dính tiền thối.
  Phi tiền mặt không có "thối" → đưa vượt là `PAYMENT_INVALID`.

## 5. Bếp — KOT/KDS

- `send_kitchen` gom món `pending`, **tách phiếu theo trạm** của từng món
  (món không gán trạm → phiếu "Bếp chung").
- Luồng phiếu **chỉ tiến**: `queued → preparing → ready → completed`
  (hủy = `cancelled`, chỉ khi phiếu rỗng do hủy món). Lùi → `INVALID_STATUS_FLOW`.
- `ready` đồng bộ trạng thái món; `serve` mặc định lấy món `ready`; phiếu hết
  món chưa phục vụ tự `completed`.

## 6. Cầu nối Soul-Inventory — trừ kho khi bán (luật ⑤, không import chéo)

Khi thanh toán (`deduct_on: "paid"`, mặc định) hoặc khi lên món (`"served"`),
module phát:

```
resto.stock.deduct_requested {
  org_id, order_code, trigger: 'paid'|'served', reason,
  lines: [{ sku, name, qty, unit }],   // gộp theo SKU, combo đã BUNG thành phần
  missing_recipe: string[]             // món bán ra nhưng chưa khai định lượng
}
```

Host subscribe event này và gọi `kho.stock.issue` của Soul-Inventory (xem
EVENTS.md + WIRING.patch). Không cài Soul-Inventory? Event vẫn phát, không ai
nghe — quán chạy bình thường, chỉ không tự trừ kho. `resto.recipe.coverage`
cho biết món nào còn thiếu định lượng.

## 7. Bảo mật hành động (dry-run→confirm)

| Lớp | Action | Ý nghĩa |
|---|---|---|
| L2 🔒 | `bill.pay`, `bill.void`, `order.cancel`, `settings.update` | Tiền/cấu hình — đòi tài khoản cấp 2, luôn preview trước |
| L1 ⚠️ | `cancel_item`, `merge`, `discount`, `bill.create` | Ảnh hưởng doanh thu — preview trước |
| L1 | các action còn lại | Chạy thẳng |

Semantics chuẩn `src/contract.ts#executeAction`: sensitive && !confirm → trả
preview + audit `dryrun`; `confirm: true` → chạy thật + audit `ok/error`.

## 7b. Khuyến mãi & Khách hàng thân thiết (v1.1)

**Khuyến mãi** (`resto_promotions`): ba loại — `voucher` (có mã, khách/nhân viên nhập),
`happy_hour` (tự áp trong khung giờ +07:00 + ngày trong tuần `days_mask`), `auto`.
Giảm `percent` (kèm trần `max_discount`) hoặc `amount`; điều kiện `min_subtotal`, cửa
sổ `starts_at`/`ends_at`, giới hạn `usage_limit` (tổng) + `per_customer_limit`. Áp mã =
gắn promo vào đơn → **giảm KM gộp vào `discount_total`**, nên tách bill vẫn phân bổ đúng,
không cần logic riêng. Mỗi đơn giữ một khuyến mãi (áp mã mới thay mã cũ). Lượt dùng đếm
theo `resto_promo_redemptions` (unique theo đơn); hủy đơn trả lại lượt.

**Khách hàng thân thiết** (`resto_customers`, khóa theo SĐT) + **sổ điểm**
(`resto_loyalty_ledger`, mọi biến động ghi vết). Quy ước **1 điểm = 1đ**. Bật bằng
`resto.settings.update`: `loyalty_enabled`, `loyalty_earn_pct` (% chi tiêu → điểm),
`loyalty_min_redeem` (điểm tối thiểu mỗi lần đổi).

- **Tích**: khi đơn đóng, cộng `earn_pct% × (grand − điểm_đã_đổi_đ)` cho khách đã gắn;
  đồng thời cập nhật `visits`, `total_spent`, `last_visit_at`.
- **Đổi**: `resto.bill.pay` với `method: "points"` — đổi điểm trả tiền, không có tiền
  thối, chặn dưới `loyalty_min_redeem`, không vượt số dư/số cần thu.
- **Gắn khách**: mở takeaway kèm `customer_phone`, hoặc `resto.order.set_customer`,
  hoặc truyền `customer_phone` ngay khi `resto.bill.pay`.
- **Điều chỉnh tay**: `resto.loyalty.adjust` (lớp 2) — cộng/trừ điểm có lý do.

## 7c. Bảng điều khiển "sống 100%" + Ra món theo lượt (v1.2)

**Bảng điều khiển**: mọi năng lực của module (42) hiển thị thành **một nút thật** trên UI,
render **động** từ `src/ui-catalog.ts#restoUiCatalog`. Quy tắc "không nút chết": thêm tool
BẮT BUỘC thêm mục catalog — audit ép catalog 1:1 với registry (khớp tên, kind, route, nhóm)
nên UI không bao giờ lệch. Front-end lấy danh sách nút qua `GET /restaurant/capabilities`;
apps/web dùng component `web/RestaurantConsole.tsx`; kèm `web/soul-restaurant-console.html`
demo bấm được (mock backend) + chế độ Live gọi API thật. Action nhạy cảm (🔒) trên UI đi
qua bước "Chuẩn bị → Xác nhận" (gửi `confirm:true`) khớp `executeAction` của host.

`resto.console.dashboard` gộp: đơn đang mở, hàng đợi bếp theo trạm + tuổi phiếu, doanh thu
hôm nay, khuyến mãi đang chạy, khách nhiều điểm — cho cả UI lẫn Tiểu Tâm ("tình hình quán").

**Ra món theo lượt (fire-by-course)**: `resto.order.fire_course` gửi bếp CHỈ các món có
`course` chỉ định (course gán khi gọi món). Dùng khi phục vụ theo trình tự khai vị → chính →
tráng miệng; tách phiếu KOT theo trạm y như gửi bếp thường, phát event `resto.order.course_fired`.

## 8. Giới hạn hiện tại (khai thật để không ai bất ngờ)

1. **Combo = 1 dòng 1 trạm**: phiếu bếp in tại trạm của combo kèm ghi chú
   "gồm: …" — v1.1 sẽ tách thành phần combo về đúng từng trạm.
2. **Đặt bàn không tự khóa bàn**: `table.status` không đổi khi có lượt đặt
   sắp tới — walk-in vẫn mở bàn được. Lễ tân nhìn `reservation.list` để giữ chỗ.
   v1.1: auto-hold theo cửa sổ thời gian.
3. **`item_names` tách bill chọn theo DÒNG món**: muốn khách A trả 1 phở khi
   bàn gọi 2 → gọi **2 dòng phở riêng** ngay từ đầu (đã ghi ở TOOLS.md).
4. **Không refund tự động**: bill đã thu muốn hủy → quy trình hoàn tiền thủ
   công ngoài module (v1 chặn void bill paid).
5. **`top_items` không bung combo** — combo là một dòng doanh thu.
6. **`tax_rate` per-item**: cột đã có (reserved), v1 dùng thuế suất cấp quán.
7. **Chưa có hóa đơn điện tử** (NĐ 70/2025) — roadmap v1.2 nối module kế toán.
8. **Happy-hour theo giờ máy chủ +07:00** (không theo timezone từng quán) — đủ dùng cho VN.
9. **Đổi điểm chưa quy đổi tỷ giá tùy biến** (cố định 1 điểm = 1đ) — cấu hình tỷ giá để v1.2.

## 9. Chạy thử & nghiệm thu

```bash
npm install
npm run typecheck   # tsc strict, 0 lỗi
npm run test        # PGlite: 126/126 checks (golden path, tách bill, combo, đặt bàn,
                    # khuyến mãi, tích/đổi điểm, fire-by-course, dashboard, RLS fail-closed)
npm run audit       # đối chiếu manifest ↔ registry ↔ docs ↔ RLS → AUDIT_REPORT.md
```
