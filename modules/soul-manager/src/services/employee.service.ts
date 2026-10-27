/**
 * SOUL-MANAGER — employee.service
 * Hồ sơ nhân viên: tạo (mã tự sinh NVxxxx), cập nhật/điều chuyển/nghỉ việc,
 * tìm kiếm, chi tiết 360°, người phụ thuộc (giảm trừ gia cảnh).
 */
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import {
  hrAllowances, hrDependents, hrDepartments, hrEmployees,
  hrLeaveBalances, hrLeaveTypes, hrPositions,
} from '../db/schema.js';
import type {
  employeeCreateSchema, employeeUpdateSchema,
  employeeSearchSchema, employeeGetSchema, dependentRegisterSchema,
} from '../validation/schemas.js';
import { HrError, type HrCtx } from '../types.js';
import { ensureDepartment, ensurePosition } from './org.service.js';
import { ensureLeaveTypes, ensureDefaultShift, getSettings } from './defaults.service.js';
import { ensureAnnualBalance } from './leave.service.js';

/** Tìm NV theo mã — ném EMPLOYEE_NOT_FOUND nếu không có */
export async function getEmployeeByCode(ctx: HrCtx, code: string) {
  const [emp] = await ctx.db.select().from(hrEmployees).where(and(
    eq(hrEmployees.orgId, ctx.orgId), eq(hrEmployees.code, code),
  )).limit(1);
  if (!emp) throw new HrError('EMPLOYEE_NOT_FOUND', `Không tìm thấy nhân viên mã ${code}`, { code });
  return emp;
}

/** Mã NV kế tiếp dạng NV0001 (đếm theo org, an toàn trong transaction) */
async function nextEmployeeCode(ctx: HrCtx): Promise<string> {
  const [last] = await ctx.db.select({ code: hrEmployees.code }).from(hrEmployees)
    .where(and(eq(hrEmployees.orgId, ctx.orgId), sql`${hrEmployees.code} ~ '^NV[0-9]+$'`))
    .orderBy(desc(hrEmployees.code)).limit(1);
  const n = last ? Number.parseInt(last.code.slice(2), 10) + 1 : 1;
  return 'NV' + String(n).padStart(4, '0');
}

export async function createEmployee(ctx: HrCtx, input: z.infer<typeof employeeCreateSchema>) {
  // Seed mặc định của org (idempotent) — loại phép, ca HC, settings
  await Promise.all([ensureLeaveTypes(ctx), ensureDefaultShift(ctx), getSettings(ctx)]);

  const code = input.code ?? await nextEmployeeCode(ctx);
  const [dup] = await ctx.db.select({ id: hrEmployees.id }).from(hrEmployees).where(and(
    eq(hrEmployees.orgId, ctx.orgId), eq(hrEmployees.code, code),
  )).limit(1);
  if (dup) throw new HrError('EMPLOYEE_CODE_TAKEN', `Mã nhân viên ${code} đã tồn tại`, { code });

  const dept = input.department ? await ensureDepartment(ctx, input.department) : null;
  const pos = input.position ? await ensurePosition(ctx, input.position) : null;
  const manager = input.manager_code ? await getEmployeeByCode(ctx, input.manager_code) : null;

  const [emp] = await ctx.db.insert(hrEmployees).values({
    orgId: ctx.orgId,
    code,
    fullName: input.full_name,
    dob: input.dob ?? null,
    gender: input.gender ?? null,
    nationalId: input.national_id ?? null,
    taxCode: input.tax_code ?? null,
    siNumber: input.si_number ?? null,
    address: input.address ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    departmentId: dept?.id ?? null,
    positionId: pos?.id ?? null,
    managerId: manager?.id ?? null,
    hireDate: input.hire_date,
    probationEnd: input.probation_end ?? null,
    status: input.status,
    contractType: input.contract_type,
    baseSalary: input.base_salary,
    insuranceSalary: input.insurance_salary ?? null,
    workRegion: input.work_region ?? null,
    emergencyContactName: input.emergency_contact_name ?? null,
    emergencyContactPhone: input.emergency_contact_phone ?? null,
  }).returning();

  // Mở số dư phép năm cho năm hiện tại (12 ngày + thâm niên)
  const year = Number.parseInt(input.hire_date.slice(0, 4), 10);
  const thisYear = new Date().getFullYear();
  await ensureAnnualBalance(ctx, emp!, Math.max(year, thisYear));

  await ctx.bus.emit('hr.employee.created', {
    org_id: ctx.orgId, employee_id: emp!.id, code: emp!.code,
    full_name: emp!.fullName, department: dept?.name ?? null, by: ctx.userId ?? null,
  });
  return {
    id: emp!.id, code: emp!.code, full_name: emp!.fullName,
    department: dept?.name ?? null, position: pos?.title ?? null,
    status: emp!.status, base_salary: emp!.baseSalary, hire_date: emp!.hireDate,
  };
}

