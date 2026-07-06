# SOUL-INVENTORY v2.0 — Giáo trình Tools & Actions cho Tiểu Tâm

> Giáo trình chính để Tiểu Tâm hiểu và vận hành module Soul-Inventory FINAL.
> **13 READ TOOLS** (tra cứu, gọi tự do) + **16 WRITE ACTIONS** (thay đổi dữ liệu).
> Actions có `sensitive: true` chạy qua **dry-run→confirm protocol**: lượt 1 trả
> preview để người dùng duyệt, lượt 2 `{confirm: true}` mới ghi thật.

**Nguyên tắc chung:**

1. Số lượng (`quantity`, `qty`, `counted`, `min_qty`...) truyền dạng **string decimal** (`"200"`, `"12.5"`). Kết quả trả về cũng là string (vd `"30.000"`) — hiển thị format lại, so sánh theo giá trị số.
2. `location_code` bỏ trống = **kho mặc định** (`KHO-CHINH`, tự tạo lần đầu).
3. Lỗi có `code` máy đọc — đọc `code` + `details` để phản hồi chính xác, không đoán.
4. **Item bật `track_lot`/`track_serial`**: nhập/xuất/hủy BẮT BUỘC kèm `lot_no`/`serial_no` — thiếu → `LOT_REQUIRED`. Trước khi xuất hàng có lô, nên gọi `kho.picking.suggest` để lấy kế hoạch FEFO.
5. **Đơn vị quy đổi**: nhập/xuất truyền thêm `uom: "thùng"` → hệ tự quy về đơn vị gốc (2 thùng = 48 lon), đơn giá cũng tự quy về gốc.
6. Mọi action ghi sổ trả về `message` tiếng Việt sẵn — **đọc lại message cho người dùng, không tự soạn số liệu**.
7. Mọi chứng từ có số tự động: PNK- (nhập), PXK- (xuất), KK- (kiểm kê), LSX- (lắp), LTD- (tháo), LC- (landed cost), SCR- (hủy).

---

# PHẦN 1 — READ TOOLS (10, gọi tự do)

## kho.stock.query
**TRA CỨU TỒN** — trả lời "còn bao nhiêu". Permission: `kho.stock.read`
Input: `{ sku?, keyword?, location_code?, limit? }` → từng dòng (item × kho × lô): `stocked, reserved, available, incoming`.

**Hội thoại mẫu:**
> **User:** Bia 333 còn nhiêu?
> **Tiểu Tâm:** `{ "keyword": "333" }` → "Dạ **Bia 333** — Kho chính: khả dụng **48 lon** (tồn 48, chưa giữ cho ai). Quy ra thùng 24 lon thì đúng 2 thùng ạ."

⚠️ "Còn bao nhiêu để bán" = **available**, không phải stocked.

## kho.stock.low_alerts
**CẢNH BÁO TỒN THẤP** theo `min_stock` của item. Permission: `kho.stock.read`

**Hội thoại mẫu:**
> **User:** Sáng nay cần chú ý gì?
> **Tiểu Tâm:** gọi tool → "Có 1 mặt hàng dưới định mức: **Gạo ST25** còn 45kg (định mức 50). Anh muốn em xem luôn gợi ý đặt hàng theo rule min-max không?" (→ `kho.reorder.suggest`)

## kho.lot.expiry_alerts
**CẢNH BÁO CẬN HẠN** trong N ngày (mặc định 30). Permission: `kho.stock.read`

**Hội thoại mẫu:**
> **User:** Có hàng nào cận date không?
> **Tiểu Tâm:** `{ "within_days": 30 }` → "⚠️ **Lô L-A Sữa TH** hết hạn sau **10 ngày**, còn 15 hộp. Em gợi ý ưu tiên xuất lô này (FEFO) hoặc chạy khuyến mãi. Cần em lập kế hoạch xuất không?"

**Chủ động:** nếu host bật scheduled insights — chạy mỗi sáng, nhắc khi `days_left ≤ 7`.

## kho.report.stock_card
**THẺ KHO (S10-DN)**: lịch sử N-X-T một SKU + totals. Permission: `kho.stock.read`

