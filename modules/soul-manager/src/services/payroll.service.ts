/**
 * SOUL-MANAGER — payroll.service
 * Engine bảng lương chuẩn VN (mọi con số CẤU HÌNH ĐƯỢC qua hr_settings.policy):
 *   gross  = lương ngày công + phụ cấp + OT
 *   BHXH/BHYT: căn cứ = min(max(lương đóng BH, LTT vùng), 20 × mức tham chiếu)
 *   BHTN:      căn cứ = min(..., 20 × LTT vùng) — trần riêng
 *   Luật ≥14 ngày không làm việc không hưởng lương → KHÔNG đóng BH tháng đó
 *   OT: hệ số 150/200/300%; phần phụ trội vượt 100% MIỄN thuế TNCN
 *   Thuế TNCN lũy tiến trên (chịu thuế − BH − giảm trừ), làm tròn đồng
 * Tính toán 100% qua src/money.ts — KHÔNG Number() cho tiền.
 */
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { z } from 'zod';
import {
  hrAllowances, hrAttendance, hrDependents, hrEmployees,
  hrLeaveRequests, hrLeaveTypes, hrPayrollPeriods, hrPayslips,
} from '../db/schema.js';
import type {
  payrollRunSchema, payrollApproveSchema, payslipGetSchema,
} from '../validation/schemas.js';
import { HrError, type HrCtx } from '../types.js';
import { M, progressiveTax } from '../money.js';
import {
  periodDate, referenceLevelAt, regionalMinWageAt, type HrPolicy,
} from '../config.js';
import { getSettings } from './defaults.service.js';
import { monthRange } from './attendance.service.js';
import { getEmployeeByCode } from './employee.service.js';

// ────────────────────────────────────────────────────────────
// PURE ENGINE — test được độc lập, không chạm DB
// ────────────────────────────────────────────────────────────

export interface PayslipInput {
  baseSalary: string;
  insuranceSalary?: string | null;   // null = dùng baseSalary
  standardWorkDays: string;
  workHoursPerDay: string;
  workedDays: string;
  paidLeaveDays: string;
  otWeekdayHours: string;
  otWeekendHours: string;
  otHolidayHours: string;
  allowanceTaxable: string;
  allowanceNontaxable: string;
  dependentsCount: number;
  workRegion: number;                // vùng lương tối thiểu 1–4
  periodIso: string;                 // 'YYYY-MM-01' — tra mốc hiệu lực
}

export interface PayslipNumbers {
  workedDays: string; paidLeaveDays: string; paidDays: string;
  salaryByDays: string;
  allowanceTaxable: string; allowanceNontaxable: string;
  otHours: string; otPay: string; otTaxExempt: string;
  gross: string;
  insuranceBase: string; uiBase: string;
  siAmount: string; hiAmount: string; uiAmount: string; insuranceTotal: string;
  dependentsCount: number;
  personalDeduction: string; dependentDeduction: string;
  taxableIncome: string; assessableIncome: string; pit: string;
  otherDeductions: string; net: string;
  breakdown: Record<string, unknown>;
}

