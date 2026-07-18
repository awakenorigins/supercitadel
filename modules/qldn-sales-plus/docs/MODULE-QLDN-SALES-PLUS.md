# QLDN — Sales Plus

## Giới thiệu
Bổ sung lớp sales-plus cho đổi trả, khuyến mãi, thầu bán, field visit, nhượng quyền, XNK và trạng thái fulfillment. Module chỉ giữ soft reference tới CRM/OM, không tạo customer/order master mới.

## Chức năng
| Endpoint | Mục đích | Quyền |
|---|---|---|
| GET /api/v1/qldn-sales-plus/health | Healthcheck loader | qldn-sales-plus.read |
| qsa_* schema | Nền tảng dữ liệu Beat 15 | qldn-sales-plus.write |

## Hướng dẫn sử dụng
Dùng CRM `crm_contacts`/`crm_deals` làm customer/lead source-of-truth; dùng `sales_order_id` soft ref cho order hiện hữu hoặc order contract ở service beat sau.

## Ví dụ
- **"Tạo hồ sơ đổi trả cho đơn X"** → ghi `qsa_return_requests` + lines, phát event cho inventory ở beat dịch vụ.
- **"Theo dõi bảo lãnh thầu bán ABC"** → ghi `qsa_sales_tenders` + `qsa_tender_guarantees`, không lẫn với bid mua `qpr_bid_projects`.

## Changelog
- 1.0.0: Beat 15 schema foundation, manifest and tests.
