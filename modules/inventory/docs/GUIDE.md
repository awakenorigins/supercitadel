# Kho Hàng (inventory)

## Giới thiệu
Module Kho Hàng (trả phí, 300 Om) theo dõi tồn kho vật tư/nguyên liệu: số lượng, ngưỡng cảnh báo sắp hết, nhập/xuất điều chỉnh — giúp quán không bao giờ hết nguyên liệu giữa ca.

## Chức năng
| Tên | Endpoint | Quyền cần | Mô tả |
|---|---|---|---|
| Danh sách mặt hàng | GET /api/v1/inventory/items | inventory:read | Tên, đơn vị, số lượng, ngưỡng báo |
| Thêm mặt hàng | POST /api/v1/inventory/items | inventory:write | Tên + SL ban đầu + ngưỡng "báo khi ≤ X" |
| Điều chỉnh số lượng | PATCH /api/v1/inventory/items/:id/qty | inventory:write | Cộng/trừ delta (nhập hàng/xuất dùng) |
| Sửa mặt hàng | PATCH /api/v1/inventory/items/:id | inventory:write | Đổi tên/đơn vị/ngưỡng báo |
| Hàng sắp hết | GET /api/v1/inventory/low-stock | inventory:read | Mặt hàng có qty ≤ ngưỡng báo |

## Hướng dẫn sử dụng
1. Kích hoạt module trong **Cửa hàng Module** nếu chưa bật, rồi mở trang **Kho** (/inventory).
2. Bấm **+ mặt hàng**: nhập Tên / Số lượng / Báo≤ (ngưỡng cảnh báo — không phải giới hạn).
3. Nhập thêm hàng hoặc xuất dùng bằng nút +/− trên từng dòng.
4. Mặt hàng chạm ngưỡng hiện trong danh sách **sắp hết** — nhớ đặt hàng trước giờ cao điểm.

## Ví dụ (hỏi Tiểu Tâm)
- **"Kho còn gì sắp hết?"** → Tiểu Tâm đọc low-stock: mặt hàng nào chạm ngưỡng, còn bao nhiêu, gợi ý đặt trước giờ cao điểm.
- **"Nhập thêm 50 hộp sữa"** → Vào Kho, tìm mặt hàng Sữa, bấm + và nhập 50.

## Changelog
- 1.1.0 (v6.1): Sửa mặt hàng (tên/đơn vị/ngưỡng), UI form đầy đủ.
- 1.0.0 (v6): Items + qty ± + cảnh báo low-stock.