export function computePayslipNumbers(policy: HrPolicy, inp: PayslipInput): PayslipNumbers {
  const paidDays = M.add(inp.workedDays, inp.paidLeaveDays);
  const salaryByDays = M.round0(M.mulDiv(inp.baseSalary, paidDays, inp.standardWorkDays));

  // OT theo giờ: hourly = lương cơ bản / (ngày công chuẩn × giờ/ngày)
  const hoursPerMonth = M.mulRate(inp.standardWorkDays, inp.workHoursPerDay);
  const hourly = M.round0(M.mulDiv(inp.baseSalary, '1', hoursPerMonth));
  const payFactor = M.sum([
    M.mulRate(inp.otWeekdayHours, policy.ot.weekday),
    M.mulRate(inp.otWeekendHours, policy.ot.weekend),
    M.mulRate(inp.otHolidayHours, policy.ot.holiday),
  ]);
  const exemptFactor = M.sum([
    M.mulRate(inp.otWeekdayHours, M.sub(policy.ot.weekday, '1')),
    M.mulRate(inp.otWeekendHours, M.sub(policy.ot.weekend, '1')),
    M.mulRate(inp.otHolidayHours, M.sub(policy.ot.holiday, '1')),
  ]);
  const otHours = M.sum([inp.otWeekdayHours, inp.otWeekendHours, inp.otHolidayHours]);
  const otPay = M.round0(M.mulRate(hourly, payFactor));
  const otTaxExempt = policy.ot.premium_tax_exempt
    ? M.round0(M.mulRate(hourly, exemptFactor)) : M.norm('0');

  const gross = M.sum([salaryByDays, inp.allowanceTaxable, inp.allowanceNontaxable, otPay]);

  // ── Bảo hiểm bắt buộc ──
  const reference = referenceLevelAt(policy, inp.periodIso);
  const minWage = regionalMinWageAt(policy, inp.periodIso, inp.workRegion);
  const siCap = M.round0(M.mulRate(reference, policy.insurance.si_cap_multiplier));
  const uiCap = M.round0(M.mulRate(minWage, policy.insurance.ui_cap_multiplier));
  const insSalaryRaw = inp.insuranceSalary ?? inp.baseSalary;
  const insSalaryFloored = M.max(M.norm(insSalaryRaw), M.norm(minWage)); // sàn LTT vùng
  const insuranceBase = M.min(insSalaryFloored, siCap);
  const uiBase = M.min(insSalaryFloored, uiCap);

  // Luật BHXH: không làm việc & không hưởng lương ≥14 ngày làm việc/tháng
  // → không thuộc diện đóng BHXH tháng đó (BHYT/BHTN theo cùng)
  const unpaidDays = M.sub(inp.standardWorkDays, paidDays);
  const skipInsurance = M.cmp(unpaidDays, '14') >= 0;

  const e = policy.insurance.employee;
  const siAmount = skipInsurance ? M.norm('0') : M.round0(M.mulRate(insuranceBase, e.si));
  const hiAmount = skipInsurance ? M.norm('0') : M.round0(M.mulRate(insuranceBase, e.hi));
  const uiAmount = skipInsurance ? M.norm('0') : M.round0(M.mulRate(uiBase, e.ui));
  const insuranceTotal = M.sum([siAmount, hiAmount, uiAmount]);

  // ── Thuế TNCN ──
  // Chịu thuế = lương ngày công + phụ cấp CHỊU THUẾ + phần OT hệ số 100%
  const otTaxablePart = M.sub(otPay, otTaxExempt);
  const taxableIncome = M.sum([salaryByDays, inp.allowanceTaxable, otTaxablePart]);
  const personalDeduction = M.norm(policy.personal_deduction);
  const dependentDeduction = M.round0(
    M.mulRate(policy.dependent_deduction, String(inp.dependentsCount)));
  const assessableRaw = M.sub(
    M.sub(taxableIncome, insuranceTotal),
    M.add(personalDeduction, dependentDeduction));
  const assessableIncome = M.max(assessableRaw, '0');
  const pit = progressiveTax(assessableIncome, policy.tax_brackets);

  const otherDeductions = M.norm('0');
  const net = M.sub(M.sub(M.sub(gross, insuranceTotal), pit), otherDeductions);

  const explain = [
    `Lương ngày công: ${inp.baseSalary} × ${paidDays}/${inp.standardWorkDays} công = ${salaryByDays} đ`,
    M.isZero(otPay) ? null
      : `Làm thêm giờ: ${otHours} giờ × đơn giá ${hourly} đ/giờ (hệ số ${policy.ot.weekday}/${policy.ot.weekend}/${policy.ot.holiday}) = ${otPay} đ, trong đó ${otTaxExempt} đ miễn thuế`,
    skipInsurance
      ? `Bảo hiểm: nghỉ không lương ${unpaidDays} ngày (≥14) → không đóng BHXH/BHYT/BHTN tháng này`
      : `Bảo hiểm NLĐ đóng: BHXH ${siAmount} + BHYT ${hiAmount} + BHTN ${uiAmount} = ${insuranceTotal} đ (căn cứ ${insuranceBase} đ, trần ${siCap} đ)`,
    `Giảm trừ gia cảnh: bản thân ${personalDeduction} + ${inp.dependentsCount} NPT × ${policy.dependent_deduction} = ${M.add(personalDeduction, dependentDeduction)} đ`,
    `Thu nhập tính thuế: ${assessableIncome} đ → thuế TNCN ${pit} đ (biểu ${policy.version})`,
    `THỰC NHẬN: ${gross} − ${insuranceTotal} − ${pit} = ${net} đ`,
  ].filter((s): s is string => s !== null);

  return {
    workedDays: M.norm(inp.workedDays), paidLeaveDays: M.norm(inp.paidLeaveDays), paidDays,
    salaryByDays,
    allowanceTaxable: M.norm(inp.allowanceTaxable),
    allowanceNontaxable: M.norm(inp.allowanceNontaxable),
    otHours, otPay, otTaxExempt, gross,
    insuranceBase, uiBase, siAmount, hiAmount, uiAmount, insuranceTotal,
    dependentsCount: inp.dependentsCount,
    personalDeduction, dependentDeduction,
    taxableIncome, assessableIncome, pit, otherDeductions, net,
    breakdown: {
      policy_version: policy.version,
      reference_level: reference, si_cap: siCap,
      regional_min_wage: minWage, ui_cap: uiCap,
      hourly_rate: hourly, skip_insurance: skipInsurance,
      explain,
    },
  };
}

