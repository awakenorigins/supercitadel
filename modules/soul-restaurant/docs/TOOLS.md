# SOUL-RESTAURANT — TOOLS.md · Giáo trình 42 năng lực cho Tiểu Tâm

> Tài liệu này là **giáo trình bắt buộc** (hợp đồng mặt cắt ⑧). Tiểu Tâm đọc file này
> + `src/intents.ts` để hiểu và vận hành module. Mỗi năng lực: mô tả, ví dụ hội thoại,
> `tool_input` JSON, và ghi chú hành vi. Anchor heading khớp `manifest.module.json#tools[].docs`.
>
> **Quy ước chung**
> - Mọi tiền/`amount`/`price`: chuỗi số scale-2 (`"45000"` hoặc `"45000.00"`). Mọi số lượng `qty`: chuỗi scale-3.
> - Tham chiếu đơn: mọi tool thao tác đơn nhận `order_code` **hoặc** `table` (tên bàn, chấp nhận biến thể: `"5"`, `"bàn 5"`, `"Ban 5"` → `Bàn 5`).
> - `kind: "action"` = ghi dữ liệu. Action **sensitive** đi qua dry-run→confirm: gọi lần 1 trả preview, người dùng đồng ý → gọi lại kèm `confirm: true`. Lớp bảo mật 2 (bill.pay/bill.void/order.cancel/settings.update) đòi tài khoản đã gắn cấp 2.
> - Mọi action trả `{ ok, message, data }` — `message` là **câu tiếng Việt dựng sẵn từ số liệu thật**; Tiểu Tâm đọc nguyên văn, không tự bịa số.

---

## A. TRA CỨU (17 read tools)

### resto.table.map
Sơ đồ sàn theo khu vực: bàn nào trống/có khách/đặt trước/đang dọn, kèm preview đơn đang mở (mã đơn, số món, tạm tính).
- Nói: *"Bàn nào đang trống?"* · *"Tình hình khu sân vườn?"*
```json
{ "area": "Sân vườn" }
```
Trả: `{ areas: [{ area, tables: [{ name, status, capacity, order? }] }], counts: { total, available, occupied, reserved, cleaning } }`.

### resto.menu.search
Tìm món theo từ khóa/danh mục. Mặc định ẩn món báo hết (`include_soldout: true` để xem cả).
- Nói: *"Menu có món gì giá phở?"*
```json
{ "query": "phở", "category": "Món chính", "limit": 20 }
```
Trả: danh sách `{ sku, name, price, category, station, kind, has_options, sold_out }`.

### resto.menu.item_info
Chi tiết một món: giá, trạm bếp, nhóm tùy chọn (min/max, từng lựa chọn + phụ thu), thành phần combo, định lượng nguyên liệu.
- Nói: *"Phở bò có tùy chọn gì, phụ thu bao nhiêu?"*
```json
{ "name": "Phở bò" }
```

### resto.order.view
Xem một đơn: danh sách món (trạng thái từng dòng, tùy chọn, ghi chú), tổng tiền đầy đủ (tạm tính → giảm → phí phục vụ → thuế → phải trả), bill đã tách.
- Nói: *"Bàn 5 gọi gì rồi, bao nhiêu tiền?"*
```json
{ "table": "5" }
```

### resto.order.open_list
Mọi đơn đang mở trong quán (lọc được theo loại `dine_in|takeaway|delivery`) — cái nhìn nhanh cuối ca.
- Nói: *"Đang có những đơn nào chưa đóng?"*
```json
{ "type": "dine_in" }
```

### resto.kds.queue
Màn hình bếp: phiếu KOT xếp FIFO theo trạm, kèm **tuổi phiếu (phút)** để biết phiếu nào chờ lâu.
- Nói: *"Bếp nóng đang có phiếu nào?"* · *"Phiếu nào lâu nhất?"*
```json
{ "station": "Bếp nóng", "status": "queued", "limit": 20 }
```

### resto.bill.view
Xem bill theo `bill_code`, hoặc mọi bill của một đơn (`order_code`/`table`): dòng tiền, trạng thái, thanh toán đã ghi.
```json
{ "bill_code": "BILL-260706-K3MP" }
```

### resto.reservation.list
Danh sách đặt bàn theo ngày (mặc định hôm nay, `days` mở rộng cửa sổ). Mặc định ẩn hủy/no-show/đã nhận xong — `include_done: true` để xem cả.
- Nói: *"Tối nay có ai đặt bàn không?"*
```json
{ "date": "2026-07-10", "days": 1, "include_done": false }
```

