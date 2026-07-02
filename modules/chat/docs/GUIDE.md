# Nhắn Tin (chat)

## Giới thiệu
Module Nhắn Tin (free, mặc định) cung cấp chat nội bộ real-time cho tổ chức: phòng nhóm/cá nhân, tin nhắn đẩy qua WebSocket, đánh dấu đã đọc — toàn bộ tenant-isolated theo org.

## Chức năng
| Tên | Endpoint | Quyền cần | Mô tả |
|---|---|---|---|
| Danh sách phòng | GET /api/v1/chat/rooms | chat:read | Phòng của user kèm tin cuối + số chưa đọc |
| Tạo phòng | POST /api/v1/chat/rooms | chat:write | Phòng nhóm hoặc 1-1, chọn thành viên trong org |
| Xem tin nhắn | GET /api/v1/chat/rooms/:id/messages | chat:read | Lịch sử tin nhắn của phòng (phải là thành viên) |
| Gửi tin nhắn | POST /api/v1/chat/rooms/:id/messages | chat:write | Gửi text — đẩy real-time tới thành viên qua WS event `chat:message` |
| Đánh dấu đã đọc | PUT /api/v1/chat/rooms/:id/read | chat:read | Reset số chưa đọc của user trong phòng |

## Hướng dẫn sử dụng
1. Mở trang **Chat** (menu /chat) — danh sách phòng hiện bên trái kèm badge chưa đọc.
2. Bấm **bút chì** để tạo phòng mới → chọn thành viên trong tổ chức → đặt tên.
3. Chọn phòng → gõ tin nhắn → Enter để gửi; tin đến real-time không cần refresh.
4. Mở phòng là tự đánh dấu đã đọc.

## Ví dụ (hỏi Tiểu Tâm)
- **"Tạo phòng chat cho team ca tối"** → Vào Chat, bấm bút chì, chọn các thành viên ca tối, đặt tên phòng rồi tạo.
- **"Tôi có tin nhắn nào chưa đọc không?"** → Xem badge chưa đọc trên danh sách phòng ở trang Chat (chuông ở Home cũng gộp thông báo).

## Changelog
- 1.0.0: Phòng nhóm/1-1, tin nhắn real-time WebSocket, đánh dấu đã đọc, tenant isolation.
