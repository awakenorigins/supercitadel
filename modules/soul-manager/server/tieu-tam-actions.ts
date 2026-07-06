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
import { hrWriteActions } from '../src/tools/index.js';
import type { HrCtx, EventBus } from '../src/types.js';

const noopBus: EventBus = { emit: () => {} };

const SENSITIVE = new Set(['hr.payroll.run', 'hr.payroll.approve']);

async function withOrgTx<T>(db: any, orgId: string, fn: (tx: any) => Promise<T>): Promise<T> {
  return db.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
    return fn(tx);
  });
}

/** Trả về action defs; host push thẳng vào mảng defs của tieu-tam/actions.ts. */
export function soulManagerTieuTamActions(): any[] {
  return hrWriteActions.map((a) => {
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
  });
}
