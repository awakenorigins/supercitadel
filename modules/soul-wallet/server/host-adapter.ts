/**
 * SOUL-WALLET — Host adapter cho SuperCitadel (Hono + postgres-js/Drizzle).
 *
 * Module lõi framework-neutral (createSoulWalletRoutes(router) gắn route,
 * đọc ctx qua c.get('swCtx')). File này BIND vào host:
 *  - buildSoulWalletRoutes: Hono sub-app, middleware gắn swCtx (db+orgId+ownerId+bus)
 *    trong 1 transaction đã SET LOCAL app.current_org_id (RLS-aware defense-in-depth).
 *  - soulWalletTools: read tools cho toolRegistry Tiểu Tâm.
 *  - runSoulWalletScheduledAll + startSoulWalletNightlyAutomation: việc đêm
 *    per (org, owner) — ví CÁ NHÂN nên cron chạy theo CHỦ VÍ, không chỉ org.
 *
 * Isolation THẬT = app-level: mọi service lọc theo (ctx.orgId, ctx.ownerId);
 * adapter chỉ lấy từ JWT (auth.orgId, auth.sub) — client không có quyền khai.
 * (Host role citadel BYPASSRLS → RLS chỉ là lớp phòng thủ bổ sung.)
 */
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { sql } from 'drizzle-orm';
import { createSoulWalletRoutes } from '../src/routes.js';
import { swReadTools } from '../src/tools/index.js';
import { runScheduledTasks } from '../src/services/scheduled.service.js';
import type { SwCtx, EventBus } from '../src/types.js';

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

export interface SoulWalletDeps {
  db: any;
  requireAuth: MiddlewareHandler;
  gate?: MiddlewareHandler;
  audit?: AuditFn;
  emit?: (topic: string, payload: Record<string, unknown>) => unknown;
}

const authOf = (c: any): AuthLike => c.get('auth') as AuthLike;

/**
 * Dựng Hono app. Route nội bộ module bắt đầu bằng '/wallet' → strip để mount
 * phẳng dưới /api/v1/soul-wallet. Middleware bọc mỗi request trong org-tx,
 * gắn swCtx (db=tx, orgId, ownerId=auth.sub, bus) để module đọc qua c.get('swCtx').
 */
export function buildSoulWalletRoutes(deps: SoulWalletDeps): Hono {
  const app = new Hono();
  app.use('*', deps.requireAuth);
  if (deps.gate) app.use('*', deps.gate);
  const bus = makeBus(deps.emit);

  // Router shim: nhận path '/wallet/...' của module, đăng ký lên Hono với
  // path đã strip '/wallet', và bọc handler trong org-tx + swCtx.
  const shim = {
    _register(method: 'get' | 'post', path: string, handler: (c: any) => Promise<Response>) {
      const p = path.replace(/^\/wallet/, '') || '/';
      (app as any)[method](p, async (c: any) => {
        const auth = authOf(c);
        const ownerId = auth.sub;
        if (!ownerId) {
          throw new Error('soul-wallet: missing owner id (auth.sub) — refusing request (fail-closed)');
        }
        return withOrgTx(deps.db, auth.orgId, async (tx) => {
          const ctx: SwCtx = { db: tx, orgId: auth.orgId, ownerId, bus } as SwCtx;
          c.set('swCtx', ctx);
          const res = await handler(c);
          if (deps.audit && method === 'post') await deps.audit(c, { action: 'soul-wallet.route', detail: { path } });
          return res;
        });
      });
    },
    post(path: string, handler: (c: any) => Promise<Response>) { this._register('post', path, handler); },
    get(path: string, handler: (c: any) => Promise<Response>) { this._register('get', path, handler); },
  };

  createSoulWalletRoutes(shim as any);
  return app;
}

/** Read tools cho toolRegistry (Tiểu Tâm tra cứu ví). ToolDef host shape. */
export function soulWalletTools(db: any, emit?: SoulWalletDeps['emit']) {
  const bus = makeBus(emit);
  return swReadTools.map((t) => ({
    name: t.name,
    module: 'soul-wallet',
    description: t.description ?? t.name,
    requiresPermission: t.permission,
    async handler(input: any, ctx: { orgId: string; userId?: string }) {
      return withOrgTx(db, ctx.orgId, async (tx) => {
        const swCtx: SwCtx = { db: tx, orgId: ctx.orgId, ownerId: ctx.userId ?? '', bus } as SwCtx;
        return t.handler(swCtx, input);
      });
    },
  }));
}

/**
 * Việc đêm cho MỌI chủ ví: quét distinct (org_id, owner_user_id) từ sw_accounts
 * — module tự biết chủ ví của mình, không cần host giữ danh sách riêng.
 * Non-fatal: lỗi một ví không chặn ví khác.
 */
export async function runSoulWalletScheduledAll(db: any, emit?: SoulWalletDeps['emit']) {
  const bus = makeBus(emit);
  const res: any = await db.execute(sql`SELECT DISTINCT org_id, owner_user_id FROM sw_accounts`);
  const owners: Array<{ org_id: string; owner_user_id: string }> = res?.rows ?? res ?? [];
  const results: Array<{ org_id: string; owner: string; ok: boolean; error?: string }> = [];
  for (const o of owners) {
    try {
      await withOrgTx(db, o.org_id, async (tx) => {
        const ctx: SwCtx = { db: tx, orgId: o.org_id, ownerId: o.owner_user_id, bus } as SwCtx;
        await runScheduledTasks(ctx);
      });
      results.push({ org_id: o.org_id, owner: o.owner_user_id, ok: true });
    } catch (e) {
      results.push({ org_id: o.org_id, owner: o.owner_user_id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}

/**
 * Cron học theo pattern outbox host (setInterval.unref): mỗi đêm ~02:00 chạy
 * runSoulWalletScheduledAll. Module KHÔNG tự spawn cron nếu host không gọi hàm này.
 */
export function startSoulWalletNightlyAutomation(db: any, opts?: { hour?: number; emit?: SoulWalletDeps['emit'] }) {
  const hour = opts?.hour ?? 2;
  let lastRunDay = '';
  const timer = setInterval(async () => {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    if (now.getHours() === hour && lastRunDay !== day) {
      lastRunDay = day;
      try { await runSoulWalletScheduledAll(db, opts?.emit); } catch { /* non-fatal */ }
    }
  }, 10 * 60 * 1000);
  (timer as { unref?: () => void }).unref?.();
  return timer;
}
