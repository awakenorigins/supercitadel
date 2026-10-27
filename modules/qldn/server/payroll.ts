/**
 * QLDN V1A — F4: Payroll run orchestration (scheme OFFICIAL).
 * Nối engine thuần (engine.ts) với DB: salary_profiles hiệu lực + timesheets kỳ
 * + policy_params hiệu lực → payroll_lines, snapshot input vào detail (audit).
 * Trạng thái: draft → calculated → approved (F7 outbox) → paid.
 */
import { and, eq } from 'drizzle-orm';
import { AppError } from '@citadel/core';
import {
  employees, periods, timesheets, salaryProfiles, policyParams,
  payrollRuns, payrollLines,
} from './schema.js';
import { effectivePolicyParams, effectiveSalaryProfile } from './service.js';
import { calcOfficialLine, type PayrollPolicy, type OfficialInput } from './engine.js';

const invalid = (msg: string) => new AppError('VALIDATION' as any, msg, 400);
const N = (v: unknown): number => Number(v ?? 0);

/** Chuyển bản ghi policy_params (DB) → PayrollPolicy (engine). */
export function policyFromRow(row: any, standardDays: number): PayrollPolicy {
  return {
    standardDays,
    insCompanyBp: row.insCompanyBp, kpcdBp: row.kpcdBp,
    insEmployeeBp: row.insEmployeeBp, unionFeeBp: row.unionFeeBp,
    deductionPersonal: N(row.deductionPersonal), deductionDependent: N(row.deductionDependent),
    insuranceMinDays: N(row.insuranceMinDays),
    hdtvFactorBp: row.hdtvFactorBp, ctvPitBp: row.ctvPitBp,
    otRates: row.otRates ?? { ot150: 1.5, ot170: 1.7, ot200: 2.0 },
    pitBrackets: row.pitBrackets,
    applyUnionFee: !!row.applyUnionFee,
    uniformCapYear: N(row.uniformCapYear),
    mealExemptCapMonthly: row.mealExemptCapMonthly === null || row.mealExemptCapMonthly === undefined
      ? null : N(row.mealExemptCapMonthly),
  };
}

export async function createPayrollRun(db: any, orgId: string, b: any) {
  const periodCode = String(b?.period ?? '').trim();
  const scheme = String(b?.scheme ?? 'OFFICIAL');
  if (!/^\d{4}-\d{2}$/.test(periodCode)) throw invalid('period phải dạng YYYY-MM');
  if (!['OFFICIAL', 'INTERNAL'].includes(scheme)) throw invalid('scheme phải là OFFICIAL|INTERNAL');
  const period = await db.select().from(periods)
    .where(and(eq(periods.orgId, orgId), eq(periods.code, periodCode))).limit(1);
  if (!period.length) throw invalid(`Chưa có kỳ ${periodCode}`);
  if (period[0].status === 'closed') throw invalid(`Kỳ ${periodCode} đã khóa`);
  const [row] = await db.insert(payrollRuns).values({
    orgId, periodId: period[0].id, scheme,
    standardDays: String(b?.standardDays ?? period[0].standardDays ?? '26'),
    note: b?.note ?? null,
  }).onConflictDoNothing().returning();
  if (!row) throw invalid(`Đã có bảng lương ${scheme} kỳ ${periodCode} — xóa hoặc tính lại run cũ`);
  return { ...row, periodCode };
}

export async function getRun(db: any, orgId: string, runId: string) {
  const rows = await db.select().from(payrollRuns)
    .where(and(eq(payrollRuns.orgId, orgId), eq(payrollRuns.id, runId))).limit(1);
  if (!rows.length) throw invalid('Không tìm thấy bảng lương');
  return rows[0];
}

export interface CalcRunResult {
  runId: string; scheme: string; lines: number; skipped: string[];
  totals: { gross: number; insuranceEmployee: number; pit: number; netPay: number };
}

/**
 * Tính bảng lương OFFICIAL cho cả kỳ:
 * mỗi NV có timesheet trong kỳ → ghép salary profile + policy hiệu lực → engine → payroll_line.
 * NV không có salary profile → skip + báo. Tính lại = xóa lines cũ ghi mới (run chưa approve).
 */