// ────────────────────────────────────────────────────────────
// DB ORCHESTRATION
// ────────────────────────────────────────────────────────────

async function getPeriod(ctx: HrCtx, year: number, month: number) {
  const [p] = await ctx.db.select().from(hrPayrollPeriods).where(and(
    eq(hrPayrollPeriods.orgId, ctx.orgId),
    eq(hrPayrollPeriods.year, year),
    eq(hrPayrollPeriods.month, month),
  )).limit(1);
  return p;
}

/** Chạy bảng lương một kỳ — idempotent khi draft/calculated, khóa khi approved */
export async function runPayroll(ctx: HrCtx, input: z.infer<typeof payrollRunSchema>) {
  const settings = await getSettings(ctx);
  const policy = settings.policy;
  const stdDays = input.standard_work_days ?? settings.standardWorkDays;
  const { start, next } = monthRange(input.year, input.month);
  const periodIso = periodDate(input.year, input.month);

  let period = await getPeriod(ctx, input.year, input.month);
  if (period && (period.status === 'approved' || period.status === 'paid')) {
    throw new HrError('PERIOD_LOCKED',
      `Kỳ lương ${input.month}/${input.year} đã ${period.status === 'paid' ? 'thanh toán' : 'chốt'} — không thể tính lại`,
      { year: input.year, month: input.month, status: period.status });
  }
  if (period) {
    await ctx.db.delete(hrPayslips).where(and(
      eq(hrPayslips.orgId, ctx.orgId), eq(hrPayslips.periodId, period.id)));
    [period] = await ctx.db.update(hrPayrollPeriods)
      .set({ standardWorkDays: M.norm(stdDays), note: input.note ?? period.note, updatedAt: new Date() })
      .where(and(eq(hrPayrollPeriods.orgId, ctx.orgId), eq(hrPayrollPeriods.id, period.id)))
      .returning();
  } else {
    [period] = await ctx.db.insert(hrPayrollPeriods).values({
      orgId: ctx.orgId, year: input.year, month: input.month,
      standardWorkDays: M.norm(stdDays), note: input.note ?? null,
    }).returning();
  }

  const employees = await ctx.db.select().from(hrEmployees).where(and(
    eq(hrEmployees.orgId, ctx.orgId),
    inArray(hrEmployees.status, ['probation', 'active', 'on_leave']),
  ));

  // Aggregate 1 lần cho cả org (SQL-side), map theo employee_id
  const att = await ctx.db.select({
    employeeId: hrAttendance.employeeId,
    worked: sql<string>`coalesce(sum(${hrAttendance.workDays}) filter (where ${hrAttendance.status} in ('present','half_day')), 0)::text`,
    otWd: sql<string>`coalesce(sum(${hrAttendance.otWeekdayHours}), 0)::text`,
    otWe: sql<string>`coalesce(sum(${hrAttendance.otWeekendHours}), 0)::text`,
    otHo: sql<string>`coalesce(sum(${hrAttendance.otHolidayHours}), 0)::text`,
  }).from(hrAttendance).where(and(
    eq(hrAttendance.orgId, ctx.orgId),
    gte(hrAttendance.workDate, start),
    lt(hrAttendance.workDate, next),
  )).groupBy(hrAttendance.employeeId);
  const attMap = new Map(att.map((a) => [a.employeeId, a]));

  const paidLeave = await ctx.db.select({
    employeeId: hrLeaveRequests.employeeId,
    days: sql<string>`coalesce(sum(${hrLeaveRequests.days}), 0)::text`,
  }).from(hrLeaveRequests)
    .innerJoin(hrLeaveTypes, eq(hrLeaveRequests.leaveTypeId, hrLeaveTypes.id))
    .where(and(
      eq(hrLeaveRequests.orgId, ctx.orgId),
      eq(hrLeaveRequests.status, 'approved'),
      eq(hrLeaveTypes.paid, true),
      gte(hrLeaveRequests.startDate, start),
      lt(hrLeaveRequests.startDate, next),
    )).groupBy(hrLeaveRequests.employeeId);
  const leaveMap = new Map(paidLeave.map((l) => [l.employeeId, l.days]));

  const deps = await ctx.db.select({
    employeeId: hrDependents.employeeId,
    cnt: sql<number>`count(*)::int`,
  }).from(hrDependents).where(and(
    eq(hrDependents.orgId, ctx.orgId), eq(hrDependents.active, true),
  )).groupBy(hrDependents.employeeId);
  const depMap = new Map(deps.map((d) => [d.employeeId, d.cnt]));

  const allow = await ctx.db.select({
    employeeId: hrAllowances.employeeId,
    tax: sql<string>`coalesce(sum(${hrAllowances.amount}) filter (where ${hrAllowances.taxable}), 0)::text`,
    nontax: sql<string>`coalesce(sum(${hrAllowances.amount}) filter (where not ${hrAllowances.taxable}), 0)::text`,
  }).from(hrAllowances).where(and(
    eq(hrAllowances.orgId, ctx.orgId), eq(hrAllowances.active, true),
  )).groupBy(hrAllowances.employeeId);
  const allowMap = new Map(allow.map((a) => [a.employeeId, a]));

  let totalGross = M.norm('0');
  let totalNet = M.norm('0');
  const slips: Array<{ employee_code: string; full_name: string; gross: string; net: string }> = [];

  for (const emp of employees) {
    const a = attMap.get(emp.id);
    const al = allowMap.get(emp.id);
    const numbers = computePayslipNumbers(policy, {
      baseSalary: emp.baseSalary,
      insuranceSalary: emp.insuranceSalary,
      standardWorkDays: M.norm(stdDays),
      workHoursPerDay: settings.workHoursPerDay,
      workedDays: a?.worked ?? '0',
      paidLeaveDays: leaveMap.get(emp.id) ?? '0',
      otWeekdayHours: a?.otWd ?? '0',
      otWeekendHours: a?.otWe ?? '0',
      otHolidayHours: a?.otHo ?? '0',
      allowanceTaxable: al?.tax ?? '0',
      allowanceNontaxable: al?.nontax ?? '0',
      dependentsCount: depMap.get(emp.id) ?? 0,
      workRegion: emp.workRegion ?? settings.defaultRegion,
      periodIso,
    });

    await ctx.db.insert(hrPayslips).values({
      orgId: ctx.orgId, periodId: period!.id, employeeId: emp.id,
      baseSalary: emp.baseSalary, standardWorkDays: M.norm(stdDays),
      workedDays: numbers.workedDays, paidLeaveDays: numbers.paidLeaveDays,
      paidDays: numbers.paidDays, salaryByDays: numbers.salaryByDays,
      allowanceTaxable: numbers.allowanceTaxable,
      allowanceNontaxable: numbers.allowanceNontaxable,
      otHours: numbers.otHours, otPay: numbers.otPay, otTaxExempt: numbers.otTaxExempt,
      gross: numbers.gross,
      insuranceBase: numbers.insuranceBase, uiBase: numbers.uiBase,
      siAmount: numbers.siAmount, hiAmount: numbers.hiAmount, uiAmount: numbers.uiAmount,
      insuranceTotal: numbers.insuranceTotal,
      dependentsCount: numbers.dependentsCount,
      personalDeduction: numbers.personalDeduction,
      dependentDeduction: numbers.dependentDeduction,
      taxableIncome: numbers.taxableIncome, assessableIncome: numbers.assessableIncome,
      pit: numbers.pit, otherDeductions: numbers.otherDeductions, net: numbers.net,
      breakdown: numbers.breakdown,
    });

    totalGross = M.add(totalGross, numbers.gross);
    totalNet = M.add(totalNet, numbers.net);
    slips.push({ employee_code: emp.code, full_name: emp.fullName, gross: numbers.gross, net: numbers.net });
  }

  await ctx.db.update(hrPayrollPeriods)
    .set({ status: 'calculated', updatedAt: new Date() })
    .where(and(eq(hrPayrollPeriods.orgId, ctx.orgId), eq(hrPayrollPeriods.id, period!.id)));

  await ctx.bus.emit('hr.payroll.calculated', {
    org_id: ctx.orgId, year: input.year, month: input.month,
    employees: employees.length, total_gross: totalGross, total_net: totalNet,
  });
  return {
    year: input.year, month: input.month, status: 'calculated',
    standard_work_days: M.norm(stdDays), employees: employees.length,
    total_gross: totalGross, total_net: totalNet, payslips: slips,
  };
}

