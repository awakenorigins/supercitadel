# Thông Báo (notification)

## Giới thiệu
Module Thông Báo (free, mặc định) gom mọi thông báo của hệ thống về một chỗ: đẩy real-time qua WebSocket (event `notification`), badge chưa đọc trên chuông ở Home, đánh dấu đã đọc từng cái hoặc tất cả.

## Chức năng
| Tên | Endpoint | Quyền cần | Mô tả |
|---|---|---|---|
| Danh sách thông báo | GET /api/v1/notifications | notification:read | Thông báo của user, mới nhất trước, kèm số chưa đọc |
| Đánh dấu đã đọc | PUT /api/v1/notifications/:id/read | notification:write | Đọc 1 thông báo |
| Đọc tất cả | PUT /api/v1/notifications/read-all | notification:write | Xóa hết badge chưa đọc |

## Hướng dẫn sử dụng
1. Bấm **chuông** ở Home (badge đỏ = số chưa đọc) → mở trang /notifications.
2. Chạm 1 thông báo để đánh dấu đã đọc, hoặc bấm **Đọc tất cả**.
3. Thông báo mới đến real-time — không cần refresh.

## Ví dụ (hỏi Tiểu Tâm)
- **"Tôi có thông báo gì mới không?"** → Xem chuông ở Home; Tiểu Tâm tóm tắt các thông báo chưa đọc gần nhất.
- **"Xóa hết badge thông báo giúp tôi"** → Vào /notifications và bấm Đọc tất cả.

## Changelog
- 1.0.0: Danh sách + read/read-all + đẩy real-time WS + badge chuông Home.
