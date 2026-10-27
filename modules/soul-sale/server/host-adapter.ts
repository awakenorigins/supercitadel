/** SOUL-SALE 1A — server/host-adapter.ts: điểm cắm duy nhất cho host SuperCitadel.
 *  Host wiring: routes → /api/v1/soul-sale; tools/actions → Tiểu Tâm registry;
 *  eventHandlers → bus subscribe; runScheduledTasks → cron đêm per-org. */
import { sql } from 'drizzle-orm';
import { ssInboxEvents } from '../src/schema.js';
import type { Db, Ctx } from '../src/contract.js';
import { runScheduledTasks as ssRunScheduledTasks } from '../src/services/automation.js';
export { buildSoulSaleRoutes, type SoulSaleRouteDeps } from './routes.js';
export { soulSaleTools, type HostToolDef, type HostToolCtx } from './tools.js';
export { soulSaleTieuTamActions, type TieuTamAction, type TieuTamActionCtx } from './tieu-tam-actions.js';
export { runScheduledTasks, type ScheduledRunResult } from '../src/services/automation.js';
export { executeAction } from '../src/contract.js';
export type { Ctx, HostJwtPayload, HostAuditSink, DryRunPreview } from '../src/contract.js';

export const SOUL_SALE_MODULE_ID = 'soul-sale';
export const SOUL_SALE_SUBSCRIBES = ['accounting.invoice.created', 'accounting.payment.created', 'kho.stock.low'] as const;

export interface InboundEvent { orgId: string; topic: string; payload: Record<string, unknown> }

/** Cron dem per-org: host dieu phoi, module khong tu spawn. Chay trong withOrg tx (RLS-aware).
 *  Kiem moi 10 phut, chi chay 1 lan/ngay vao gio hour (mac dinh 2h sang). */
export function startSoulSaleNightlyAutomation(
  db: any,
  listActiveOrgIds: () => Promise<string[]>,
  opts?: { hour?: number; userId?: string },
): { stop: () => void } {
  const hour = opts?.hour ?? 2;
  let lastRunDay = '';
  const tick = async () => {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    if (now.getHours() !== hour || lastRunDay === day) return;
    lastRunDay = day;
    let orgIds: string[] = [];
    try { orgIds = await listActiveOrgIds(); } catch (e) { console.error('[soul-sale][cron] khong lay duoc org active', e); return; }
    for (const orgId of orgIds) {
      try {
        const r = await (db as any).transaction(async (tx: any) => {
          await tx.execute(sql`select set_config('app.current_org_id', ${orgId}, true)`);
          const ctx: Ctx = { orgId, userId: opts?.userId ?? 'system' };
          return ssRunScheduledTasks(tx as Db, ctx);
        });
        console.log(`[soul-sale][cron] org ${orgId}: ${JSON.stringify(r).slice(0, 200)}`);
      } catch (e) {
        console.error(`[soul-sale][cron] org ${orgId} loi`, e);
      }
    }
  };
  const timer = setInterval(() => { tick().catch((e) => console.error('[soul-sale][cron] tick loi', e)); }, 10 * 60 * 1000);
  (timer as any).unref?.();
  return { stop: () => clearInterval(timer) };
}

/** Inbox pattern: mọi sự kiện subscribe ghi vào ss_inbox_events (org-scoped) để nghiệp vụ/AI đọc lại.
 *  V1 trung thực: KHÔNG tự sinh bút toán chéo module — chỉ ghi nhận + đánh dấu liên kết nếu payload trỏ về đơn Soul-Sale. */
export const soulSaleEventHandlers: Record<string, (deps: { db: Db }, evt: InboundEvent) => Promise<void>> =
  Object.fromEntries(SOUL_SALE_SUBSCRIBES.map((topic) => [topic, async ({ db }: { db: Db }, evt: InboundEvent) => {
    const linked = topic === 'accounting.payment.created' && typeof evt.payload?.soulsale_order_id === 'string';
    await db.insert(ssInboxEvents).values({
      orgId: evt.orgId, topic, payload: evt.payload ?? {}, processed: linked,
    });
  }]));