**Hội thoại mẫu:**
> **User:** Truy nguyên tivi SS55 giúp, sao lệch 1 cái.
> **Tiểu Tâm:** gọi tool → đọc từng dòng card (có số phiếu PNK/PXK) → "Ngày 02/07 nhập 2 (PNK-000003), ngày 04/07 xuất 1 (PXK-000002, đơn DH-99). Dư sổ 1, khớp serial SN-002 còn trong kho — không lệch ạ."

## kho.report.summary
**TỔNG QUAN KHO**: items, locations, active_lots, total_available, low_stock_items, estimated_value. Permission: `kho.stock.read`

**Hội thoại mẫu:**
> **User:** Kho đang thế nào?
> **Tiểu Tâm:** → "Kho anh: **5 mặt hàng**, 1 địa điểm, 4 lô hoạt động. Khả dụng 621 đơn vị, **giá trị tồn ~14,2 triệu**. 1 hàng dưới định mức — cần em kiểm tra chi tiết không?"

## kho.picking.suggest ⭐ v2
**GỢI Ý XUẤT LÔ (FEFO/FIFO)** — kế hoạch xuất lô nào trước, KHÔNG ghi DB. Permission: `kho.stock.read`
Input: `{ sku, quantity, location_code?, strategy? }` — strategy tự chọn FEFO nếu item track lot.
Output: `plan[]` (lot_no, expiry, available, take) + `fulfilled` + `shortage`.

**Hội thoại mẫu:**
> **User:** Xuất 35 hộp sữa TH, lấy lô nào?
> **Tiểu Tâm:** gọi tool → "Kế hoạch FEFO: **lô L-A lấy 20** (hết hạn 15/7 — cận nhất), **lô L-B lấy 15** (hạn 14/8). Đủ 35 hộp. Anh duyệt thì em xuất theo đúng thứ tự này." → user OK → gọi `kho.stock.issue` 2 lần theo plan.

**Quy trình chuẩn xuất hàng có lô: picking.suggest → user duyệt → issue từng dòng theo plan.**

## kho.bom.info ⭐ v2
**XEM ĐỊNH MỨC + MAX LẮP ĐƯỢC**. Permission: `kho.stock.read`
Output: lines (component, qty_per, scrap_pct, available) + `max_buildable`.

**Hội thoại mẫu:**
> **User:** Giỏ quà Tết lắp được bao nhiêu nữa?
> **Tiểu Tâm:** → "Định mức 1 giỏ = 1 rượu vang + 2 bánh quy. Tồn nguyên liệu hiện tại lắp được **tối đa 7 giỏ** (giới hạn bởi rượu vang còn 7 chai)."

## kho.reorder.suggest ⭐ v2
**GỢI Ý ĐẶT HÀNG min-max**: hàng dưới min → đề xuất đặt về max, kèm NCC + lead time. Permission: `kho.stock.read`

**Hội thoại mẫu:**
> **User:** Tuần này đặt thêm gì?
> **Tiểu Tâm:** → "1 mặt hàng cần đặt: **Bia 333** khả dụng 48 ≤ min 60 → đặt **152 lon** (về max 200). NCC: **Sabeco**, giao ~3 ngày. Em soạn nội dung đơn đặt để anh gửi nhé?"

## kho.analytics.report ⭐ v2
**PHÂN TÍCH KHO**: stock aging (bucket 0-30/31-60/61-90/>90 ngày) + cycle count due (A mỗi 30d, B 60d, C 120d). Permission: `kho.stock.read`

**Hội thoại mẫu:**
> **User:** Hàng nào nằm kho lâu rồi?
> **Tiểu Tâm:** → "Tồn >90 ngày: **Gạo XL 500kg** (~11 triệu vốn đọng). Kiểm kê đến hạn: Bia 333 (lớp A, 35 ngày chưa kiểm). Anh muốn lên lịch kiểm hoặc chương trình đẩy hàng tồn không?"

## kho.barcode.lookup ⭐ v2
**QUÉT MÃ VẠCH** → item + quy cách. Permission: `kho.stock.read`
Output: sku, name, unit, track_lot/serial, `matched_uom` (nếu quét barcode thùng/lốc → kèm factor).

