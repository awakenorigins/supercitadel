/**
 * QLDN V1A — Service thuần (F1 skeleton: periods + policy params + employees cơ bản).
 * Contract: (db, orgId, params) => rows. Không đọc Hono request ở đây.
 * F2 sẽ mở rộng employees/salary profiles + import Excel.
 */
import { and, desc, eq, lte } from 'drizzle-orm';
import { AppError } from '@citadel/core';
import { periods, policyParams, employees, salaryProfiles } from './schema.js';

const invalid = (msg: string) => new AppError('VALIDATION' as any, msg, 400);

// ---------- PERIODS ----------
export async function listPeriods(db: any, orgId: string) {
  return db.select().from(periods).where(eq(periods.orgId, orgId)).orderBy(desc(periods.code));
}

export async function createPeriod(db: any, orgId: string, b: any) {
  const code = String(b?.code ?? '').trim();
  if (!/^\d{4}-\d{2}$/.test(code)) throw invalid('code kỳ phải dạng YYYY-MM, ví dụ 2026-06');
  const name = String(b?.name ?? '').trim() || `Tháng ${code.slice(5)}/${code.slice(0, 4)}`;
  const standardDays = String(b?.standardDays ?? '26');
  const [row] = await db.insert(periods)
    .values({ orgId, code, name, standardDays })
    .onConflictDoNothing()
    .returning();
  if (!row) throw invalid(`Kỳ ${code} đã tồn tại`);
  return row;
}

export async function closePeriod(db: any, orgId: string, id: string) {
  const [row] = await db.update(periods)
    .set({ status: 'closed' })
    .where(and(eq(periods.orgId, orgId), eq(periods.id, id)))
    .returning();
  if (!row) throw invalid('Không tìm thấy kỳ');
  return row;
}

// ---------- POLICY PARAMS ----------
/** Biểu thuế TNCN lũy tiến 7 bậc (tháng) — mặc định theo luật hiện hành, version hóa qua DB. */
export const DEFAULT_PIT_BRACKETS = [
  { upTo: 5_000_000, rateBp: 500 },
  { upTo: 10_000_000, rateBp: 1000 },
  { upTo: 18_000_000, rateBp: 1500 },
  { upTo: 32_000_000, rateBp: 2000 },
  { upTo: 52_000_000, rateBp: 2500 },
  { upTo: 80_000_000, rateBp: 3000 },
  { upTo: null, rateBp: 3500 },
];

export async function listPolicyParams(db: any, orgId: string) {
  return db.select().from(policyParams).where(eq(policyParams.orgId, orgId)).orderBy(desc(policyParams.effectiveFrom));
}

export async function createPolicyParams(db: any, orgId: string, b: any) {
  const effectiveFrom = String(b?.effectiveFrom ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) throw invalid('effectiveFrom phải dạng YYYY-MM-DD');
  const [row] = await db.insert(policyParams).values({
    orgId,
    effectiveFrom,
    insCompanyBp: b?.insCompanyBp ?? 2150,
    kpcdBp: b?.kpcdBp ?? 200,
    insEmployeeBp: b?.insEmployeeBp ?? 1050,
    unionFeeBp: b?.unionFeeBp ?? 50,
    deductionPersonal: String(b?.deductionPersonal ?? '15500000'),
    deductionDependent: String(b?.deductionDependent ?? '6200000'),
    uniformCapYear: String(b?.uniformCapYear ?? '5000000'),
    insuranceMinDays: String(b?.insuranceMinDays ?? '14'),
    hdtvFactorBp: b?.hdtvFactorBp ?? 8500,
    ctvPitBp: b?.ctvPitBp ?? 1000,
    otRates: b?.otRates ?? { ot150: 1.5, ot170: 1.7, ot200: 2.0 },
    pitBrackets: b?.pitBrackets ?? DEFAULT_PIT_BRACKETS,
    note: b?.note ?? null,
  }).returning();
  return row;
}

/** Lấy bản policy hiệu lực cho một ngày (mới nhất có effective_from <= date). */
export async function effectivePolicyParams(db: any, orgId: string, date: string) {
  const rows = await db.select().from(policyParams)
    .where(and(eq(policyParams.orgId, orgId), lte(policyParams.effectiveFrom, date)))
    .orderBy(desc(policyParams.effectiveFrom))
    .limit(1);
  return rows[0] ?? null;
}

// ---------- EMPLOYEES (F1 cơ bản — F2 mở rộng đầy đủ) ----------
export async function listEmployees(db: any, orgId: string, status?: string) {
  const cond = status
    ? and(eq(employees.orgId, orgId), eq(employees.status, status as any))
    : eq(employees.orgId, orgId);
  return db.select().from(employees).where(cond).orderBy(employees.codeOfficial);
}

