# Soul-Manager — TUTORIAL (giáo trình người dùng cuối, Tiểu Tâm dẫn dạy)

Mỗi bài: mục tiêu → nói gì với Tiểu Tâm → tool chạy phía sau → kết quả mong đợi. Người dùng chỉ cần **nói tiếng Việt**, Tiểu Tâm lo phần còn lại (action nào thay đổi dữ liệu, Tiểu Tâm xác nhận trước khi chạy).

## Bài 1 — Làm quen: công ty mình đang có gì?
- Nói: *"Công ty đang có bao nhiêu nhân viên, mấy phòng ban?"*
- Tool: `hr.report.headcount` + `hr.org.chart`
- Kết quả: tổng headcount, cây phòng ban. Công ty mới sẽ là 0 — sang Bài 2.

## Bài 2 — Thêm nhân viên đầu tiên
- Nói: *"Thêm nhân viên Trần Văn An, phòng Kinh doanh, chức danh Nhân viên kinh doanh, vào làm 01/07/2026, lương 20 triệu, hợp đồng không xác định thời hạn."*
- Tool: `hr.employee.create` (Tiểu Tâm xác nhận thông tin rồi mới chạy)
- Kết quả: mã **NV0001** tự sinh; phòng Kinh doanh + chức danh tự tạo nếu chưa có; phép năm 12 ngày tự mở. Không cần setup gì trước.

## Bài 3 — Xây cơ cấu tổ chức
- Nói: *"Thêm Lê Thị Bình vào phòng Kỹ thuật, chức danh Kỹ sư phần mềm, lương 30 triệu, quản lý trực tiếp là NV0001."*
- Tool: `hr.employee.create` với `manager_code`
- Kiểm tra: *"Cho xem sơ đồ tổ chức kèm danh sách từng phòng"* → `hr.org.chart {include_employees:true}`.

## Bài 4 — Chấm công hằng ngày
- Nói: *"Chấm công NV0001 hôm nay, vào 8 giờ ra 5 giờ chiều."*
- Tool: `hr.attendance.record {check_in:"08:00", check_out:"17:00"}`
- Kết quả: 1 công, muộn/sớm tự tính theo ca HC (08:00–17:00). Vào 08:30 → hệ ghi muộn 30 phút.
- Lưu ý: ngày đã chấm mà chấm lại sẽ bị chặn (`ATTENDANCE_DUPLICATE`) — muốn sửa hãy nói *"sửa lại công ngày X"* (Tiểu Tâm bật `allow_update`).

## Bài 5 — Làm thêm giờ (OT)
- Nói: *"Hôm qua NV0003 tăng ca 3 tiếng ngày thường."*
- Tool: `hr.attendance.record {ot_weekday_hours:"3", allow_update:true nếu ngày đã chấm}`
- Ba loại OT: ngày thường ×150%, ngày nghỉ tuần ×200%, lễ tết ×300%. Phần phụ trội vượt 100% được **miễn thuế TNCN** — bảng lương tự xử lý.

## Bài 6 — Xin nghỉ phép & duyệt
- NV nói: *"NV0002 xin nghỉ phép năm ngày 15/07, 1 ngày, lý do việc gia đình."* → `hr.leave.request` (đơn `pending`).
- Quản lý nói: *"Duyệt đơn nghỉ của Bình."* → `hr.leave.decide {decision:"approved"}` — số dư trừ ngay, **không bao giờ duyệt lố** (guard nằm trong database).
- Loại phép sẵn có: `PHEP-NAM` (12 ngày, hưởng lương), `OM`, `THAI-SAN` (BHXH chi trả), `KHONG-LUONG`.
- Chú ý: đơn không được vắt qua 2 tháng — tách 2 đơn.

## Bài 7 — Người phụ thuộc & giảm trừ thuế
- Nói: *"Đăng ký người phụ thuộc cho NV0002: con gái Lê Bảo Anh, sinh 2020."*
- Tool: `hr.dependent.register`
- Ý nghĩa: mỗi NPT giảm 6,2 triệu/tháng khỏi thu nhập tính thuế (mức 2026, cấu hình được). Ngừng giảm trừ: *"ngừng người phụ thuộc Lê Bảo Anh"* → `active:false`.

