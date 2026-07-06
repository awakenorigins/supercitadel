/**
 * SOUL-MANAGER — org.service
 * Cơ cấu tổ chức: phòng ban phân cấp, chức danh, sơ đồ + headcount.
 * Get-or-create theo tên/mã để Tiểu Tâm thao tác tự nhiên bằng tiếng Việt.
 */
import { and, eq, ilike, ne, or, sql } from 'drizzle-orm';
import { hrDepartments, hrEmployees, hrPositions } from '../db/schema.js';
import type { HrCtx } from '../types.js';

/** Sinh mã từ tên tiếng Việt: "Kỹ thuật" → "KY-THUAT" */
export function toCode(name: string): string {
  const ascii = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D');
  const code = ascii.toUpperCase().trim()
    .replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  return code || 'N-A';
}

/** Tìm phòng ban theo mã hoặc tên; chưa có thì tạo (get-or-create) */
export async function ensureDepartment(ctx: HrCtx, nameOrCode: string) {
  const [found] = await ctx.db.select().from(hrDepartments).where(and(
    eq(hrDepartments.orgId, ctx.orgId),
    or(eq(hrDepartments.code, toCode(nameOrCode)), ilike(hrDepartments.name, nameOrCode)),
  )).limit(1);
  if (found) return found;
  const [created] = await ctx.db.insert(hrDepartments)
    .values({ orgId: ctx.orgId, code: toCode(nameOrCode), name: nameOrCode.trim() })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [again] = await ctx.db.select().from(hrDepartments).where(and(
    eq(hrDepartments.orgId, ctx.orgId), eq(hrDepartments.code, toCode(nameOrCode)),
  )).limit(1);
  return again!;
}

/** Tìm chức danh theo mã hoặc tên; chưa có thì tạo */
export async function ensurePosition(ctx: HrCtx, titleOrCode: string) {
  const [found] = await ctx.db.select().from(hrPositions).where(and(
    eq(hrPositions.orgId, ctx.orgId),
    or(eq(hrPositions.code, toCode(titleOrCode)), ilike(hrPositions.title, titleOrCode)),
  )).limit(1);
  if (found) return found;
  const [created] = await ctx.db.insert(hrPositions)
    .values({ orgId: ctx.orgId, code: toCode(titleOrCode), title: titleOrCode.trim() })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [again] = await ctx.db.select().from(hrPositions).where(and(
    eq(hrPositions.orgId, ctx.orgId), eq(hrPositions.code, toCode(titleOrCode)),
  )).limit(1);
  return again!;
}

export interface OrgChartNode {
  id: string; code: string; name: string;
  headcount: number;
  employees?: Array<{ code: string; full_name: string; position: string | null }>;
  children: OrgChartNode[];
}

/** Sơ đồ tổ chức: cây phòng ban + headcount (không tính NV đã nghỉ) */
export async function orgChart(ctx: HrCtx, input: { include_employees: boolean }) {
  const depts = await ctx.db.select().from(hrDepartments)
    .where(and(eq(hrDepartments.orgId, ctx.orgId), eq(hrDepartments.active, true)));

  const counts = await ctx.db.select({
    departmentId: hrEmployees.departmentId,
    headcount: sql<number>`count(*)::int`,
  }).from(hrEmployees)
    .where(and(eq(hrEmployees.orgId, ctx.orgId), ne(hrEmployees.status, 'terminated')))
    .groupBy(hrEmployees.departmentId);
  const countMap = new Map(counts.map((c) => [c.departmentId ?? 'none', c.headcount]));

  let empMap = new Map<string, Array<{ code: string; full_name: string; position: string | null }>>();
  if (input.include_employees) {
    const emps = await ctx.db.select({
      code: hrEmployees.code, fullName: hrEmployees.fullName,
      departmentId: hrEmployees.departmentId, position: hrPositions.title,
    }).from(hrEmployees)
      .leftJoin(hrPositions, eq(hrEmployees.positionId, hrPositions.id))
      .where(and(eq(hrEmployees.orgId, ctx.orgId), ne(hrEmployees.status, 'terminated')));
    empMap = emps.reduce((m, e) => {
      const key = e.departmentId ?? 'none';
      const list = m.get(key) ?? [];
      list.push({ code: e.code, full_name: e.fullName, position: e.position });
      m.set(key, list);
      return m;
    }, empMap);
  }

  const nodeOf = (d: typeof depts[number]): OrgChartNode => ({
    id: d.id, code: d.code, name: d.name,
    headcount: countMap.get(d.id) ?? 0,
    ...(input.include_employees ? { employees: empMap.get(d.id) ?? [] } : {}),
    children: depts.filter((c) => c.parentId === d.id).map(nodeOf),
  });

  const roots = depts.filter((d) => !d.parentId).map(nodeOf);
  const unassigned = countMap.get('none') ?? 0;
  const total = [...countMap.values()].reduce((a, b) => a + b, 0);
  return { total_headcount: total, unassigned, departments: roots };
}
