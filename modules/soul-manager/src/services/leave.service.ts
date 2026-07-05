/**
 * SOUL-MANAGER — leave.service
 * Nghỉ phép chuẩn BLLĐ 2019: 12 ngày phép năm (Đ113) + 1 ngày/5 năm
 * thâm niên (Đ114). Guard số dư thực hiện PHÍA SQL (Hiến pháp #5):
 * UPDATE ... WHERE (entitled - used) >= :days — không đủ thì 0 row.
 */
import { and, eq, sql } from 'drizzle-orm';
import type { z } from 'zod';
import {
  hrEmployees, hrLeaveBalances, hrLeaveRequests, hrLeaveTypes,
} from '../db/schema.js';
import type {
  leaveRequestSchema, leaveDecideSchema, leaveBalanceSchema,
} from '../validation/schemas.js';
import { HrError, type HrCtx } from '../types.js';
import { M } from '../money.js';
import { getSettings } from './defaults.service.js';
import { getEmployeeByCode } from './employee.service.js';

type EmployeeRow = typeof hrEmployees.$inferSelect;

async function getLeaveType(ctx: HrCtx, code: string) {
  const [lt] = await ctx.db.select().from(hrLeaveTypes).where(and(
    eq(hrLeaveTypes.orgId, ctx.orgId), eq(hrLeaveTypes.code, code),
  )).limit(1);
  if (!lt) throw new HrError('LEAVE_TYPE_NOT_FOUND', `Không có loại phép ${code}`, { code });
  return lt;
}

/**
 * Đảm bảo dòng số dư phép năm cho (NV × loại phép có quota × năm).
 * entitled = quota + floor(số năm thâm niên / 5) × per_5y_bonus (chỉ PHEP-NAM).
 */
export async function ensureAnnualBalance(ctx: HrCtx, emp: EmployeeRow, year: number) {
  const types = await ctx.db.select().from(hrLeaveTypes).where(and(
    eq(hrLeaveTypes.orgId, ctx.orgId), eq(hrLeaveTypes.active, true),
  ));
  const { policy } = await getSettings(ctx);
  for (const lt of types) {
    if (lt.annualQuota === null) continue;
    let entitled = M.norm(lt.annualQuota);
    if (lt.code === 'PHEP-NAM') {
      const hireYear = Number.parseInt(emp.hireDate.slice(0, 4), 10);
      const seniority = Math.max(0, year - hireYear);
      const bonusSteps = Math.floor(seniority / 5);
      entitled = M.add(entitled, M.mulRate(policy.annual_leave.per_5y_bonus, String(bonusSteps)));
    }
    await ctx.db.insert(hrLeaveBalances).values({
      orgId: ctx.orgId, employeeId: emp.id, leaveTypeId: lt.id,
      year, entitled, used: '0',
    }).onConflictDoNothing();
  }
}

