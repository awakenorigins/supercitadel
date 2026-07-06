# CRM (crm)

## Giới thiệu
Module CRM (trả phí, 400 Om) quản lý khách hàng và pipeline bán hàng 5 giai đoạn (lead → contact → negotiation → won/lost). Tiểu Tâm đọc được dữ liệu deal/contact qua tool để trả lời câu hỏi kinh doanh.

## Chức năng
| Tên | Endpoint | Quyền cần | Mô tả |
|---|---|---|---|
| Danh sách khách hàng | GET /api/v1/crm/contacts | crm:contacts:read | Contacts của tổ chức |
| Thêm khách hàng | POST /api/v1/crm/contacts | crm:contacts:write | Tên + SĐT/ghi chú |
| Danh sách deal | GET /api/v1/crm/deals | crm:deals:read | Deal kèm giá trị + giai đoạn |
| Tạo deal | POST /api/v1/crm/deals | crm:deals:write | Tên deal, giá trị, gắn khách hàng |
| Chuyển giai đoạn deal | PATCH /api/v1/crm/deals/:id/stage | crm:deals:write | Kéo deal qua pipeline (5 stage) |
| Thống kê | GET /api/v1/crm/stats | crm:deals:read | Tổng deal mở, tổng giá trị, theo stage |

## Hướng dẫn sử dụng
1. Mua + kích hoạt module CRM trong **Cửa hàng Module** (/modules) nếu chưa bật.
2. Mở trang **CRM** — kanban 5 cột theo giai đoạn.
3. Bấm **+ Khách** để thêm khách hàng, **+ Deal** để tạo deal (nhập giá trị, vd "22,5tr").
4. Chạm vào deal để chuyển giai đoạn — cập nhật thật vào server ngay.

## Ví dụ (hỏi Tiểu Tâm)
- **"Có bao nhiêu deal đang mở?"** → Tiểu Tâm đọc CRM stats: số deal mở + tổng giá trị + deal nào cần follow-up.
- **"Thêm khách hàng Cô Hoa"** → Vào CRM, bấm + Khách, nhập tên Cô Hoa và SĐT rồi lưu.

## Changelog
- 1.0.0: Contacts, deals, pipeline 5 stage, stats; Tiểu Tâm đọc qua tool crm.query_deals/crm.query_contacts.