export async function updateEmployee(ctx: HrCtx, input: z.infer<typeof employeeUpdateSchema>) {
  const emp = await getEmployeeByCode(ctx, input.code);

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.full_name) patch.fullName = input.full_name;
  if (input.department) patch.departmentId = (await ensureDepartment(ctx, input.department)).id;
  if (input.position) patch.positionId = (await ensurePosition(ctx, input.position)).id;
  if (input.manager_code) patch.managerId = (await getEmployeeByCode(ctx, input.manager_code)).id;
  if (input.contract_type) patch.contractType = input.contract_type;
  if (input.base_salary !== undefined) patch.baseSalary = input.base_salary;
  if (input.insurance_salary !== undefined) patch.insuranceSalary = input.insurance_salary;
  if (input.work_region !== undefined) patch.workRegion = input.work_region;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.email !== undefined) patch.email = input.email;
  if (input.address !== undefined) patch.address = input.address;

  let terminated = false;
  if (input.status) {
    patch.status = input.status;
    if (input.status === 'terminated') {
      terminated = true;
      patch.terminatedAt = input.terminated_at ?? new Date().toISOString().slice(0, 10);
    }
  }

  const [updated] = await ctx.db.update(hrEmployees).set(patch)
    .where(and(eq(hrEmployees.orgId, ctx.orgId), eq(hrEmployees.id, emp.id)))
    .returning();

  await ctx.bus.emit(terminated ? 'hr.employee.terminated' : 'hr.employee.updated', {
    org_id: ctx.orgId, employee_id: emp.id, code: emp.code,
    changes: Object.keys(patch).filter((k) => k !== 'updatedAt'),
    note: input.note ?? null, by: ctx.userId ?? null,
  });
  return {
    code: updated!.code, full_name: updated!.fullName, status: updated!.status,
    base_salary: updated!.baseSalary, terminated_at: updated!.terminatedAt,
  };
}

export async function searchEmployees(ctx: HrCtx, input: z.infer<typeof employeeSearchSchema>) {
  const conds = [eq(hrEmployees.orgId, ctx.orgId)];
  if (input.q) {
    conds.push(or(
      ilike(hrEmployees.fullName, `%${input.q}%`),
      ilike(hrEmployees.code, `%${input.q}%`),
    )!);
  }
  if (input.status) conds.push(eq(hrEmployees.status, input.status));
  if (input.department) {
    const dept = await ensureDepartment(ctx, input.department);
    conds.push(eq(hrEmployees.departmentId, dept.id));
  }
  const rows = await ctx.db.select({
    code: hrEmployees.code,
    full_name: hrEmployees.fullName,
    status: hrEmployees.status,
    hire_date: hrEmployees.hireDate,
    base_salary: hrEmployees.baseSalary,
    department: hrDepartments.name,
    position: hrPositions.title,
  }).from(hrEmployees)
    .leftJoin(hrDepartments, eq(hrEmployees.departmentId, hrDepartments.id))
    .leftJoin(hrPositions, eq(hrEmployees.positionId, hrPositions.id))
    .where(and(...conds))
    .orderBy(hrEmployees.code)
    .limit(input.limit);
  return { count: rows.length, employees: rows };
}

