# Soul-Manager — Danh mục Event (mặt cắt ⑤)

Tên chuẩn `hr.<resource>.<event>`. **Payload LUÔN mang `org_id`.** Module khác chỉ nghe qua event bus — cấm import thẳng.

| Event | Khi nào | Payload chính |
|---|---|---|
| `hr.module.installed` | onInstall xong migrations | `version` |
| `hr.module.activated` | onActivate đăng ký xong | — |
| `hr.module.disabled` | onDisable thu hồi đăng ký | — |
| `hr.module.removed` | onRemove | — |
| `hr.employee.created` | Tạo hồ sơ NV | `employee_id, code, full_name, department, by` |
| `hr.employee.updated` | Cập nhật hồ sơ | `employee_id, code, changes[], note, by` |
| `hr.employee.terminated` | Cho nghỉ việc | `employee_id, code, changes[], note, by` |
| `hr.dependent.registered` | Đăng ký/ngừng NPT | `employee_code, dependent, active, active_dependents` |
| `hr.attendance.recorded` | Chấm công 1 ngày | `employee_code, work_date, status, work_days, late_minutes, updated` |
| `hr.leave.requested` | Tạo đơn nghỉ | `request_id, employee_code, leave_type, days, start_date, end_date` |
| `hr.leave.approved` | Duyệt đơn | `request_id, employee_code, leave_type, days, decided_by` |
| `hr.leave.rejected` | Từ chối đơn | `request_id, employee_code, leave_type, days, decided_by` |
| `hr.payroll.calculated` | Chạy xong bảng lương | `year, month, employees, total_gross, total_net` |
| `hr.payroll.approved` | Chốt kỳ lương | `year, month, employees, total_net, approved_by` |
| `hr.candidate.stage_changed` | Ứng viên đổi stage (kể cả add) | `candidate_id, candidate, opening, from, to, hired?` |
| `hr.training.course_created` | Tạo khóa học | `course_code, name` |
| `hr.training.enrolled` | Ghi danh | `course_code, employee_code` |
| `hr.training.completed` | Hoàn thành khóa | `course_code, employee_code, score` |

Gợi ý tiêu thụ: module Kế toán nghe `hr.payroll.approved` để hạch toán chi phí lương; Tiểu Tâm nghe `hr.candidate.stage_changed{hired:true}` để gợi ý tạo hồ sơ NV.
