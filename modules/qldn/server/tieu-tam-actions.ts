/**
 * QLDN V1A — F8: CẦU NỐI TIỂU TÂM (actions GHI) — khuôn v8.5 như ke-toan-10a.
 * Host thực thi qua executeAction trung tâm: gate module → hasPermission(role)
 * → securityLevel → sensitive chưa confirm = DRY-RUN preview → confirm mới execute.
 * `execute` ở đây chỉ lo nghiệp vụ + audit + message tiếng Việt.
 *
 * Tích hợp host (INTEGRATION giống k10a):
 *   1. Permissions qldn.* đã có trong PERMISSION_REGISTRY (@citadel/core) từ F1.
 *   2. defs.push(...qldnTieuTamActions()) trong services/api/src/tieu-tam/actions.ts.
 *   3. Nối detectQldnAction vào detectAction để bắt câu lệnh nhanh tiếng Việt.
 */
import { and, eq } from 'drizzle-orm';
import { employees, periods, salesEntries } from './schema.js';
import { createPayrollRun, calculateRun, getRun } from './payroll.js';
import { approveRun, createPayoutBatch, generatePayslips, createContractorPayment } from './payout.js';
import { createEmployee } from './service.js';
import { runMonthlyAutomation } from './scheduler.js';

/* ---------- Kiểu phản chiếu host (module tự typecheck độc lập) ---------- */
export type QldnRole = 'super_admin' | 'owner' | 'manager' | 'staff';
export type QldnSecurityLevel = 1 | 2;
export type QldnActionCtx = {
  db: any;
  orgId: string;
  userId: string;
  role: QldnRole;
  securityLevel: number;
  audit?: (e: { action: string; resource?: string; resourceId?: string; detail?: unknown }) => Promise<void>;
};
export type QldnActionResult = {
  ok: boolean;
  action: string;
  module: string;
  message: string;
  data?: unknown;
  dryRun?: boolean;
  preview?: unknown;
  pendingAction?: unknown;
};
export type QldnTieuTamAction = {
  name: string;
  description: string;
  requiredModule: string;
  permission: string;
  securityLevel: QldnSecurityLevel;
  sensitive: boolean;
  parameters: Record<string, unknown>;
  execute(ctx: QldnActionCtx, params: Record<string, unknown>): Promise<QldnActionResult>;
};

const MODULE_ID = 'qldn';
const vnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')}đ`;
const currentPeriod = () => new Date().toISOString().slice(0, 7);
const ok = (action: string, message: string, data?: unknown): QldnActionResult =>
  ({ ok: true, action, module: MODULE_ID, message, data });
async function logAudit(ctx: QldnActionCtx, action: string, params: unknown, resourceId?: string) {
  await ctx.audit?.({ action: 'tieu_tam.action', resource: 'tieu_tam', resourceId, detail: { action, params } });
}

