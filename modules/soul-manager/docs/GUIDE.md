# Soul-Manager — Giáo Trình Module Nhân Sự

## Giới thiệu

Soul-Manager là module Nhân Sự (HRM) chuẩn luật Việt Nam 2026 cho SuperCitadel: hồ sơ nhân viên, cơ cấu tổ chức, chấm công + OT, nghỉ phép theo BLLĐ, bảng lương tự động (BHXH/BHYT/BHTN + thuế TNCN lũy tiến 5 bậc, giảm trừ gia cảnh), tuyển dụng và đào tạo. Mọi con số pháp lý cấu hình được qua policy; mọi bảng cô lập theo tổ chức (org_id) và bảo vệ thêm bằng RLS. Tiểu Tâm thao tác toàn bộ nghiệp vụ bằng tiếng Việt.

Route gốc: `/api/v1/soul-manager`. Bảng dữ liệu dùng tiền tố `sm_` (không đụng module `hr` cũ).

## Chức năng

| Nghiệp vụ | Endpoint | Quyền |
|---|---|---|
| Tìm/liệt kê nhân viên | `GET /api/v1/soul-manager/employees` | hr.employee.read |
| Thêm nhân viên | `POST /api/v1/soul-manager/employees` | hr.employee.write |
| Xem hồ sơ theo mã | `GET /api/v1/soul-manager/employees/:code` | hr.employee.read |
| Sửa hồ sơ / điều chuyển / nghỉ việc | `PATCH /api/v1/soul-manager/employees/:code` | hr.employee.write |
| Đăng ký người phụ thuộc | `POST /api/v1/soul-manager/employees/:code/dependents` | hr.employee.write |
| Sơ đồ tổ chức | `GET /api/v1/soul-manager/org/chart` | hr.org.read |
| Chấm công | `POST /api/v1/soul-manager/attendance` | hr.attendance.write |
| Bảng công tháng | `GET /api/v1/soul-manager/attendance/summary` | hr.attendance.read |
| Số dư phép | `GET /api/v1/soul-manager/leave/balance` | hr.leave.read |
| Tạo đơn nghỉ | `POST /api/v1/soul-manager/leave/requests` | hr.leave.write |
| Duyệt/từ chối đơn nghỉ | `POST /api/v1/soul-manager/leave/requests/:id/decide` | hr.leave.approve |
| Chạy bảng lương kỳ | `POST /api/v1/soul-manager/payroll/run` | hr.payroll.run |
| Chốt bảng lương | `POST /api/v1/soul-manager/payroll/:year/:month/approve` | hr.payroll.approve |
| Xem phiếu lương | `GET /api/v1/soul-manager/payroll/payslip` | hr.payroll.read |
| Báo cáo nhân sự | `GET /api/v1/soul-manager/report/headcount` | hr.report.read |
| Pipeline tuyển dụng | `GET /api/v1/soul-manager/recruitment/pipeline` | hr.recruitment.read |
| Thêm/chuyển stage ứng viên | `POST /api/v1/soul-manager/recruitment/candidates` | hr.recruitment.write |
| Quản lý đào tạo | `POST /api/v1/soul-manager/training` | hr.training.write |

## Hướng dẫn sử dụng

1. **Kích hoạt module:** vào Cửa hàng Module → mua/thuê Soul-Manager (mua 1.800 Ôm / thuê 30 ngày 250 Ôm). Gate `requireModule('soul-manager')` mở khi org ở trạng thái active.
2. **Lập nền tảng:** thêm nhân viên đầu tiên (`POST /employees`) — phòng ban/chức danh tự tạo nếu chưa có, số dư phép năm tự mở (12 ngày + thâm niên theo BLLĐ 2019).
3. **Chấm công & nghỉ phép:** ghi công theo ngày; đơn nghỉ có guard số dư phía SQL, không vắt tháng.
4. **Chạy lương:** `POST /payroll/run` cho kỳ (năm/tháng) — tự tính ngày công, OT 3 hệ số, BHXH/BHYT/BHTN theo trần đóng, thuế TNCN lũy tiến, giảm trừ gia cảnh; phiếu lương kèm giải thích tiếng Việt. Chốt kỳ để khóa.
5. **Bảo mật:** hành động lương (`payroll.run/approve`) yêu cầu bảo mật lớp 2. Dữ liệu mỗi tổ chức cô lập theo org_id (app-level) + RLS fail-closed (defense-in-depth).

## Ví dụ

- **"Thêm nhân viên Trần Văn An, phòng Kinh doanh, vào làm 1/7/2026, lương 20 triệu"** → Tiểu Tâm gọi `hr.employee.create` → tạo hồ sơ NVxxxx, mở số dư phép năm.
- **"Chạy bảng lương tháng 7/2026"** → Tiểu Tâm gọi `hr.payroll.run` (xác nhận bảo mật lớp 2) → tính lương toàn bộ nhân viên, trả tổng gross/net.
- **"Số dư phép của NV0001 còn bao nhiêu?"** → Tiểu Tâm gọi `hr.leave.balance` → trả số ngày phép năm còn lại.
- **"Cho tao sơ đồ tổ chức"** → Tiểu Tâm gọi `hr.org.chart` → trả cây phòng ban + headcount.

## Changelog

- **1.0.0** (2026-07-05): Ra mắt Soul-Manager. 18 bảng `sm_*`, 8 read tools + 10 write actions, RLS fail-closed, bảng lương đúng luật VN 2026. Tích hợp SuperCitadel qua host-adapter (loader + catalog + PERMISSION_REGISTRY + Tiểu Tâm actions), namespace `sm_` để cùng tồn tại với module `hr` cũ.
