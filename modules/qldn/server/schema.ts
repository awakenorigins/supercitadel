/**
 * QLDN V1A — Schema Drizzle, pgSchema("qldn") riêng.
 * Gỡ module = DROP SCHEMA qldn CASCADE. Mọi bảng đều có org_id (multi-tenant).
 * Nguồn thiết kế: reports/B5-BLUEPRINT-V1A.md (mổ từ bộ Excel Joli Poli T06).
 */
import {
  pgSchema, uuid, varchar, text, date, timestamp, integer, numeric,
  boolean, jsonb, index, uniqueIndex,
} from 'drizzle-orm/pg-core';

export const qldn = pgSchema('qldn');

const money = (name: string) => numeric(name, { precision: 20, scale: 2 });
const hours = (name: string) => numeric(name, { precision: 8, scale: 2 });
const days = (name: string) => numeric(name, { precision: 6, scale: 2 });

// ---------- ENUMS ----------
export const contractType = qldn.enum('contract_type', ['HDLD', 'HDTV', 'CTV']);
export const employeeStatus = qldn.enum('employee_status', ['active', 'inactive', 'terminated']);
export const payrollScheme = qldn.enum('payroll_scheme', ['OFFICIAL', 'INTERNAL']);
export const payrollStatus = qldn.enum('payroll_status', ['draft', 'calculated', 'approved', 'paid']);
export const timesheetSource = qldn.enum('timesheet_source', ['manual', 'machine', 'import']);
export const contractorKind = qldn.enum('contractor_kind', ['ctv', 'gia_cong', 'cong_tac']);
export const forecastDocType = qldn.enum('forecast_doc_type', ['OPN', 'AR', 'AP']);
export const forecastStatus = qldn.enum('forecast_status', ['open', 'settled']);
export const periodStatus = qldn.enum('period_status', ['open', 'closed']);

// ---------- Domain D: CẤU HÌNH ----------
/** Kỳ lương/kế toán tháng: T06/2026... */
export const periods = qldn.table('periods', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  code: varchar('code', { length: 10 }).notNull(), // '2026-06'
  name: varchar('name', { length: 40 }).notNull(), // 'Tháng 06/2026'
  standardDays: days('standard_days').notNull().default('26'),
  status: periodStatus('status').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  orgCodeUq: uniqueIndex('qldn_periods_org_code_uq').on(t.orgId, t.code),
}));

/** Tham số chính sách VERSION HÓA — luật đổi chỉ thêm bản ghi mới, không sửa code. */
export const policyParams = qldn.table('policy_params', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  effectiveFrom: date('effective_from').notNull(),
  // Bảo hiểm phía công ty (basis points của lương BHXH): 17% BHXH + 3% BHYT + 1% BHTN + 0.5% TNLĐ
  insCompanyBp: integer('ins_company_bp').notNull().default(2150),
  kpcdBp: integer('kpcd_bp').notNull().default(200), // kinh phí công đoàn 2%
  // Phía người lao động: 8% + 1.5% + 1%
  insEmployeeBp: integer('ins_employee_bp').notNull().default(1050),
  unionFeeBp: integer('union_fee_bp').notNull().default(50), // đoàn phí 0.5%
  deductionPersonal: money('deduction_personal').notNull().default('15500000'),
  deductionDependent: money('deduction_dependent').notNull().default('6200000'),
  uniformCapYear: money('uniform_cap_year').notNull().default('5000000'),
  insuranceMinDays: days('insurance_min_days').notNull().default('14'),
  hdtvFactorBp: integer('hdtv_factor_bp').notNull().default(8500), // hệ số HĐTV 0.85
  ctvPitBp: integer('ctv_pit_bp').notNull().default(1000), // CTV khấu trừ 10%
  otRates: jsonb('ot_rates').notNull().default({ ot150: 1.5, ot170: 1.7, ot200: 2.0 }),
  // Biểu thuế lũy tiến 7 bậc: [{upTo, rateBp, subtract}] — upTo null = vô cực
  pitBrackets: jsonb('pit_brackets').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  orgEffIdx: index('qldn_policy_org_eff_idx').on(t.orgId, t.effectiveFrom),
}));

