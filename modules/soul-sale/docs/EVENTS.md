# Soul-Sale 1A — EVENTS.md

## Emits (14)

| Topic | Khi nào | Payload chính |
|---|---|---|
| `soulsale.customer.created` | Tạo khách mới | `customer_id, code, kind` |
| `soulsale.customer.merged` | Gộp khách xong | `source_id, target_id, moved` |
| `soulsale.lead.created` | Ghi nhận lead | `lead_id, source` |
| `soulsale.lead.converted` | Convert lead | `lead_id, customer_id, deal_id, customer_reused` |
| `soulsale.deal.created` | Tạo deal | `deal_id, code, amount` |
| `soulsale.deal.moved` | Đổi stage (kể cả Thắng/Thua) | `deal_id, stage, status` |
| `soulsale.quote.created` | Tạo báo giá | `quote_id, code, total` |
| `soulsale.order.created` | **Xác nhận** đơn (có hiệu lực thương mại) | `order_id, code, customer_id, grand_total` |
| `soulsale.order.cancelled` | Hủy đơn | `order_id, code, customer_id, grand_total, reason` |
| `soulsale.payment.recorded` | Thu/hoàn tiền | `payment_id, code, order_id?, customer_id, kind, amount` |
| `soulsale.commission.posted` | Ghi sổ hoa hồng kỳ | `period, created, skipped, total` |
| `soulsale.debt.closed` | Chốt kỳ công nợ | `period, customers` |
| `soulsale.reconciliation.completed` | Chốt batch Splitter | `batch_id, code, period, agency_customer_id, revenue, suspense` |
| `soulsale.automation.ran` | Xong 6 job đêm | `period` + kết quả từng job |

Gợi ý cho module kế toán: nghe `soulsale.order.created` để sinh hoá đơn, `soulsale.payment.recorded` để sinh phiếu thu, `soulsale.order.cancelled` để sinh chứng từ đảo.

## Subscribes (3) — inbox pattern

| Topic | Xử lý |
|---|---|
| `accounting.invoice.created` | Ghi `ss_inbox_events` (org-scoped) — đối chiếu tay/AI |
| `accounting.payment.created` | Ghi inbox; nếu payload có `soulsale_order_id` → đánh dấu `processed=true` (đã link) |
| `kho.stock.low` | Ghi inbox — Tiểu Tâm cảnh báo sale trước khi hứa đơn |

V1 trung thực: module KHÔNG tự sinh bút toán chéo — chỉ ghi nhận vào inbox, giữ ranh giới module.