export async function calculateRun(db: any, orgId: string, runId: string): Promise<CalcRunResult> {
  const run = await getRun(db, orgId, runId);
  if (run.status === 'approved' || run.status === 'paid') throw invalid('Bảng lương đã duyệt — không tính lại được');
  if (run.scheme !== 'OFFICIAL') throw invalid('F4 mới hỗ trợ scheme OFFICIAL (INTERNAL = beat F5)');

  const period = (await db.select().from(periods)
    .where(and(eq(periods.orgId, orgId), eq(periods.id, run.periodId))).limit(1))[0];
  const periodEnd = `${period.code}-28`; // ngày tham chiếu hiệu lực trong kỳ
  const policyRow = await effectivePolicyParams(db, orgId, periodEnd);
  if (!policyRow) throw invalid('Chưa có policy_params hiệu lực cho kỳ này — tạo trước khi tính lương');
  const policy = policyFromRow(policyRow, N(run.standardDays));

  const tsRows = await db.select().from(timesheets)
    .where(and(eq(timesheets.orgId, orgId), eq(timesheets.periodId, run.periodId)));
  if (!tsRows.length) throw invalid(`Kỳ ${period.code} chưa có chấm công — import BCC trước`);

  return db.transaction(async (tx: any) => {
    await tx.delete(payrollLines).where(and(eq(payrollLines.orgId, orgId), eq(payrollLines.runId, runId)));
    const result: CalcRunResult = {
      runId, scheme: run.scheme, lines: 0, skipped: [],
      totals: { gross: 0, insuranceEmployee: 0, pit: 0, netPay: 0 },
    };
    for (const ts of tsRows) {
      const emp = (await tx.select().from(employees)
        .where(and(eq(employees.orgId, orgId), eq(employees.id, ts.employeeId))).limit(1))[0];
      if (!emp) continue;
      const prof = await effectiveSalaryProfile(tx, orgId, emp.id, periodEnd);
      if (!prof) { result.skipped.push(`${emp.codeOfficial ?? emp.codeInternal ?? ''} ${emp.fullName} (chưa có hồ sơ lương)`); continue; }
      // OFFICIAL: chỉ tính NV có lương hệ chính thức (base > 0)
      if (N(prof.baseSalary) <= 0) { result.skipped.push(`${emp.codeOfficial ?? emp.codeInternal ?? ''} ${emp.fullName} (không thuộc hệ chính thức)`); continue; }

      const inp: OfficialInput = {
        contractType: emp.contractType,
        bhxhSalary: N(prof.bhxhSalary), baseSalary: N(prof.baseSalary),
        allowResponsibility: N(prof.allowResponsibility), allowMeal: N(prof.allowMeal),
        allowFuel: N(prof.allowFuel), allowPhone: N(prof.allowPhone), allowUniform: N(prof.allowUniform),
        workDays: N(ts.workDays), paidLeaveDays: N(ts.paidLeaveDays),
        ot150Hours: N(ts.ot150Hours), ot170Hours: N(ts.ot170Hours), ot200Hours: N(ts.ot200Hours),
        bonus: 0, dependentsCount: emp.dependentsCount ?? 0, advance: 0,
      };
      const out = calcOfficialLine(inp, policy);
      await tx.insert(payrollLines).values({
        orgId, runId, employeeId: emp.id,
        workPay: String(Math.round(out.workPay)), allowancePay: String(Math.round(out.allowancePay)),
        otPay: String(out.otPay), leavePay: String(Math.round(out.leavePay)),
        bonus: '0', commission: '0',
        gross: String(Math.round(out.gross)),
        taxExemptTotal: String(Math.round(out.exemptTotal)),
        insuranceCompany: String(out.insuranceCompany + out.kpcd),
        insuranceEmployee: String(out.insuranceEmployee),
        unionFee: String(out.unionFee),
        deductionPersonal: String(out.deductionPersonal), deductionDependents: String(out.deductionDependents),
        taxableIncome: String(out.taxableIncome), pit: String(out.pit),
        advanceDeduct: '0', otherDeduct: '0',
        netPay: String(out.netPay),
        detail: { input: inp, output: out, policyId: policyRow.id },
      });
      result.lines++;
      result.totals.gross += Math.round(out.gross);
      result.totals.insuranceEmployee += out.insuranceEmployee;
      result.totals.pit += out.pit;
      result.totals.netPay += out.netPay;
    }
    await tx.update(payrollRuns).set({
      status: 'calculated', policyParamsId: policyRow.id, calculatedAt: new Date(),
    }).where(eq(payrollRuns.id, runId));
    return result;
  });
}

export async function listRunLines(db: any, orgId: string, runId: string) {
  await getRun(db, orgId, runId);
  return db.select().from(payrollLines)
    .where(and(eq(payrollLines.orgId, orgId), eq(payrollLines.runId, runId)));
}

export async function listRuns(db: any, orgId: string, periodCode?: string) {
  if (periodCode) {
    const period = await db.select().from(periods)
      .where(and(eq(periods.orgId, orgId), eq(periods.code, periodCode))).limit(1);
    if (!period.length) return [];
    return db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.orgId, orgId), eq(payrollRuns.periodId, period[0].id)));
  }
  return db.select().from(payrollRuns).where(eq(payrollRuns.orgId, orgId));
}
