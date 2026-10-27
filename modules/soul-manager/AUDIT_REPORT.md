# AUDIT_REPORT — Soul-Manager v1.0.0

Hợp đồng Citadel 8 mặt cắt · 2026-07-05

**KẾT QUẢ: 321/321 PASS ✅**


## ① Manifest

| Kiểm tra | Kết quả |
|---|---|
| manifest.json parse được | ✅ PASS |
| có trường "id" | ✅ PASS |
| có trường "name" | ✅ PASS |
| có trường "version" | ✅ PASS |
| có trường "description" | ✅ PASS |
| có trường "dependencies" | ✅ PASS |
| có trường "conflicts" | ✅ PASS |
| có trường "permissions" | ✅ PASS |
| có trường "tools" | ✅ PASS |
| có trường "intents" | ✅ PASS |
| có trường "routes" | ✅ PASS |
| có trường "menu" | ✅ PASS |
| có trường "docs" | ✅ PASS |
| có trường "hooks" | ✅ PASS |
| có trường "store" | ✅ PASS |
| id = soul-manager | ✅ PASS |
| version đúng semver | ✅ PASS |
| conflicts khai module hr cũ | ✅ PASS |
| khai ≥8 tools (thực tế 18) | ✅ PASS |
| tools tách 2 lớp tool + action | ✅ PASS |
| tool hr.employee.search: đủ kind/permission/inputSchema/docs | ✅ PASS |
| tool hr.employee.get: đủ kind/permission/inputSchema/docs | ✅ PASS |
| tool hr.org.chart: đủ kind/permission/inputSchema/docs | ✅ PASS |
| tool hr.attendance.summary: đủ kind/permission/inputSchema/docs | ✅ PASS |
| tool hr.leave.balance: đủ kind/permission/inputSchema/docs | ✅ PASS |
| tool hr.payroll.payslip: đủ kind/permission/inputSchema/docs | ✅ PASS |
| tool hr.report.headcount: đủ kind/permission/inputSchema/docs | ✅ PASS |
| tool hr.recruitment.pipeline: đủ kind/permission/inputSchema/docs | ✅ PASS |
| tool hr.employee.create: đủ kind/permission/inputSchema/docs | ✅ PASS |
| tool hr.employee.update: đủ kind/permission/inputSchema/docs | ✅ PASS |
| tool hr.dependent.register: đủ kind/permission/inputSchema/docs | ✅ PASS |
| tool hr.attendance.record: đủ kind/permission/inputSchema/docs | ✅ PASS |
| tool hr.leave.request: đủ kind/permission/inputSchema/docs | ✅ PASS |
| tool hr.leave.decide: đủ kind/permission/inputSchema/docs | ✅ PASS |
| tool hr.payroll.run: đủ kind/permission/inputSchema/docs | ✅ PASS |
| tool hr.payroll.approve: đủ kind/permission/inputSchema/docs | ✅ PASS |
| tool hr.candidate.advance: đủ kind/permission/inputSchema/docs | ✅ PASS |
| tool hr.training.manage: đủ kind/permission/inputSchema/docs | ✅ PASS |
| routes ≥ 15 (thực tế 18) | ✅ PASS |

## ① Store

| Kiểm tra | Kết quả |
|---|---|
| store listed = true, category module | ✅ PASS |
| giá MUA 1.800 Ôm | ✅ PASS |
| giá THUÊ 250 Ôm / 30 ngày | ✅ PASS |
| trial_days = 7 | ✅ PASS |
| tagline + ≥3 highlights | ✅ PASS |

## ② Vòng đời

| Kiểm tra | Kết quả |
|---|---|
| hook onInstall tồn tại | ✅ PASS |
| hook onActivate tồn tại | ✅ PASS |
| hook onDisable tồn tại | ✅ PASS |
| hook onRemove tồn tại | ✅ PASS |
| onDisable thu hồi đăng ký (unregisterModule) | ✅ PASS |
| onRemove KHÔNG drop dữ liệu mặc định (dropData opt-in) | ✅ PASS |
| onInstall chạy đủ 3 migrations | ✅ PASS |

## ③ Quyền

