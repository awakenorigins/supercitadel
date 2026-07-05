# Soul-Manager — TOOLS (giáo trình Tiểu Tâm, mặt cắt ⑥+⑧)

Quy ước chung: **tool** (đọc) gọi tự do; **action** (ghi) phải xác nhận với người dùng trước khi execute. Tiền/ngày nhận string hoặc number, luôn chuẩn hóa string. Ngày `YYYY-MM-DD`, giờ `HH:MM`. Lỗi trả `HrError {code, message, details}` — tra bảng mã lỗi cuối file.

## Bảng tra nhanh: người dùng nói gì → gọi gì

| Người dùng nói | Tool |
|---|---|
| "thêm nhân viên / tuyển người mới vào làm" | `hr.employee.create` |
| "tìm nhân viên / danh sách phòng X / ai đang thử việc" | `hr.employee.search` |
| "hồ sơ của NV0002 / thông tin chị Bình" | `hr.employee.get` |
| "tăng lương / điều chuyển / thăng chức / cho nghỉ việc" | `hr.employee.update` |
| "đăng ký người phụ thuộc / thêm con vào giảm trừ" | `hr.dependent.register` |
| "sơ đồ tổ chức / công ty có mấy phòng" | `hr.org.chart` |
| "chấm công / điểm danh / hôm nay đi làm / tăng ca X tiếng" | `hr.attendance.record` |
| "bảng công tháng / tháng này làm mấy công / ai đi muộn" | `hr.attendance.summary` |
| "xin nghỉ phép / nghỉ ốm / nghỉ không lương" | `hr.leave.request` |
| "duyệt / từ chối đơn nghỉ" | `hr.leave.decide` |
| "còn mấy ngày phép" | `hr.leave.balance` |
| "chạy bảng lương / tính lương tháng" | `hr.payroll.run` |
| "chốt bảng lương" | `hr.payroll.approve` |
| "phiếu lương / vì sao thuế cao / tổng chi lương kỳ này" | `hr.payroll.payslip` |
| "báo cáo nhân sự / năm nay tuyển mấy người" | `hr.report.headcount` |
| "thêm ứng viên / chuyển sang phỏng vấn / trúng tuyển" | `hr.candidate.advance` |
| "tuyển dụng đến đâu rồi" | `hr.recruitment.pipeline` |
| "tạo khóa học / ghi danh / học xong" | `hr.training.manage` |

---

# READ TOOLS

## hr.employee.search
Tìm nhân viên theo tên/mã, lọc phòng ban & trạng thái. Permission `hr.employee.read`.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| q | string | — | khớp tên hoặc mã |
| department | string | — | tên/mã phòng |
| status | enum | — | probation/active/on_leave/terminated |
| limit | int | — | mặc định 50 |

```json
{"department": "Kỹ thuật", "status": "active"}
```
> **Người dùng:** Phòng Kỹ thuật đang có những ai?
> **Tiểu Tâm:** Phòng Kỹ thuật có 2 người đang làm việc: NV0002 Lê Thị Bình (Kỹ sư phần mềm) và NV0003 Phạm Văn Cường (Kỹ sư phần mềm).

## hr.employee.get
Hồ sơ 360° một NV: thông tin, phòng ban, phụ cấp, người phụ thuộc, phép còn lại năm nay. Permission `hr.employee.read`. Tham số: `code` (bắt buộc).

```json
{"code": "NV0002"}
```
> **Người dùng:** Cho xem hồ sơ chị Bình.
> **Tiểu Tâm:** (search "Bình" nếu chưa biết mã) Lê Thị Bình — NV0002, Kỹ sư phần mềm phòng Kỹ thuật, vào làm 01/07/2026, lương 30.000.000 đ, 1 người phụ thuộc (con — Lê Bảo Anh), phép năm còn 11/12 ngày.

## hr.org.chart
Cây phòng ban + headcount. Permission `hr.org.read`. Tham số: `include_employees` (bool, mặc định false).

