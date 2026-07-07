/**
 * SOUL-RESTAURANT — Tiểu Tâm write-actions adapter cho host.
 *
 * Sinh mảng action def khớp TieuTamAction của host từ restoWriteActions của module.
 * - requiredModule: 'soul-restaurant' (gate mua module)
 * - permission: lấy thẳng từ tool.permission (đã đăng ký PERMISSION_REGISTRY)
 * - sensitive/securityLevel: lấy THẲNG từ tool def (module tự khai từng action —
 *   4 action lớp 2: bill.pay / bill.void / order.cancel / settings.update;
 *   sensitive lớp 1: cancel_item / merge / discount / bill.create).
 *   Host tieu-tam/actions.ts đã có dry-run→confirm protocol: sensitive && !confirm
 *   → preview + audit dryrun; confirm:true → execute thật (đúng contract
 *   src/contract.ts#executeAction — cùng semantics, host là executor).
 * - parameters: object mở (module tự Zod-parse tại biên ⑦) → không double-validate
 * - execute: chạy trong transaction có SET LOCAL app.current_org_id (RLS-aware)
 *
 * QUAN TRỌNG (khác soul-inventory): truyền emitTx (transactional outbox của
 * host) vào soulRestaurantTieuTamActions(emitTx) — event ghi TRONG cùng
 * transaction nghiệp vụ (atomic), để resto.stock.deduct_requested tới được
 * Soul-Inventory trừ kho. Không truyền → bus noop: thao tác vẫn đúng nhưng
 * KHÔNG tự trừ kho.
 *   emitTx = (tx, topic, payload) =>
 *     emitEvent(tx, { orgId: (payload as any).org_id, topic, payload })  // @citadel/core
 */
import { sql } from 'drizzle-orm';
import { restoWriteActions } from '../src/tools/index.js';
import type { RestoCtx, EventBus } from '../src/types.js';

const noopBus: EventBus = { emit: async () => {} };

/** Bus theo-transaction: emitTx = transactional outbox của host (khuyến nghị) */
function makeBusFor(
  tx: any,
  emitTx?: (tx: any, topic: string, payload: Record<string, unknown>) => unknown,
): EventBus {
  if (!emitTx) return noopBus;
  return { emit: async (name, payload) => { try { await emitTx(tx, name, payload); } catch { /* non-fatal */ } } };
}

async function withOrgTx<T>(db: any, orgId: string, fn: (tx: any) => Promise<T>): Promise<T> {
  return db.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
    return fn(tx);
  });
}

/** Trả về action defs; host push thẳng vào mảng defs của tieu-tam/actions.ts. */
export function soulRestaurantTieuTamActions(
  emitTx?: (tx: any, topic: string, payload: Record<string, unknown>) => unknown,
): any[] {
  return restoWriteActions.map((a) => ({
    name: a.name,
    description: a.description ?? a.name,
    requiredModule: 'soul-restaurant',
    permission: a.permission,
    securityLevel: a.securityLevel,
    sensitive: a.sensitive,
    parameters: { type: 'object', properties: {}, additionalProperties: true },
    async execute(ctx: any, params: any) {
      const data = await withOrgTx(ctx.db, ctx.orgId, async (tx) => {
        const bus = makeBusFor(tx, emitTx);
        const restoCtx: RestoCtx = { db: tx, orgId: ctx.orgId, userId: ctx.userId, bus } as RestoCtx;
        return a.handler(restoCtx, params ?? {});
      });
      await ctx.audit?.({ action: a.name, detail: params });
      const msg = (data as { message?: string })?.message ?? `Soul-Restaurant: ${a.name} xong`;
      return { ok: true, action: a.name, module: 'soul-restaurant', message: msg, data };
    },
  }));
}