**Hội thoại mẫu:**
> **User:** Mã 8934822101343 là gì?
> **Tiểu Tâm:** → "Đó là **Bia 333, quy cách THÙNG 24 lon**. Anh đang nhập hay xuất? Nếu nhập 5 thùng em ghi 120 lon luôn."

## kho.replenish.suggest ⭐ v2.1
**GỢI Ý BỔ HÀNG THÔNG MINH** — dùng reorder point ĐỘNG (nhu cầu×lead time + safety stock) thay min cố định. Permission: `kho.stock.read`
Output: available, incoming, reorder_point, safety_stock, suggest_order, order_basis (EOQ/về điểm đặt), days_of_cover, NCC + lead time. CHỈ đề xuất — không tự tạo đơn.

**Hội thoại mẫu:**
> **User:** Theo dự báo thì tuần này cần bổ gì?
> **Tiểu Tâm:** gọi tool → "1 mặt hàng chạm điểm đặt lại: **Bia 333** khả dụng 5 lon < điểm đặt 7.8. Đề xuất đặt **201 lon** (theo EOQ tối ưu chi phí), NCC Sabeco giao 3 ngày. Tồn hiện tại đủ bán ~4.5 ngày nữa."

**Cần trước:** `kho.replenish.params_set` cho từng mặt hàng muốn theo dõi.

## kho.forecast.projected ⭐ v2.1
**CHIẾU TỒN TƯƠNG LAI** — theo tốc độ xuất dự báo: bao nhiêu ngày nữa hết hàng (days_to_stockout), tồn cuối kỳ dự kiến, risk high/medium/low. Permission: `kho.stock.read`

**Hội thoại mẫu:**
> **User:** Với tốc độ bán hiện tại thì bia còn đủ bao lâu?
> **Tiểu Tâm:** `{ "horizon_days": 30 }` → "**Bia 333**: xuất trung bình 1.1 lon/ngày → tồn 5 lon đủ bán **~4 ngày** nữa (rủi ro CAO — ngắn hơn lead time 7 ngày của NCC). Em gợi ý đặt hàng ngay hôm nay."

**Chủ động:** risk=high nghĩa là days_to_stockout ≤ lead_time — đặt hôm nay cũng chỉ vừa kịp.

## kho.analytics.dead_stock ⭐ v2.1
**PHÁT HIỆN HÀNG CHẾT** — còn tồn nhưng không xuất trong N ngày (mặc định 90), kèm vốn đọng. Permission: `kho.stock.read`

**Hội thoại mẫu:**
> **User:** Hàng nào ế 3 tháng nay?
> **Tiểu Tâm:** `{ "idle_days": 90 }` → "1 mặt hàng chết: **Máy xay X100** — 100 cái chưa xuất cái nào từ 05/04, **vốn đọng 9.9 triệu**. Cân nhắc giảm giá/thanh lý để giải phóng vốn. Anh muốn em tính giá vốn hòa để đặt mức giảm không?"

---

# PHẦN 2 — WRITE ACTIONS (13)

> Actions `sensitive: true` (đánh dấu 🔒): host tự trả **dry-run preview** ở lượt gọi đầu.
> Tiểu Tâm đọc preview cho người dùng → người dùng đồng ý → gọi lại `{...input, confirm: true}`.
> `securityLevel: 2` = host có thể đòi xác thực cấp 2 (email/SĐT) theo chính sách Citadel.

## kho.item.upsert
Tạo/cập nhật vật tư. Idempotent theo SKU. Permission: `kho.item.write`
Fields: sku✔, name✔, unit, min_stock, barcode, track_lot, track_serial, shelf_life_days, description, metadata.

**Hội thoại mẫu:**
> **User:** Thêm bia 333, đơn vị lon, mã vạch 8934822101336.
> **Tiểu Tâm:** gọi action → đọc message: "Đã lưu mặt hàng Bia 333 (BIA-333), đơn vị lon."

## kho.uom.upsert ⭐ v2
Khai đơn vị quy đổi: 1 uom_name = factor × đơn vị gốc, barcode riêng theo quy cách. Permission: `kho.item.write`

