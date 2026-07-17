/**
 * QLDN V1A — F8: Tiểu Tâm READ TOOLS (8 tool) — đăng ký vào toolRegistry host
 * để Tiểu Tâm ĐỌC dữ liệu lương/chấm công/forecast trả lời câu hỏi.
 * (GHI = tieu-tam-actions.ts với dry-run→confirm.)
 * Khuôn theo modules/ke-toan-10a/src/tools.ts.
 */
import { and, eq } from 'drizzle-orm';
import {
  employees, periods, timesheets, payrollRuns, payrollLines, salesEntries,
} from './schema.js';
import { listRuns, listRunLines } from './payroll.js';
import { forecastView } from './forecast.js';
import { listContractorPayments } from './payout.js';

const N = (v: unknown): number => Number(v ?? 0);
const vnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')}đ`;

export interface QldnToolDef {
  name: string;
  module: string;
  description: string;
  requiresPermission: string;
  handler(input: any, ctx: { orgId: string }): Promise<unknown>;
}

async function periodByCode(db: any, orgId: string, code: string) {
  const rows = await db.select().from(periods)
    .where(and(eq(periods.orgId, orgId), eq(periods.code, code))).limit(1);
  return rows[0] ?? null;
}

async function runSummary(db: any, orgId: string, periodCode: string) {
  const runs = await listRuns(db, orgId, periodCode);
  const out: any[] = [];
  for (const run of runs) {
    const lines = await listRunLines(db, orgId, run.id);
    let gross = 0, pit = 0, ins = 0, net = 0;
    for (const l of lines) { gross += N(l.gross); pit += N(l.pit); ins += N(l.insuranceEmployee); net += N(l.netPay); }
    out.push({
      runId: run.id, scheme: run.scheme, status: run.status,
      lines: lines.length, gross, pit, insuranceEmployee: ins, netPay: net,
      netFormatted: vnd(net),
    });
  }
  return out;
}