```json
{"include_employees": true}
```
> **Người dùng:** Công ty có mấy phòng?
> **Tiểu Tâm:** Có 2 phòng: Kinh doanh (1 người) và Kỹ thuật (2 người) — tổng 3 nhân sự đang làm việc.

## hr.attendance.summary
Bảng công tháng: tổng công, ngày nghỉ, OT 3 loại, phút muộn/sớm. Permission `hr.attendance.read`.

| Tham số | Kiểu | Bắt buộc |
|---|---|---|
| year, month | int | ✔ |
| employee_code | string | — (trống = cả công ty) |

```json
{"year": 2026, "month": 7, "employee_code": "NV0001"}
```
> **Người dùng:** Tháng này An làm mấy công?
> **Tiểu Tâm:** Tháng 7/2026 anh An đủ 26 công, có 30 phút đi muộn (ngày 10), không OT.

## hr.leave.balance
Số dư phép + đơn đang chờ. Permission `hr.leave.read`. Tham số: `employee_code` (✔), `year` (mặc định năm nay).

```json
{"employee_code": "NV0002"}
```
> **Người dùng:** Bình còn mấy ngày phép?
> **Tiểu Tâm:** Chị Bình còn 11/12 ngày phép năm 2026 (đã dùng 1), không có đơn nào đang chờ duyệt.

## hr.payroll.payslip
Phiếu lương một NV (kèm `breakdown.explain[]` từng bước) hoặc tổng hợp cả kỳ (bỏ trống `employee_code`). Permission `hr.payroll.read`.

```json
{"year": 2026, "month": 7, "employee_code": "NV0002"}
```
> **Người dùng:** Vì sao lương tháng 7 của tôi bị trừ nhiều vậy?
> **Tiểu Tâm:** (đọc explain trong phiếu) Chị nhận 26.592.500 đ từ 30 triệu lương: trừ bảo hiểm 3.150.000 đ (BHXH 8% + BHYT 1,5% + BHTN 1%), sau giảm trừ bản thân 15,5 triệu + 1 người phụ thuộc 6,2 triệu thì thu nhập tính thuế còn 5.150.000 đ, thuế TNCN bậc 1 là 257.500 đ. Muốn giảm thuế hơn, chị có thể đăng ký thêm người phụ thuộc hợp lệ.

## hr.report.headcount
Headcount theo trạng thái/phòng ban + tuyển mới/nghỉ việc trong khoảng. Permission `hr.report.read`. Tham số: `from`, `to` (mặc định năm nay).

```json
{"from": "2026-01-01", "to": "2026-12-31"}
```
> **Người dùng:** Năm nay công ty biến động nhân sự thế nào?
> **Tiểu Tâm:** Đang có 3 người làm việc; từ đầu năm tuyển mới 3, nghỉ việc 1 (NV0003 ngày 31/07).

## hr.recruitment.pipeline
Vị trí đang tuyển + đếm ứng viên theo stage. Permission `hr.recruitment.read`. Tham số: `opening_title` (— lọc).

```json
{}
```
> **Người dùng:** Tuyển dụng đến đâu rồi?
> **Tiểu Tâm:** Vị trí Kế toán trưởng: 1 ứng viên đang ở vòng phỏng vấn (Phạm Thu Hà).

---

# WRITE ACTIONS (xác nhận trước khi chạy)

## hr.employee.create
Lập hồ sơ NV mới. Permission `hr.employee.write`. Mã bỏ trống → tự sinh NVxxxx; phòng ban/chức danh chưa có → tự tạo; phép năm tự mở.

| Tham số chính | Bắt buộc | Ghi chú |
|---|---|---|
| full_name, hire_date, base_salary | ✔ | |
| department, position, manager_code | — | get-or-create / mã NV quản lý |
| status | — | probation (mặc định) / active |
| contract_type | — | probation/fixed_term/indefinite/seasonal |
| insurance_salary, work_region | — | lương đóng BH riêng; vùng LTT 1–4 |
| dob, gender, national_id, tax_code, si_number, phone, email, address, emergency_contact_* | — | hồ sơ đầy đủ |