| Kiểm tra | Kết quả |
|---|---|
| "hr.employee.read" đúng cú pháp hr.resource.action | ✅ PASS |
| "hr.employee.write" đúng cú pháp hr.resource.action | ✅ PASS |
| "hr.org.read" đúng cú pháp hr.resource.action | ✅ PASS |
| "hr.attendance.read" đúng cú pháp hr.resource.action | ✅ PASS |
| "hr.attendance.write" đúng cú pháp hr.resource.action | ✅ PASS |
| "hr.leave.read" đúng cú pháp hr.resource.action | ✅ PASS |
| "hr.leave.write" đúng cú pháp hr.resource.action | ✅ PASS |
| "hr.leave.approve" đúng cú pháp hr.resource.action | ✅ PASS |
| "hr.payroll.read" đúng cú pháp hr.resource.action | ✅ PASS |
| "hr.payroll.run" đúng cú pháp hr.resource.action | ✅ PASS |
| "hr.payroll.approve" đúng cú pháp hr.resource.action | ✅ PASS |
| "hr.report.read" đúng cú pháp hr.resource.action | ✅ PASS |
| "hr.recruitment.read" đúng cú pháp hr.resource.action | ✅ PASS |
| "hr.recruitment.write" đúng cú pháp hr.resource.action | ✅ PASS |
| "hr.training.write" đúng cú pháp hr.resource.action | ✅ PASS |
| tool hr.employee.search dùng quyền đã khai (hr.employee.read) | ✅ PASS |
| tool hr.employee.get dùng quyền đã khai (hr.employee.read) | ✅ PASS |
| tool hr.org.chart dùng quyền đã khai (hr.org.read) | ✅ PASS |
| tool hr.attendance.summary dùng quyền đã khai (hr.attendance.read) | ✅ PASS |
| tool hr.leave.balance dùng quyền đã khai (hr.leave.read) | ✅ PASS |
| tool hr.payroll.payslip dùng quyền đã khai (hr.payroll.read) | ✅ PASS |
| tool hr.report.headcount dùng quyền đã khai (hr.report.read) | ✅ PASS |
| tool hr.recruitment.pipeline dùng quyền đã khai (hr.recruitment.read) | ✅ PASS |
| tool hr.employee.create dùng quyền đã khai (hr.employee.write) | ✅ PASS |
| tool hr.employee.update dùng quyền đã khai (hr.employee.write) | ✅ PASS |
| tool hr.dependent.register dùng quyền đã khai (hr.employee.write) | ✅ PASS |
| tool hr.attendance.record dùng quyền đã khai (hr.attendance.write) | ✅ PASS |
| tool hr.leave.request dùng quyền đã khai (hr.leave.write) | ✅ PASS |
| tool hr.leave.decide dùng quyền đã khai (hr.leave.approve) | ✅ PASS |
| tool hr.payroll.run dùng quyền đã khai (hr.payroll.run) | ✅ PASS |
| tool hr.payroll.approve dùng quyền đã khai (hr.payroll.approve) | ✅ PASS |
| tool hr.candidate.advance dùng quyền đã khai (hr.recruitment.write) | ✅ PASS |
| tool hr.training.manage dùng quyền đã khai (hr.training.write) | ✅ PASS |
| route GET /hr/employees dùng quyền đã khai | ✅ PASS |
| route POST /hr/employees dùng quyền đã khai | ✅ PASS |
| route GET /hr/employees/:code dùng quyền đã khai | ✅ PASS |
| route PATCH /hr/employees/:code dùng quyền đã khai | ✅ PASS |
| route POST /hr/employees/:code/dependents dùng quyền đã khai | ✅ PASS |
| route GET /hr/org/chart dùng quyền đã khai | ✅ PASS |
| route POST /hr/attendance dùng quyền đã khai | ✅ PASS |
| route GET /hr/attendance/summary dùng quyền đã khai | ✅ PASS |
| route GET /hr/leave/balance dùng quyền đã khai | ✅ PASS |
| route POST /hr/leave/requests dùng quyền đã khai | ✅ PASS |
| route POST /hr/leave/requests/:id/decide dùng quyền đã khai | ✅ PASS |
| route POST /hr/payroll/run dùng quyền đã khai | ✅ PASS |
| route POST /hr/payroll/:year/:month/approve dùng quyền đã khai | ✅ PASS |
| route GET /hr/payroll/payslip dùng quyền đã khai | ✅ PASS |
| route GET /hr/report/headcount dùng quyền đã khai | ✅ PASS |
| route GET /hr/recruitment/pipeline dùng quyền đã khai | ✅ PASS |
| route POST /hr/recruitment/candidates dùng quyền đã khai | ✅ PASS |
| route POST /hr/training dùng quyền đã khai | ✅ PASS |
| mọi permission có description | ✅ PASS |

