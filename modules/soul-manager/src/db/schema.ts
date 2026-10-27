/**
 * SOUL-MANAGER — Drizzle schema (mirror của migrations/0000_init.sql)
 * Hợp đồng Citadel mặt cắt ④: mọi bảng có id, org_id (+index), timestamps.
 * Hiến pháp #5: tiền/lương dùng numeric — Drizzle trả về string,
 * KHÔNG BAO GIỜ cast Number() cho nghiệp vụ; tính toán qua src/money.ts.
 */
import {
  pgTable, uuid, text, numeric, jsonb, boolean, timestamp,
  index, uniqueIndex, integer, date, time,
} from 'drizzle-orm/pg-core';

export const hrSettings = pgTable('sm_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  standardWorkDays: numeric('standard_work_days', { precision: 5, scale: 2 }).notNull().default('26'),
  workHoursPerDay: numeric('work_hours_per_day', { precision: 4, scale: 2 }).notNull().default('8'),
  defaultRegion: integer('default_region').notNull().default(1),
  policy: jsonb('policy').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('sm_settings_org_uq').on(t.orgId),
  index('sm_settings_org_idx').on(t.orgId),
]);

export const hrDepartments = pgTable('sm_departments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  parentId: uuid('parent_id'),
  managerId: uuid('manager_id'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('sm_departments_org_code_uq').on(t.orgId, t.code),
  index('sm_departments_org_idx').on(t.orgId),
  index('sm_departments_org_parent_idx').on(t.orgId, t.parentId),
]);

export const hrPositions = pgTable('sm_positions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  code: text('code').notNull(),
  title: text('title').notNull(),
  level: integer('level'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('sm_positions_org_code_uq').on(t.orgId, t.code),
  index('sm_positions_org_idx').on(t.orgId),
]);

export const hrEmployees = pgTable('sm_employees', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  code: text('code').notNull(),
  fullName: text('full_name').notNull(),
  dob: date('dob'),
  gender: text('gender', { enum: ['nam', 'nu', 'khac'] }),
  nationalId: text('national_id'),
  taxCode: text('tax_code'),
  siNumber: text('si_number'),
  address: text('address'),
  phone: text('phone'),
  email: text('email'),
  departmentId: uuid('department_id').references(() => hrDepartments.id),
  positionId: uuid('position_id').references(() => hrPositions.id),
  managerId: uuid('manager_id'),
  hireDate: date('hire_date').notNull(),
  probationEnd: date('probation_end'),
  status: text('status', { enum: ['probation', 'active', 'on_leave', 'terminated'] })
    .notNull().default('probation'),
  contractType: text('contract_type', { enum: ['probation', 'fixed_term', 'indefinite', 'seasonal'] })
    .notNull().default('probation'),
  baseSalary: numeric('base_salary', { precision: 15, scale: 2 }).notNull().default('0'),
  insuranceSalary: numeric('insurance_salary', { precision: 15, scale: 2 }),
  workRegion: integer('work_region'),
  emergencyContactName: text('emergency_contact_name'),
  emergencyContactPhone: text('emergency_contact_phone'),
  terminatedAt: date('terminated_at'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('sm_employees_org_code_uq').on(t.orgId, t.code),
  index('sm_employees_org_idx').on(t.orgId),
  index('sm_employees_org_dept_idx').on(t.orgId, t.departmentId),
  index('sm_employees_org_status_idx').on(t.orgId, t.status),
]);

export const hrContracts = pgTable('sm_contracts', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  employeeId: uuid('employee_id').notNull().references(() => hrEmployees.id),
  contractNo: text('contract_no').notNull(),
  type: text('type', { enum: ['probation', 'fixed_term', 'indefinite', 'seasonal'] }).notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  baseSalary: numeric('base_salary', { precision: 15, scale: 2 }).notNull(),
  insuranceSalary: numeric('insurance_salary', { precision: 15, scale: 2 }),
  status: text('status', { enum: ['active', 'expired', 'terminated'] }).notNull().default('active'),
  signedDate: date('signed_date'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('sm_contracts_org_no_uq').on(t.orgId, t.contractNo),
  index('sm_contracts_org_idx').on(t.orgId),
  index('sm_contracts_org_emp_idx').on(t.orgId, t.employeeId),
]);

export const hrDependents = pgTable('sm_dependents', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  employeeId: uuid('employee_id').notNull().references(() => hrEmployees.id),
  fullName: text('full_name').notNull(),
  relationship: text('relationship').notNull(),
  dob: date('dob'),
  taxCode: text('tax_code'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('sm_dependents_org_idx').on(t.orgId),
  index('sm_dependents_org_emp_idx').on(t.orgId, t.employeeId),
]);

