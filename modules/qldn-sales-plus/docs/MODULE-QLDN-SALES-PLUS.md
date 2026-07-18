# QLDN — Sales Plus

## Giới thiệu
Bổ sung lớp sales-plus cho đổi trả, khuyến mãi, thầu bán, field visit, nhượng quyền, XNK và trạng thái fulfillment. Module chỉ giữ soft reference tới CRM/OM, không tạo customer/order master mới.

## Chức năng
| Endpoint | Mục đích | Quyền |
|---|---|---|
| GET /api/v1/qldn-sales-plus/health | Healthcheck loader (không chứa dữ liệu tenant) | Không yêu cầu |
| `qsa_return_*` | Nền tảng hồ sơ đổi trả | `qldn-sales-plus.return.read/write` |
| `qsa_promotions`, `qsa_promotion_rules` | Nền tảng khuyến mãi | `qldn-sales-plus.promotion.read/write` |
| `qsa_sales_tenders`, `qsa_tender_guarantees` | Nền tảng thầu bán | `qldn-sales-plus.tender.read/write` |
| `qsa_field_visit*` | Nền tảng field visit | `qldn-sales-plus.visit.read/write` |
| `qsa_franchise_*` | Nền tảng nhượng quyền | `qldn-sales-plus.franchise.read/write` |
| `qsa_*shipments`, `qsa_shipment_lines` | Nền tảng shipment XNK | `qldn-sales-plus.shipment.read/write` |
| `qsa_fulfillment_*` | State overlay có version và event | `qldn-sales-plus.fulfillment.write` |

## Hướng dẫn sử dụng
Dùng CRM `crm_contacts`/`crm_deals` làm customer/lead source-of-truth; `customer_id`, `deal_id`, `sales_order_id`, `item_id`, `supplier_id` là soft reference liên module. Các quan hệ cha–con nội module dùng khóa ngoại ghép `(org_id, parent_id)`, nên không thể nối dữ liệu chéo tenant. Beat này là schema foundation; ngoài healthcheck chưa công bố CRUD endpoint.

## Ví dụ
- **"Tạo hồ sơ đổi trả cho đơn X"** → ghi `qsa_return_requests` + lines, phát event cho inventory ở beat dịch vụ.
- **"Theo dõi bảo lãnh thầu bán ABC"** → ghi `qsa_sales_tenders` + `qsa_tender_guarantees`, không lẫn với bid mua `qpr_bid_projects`.

## Changelog
- 1.0.0: Beat 15 schema foundation, manifest and tests.