## ④ Dữ liệu

| Kiểm tra | Kết quả |
|---|---|
| 18 bảng khai trong 0000 (thực tế 18) | ✅ PASS |
| hr_settings: org_id uuid NOT NULL | ✅ PASS |
| hr_settings: timestamps đầy đủ | ✅ PASS |
| hr_settings: có index org | ✅ PASS |

## ④ RLS

| Kiểm tra | Kết quả |
|---|---|
| hr_settings: FORCE ROW LEVEL SECURITY | ✅ PASS |
| hr_settings: policy tenant_isolation USING + WITH CHECK | ✅ PASS |

## ④ Dữ liệu

| Kiểm tra | Kết quả |
|---|---|
| hr_departments: org_id uuid NOT NULL | ✅ PASS |
| hr_departments: timestamps đầy đủ | ✅ PASS |
| hr_departments: có index org | ✅ PASS |

## ④ RLS

| Kiểm tra | Kết quả |
|---|---|
| hr_departments: FORCE ROW LEVEL SECURITY | ✅ PASS |
| hr_departments: policy tenant_isolation USING + WITH CHECK | ✅ PASS |

## ④ Dữ liệu

| Kiểm tra | Kết quả |
|---|---|
| hr_positions: org_id uuid NOT NULL | ✅ PASS |
| hr_positions: timestamps đầy đủ | ✅ PASS |
| hr_positions: có index org | ✅ PASS |

## ④ RLS

| Kiểm tra | Kết quả |
|---|---|
| hr_positions: FORCE ROW LEVEL SECURITY | ✅ PASS |
| hr_positions: policy tenant_isolation USING + WITH CHECK | ✅ PASS |

## ④ Dữ liệu

| Kiểm tra | Kết quả |
|---|---|
| hr_employees: org_id uuid NOT NULL | ✅ PASS |
| hr_employees: timestamps đầy đủ | ✅ PASS |
| hr_employees: có index org | ✅ PASS |

## ④ RLS

| Kiểm tra | Kết quả |
|---|---|
| hr_employees: FORCE ROW LEVEL SECURITY | ✅ PASS |
| hr_employees: policy tenant_isolation USING + WITH CHECK | ✅ PASS |

## ④ Dữ liệu

| Kiểm tra | Kết quả |
|---|---|
| hr_contracts: org_id uuid NOT NULL | ✅ PASS |
| hr_contracts: timestamps đầy đủ | ✅ PASS |
| hr_contracts: có index org | ✅ PASS |

## ④ RLS

| Kiểm tra | Kết quả |
|---|---|
| hr_contracts: FORCE ROW LEVEL SECURITY | ✅ PASS |
| hr_contracts: policy tenant_isolation USING + WITH CHECK | ✅ PASS |

## ④ Dữ liệu

| Kiểm tra | Kết quả |
|---|---|
| hr_dependents: org_id uuid NOT NULL | ✅ PASS |
| hr_dependents: timestamps đầy đủ | ✅ PASS |
| hr_dependents: có index org | ✅ PASS |

## ④ RLS

| Kiểm tra | Kết quả |
|---|---|
| hr_dependents: FORCE ROW LEVEL SECURITY | ✅ PASS |
| hr_dependents: policy tenant_isolation USING + WITH CHECK | ✅ PASS |

## ④ Dữ liệu

| Kiểm tra | Kết quả |
|---|---|
| hr_allowances: org_id uuid NOT NULL | ✅ PASS |
| hr_allowances: timestamps đầy đủ | ✅ PASS |
| hr_allowances: có index org | ✅ PASS |

## ④ RLS

| Kiểm tra | Kết quả |
|---|---|
| hr_allowances: FORCE ROW LEVEL SECURITY | ✅ PASS |
| hr_allowances: policy tenant_isolation USING + WITH CHECK | ✅ PASS |