/** Bộ action Tiểu Tâm của QLDN — mọi hành động tiền/lương = securityLevel 2 + sensitive. */
export function qldnTieuTamActions(): QldnTieuTamAction[] {
  return [
    {
      name: 'qldn.chay_bang_luong',
      permission: 'qldn.payroll.run',
      securityLevel: 2,
      sensitive: true,
      requiredModule: MODULE_ID,
      description: '(QLDN) Chạy bảng lương kỳ: tạo run + tính toàn bộ NV theo chấm công + policy hiệu lực (chưa duyệt)',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', description: 'Kỳ lương YYYY-MM, ví dụ 2026-06' },
          scheme: { type: 'string', enum: ['OFFICIAL', 'INTERNAL'], description: 'Hệ lương: OFFICIAL (BHXH/thuế) hoặc INTERNAL (nội bộ)' },
        },
        required: ['period'],
      },
      async execute(ctx, p) {
        const period = String(p.period ?? currentPeriod());
        const scheme = p.scheme === 'INTERNAL' ? 'INTERNAL' : 'OFFICIAL';
        const run = await createPayrollRun(ctx.db, ctx.orgId, { period, scheme, note: `Tiểu Tâm chạy theo lệnh ${ctx.userId}` });
        const calc = await calculateRun(ctx.db, ctx.orgId, run.id);
        await logAudit(ctx, this.name, p, run.id);
        const skipMsg = calc.skipped.length ? ` (bỏ qua ${calc.skipped.length} NV thiếu hồ sơ)` : '';
        return ok(this.name, `Đã tính bảng lương ${scheme} kỳ ${period}: ${calc.lines} NV, tổng thực lĩnh ${vnd(calc.totals.netPay)}${skipMsg}. Trạng thái: CHỜ DUYỆT.`, { ...calc, runId: run.id });
      },
    },
    {
      name: 'qldn.duyet_bang_luong',
      permission: 'qldn.payroll.approve',
      securityLevel: 2,
      sensitive: true,
      requiredModule: MODULE_ID,
      description: '(QLDN) Duyệt bảng lương đã tính — sau duyệt sẽ phát outbox để Kế Toán 10A sinh bút toán 334/338/3335',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', description: 'Kỳ lương YYYY-MM' },
          runId: { type: 'string', description: 'ID run cụ thể (nếu biết); không có thì dùng period + scheme' },
          scheme: { type: 'string', enum: ['OFFICIAL', 'INTERNAL'] },
        },
      },
      async execute(ctx, p) {
        let runId = p.runId ? String(p.runId) : '';
        if (!runId) {
          const period = String(p.period ?? currentPeriod());
          const scheme = p.scheme === 'INTERNAL' ? 'INTERNAL' : 'OFFICIAL';
          const prd = (await ctx.db.select().from(periods)
            .where(and(eq(periods.orgId, ctx.orgId), eq(periods.code, period))).limit(1))[0];
          if (!prd) return { ok: false, action: this.name, module: MODULE_ID, message: `Chưa có kỳ ${period}` };
          const { payrollRuns } = await import('./schema.js');
          const run = (await ctx.db.select().from(payrollRuns).where(and(
            eq(payrollRuns.orgId, ctx.orgId), eq(payrollRuns.periodId, prd.id), eq(payrollRuns.scheme, scheme as any),
          )).limit(1))[0];
          if (!run) return { ok: false, action: this.name, module: MODULE_ID, message: `Kỳ ${period} chưa có bảng lương ${scheme}` };
          runId = run.id;
        }
        const row = await approveRun(ctx.db, ctx.orgId, runId, ctx.userId);
        await logAudit(ctx, this.name, p, runId);
        return ok(this.name, `Đã DUYỆT bảng lương ${row.scheme}. Outbox đã phát sự kiện để Kế Toán 10A hạch toán 334/338/3335.`, { runId, status: row.status });
      },
    },
    {
      name: 'qldn.tao_batch_chi_luong',
      permission: 'qldn.payout.create',
      securityLevel: 2,
      sensitive: true,
      requiredModule: MODULE_ID,
      description: '(QLDN) Tạo batch chi lương ngân hàng (UNC) từ bảng lương đã duyệt + phát phiếu lương',
      parameters: {
        type: 'object',
        properties: { runId: { type: 'string', description: 'ID bảng lương đã duyệt' } },
        required: ['runId'],
      },
      async execute(ctx, p) {
        const runId = String(p.runId);
        const { batch, summary } = await createPayoutBatch(ctx.db, ctx.orgId, { runId }, ctx.userId);
        const slips = await generatePayslips(ctx.db, ctx.orgId, runId);
        await logAudit(ctx, this.name, p, batch.id);
        const missing = summary.missingBank ? ` · ${summary.missingBank} NV chưa có STK (trả tiền mặt)` : '';
        return ok(this.name, `Đã tạo batch chi lương: ${summary.lines} NV, tổng ${vnd(summary.totalAmount)}${missing}. Phát ${slips.created} phiếu lương.`, { batchId: batch.id, ...summary, payslips: slips });
      },
    },
    {
      name: 'qldn.them_nhan_vien',
      permission: 'qldn.employee.write',
      securityLevel: 2,
      sensitive: true,
      requiredModule: MODULE_ID,
      description: '(QLDN) Thêm nhân viên vào hệ lương (tên + mã + loại HĐ + phòng ban)',
      parameters: {
        type: 'object',
        properties: {
          fullName: { type: 'string', description: 'Họ tên đầy đủ' },
          codeOfficial: { type: 'string', description: 'Mã NV chính thức, vd NV045' },
          contractType: { type: 'string', enum: ['HDLD', 'HDTV', 'CTV'] },
          department: { type: 'string' },
          position: { type: 'string' },
        },
        required: ['fullName'],
      },
      async execute(ctx, p) {
        const row = await createEmployee(ctx.db, ctx.orgId, p);
        await logAudit(ctx, this.name, p, row.id);
        return ok(this.name, `Đã thêm nhân viên ${row.fullName}${row.codeOfficial ? ` (${row.codeOfficial})` : ''} · ${row.contractType}. Nhớ tạo hồ sơ lương trước khi chạy bảng lương.`, row);
      },
    },
    {
      name: 'qldn.nhap_doanh_so',
      permission: 'qldn.commission.write',
      securityLevel: 2,
      sensitive: true,
      requiredModule: MODULE_ID,
      description: '(QLDN) Nhập doanh số đơn hàng (mã JP + doanh thu + NV phụ trách) để tính hoa hồng',
      parameters: {
        type: 'object',
        properties: {
          orderCode: { type: 'string', description: 'Mã đơn, vd JP250056' },
          revenue: { type: 'number', description: 'Doanh thu VND' },
          customer: { type: 'string' },
          ownerName: { type: 'string', description: 'Tên NV phụ trách (tìm gần đúng)' },
          period: { type: 'string', description: 'Kỳ YYYY-MM' },
        },
        required: ['orderCode', 'revenue'],
      },
      async execute(ctx, p) {
        let ownerEmployeeId: string | null = null;
        if (p.ownerName) {
          const q = String(p.ownerName).toLowerCase();
          const emps = await ctx.db.select().from(employees).where(eq(employees.orgId, ctx.orgId));
          ownerEmployeeId = emps.find((e: any) => e.fullName.toLowerCase().includes(q))?.id ?? null;
        }
        let periodId: string | null = null;
        const code = String(p.period ?? currentPeriod());
        const prd = (await ctx.db.select().from(periods)
          .where(and(eq(periods.orgId, ctx.orgId), eq(periods.code, code))).limit(1))[0];
        if (prd) periodId = prd.id;
        const [row] = await ctx.db.insert(salesEntries).values({
          orgId: ctx.orgId, orderCode: String(p.orderCode), revenue: String(Number(p.revenue ?? 0)),
          customer: p.customer ? String(p.customer) : null, entryDate: new Date().toISOString().slice(0, 10),
          ownerEmployeeId, periodId,
        }).returning();
        await logAudit(ctx, this.name, p, row.id);
        return ok(this.name, `Đã ghi doanh số đơn ${row.orderCode}: ${vnd(Number(row.revenue))}${p.ownerName ? ` · NV ${p.ownerName}` : ''}.`, row);
      },
    },
    {
      name: 'qldn.chay_tu_dong_ky',
      permission: 'qldn.payroll.run',
      securityLevel: 2,
      sensitive: true,
      requiredModule: MODULE_ID,
      description: '(QLDN) Chạy ngay quy trình auto tháng (như scheduler mùng 1): tạo kỳ mới + tính lương kỳ trước nếu đủ điều kiện',
      parameters: { type: 'object', properties: {} },
      async execute(ctx, p) {
        const r = await runMonthlyAutomation(ctx.db, ctx.orgId);
        await logAudit(ctx, this.name, p, r.runCreated ?? undefined);
        if (r.calculated) return ok(this.name, `Auto-run xong: bảng lương ${r.calculated.lines} NV đã tính (${vnd(r.calculated.netTotal)}) — CHỜ DUYỆT.${r.periodCreated ? ` Đã mở kỳ ${r.periodCreated}.` : ''}`, r);
        return ok(this.name, `Auto-run: ${r.periodCreated ? `đã mở kỳ ${r.periodCreated}. ` : ''}${r.skippedReason ?? 'Không có việc cần làm.'}`, r);
      },
    },
    {
      name: 'qldn.thanh_toan_ctv',
      permission: 'qldn.contractor.write',
      securityLevel: 2,
      sensitive: true,
      requiredModule: MODULE_ID,
      description: '(QLDN) Thanh toán CTV/gia công ngoài (gross-up 10%) hoặc công tác phí (không thuế)',
      parameters: {
        type: 'object',
        properties: {
          contractorName: { type: 'string' },
          netAmount: { type: 'number', description: 'Số thực nhận thỏa thuận (gross-up 10%)' },
          grossAmount: { type: 'number', description: 'Hoặc tổng thu nhập trước thuế' },
          kind: { type: 'string', enum: ['ctv', 'gia_cong', 'cong_tac'] },
          period: { type: 'string' },
        },
        required: ['contractorName'],
      },
      async execute(ctx, p) {
        const row = await createContractorPayment(ctx.db, ctx.orgId, { ...p, period: p.period ?? currentPeriod() });
        await logAudit(ctx, this.name, p, row.id);
        return ok(this.name, `Đã ghi thanh toán ${row.kind} cho ${row.contractorName}: gross ${vnd(Number(row.grossAmount))} · thuế ${vnd(Number(row.pitWithheld))} · thực nhận ${vnd(Number(row.netAmount))}.`, row);
      },
    },
  ];
}