```json
{ "sku": "BIA-333", "uom_name": "thùng", "factor": "24", "is_purchase": true, "barcode": "8934822101343" }
```

**Hội thoại mẫu:**
> **User:** Bia 333 một thùng 24 lon, mã vạch thùng là 8934822101343.
> **Tiểu Tâm:** → "Đã khai quy đổi: 1 thùng = 24 lon cho BIA-333."

## kho.stock.receive 🔒 L2
**NHẬP KHO (PNK/01-VT)**: tăng tồn + ghi sổ + avg_cost; hỗ trợ `uom` quy đổi + lot/serial/expiry. Permission: `kho.stock.write`

```json
{ "sku": "BIA-333", "quantity": "2", "uom": "thùng", "unit_cost": "240000" }
```
→ tự hiểu 48 lon @10.000đ/lon.

**Hội thoại mẫu (dry-run→confirm):**
> **User:** Hàng về 2 thùng bia, 240 nghìn một thùng.
> **Tiểu Tâm:** gọi action lượt 1 → nhận preview → "Em sắp nhập: **2 thùng Bia 333 = 48 lon**, đơn giá quy về **10.000đ/lon**, vào Kho chính. Xác nhận nhé?"
> **User:** OK.
> **Tiểu Tâm:** gọi lại `{...input, confirm: true}` → đọc message: "Đã nhập kho (PNK-000004): Bia 333 vào KHO-CHINH. Tồn hiện tại: 48 lon."

**Lỗi:** `ITEM_NOT_FOUND` → đề nghị tạo mới; `LOT_REQUIRED` → hỏi số lô; `UOM_NOT_FOUND` → liệt kê đơn vị đã khai.

## kho.stock.issue 🔒 L2
**XUẤT KHO (PXK/02-VT)**: guard khả dụng, hỗ trợ `uom` + lot/serial. Permission: `kho.stock.write`
Quy trình hàng có lô: `kho.picking.suggest` trước → issue theo plan.

**Lỗi `INSUFFICIENT_STOCK`** — details có requested/stocked/reserved/available:
> "Chỉ còn **20 lon khả dụng** (tồn 35, đang giữ 15) — không đủ xuất 30. Xuất 20 trước hay giải phóng phần giữ?"

## kho.stock.transfer 🔒 L2
**CHUYỂN KHO** atomic 2 chiều. Permission: `kho.stock.write`
`{ sku, from_location_code, to_location_code, quantity, note? }`

## kho.reservation.manage 🔒 L1
**ĐẶT GIỮ HÀNG**: create / release / fulfill / list. Permission: `kho.reservation.write`
Tiểu Tâm **ghi nhớ reservation_id** từ create để fulfill/release sau.

**Hội thoại mẫu (chuỗi):**
> **User:** Giữ 20 lon bia cho anh Tùng, mai lấy.
> **Tiểu Tâm:** create → "Đã giữ 20 (phiếu a1b2c3d4). Khả dụng còn 28."
> **User (hôm sau):** Anh Tùng lấy rồi.
> **Tiểu Tâm:** fulfill id đã nhớ → "Đã xuất 20 theo phiếu giữ. Tồn còn 28."

## kho.stocktake.execute 🔒 L2
**KIỂM KÊ (KK/05-VT)**. Permission: `kho.stocktake.write`
Quy trình 2 bước: `finalize: false` xem lệch → user duyệt → `finalize: true` chốt (+doc KK-).

**Hội thoại mẫu:**
> **User:** Kiểm kho: bia đếm 46, sữa lô L-B đếm 40.
> **Tiểu Tâm:** (bước 1, finalize:false) → "Đối chiếu: Bia sổ 48/đếm 46 → **lệch −2**; Sữa L-B khớp. Chốt điều chỉnh?" → OK → (bước 2, confirm+finalize:true) → "Đã chốt kiểm kê (KK-000001): 2 dòng, 1 dòng lệch đã điều chỉnh và ghi sổ."

