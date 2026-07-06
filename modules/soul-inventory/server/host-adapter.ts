/**
 * SOUL-INVENTORY — Host adapter cho SuperCitadel (Hono + postgres-js/Drizzle).
 *
 * Module lõi framework-neutral (createKhoRoutes(app) gắn route lên router,
 * đọc ctx qua c.get('khoCtx')). File này BIND vào host:
 *  - buildSoulInventoryRoutes: Hono sub-app, middleware gắn khoCtx (db+orgId+bus)
 *    trong 1 transaction đã SET LOCAL app.current_org_id (RLS-aware defense-in-depth).
 *  - soulInventoryTools: read tools cho toolRegistry Tiểu Tâm.
 *
 * Isolation THẬT = app-level: mọi service lọc theo ctx.orgId; adapter chỉ dùng
 * auth.orgId từ JWT (không nhận org từ client). (Host role citadel BYPASSRLS →
 * RLS chỉ là lớp phòng thủ bổ sung, giống các module host khác.)
 */
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { sql } from 'drizzle-orm';
import { createKhoRoutes, createSoulInventoryExtraRoutes, createSoulInventoryV2Routes, createSoulInventoryAutomationRoutes } from '../src/routes.js';
import { khoReadTools } from '../src/tools/index.js';
import { runScheduledTasks } from '../src/services/automation.service.js';
import type { KhoCtx, EventBus } from '../src/types.js';

type AuthLike = { orgId: string; sub?: string; role?: string };
type AuditFn = (c: Context, e: { action: string; resource?: string; resourceId?: string; detail?: unknown }) => Promise<void>;

function makeBus(emit?: (topic: string, payload: Record<string, unknown>) => unknown): EventBus {
  return { emit: async (name, payload) => { try { await emit?.(name, payload); } catch { /* non-fatal */ } } };
}

async function withOrgTx<T>(db: any, orgId: string, fn: (tx: any) => Promise<T>): Promise<T> {
  return db.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
    return fn(tx);
  });
}

export interface SoulInventoryDeps {
  db: any;
  requireAuth: MiddlewareHandler;
  gate?: MiddlewareHandler;
  audit?: AuditFn;
  emit?: (topic: string, payload: Record<string, unknown>) => unknown;
}

const authOf = (c: any): AuthLike => c.get('auth') as AuthLike;

/**
 * Dựng Hono app. Route nội bộ module bắt đầu bằng '/inventory' → strip để mount
 * phẳng dưới /api/v1/soul-inventory. Middleware bọc mỗi request trong org-tx,
 * gắn khoCtx (db=tx, orgId, bus) để module đọc qua c.get('khoCtx').
 */
export function buildSoulInventoryRoutes(deps: SoulInventoryDeps): Hono {
  const app = new Hono();
  app.use('*', deps.requireAuth);
  if (deps.gate) app.use('*', deps.gate);
  const bus = makeBus(deps.emit);

  // Router shim: nhận path '/inventory/...' của module, đăng ký lên Hono với
  // path đã strip '/inventory', và bọc handler trong org-tx + khoCtx.
  const shim = {
    _register(method: 'get' | 'post', path: string, handler: (c: any) => Promise<Response>) {
      const p = path.replace(/^\/inventory/, '') || '/';
      (app as any)[method](p, async (c: any) => {
        const auth = authOf(c);
        return withOrgTx(deps.db, auth.orgId, async (tx) => {
          const ctx: KhoCtx = { db: tx, orgId: auth.orgId, userId: auth.sub, bus } as KhoCtx;
          // gắn khoCtx cho module đọc
          c.set('khoCtx', ctx);
          const res = await handler(c);
          if (deps.audit && method === 'post') await deps.audit(c, { action: 'soul-inventory.route', detail: { path } });
          return res;
        });
      });
    },
    post(path: string, handler: (c: any) => Promise<Response>) { this._register('post', path, handler); },
    get(path: string, handler: (c: any) => Promise<Response>) { this._register('get', path, handler); },
  };

  createKhoRoutes(shim as any);
  createSoulInventoryExtraRoutes(shim as any);
  createSoulInventoryV2Routes(shim as any);
  createSoulInventoryAutomationRoutes(shim as any);
  return app;
}

/** Read tools cho toolRegistry (Tiểu Tâm tra cứu kho). ToolDef host shape. */
export function soulInventoryTools(db: any, emit?: SoulInventoryDeps['emit']) {
  const bus = makeBus(emit);
  return khoReadTools.map((t) => ({
    name: t.name,
    module: 'soul-inventory',
    description: (t as any).description ?? t.name,
    requiresPermission: t.permission,
    async handler(input: any, ctx: { orgId: string }) {
      return withOrgTx(db, ctx.orgId, async (tx) => {
        const khoCtx: KhoCtx = { db: tx, orgId: ctx.orgId, bus } as KhoCtx;
        return t.handler(khoCtx, input);
      });
    },
  }));
}

/**
 * Cron học theo pattern outbox host (setInterval.unref): mỗi đêm ~02:00 chạy
 * runScheduledTasks CHO TỪNG org đang active module (host điều phối per-org,
 * module KHÔNG tự spawn cron — deep-audit điểm ③). Non-fatal: lỗi 1 org không
 * chặn org khác. listActiveOrgIds do host cung cấp (đọc org_modules).
 */
export function startSoulInventoryNightlyAutomation(
  db: any,
  listActiveOrgIds: () => Promise<string[]>,
  opts?: { hour?: number; emit?: SoulInventoryDeps['emit'] },
): { stop: () => void } {
  const hour = opts?.hour ?? 2;
  const bus = makeBus(opts?.emit);
  let lastRunDay = '';
  const tick = async () => {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    if (now.getHours() !== hour || lastRunDay === day) return;
    lastRunDay = day;
    let orgIds: string[] = [];
    try { orgIds = await listActiveOrgIds(); } catch (e) { console.error('[soul-inventory][cron] không lấy được org active', e); return; }
    for (const orgId of orgIds) {
      try {
        const r = await withOrgTx(db, orgId, async (tx) => {
          const ctx: KhoCtx = { db: tx, orgId, bus } as KhoCtx;
          return runScheduledTasks(ctx);
        });
        console.log(`[soul-inventory][cron] org ${orgId}: forecast ${r.forecast_items}, replenish ${r.replenish_alerts}, dead ${r.dead_stock_alerts}`);
      } catch (e) {
        console.error(`[soul-inventory][cron] org ${orgId} lỗi`, e);
      }
    }
  };
  const timer = setInterval(() => { tick().catch((e) => console.error('[soul-inventory][cron] tick lỗi', e)); }, 10 * 60 * 1000);
  (timer as any).unref?.();
  return { stop: () => clearInterval(timer) };
}