/** Bắt câu lệnh nhanh tiếng Việt (host nối vào detectAction). */
export function detectQldnAction(message: string): { name: string; params: Record<string, unknown> } | null {
  const m = message.trim();
  let x: RegExpExecArray | null;
  // "chạy bảng lương T06" / "chạy lương kỳ 2026-06" / "chạy bảng lương nội bộ T06"
  if ((x = /ch[ạa]y\s+(?:b[ảa]ng\s+)?l[ưu][ơo]ng\s+(n[ộo]i\s+b[ộo]\s+)?(?:k[ỳy]\s+)?(?:t(?:h[áa]ng)?\s*)?(\d{4}-\d{2}|\d{1,2})/i.exec(m))) {
    let period = x[2]!;
    if (/^\d{1,2}$/.test(period)) period = `${new Date().getFullYear()}-${period.padStart(2, '0')}`;
    return { name: 'qldn.chay_bang_luong', params: { period, scheme: x[1] ? 'INTERNAL' : 'OFFICIAL' } };
  }
  // "duyệt bảng lương T06"
  if ((x = /duy[ệe]t\s+(?:b[ảa]ng\s+)?l[ưu][ơo]ng\s+(?:k[ỳy]\s+)?(?:t(?:h[áa]ng)?\s*)?(\d{4}-\d{2}|\d{1,2})/i.exec(m))) {
    let period = x[1]!;
    if (/^\d{1,2}$/.test(period)) period = `${new Date().getFullYear()}-${period.padStart(2, '0')}`;
    return { name: 'qldn.duyet_bang_luong', params: { period } };
  }
  // "nhập doanh số JP250056 99tr ..." — số tiền có thể kèm tr/triệu
  if ((x = /nh[ậa]p\s+doanh\s+s[ốo]\s+(JP\w+)\s+([\d.,]+)\s*(tr|tri[ệe]u|k|ngh[ìi]n)?/i.exec(m))) {
    let rev = Number(x[2]!.replace(/[.,]/g, ''));
    if (x[3] && /tr/i.test(x[3])) rev *= 1_000_000;
    if (x[3] && /k|ngh/i.test(x[3])) rev *= 1_000;
    return { name: 'qldn.nhap_doanh_so', params: { orderCode: x[1]!.toUpperCase(), revenue: rev } };
  }
  return null;
}