/** Tạo đơn xin nghỉ — fail fast nếu vượt số dư của loại phép có quota */
export async function requestLeave(ctx: HrCtx, input: z.infer<typeof leaveRequestSchema>) {
  const emp = await getEmployeeByCode(ctx, input.employee_code);
  if (emp.status === 'terminated') {
    throw new HrError('EMPLOYEE_NOT_ACTIVE', `Nhân viên ${emp.code} đã nghỉ việc`, { code: emp.code });
  }
  const lt = await getLeaveType(ctx, input.leave_type);

  if (input.start_date > input.end_date) {
    throw new HrError('INVALID_TIME_RANGE', 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc');
  }
  // v1: đơn nghỉ không vắt tháng — để bảng lương quy về đúng một kỳ
  if (input.start_date.slice(0, 7) !== input.end_date.slice(0, 7)) {
    throw new HrError('LEAVE_SPANS_MONTHS',
      'Đơn nghỉ vắt qua 2 tháng — hãy tách thành 2 đơn theo từng tháng',
      { start: input.start_date, end: input.end_date });
  }
  if (M.cmp(input.days, '0') <= 0) {
    throw new HrError('INVALID_INPUT', 'Số ngày nghỉ phải lớn hơn 0');
  }

  const year = Number.parseInt(input.start_date.slice(0, 4), 10);
  if (lt.annualQuota !== null) {
    await ensureAnnualBalance(ctx, emp, year);
    const [bal] = await ctx.db.select().from(hrLeaveBalances).where(and(
      eq(hrLeaveBalances.orgId, ctx.orgId),
      eq(hrLeaveBalances.employeeId, emp.id),
      eq(hrLeaveBalances.leaveTypeId, lt.id),
      eq(hrLeaveBalances.year, year),
    )).limit(1);
    const remaining = M.sub(bal!.entitled, bal!.used);
    if (M.cmp(input.days, remaining) > 0) {
      throw new HrError('LEAVE_INSUFFICIENT_BALANCE',
        `Chỉ còn ${remaining} ngày ${lt.name} — không đủ cho ${input.days} ngày`,
        { remaining, requested: input.days, leave_type: lt.code });
    }
  }

  const [req] = await ctx.db.insert(hrLeaveRequests).values({
    orgId: ctx.orgId, employeeId: emp.id, leaveTypeId: lt.id,
    startDate: input.start_date, endDate: input.end_date,
    days: input.days, reason: input.reason ?? null,
  }).returning();

  await ctx.bus.emit('hr.leave.requested', {
    org_id: ctx.orgId, request_id: req!.id, employee_code: emp.code,
    leave_type: lt.code, days: req!.days,
    start_date: req!.startDate, end_date: req!.endDate,
  });
  return {
    request_id: req!.id, employee_code: emp.code, leave_type: lt.code,
    days: req!.days, start_date: req!.startDate, end_date: req!.endDate,
    status: req!.status,
  };
}

/** Duyệt / từ chối đơn — approve trừ số dư bằng UPDATE có điều kiện (SQL guard) */
export async function decideLeave(ctx: HrCtx, input: z.infer<typeof leaveDecideSchema>) {
  const [req] = await ctx.db.select().from(hrLeaveRequests).where(and(
    eq(hrLeaveRequests.orgId, ctx.orgId), eq(hrLeaveRequests.id, input.request_id),
  )).limit(1);
  if (!req) throw new HrError('LEAVE_REQUEST_NOT_FOUND', 'Không tìm thấy đơn nghỉ', { id: input.request_id });
  if (req.status !== 'pending') {
    throw new HrError('LEAVE_NOT_PENDING', `Đơn đã ở trạng thái ${req.status}`, { status: req.status });
  }

  const [lt] = await ctx.db.select().from(hrLeaveTypes).where(and(
    eq(hrLeaveTypes.orgId, ctx.orgId), eq(hrLeaveTypes.id, req.leaveTypeId),
  )).limit(1);

  if (input.decision === 'approved' && lt!.annualQuota !== null) {
    const year = Number.parseInt(req.startDate.slice(0, 4), 10);
    // Guard phía SQL: chỉ trừ được khi còn đủ — fail closed, không race
    const updated = await ctx.db.update(hrLeaveBalances)
      .set({ used: sql`${hrLeaveBalances.used} + ${req.days}::numeric`, updatedAt: new Date() })
      .where(and(
        eq(hrLeaveBalances.orgId, ctx.orgId),
        eq(hrLeaveBalances.employeeId, req.employeeId),
        eq(hrLeaveBalances.leaveTypeId, req.leaveTypeId),
        eq(hrLeaveBalances.year, year),
        sql`(${hrLeaveBalances.entitled} - ${hrLeaveBalances.used}) >= ${req.days}::numeric`,
      )).returning({ id: hrLeaveBalances.id });
    if (updated.length === 0) {
      throw new HrError('LEAVE_INSUFFICIENT_BALANCE',
        'Số dư phép không đủ để duyệt đơn này', { request_id: req.id });
    }
  }

  const [decided] = await ctx.db.update(hrLeaveRequests).set({
    status: input.decision,
    approverId: ctx.userId ?? null,
    decidedAt: new Date(),
    decisionNote: input.note ?? null,
    updatedAt: new Date(),
  }).where(and(eq(hrLeaveRequests.orgId, ctx.orgId), eq(hrLeaveRequests.id, req.id)))
    .returning();

  const [emp] = await ctx.db.select({ code: hrEmployees.code }).from(hrEmployees)
    .where(and(eq(hrEmployees.orgId, ctx.orgId), eq(hrEmployees.id, req.employeeId))).limit(1);

  await ctx.bus.emit(input.decision === 'approved' ? 'hr.leave.approved' : 'hr.leave.rejected', {
    org_id: ctx.orgId, request_id: req.id, employee_code: emp!.code,
    leave_type: lt!.code, days: req.days, decided_by: ctx.userId ?? null,
  });
  return {
    request_id: decided!.id, status: decided!.status,
    employee_code: emp!.code, days: decided!.days, leave_type: lt!.code,
  };
}

/** Số dư phép + đơn đang chờ của một NV */
export async function leaveBalance(ctx: HrCtx, input: z.infer<typeof leaveBalanceSchema>) {
  const emp = await getEmployeeByCode(ctx, input.employee_code);
  const year = input.year ?? new Date().getFullYear();
  await ensureAnnualBalance(ctx, emp, year);

  const balances = await ctx.db.select({
    leave_type: hrLeaveTypes.code,
    name: hrLeaveTypes.name,
    entitled: hrLeaveBalances.entitled,
    used: hrLeaveBalances.used,
    remaining: sql<string>`(${hrLeaveBalances.entitled} - ${hrLeaveBalances.used})::text`,
  }).from(hrLeaveBalances)
    .innerJoin(hrLeaveTypes, eq(hrLeaveBalances.leaveTypeId, hrLeaveTypes.id))
    .where(and(
      eq(hrLeaveBalances.orgId, ctx.orgId),
      eq(hrLeaveBalances.employeeId, emp.id),
      eq(hrLeaveBalances.year, year),
    ));

  const pending = await ctx.db.select({
    request_id: hrLeaveRequests.id,
    leave_type: hrLeaveTypes.code,
    days: hrLeaveRequests.days,
    start_date: hrLeaveRequests.startDate,
    end_date: hrLeaveRequests.endDate,
  }).from(hrLeaveRequests)
    .innerJoin(hrLeaveTypes, eq(hrLeaveRequests.leaveTypeId, hrLeaveTypes.id))
    .where(and(
      eq(hrLeaveRequests.orgId, ctx.orgId),
      eq(hrLeaveRequests.employeeId, emp.id),
      eq(hrLeaveRequests.status, 'pending'),
    ));

  return { employee_code: emp.code, full_name: emp.fullName, year, balances, pending_requests: pending };
}