export async function createEmployee(db: any, orgId: string, b: any) {
  const fullName = String(b?.fullName ?? '').trim();
  if (!fullName) throw invalid('fullName bắt buộc');
  const contractType = ['HDLD', 'HDTV', 'CTV'].includes(b?.contractType) ? b.contractType : 'HDLD';
  const [row] = await db.insert(employees).values({
    orgId,
    fullName,
    contractType,
    codeOfficial: b?.codeOfficial ?? null,
    codeInternal: b?.codeInternal ?? null,
    position: b?.position ?? null,
    department: b?.department ?? null,
    unit: b?.unit ?? null,
    dependentsCount: Number.isInteger(b?.dependentsCount) ? b.dependentsCount : 0,
    bhxhEnrolled: !!b?.bhxhEnrolled,
    bankAccount: b?.bankAccount ?? null,
    bankName: b?.bankName ?? null,
    taxCode: b?.taxCode ?? null,
    idNumber: b?.idNumber ?? null,
    joinedDate: b?.joinedDate ?? null,
    note: b?.note ?? null,
  }).returning();
  return row;
}

// ---------- SALARY PROFILES ----------
export async function listSalaryProfiles(db: any, orgId: string, employeeId: string) {
  return db.select().from(salaryProfiles)
    .where(and(eq(salaryProfiles.orgId, orgId), eq(salaryProfiles.employeeId, employeeId)))
    .orderBy(desc(salaryProfiles.effectiveFrom));
}

export async function createSalaryProfile(db: any, orgId: string, b: any) {
  const employeeId = String(b?.employeeId ?? '').trim();
  const effectiveFrom = String(b?.effectiveFrom ?? '').trim();
  if (!employeeId) throw invalid('employeeId bắt buộc');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) throw invalid('effectiveFrom phải dạng YYYY-MM-DD');
  const emp = await db.select().from(employees)
    .where(and(eq(employees.orgId, orgId), eq(employees.id, employeeId))).limit(1);
  if (!emp.length) throw invalid('Không tìm thấy nhân viên');
  const moneyOf = (k: string) => String(b?.[k] ?? '0');
  const [row] = await db.insert(salaryProfiles).values({
    orgId, employeeId, effectiveFrom,
    bhxhSalary: moneyOf('bhxhSalary'),
    baseSalary: moneyOf('baseSalary'),
    baseSalaryInternal: moneyOf('baseSalaryInternal'),
    allowResponsibility: moneyOf('allowResponsibility'),
    allowMeal: moneyOf('allowMeal'),
    allowFuel: moneyOf('allowFuel'),
    allowPhone: moneyOf('allowPhone'),
    allowUniform: moneyOf('allowUniform'),
    allowCreative: moneyOf('allowCreative'),
    allowSkill: moneyOf('allowSkill'),
    allowPosition: moneyOf('allowPosition'),
    allowOther: moneyOf('allowOther'),
    note: b?.note ?? null,
  }).returning();
  return row;
}

/** Hồ sơ lương hiệu lực cho 1 NV tại 1 ngày (mới nhất có effective_from <= date). */
export async function effectiveSalaryProfile(db: any, orgId: string, employeeId: string, date: string) {
  const rows = await db.select().from(salaryProfiles)
    .where(and(
      eq(salaryProfiles.orgId, orgId),
      eq(salaryProfiles.employeeId, employeeId),
      lte(salaryProfiles.effectiveFrom, date),
    ))
    .orderBy(desc(salaryProfiles.effectiveFrom))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateEmployee(db: any, orgId: string, id: string, b: any) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ['fullName','codeOfficial','codeInternal','position','department','unit','bankAccount','bankName','taxCode','idNumber','joinedDate','note'] as const) {
    if (b?.[k] !== undefined) patch[k] = b[k];
  }
  if (b?.contractType !== undefined) {
    if (!['HDLD','HDTV','CTV'].includes(b.contractType)) throw invalid('contractType phải là HDLD|HDTV|CTV');
    patch.contractType = b.contractType;
  }
  if (b?.status !== undefined) {
    if (!['active','inactive','terminated'].includes(b.status)) throw invalid('status phải là active|inactive|terminated');
    patch.status = b.status;
  }
  if (b?.dependentsCount !== undefined) {
    if (!Number.isInteger(b.dependentsCount) || b.dependentsCount < 0) throw invalid('dependentsCount phải là số nguyên >= 0');
    patch.dependentsCount = b.dependentsCount;
  }
  if (b?.bhxhEnrolled !== undefined) patch.bhxhEnrolled = !!b.bhxhEnrolled;
  const [row] = await db.update(employees)
    .set(patch)
    .where(and(eq(employees.orgId, orgId), eq(employees.id, id)))
    .returning();
  if (!row) throw invalid('Không tìm thấy nhân viên');
  return row;
}