### resto.report.sales
Doanh thu theo khoảng ngày (mặc định hôm nay), tính trên **bill đã thanh toán** (`paid_at`): tổng thu, số bill/đơn, trung bình/đơn, tách theo phương thức và theo loại đơn.
- Nói: *"Hôm nay bán được bao nhiêu?"*
```json
{ "from": "2026-07-01", "to": "2026-07-06" }
```
Ghi chú: tiền mặt ghi **số áp vào bill** (tiền thối không làm bẩn doanh thu).

### resto.report.top_items
Món bán chạy theo doanh thu trong khoảng ngày. Combo tính theo dòng combo (không bung thành phần trong báo cáo).
```json
{ "from": "2026-06-29", "to": "2026-07-05", "limit": 10 }
```

### resto.recipe.coverage
Độ phủ định lượng: món nào chưa khai recipe (bán sẽ không trừ được kho), combo nào có thành phần thiếu recipe.
- Nói: *"Món nào chưa có định lượng nguyên liệu?"*
```json
{}
```

### resto.settings.view
Xem cấu hình quán: phí phục vụ %, thuế % + gộp/cộng ngoài, tiền tệ, chế độ trừ kho (`auto_deduct_stock`, `deduct_on: paid|served`), tự chuyển bàn sang "đang dọn" sau thanh toán.
```json
{}
```

---

### resto.console.dashboard
Tổng quan vận hành thời gian thực: đơn đang mở, hàng đợi bếp theo trạm, doanh thu hôm nay, khuyến mãi đang chạy, khách nhiều điểm. Cho cả bảng điều khiển lẫn Tiểu Tâm.
- Nói: *"Tình hình quán giờ thế nào?"*
```json
{}
```

## B. THAO TÁC (25 write actions)

### resto.table.upsert
Thêm/sửa bàn; tự tạo khu vực nếu chưa có. Không sensitive.
- Nói: *"Thêm bàn 12 khu tầng 2, 6 chỗ"*
```json
{ "name": "Bàn 12", "area": "Tầng 2", "capacity": 6, "shape": "round", "active": true }
```

### resto.table.open
Mở đơn: tại bàn (`table`) hoặc mang về/giao đi (`type: "takeaway"|"delivery"`, không cần bàn). Bàn đang có khách → lỗi `TABLE_BUSY` kèm mã đơn hiện tại để gọi món tiếp thay vì mở mới.
- Nói: *"Mở bàn 5, 4 khách"* · *"Tạo đơn mang về cho chị Hoa"*
```json
{ "table": "5", "guests": 4, "note": "Khách quen" }
```
```json
{ "type": "takeaway", "customer_name": "Chị Hoa", "customer_phone": "090xxxxxxx" }
```

### resto.order.add_items
Gọi món vào đơn. Mỗi phần tử `items[]`: `name` hoặc `sku`, `qty` (mặc định "1"), `options` (tên lựa chọn — phụ thu tự cộng vào giá dòng), `note`, `course`. Khớp tên mờ: đúng SKU → đúng tên → gần đúng; nhiều ứng viên → lỗi `MENU_ITEM_AMBIGUOUS` kèm danh sách để hỏi lại. Món `sold_out` → chặn. Tùy chọn sai/thiếu bắt buộc/vượt max → lỗi rõ ràng.
- Nói: *"Bàn 5 gọi 2 phở bò thêm trứng với 1 trà đá"*
```json
{ "table": "5", "items": [
  { "name": "Phở bò", "qty": "2", "options": ["Thêm trứng"], "note": "ít hành" },
  { "name": "Trà đá", "qty": "1" }
] }
```
**Lưu ý tách bill:** mỗi phần tử là **một dòng**. Nếu khách có thể chia tiền riêng từng phần, gọi **mỗi phần một dòng** (`{"name":"Phở bò"}` ×2) thay vì một dòng `qty: "2"` — `resto.bill.create` chọn món theo dòng.

### resto.order.send_kitchen
Gửi mọi món `pending` xuống bếp — **tự tách phiếu KOT theo trạm** (bếp nóng/bar/…). Combo in kèm ghi chú "gồm: …" để bếp biết thành phần. Không còn món chờ → `NOTHING_TO_SEND`.
- Nói: *"Gửi bếp bàn 5"*
```json
{ "table": "5", "note": "khách vội" }
```

### resto.kds.update
Bếp cập nhật phiếu: `queued → preparing → ready → completed` (**chỉ tiến, không lùi**). `ready` đồng bộ mọi món trên phiếu sang ready.
```json
{ "kot_code": "KOT-260706-ABCD", "status": "ready" }
```

