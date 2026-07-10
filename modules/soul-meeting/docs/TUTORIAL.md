# Soul-Meeting — Giáo trình thực hành

## Vai trò
- **Chủ trì/Owner:** cấu hình loại họp, quorum, duyệt và phát hành biên bản.
- **Thư ký/Manager:** chuẩn bị agenda, pre-read, điểm danh, ghi quyết định và action item.
- **Người tham dự/Staff:** RSVP, đọc tài liệu, biểu quyết và theo dõi việc được giao.

## Bài 1 — Tạo cuộc họp
Nói với Tiểu Tâm: “Tạo họp tuần vận hành lúc 9 giờ thứ Hai, 60 phút.” Kiểm tra tiêu đề, múi giờ, người chủ trì trước khi xác nhận.

## Bài 2 — Mời người và RSVP
Thêm người tham dự, gửi lịch `.ics`, rồi xem trạng thái accepted/declined/tentative. Không đưa `orgId` từ người dùng; hệ thống lấy tổ chức từ phiên đăng nhập.

## Bài 3 — Chuẩn bị agenda
Tạo các mục, người phụ trách, time-box; đính kèm pre-read và checklist. Chỉ publish khi tổng thời lượng không vượt lịch họp.

## Bài 4 — Điều hành trực tiếp
Bắt đầu họp, điểm danh, ghi note theo agenda. Ghi quyết định và mở biểu quyết khi cần; quorum theo cấu hình và tỷ lệ vốn.

## Bài 5 — Biên bản
Tạo draft từ nội dung họp, rà người tham dự/quyết định/action item, xin duyệt rồi publish. Bản đã phát hành là bất biến; sửa bằng phiên bản mới.

## Bài 6 — Theo dõi sau họp
Giao action item với người chịu trách nhiệm và hạn; xem việc quá hạn, carry-over sang kỳ sau, báo cáo chi phí và xuất Excel.

## Bài 7 — Ghi âm và harvest AI
Chỉ bật ghi âm khi đã có đồng thuận. ASR là sidecar tùy chọn. Dùng harvest để đề xuất quyết định/action từ transcript, luôn rà và xác nhận trước khi ghi thật.

## FAQ
**Không thấy module?** Owner cần kích hoạt Soul-Meeting trong cửa hàng module.  
**Không publish được?** Kiểm tra quyền `sm.minutes.publish`, trạng thái duyệt và bảo mật lớp 2.  
**Thiếu quorum?** Kiểm tra điểm danh, quyền biểu quyết và tỷ lệ vốn.  
**ASR không chạy?** Cuộc họp vẫn dùng bình thường; nhập transcript thủ công rồi harvest.  
**Ai xem được dữ liệu?** Chỉ người trong cùng tổ chức và có quyền tương ứng.

## Quiz
1. Ai nên phát hành biên bản? **Người có quyền `sm.minutes.publish`, thường Owner/chủ trì.**
2. Có sửa trực tiếp biên bản đã phát hành không? **Không, tạo phiên bản mới.**
3. Harvest AI có tự ghi quyết định không? **Không, phải rà và xác nhận.**
4. Khi nào được ghi âm? **Sau khi thông báo và có đồng thuận phù hợp.**
5. Staff cần gì để xem action item? **Module hoạt động và quyền `sm.actionitem.read`.**