export function qldnTools(db: any): QldnToolDef[] {
  return [
    {
      name: 'qldn.payroll_summary',
      module: 'qldn',
      description: 'Xem bảng lương một kỳ (YYYY-MM): trạng thái, số NV, tổng gross/thuế/BH/thực lĩnh theo từng scheme',
      requiresPermission: 'qldn.payroll.read',
      handler: async (input: { period?: string }, ctx) => {
        const period = input?.period ?? new Date().toISOString().slice(0, 7);
        const runs = await runSummary(db, ctx.orgId, period);
        return { period, runs, message: runs.length ? undefined : `Kỳ ${period} chưa có bảng lương` };
      },
    },
    {
      name: 'qldn.payroll_fund',
      module: 'qldn',
      description: 'Tổng quỹ lương một kỳ: cộng thực lĩnh mọi scheme + CTV/gia công',
      requiresPermission: 'qldn.payroll.read',
      handler: async (input: { period?: string }, ctx) => {
        const period = input?.period ?? new Date().toISOString().slice(0, 7);
        const runs = await runSummary(db, ctx.orgId, period);
        const contractors = await listContractorPayments(db, ctx.orgId, period);
        const payrollNet = runs.reduce((s, r) => s + r.netPay, 0);
        const contractorNet = contractors.reduce((s: number, c: any) => s + N(c.netAmount), 0);
        return {
          period, payrollNet, contractorNet, totalFund: payrollNet + contractorNet,
          totalFundFormatted: vnd(payrollNet + contractorNet),
        };
      },
    },
    {
      name: 'qldn.compare_periods',
      module: 'qldn',
      description: 'So sánh quỹ lương 2 kỳ (YYYY-MM): chênh lệch tổng thực lĩnh + số NV',
      requiresPermission: 'qldn.payroll.read',
      handler: async (input: { periodA?: string; periodB?: string }, ctx) => {
        const a = input?.periodA ?? new Date().toISOString().slice(0, 7);
        const b = input?.periodB ?? a;
        const [ra, rb] = await Promise.all([runSummary(db, ctx.orgId, a), runSummary(db, ctx.orgId, b)]);
        const netA = ra.reduce((s, r) => s + r.netPay, 0);
        const netB = rb.reduce((s, r) => s + r.netPay, 0);
        return {
          periodA: { period: a, net: netA, runs: ra.length },
          periodB: { period: b, net: netB, runs: rb.length },
          delta: netA - netB, deltaFormatted: vnd(netA - netB),
        };
      },
    },
    {
      name: 'qldn.payslip',
      module: 'qldn',
      description: 'Xem chi tiết dòng lương một nhân viên trong kỳ (tìm theo tên hoặc mã NV)',
      requiresPermission: 'qldn.payslip.read',
      handler: async (input: { employee?: string; period?: string }, ctx) => {
        const period = input?.period ?? new Date().toISOString().slice(0, 7);
        const q = String(input?.employee ?? '').trim().toLowerCase();
        if (!q) return { error: 'Cần tên hoặc mã nhân viên' };
        const emps = await db.select().from(employees).where(eq(employees.orgId, ctx.orgId));
        const emp = emps.find((e: any) =>
          e.codeOfficial?.toLowerCase() === q || e.codeInternal?.toLowerCase() === q
          || e.fullName.toLowerCase().includes(q));
        if (!emp) return { error: `Không tìm thấy NV "${input?.employee}"` };
        const runs = await listRuns(db, ctx.orgId, period);
        const out: any[] = [];
        for (const run of runs) {
          const lines = await listRunLines(db, ctx.orgId, run.id);
          const line = lines.find((l: any) => l.employeeId === emp.id);
          if (line) out.push({ scheme: run.scheme, status: run.status, gross: N(line.gross), pit: N(line.pit), insurance: N(line.insuranceEmployee), netPay: N(line.netPay), netFormatted: vnd(N(line.netPay)) });
        }
        return { employee: { code: emp.codeOfficial ?? emp.codeInternal, fullName: emp.fullName }, period, lines: out };
      },
    },
    {
      name: 'qldn.timesheet_status',
      module: 'qldn',
      description: 'Trạng thái chấm công kỳ: bao nhiêu NV đã có công, ai active mà CHƯA chấm công',
      requiresPermission: 'qldn.payroll.read',
      handler: async (input: { period?: string }, ctx) => {
        const code = input?.period ?? new Date().toISOString().slice(0, 7);
        const period = await periodByCode(db, ctx.orgId, code);
        if (!period) return { period: code, error: `Chưa có kỳ ${code}` };
        const ts = await db.select().from(timesheets)
          .where(and(eq(timesheets.orgId, ctx.orgId), eq(timesheets.periodId, period.id)));
        const withTs = new Set(ts.map((t: any) => t.employeeId));
        const active = await db.select().from(employees)
          .where(and(eq(employees.orgId, ctx.orgId), eq(employees.status, 'active' as any)));
        const missing = active.filter((e: any) => !withTs.has(e.id))
          .map((e: any) => `${e.codeOfficial ?? e.codeInternal ?? ''} ${e.fullName}`.trim());
        return { period: code, totalActive: active.length, hasTimesheet: withTs.size, missing: missing.slice(0, 30), missingCount: missing.length };
      },
    },
    {
      name: 'qldn.commission',
      module: 'qldn',
      description: 'Doanh số theo đơn hàng trong kỳ: mã đơn JP, khách, doanh thu, NV phụ trách',
      requiresPermission: 'qldn.commission.read',
      handler: async (input: { period?: string }, ctx) => {
        const code = input?.period ?? new Date().toISOString().slice(0, 7);
        const period = await periodByCode(db, ctx.orgId, code);
        const cond = period
          ? and(eq(salesEntries.orgId, ctx.orgId), eq(salesEntries.periodId, period.id))
          : eq(salesEntries.orgId, ctx.orgId);
        const rows = await db.select().from(salesEntries).where(cond);
        const total = rows.reduce((s: number, r: any) => s + N(r.revenue), 0);
        return { period: code, orders: rows.length, totalRevenue: total, totalFormatted: vnd(total), entries: rows.slice(0, 20) };
      },
    },
    {
      name: 'qldn.contractors',
      module: 'qldn',
      description: 'Danh sách thanh toán CTV/gia công/công tác phí trong kỳ (gross, thuế khấu trừ 10%, thực nhận)',
      requiresPermission: 'qldn.payroll.read',
      handler: async (input: { period?: string }, ctx) => {
        const period = input?.period ?? new Date().toISOString().slice(0, 7);
        const rows = await listContractorPayments(db, ctx.orgId, period);
        const total = rows.reduce((s: number, r: any) => s + N(r.netAmount), 0);
        return { period, count: rows.length, totalNet: total, totalFormatted: vnd(total), payments: rows.slice(0, 20) };
      },
    },
    {
      name: 'qldn.forecast_balance',
      module: 'qldn',
      description: 'Dự báo dòng tiền: tồn quỹ dự kiến đến ngày X (YYYY-MM-DD), tổng thu/chi sắp tới',
      requiresPermission: 'qldn.forecast.read',
      handler: async (input: { to?: string; from?: string }, ctx) => {
        const view = await forecastView(db, ctx.orgId, input?.from, input?.to);
        return {
          from: view.from, to: view.to,
          openingBalance: view.openingBalance,
          closingBalance: view.closingBalance,
          closingFormatted: vnd(view.closingBalance),
          totals: view.totals, lines: view.lines.length,
          lastLines: view.lines.slice(-10),
        };
      },
    },
  ];
}
