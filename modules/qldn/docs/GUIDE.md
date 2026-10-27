# Quản Lý Doanh Nghiệp V1A (qldn)

## Giới thiệu

Module lương – nhân sự – dòng tiền hoàn chỉnh cho SME, đúc từ bộ Excel mẫu Joli Poli (7 file / 23 sheets / ~4.200 công thức) với golden test khớp từng đồng: **lương 2 hệ song song** (chính thức BHXH/thuế + nội bộ doanh số), chấm công 2 chế độ (ký hiệu ngày + giờ máy), hoa hồng theo đơn JP, chi lương ngân hàng UNC, CTV/gia công gross-up 10%, dự báo dòng tiền roll theo ngày.

- **Tier:** paid 1200 Om · thuê 180 Om/30 ngày · nhóm Quản trị
- **dependsOn:** `ke-toan-10a` — Treasury/COA/bút toán dùng k10a, qldn không đúc lại sổ
- **pgSchema riêng `qldn`** (17 bảng, mọi bảng có `org_id`) — gỡ module = `DROP SCHEMA qldn CASCADE`
- **Tham số luật version hóa** trong `policy_params` (BHXH/BHYT/BHTN/TNLĐ/KPCĐ, giảm trừ 15.5tr/6.2tr, biểu thuế 7 bậc, cap miễn thuế ăn ca 730k) — luật đổi chỉ thêm bản ghi, không sửa code.

## Chức năng

| Chức năng | Endpoint | Ghi chú |
|---|---|---|
| Health check | `GET /api/v1/qldn/health` | — |
| Kỳ lương | `GET/POST /api/v1/qldn/periods`, `POST /periods/:id/close` | khóa kỳ chặn import/tính lại |
| Tham số chính sách | `GET/POST /api/v1/qldn/policy-params`, `GET /policy-params/effective?date=` | version hóa theo effective_from |
| Nhân viên | `GET/POST /api/v1/qldn/employees`, `PATCH /employees/:id` | mã kép NV001 + JPKD001 |
| Import nhân sự Excel | `POST /api/v1/qldn/employees/import` | multipart 2 file, merge theo tên, all-or-nothing |
| Hồ sơ lương | `GET /employees/:id/salary-profiles(/effective)`, `POST /salary-profiles` | 3 tầng lương + 9 phụ cấp |
| Import chấm công BCC | `POST /api/v1/qldn/timesheets/import` | source=official (ký hiệu) / internal (giờ máy) |
| Chấm công | `GET /api/v1/qldn/timesheets?period=` | — |
| Bảng lương | `GET/POST /api/v1/qldn/payroll/runs`, `POST /runs/:id/calculate`, `POST /runs/:id/approve`, `GET /runs/:id/lines` | 2 scheme; duyệt → outbox 334/338/3335 |
| Chi lương UNC | `GET/POST /api/v1/qldn/payouts`, `POST /payouts/:id/status` | batch từ run đã duyệt + STK hồ sơ |
| Phiếu lương | `POST /payroll/runs/:id/payslips`, `GET /payslips/:employeeId/:period` | snapshot bất biến |
| CTV/gia công/công tác phí | `GET/POST /api/v1/qldn/contractors/payments` | gross-up 10% hoặc khấu trừ từ gross |
| Dự báo dòng tiền | `GET /api/v1/qldn/forecast`, `POST /forecast/lines(/:id/settle)`, `POST /forecast/import` | running balance roll theo ngày |

**Engine lương** (`server/engine.ts`, pure function + golden test): OFFICIAL 10 bước (prorate/26, HĐTV ×0.85, OT 150/200%, BH 21.5%+KPCĐ 2% / 10.5%, giảm trừ, PIT lũy tiến 7 bậc, CTV flat 10%) — 40/40 NV T06 khớp từng đồng; INTERNAL (OT 3 hệ số theo ngày, hoa hồng, reconciliation trừ đã lĩnh hệ chính thức) — 66/66 NV khớp, gồm 5 variant thật (thợ theo giờ ×8, chia 22 ngày, lương phẳng…).

**Scheduler F7.5** (`server/scheduler.ts`): host hook `startQldnMonthlyAutomation` — mùng 1 tự tạo kỳ + calculate lương kỳ trước (KHÔNG auto-approve), emit `qldn.payroll.autorun_completed`.

## Hướng dẫn sử dụng

1. **Bật module** trong Cửa hàng Module (cần `ke-toan-10a` active trước).
2. **Nạp chính sách:** `POST /policy-params` (hoặc dùng seed mặc định) — kiểm tra bằng `GET /policy-params/effective?date=`.
3. **Import nhân sự:** upload 2 file Excel (Bảng thông tin + LUONGNB sheet NHÂN SỰ) qua tab Nhân viên trang `/qldn` hoặc `POST /employees/import` — hệ tự merge mã kép theo tên.
4. **Import chấm công:** upload BCC official/internal qua tab Chấm công — kỳ tự tạo theo file.
5. **Chạy lương:** tab Bảng lương → "Chạy lương CHÍNH THỨC/NỘI BỘ" → xem chi tiết từng NV → **Duyệt** (bút toán tự sang Kế Toán 10A qua outbox) → **Batch chi lương + phiếu lương**.
6. **Dự báo:** upload file DU_BAO ở tab Dự báo, hoặc để outbox sync AR/AP từ k10a; thêm dòng tay và settle khi tất toán.
7. **Ra lệnh Tiểu Tâm:** hành động tiền/lương luôn dry-run trước, anh/chị confirm mới ghi thật.

## Ví dụ

- **"Chạy bảng lương T06"** → action `qldn.chay_bang_luong` (dry-run preview → confirm) tạo run OFFICIAL kỳ 2026-06 + tính toàn bộ NV, báo tổng thực lĩnh, trạng thái CHỜ DUYỆT.
- **"Duyệt bảng lương T06"** → action `qldn.duyet_bang_luong` duyệt run, outbox phát sự kiện để Kế Toán 10A sinh bút toán 334/338/3335.
- **"Tổng quỹ lương tháng này bao nhiêu?"** → tool `qldn.payroll_fund` cộng thực lĩnh mọi scheme + CTV/gia công của kỳ.
- **"Ai chưa chấm công kỳ này?"** → tool `qldn.timesheet_status` liệt kê NV active chưa có timesheet.
- **"Tồn quỹ dự kiến đến 31/7?"** → tool `qldn.forecast_balance` trả tồn quỹ roll đến ngày đó.
- **"Nhập doanh số JP250056 99tr"** → action `qldn.nhap_doanh_so` ghi doanh thu đơn để tính hoa hồng.

## Changelog

- **1.0.0 (R12)** — Phát hành V1A: skeleton + 17 bảng pgSchema qldn (F1) · import nhân sự Excel mã kép (F2) · chấm công BCC 2 chế độ (F3) · payroll engine OFFICIAL golden 40/40 (F4) · INTERNAL golden 66/66 + 5 variant (F5) · payout UNC + payslip snapshot + CTV gross-up (F6) · forecast 399 dòng golden + outbox 334/338/3335 (F7) · scheduler auto-run mùng 1 (F7.5) · 8 Tiểu Tâm tools + 7 actions + UI /qldn 5 tab (F8).