## ④ Dữ liệu

| Kiểm tra | Kết quả |
|---|---|
| hr_shifts: org_id uuid NOT NULL | ✅ PASS |
| hr_shifts: timestamps đầy đủ | ✅ PASS |
| hr_shifts: có index org | ✅ PASS |

## ④ RLS

| Kiểm tra | Kết quả |
|---|---|
| hr_shifts: FORCE ROW LEVEL SECURITY | ✅ PASS |
| hr_shifts: policy tenant_isolation USING + WITH CHECK | ✅ PASS |

## ④ Dữ liệu

| Kiểm tra | Kết quả |
|---|---|
| hr_attendance: org_id uuid NOT NULL | ✅ PASS |
| hr_attendance: timestamps đầy đủ | ✅ PASS |
| hr_attendance: có index org | ✅ PASS |

## ④ RLS

| Kiểm tra | Kết quả |
|---|---|
| hr_attendance: FORCE ROW LEVEL SECURITY | ✅ PASS |
| hr_attendance: policy tenant_isolation USING + WITH CHECK | ✅ PASS |

## ④ Dữ liệu

| Kiểm tra | Kết quả |
|---|---|
| hr_leave_types: org_id uuid NOT NULL | ✅ PASS |
| hr_leave_types: timestamps đầy đủ | ✅ PASS |
| hr_leave_types: có index org | ✅ PASS |

## ④ RLS

| Kiểm tra | Kết quả |
|---|---|
| hr_leave_types: FORCE ROW LEVEL SECURITY | ✅ PASS |
| hr_leave_types: policy tenant_isolation USING + WITH CHECK | ✅ PASS |

## ④ Dữ liệu

| Kiểm tra | Kết quả |
|---|---|
| hr_leave_balances: org_id uuid NOT NULL | ✅ PASS |
| hr_leave_balances: timestamps đầy đủ | ✅ PASS |
| hr_leave_balances: có index org | ✅ PASS |

## ④ RLS

| Kiểm tra | Kết quả |
|---|---|
| hr_leave_balances: FORCE ROW LEVEL SECURITY | ✅ PASS |
| hr_leave_balances: policy tenant_isolation USING + WITH CHECK | ✅ PASS |

## ④ Dữ liệu

| Kiểm tra | Kết quả |
|---|---|
| hr_leave_requests: org_id uuid NOT NULL | ✅ PASS |
| hr_leave_requests: timestamps đầy đủ | ✅ PASS |
| hr_leave_requests: có index org | ✅ PASS |

## ④ RLS

| Kiểm tra | Kết quả |
|---|---|
| hr_leave_requests: FORCE ROW LEVEL SECURITY | ✅ PASS |
| hr_leave_requests: policy tenant_isolation USING + WITH CHECK | ✅ PASS |

## ④ Dữ liệu

| Kiểm tra | Kết quả |
|---|---|
| hr_payroll_periods: org_id uuid NOT NULL | ✅ PASS |
| hr_payroll_periods: timestamps đầy đủ | ✅ PASS |
| hr_payroll_periods: có index org | ✅ PASS |

## ④ RLS

| Kiểm tra | Kết quả |
|---|---|
| hr_payroll_periods: FORCE ROW LEVEL SECURITY | ✅ PASS |
| hr_payroll_periods: policy tenant_isolation USING + WITH CHECK | ✅ PASS |

## ④ Dữ liệu

| Kiểm tra | Kết quả |
|---|---|
| hr_payslips: org_id uuid NOT NULL | ✅ PASS |
| hr_payslips: timestamps đầy đủ | ✅ PASS |
| hr_payslips: có index org | ✅ PASS |

## ④ RLS

| Kiểm tra | Kết quả |
|---|---|
| hr_payslips: FORCE ROW LEVEL SECURITY | ✅ PASS |
| hr_payslips: policy tenant_isolation USING + WITH CHECK | ✅ PASS |

## ④ Dữ liệu

| Kiểm tra | Kết quả |
|---|---|
| hr_job_openings: org_id uuid NOT NULL | ✅ PASS |
| hr_job_openings: timestamps đầy đủ | ✅ PASS |
| hr_job_openings: có index org | ✅ PASS |