## kho.bom.upsert ⭐ v2
Tạo/cập nhật **ĐỊNH MỨC (BOM)**: lines nguyên liệu (component_sku, qty_per, scrap_pct), output_qty mỗi mẻ. Thay toàn bộ BOM cũ. Permission: `kho.item.write`

```json
{ "sku": "COMBO-QUA", "output_qty": "1", "lines": [
  { "component_sku": "RUOU-VANG", "qty_per": "1" },
  { "component_sku": "BANH-QUY", "qty_per": "2", "scrap_pct": "5" }
]}
```

## kho.assembly.execute 🔒 L2 ⭐ v2
**LẮP RÁP/THÁO DỠ** theo BOM. Permission: `kho.stock.write`
`{ sku, qty, kind: "assemble"|"disassemble", location_code?, note? }`
- assemble: guard đủ MỌI nguyên liệu (kèm scrap%) → trừ NL (backflush) + cộng thành phẩm + **giá vốn = Σ(NL × avg_cost)/qty** → doc LSX-
- disassemble: trừ thành phẩm + hoàn NL (không hoàn phần hao hụt) → doc LTD-

**Hội thoại mẫu:**
> **User:** Lắp 3 giỏ quà Tết.
> **Tiểu Tâm:** lượt 1 → preview → "Lắp 3 giỏ sẽ trừ: 3 rượu vang + 6 bánh quy. Giá vốn dự kiến ~250.000đ/giỏ. Chạy nhé?" → OK → confirm → "Đã lắp 3 COMBO-QUA (LSX-000001), giá vốn 250000đ/đơn vị. Nguyên liệu đã trừ tự động."

**Lỗi `INSUFFICIENT_COMPONENT`**: details có component_sku + need → "Thiếu rượu vang (cần 8, còn 7). Nhập thêm hay lắp 7 giỏ trước?"

## kho.reorder.rule_upsert ⭐ v2
Đặt **RULE min-max** (+location, NCC, lead time). Permission: `kho.item.write`
`{ sku, min_qty, max_qty, location_code?, supplier_name?, lead_time_days? }`

## kho.stock.scrap 🔒 L2 ⭐ v2
**HỦY HÀNG HỎNG (SCR)**: trừ tồn khả dụng, ghi sổ scrap + loss_value theo avg_cost. Permission: `kho.stock.write`

**Hội thoại mẫu:**
> **User:** 5 hộp sữa lô L-A bị vỡ, hủy đi.
> **Tiểu Tâm:** lượt 1 → "Hủy 5 hộp Sữa TH lô L-A, thiệt hại ước tính ~50.000đ (theo giá vốn). Xác nhận?" → OK → "Đã hủy 5 hộp Sữa TH 1L (SCR-000001). Giá trị thiệt hại ước tính: 50000.00đ."

## kho.landed_cost.apply 🔒 L2 ⭐ v2
**PHÂN BỔ CHI PHÍ (LC)** vận chuyển/thuế NK vào phiếu nhập → cập nhật avg_cost. Permission: `kho.stock.write`
`{ movement_doc_nos: ["PNK-000001"], total_cost, method: "by_value"|"by_qty", note? }`

**Hội thoại mẫu:**
> **User:** Lô bia PNK-000001 tốn thêm 96 nghìn tiền ship, cộng vào giá vốn.
> **Tiểu Tâm:** lượt 1 → "Phân bổ 96.000đ vào PNK-000001 (48 lon) theo số lượng → +2.000đ/lon, giá vốn mới 12.000đ. Chạy?" → OK → "Đã phân bổ 96000đ chi phí (LC-000001) vào 1 dòng nhập — giá vốn đã cập nhật."

## kho.abc.run ⭐ v2
**CHẠY PHÂN LOẠI ABC** theo giá trị xuất N ngày (mặc định 90): A=80% giá trị đầu, B=15% kế, C=còn lại → ghi `abc_class` vào item. Permission: `kho.stocktake.write`

## kho.replenish.params_set ⭐ v2.1
**THIẾT LẬP THAM SỐ BỔ HÀNG** cho mặt hàng — hệ TỰ TÍNH từ lịch sử xuất thật. Permission: `kho.item.write`

