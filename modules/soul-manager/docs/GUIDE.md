# Soul-Manager — GUIDE (kiến trúc & vận hành)

## 1. Vị trí trong SuperCitadel

Soul-Manager là module rời cắm vào lõi Citadel theo hợp đồng 8 mặt cắt (§05). Host tiêm `db + bus + registry`; module **không import module khác** — mọi giao tiếp ra ngoài qua event `hr.*` (payload luôn `org_id`). Thay thế module `hr` cũ (khai `conflicts: ["hr"]`), dữ liệu cũ hút sang bằng migration `0002` idempotent.

## 2. Dữ liệu — 18 bảng một khuôn (mặt cắt ④)

Mọi bảng: `id uuid · org_id uuid NOT NULL (+index) · created_at · updated_at`, FORCE RLS policy `tenant_isolation` trên `current_setting('app.current_org_id')::uuid` — **fail-closed, không coalesce**: quên set org ⇒ query LỖI, không bao giờ trả nhầm dữ liệu.

| Khối | Bảng |
|---|---|
| Cấu hình | `hr_settings` (policy pháp lý per-org) |
| Tổ chức | `hr_departments` (cha-con) · `hr_positions` |
| Nhân viên | `hr_employees` · `hr_contracts` · `hr_dependents` · `hr_allowances` |
| Chấm công | `hr_shifts` · `hr_attendance` (unique org+NV+ngày) |
| Nghỉ phép | `hr_leave_types` · `hr_leave_balances` · `hr_leave_requests` |
| Lương | `hr_payroll_periods` · `hr_payslips` (breakdown jsonb kèm explain) |
| Tuyển dụng | `hr_job_openings` · `hr_candidates` |
| Đào tạo | `hr_courses` · `hr_enrollments` |