## ④ RLS

| Kiểm tra | Kết quả |
|---|---|
| hr_job_openings: FORCE ROW LEVEL SECURITY | ✅ PASS |
| hr_job_openings: policy tenant_isolation USING + WITH CHECK | ✅ PASS |

## ④ Dữ liệu

| Kiểm tra | Kết quả |
|---|---|
| hr_candidates: org_id uuid NOT NULL | ✅ PASS |
| hr_candidates: timestamps đầy đủ | ✅ PASS |
| hr_candidates: có index org | ✅ PASS |

## ④ RLS

| Kiểm tra | Kết quả |
|---|---|
| hr_candidates: FORCE ROW LEVEL SECURITY | ✅ PASS |
| hr_candidates: policy tenant_isolation USING + WITH CHECK | ✅ PASS |

## ④ Dữ liệu

| Kiểm tra | Kết quả |
|---|---|
| hr_courses: org_id uuid NOT NULL | ✅ PASS |
| hr_courses: timestamps đầy đủ | ✅ PASS |
| hr_courses: có index org | ✅ PASS |

## ④ RLS

| Kiểm tra | Kết quả |
|---|---|
| hr_courses: FORCE ROW LEVEL SECURITY | ✅ PASS |
| hr_courses: policy tenant_isolation USING + WITH CHECK | ✅ PASS |

## ④ Dữ liệu

| Kiểm tra | Kết quả |
|---|---|
| hr_enrollments: org_id uuid NOT NULL | ✅ PASS |
| hr_enrollments: timestamps đầy đủ | ✅ PASS |
| hr_enrollments: có index org | ✅ PASS |

## ④ RLS

| Kiểm tra | Kết quả |
|---|---|
| hr_enrollments: FORCE ROW LEVEL SECURITY | ✅ PASS |
| hr_enrollments: policy tenant_isolation USING + WITH CHECK | ✅ PASS |
| FAIL-CLOSED: policy 0001 KHÔNG có coalesce fallback (code thật, bỏ comment) | ✅ PASS |

## ④ Dữ liệu

| Kiểm tra | Kết quả |
|---|---|
| tiền/lương dùng numeric trong DDL | ✅ PASS |

## ④ Schema

| Kiểm tra | Kết quả |
|---|---|
| Drizzle mirror bảng hr_settings | ✅ PASS |
| Drizzle mirror bảng hr_departments | ✅ PASS |
| Drizzle mirror bảng hr_positions | ✅ PASS |
| Drizzle mirror bảng hr_employees | ✅ PASS |
| Drizzle mirror bảng hr_contracts | ✅ PASS |
| Drizzle mirror bảng hr_dependents | ✅ PASS |
| Drizzle mirror bảng hr_allowances | ✅ PASS |
| Drizzle mirror bảng hr_shifts | ✅ PASS |
| Drizzle mirror bảng hr_attendance | ✅ PASS |
| Drizzle mirror bảng hr_leave_types | ✅ PASS |
| Drizzle mirror bảng hr_leave_balances | ✅ PASS |
| Drizzle mirror bảng hr_leave_requests | ✅ PASS |
| Drizzle mirror bảng hr_payroll_periods | ✅ PASS |
| Drizzle mirror bảng hr_payslips | ✅ PASS |
| Drizzle mirror bảng hr_job_openings | ✅ PASS |
| Drizzle mirror bảng hr_candidates | ✅ PASS |
| Drizzle mirror bảng hr_courses | ✅ PASS |
| Drizzle mirror bảng hr_enrollments | ✅ PASS |

## ④ Backfill

| Kiểm tra | Kết quả |
|---|---|
| 0002 idempotent (NOT EXISTS + to_regclass) | ✅ PASS |

## ⑤ Event