### resto.order.serve
Lên món cho khách. Không truyền `items` → phục vụ mọi món đang `ready`. Truyền `items` (tên) → phục vụ đích danh (chấp nhận món `sent|preparing|ready`). Phiếu KOT hết món chưa phục vụ → tự `completed`. Nếu cấu hình `deduct_on: "served"` → phát event trừ kho tại đây.
- Nói: *"Lên món bàn 5"*
```json
{ "table": "5", "items": ["Trà đá"] }
```

### resto.order.cancel_item ⚠️ sensitive L1
Hủy một dòng món kèm lý do. Ưu tiên hủy dòng `pending` trước; món đã gửi bếp vẫn hủy được (đánh dấu `was_sent` để quán đối chiếu hao hụt), phiếu KOT rỗng → tự hủy. Món **đã vào bill** → `ITEMS_ALREADY_BILLED` (void bill trước).
```json
{ "table": "5", "item": "Trà đá", "qty": "1", "reason": "Khách đổi ý", "confirm": true }
```

### resto.order.move_table
Chuyển cả đơn sang bàn trống khác (bàn cũ thả về `available`).
```json
{ "table": "9", "to_table": "8" }
```

### resto.order.merge ⚠️ sensitive L1
Gộp đơn bàn nguồn vào bàn đích (chuyển hết món + phiếu bếp, đơn nguồn hủy với dấu vết "Gộp vào …", bàn nguồn thả). Nguồn đã có bill → chặn (`ORDER_HAS_BILL` — void bill trước).
```json
{ "from_table": "3", "to_table": "5", "confirm": true }
```

### resto.order.discount ⚠️ sensitive L1
Giảm giá cấp đơn: `percent` (0–100) hoặc `amount` (chặn trần = tạm tính). Ghi lý do để đối soát.
```json
{ "table": "5", "discount_type": "percent", "value": "10", "reason": "Khách quen", "confirm": true }
```

### resto.bill.create ⚠️ sensitive L1
Chốt bill. Không truyền `item_names` → bill **toàn bộ món chưa vào bill**. Truyền `item_names` → **tách bill**: chọn từng **dòng** món theo tên (dòng chưa thuộc bill nào). Giảm giá đơn phân bổ theo tỷ lệ tạm tính; **bill cuối (gom phần còn lại) nhận trọn phần dư** → tổng các bill luôn khớp tổng đơn, không rơi xu.
- Nói: *"Tách bill bàn 5: một phở tính riêng"*
```json
{ "table": "5", "item_names": ["Phở bò"] }
```

### resto.bill.pay 🔒 sensitive L2
Thu tiền — **một câu là xong**: tham chiếu `bill_code`, hoặc `table`/`order_code` (1 bill chưa thu → thu bill đó; nhiều → liệt kê để chọn; **chưa có bill → tự tạo full bill rồi thu luôn**). `amount` bỏ trống = thu đúng số phải trả. Tiền mặt đưa dư → tính **tiền thối** (`change`), sổ sách chỉ ghi số áp vào. Phi tiền mặt vượt số phải trả → `PAYMENT_INVALID`. Bill đủ tiền → `paid`; đơn hết bill nợ + hết món chưa bill → **tự đóng đơn, thả bàn**, và (nếu `deduct_on: "paid"`) phát `resto.stock.deduct_requested` cho Soul-Inventory trừ kho.
- Nói: *"Tính tiền bàn 5, khách đưa 200 nghìn tiền mặt"*
```json
{ "table": "5", "method": "cash", "amount": "200000", "confirm": true }
```
Trả: `{ applied, change, bill_status, order_closed, auto_created_bill, deduction? }`.

### resto.bill.void 🔒 sensitive L2
Hủy bill **chưa thanh toán** (mở lại các dòng món để tách lại/sửa). Bill đã thu → chặn, hướng dẫn quy trình hoàn tiền (v1 chưa hỗ trợ refund tự động).
```json
{ "bill_code": "BILL-260706-K3MP", "reason": "Tách lại theo yêu cầu khách", "confirm": true }
```

### resto.order.cancel 🔒 sensitive L2
Hủy cả đơn kèm lý do: mọi món hủy, bill chưa thu void theo, bàn thả. Đơn có bill **đã thanh toán** → chặn (`ORDER_HAS_PAID_BILL`).
```json
{ "table": "8", "reason": "Khách bỏ về", "confirm": true }
```