Tiền/lương/ngày công: `numeric`, Drizzle trả **string**, tính toán qua `src/money.ts` (BigInt scaled, half-up) — **không bao giờ `Number()`** cho nghiệp vụ (Hiến pháp #5). Guard số dư phép chạy **phía SQL** (`UPDATE ... WHERE entitled - used >= days`).

## 3. Golden path 6 bước

1. `hr.employee.create` — "Thêm nhân viên Trần Văn An, phòng Kinh doanh, lương 20 triệu, vào 1/7" → mã NV0001 tự sinh, phòng ban/chức danh tự tạo, phép năm 12 ngày tự mở.
2. `hr.attendance.record` × ngày — vào 08:00 ra 17:00, muộn/sớm tự tính theo ca HC; OT khai theo 3 loại giờ.
3. `hr.leave.request` → `hr.leave.decide` — đơn 1 ngày phép năm, duyệt xong số dư còn 11.
4. `hr.payroll.run {year, month}` — tính cả kỳ: công + phép hưởng lương + OT + BH + thuế → net.
5. `hr.payroll.payslip` — phiếu lương kèm `breakdown.explain[]` tiếng Việt để Tiểu Tâm đọc cho người dùng.
6. `hr.payroll.approve` — chốt kỳ; từ đây `run` lại sẽ bị `PERIOD_LOCKED`.

Smoke test (`tests/smoke.test.ts`) chạy đúng path này với 3 NV và đối chiếu **từng đồng**.

## 4. Chính sách pháp lý 2026 — MẶC ĐỊNH, CẤU HÌNH ĐƯỢC

> ⚠️ Các con số dưới đây đúng tại 07/2026 nhưng **thay đổi theo quy định hiện hành**. Tất cả nằm trong `DEFAULT_POLICY` (`src/config.ts`) và override được per-org qua `hr_settings.policy` — luật đổi chỉ sửa cấu hình, **không đụng code**.

| Tham số | Mặc định | Căn cứ |
|---|---|---|
| Giảm trừ bản thân | 15.500.000 đ/tháng | NQ 110/2025/UBTVQH15 (kỳ thuế 2026) |
| Giảm trừ mỗi NPT | 6.200.000 đ/tháng | NQ 110/2025/UBTVQH15 |
| Biểu thuế TNCN | 5 bậc: ≤10tr 5% · ≤30tr 10% · ≤60tr 20% · ≤100tr 30% · >100tr 35% | Luật 109/2025/QH15 |
| BH NLĐ đóng | BHXH 8% + BHYT 1,5% + BHTN 1% | Luật BHXH 41/2024/QH15 |
| BH NSDLĐ đóng (tham khảo) | 17,5% + 3% + 1% | — |
| Mức tham chiếu | 2.340.000 (từ 01/7/2024) → **2.530.000 (từ 01/7/2026)** | NĐ 73/2024 → NĐ 161/2026 |
| Trần BHXH/BHYT | 20 × mức tham chiếu (46,8tr → **50,6tr**) | Luật BHXH |
| LTT vùng I–IV (01/01/2026) | 5,31 / 4,73 / 4,14 / 3,70 triệu | NĐ 293/2025/NĐ-CP |
| Trần BHTN | 20 × LTT vùng (Vùng I = 106,2tr) | Luật Việc làm |
| Sàn lương đóng BH | LTT vùng của NV | — |
| Hệ số OT | 150% / 200% / 300% (thường/tuần/lễ), phần vượt 100% **miễn thuế TNCN** | Đ98 BLLĐ; TT 111/2013 |
| Phép năm | 12 ngày + 1 ngày/5 năm thâm niên | Đ113, Đ114 BLLĐ 2019 |
| Không đóng BH | Nghỉ không lương ≥ 14 ngày làm việc/tháng | Luật BHXH |

**Mốc hiệu lực (effective-dated):** `reference_levels` và `regional_min_wage` là mảng `{from, amount}` — engine tự chọn mốc đúng theo kỳ lương. Kỳ 06/2026 dùng trần 46,8tr, kỳ 07/2026 dùng 50,6tr (đã có test).

**Cập nhật khi luật đổi** — ví dụ nâng giảm trừ lên 18tr:
```sql
UPDATE hr_settings
SET policy = policy || '{"personal_deduction": "18000000"}'::jsonb
WHERE org_id = :org;
```
Thêm mốc tham chiếu mới: nối phần tử `{"from":"2027-07-01","amount":"2700000"}` vào `policy.insurance.reference_levels`.

## 5. Công thức lương (engine `computePayslipNumbers`)

```
paid_days      = công thực tế + ngày phép HƯỞNG LƯƠNG đã duyệt trong tháng
salary_by_days = base × paid_days / standard_work_days            (round0 đồng)
hourly         = base / (standard_work_days × work_hours_per_day)
ot_pay         = hourly × (h_thường×1.5 + h_tuần×2.0 + h_lễ×3.0)
ot_miễn_thuế   = hourly × (h_thường×0.5 + h_tuần×1.0 + h_lễ×2.0)
gross          = salary_by_days + phụ cấp (cả 2 loại) + ot_pay

căn cứ BH      = min( max(lương đóng BH, LTT vùng), 20 × tham_chiếu(kỳ) )
căn cứ BHTN    = min( ..., 20 × LTT_vùng(kỳ) )
BH = 0 nếu (standard − paid_days) ≥ 14                            (luật 14 ngày)

TN chịu thuế   = salary_by_days + phụ cấp CHỊU THUẾ + (ot_pay − ot_miễn_thuế)
TN tính thuế   = max(0, chịu thuế − BH − 15,5tr − NPT × 6,2tr)
thuế TNCN      = lũy tiến 5 bậc (làm tròn đồng MỘT lần cuối)
NET            = gross − BH − thuế − khấu trừ khác
```

Hai ví dụ đối chiếu tay (đều có trong test):
- **Lương 20tr, đủ 26 công, 0 NPT, kỳ 07/2026:** BH = 20tr × 10,5% = 2.100.000; TN tính thuế = 20 − 2,1 − 15,5 = 2.400.000 → thuế 5% = **120.000**; **net = 17.780.000 đ**.
- **Lương 30tr, 1 NPT:** BH = 3.150.000; TN tính thuế = 30 − 3,15 − 15,5 − 6,2 = 5.150.000 → thuế = **257.500**; **net = 26.592.500 đ**.

## 6. Vận hành

- **Role DB:** app kết nối bằng role **không superuser** (vd `citadel_app`) — superuser bypass RLS bất kể FORCE. Test đã mô phỏng đúng: `SET ROLE citadel_app` + `set_config('app.current_org_id', ..., true)` trong transaction.
- **Migrations:** chạy tuần tự 0000 → 0001 → 0002 bằng role migration (bypass RLS có chủ đích, một lần). Tất cả idempotent.
- **Seed lười per-org:** loại phép chuẩn + ca HC + settings tự tạo ở lần dùng đầu (onConflictDoNothing) — không cần bước setup riêng.

## 7. Giới hạn v1 (khai tường minh)

- Đơn nghỉ **không vắt tháng** (guard `LEAVE_SPANS_MONTHS`) — tách 2 đơn theo tháng.
- Thuế NV thử việc tính lũy tiến như chính thức (chưa hỗ trợ khấu trừ 10% hợp đồng <3 tháng).
- Ốm/thai sản: DN không trả lương (BHXH chi trả) — module ghi nhận ngày nghỉ, chưa tính trợ cấp BHXH thay.
- `standard_work_days` cố định theo settings/kỳ (mặc định 26), chưa tự đếm ngày làm việc theo lịch.
