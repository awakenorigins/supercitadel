# SOUL-RESTAURANT — TUTORIAL.md · Một ca bán hàng từ A→Z (số thật từ smoke test)

Kịch bản: quán phở, phí phục vụ 5%, VAT 8% **gộp trong giá**. Mọi con số dưới đây
được `tests/smoke.test.ts` chứng minh từng đồng.

## Bước 0 — Cấu hình & menu (làm một lần)

> **Chủ quán:** "Tiểu Tâm, đặt phí phục vụ 5%, VAT 8% gộp trong giá."
→ `resto.settings.update { service_charge_pct: "5", tax_pct: "8", price_includes_tax: true }` 🔒 xác nhận.

> "Thêm bàn 5 khu tầng 1, 6 chỗ." → `resto.table.upsert`

> "Thêm món phở bò 45 nghìn, bếp nóng, có tùy chọn thêm trứng +5k, thêm bánh +5k, chọn tối đa 2."
→ `resto.menu.upsert { name:"Phở bò", price:"45000", station:"Bếp nóng",
   options:[{group:"Thêm", max:2, choices:[{name:"Thêm trứng",price_delta:"5000"},{name:"Thêm bánh",price_delta:"5000"}]}] }`

> "Khai định lượng phở bò: 0,2kg bánh phở BP-01, 0,15kg thịt bò TB-02."
→ `resto.recipe.set` — cầu nối trừ kho Soul-Inventory.

## Bước 1 — Khách vào

> **Nhân viên:** "Mở bàn 5, 4 khách."
→ `resto.table.open { table:"5", guests:4 }` → `DH-xxxxxx`, bàn 5 chuyển `occupied`.
(Mở lại bàn đang có khách → Tiểu Tâm báo `TABLE_BUSY` kèm mã đơn để gọi món tiếp.)

## Bước 2 — Gọi món

> "Bàn 5 gọi 2 phở bò thêm trứng với 1 trà đá."
→ `resto.order.add_items`

| Dòng | Tính | Thành tiền |
|---|---|---|
| Phở bò ×2 (Thêm trứng) | (45.000 + 5.000) × 2 | **100.000** |
| Trà đá ×1 | 5.000 × 1 | **5.000** |
| **Tạm tính** | | **105.000** |

## Bước 3 — Giảm giá ⚠️

> "Giảm 10% bàn 5, khách quen." → preview → "OK" → `confirm: true`

```
Giảm 10%            −10.500
Sau giảm             94.500
Phí phục vụ 5%       +4.725
────────────────────────────
PHẢI TRẢ (gộp VAT)   99.225   (trong đó VAT 8% = 99.225×8/108 = 7.350)
```

## Bước 4 — Gửi bếp

> "Gửi bếp bàn 5." → `resto.order.send_kitchen` → **2 phiếu KOT tách theo trạm**:
`KOT-…` Bếp nóng (2 Phở bò · ghi chú "ít hành") + `KOT-…` Bar (1 Trà đá).

Bếp xem hàng đợi: *"Bếp nóng đang có phiếu nào?"* → `resto.kds.queue` (FIFO + tuổi phút).
Bếp bấm: `resto.kds.update { status:"preparing" }` → `{ status:"ready" }`
(lùi trạng thái → bị chặn `INVALID_STATUS_FLOW`).

## Bước 5 — Lên món

> "Lên món bàn 5." → phục vụ món `ready` (2 phở). Trà làm nhanh, chưa qua KDS:
> "Lên trà đá bàn 5 luôn." → `resto.order.serve { items:["Trà đá"] }` — phiếu Bar tự `completed`.

## Bước 6 — Thanh toán một câu 🔒

> "Tính tiền bàn 5, khách đưa 200 nghìn tiền mặt." → preview → "OK"
→ `resto.bill.pay { table:"5", method:"cash", amount:"200000", confirm:true }`

Tiểu Tâm trả lời (message dựng sẵn từ số thật):
> ✅ **Đã thu 99.225₫** (tiền mặt) cho BILL-… — **Thối lại 100.775₫**. Đơn DH-… **đã đóng**, bàn 5 đã trống. Đã gửi yêu cầu trừ kho: BP-01 ×0,400kg · TB-02 ×0,300kg · TRA-01 ×0,010kg.

Đằng sau một câu đó: tự tạo full bill (chưa ai in bill) → ghi payment **99.225**
(không phải 200.000 — tiền thối không vào doanh thu) → bill `paid` → đơn hết nợ
→ đóng đơn, thả bàn → phát `resto.stock.deduct_requested` (combo nếu có sẽ bung
thành phần) → Soul-Inventory trừ kho.

## Bước 7 — Cuối ngày

> "Hôm nay bán được bao nhiêu?" → `resto.report.sales`
> — Doanh thu **342.825₫** · 6 bill / 4 đơn · TB **85.706,25₫/đơn** · tiền mặt 246.225 · bank 47.250 · momo 49.350.

> "Món nào bán chạy nhất?" → `resto.report.top_items` — **Phở bò: 6 phần, 280.000₫**.

## Bonus — Tách bill (bàn có 2 nhóm khách trả riêng)

Bàn gọi **2 dòng phở riêng** + 2 trà, giảm 10.000₫:
> "Tách bill: một phở tính riêng cho anh áo xanh."
→ bill A: 45.000 · giảm phân bổ **4.736,84** (=10.000×45/95) → **42.276,32₫**
→ bill B (phần còn lại): giảm nhận phần dư **5.263,16** → **46.973,68₫**
→ Σ giảm = 10.000 đúng từng xu · Σ phải trả = 89.250 = đúng tổng đơn.