/** Mapping template import Excel (BCC/lương cũ/forecast) → cột chuẩn. */
export const importMaps = qldn.table('import_maps', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  kind: varchar('kind', { length: 30 }).notNull(), // 'bcc' | 'payroll_legacy' | 'forecast' | 'employees'
  name: varchar('name', { length: 120 }).notNull(),
  mapping: jsonb('mapping').notNull(), // { sheet, headerRow, columns: {...} }
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  orgKindIdx: index('qldn_import_maps_org_kind_idx').on(t.orgId, t.kind),
}));

// ---------- Domain A: HR-PAYROLL ----------
/** Hồ sơ nhân viên — mã kép: chính thức (NV001) + nội bộ (JPKD001). */
export const employees = qldn.table('employees', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  codeOfficial: varchar('code_official', { length: 20 }),
  codeInternal: varchar('code_internal', { length: 20 }),
  fullName: varchar('full_name', { length: 120 }).notNull(),
  contractType: contractType('contract_type').notNull().default('HDLD'),
  position: varchar('position', { length: 80 }),
  department: varchar('department', { length: 80 }),
  unit: varchar('unit', { length: 80 }), // khối
  dependentsCount: integer('dependents_count').notNull().default(0),
  bhxhEnrolled: boolean('bhxh_enrolled').notNull().default(false),
  bankAccount: varchar('bank_account', { length: 40 }),
  bankName: varchar('bank_name', { length: 120 }),
  taxCode: varchar('tax_code', { length: 20 }),
  idNumber: varchar('id_number', { length: 20 }),
  joinedDate: date('joined_date'),
  status: employeeStatus('status').notNull().default('active'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  orgStatusIdx: index('qldn_emp_org_status_idx').on(t.orgId, t.status),
  orgCodeOffUq: uniqueIndex('qldn_emp_org_code_off_uq').on(t.orgId, t.codeOfficial),
}));

/** Hồ sơ lương 3 tầng + 9 phụ cấp, version theo effective_from. */
export const salaryProfiles = qldn.table('salary_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  employeeId: uuid('employee_id').notNull(),
  effectiveFrom: date('effective_from').notNull(),
  bhxhSalary: money('bhxh_salary').notNull().default('0'),
  baseSalary: money('base_salary').notNull().default('0'),
  baseSalaryInternal: money('base_salary_internal').notNull().default('0'),
  allowResponsibility: money('allow_responsibility').notNull().default('0'),
  allowMeal: money('allow_meal').notNull().default('0'),
  allowFuel: money('allow_fuel').notNull().default('0'),
  allowPhone: money('allow_phone').notNull().default('0'),
  allowUniform: money('allow_uniform').notNull().default('0'),
  allowCreative: money('allow_creative').notNull().default('0'),
  allowSkill: money('allow_skill').notNull().default('0'),
  allowPosition: money('allow_position').notNull().default('0'),
  allowOther: money('allow_other').notNull().default('0'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  orgEmpEffIdx: index('qldn_salprof_org_emp_eff_idx').on(t.orgId, t.employeeId, t.effectiveFrom),
}));

/** Chấm công tháng tổng hợp / nhân viên / kỳ. */
export const timesheets = qldn.table('timesheets', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  employeeId: uuid('employee_id').notNull(),
  periodId: uuid('period_id').notNull(),
  workDays: days('work_days').notNull().default('0'),
  paidLeaveDays: days('paid_leave_days').notNull().default('0'),
  unpaidDays: days('unpaid_days').notNull().default('0'),
  ot150Hours: hours('ot150_hours').notNull().default('0'),
  ot170Hours: hours('ot170_hours').notNull().default('0'),
  ot200Hours: hours('ot200_hours').notNull().default('0'),
  lateCount: integer('late_count').notNull().default(0),
  lateMinutes: integer('late_minutes').notNull().default(0),
  totalHours: hours('total_hours').notNull().default('0'),
  source: timesheetSource('source').notNull().default('manual'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  orgEmpPeriodUq: uniqueIndex('qldn_ts_org_emp_period_uq').on(t.orgId, t.employeeId, t.periodId),
  orgPeriodIdx: index('qldn_ts_org_period_idx').on(t.orgId, t.periodId),
}));