/** Chốt kỳ lương: calculated → approved (một chiều, sau đó khóa tính lại) */
export async function approvePayroll(ctx: HrCtx, input: z.infer<typeof payrollApproveSchema>) {
  const period = await getPeriod(ctx, input.year, input.month);
  if (!period) {
    throw new HrError('PERIOD_NOT_FOUND',
      `Chưa có kỳ lương ${input.month}/${input.year} — hãy chạy bảng lương trước`,
      { year: input.year, month: input.month });
  }
  if (period.status !== 'calculated') {
    throw new HrError('PERIOD_NOT_CALCULATED',
      `Kỳ lương đang ở trạng thái ${period.status} — chỉ chốt được khi đã tính (calculated)`,
      { status: period.status });
  }
  const [totals] = await ctx.db.select({
    employees: sql<number>`count(*)::int`,
    total_net: sql<string>`coalesce(sum(${hrPayslips.net}), 0)::text`,
  }).from(hrPayslips).where(and(
    eq(hrPayslips.orgId, ctx.orgId), eq(hrPayslips.periodId, period.id)));

  await ctx.db.update(hrPayrollPeriods)
    .set({ status: 'approved', updatedAt: new Date() })
    .where(and(eq(hrPayrollPeriods.orgId, ctx.orgId), eq(hrPayrollPeriods.id, period.id)));

  await ctx.bus.emit('hr.payroll.approved', {
    org_id: ctx.orgId, year: input.year, month: input.month,
    employees: totals!.employees, total_net: totals!.total_net,
    approved_by: ctx.userId ?? null,
  });
  return {
    year: input.year, month: input.month, status: 'approved',
    employees: totals!.employees, total_net: totals!.total_net,
  };
}