export const hrAllowances = pgTable('sm_allowances', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  employeeId: uuid('employee_id').notNull().references(() => hrEmployees.id),
  name: text('name').notNull(),
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  taxable: boolean('taxable').notNull().default(true),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('sm_allowances_org_idx').on(t.orgId),
  index('sm_allowances_org_emp_idx').on(t.orgId, t.employeeId),
]);

export const hrShifts = pgTable('sm_shifts', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  startTime: time('start_time').notNull(),
  endTime: time('end_time').notNull(),
  breakMinutes: integer('break_minutes').notNull().default(60),
  workHours: numeric('work_hours', { precision: 4, scale: 2 }).notNull().default('8'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('sm_shifts_org_code_uq').on(t.orgId, t.code),
  index('sm_shifts_org_idx').on(t.orgId),
]);

export const hrAttendance = pgTable('sm_attendance', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  employeeId: uuid('employee_id').notNull().references(() => hrEmployees.id),
  workDate: date('work_date').notNull(),
  shiftId: uuid('shift_id').references(() => hrShifts.id),
  checkIn: timestamp('check_in', { withTimezone: true }),
  checkOut: timestamp('check_out', { withTimezone: true }),
  workDays: numeric('work_days', { precision: 3, scale: 2 }).notNull().default('1'),
  otWeekdayHours: numeric('ot_weekday_hours', { precision: 5, scale: 2 }).notNull().default('0'),
  otWeekendHours: numeric('ot_weekend_hours', { precision: 5, scale: 2 }).notNull().default('0'),
  otHolidayHours: numeric('ot_holiday_hours', { precision: 5, scale: 2 }).notNull().default('0'),
  lateMinutes: integer('late_minutes').notNull().default(0),
  earlyMinutes: integer('early_minutes').notNull().default(0),
  status: text('status', { enum: ['present', 'half_day', 'absent', 'leave', 'holiday'] })
    .notNull().default('present'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('sm_attendance_org_emp_date_uq').on(t.orgId, t.employeeId, t.workDate),
  index('sm_attendance_org_idx').on(t.orgId),
  index('sm_attendance_org_date_idx').on(t.orgId, t.workDate),
]);

export const hrLeaveTypes = pgTable('sm_leave_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  paid: boolean('paid').notNull().default(true),
  annualQuota: numeric('annual_quota', { precision: 5, scale: 2 }),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('sm_leave_types_org_code_uq').on(t.orgId, t.code),
  index('sm_leave_types_org_idx').on(t.orgId),
]);

