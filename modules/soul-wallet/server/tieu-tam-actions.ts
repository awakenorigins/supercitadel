/**
 * SOUL-WALLET — Tiểu Tâm write-actions adapter cho host.
 *
 * Sinh mảng action def khớp TieuTamAction của host từ swWriteActions của module.
 * - requiredModule: 'soul-wallet' (gate mua module)
 * - permission: lấy thẳng từ tool.permission (đã đăng ký PERMISSION_REGISTRY)
 * - sensitive/securityLevel: lấy THẲNG từ tool def (module tự khai từng action —
 *   12 action đụng tiền lớp 2 sensitive; sw.rule.upsert lớp 1 không sensitive
 *   vì chỉ chạm metadata phân loại).
 *   Host tieu-tam/actions.ts đã có dry-run→confirm protocol: sensitive && !confirm
 *   → preview + audit dryrun; confirm:true → execute thật.
 * - parameters: object mở (module tự Zod-parse tại biên ⑦) → không double-validate
 * - execute: chạy trong transaction có SET LOCAL app.current_org_id (RLS-aware),
 *   ownerId = ctx.userId từ JWT — ví cá nhân theo CHỦ VÍ.
 */
import { sql } from 'drizzle-orm';
import { swWriteActions } from '../src/tools/index.js';
import type { SwCtx, EventBus } from '../src/types.js';

const noopBus: EventBus = { emit: async () => {} };

async function withOrgTx<T>(db: any, orgId: string, fn: (tx: any) => Promise<T>): Promise<T> {
  return db.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
    return fn(tx);
  });
}

/** Trả về action defs; host push thẳng vào mảng defs của tieu-tam/actions.ts. */
export function soulWalletTieuTamActions(): any[] {
  return swWriteActions.map((a) => ({
    name: a.name,
    description: a.description ?? a.name,
    requiredModule: 'soul-wallet',
    permission: a.permission,
    securityLevel: a.securityLevel,
    sensitive: a.sensitive,
    parameters: { type: 'object', properties: {}, additionalProperties: true },
    async execute(ctx: any, params: any) {
      const ownerId = ctx.userId;
      if (!ownerId) {
        throw new Error('soul-wallet: missing owner id (ctx.userId) — refusing action (fail-closed)');
      }
      const data = await withOrgTx(ctx.db, ctx.orgId, async (tx) => {
        const swCtx: SwCtx = { db: tx, orgId: ctx.orgId, ownerId, bus: noopBus } as SwCtx;
        return a.handler(swCtx, params ?? {});
      });
      await ctx.audit?.({ action: a.name, detail: params });
      const msg = (data as { message?: string })?.message ?? `Soul-Wallet: ${a.name} xong`;
      return { ok: true, action: a.name, module: 'soul-wallet', message: msg, data };
    },
  }));
}