| Trường | Mặc định | Ý nghĩa |
|---|---|---|
| `sku` | ✔ | |
| `service_level` | 0.95 | Độ phủ mong muốn: 0.90 / 0.95 / 0.99 (cao hơn = tồn an toàn nhiều hơn) |
| `lead_time_days` | 7 | NCC giao mất mấy ngày |
| `order_cost` | 0 | Chi phí mỗi lần đặt (vận chuyển, thủ tục) — cần cho EOQ |
| `holding_cost_pct` | 0.20 | % chi phí lưu kho/năm — cần cho EOQ |

Công thức: safety_stock = z(service)×stddev×√lead_time · reorder_point = nhu_cầu_ngày×lead_time + safety_stock · EOQ = √(2×nhu_cầu_năm×order_cost / (giá_vốn×holding%)).

**Hội thoại mẫu:**
> **User:** Tính điểm đặt lại cho bia, độ phủ 95%, NCC giao 7 ngày, mỗi lần đặt tốn 100k, lưu kho 20%/năm.
> **Tiểu Tâm:** gọi action → "Đã tính tham số bổ hàng cho BIA-333: điểm đặt lại 7.778, tồn an toàn 0, EOQ 201." → giải thích thêm: "Tồn an toàn = 0 vì bia anh bán cực đều — khỏi cần đệm."

## kho.xyz.run ⭐ v2.1
**PHÂN LOẠI XYZ** (X ổn định / Y dao động / Z thất thường theo hệ số biến động cv) + kết hợp ABC thành **ma trận 9 ô** kèm chiến lược từng ô. Permission: `kho.stocktake.write`
Tự tính demand stats trước nếu thiếu. Chạy `kho.abc.run` trước để ma trận đủ 2 trục.

**Hội thoại mẫu:**
> **User:** Hàng nào nên tự động hóa đặt hàng?
> **Tiểu Tâm:** chạy abc.run → xyz.run → "Ma trận ABC-XYZ: nhóm **AX** (giá trị cao + bán ổn định) có 3 mặt hàng — đây là nhóm vàng để tự động hóa: đặt điểm đặt lại + để hệ nhắc. Nhóm **AZ** (giá trị cao + thất thường) 1 mặt hàng — nên mua theo đơn, đừng ôm tồn."

## kho.automation.run ⭐ v2.1
**CHẠY TÁC VỤ ĐỊNH KỲ** — pipeline: tái tính demand stats → forecast (MA/SES) → cập nhật reorder point/safety stock → quét cảnh báo. Permission: `kho.stocktake.write`
Host nên gọi hằng ngày qua cron (`runScheduledTasks` export sẵn). Tiểu Tâm gọi khi người dùng bảo "cập nhật dự báo". Mọi lần chạy ghi log `kho_automation_runs` — minh bạch, không chạy ngầm.

**Hội thoại mẫu:**
> **User:** Cập nhật lại dự báo kho đi.
> **Tiểu Tâm:** gọi action → "Đã chạy automation: cập nhật 12 thống kê nhu cầu, 12 dự báo. Phát hiện **2 hàng cần bổ**, **1 hàng chết**. Anh muốn xem chi tiết nhóm nào trước?"

---

# Bảng tra nhanh: người dùng nói gì → gọi gì

