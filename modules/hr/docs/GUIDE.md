# Nhân Sự & Ca (hr)

## Giới thiệu
Module Nhân Sự (trả phí, 250 Om) — fork domain model frappe/hrms: hồ sơ nhân viên, ca làm việc + xếp người, chấm công vào/ra có tính đi trễ theo giờ ca, và vòng đời nghỉ phép đầy đủ (loại phép → cấp phép → đơn → duyệt/từ chối → trừ số dư + tự ghi bảng công).

## Chức năng
| Tên | Endpoint | Quyền cần | Mô tả |
|---|---|---|---|
| Danh sách ca | GET /api/v1/hr/shifts?date= | hr:read | Ca theo ngày kèm người được xếp |
| Tạo ca | POST /api/v1/hr/shifts | hr:write | Tên ca, ngày, giờ bắt đầu/kết thúc |
| Xếp người vào ca | PUT /api/v1/hr/shifts/:id/staff | hr:write | Gán danh sách nhân viên trực |
| Hồ sơ nhân viên | GET /api/v1/hr/employees?status= | hr:read | Danh sách nhân viên |
| Thêm nhân viên | POST /api/v1/hr/employees | hr:write | Tạo hồ sơ mới |
| Sửa nhân viên | PATCH /api/v1/hr/employees/:id | hr:write | Cập nhật hồ sơ/trạng thái |
| Chấm công vào | POST /api/v1/hr/attendance/check-in | hr:write | 1 attendance/người/ngày; tự tính đi trễ theo giờ ca |
| Chấm công ra | POST /api/v1/hr/attendance/check-out | hr:write | Tính working_hours |
| Bảng công theo ngày | GET /api/v1/hr/attendance?date= | hr:read | Ai có mặt, ai trễ, giờ làm |
| Loại phép | GET/POST /api/v1/hr/leave/types | hr:read / hr:write | Phép năm, nghỉ ốm… (paid/unpaid) |
| Cấp phép | POST /api/v1/hr/leave/allocations | hr:write | Cấp số ngày phép cho nhân viên |
| Số dư phép | GET /api/v1/hr/leave/balance | hr:read | Còn bao nhiêu ngày theo loại |
| Nộp đơn nghỉ | POST /api/v1/hr/leave/applications | hr:write | Phép paid phải đủ số dư (chặn sớm) |
| Danh sách đơn | GET /api/v1/hr/leave/applications?status= | hr:read | Đơn chờ duyệt/đã duyệt/từ chối |
| Duyệt đơn | POST /api/v1/hr/leave/applications/:id/approve | hr:write | Trừ số dư + ghi on-leave từng ngày vào bảng công |
| Từ chối đơn | POST /api/v1/hr/leave/applications/:id/reject | hr:write | Không trừ số dư |

## Hướng dẫn sử dụng
1. Kích hoạt module trong **Cửa hàng Module** nếu chưa bật, rồi mở trang **Nhân sự** (/hr) — 3 tab: Chấm công · Ca làm · Nghỉ phép.
2. Tab **Ca làm**: tạo ca (tên/ngày/giờ), bấm **Xếp người** để gán nhân viên, chạm chip để gỡ.
3. Tab **Chấm công**: nhân viên check-in/check-out; hệ thống tự đánh dấu đi trễ so với giờ ca.
4. Tab **Nghỉ phép**: tạo loại phép + cấp phép trước; nhân viên nộp đơn; quản lý duyệt/từ chối — duyệt là trừ số dư và ghi bảng công tự động.

## Ví dụ (hỏi Tiểu Tâm)
- **"Hôm nay ai đi trễ?"** → Tiểu Tâm đọc bảng chấm công ngày: ai check-in muộn so với ca, muộn bao nhiêu phút.
- **"Duyệt đơn nghỉ của Lan"** → Vào Nhân sự, tab Nghỉ phép, mở đơn chờ duyệt của Lan và bấm Duyệt — số dư phép trừ tự động.
- **"Ca tối nay có mấy người?"** → Xem tab Ca làm ngày hôm nay; Tiểu Tâm đếm người được xếp vào ca tối.

## Changelog
- 2.0.0 (V7): Fork hrms — chấm công theo ca + đi trễ, nghỉ phép vòng đời đầy đủ (17 endpoint).
- 1.0.0 (v6): Ca làm + xếp người.
