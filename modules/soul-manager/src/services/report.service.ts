/**
 * SOUL-MANAGER — report.service
 * Báo cáo nhân sự: headcount theo trạng thái/phòng ban, biến động
 * tuyển mới & nghỉ việc trong khoảng thời gian.
 */
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { hrDepartments, hrEmployees } from '../db/schema.js';
import type { headcountReportSchema } from '../validation/schemas.js';
import type { HrCtx } from '../types.js';

export async function headcountReport(ctx: HrCtx, input: z.infer<typeof headcountReportSchema>) {
  const year = new Date().getFullYear();
  const from = input.from ?? `${year}-01-01`;
  const to = input.to ?? `${year}-12-31`;

  const byStatus = await ctx.db.select({
    status: hrEmployees.status,
    count: sql<number>`count(*)::int`,
  }).from(hrEmployees)
    .where(eq(hrEmployees.orgId, ctx.orgId))
    .groupBy(hrEmployees.status);

  const byDept = await ctx.db.select({
    department: sql<string>`coalesce(${hrDepartments.name}, 'Chưa phân bổ')`,
    count: sql<number>`count(*)::int`,
  }).from(hrEmployees)
    .leftJoin(hrDepartments, eq(hrEmployees.departmentId, hrDepartments.id))
    .where(and(eq(hrEmployees.orgId, ctx.orgId), sql`${hrEmployees.status} <> 'terminated'`))
    .groupBy(sql`coalesce(${hrDepartments.name}, 'Chưa phân bổ')`);

  const [flows] = await ctx.db.select({
    hired: sql<number>`count(*) filter (where ${hrEmployees.hireDate} >= ${from} and ${hrEmployees.hireDate} <= ${to})::int`,
    terminated: sql<number>`count(*) filter (where ${hrEmployees.terminatedAt} >= ${from} and ${hrEmployees.terminatedAt} <= ${to})::int`,
  }).from(hrEmployees).where(eq(hrEmployees.orgId, ctx.orgId));

  const active = byStatus
    .filter((s) => s.status !== 'terminated')
    .reduce((a, s) => a + s.count, 0);

  return {
    range: { from, to },
    active_headcount: active,
    by_status: byStatus,
    by_department: byDept,
    hired_in_range: flows!.hired,
    terminated_in_range: flows!.terminated,
  };
}