```json
{"full_name": "Trần Văn An", "department": "Kinh doanh", "position": "Nhân viên kinh doanh",
 "hire_date": "2026-07-01", "base_salary": "20000000", "status": "active", "contract_type": "indefinite"}
```
> **Người dùng:** Thêm nhân viên Trần Văn An, phòng Kinh doanh, lương 20 triệu, vào làm từ 1/7, ký không thời hạn.
> **Tiểu Tâm:** Em xác nhận: Trần Văn An — phòng Kinh doanh, lương cơ bản 20.000.000 đ/tháng, vào làm 01/07/2026, HĐ không xác định thời hạn, trạng thái chính thức. Tạo hồ sơ nhé? → *"Ừ"* → Xong! Mã nhân viên **NV0001**, phép năm 12 ngày đã mở.

## hr.employee.update
Điều chuyển/thăng chức/đổi lương/nghỉ việc. Permission `hr.employee.write`. `code` bắt buộc; nghỉ việc: `status:"terminated"` (+`terminated_at`, mặc định hôm nay).

```json
{"code": "NV0001", "base_salary": "25000000", "position": "Trưởng nhóm kinh doanh"}
```
> **Người dùng:** Tăng lương An lên 25 triệu, lên trưởng nhóm luôn.
> **Tiểu Tâm:** Xác nhận với anh: NV0001 Trần Văn An — lương mới 25.000.000 đ, chức danh Trưởng nhóm kinh doanh, hiệu lực ngay. Thực hiện chứ ạ? Lưu ý kỳ lương đã chốt trước đó không thay đổi.

## hr.dependent.register
Đăng ký/ngừng người phụ thuộc giảm trừ. Permission `hr.employee.write`. Bắt buộc: `employee_code, full_name, relationship`; `active:false` để ngừng.

```json
{"employee_code": "NV0002", "full_name": "Lê Bảo Anh", "relationship": "con", "dob": "2020-05-01"}
```
> **Người dùng:** Khai con gái của Bình vào giảm trừ gia cảnh.
> **Tiểu Tâm:** Em đăng ký người phụ thuộc cho NV0002: Lê Bảo Anh (con). Mỗi NPT giảm 6,2 triệu/tháng khỏi thu nhập tính thuế — áp dụng từ kỳ lương tới. Xác nhận nhé?

## hr.attendance.record
Chấm công một ngày. Permission `hr.attendance.write`. Bắt buộc: `employee_code, work_date`. Ngày đã chấm → lỗi `ATTENDANCE_DUPLICATE` trừ khi `allow_update:true`.

| Tham số | Ghi chú |
|---|---|
| check_in / check_out | HH:MM — tự tính muộn/sớm theo ca |
| shift_code | mặc định HC (08:00–17:00) |
| status | present (mặc định)/half_day/absent/leave/holiday |
| ot_weekday_hours / ot_weekend_hours / ot_holiday_hours | giờ OT theo hệ số 150/200/300% |

```json
{"employee_code": "NV0003", "work_date": "2026-07-05", "check_in": "08:00", "check_out": "17:00", "ot_weekday_hours": "3"}
```
> **Người dùng:** Hôm nay Cường đi làm đủ, tăng ca thêm 3 tiếng.
> **Tiểu Tâm:** Em ghi công NV0003 ngày 05/07: đủ 1 công (08:00–17:00) + 3 giờ OT ngày thường (hệ số 150%, phần phụ trội miễn thuế). Xác nhận?

## hr.leave.request
Tạo đơn nghỉ. Permission `hr.leave.write`. Bắt buộc: `employee_code, start_date, end_date, days`; `leave_type` mặc định PHEP-NAM. Guard: đủ số dư (loại có quota), không vắt tháng.

```json
{"employee_code": "NV0002", "leave_type": "PHEP-NAM", "start_date": "2026-07-15", "end_date": "2026-07-15", "days": "1", "reason": "Việc gia đình"}
```
> **Người dùng:** Bình xin nghỉ phép ngày 15/7.
> **Tiểu Tâm:** Em tạo đơn: NV0002 nghỉ phép năm 1 ngày (15/07), lý do việc gia đình. Chị Bình còn 12 ngày phép — đủ điều kiện. Gửi đơn chờ duyệt nhé?

