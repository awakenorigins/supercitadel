/**
 * SOUL-MANAGER — Tiểu Tâm write-actions adapter cho host.
 *
 * Sinh mảng action def khớp TieuTamAction của host từ hrWriteActions của module.
 * - requiredModule: 'soul-manager' (gate mua module)
 * - permission: lấy thẳng từ tool.permission (đã đăng ký trong PERMISSION_REGISTRY)
 * - parameters: object mở (module tự Zod-parse tại biên ⑦) → không double-validate
 * - execute: chạy trong transaction có SET LOCAL app.current_org_id (RLS-aware)
 *
 * securityLevel/sensitive: payroll.run/approve = lớp 2 (nhạy cảm tiền lương).
 */
import { sql } from 'drizzle-orm';
import { hrWriteActions, getHrTool } from '../src/tools/index.js';
import type { HrCtx, EventBus } from '../src/types.js';

const noopBus: EventBus = { emit: () => {} };

const SENSITIVE = new Set(['hr.payroll.run', 'hr.payroll.approve']);

async function withOrgTx<T>(db: any, orgId: string, fn: (tx: any) => Promise<T>): Promise<T> {
  return db.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
    return fn(tx);
  });
}

/** V11C: xuất Excel bảng lương — verify kỳ tồn tại rồi trả downloadUrl cho UI render nút tải. */
function payrollExportAction(): any {
  return {
    name: 'hr.payroll.export_excel',
    description: 'XUẤT EXCEL BẢNG LƯƠNG: tạo link tải file .xlsx bảng lương kỳ (year, month). Dùng khi user muốn "xuất bảng lương excel", "tải file lương". Kỳ phải đã chạy lương (hr.payroll.run) trước.',
    requiredModule: 'soul-manager',
    permission: 'hr.payroll.read',
    securityLevel: 1,
    sensitive: false,
    parameters: { type: 'object', properties: { year: { type: 'number', description: 'Năm, vd 2026' }, month: { type: 'number', description: 'Tháng 1-12' } }, required: ['year', 'month'] },
    async execute(ctx: any, p: any) {
      const year = Number(p?.year), month = Number(p?.month);
      const tool = getHrTool('hr.payroll.payslip')!;
      const data: any = await withOrgTx(ctx.db, ctx.orgId, async (tx) => {
        const hrCtx: HrCtx = { db: tx, orgId: ctx.orgId, userId: ctx.userId, bus: noopBus };
        return tool.handler(hrCtx, { year, month }); // nổ PERIOD_NOT_FOUND nếu chưa chạy lương → message rõ ràng
      });
      await ctx.audit?.({ action: 'hr.payroll.export_excel', detail: { year, month } });
      return {
        ok: true, action: 'hr.payroll.export_excel', module: 'soul-manager',
        message: `Bảng lương kỳ ${month}/${year} (${data.employees ?? 0} NV) đã sẵn sàng — bấm nút tải bên dưới để lấy file Excel`,
        data: {
          downloadUrl: `/api/v1/soul-manager/payroll/export.xlsx?year=${year}&month=${month}`,
          filename: `bang-luong-${month}-${year}.xlsx`,
          employees: data.employees, total_net: data.total_net,
        },
      };
    },
  };
}

/** Trả về action defs; host push thẳng vào mảng defs của tieu-tam/actions.ts. */
export function soulManagerTieuTamActions(): any[] {
  const extra = [payrollExportAction()];
  return [...extra, ...hrWriteActions.map((a) => {
    const sensitive = SENSITIVE.has(a.name);
    return {
      name: a.name,
      description: (a as any).description ?? a.name,
      requiredModule: 'soul-manager',
      permission: a.permission,
      securityLevel: sensitive ? 2 : 1,
      sensitive,
      parameters: { type: 'object', properties: {}, additionalProperties: true },
      async execute(ctx: any, params: any) {
        const data = await withOrgTx(ctx.db, ctx.orgId, async (tx) => {
          const hrCtx: HrCtx = { db: tx, orgId: ctx.orgId, userId: ctx.userId, bus: noopBus };
          return a.handler(hrCtx, params ?? {});
        });
        await ctx.audit?.({ action: a.name, detail: params });
        return { ok: true, action: a.name, module: 'soul-manager', message: `Soul-Manager: ${a.name} xong`, data };
      },
    };
  })];
}
