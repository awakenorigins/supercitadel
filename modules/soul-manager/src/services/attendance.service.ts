/**
 * SOUL-MANAGER — attendance.service
 * Chấm công theo ngày: ca làm việc, check-in/out, muộn/sớm, OT 3 loại
 * (ngày thường/cuối tuần/lễ — Đ98 BLLĐ). Guard trùng ngày; bảng công
 * tổng hợp tính phía SQL (SUM ... FILTER), trả numeric string.
 */
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { hrAttendance, hrEmployees, hrShifts } from '../db/schema.js';
import type { attendanceRecordSchema, attendanceSummarySchema } from '../validation/schemas.js';
import { HrError, type HrCtx } from '../types.js';
import { ensureDefaultShift } from './defaults.service.js';
import { getEmployeeByCode } from './employee.service.js';

/** 'HH:MM' hoặc 'HH:MM:SS' → phút trong ngày (số nguyên — không phải tiền) */
function toMinutes(hm: string): number {
  const [h, m] = hm.split(':');
  return Number.parseInt(h!, 10) * 60 + Number.parseInt(m!, 10);
}

async function resolveShift(ctx: HrCtx, code?: string) {
  if (!code || code === 'HC') return ensureDefaultShift(ctx);
  const [shift] = await ctx.db.select().from(hrShifts).where(and(
    eq(hrShifts.orgId, ctx.orgId), eq(hrShifts.code, code),
  )).limit(1);
  if (!shift) throw new HrError('SHIFT_NOT_FOUND', `Không có ca làm việc ${code}`, { code });
  return shift;
}

const WORK_DAYS_BY_STATUS: Record<string, string> = {
  present: '1', half_day: '0.5', absent: '0', leave: '0', holiday: '0',
};

/** Chấm công một ngày cho một NV (insert-only trừ khi allow_update) */
export async function recordAttendance(ctx: HrCtx, input: z.infer<typeof attendanceRecordSchema>) {
  const emp = await getEmployeeByCode(ctx, input.employee_code);
  if (emp.status === 'terminated') {
    throw new HrError('EMPLOYEE_NOT_ACTIVE',
      `Nhân viên ${emp.code} đã nghỉ việc — không thể chấm công`, { code: emp.code });
  }
  const shift = await resolveShift(ctx, input.shift_code);

  if (input.check_in && input.check_out
      && toMinutes(input.check_out) <= toMinutes(input.check_in)) {
    throw new HrError('INVALID_TIME_RANGE', 'Giờ ra phải sau giờ vào',
      { check_in: input.check_in, check_out: input.check_out });
  }

  // Muộn/sớm so với ca (chỉ khi có giờ thật)
  const lateMinutes = input.check_in
    ? Math.max(0, toMinutes(input.check_in) - toMinutes(shift.startTime)) : 0;
  const earlyMinutes = input.check_out
    ? Math.max(0, toMinutes(shift.endTime) - toMinutes(input.check_out)) : 0;

  const values = {
    orgId: ctx.orgId,
    employeeId: emp.id,
    workDate: input.work_date,
    shiftId: shift.id,
    checkIn: input.check_in ? new Date(`${input.work_date}T${input.check_in}:00+07:00`) : null,
    checkOut: input.check_out ? new Date(`${input.work_date}T${input.check_out}:00+07:00`) : null,
    workDays: WORK_DAYS_BY_STATUS[input.status]!,
    otWeekdayHours: input.ot_weekday_hours,
    otWeekendHours: input.ot_weekend_hours,
    otHolidayHours: input.ot_holiday_hours,
    lateMinutes,
    earlyMinutes,
    status: input.status,
    note: input.note ?? null,
  };

  const [existing] = await ctx.db.select({ id: hrAttendance.id }).from(hrAttendance).where(and(
    eq(hrAttendance.orgId, ctx.orgId),
    eq(hrAttendance.employeeId, emp.id),
    eq(hrAttendance.workDate, input.work_date),
  )).limit(1);

  let row;
  if (existing) {
    if (!input.allow_update) {
      throw new HrError('ATTENDANCE_DUPLICATE',
        `${emp.code} đã có chấm công ngày ${input.work_date} — dùng allow_update để sửa`,
        { employee_code: emp.code, work_date: input.work_date });
    }
    [row] = await ctx.db.update(hrAttendance)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(hrAttendance.orgId, ctx.orgId), eq(hrAttendance.id, existing.id)))
      .returning();
  } else {
    [row] = await ctx.db.insert(hrAttendance).values(values).returning();
  }

  await ctx.bus.emit('hr.attendance.recorded', {
    org_id: ctx.orgId, employee_code: emp.code, work_date: input.work_date,
    status: row!.status, work_days: row!.workDays,
    late_minutes: row!.lateMinutes, updated: Boolean(existing),
  });
  return {
    employee_code: emp.code, work_date: row!.workDate, status: row!.status,
    work_days: row!.workDays, late_minutes: row!.lateMinutes,
    early_minutes: row!.earlyMinutes,
    ot_hours: {
      weekday: row!.otWeekdayHours, weekend: row!.otWeekendHours, holiday: row!.otHolidayHours,
    },
  };
}

/** [đầu tháng, đầu tháng sau) dạng YYYY-MM-DD */
export function monthRange(year: number, month: number): { start: string; next: string } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const ny = month === 12 ? year + 1 : year;
  const nm = month === 12 ? 1 : month + 1;
  return { start, next: `${ny}-${String(nm).padStart(2, '0')}-01` };
}

/** Bảng công tháng — tổng hợp phía SQL, group theo NV */
export async function attendanceSummary(ctx: HrCtx, input: z.infer<typeof attendanceSummarySchema>) {
  const { start, next } = monthRange(input.year, input.month);
  const conds = [
    eq(hrAttendance.orgId, ctx.orgId),
    gte(hrAttendance.workDate, start),
    lt(hrAttendance.workDate, next),
  ];
  if (input.employee_code) {
    const emp = await getEmployeeByCode(ctx, input.employee_code);
    conds.push(eq(hrAttendance.employeeId, emp.id));
  }
  const rows = await ctx.db.select({
    employee_code: hrEmployees.code,
    full_name: hrEmployees.fullName,
    worked_days: sql<string>`coalesce(sum(${hrAttendance.workDays}) filter (where ${hrAttendance.status} in ('present','half_day')), 0)::text`,
    leave_days: sql<string>`coalesce(count(*) filter (where ${hrAttendance.status} = 'leave'), 0)::text`,
    absent_days: sql<string>`coalesce(count(*) filter (where ${hrAttendance.status} = 'absent'), 0)::text`,
    ot_weekday: sql<string>`coalesce(sum(${hrAttendance.otWeekdayHours}), 0)::text`,
    ot_weekend: sql<string>`coalesce(sum(${hrAttendance.otWeekendHours}), 0)::text`,
    ot_holiday: sql<string>`coalesce(sum(${hrAttendance.otHolidayHours}), 0)::text`,
    late_minutes: sql<string>`coalesce(sum(${hrAttendance.lateMinutes}), 0)::text`,
    early_minutes: sql<string>`coalesce(sum(${hrAttendance.earlyMinutes}), 0)::text`,
  }).from(hrAttendance)
    .innerJoin(hrEmployees, eq(hrAttendance.employeeId, hrEmployees.id))
    .where(and(...conds))
    .groupBy(hrEmployees.code, hrEmployees.fullName)
    .orderBy(hrEmployees.code);

  return { year: input.year, month: input.month, count: rows.length, summary: rows };
}