/** Chi tiết từng ngày công: ký hiệu X/P/L/KL/TV hoặc giờ máy. */
export const timesheetDays = qldn.table('timesheet_days', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  timesheetId: uuid('timesheet_id').notNull(),
  day: date('day').notNull(),
  symbol: varchar('symbol', { length: 8 }), // X / P / L / KL / TV / X2...
  hoursInOut: jsonb('hours_in_out'), // { in: '08:02', out: '17:31' }
  workHours: hours('work_hours').notNull().default('0'),
  otHours: hours('ot_hours').notNull().default('0'),
  note: text('note'),
}, (t) => ({
  orgTsDayUq: uniqueIndex('qldn_tsd_org_ts_day_uq').on(t.orgId, t.timesheetId, t.day),
}));

/** Bảng lương kỳ theo scheme (OFFICIAL = BHXH/thuế, INTERNAL = doanh số). */
export const payrollRuns = qldn.table('payroll_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  periodId: uuid('period_id').notNull(),
  scheme: payrollScheme('scheme').notNull(),
  status: payrollStatus('status').notNull().default('draft'),
  standardDays: days('standard_days').notNull().default('26'),
  policyParamsId: uuid('policy_params_id'),
  calculatedAt: timestamp('calculated_at', { withTimezone: true }),
  approvedBy: uuid('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  orgPeriodSchemeUq: uniqueIndex('qldn_pr_org_period_scheme_uq').on(t.orgId, t.periodId, t.scheme),
}));

/** Dòng lương từng nhân viên — đúc lại engine 54 cột Excel. */
export const payrollLines = qldn.table('payroll_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  runId: uuid('run_id').notNull(),
  employeeId: uuid('employee_id').notNull(),
  workPay: money('work_pay').notNull().default('0'),
  allowancePay: money('allowance_pay').notNull().default('0'),
  otPay: money('ot_pay').notNull().default('0'),
  leavePay: money('leave_pay').notNull().default('0'),
  bonus: money('bonus').notNull().default('0'),
  commission: money('commission').notNull().default('0'),
  gross: money('gross').notNull().default('0'),
  taxExemptTotal: money('tax_exempt_total').notNull().default('0'),
  insuranceCompany: money('insurance_company').notNull().default('0'),
  insuranceEmployee: money('insurance_employee').notNull().default('0'),
  unionFee: money('union_fee').notNull().default('0'),
  deductionPersonal: money('deduction_personal').notNull().default('0'),
  deductionDependents: money('deduction_dependents').notNull().default('0'),
  taxableIncome: money('taxable_income').notNull().default('0'),
  pit: money('pit').notNull().default('0'),
  advanceDeduct: money('advance_deduct').notNull().default('0'),
  otherDeduct: money('other_deduct').notNull().default('0'),
  netPay: money('net_pay').notNull().default('0'),
  detail: jsonb('detail'), // snapshot input + từng bước tính (audit golden test)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  orgRunEmpUq: uniqueIndex('qldn_pl_org_run_emp_uq').on(t.orgId, t.runId, t.employeeId),
  orgRunIdx: index('qldn_pl_org_run_idx').on(t.orgId, t.runId),
}));

/** Ma trận % hoa hồng theo vai trò (từ F2.DOANH SỐ). */
export const commissionRules = qldn.table('commission_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  roleKey: varchar('role_key', { length: 60 }).notNull(),
  rateBp: integer('rate_bp').notNull().default(0),
  thresholdAmount: money('threshold_amount'),
  overRateBp: integer('over_rate_bp'),
  effectiveFrom: date('effective_from').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  orgRoleEffIdx: index('qldn_cr_org_role_eff_idx').on(t.orgId, t.roleKey, t.effectiveFrom),
}));

/** Doanh số theo đơn hàng (JP2501xx) gắn nhân viên phụ trách. */
export const salesEntries = qldn.table('sales_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  orderCode: varchar('order_code', { length: 30 }).notNull(),
  customer: varchar('customer', { length: 160 }),
  contractNo: varchar('contract_no', { length: 60 }),
  revenue: money('revenue').notNull().default('0'),
  entryDate: date('entry_date').notNull(),
  ownerEmployeeId: uuid('owner_employee_id'),
  periodId: uuid('period_id'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  orgOrderIdx: index('qldn_se_org_order_idx').on(t.orgId, t.orderCode),
  orgPeriodIdx: index('qldn_se_org_period_idx').on(t.orgId, t.periodId),
}));