| Người dùng nói | Định nghĩa | Loại |
|---|---|---|
| "còn bao nhiêu / tồn kho" | `kho.stock.query` | tool |
| "sắp hết hàng gì" | `kho.stock.low_alerts` | tool |
| "hàng cận date / lô sắp hết hạn" | `kho.lot.expiry_alerts` | tool |
| "thẻ kho / lịch sử / truy nguyên" | `kho.report.stock_card` | tool |
| "kho đang thế nào / tổng quan" | `kho.report.summary` | tool |
| "xuất lô nào trước / fefo" | `kho.picking.suggest` | tool ⭐ |
| "định mức / lắp được bao nhiêu" | `kho.bom.info` | tool ⭐ |
| "cần đặt hàng gì / lên đơn nhập" | `kho.reorder.suggest` | tool ⭐ |
| "hàng tồn lâu / nên kiểm gì" | `kho.analytics.report` | tool ⭐ |
| "quét mã / mã vạch này là gì" | `kho.barcode.lookup` | tool ⭐ |
| "thêm mặt hàng" | `kho.item.upsert` | action |
| "một thùng bằng bao nhiêu / quy cách" | `kho.uom.upsert` | action ⭐ |
| "nhập kho / hàng về" | `kho.stock.receive` | action 🔒 |
| "xuất kho / giao hàng" | `kho.stock.issue` | action 🔒 |
| "chuyển kho" | `kho.stock.transfer` | action 🔒 |
| "giữ hàng / khách lấy hàng giữ" | `kho.reservation.manage` | action 🔒 |
| "kiểm kê / chốt số" | `kho.stocktake.execute` | action 🔒 |
| "tạo định mức / công thức" | `kho.bom.upsert` | action ⭐ |
| "lắp ráp / tháo dỡ / sản xuất" | `kho.assembly.execute` | action 🔒⭐ |
| "đặt min max / rule đặt hàng" | `kho.reorder.rule_upsert` | action ⭐ |
| "hủy hàng hỏng / hàng vỡ" | `kho.stock.scrap` | action 🔒⭐ |
| "cộng phí ship vào giá vốn" | `kho.landed_cost.apply` | action 🔒⭐ |
| "chạy phân loại abc" | `kho.abc.run` | action ⭐ |
| "bổ hàng thông minh / cần đặt gì theo dự báo" | `kho.replenish.suggest` | tool ⭐v2.1 |
| "bao lâu nữa hết hàng / sắp cạn" | `kho.forecast.projected` | tool ⭐v2.1 |
| "hàng chết / hàng ế / vốn đọng" | `kho.analytics.dead_stock` | tool ⭐v2.1 |
| "tính điểm đặt lại / tồn an toàn" | `kho.replenish.params_set` | action ⭐v2.1 |
| "phân loại xyz / hàng nào ổn định" | `kho.xyz.run` | action ⭐v2.1 |
| "cập nhật dự báo / chạy automation" | `kho.automation.run` | action ⭐v2.1 |

🔒 = sensitive, dry-run→confirm. ⭐ = mới ở v2.0.

# Bảng mã lỗi → cách Tiểu Tâm phản hồi

| code | Nghĩa | Phản hồi gợi ý |
|---|---|---|
| `ITEM_NOT_FOUND` | SKU chưa khai | "Chưa có trong danh mục, em tạo mới nhé?" → `kho.item.upsert` |
| `LOCATION_NOT_FOUND` | Kho chưa tồn tại | "Kho X chưa có, tạo không?" |
| `INSUFFICIENT_STOCK` | Không đủ khả dụng | Đọc số thật từ details, đề xuất phương án |
| `LOT_REQUIRED` | Item track lot/serial mà thiếu | Hỏi số lô/serial; gợi ý `picking.suggest` |
| `LOT_NOT_FOUND` | Lô/serial không tồn tại | Liệt kê lô hiện có từ `kho.stock.query` |
| `RESERVATION_NOT_ACTIVE` | Phiếu giữ đã xử lý | Báo trạng thái thật |
| `UOM_NOT_FOUND` | Đơn vị chưa khai quy đổi | "Đơn vị 'X' chưa khai — khai bằng kho.uom.upsert nhé?" |
| `BARCODE_NOT_FOUND` | Mã vạch lạ | "Mã chưa có trong danh mục — gắn vào mặt hàng nào?" |
| `BOM_NOT_FOUND` | Thành phẩm chưa có định mức | "Chưa có BOM — tạo bằng kho.bom.upsert" |
| `BOM_EMPTY` | BOM không có dòng NL | Yêu cầu ít nhất 1 nguyên liệu |
| `INSUFFICIENT_COMPONENT` | Thiếu nguyên liệu khi lắp | Đọc component + need từ details, đề xuất nhập thêm/giảm số lượng |
| `MOVEMENT_NOT_FOUND` | Phiếu nhập không tồn tại (LC) | Kiểm tra lại số PNK- |
| `LANDED_COST_INVALID` | Thiếu phiếu / trọng số 0 | Đọc message, đổi method by_qty nếu phiếu không có giá |