## Bài 8 — Chạy bảng lương tháng đầu tiên
- Nói: *"Chạy bảng lương tháng 7/2026."*
- Tool: `hr.payroll.run {year:2026, month:7}` (action lớn — Tiểu Tâm luôn xác nhận)
- Engine tự gom: công thực tế + phép hưởng lương + OT + phụ cấp + NPT của từng người → tính BHXH/BHYT/BHTN đúng trần-sàn, thuế lũy tiến → **thực nhận**. Chạy lại được thoải mái khi chưa chốt.
- Chốt: *"Chốt bảng lương tháng 7"* → `hr.payroll.approve` — sau chốt kỳ bị khóa.

## Bài 9 — Đọc hiểu phiếu lương (Tiểu Tâm giải thích thuế)
- Nói: *"Xem phiếu lương tháng 7 của NV0002, giải thích vì sao bị trừ nhiều vậy?"*
- Tool: `hr.payroll.payslip` — phiếu kèm `explain[]` từng bước tiếng Việt.
- Ví dụ Tiểu Tâm trả lời (lương 30tr, 1 NPT): *"Chị Bình nhận 26.592.500 đ: lương 26 công đủ = 30.000.000; trừ bảo hiểm 3.150.000 (BHXH 2.400.000 + BHYT 450.000 + BHTN 300.000); sau giảm trừ bản thân 15,5tr và 1 người phụ thuộc 6,2tr, thu nhập tính thuế còn 5.150.000 → thuế 257.500 đ."*

## Bài 10 — Tuyển dụng & đào tạo
- Tuyển: *"Có ứng viên Phạm Thu Hà nộp vị trí Kế toán trưởng"* → `hr.candidate.advance {mode:"add"}`; *"chuyển Hà sang vòng phỏng vấn"* → `{mode:"move", stage:"interview"}`; *"tuyển dụng đến đâu rồi?"* → `hr.recruitment.pipeline`. Khi `hired`, Tiểu Tâm gợi ý tạo luôn hồ sơ NV.
- Đào tạo: *"Tạo khóa Excel nâng cao 16 tiếng, mã EXCEL-01"* → *"ghi danh NV0001"* → *"NV0001 học xong, 9 điểm"* (`hr.training.manage`).

---

## ✅ Checklist onboarding doanh nghiệp mới

- [ ] Thêm ≥1 nhân viên (Bài 2) — mọi mặc định (loại phép, ca HC, policy) tự sinh theo org
- [ ] Kiểm tra vùng lương tối thiểu (`work_region` 1–4) đúng địa bàn từng NV
- [ ] Khai lương đóng BHXH riêng (`insurance_salary`) nếu khác lương cơ bản
- [ ] Đăng ký người phụ thuộc cho NV có con/cha mẹ phụ thuộc (Bài 7)
- [ ] Khai phụ cấp cố định (ăn trưa, xăng xe...) và đánh dấu chịu thuế/không
- [ ] Chấm công tối thiểu 1 tuần trước khi chạy thử bảng lương
- [ ] Chạy `hr.payroll.run` tháng thử → đối chiếu 1–2 phiếu bằng tay → mới `approve`
- [ ] Xem lại `hr_settings.policy` khi có văn bản pháp luật mới (GUIDE §4)

## 🎙 Kịch bản Tiểu Tâm dẫn tour (lần đầu mở module)

> "Chào bạn, mình là Tiểu Tâm — từ giờ mình kiêm luôn phòng nhân sự nhé! Mình làm được: hồ sơ nhân viên, chấm công, nghỉ phép, và **tính lương đúng luật đến từng đồng** — bảo hiểm, thuế thu nhập, giảm trừ gia cảnh mình lo hết. Bắt đầu nào: bạn đọc cho mình tên, phòng ban, mức lương và ngày vào làm của một nhân viên — mình lập hồ sơ đầu tiên trong 10 giây. Sau đó mỗi sáng chỉ cần nói 'chấm công cho cả phòng', cuối tháng nói 'chạy bảng lương' là xong. Nếu có gì mình chưa chắc, mình sẽ hỏi lại trước khi làm — dữ liệu lương là chuyện nghiêm túc mà."

Luật ứng xử của Tiểu Tâm trong module này: (1) mọi **action** xác nhận trước khi chạy, đọc lại tham số bằng tiếng Việt; (2) gặp mã lỗi, tra bảng trong TOOLS.md để phản hồi đúng cách; (3) câu hỏi "vì sao" về lương → luôn dùng `explain[]` trong phiếu, không tự tính lại.
