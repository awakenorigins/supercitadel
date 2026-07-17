# QLDN V1A — Quản Lý Doanh Nghiệp (module `qldn`)

> Lương 2 hệ (chính thức BHXH/thuế + nội bộ doanh số), chấm công 2 chế độ, hoa hồng theo đơn, chi lương ngân hàng, CTV/khoán, dự báo dòng tiền theo ngày. Đúc từ bộ Excel mẫu Joli Poli (7 file / 23 sheets / ~4.200 công thức), golden test khớp từng đồng T06.

## Kiến trúc

- **id:** `qldn` · tier `paid` 1200 Om · thuê 180 Om/30 ngày · nhóm Quản trị
- **dependsOn:** `ke-toan-10a` — phần Treasury/COA/kỳ dùng k10a, qldn KHÔNG đúc lại sổ quỹ/ngân hàng
- **pgSchema riêng `qldn`** — gỡ module = `DROP SCHEMA qldn CASCADE`, không đụng bảng chung
- **Outbox:** emit `qldn.payroll.approved` → k10a sinh bút toán 334/338/3335; emit `qldn.payout.created`, `qldn.forecast.updated`; subscribe `ke-toan-10a.*` để sync AR/AP vào forecast

## Data model (17 bảng, mọi bảng có `org_id`)

| Domain | Bảng |
|---|---|
| HR-Payroll | `employees` (mã kép NV001/JPKD001), `salary_profiles` (3 tầng lương + 9 PC, version theo `effective_from`), `timesheets`, `timesheet_days`, `payroll_runs` (2 scheme OFFICIAL/INTERNAL), `payroll_lines` (54 cột Excel → cột chuẩn + `detail` jsonb), `commission_rules`, `sales_entries`, `contractor_payments` (CTV gross-up 10%), `payout_batches`, `payslips` |
| Forecast | `forecast_lines` (OPN/AR/AP roll theo ngày), `ar_schedule`, `ap_schedule` |
| Cấu hình | `periods`, `policy_params` (BHXH/BHYT/BHTN/TNLĐ/KPCĐ + giảm trừ 15.5tr/6.2tr + biểu thuế 7 bậc — VERSION HÓA, luật đổi chỉ thêm bản ghi), `import_maps` |

## Payroll engine (F4/F5)

10 bước: daily_rate → work_pay (HĐTV ×0.85) → OT 150/170/200% → leave_pay → gross → miễn thuế (ăn ca/ĐT/đồng phục cap 5tr) → BH công ty 21.5%+KPCĐ 2% / NLĐ 10.5%+đoàn phí (điều kiện ≥14 công) → giảm trừ → PIT lũy tiến 7 bậc (CTV flat 10%) → net. Tham số lấy từ `policy_params` hiệu lực theo kỳ — không hardcode.

**Golden test:** chạy lại kỳ T06 Joli Poli từ fixtures Excel gốc, engine phải ra ĐÚNG số thực lĩnh từng NV. Sai 1 đồng = không ship.

## API `/api/v1/qldn`

- `GET /health`
- `GET|POST /periods` · `POST /periods/:id/close`
- `GET|POST /policy-params` · `GET /policy-params/effective?date=`
- `GET|POST /employees` · `PATCH /employees/:id`
- (F2+) timesheets import, payroll runs/calculate/approve, payslips, payouts, contractors, forecast, commission

## Quyền

14 permission `qldn.*` trong PERMISSION_REGISTRY. Manager có `qldn.*`; staff chỉ `qldn.payslip.read`. Mutation nhạy cảm (payroll.run/approve, payout.create...) securityLevel 2 + sensitive → Tiểu Tâm dry-run trước, confirm mới ghi.

## Kế hoạch đúc

F1 skeleton+schema (bản này) → F2 employee+import → F3 timesheet+BCC → F4 payroll OFFICIAL → F5 INTERNAL+commission → F6 payout+payslip+CTV → F7 forecast+outbox → F7.5 scheduler auto-run → F8 Tiểu Tâm tools/actions+UI → F9 golden regression + FINAL.

## Verify

```bash
pnpm --filter @citadel/module-qldn typecheck
pnpm --filter @citadel/module-qldn test
pnpm --filter @citadel/api exec tsx ../../scripts/audit-manifests.mts
```
