import { pgTable, uuid, varchar, text, date, timestamp, index } from 'drizzle-orm/pg-core';
export const hrShifts = pgTable('hr_shifts', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  name: varchar('name', { length: 60 }).notNull(),
  shiftDate: date('shift_date').notNull(),
  startTime: varchar('start_time', { length: 8 }).notNull(),
  endTime: varchar('end_time', { length: 8 }).notNull(),
  staff: text('staff').notNull().default(''),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ orgIdx: index('hr_shifts_org_idx').on(t.orgId, t.shiftDate) }));

// ── HR v2 (port domain model từ frappe/hrms) ──
import { boolean, numeric, integer } from 'drizzle-orm/pg-core';

export const hrEmployees = pgTable('hr_employees', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  userId: uuid('user_id'),
  fullName: varchar('full_name', { length: 120 }).notNull(),
  roleTitle: varchar('role_title', { length: 80 }).notNull().default('Nhân viên'),
  phone: varchar('phone', { length: 20 }),
  joinedDate: date('joined_date'),
  status: varchar('status', { length: 16 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ orgIdx: index('hr_emp_org_idx').on(t.orgId, t.status) }));

export const hrAttendance = pgTable('hr_attendance', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  employeeId: uuid('employee_id').notNull(),
  attDate: date('att_date').notNull(),
  checkIn: timestamp('check_in', { withTimezone: true }),
  checkOut: timestamp('check_out', { withTimezone: true }),
  workingHours: numeric('working_hours', { precision: 5, scale: 2 }).notNull().default('0'),
  status: varchar('status', { length: 16 }).notNull().default('present'),
  lateEntry: boolean('late_entry').notNull().default(false),
  shiftId: uuid('shift_id'),
  note: text('note'),
}, (t) => ({ orgDateIdx: index('hr_att_org_date_idx').on(t.orgId, t.attDate) }));

export const hrLeaveTypes = pgTable('hr_leave_types', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  name: varchar('name', { length: 80 }).notNull(),
  daysPerYear: numeric('days_per_year', { precision: 5, scale: 1 }).notNull().default('12'),
  isPaid: boolean('is_paid').notNull().default(true),
  carryForward: boolean('carry_forward').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const hrLeaveAllocations = pgTable('hr_leave_allocations', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  employeeId: uuid('employee_id').notNull(),
  leaveTypeId: uuid('leave_type_id').notNull(),
  year: integer('year').notNull(),
  allocatedDays: numeric('allocated_days', { precision: 5, scale: 1 }).notNull(),
  usedDays: numeric('used_days', { precision: 5, scale: 1 }).notNull().default('0'),
});

export const hrLeaveApplications = pgTable('hr_leave_applications', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  employeeId: uuid('employee_id').notNull(),
  leaveTypeId: uuid('leave_type_id').notNull(),
  fromDate: date('from_date').notNull(),
  toDate: date('to_date').notNull(),
  halfDay: boolean('half_day').notNull().default(false),
  totalDays: numeric('total_days', { precision: 5, scale: 1 }).notNull(),
  reason: text('reason'),
  status: varchar('status', { length: 16 }).notNull().default('open'),
  approverUserId: uuid('approver_user_id'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ orgStatusIdx: index('hr_lap_org_status_idx').on(t.orgId, t.status) }));
