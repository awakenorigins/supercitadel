/**
 * SOUL-INVENTORY — Tiểu Tâm write-actions adapter cho host.
 *
 * Sinh mảng action def khớp TieuTamAction của host từ khoWriteActions của module.
 * - requiredModule: 'soul-inventory' (gate mua module)
 * - permission: lấy thẳng từ tool.permission (đã đăng ký PERMISSION_REGISTRY)
 * - sensitive/securityLevel: lấy THẲNG từ tool def (module tự khai từng action —
 *   7 action lớp 2: receive/issue/transfer/stocktake.execute/assembly.execute/
 *   scrap/landed_cost.apply; reservation.manage sensitive lớp 1).
 *   Host tieu-tam/actions.ts đã có dry-run→confirm protocol: sensitive && !confirm
 *   → preview + audit dryrun; confirm:true → execute thật (đúng contract
 *   src/contract.ts#executeAction — cùng semantics, host là executor).
 * - parameters: object mở (module tự Zod-parse tại biên ⑦) → không double-validate
 * - execute: chạy trong transaction có SET LOCAL app.current_org_id (RLS-aware)
 */
import { sql } from 'drizzle-orm';
import { khoWriteActions } from '../src/tools/index.js';
import type { KhoCtx, EventBus } from '../src/types.js';

const noopBus: EventBus = { emit: async () => {} };

async function withOrgTx<T>(db: any, orgId: string, fn: (tx: any) => Promise<T>): Promise<T> {
  return db.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
    return fn(tx);
  });
}

/** Trả về action defs; host push thẳng vào mảng defs của tieu-tam/actions.ts. */
export function soulInventoryTieuTamActions(): any[] {
  return khoWriteActions.map((a) => ({
    name: a.name,
    description: a.description ?? a.name,
    requiredModule: 'soul-inventory',
    permission: a.permission,
    securityLevel: a.securityLevel,
    sensitive: a.sensitive,
    parameters: { type: 'object', properties: {}, additionalProperties: true },
    async execute(ctx: any, params: any) {
      const data = await withOrgTx(ctx.db, ctx.orgId, async (tx) => {
        const khoCtx: KhoCtx = { db: tx, orgId: ctx.orgId, userId: ctx.userId, bus: noopBus } as KhoCtx;
        return a.handler(khoCtx, params ?? {});
      });
      await ctx.audit?.({ action: a.name, detail: params });
      const msg = (data as { message?: string })?.message ?? `Soul-Inventory: ${a.name} xong`;
      return { ok: true, action: a.name, module: 'soul-inventory', message: msg, data };
    },
  }));
}