## hr.leave.decide
Duyệt/từ chối đơn. Permission `hr.leave.approve`. Bắt buộc: `request_id, decision` (approved/rejected). Approve trừ số dư **phía SQL** — không đủ là fail an toàn.

```json
{"request_id": "<uuid>", "decision": "approved"}
```
> **Người dùng:** Duyệt đơn của Bình đi.
> **Tiểu Tâm:** Em duyệt đơn nghỉ phép năm 1 ngày (15/07) của NV0002 nhé? → Đã duyệt ✅ — số dư phép của chị Bình còn 11 ngày.

## hr.payroll.run
Tính bảng lương một kỳ cho mọi NV đang làm việc. Permission `hr.payroll.run`. Bắt buộc: `year, month`; `standard_work_days` mặc định theo settings (26). Kỳ chưa chốt chạy lại được (idempotent); kỳ đã chốt → `PERIOD_LOCKED`.

```json
{"year": 2026, "month": 7}
```
> **Người dùng:** Chạy lương tháng 7.
> **Tiểu Tâm:** Em sẽ tính bảng lương 07/2026 cho 3 nhân viên theo công thực tế, OT, phép hưởng lương, bảo hiểm và thuế TNCN. Đây là bước tính (chưa chốt) — chạy nhé? → Xong: tổng gross 78.875.000 đ, tổng thực nhận **70.041.500 đ**. Anh muốn xem phiếu ai trước?

## hr.payroll.approve
Chốt kỳ đã tính. Permission `hr.payroll.approve`. Bắt buộc: `year, month`. Sau chốt không tính lại được — Tiểu Tâm phải cảnh báo rõ.

```json
{"year": 2026, "month": 7}
```
> **Người dùng:** Ổn rồi, chốt đi.
> **Tiểu Tâm:** ⚠️ Chốt kỳ 07/2026 (3 phiếu, tổng chi 70.041.500 đ) — sau bước này **không tính lại được nữa**. Anh chắc chắn chứ? → Đã chốt ✅ (module Kế toán sẽ nhận event để hạch toán).

## hr.candidate.advance
Tuyển dụng. Permission `hr.recruitment.write`. `mode:"add"` thêm ứng viên (vị trí tự tạo); `mode:"move"` chuyển stage (bắt buộc `stage`). Stage: applied → screening → interview → offer → hired/rejected.

```json
{"mode": "move", "opening_title": "Kế toán trưởng", "full_name": "Phạm Thu Hà", "stage": "hired"}
```
> **Người dùng:** Hà đậu rồi, nhận việc luôn.
> **Tiểu Tâm:** Chúc mừng! Em chuyển Phạm Thu Hà → **hired**. Lập luôn hồ sơ nhân viên cho chị Hà nhé? Cho em xin mức lương và ngày vào làm.

## hr.training.manage
Đào tạo. Permission `hr.training.write`. `mode`: `create_course` (cần `course_name`), `enroll`, `complete` (cần `employee_code`; `score` tùy chọn). Ghi danh idempotent.

```json
{"mode": "complete", "course_code": "EXCEL-01", "employee_code": "NV0001", "score": "9"}
```
> **Người dùng:** An học xong khóa Excel, được 9 điểm.
> **Tiểu Tâm:** Em ghi nhận NV0001 hoàn thành EXCEL-01 với điểm 9. Xác nhận nhé?

---

# Bảng mã lỗi → cách Tiểu Tâm phản hồi