export const hrLeaveBalances = pgTable('sm_leave_balances', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  employeeId: uuid('employee_id').notNull().references(() => hrEmployees.id),
  leaveTypeId: uuid('leave_type_id').notNull().references(() => hrLeaveTypes.id),
  year: integer('year').notNull(),
  entitled: numeric('entitled', { precision: 5, scale: 2 }).notNull().default('0'),
  used: numeric('used', { precision: 5, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('sm_leave_balances_uq').on(t.orgId, t.employeeId, t.leaveTypeId, t.year),
  index('sm_leave_balances_org_idx').on(t.orgId),
]);

export const hrLeaveRequests = pgTable('sm_leave_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  employeeId: uuid('employee_id').notNull().references(() => hrEmployees.id),
  leaveTypeId: uuid('leave_type_id').notNull().references(() => hrLeaveTypes.id),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  days: numeric('days', { precision: 5, scale: 2 }).notNull(),
  reason: text('reason'),
  status: text('status', { enum: ['pending', 'approved', 'rejected', 'cancelled'] })
    .notNull().default('pending'),
  approverId: uuid('approver_id'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionNote: text('decision_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('sm_leave_requests_org_idx').on(t.orgId),
  index('sm_leave_requests_org_emp_idx').on(t.orgId, t.employeeId),
  index('sm_leave_requests_org_status_idx').on(t.orgId, t.status),
]);

export const hrPayrollPeriods = pgTable('sm_payroll_periods', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  year: integer('year').notNull(),
  month: integer('month').notNull(),
  status: text('status', { enum: ['draft', 'calculated', 'approved', 'paid'] })
    .notNull().default('draft'),
  standardWorkDays: numeric('standard_work_days', { precision: 5, scale: 2 }).notNull().default('26'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('sm_payroll_periods_uq').on(t.orgId, t.year, t.month),
  index('sm_payroll_periods_org_idx').on(t.orgId),
]);

export const hrPayslips = pgTable('sm_payslips', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  periodId: uuid('period_id').notNull().references(() => hrPayrollPeriods.id),
  employeeId: uuid('employee_id').notNull().references(() => hrEmployees.id),
  baseSalary: numeric('base_salary', { precision: 15, scale: 2 }).notNull(),
  standardWorkDays: numeric('standard_work_days', { precision: 5, scale: 2 }).notNull(),
  workedDays: numeric('worked_days', { precision: 5, scale: 2 }).notNull().default('0'),
  paidLeaveDays: numeric('paid_leave_days', { precision: 5, scale: 2 }).notNull().default('0'),
  paidDays: numeric('paid_days', { precision: 5, scale: 2 }).notNull().default('0'),
  salaryByDays: numeric('salary_by_days', { precision: 15, scale: 2 }).notNull().default('0'),
  allowanceTaxable: numeric('allowance_taxable', { precision: 15, scale: 2 }).notNull().default('0'),
  allowanceNontaxable: numeric('allowance_nontaxable', { precision: 15, scale: 2 }).notNull().default('0'),
  otHours: numeric('ot_hours', { precision: 6, scale: 2 }).notNull().default('0'),
  otPay: numeric('ot_pay', { precision: 15, scale: 2 }).notNull().default('0'),
  otTaxExempt: numeric('ot_tax_exempt', { precision: 15, scale: 2 }).notNull().default('0'),
  gross: numeric('gross', { precision: 15, scale: 2 }).notNull().default('0'),
  insuranceBase: numeric('insurance_base', { precision: 15, scale: 2 }).notNull().default('0'),
  uiBase: numeric('ui_base', { precision: 15, scale: 2 }).notNull().default('0'),
  siAmount: numeric('si_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  hiAmount: numeric('hi_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  uiAmount: numeric('ui_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  insuranceTotal: numeric('insurance_total', { precision: 15, scale: 2 }).notNull().default('0'),
  dependentsCount: integer('dependents_count').notNull().default(0),
  personalDeduction: numeric('personal_deduction', { precision: 15, scale: 2 }).notNull().default('0'),
  dependentDeduction: numeric('dependent_deduction', { precision: 15, scale: 2 }).notNull().default('0'),
  taxableIncome: numeric('taxable_income', { precision: 15, scale: 2 }).notNull().default('0'),
  assessableIncome: numeric('assessable_income', { precision: 15, scale: 2 }).notNull().default('0'),
  pit: numeric('pit', { precision: 15, scale: 2 }).notNull().default('0'),
  otherDeductions: numeric('other_deductions', { precision: 15, scale: 2 }).notNull().default('0'),
  net: numeric('net', { precision: 15, scale: 2 }).notNull().default('0'),
  breakdown: jsonb('breakdown').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('sm_payslips_uq').on(t.orgId, t.periodId, t.employeeId),
  index('sm_payslips_org_idx').on(t.orgId),
]);

export const hrJobOpenings = pgTable('sm_job_openings', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  title: text('title').notNull(),
  departmentId: uuid('department_id').references(() => hrDepartments.id),
  headcount: integer('headcount').notNull().default(1),
  status: text('status', { enum: ['open', 'closed'] }).notNull().default('open'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('sm_job_openings_org_idx').on(t.orgId),
]);

export const hrCandidates = pgTable('sm_candidates', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  openingId: uuid('opening_id').notNull().references(() => hrJobOpenings.id),
  fullName: text('full_name').notNull(),
  email: text('email'),
  phone: text('phone'),
  stage: text('stage', { enum: ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'] })
    .notNull().default('applied'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('sm_candidates_org_idx').on(t.orgId),
  index('sm_candidates_org_opening_idx').on(t.orgId, t.openingId),
  index('sm_candidates_org_stage_idx').on(t.orgId, t.stage),
]);

export const hrCourses = pgTable('sm_courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  hours: numeric('hours', { precision: 5, scale: 1 }),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('sm_courses_org_code_uq').on(t.orgId, t.code),
  index('sm_courses_org_idx').on(t.orgId),
]);

export const hrEnrollments = pgTable('sm_enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  courseId: uuid('course_id').notNull().references(() => hrCourses.id),
  employeeId: uuid('employee_id').notNull().references(() => hrEmployees.id),
  status: text('status', { enum: ['enrolled', 'completed', 'dropped'] }).notNull().default('enrolled'),
  score: numeric('score', { precision: 5, scale: 2 }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('sm_enrollments_uq').on(t.orgId, t.courseId, t.employeeId),
  index('sm_enrollments_org_idx').on(t.orgId),
]);

export const hrSchema = {
  hrSettings, hrDepartments, hrPositions, hrEmployees, hrContracts,
  hrDependents, hrAllowances, hrShifts, hrAttendance, hrLeaveTypes,
  hrLeaveBalances, hrLeaveRequests, hrPayrollPeriods, hrPayslips,
  hrJobOpenings, hrCandidates, hrCourses, hrEnrollments,
};
