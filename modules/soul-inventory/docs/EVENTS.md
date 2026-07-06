# SOUL-INVENTORY v2.0 — Catalog sự kiện (Event Bus)

> Mặt cắt ⑤: module giao tiếp với hệ thống **CHỈ qua event bus**.
> Tên chuẩn `kho.<resource>.<event>`, payload **LUÔN mang `org_id`**.
> Module khác (Kế toán, POS, CRM...) subscribe — KHÔNG import thẳng module.

## Sự kiện nghiệp vụ nền (v1.x)

| Event | Khi nào phát | Payload chính |
|---|---|---|
| `kho.item.upserted` | Tạo/cập nhật vật tư | `org_id, item_id, sku, name` |
| `kho.location.upserted` | Tạo/cập nhật địa điểm | `org_id, location_id, code` |
| `kho.lot.created` | Tạo lô/serial mới khi nhập | `org_id, lot_id, item_id, lot_no?/serial_no?` |
| `kho.stock.received` | Nhập kho thành công | `org_id, item_id, sku, location_*, lot_*, quantity, stocked, doc_no` |
| `kho.stock.issued` | Xuất kho thành công | `org_id, item_id, sku, location_*, lot_id?, quantity, stocked, doc_no` |
| `kho.stock.transferred` | Chuyển kho thành công | `org_id, item_id, sku, from_location, to_location, quantity` |
| `kho.stock.low` | Khả dụng chạm/dưới định mức sau xuất | `org_id, item_id, sku, location_id, available, min_stock` |
| `kho.reservation.created` | Tạo phiếu giữ | `org_id, reservation_id, item_id, sku, location_code, quantity` |
| `kho.reservation.released` | Hủy giữ | `org_id, reservation_id, item_id, quantity` |
| `kho.reservation.fulfilled` | Xuất phần đã giữ | `org_id, reservation_id, item_id, quantity` |
| `kho.stocktake.finalized` | Chốt kiểm kê | `org_id, stocktake_id, location_code, total_lines, lines_with_variance` |

## Sự kiện mới v2.0 ⭐

| Event | Khi nào phát | Payload chính |
|---|---|---|
| `kho.uom.upserted` | Khai đơn vị quy đổi | `org_id, item_id, uom_name, factor` |
| `kho.bom.upserted` | Tạo/cập nhật định mức | `org_id, bom_id, item_id, sku, lines` |
| `kho.assembly.done` | Lắp ráp/tháo dỡ xong | `org_id, doc_no, kind, item_id, sku, qty, unit_cost?` |
| `kho.reorder.rule_upserted` | Đặt rule min-max | `org_id, item_id, sku, min_qty, max_qty` |
| `kho.landed_cost.applied` | Phân bổ chi phí xong | `org_id, doc_no, total_cost, method, lines` |
| `kho.stock.scrapped` | Hủy hàng hỏng | `org_id, doc_no, item_id, sku, location_code, lot_id?, quantity, loss_value` |
| `kho.abc.analyzed` | Chạy phân loại ABC | `org_id, lookback_days, class_a, class_b, class_c` |
| `kho.excel.items_imported` | Nhập danh mục từ Excel | `org_id, total, ok, failed` |
| `kho.excel.stock_imported` | Nhập tồn đầu kỳ từ Excel | `org_id, total, ok, failed, ref` |

## Sự kiện AUTOMATION v2.1 ⭐

| Event | Khi nào phát | Payload chính |
|---|---|---|
| `kho.replenish.params_set` | Thiết lập tham số bổ hàng | `org_id, item_id, sku, reorder_point, safety_stock, eoq` |
| `kho.automation.ran` | Chạy xong pipeline định kỳ | `org_id, demand_stats_items, forecast_items, replenish_alerts, dead_stock_alerts` |

## Sự kiện vòng đời module

| Event | Khi nào |
|---|---|
| `kho.module.installed` | Migrations chạy xong (7 file, gồm backfill legacy + automation) |
| `kho.module.activated` | Đăng ký 29 tools/actions + 28 intents vào registry |
| `kho.module.disabled` | Thu hồi sạch đăng ký (dữ liệu giữ nguyên) |
| `kho.module.removed` | Gỡ hoàn toàn |

## Gợi ý tích hợp

- **Kế toán**: subscribe `kho.stock.received/issued` (có doc_no + unit_cost), `kho.assembly.done` (giá vốn thành phẩm), `kho.landed_cost.applied` (điều chỉnh giá vốn), `kho.stock.scrapped` (loss_value → chi phí) → bút toán tự động.
- **Tiểu Tâm insights**: subscribe `kho.stock.low` + `kho.automation.ran` → nhắc chủ động; host cron gọi `runScheduledTasks(ctx)` mỗi đêm rồi Tiểu Tâm đọc findings báo sáng.
- **POS**: subscribe `kho.reservation.*` đồng bộ trạng thái đơn.
- **Store/billing của host**: bán qua cửa hàng theo manifest.store — mua 1.000 Ôm / thuê 150 Ôm mỗi 30 ngày, trial 7 ngày.