/** Thanh toán CTV / gia công ngoài / công tác phí — khấu trừ 10% gross-up. */
export const contractorPayments = qldn.table('contractor_payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  periodId: uuid('period_id'),
  contractorName: varchar('contractor_name', { length: 160 }).notNull(),
  taxCode: varchar('tax_code', { length: 20 }),
  idNumber: varchar('id_number', { length: 20 }),
  kind: contractorKind('kind').notNull().default('ctv'),
  qty: numeric('qty', { precision: 12, scale: 2 }),
  unitPrice: money('unit_price'),
  grossAmount: money('gross_amount').notNull().default('0'),
  pitWithheld: money('pit_withheld').notNull().default('0'),
  netAmount: money('net_amount').notNull().default('0'),
  paidAt: date('paid_at'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  orgPeriodIdx: index('qldn_ctr_org_period_idx').on(t.orgId, t.periodId),
}));

/** Batch chi lương ngân hàng (UNC). */
export const payoutBatches = qldn.table('payout_batches', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  runId: uuid('run_id').notNull(),
  bankFileRef: varchar('bank_file_ref', { length: 200 }),
  lines: jsonb('lines').notNull().default([]), // [{employeeId, bankAccount, bankName, amount}]
  totalAmount: money('total_amount').notNull().default('0'),
  status: varchar('status', { length: 16 }).notNull().default('draft'), // draft/exported/paid
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  orgRunIdx: index('qldn_pb_org_run_idx').on(t.orgId, t.runId),
}));

/** Phiếu lương render snapshot (bất biến sau approve). */
export const payslips = qldn.table('payslips', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  runId: uuid('run_id').notNull(),
  employeeId: uuid('employee_id').notNull(),
  periodCode: varchar('period_code', { length: 10 }).notNull(),
  snapshot: jsonb('snapshot').notNull(), // toàn bộ dòng lương + thông tin NV tại thời điểm chốt
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  orgRunEmpUq: uniqueIndex('qldn_ps_org_run_emp_uq').on(t.orgId, t.runId, t.employeeId),
}));

// ---------- Domain C: FORECAST ----------
/** Sổ dự báo dòng tiền roll theo ngày (từ F7 — 400 dòng). */
export const forecastLines = qldn.table('forecast_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  docNo: varchar('doc_no', { length: 60 }),
  docType: forecastDocType('doc_type').notNull(),
  dueDate: date('due_date').notNull(),
  description: text('description'),
  inflow: money('inflow').notNull().default('0'),
  outflow: money('outflow').notNull().default('0'),
  sourceRef: varchar('source_ref', { length: 80 }), // k10a invoice/bill id
  status: forecastStatus('status').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  orgDueIdx: index('qldn_fl_org_due_idx').on(t.orgId, t.dueDate),
  orgStatusIdx: index('qldn_fl_org_status_idx').on(t.orgId, t.status),
}));

/** Lịch thu theo đơn JP (lần 1/2/hết). */
export const arSchedule = qldn.table('ar_schedule', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  orderCode: varchar('order_code', { length: 30 }).notNull(),
  customer: varchar('customer', { length: 160 }),
  installmentNo: integer('installment_no').notNull().default(1),
  amount: money('amount').notNull().default('0'),
  dueDate: date('due_date'),
  receivedAt: date('received_at'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  orgOrderIdx: index('qldn_ar_org_order_idx').on(t.orgId, t.orderCode),
}));

/** Lịch trả nhà cung cấp (MH mua hàng / SPA ship). */
export const apSchedule = qldn.table('ap_schedule', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  vendor: varchar('vendor', { length: 160 }).notNull(),
  docNo: varchar('doc_no', { length: 60 }),
  amount: money('amount').notNull().default('0'),
  dueDate: date('due_date'),
  paidAt: date('paid_at'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  orgVendorIdx: index('qldn_ap_org_vendor_idx').on(t.orgId, t.vendor),
}));

/** Gom schema cho drizzle({ schema }). */
export const schema = {
  periods, policyParams, importMaps,
  employees, salaryProfiles, timesheets, timesheetDays,
  payrollRuns, payrollLines, commissionRules, salesEntries,
  contractorPayments, payoutBatches, payslips,
  forecastLines, arSchedule, apSchedule,
};