/** Hồ sơ 360°: thông tin + phụ cấp + người phụ thuộc + phép năm hiện tại */
export async function getEmployee(ctx: HrCtx, input: z.infer<typeof employeeGetSchema>) {
  const emp = await getEmployeeByCode(ctx, input.code);
  const [dept] = emp.departmentId
    ? await ctx.db.select().from(hrDepartments).where(and(
        eq(hrDepartments.orgId, ctx.orgId), eq(hrDepartments.id, emp.departmentId))).limit(1)
    : [null];
  const [pos] = emp.positionId
    ? await ctx.db.select().from(hrPositions).where(and(
        eq(hrPositions.orgId, ctx.orgId), eq(hrPositions.id, emp.positionId))).limit(1)
    : [null];
  const allowances = await ctx.db.select({
    name: hrAllowances.name, amount: hrAllowances.amount, taxable: hrAllowances.taxable,
  }).from(hrAllowances).where(and(
    eq(hrAllowances.orgId, ctx.orgId), eq(hrAllowances.employeeId, emp.id),
    eq(hrAllowances.active, true),
  ));
  const dependents = await ctx.db.select({
    full_name: hrDependents.fullName, relationship: hrDependents.relationship,
    active: hrDependents.active,
  }).from(hrDependents).where(and(
    eq(hrDependents.orgId, ctx.orgId), eq(hrDependents.employeeId, emp.id),
  ));
  const year = new Date().getFullYear();
  const balances = await ctx.db.select({
    type: hrLeaveTypes.name, entitled: hrLeaveBalances.entitled, used: hrLeaveBalances.used,
    remaining: sql<string>`(${hrLeaveBalances.entitled} - ${hrLeaveBalances.used})::text`,
  }).from(hrLeaveBalances)
    .innerJoin(hrLeaveTypes, eq(hrLeaveBalances.leaveTypeId, hrLeaveTypes.id))
    .where(and(
      eq(hrLeaveBalances.orgId, ctx.orgId),
      eq(hrLeaveBalances.employeeId, emp.id),
      eq(hrLeaveBalances.year, year),
    ));
  return {
    code: emp.code, full_name: emp.fullName, dob: emp.dob, gender: emp.gender,
    national_id: emp.nationalId, tax_code: emp.taxCode, si_number: emp.siNumber,
    phone: emp.phone, email: emp.email, address: emp.address,
    department: dept?.name ?? null, position: pos?.title ?? null,
    hire_date: emp.hireDate, status: emp.status, contract_type: emp.contractType,
    base_salary: emp.baseSalary, insurance_salary: emp.insuranceSalary,
    work_region: emp.workRegion,
    emergency_contact: emp.emergencyContactName
      ? { name: emp.emergencyContactName, phone: emp.emergencyContactPhone } : null,
    allowances, dependents, leave_balances_this_year: balances,
  };
}

/** Đăng ký / cập nhật người phụ thuộc giảm trừ gia cảnh */
export async function registerDependent(ctx: HrCtx, input: z.infer<typeof dependentRegisterSchema>) {
  const emp = await getEmployeeByCode(ctx, input.employee_code);
  const [existing] = await ctx.db.select().from(hrDependents).where(and(
    eq(hrDependents.orgId, ctx.orgId),
    eq(hrDependents.employeeId, emp.id),
    ilike(hrDependents.fullName, input.full_name),
  )).limit(1);

  let dep;
  if (existing) {
    [dep] = await ctx.db.update(hrDependents).set({
      relationship: input.relationship,
      dob: input.dob ?? existing.dob,
      taxCode: input.tax_code ?? existing.taxCode,
      active: input.active,
      updatedAt: new Date(),
    }).where(and(eq(hrDependents.orgId, ctx.orgId), eq(hrDependents.id, existing.id)))
      .returning();
  } else {
    [dep] = await ctx.db.insert(hrDependents).values({
      orgId: ctx.orgId, employeeId: emp.id,
      fullName: input.full_name, relationship: input.relationship,
      dob: input.dob ?? null, taxCode: input.tax_code ?? null, active: input.active,
    }).returning();
  }

  const [{ cnt }] = await ctx.db.select({ cnt: sql<number>`count(*)::int` })
    .from(hrDependents).where(and(
      eq(hrDependents.orgId, ctx.orgId), eq(hrDependents.employeeId, emp.id),
      eq(hrDependents.active, true),
    ));

  await ctx.bus.emit('hr.dependent.registered', {
    org_id: ctx.orgId, employee_id: emp.id, employee_code: emp.code,
    dependent: dep!.fullName, active: dep!.active, active_dependents: cnt,
  });
  return {
    employee_code: emp.code, dependent: dep!.fullName,
    relationship: dep!.relationship, active: dep!.active, active_dependents: cnt,
  };
}