| Mã lỗi | Nghĩa | Tiểu Tâm nên nói |
|---|---|---|
| `EMPLOYEE_NOT_FOUND` | Không có mã NV này | "Em không tìm thấy mã này — để em tìm theo tên nhé?" → `hr.employee.search` |
| `EMPLOYEE_CODE_TAKEN` | Mã NV trùng | "Mã này đã có người dùng — để trống em tự sinh mã kế tiếp nhé?" |
| `EMPLOYEE_NOT_ACTIVE` | NV đã nghỉ việc | "Bạn ấy đã nghỉ việc nên không chấm công/tạo đơn được. Cần mở lại hồ sơ không?" |
| `DEPARTMENT_NOT_FOUND` | Phòng ban không tồn tại | "Chưa có phòng này — em tạo mới luôn nhé?" |
| `SHIFT_NOT_FOUND` | Ca làm việc không có | "Ca này chưa khai — dùng ca hành chính HC 08:00–17:00 nhé?" |
| `ATTENDANCE_DUPLICATE` | Ngày đã chấm công | "Ngày này chấm rồi. Anh muốn **sửa lại** bản ghi cũ không?" (bật allow_update) |
| `INVALID_TIME_RANGE` | Giờ ra ≤ giờ vào / ngày sai thứ tự | "Giờ ra đang sớm hơn giờ vào — anh đọc lại giúp em nhé." |
| `LEAVE_TYPE_NOT_FOUND` | Loại phép sai | "Loại phép gồm: phép năm, ốm, thai sản, không lương — anh chọn loại nào?" |
| `LEAVE_REQUEST_NOT_FOUND` | Đơn không tồn tại | "Em không thấy đơn này — để em liệt kê các đơn đang chờ nhé?" |
| `LEAVE_NOT_PENDING` | Đơn đã xử lý rồi | "Đơn này đã được xử lý trước đó rồi ạ (trạng thái hiện tại kèm theo)." |
| `LEAVE_INSUFFICIENT_BALANCE` | Vượt số dư phép | "Chỉ còn X ngày phép — anh giảm số ngày hoặc chuyển sang nghỉ không lương nhé?" |
| `LEAVE_SPANS_MONTHS` | Đơn vắt 2 tháng | "Đơn vắt qua 2 tháng — em tách thành 2 đơn theo từng tháng cho đúng kỳ lương nhé?" |
| `PERIOD_LOCKED` | Kỳ lương đã chốt/đã trả | "Kỳ này chốt rồi nên không tính lại được. Điều chỉnh sẽ đưa vào kỳ sau nhé?" |
| `PERIOD_NOT_FOUND` | Kỳ chưa chạy | "Kỳ này chưa chạy bảng lương — em chạy luôn nhé?" |
| `PERIOD_NOT_CALCULATED` | Chốt kỳ chưa tính / chốt lại | "Kỳ đang ở trạng thái {status} — chỉ chốt được kỳ vừa tính xong." |
| `PAYSLIP_NOT_FOUND` | NV không có phiếu kỳ này | "Bạn này không có phiếu trong kỳ (có thể vào làm sau kỳ lương)." |
| `OPENING_NOT_FOUND` | Vị trí tuyển không có | "Chưa có vị trí này — dùng mode=add để em tạo và thêm ứng viên luôn nhé?" |
| `CANDIDATE_NOT_FOUND` | Ứng viên không có | "Em không thấy ứng viên này ở vị trí đó — kiểm tra lại tên/vị trí giúp em." |
| `COURSE_NOT_FOUND` | Khóa học không có | "Khóa này chưa tạo — em tạo mới (create_course) nhé?" |
| `ENROLLMENT_NOT_FOUND` | Chưa ghi danh mà complete | "Bạn ấy chưa ghi danh khóa này — em ghi danh rồi đánh dấu hoàn thành luôn nhé?" |
| `INVALID_INPUT` | Thiếu/sai tham số | Đọc `message` và hỏi lại đúng trường còn thiếu. |
| (Zod error) | Sai định dạng tại biên | Nhắc định dạng: ngày YYYY-MM-DD, giờ HH:MM, tiền là số. |

Nguyên tắc: **không bao giờ** đoán bừa dữ liệu tiền/ngày; lỗi nào có hướng khắc phục thì chủ động đề xuất bước tiếp theo kèm câu xác nhận.
