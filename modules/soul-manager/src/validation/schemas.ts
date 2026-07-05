/**
 * SOUL-MANAGER — Zod schemas (mặt cắt ⑦: biên giới canh gác)
 * Mọi đầu vào (route hay tool) validate bằng schema NGAY TẠI BIÊN.
 * Không tin dữ liệu thô. Tiền/ngày công nhận string|number nhưng
 * chuẩn hóa về string decimal để giữ Hiến pháp #5.
 */
import { z } from 'zod';

/** Tiền VND ≥ 0, tối đa 2 lẻ, chuẩn hóa string */
export const zMoney = z.union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), 'Số tiền phải là số ≥ 0, tối đa 2 chữ số thập phân');

/** Ngày công / số ngày ≥ 0, bước 0.5 hợp lệ, tối đa 2 lẻ */
export const zDays = z.union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), 'Số ngày phải là số ≥ 0');

/** Số giờ ≥ 0, tối đa 2 lẻ */
export const zHours = z.union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), 'Số giờ phải là số ≥ 0');

export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
export const zTimeHM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ dạng HH:MM');
export const zCode = z.string().trim().min(1).max(64);
export const zYear = z.number().int().min(2000).max(2100);
export const zMonth = z.number().int().min(1).max(12);

// ── Employee ─────────────────────────────────────────────────
export const employeeCreateSchema = z.object({
  code: zCode.optional(),                       // tự sinh NVxxxx nếu bỏ trống
  full_name: z.string().trim().min(1).max(255),
  dob: zDate.optional(),
  gender: z.enum(['nam', 'nu', 'khac']).optional(),
  national_id: z.string().trim().max(20).optional(),
  tax_code: z.string().trim().max(20).optional(),
  si_number: z.string().trim().max(20).optional(),
  address: z.string().max(500).optional(),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().max(255).optional(),
  department: z.string().trim().max(255).optional(),   // tên/mã — get-or-create
  position: z.string().trim().max(255).optional(),     // tên/mã — get-or-create
  manager_code: zCode.optional(),
  hire_date: zDate,
  probation_end: zDate.optional(),
  status: z.enum(['probation', 'active']).default('probation'),
  contract_type: z.enum(['probation', 'fixed_term', 'indefinite', 'seasonal']).default('probation'),
  base_salary: zMoney,
  insurance_salary: zMoney.optional(),
  work_region: z.number().int().min(1).max(4).optional(),
  emergency_contact_name: z.string().max(255).optional(),
  emergency_contact_phone: z.string().max(20).optional(),
});

export const employeeUpdateSchema = z.object({
  code: zCode,                                   // định danh NV cần sửa
  full_name: z.string().trim().min(1).max(255).optional(),
  department: z.string().trim().max(255).optional(),
  position: z.string().trim().max(255).optional(),
  manager_code: zCode.optional(),
  status: z.enum(['probation', 'active', 'on_leave', 'terminated']).optional(),
  contract_type: z.enum(['probation', 'fixed_term', 'indefinite', 'seasonal']).optional(),
  base_salary: zMoney.optional(),
  insurance_salary: zMoney.optional(),
  work_region: z.number().int().min(1).max(4).optional(),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().max(255).optional(),
  address: z.string().max(500).optional(),
  terminated_at: zDate.optional(),               // bắt buộc kèm status='terminated'
  note: z.string().max(1000).optional(),
});

export const employeeSearchSchema = z.object({
  q: z.string().trim().max(255).optional(),          // tên hoặc mã
  department: z.string().trim().max(255).optional(),
  status: z.enum(['probation', 'active', 'on_leave', 'terminated']).optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

export const employeeGetSchema = z.object({ code: zCode });

export const dependentRegisterSchema = z.object({
  employee_code: zCode,
  full_name: z.string().trim().min(1).max(255),
  relationship: z.string().trim().min(1).max(64),    // con / vợ / chồng / cha / mẹ...
  dob: zDate.optional(),
  tax_code: z.string().trim().max(20).optional(),
  active: z.boolean().default(true),                 // false = ngừng giảm trừ
});

// ── Org ──────────────────────────────────────────────────────
export const orgChartSchema = z.object({
  include_employees: z.boolean().default(false),
});

// ── Attendance ───────────────────────────────────────────────
export const attendanceRecordSchema = z.object({
  employee_code: zCode,
  work_date: zDate,
  shift_code: zCode.optional(),                 // mặc định ca HC
  check_in: zTimeHM.optional(),
  check_out: zTimeHM.optional(),
  status: z.enum(['present', 'half_day', 'absent', 'leave', 'holiday']).default('present'),
  ot_weekday_hours: zHours.default('0'),
  ot_weekend_hours: zHours.default('0'),
  ot_holiday_hours: zHours.default('0'),
  note: z.string().max(500).optional(),
  allow_update: z.boolean().default(false),     // false: ngày đã chấm → lỗi ATTENDANCE_DUPLICATE
});

export const attendanceSummarySchema = z.object({
  year: zYear,
  month: zMonth,
  employee_code: zCode.optional(),              // bỏ trống = toàn bộ
});

// ── Leave ────────────────────────────────────────────────────
export const leaveRequestSchema = z.object({
  employee_code: zCode,
  leave_type: zCode.default('PHEP-NAM'),        // PHEP-NAM | OM | THAI-SAN | KHONG-LUONG
  start_date: zDate,
  end_date: zDate,
  days: zDays,
  reason: z.string().max(500).optional(),
});

export const leaveDecideSchema = z.object({
  request_id: z.string().uuid(),
  decision: z.enum(['approved', 'rejected']),
  note: z.string().max(500).optional(),
});

export const leaveBalanceSchema = z.object({
  employee_code: zCode,
  year: zYear.optional(),                       // mặc định năm hiện tại
});

// ── Payroll ──────────────────────────────────────────────────
export const payrollRunSchema = z.object({
  year: zYear,
  month: zMonth,
  standard_work_days: zDays.optional(),         // mặc định hr_settings
  note: z.string().max(500).optional(),
});

export const payrollApproveSchema = z.object({
  year: zYear,
  month: zMonth,
});

export const payslipGetSchema = z.object({
  year: zYear,
  month: zMonth,
  employee_code: zCode.optional(),              // bỏ trống = tổng hợp cả kỳ
});

// ── Report ───────────────────────────────────────────────────
export const headcountReportSchema = z.object({
  from: zDate.optional(),
  to: zDate.optional(),
});

// ── Recruitment ──────────────────────────────────────────────
export const candidateAdvanceSchema = z.object({
  mode: z.enum(['add', 'move']),
  opening_title: z.string().trim().min(1).max(255),   // add: get-or-create vị trí tuyển
  full_name: z.string().trim().min(1).max(255),
  email: z.string().trim().max(255).optional(),
  phone: z.string().trim().max(20).optional(),
  stage: z.enum(['applied', 'screening', 'interview', 'offer', 'hired', 'rejected']).optional(),
  note: z.string().max(500).optional(),
});

export const recruitmentPipelineSchema = z.object({
  opening_title: z.string().trim().max(255).optional(),
});

// ── Training ─────────────────────────────────────────────────
export const trainingManageSchema = z.object({
  mode: z.enum(['create_course', 'enroll', 'complete']),
  course_code: zCode,
  course_name: z.string().trim().max(255).optional(),  // bắt buộc khi create_course
  hours: zHours.optional(),
  employee_code: zCode.optional(),                     // bắt buộc khi enroll/complete
  score: zDays.optional(),
});