/** Xem phiếu lương một NV (kèm explain cho Tiểu Tâm) hoặc tổng hợp cả kỳ */
export async function getPayslip(ctx: HrCtx, input: z.infer<typeof payslipGetSchema>) {
  const period = await getPeriod(ctx, input.year, input.month);
  if (!period) {
    throw new HrError('PERIOD_NOT_FOUND',
      `Chưa có kỳ lương ${input.month}/${input.year}`, { year: input.year, month: input.month });
  }

  if (input.employee_code) {
    const emp = await getEmployeeByCode(ctx, input.employee_code);
    const [slip] = await ctx.db.select().from(hrPayslips).where(and(
      eq(hrPayslips.orgId, ctx.orgId),
      eq(hrPayslips.periodId, period.id),
      eq(hrPayslips.employeeId, emp.id),
    )).limit(1);
    if (!slip) {
      throw new HrError('PAYSLIP_NOT_FOUND',
        `${emp.code} không có phiếu lương kỳ ${input.month}/${input.year}`,
        { employee_code: emp.code });
    }
    return {
      period: { year: input.year, month: input.month, status: period.status },
      employee_code: emp.code, full_name: emp.fullName,
      base_salary: slip.baseSalary,
      worked_days: slip.workedDays, paid_leave_days: slip.paidLeaveDays,
      paid_days: slip.paidDays, standard_work_days: slip.standardWorkDays,
      salary_by_days: slip.salaryByDays,
      allowance_taxable: slip.allowanceTaxable,
      allowance_nontaxable: slip.allowanceNontaxable,
      ot_hours: slip.otHours, ot_pay: slip.otPay, ot_tax_exempt: slip.otTaxExempt,
      gross: slip.gross,
      insurance: {
        base: slip.insuranceBase, si: slip.siAmount, hi: slip.hiAmount,
        ui: slip.uiAmount, total: slip.insuranceTotal,
      },
      deductions: {
        dependents_count: slip.dependentsCount,
        personal: slip.personalDeduction, dependents: slip.dependentDeduction,
      },
      taxable_income: slip.taxableIncome, assessable_income: slip.assessableIncome,
      pit: slip.pit, net: slip.net,
      breakdown: slip.breakdown,
    };
  }

  const [totals] = await ctx.db.select({
    employees: sql<number>`count(*)::int`,
    total_gross: sql<string>`coalesce(sum(${hrPayslips.gross}), 0)::text`,
    total_insurance: sql<string>`coalesce(sum(${hrPayslips.insuranceTotal}), 0)::text`,
    total_pit: sql<string>`coalesce(sum(${hrPayslips.pit}), 0)::text`,
    total_net: sql<string>`coalesce(sum(${hrPayslips.net}), 0)::text`,
  }).from(hrPayslips).where(and(
    eq(hrPayslips.orgId, ctx.orgId), eq(hrPayslips.periodId, period.id)));

  const lines = await ctx.db.select({
    employee_code: hrEmployees.code, full_name: hrEmployees.fullName,
    gross: hrPayslips.gross, insurance: hrPayslips.insuranceTotal,
    pit: hrPayslips.pit, net: hrPayslips.net,
  }).from(hrPayslips)
    .innerJoin(hrEmployees, eq(hrPayslips.employeeId, hrEmployees.id))
    .where(and(eq(hrPayslips.orgId, ctx.orgId), eq(hrPayslips.periodId, period.id)))
    .orderBy(hrEmployees.code);

  return {
    period: { year: input.year, month: input.month, status: period.status },
    ...totals!, payslips: lines,
  };
}