| Kiểm tra | Kết quả |
|---|---|
| src/index.ts: không import module khác | ✅ PASS |
| src/types.ts: không import module khác | ✅ PASS |
| src/money.ts: không import module khác | ✅ PASS |
| src/config.ts: không import module khác | ✅ PASS |
| src/intents.ts: không import module khác | ✅ PASS |
| src/routes.ts: không import module khác | ✅ PASS |
| src/db/schema.ts: không import module khác | ✅ PASS |
| src/validation/schemas.ts: không import module khác | ✅ PASS |
| src/tools/index.ts: không import module khác | ✅ PASS |
| src/services/org.service.ts: không import module khác | ✅ PASS |
| src/services/defaults.service.ts: không import module khác | ✅ PASS |
| src/services/employee.service.ts: không import module khác | ✅ PASS |
| src/services/attendance.service.ts: không import module khác | ✅ PASS |
| src/services/leave.service.ts: không import module khác | ✅ PASS |
| src/services/payroll.service.ts: không import module khác | ✅ PASS |
| src/services/report.service.ts: không import module khác | ✅ PASS |
| src/services/recruitment.service.ts: không import module khác | ✅ PASS |
| src/services/training.service.ts: không import module khác | ✅ PASS |
| mọi event tên hr.* (15 lời gọi) | ✅ PASS |
| 100% payload emit mang org_id | ✅ PASS |
| EventBus type ép payload có org_id | ✅ PASS |

## ⑥ Tool

| Kiểm tra | Kết quả |
|---|---|
| 18 tool định nghĩa trong code (thực tế 18) | ✅ PASS |
| hr.employee.search khai trong manifest | ✅ PASS |
| hr.employee.get khai trong manifest | ✅ PASS |
| hr.org.chart khai trong manifest | ✅ PASS |
| hr.attendance.summary khai trong manifest | ✅ PASS |
| hr.leave.balance khai trong manifest | ✅ PASS |
| hr.payroll.payslip khai trong manifest | ✅ PASS |
| hr.report.headcount khai trong manifest | ✅ PASS |
| hr.employee.create khai trong manifest | ✅ PASS |
| hr.employee.update khai trong manifest | ✅ PASS |
| hr.dependent.register khai trong manifest | ✅ PASS |
| hr.attendance.record khai trong manifest | ✅ PASS |
| hr.leave.request khai trong manifest | ✅ PASS |
| hr.leave.decide khai trong manifest | ✅ PASS |
| hr.payroll.run khai trong manifest | ✅ PASS |
| hr.payroll.approve khai trong manifest | ✅ PASS |
| hr.candidate.advance khai trong manifest | ✅ PASS |
| hr.training.manage khai trong manifest | ✅ PASS |
| hr.recruitment.pipeline khai trong manifest | ✅ PASS |
| manifest không khai tool ma (code đủ) | ✅ PASS |
| read/write tách lớp (hrReadTools + hrWriteActions) | ✅ PASS |
| mỗi tool có description cho Tiểu Tâm | ✅ PASS |

## ⑦ Biên

| Kiểm tra | Kết quả |
|---|---|
| Zod schemas tồn tại | ✅ PASS |
| handler parse tại biên (.parse(rawInput)) | ✅ PASS |
| routes bind qua tool.handler (kế thừa Zod) | ✅ PASS |
| HrError có code máy đọc + details | ✅ PASS |
| money.ts không dùng parseFloat/Number() cho tiền (code thật, bỏ comment) | ✅ PASS |

## ⑧ Docs

