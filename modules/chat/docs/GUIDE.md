# Nhắn Tin (chat)

## Giới thiệu
Module Nhắn Tin (free, mặc định) cung cấp chat nội bộ real-time chuẩn doanh nghiệp: phòng nhóm/cá nhân/phòng ban, reply, reaction, ghim, sửa/thu hồi, gửi file, tìm kiếm, unread badge, typing, channel phòng ban đồng bộ Soul-Manager, và chế độ read-all compliance có audit — toàn bộ tenant-isolated theo org.

## Chức năng
| Tên | Endpoint | Quyền cần | Mô tả |
|---|---|---|---|
| Danh sách phòng | GET /api/v1/chat/rooms | chat:read | Phòng của user kèm tin cuối + số chưa đọc |
| Tạo phòng | POST /api/v1/chat/rooms | chat:write | Phòng nhóm hoặc 1-1, chọn thành viên trong org |
| Xem tin nhắn | GET /api/v1/chat/rooms/:id/messages | chat:read | Lịch sử tin nhắn của phòng (phải là thành viên) |
| Gửi tin nhắn | POST /api/v1/chat/rooms/:id/messages | chat:write | Gửi text — đẩy real-time tới thành viên qua WS event `chat:message` |
| Đánh dấu đã đọc | PUT /api/v1/chat/rooms/:id/read | chat:read | Reset số chưa đọc của user trong phòng |
| Unread tổng | GET /api/v1/chat/unread | chat:read | Số tin chưa đọc theo từng phòng (badge) |
| Tìm kiếm tin | GET /api/v1/chat/search?q= | chat:read | Tìm tin trong các phòng mình là thành viên |
| Đổi tên phòng | PATCH /api/v1/chat/rooms/:id | chat:write | Admin phòng đổi tên |
| Quản lý thành viên | GET/POST/DELETE /api/v1/chat/rooms/:id/members | chat:write | Xem/thêm/gỡ thành viên (admin phòng) |
| Vai trò trong phòng | PUT /api/v1/chat/rooms/:id/members/:userId/role | chat:write | Gán admin/member cho thành viên |
| Reaction | POST /api/v1/chat/rooms/:id/messages/:msgId/reactions | chat:write | Thả/bỏ emoji (toggle) |
| Ghim tin | POST/DELETE /api/v1/chat/rooms/:id/pins/:msgId · GET /pins | chat:write | Ghim/bỏ ghim, xem danh sách ghim |
| Sửa tin | PATCH /api/v1/chat/rooms/:id/messages/:msgId | chat:write | Sửa tin của chính mình (đánh dấu đã sửa) |
| Thu hồi tin | DELETE /api/v1/chat/rooms/:id/messages/:msgId | chat:write | Thu hồi tin của mình (admin phòng thu hồi được tin người khác) |
| Gửi file | POST /api/v1/chat/rooms/:id/files | chat:write | Đính kèm file ≤5MB, chặn loại nguy hiểm (.exe…) |
| Tải file | GET /api/v1/chat/attachments/:attId | chat:read | Thành viên phòng tải file đính kèm |
| Typing | POST /api/v1/chat/rooms/:id/typing | chat:write | Báo "đang gõ" real-time qua WS |
| Sync phòng ban | POST /api/v1/chat/departments/sync | manager+ | Tạo/đồng bộ channel theo phòng ban Soul-Manager |
| Read-all (compliance) | GET /api/v1/chat/admin/rooms · /admin/rooms/:id/messages | owner/super_admin | Xem toàn bộ phòng/tin — MỌI lượt xem đều ghi audit log |

## Hướng dẫn sử dụng
1. Mở trang **Chat** (menu /chat) — danh sách phòng hiện bên trái kèm badge chưa đọc.
2. Bấm **bút chì** để tạo phòng mới → chọn thành viên trong tổ chức → đặt tên.
3. Chọn phòng → gõ tin nhắn → Enter để gửi; tin đến real-time không cần refresh.
4. Mở phòng là tự đánh dấu đã đọc.

## Ví dụ (hỏi Tiểu Tâm)
- **"Tạo phòng chat cho team ca tối"** → Vào Chat, bấm bút chì, chọn các thành viên ca tối, đặt tên phòng rồi tạo.
- **"Tôi có tin nhắn nào chưa đọc không?"** → Xem badge chưa đọc trên danh sách phòng ở trang Chat (chuông ở Home cũng gộp thông báo).

## Changelog
- 2.1.0 (R11.5): Enterprise — reply/sửa/thu hồi, reaction, ghim, gửi file (≤5MB, chặn .exe), tìm kiếm, unread badge, typing, admin phòng + quản lý thành viên, channel phòng ban sync Soul-Manager, read-all compliance owner/super_admin kèm audit log.
- 1.0.0: Phòng nhóm/1-1, tin nhắn real-time WebSocket, đánh dấu đã đọc, tenant isolation.
