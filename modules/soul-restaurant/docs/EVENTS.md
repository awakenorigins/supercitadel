# SOUL-RESTAURANT — EVENTS.md · Bản khai sự kiện (mặt cắt ⑤)

Module **chỉ** giao tiếp ra ngoài qua event bus — không import module khác.
Tên chuẩn `domain.event`, **mọi payload mang `org_id`** (smoke test khẳng định
100% event bắn ra có org_id).

## Bảng sự kiện (38)

| Event | Khi nào | Payload chính (ngoài org_id) |
|---|---|---|
| `resto.module.installed/activated/disabled/removed` | vòng đời module | `version?` |
| `resto.settings.updated` | đổi cấu hình | các khóa đã đổi |
| `resto.table.upserted` | thêm/sửa bàn | `table, area` |
| `resto.table.updated` | đổi trạng thái bàn | `table, status` |
| `resto.menu.item_upserted` | thêm/sửa món/combo | `sku, name, kind, price` |
| `resto.menu.availability_changed` | báo hết/mở bán | `name, sold_out` |
| `resto.recipe.updated` | khai định lượng | `item, lines` |
| `resto.order.opened` | mở đơn | `order_code, type, table?` |
| `resto.order.items_added` | gọi món | `order_code, items[{name,qty,line_total}], totals` |
| `resto.order.item_cancelled` | hủy món | `order_code, item, qty, reason, was_sent` |
| `resto.order.discounted` | giảm giá | `order_code, discount_type, value, reason?` |
| `resto.order.moved` | chuyển bàn | `order_code, from, to` |
| `resto.orders.merged` | gộp bàn | `from_order, to_order, moved_items` |
| `resto.order.sent` | gửi bếp | `order_code, kots[]` |
| `resto.order.served` | lên món | `order_code, served[]` |
| `resto.order.cancelled` | hủy đơn | `order_code, reason, cancelled_items` |
| `resto.order.closed` | đơn tất toán | `order_code, grand_total` |
| `resto.kot.created` | phiếu bếp sinh | `kot_code, station, items[] (đủ để IN PHIẾU)` |
| `resto.kot.updated` | phiếu đổi trạng thái | `kot_code, status, items_updated` |
| `resto.bill.created` | chốt/tách bill | `bill_code, order_code, grand_total, items` |
| `resto.bill.paid` | bill đủ tiền | `bill_code, grand_total, method` |
| `resto.bill.voided` | hủy bill chưa thu | `bill_code, reason` |
| `resto.payment.recorded` | mỗi lần thu | `bill_code, method, amount(=áp vào), change` |
| `resto.reservation.created` | đặt bàn mới | `code, customer_name, at, table?` |
| `resto.reservation.updated` | confirm/seat/cancel/no_show | `code, status, order_code?` |
| `resto.promo.upserted` | tạo/sửa khuyến mãi | `promo_id, code, kind` |
| `resto.promo.applied` | áp mã vào đơn | `order_code, code, discount_amount` |
| `resto.promo.removed` | gỡ mã khỏi đơn | `order_code` |
| `resto.customer.upserted` | tạo/sửa khách thân thiết | `customer_id, phone, name` |
| `resto.order.customer_set` | gắn khách vào đơn | `order_code, customer_id, phone` |
| `resto.loyalty.earned` | tích điểm khi đơn đóng | `customer_id, order_code, points, balance_after` |
| `resto.loyalty.redeemed` | đổi điểm trả tiền | `customer_id, order_code, points, balance_after` |
| `resto.loyalty.adjusted` | điều chỉnh điểm tay | `customer_id, points, balance_after, reason` |
| `resto.order.course_fired` | ra món theo lượt (fire-by-course) | `order_code, course, kots` |
| `resto.stock.deduct_requested` | **cầu nối trừ kho** | xem dưới |

## ⭐ `resto.stock.deduct_requested` — hợp đồng với Soul-Inventory

Phát khi **thanh toán xong** (`deduct_on: "paid"`, mặc định) hoặc khi **lên món**
(`"served"`), nếu `auto_deduct_stock: true`.

```jsonc
{
  "org_id": "…",
  "order_code": "DH-260706-XXXX",
  "trigger": "paid",                     // 'paid' | 'served'
  "reason": "Bán hàng đơn DH-…",
  "lines": [                              // GỘP THEO SKU, combo ĐÃ BUNG thành phần
    { "sku": "BP-01", "name": "Bánh phở", "qty": "0.400", "unit": "kg" },
    { "sku": "TB-02", "name": "Thịt bò",  "qty": "0.300", "unit": "kg" },
    { "sku": "TRA-01","name": "Trà",      "qty": "0.010", "unit": "kg" }
  ],
  "missing_recipe": ["Cà phê sữa"]        // món bán ra nhưng CHƯA khai định lượng
}
```

Bảo đảm: `qty` là chuỗi scale-3 (đã nhân số phần bán × định lượng, BigInt);
mỗi SKU xuất hiện **một dòng duy nhất**; combo được thay bằng recipe của từng
thành phần × số lượng thành phần trong combo.

### Host wiring gợi ý (đã kèm trong WIRING.patch)

```ts
// services/api/src/outbox.ts — trong registerBuiltinOutboxSubscribers
subscribeOutbox('resto.stock.deduct_requested', async (ev, { db }) => {
  const p = ev.payload as any;
  const issue = soulInventory.getKhoTool('kho.stock.issue');
  if (!issue) return; // chưa cài Soul-Inventory → bỏ qua, quán vẫn chạy
  await db.transaction(async (tx: any) => {           // all-or-nothing
    await tx.execute(sql`SELECT set_config('app.current_org_id', ${ev.orgId}, true)`);
    const ctx = { db: tx, orgId: ev.orgId, bus: { emit: async () => {} } };
    for (const l of p.lines ?? []) {
      await issue.handler(ctx, {
        sku: l.sku, quantity: l.qty,
        note: `${p.reason ?? 'Bán hàng'} (${p.order_code})`,
      });
    }
  });
});
```

Cơ chế giao nhận: module ghi event bằng `emitTx` vào **transactional outbox**
của host (cùng tx với thanh toán — rollback đơn = rollback event); dispatcher
poll 2s, retry ≤5, lỗi lưu `last_error`. Handler bọc 1 transaction nên retry
chỉ xảy ra khi CẢ lô fail (không trừ nửa vời). Trường hợp hiếm handler xong
nhưng đánh dấu dispatched fail → có thể trừ lặp: nếu cần chặt hơn, thêm khóa
idempotency `(org_id, order_code, trigger)` phía consumer.

## Sự kiện lắng nghe (subscribes)

v1 **không** subscribe event nào — module tự đủ. (v1.1 dự kiến nghe
`kho.stock.low` để tự báo hết món theo tồn nguyên liệu.)