| Kiểm tra | Kết quả |
|---|---|
| README.md tồn tại | ✅ PASS |
| CHANGELOG.md tồn tại | ✅ PASS |
| docs/GUIDE.md tồn tại | ✅ PASS |
| docs/TUTORIAL.md tồn tại | ✅ PASS |
| docs/TOOLS.md tồn tại | ✅ PASS |
| docs/EVENTS.md tồn tại | ✅ PASS |
| TUTORIAL ≥8 bài (thực tế 10) | ✅ PASS |
| TUTORIAL có checklist onboarding | ✅ PASS |
| TUTORIAL có kịch bản Tiểu Tâm dẫn tour | ✅ PASS |
| TOOLS có bảng tra nhanh "nói gì → gọi gì" | ✅ PASS |
| TOOLS có bảng mã lỗi → cách phản hồi | ✅ PASS |
| TOOLS ≥10 hội thoại mẫu tiếng Việt (thực tế 18) | ✅ PASS |
| TOOLS có mục hr.employee.search | ✅ PASS |
| TOOLS có mục hr.employee.get | ✅ PASS |
| TOOLS có mục hr.org.chart | ✅ PASS |
| TOOLS có mục hr.attendance.summary | ✅ PASS |
| TOOLS có mục hr.leave.balance | ✅ PASS |
| TOOLS có mục hr.payroll.payslip | ✅ PASS |
| TOOLS có mục hr.report.headcount | ✅ PASS |
| TOOLS có mục hr.recruitment.pipeline | ✅ PASS |
| TOOLS có mục hr.employee.create | ✅ PASS |
| TOOLS có mục hr.employee.update | ✅ PASS |
| TOOLS có mục hr.dependent.register | ✅ PASS |
| TOOLS có mục hr.attendance.record | ✅ PASS |
| TOOLS có mục hr.leave.request | ✅ PASS |
| TOOLS có mục hr.leave.decide | ✅ PASS |
| TOOLS có mục hr.payroll.run | ✅ PASS |
| TOOLS có mục hr.payroll.approve | ✅ PASS |
| TOOLS có mục hr.candidate.advance | ✅ PASS |
| TOOLS có mục hr.training.manage | ✅ PASS |
| mã lỗi EMPLOYEE_NOT_FOUND có trong bảng TOOLS.md | ✅ PASS |
| mã lỗi EMPLOYEE_CODE_TAKEN có trong bảng TOOLS.md | ✅ PASS |
| mã lỗi EMPLOYEE_NOT_ACTIVE có trong bảng TOOLS.md | ✅ PASS |
| mã lỗi DEPARTMENT_NOT_FOUND có trong bảng TOOLS.md | ✅ PASS |
| mã lỗi SHIFT_NOT_FOUND có trong bảng TOOLS.md | ✅ PASS |
| mã lỗi ATTENDANCE_DUPLICATE có trong bảng TOOLS.md | ✅ PASS |
| mã lỗi INVALID_TIME_RANGE có trong bảng TOOLS.md | ✅ PASS |
| mã lỗi LEAVE_TYPE_NOT_FOUND có trong bảng TOOLS.md | ✅ PASS |
| mã lỗi LEAVE_REQUEST_NOT_FOUND có trong bảng TOOLS.md | ✅ PASS |
| mã lỗi LEAVE_NOT_PENDING có trong bảng TOOLS.md | ✅ PASS |
| mã lỗi LEAVE_INSUFFICIENT_BALANCE có trong bảng TOOLS.md | ✅ PASS |
| mã lỗi LEAVE_SPANS_MONTHS có trong bảng TOOLS.md | ✅ PASS |
| mã lỗi PERIOD_LOCKED có trong bảng TOOLS.md | ✅ PASS |
| mã lỗi PERIOD_NOT_FOUND có trong bảng TOOLS.md | ✅ PASS |
| mã lỗi PERIOD_NOT_CALCULATED có trong bảng TOOLS.md | ✅ PASS |
| mã lỗi PAYSLIP_NOT_FOUND có trong bảng TOOLS.md | ✅ PASS |
| mã lỗi OPENING_NOT_FOUND có trong bảng TOOLS.md | ✅ PASS |
| mã lỗi CANDIDATE_NOT_FOUND có trong bảng TOOLS.md | ✅ PASS |
| mã lỗi COURSE_NOT_FOUND có trong bảng TOOLS.md | ✅ PASS |
| mã lỗi ENROLLMENT_NOT_FOUND có trong bảng TOOLS.md | ✅ PASS |
| mã lỗi INVALID_INPUT có trong bảng TOOLS.md | ✅ PASS |
| GUIDE khai số pháp lý "cấu hình được" | ✅ PASS |
| GUIDE có giảm trừ 15,5tr + biểu 5 bậc + trần 07/2026 | ✅ PASS |
| GUIDE có ví dụ tính lương cụ thể (20tr → net 17.780.000) | ✅ PASS |
| GUIDE nhắc vận hành role non-superuser | ✅ PASS |

## ✚ Test

| Kiểm tra | Kết quả |
|---|---|
| tests/payroll.test.ts tồn tại | ✅ PASS |
| tests/smoke.test.ts tồn tại (PGlite + role non-superuser) | ✅ PASS |
| smoke test có fail-closed check (quên set org) | ✅ PASS |