### resto.reservation.manage
Một tool cho cả vòng đời đặt bàn qua `op`:
- `create` — cần `customer_name`, `at` (ISO, nhận `+07:00`); tùy chọn `phone`, `party_size`, `table`, `area`, `duration_min` (mặc định 90'), `note`. Cùng bàn trùng khung giờ (pending/confirmed/seated) → `RESERVATION_CONFLICT`. Quá sức chứa bàn → chỉ **cảnh báo**, không chặn.
- `confirm` / `cancel` / `no_show` — theo `code`.
- `seat` — khách tới: **mở đơn ngay** trên bàn (cho đổi bàn lúc seat bằng `table`), gắn `order_id` vào lượt đặt.
```json
{ "op": "create", "customer_name": "Anh Long", "party_size": 6, "table": "Bàn 8", "at": "2026-07-10T19:00:00+07:00" }
```
```json
{ "op": "seat", "code": "RSV-260710-QW4T" }
```

### resto.menu.upsert
Thêm/sửa món trọn gói một lệnh: giá, danh mục (tự tạo), trạm bếp (tự tạo), nhóm tùy chọn kèm lựa chọn + phụ thu (`options[]`: `{group, min, max, choices:[{name, price_delta}]}`), hoặc combo (`combo_items[]`: thành phần phải là món đơn — combo lồng combo bị chặn `COMBO_INVALID`).
```json
{ "name": "Phở bò", "sku": "PHO-BO", "price": "45000", "category": "Món chính", "station": "Bếp nóng",
  "options": [{ "group": "Thêm", "min": 0, "max": 2,
    "choices": [{ "name": "Thêm trứng", "price_delta": "5000" }, { "name": "Thêm bánh", "price_delta": "5000" }] }] }
```

### resto.menu.set_availability
Báo hết / mở bán lại một món trong 1 câu. Món hết vẫn hiện trong quản trị nhưng **gọi món bị chặn**.
- Nói: *"Hết phở bò rồi"*
```json
{ "name": "Phở bò", "sold_out": true }
```

### resto.recipe.set
Khai định lượng nguyên liệu cho món (đơn): mỗi dòng `{sku, name?, qty, unit}` theo **SKU kho của Soul-Inventory**. Đây là cầu nối trừ kho tự động — món không recipe sẽ vào `missing_recipe` của event trừ kho.
```json
{ "item": "Phở bò", "lines": [
  { "sku": "BP-01", "name": "Bánh phở", "qty": "0.2", "unit": "kg" },
  { "sku": "TB-02", "name": "Thịt bò", "qty": "0.15", "unit": "kg" }
] }
```

### resto.settings.update 🔒 sensitive L2
Đổi cấu hình quán: `service_charge_pct`, `tax_pct`, `price_includes_tax` (VAT gộp trong giá — mặc định kiểu VN), `currency`, `auto_deduct_stock`, `deduct_on` (`paid`|`served`), `auto_clean_table`.
```json
{ "service_charge_pct": "5", "tax_pct": "8", "price_includes_tax": true, "deduct_on": "paid", "confirm": true }
```

---

## D. KHUYẾN MÃI & KHÁCH HÀNG THÂN THIẾT (v1.1)

> Bật tích điểm qua `resto.settings.update` (`loyalty_enabled`, `loyalty_earn_pct`,
> `loyalty_min_redeem`). Quy ước: **1 điểm = 1đ**.

### resto.promo.list
Danh sách khuyến mãi (voucher/happy-hour/auto): mã, loại/mức giảm, đơn tối thiểu, số lượt đã dùng, còn bật không.
```json
{ "active_only": true }
```

### resto.customer.lookup
Tra khách thân thiết theo SĐT: điểm tích lũy, hạng, số lần ghé, tổng chi tiêu, 5 đơn gần đây.
- Nói: *"Khách 0909123456 còn bao nhiêu điểm?"*
```json
{ "phone": "0909123456" }
```

### resto.customer.list
Danh sách khách (tìm theo tên/SĐT).
```json
{ "query": "Long", "limit": 50 }
```

### resto.loyalty.history
Sổ điểm một khách: các dòng tích/đổi/điều chỉnh + số dư sau mỗi lần.
```json
{ "phone": "0909123456", "limit": 50 }
```

### resto.promo.upsert ⚠️ sensitive L1
Tạo/sửa khuyến mãi. `kind`: `voucher` (bắt buộc `code`) · `happy_hour` (bắt buộc `hh_start_min`/`hh_end_min`, phút-trong-ngày giờ +07:00) · `auto`. Giảm `percent` (kèm `max_discount` trần) hoặc `amount`. Điều kiện: `min_subtotal`, cửa sổ `starts_at`/`ends_at`, ngày trong tuần `days_mask` (bit CN=1…T7=64; 127=mọi ngày), giới hạn `usage_limit` (tổng) + `per_customer_limit`.
- Nói: *"Tạo voucher GIAM10 giảm 10% cho đơn từ 100 nghìn"*
```json
{ "code": "GIAM10", "name": "Giảm 10% đơn từ 100k", "discount_type": "percent", "value": "10", "min_subtotal": "100000", "max_discount": "50000", "usage_limit": 100, "confirm": true }
```
Happy hour 14–17h mọi ngày, giảm 15%:
```json
{ "name": "Happy Hour chiều", "kind": "happy_hour", "discount_type": "percent", "value": "15", "hh_start_min": 840, "hh_end_min": 1020, "confirm": true }
```

### resto.promo.apply ⚠️ sensitive L1
Áp mã vào đơn (hoặc `remove: true` để gỡ). Kiểm tra: còn bật, trong hạn/khung giờ/ngày, đơn đạt tối thiểu, chưa vượt giới hạn lượt/khách. Giảm KM **gộp vào `discount_total`** nên tách bill vẫn phân bổ đúng. Một đơn giữ **một** khuyến mãi (áp mã mới thay mã cũ).
- Nói: *"Áp mã GIAM10 cho bàn 5"* · *"Gỡ khuyến mãi bàn 5"*
```json
{ "table": "5", "code": "GIAM10" }
```
```json
{ "table": "5", "remove": true }
```

### resto.customer.upsert
Tạo/sửa hồ sơ khách thân thiết (khóa theo SĐT). SĐT tự chuẩn hóa (bỏ ký tự không phải số). Tên trống → mặc định = SĐT.
```json
{ "phone": "0909123456", "name": "Anh Long", "tier": "vip" }
```

### resto.order.set_customer
Gắn khách (theo SĐT, tự tạo nếu chưa có) vào đơn đang mở — để tích/đổi điểm khi thanh toán. (Mở đơn takeaway kèm `customer_phone` cũng tự gắn.)
```json
{ "table": "5", "phone": "0909123456" }
```

### resto.loyalty.adjust 🔒 sensitive L2
Điều chỉnh điểm tay (comp/sửa sai): `points` dương để cộng, âm để trừ; bắt buộc lý do. Không cho trừ quá số dư.
```json
{ "phone": "0909123456", "points": "50000", "reason": "Bù khiếu nại", "confirm": true }
```

### Đổi điểm khi thanh toán (không phải tool riêng)
`resto.bill.pay` với `method: "points"` → đổi điểm trả tiền (1 điểm = 1đ, không có tiền thối). Đơn phải đã gắn khách (hoặc truyền `customer_phone` trong lệnh thu). `amount` = số điểm đổi (bỏ trống = đổi tối đa trong khả năng & số cần thu). Dưới `loyalty_min_redeem` → chặn.
```json
{ "table": "5", "method": "points", "amount": "5000", "confirm": true }
```

---

### resto.order.fire_course
Ra món theo lượt (fire-by-course): gửi bếp CHỈ các món của một `course` — phục vụ theo trình tự khai vị → món chính → tráng miệng. Dùng `course` đã gán khi gọi món.
- Nói: *"Ra món course 2 bàn 5"*
```json
{ "table": "5", "course": 2 }
```

## C. CÔNG THỨC TIỀN (nguồn duy nhất: `order.service.ts#computeAndStoreTotals`)

```
line_total  = (đơn_giá + Σ phụ_thu_tùy_chọn) × qty
subtotal    = Σ line_total (món chưa hủy)
manual_disc = percent: subtotal×p% | amount (trần = subtotal)
promo_disc  = (v1.1) từ mã đang gắn: percent×subtotal (trần max_discount) | amount;
              dưới min_subtotal hiện tại → 0 (tự tính lại mỗi khi món đổi)
discount    = min(manual_disc + promo_disc, subtotal)
base        = subtotal − discount
service     = base × service_charge_pct%
VAT gộp     : gross = base + service · tax = gross×r/(100+r) · PHẢI TRẢ = gross
VAT cộng    : tax = (base+service)×r/100 · PHẢI TRẢ = base+service+tax
Tách bill   : discount phân bổ tỷ lệ theo tạm tính từng bill,
              bill cuối nhận phần dư → Σ bill == Σ đơn
Tích điểm   : (v1.1) khi đơn đóng, điểm = earn_pct% × (grand − điểm_đã_đổi_đ)
```
Toàn bộ số học chạy BigInt fixed-point (tiền scale-2, lượng scale-3) — không một phép `Number()` nào trên tiền.
