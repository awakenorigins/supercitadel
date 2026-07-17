# MODULE QLDN HR PLUS

## Giới thiệu
QLDN HR Plus là module nhân sự nâng cao cho Super Citadel, bao phủ toàn bộ vòng đời tuyển dụng → thử việc → hợp đồng → điều chuyển/công tác → đào tạo → kỷ luật → thôi việc → audit nội bộ. Module dùng 49 bảng `qhr_`, mọi bảng có `org_id`, tái sử dụng nhân viên lõi bằng soft reference đến `hr_employees`, không sửa module `hr` gốc.

## Chức năng
| Nhóm | Chức năng | Endpoint |
|---|---|---|
| Tuyển dụng | Yêu cầu/kế hoạch tuyển, job posting, ứng viên, pipeline, hire, onboarding | `/api/v1/qldn-hr-plus/candidates`, `/applications/:id/hire` |
| Thử việc | Tạo kỳ thử việc, KPI pass/fail/gia hạn 1 tháng | `/probations`, `/probations/:id/evaluate` |
| Hợp đồng | Lifecycle 11 trạng thái, ký, tracking CN↔Trụ sở, expiry watch | `/contracts`, `/contracts/:id/transition`, `/contracts/scan-expiry` |
| Thuyên chuyển/Công tác | Transfer 3 cổng, phụ lục HĐ, BHXH flag, business trip + advance event | `/transfers`, `/trips`, `/trips/:id/advance` |
| Đào tạo | Request/plan/course/session/enrollment/evaluation/commitment/vendor/report | `/training/requests`, `/training/courses`, `/training/enrollments/:id/evaluate` |
| Kỷ luật | Violation case, biên bản, họp, quyết định, appeal | `/discipline/cases`, `/discipline/cases/:id/decision` |
| Thôi việc | Resignation/termination, exit interview ACL, handover, checklist, settlement | `/offboarding/resignations`, `/offboarding/exit-interviews/:id`, `/offboarding/resignations/:id/settlement` |
| Audit | Audit plan/visit/finding/CAR, overdue scan | `/audit/plans`, `/audit/findings`, `/audit/corrective-actions/scan-overdue` |

## Hướng dẫn sử dụng
1. HR tạo job posting và candidate, sau đó tạo application và chuyển stage tuần tự (`applied → screened → testing? → interview1 → interview2? → offer → hired`).
2. Khi hire, module phát event `qldn-hr-plus.candidate.hired` và tạo onboarding checklist.
3. Tạo probation period; đánh giá KPI để pass/fail hoặc tạo workflow gia hạn nếu hụt KPI ≤5% và thái độ tốt.
4. Tạo hợp đồng chính thức, chuyển trạng thái ký/đóng dấu/lưu trữ, scan expiry để phát `contract.expiring`.
5. Với đào tạo: request nội bộ ≤500.000 tự duyệt P.ĐT; >500.000 đi workflow GĐ; course >5.000.000/người bắt buộc training commitment 24 tháng.
6. Với thôi việc: sau resignation/termination decision, phải đủ 3 handover `work/documents/assets` và checklist done mới mở final settlement.

## Ví dụ
- **“Tiểu Tâm, tạo ứng viên Nguyễn A cho vị trí nhân viên kinh doanh, chuyển qua phỏng vấn và gửi offer.”** → Gọi `/candidates`, `/job-postings`, `/applications`, rồi `/applications/:id/advance` theo từng stage.
- **“Tiểu Tâm, nhân viên B nghỉ việc, đã bàn giao tài sản và hồ sơ, kiểm tra còn thiếu gì để quyết toán.”** → Đọc `/offboarding/checklists`, kiểm tra 3 handover và chỉ gọi settlement khi gate đủ.

## Permissions
`qldn-hr-plus.recruitment.read/write`, `candidate.read/write`, `probation.read/write/evaluate`, `onboarding.execute`, `contract.read/write/sign`, `transfer.read/write`, `trip.read/write`, `training.read/write/evaluate`, `discipline.read/write`, `offboarding.read/write`, `exitinterview.read`, `audit.read/write`, `admin.manage`.

## Events
Emits: `qldn-hr-plus.candidate.hired`, `qldn-hr-plus.contract.expiring`, `qldn-hr-plus.employee.terminated`, `qldn-hr-plus.employee.resigned`, `qldn-hr-plus.violation.decided`, `qldn-hr-plus.trip.advance_requested`, `qldn-hr-plus.trip.completed`, `qldn-hr-plus.probation.passed`, `qldn-hr-plus.probation.failed`, `qldn-hr-plus.training-request.auto-approved`, `qldn-hr-plus.corrective-action.overdue`.
Subscribes: `workflow.instance.approved`, `workflow.instance.rejected`.

## 49 bảng
`qhr_recruitment_requests`, `qhr_recruitment_plans`, `qhr_job_descriptions`, `qhr_job_postings`, `qhr_candidates`, `qhr_applications`, `qhr_interview_rounds`, `qhr_candidate_test_results`, `qhr_job_offers`, `qhr_recruitment_summary_reports`, `qhr_probation_periods`, `qhr_probation_kpi_results`, `qhr_probation_extension_requests`, `qhr_employee_documents`, `qhr_onboarding_checklists`, `qhr_employee_profiles`, `qhr_employment_contracts`, `qhr_contract_annexes`, `qhr_contract_tracking_events`, `qhr_contract_expiry_watches`, `qhr_transfer_requests`, `qhr_transfer_decisions`, `qhr_business_trip_requests`, `qhr_business_trip_routes`, `qhr_trip_logistics`, `qhr_training_requests`, `qhr_training_plans`, `qhr_training_courses`, `qhr_training_sessions`, `qhr_training_enrollments`, `qhr_training_evaluations`, `qhr_training_commitments`, `qhr_training_vendor_proposals`, `qhr_training_monthly_reports`, `qhr_violation_cases`, `qhr_violation_explanations`, `qhr_violation_records`, `qhr_disciplinary_meetings`, `qhr_disciplinary_decisions`, `qhr_violation_appeals`, `qhr_resignation_requests`, `qhr_exit_interviews`, `qhr_handover_records`, `qhr_offboarding_checklists`, `qhr_final_settlements`, `qhr_audit_plans`, `qhr_audit_visits`, `qhr_audit_findings`, `qhr_corrective_action_requests`.

## Gate đặc thù
- Exit interview: content encrypted, chỉ interviewer và GĐ/owner đọc được qua service ACL; staff/manager khác bị 403 kể cả cùng org.
- Offboarding settlement: chặn khi thiếu handover `work/documents/assets` hoặc checklist chưa done.
- Payroll-sensitive/offboarding-sensitive: route mutations dùng permission level 2 và audit.
- Tenant isolation: mọi query/mutation filter `org_id`.

## Changelog
- 1.0.0: Beat 7-11 hoàn tất Phase 2 HR Plus, 49 bảng, routes, loader, UI, docs, integration chain.
