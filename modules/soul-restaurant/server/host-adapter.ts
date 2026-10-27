/**
 * SOUL-RESTAURANT — Host adapter cho SuperCitadel (Hono + postgres-js/Drizzle).
 *
 * Module lõi framework-neutral (createRestoRoutes(app) gắn route lên router,
 * đọc ctx qua c.get('restoCtx')). File này BIND vào host:
 *  - buildSoulRestaurantRoutes: Hono sub-app, middleware gắn restoCtx (db+orgId+bus)
 *    trong 1 transaction đã SET LOCAL app.current_org_id (RLS-aware defense-in-depth).
 *  - soulRestaurantTools: read tools cho toolRegistry Tiểu Tâm.
 *
 * Isolation THẬT = app-level: mọi service lọc theo ctx.orgId; adapter chỉ dùng
 * auth.orgId từ JWT (không nhận org từ client). (Host role citadel BYPASSRLS →
 * RLS chỉ là lớp phòng thủ bổ sung, giống các module host khác.)
 */
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { sql } from 'drizzle-orm';
import { createRestoRoutes } from '../src/routes.js';
import { restoReadTools } from '../src/tools/index.js';
import type { RestoCtx, EventBus } from '../src/types.js';

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

export interface SoulRestaurantDeps {
  db: any;
  requireAuth: MiddlewareHandler;
  gate?: MiddlewareHandler;
  audit?: AuditFn;
  /** Bus ngoài transaction (fallback, ví dụ pub/sub trực tiếp) */
  emit?: (topic: string, payload: Record<string, unknown>) => unknown;
  /** KHUYẾN NGHỊ: transactional outbox của host — event ghi TRONG cùng tx
   *  nghiệp vụ (atomic: rollback đơn = rollback event). WIRING truyền:
   *  (tx, topic, payload) => emitEvent(tx, { orgId: payload.org_id, topic, payload }) */
  emitTx?: (tx: any, topic: string, payload: Record<string, unknown>) => unknown;
}

/** Bus theo-request: ưu tiên outbox trong tx; fallback emit ngoài tx; cuối cùng noop */
function makeBusFor(tx: any, deps: Pick<SoulRestaurantDeps, 'emit' | 'emitTx'>): EventBus {
  if (deps.emitTx) return { emit: async (n, p) => { try { await deps.emitTx!(tx, n, p); } catch { /* non-fatal */ } } };
  if (deps.emit) return { emit: async (n, p) => { try { await deps.emit!(n, p); } catch { /* non-fatal */ } } };
  return { emit: async () => {} };
}

const authOf = (c: any): AuthLike => c.get('auth') as AuthLike;

/**
 * Dựng Hono app. Route nội bộ module bắt đầu bằng '/restaurant' → strip để mount
 * phẳng dưới /api/v1/soul-restaurant. Middleware bọc mỗi request trong org-tx,
 * gắn restoCtx (db=tx, orgId, bus) để module đọc qua c.get('restoCtx').
 */
export function buildSoulRestaurantRoutes(deps: SoulRestaurantDeps): Hono {
  const app = new Hono();
  app.use('*', deps.requireAuth);
  if (deps.gate) app.use('*', deps.gate);

  // Router shim: nhận path '/restaurant/...' của module, đăng ký lên Hono với
  // path đã strip '/restaurant', và bọc handler trong org-tx + restoCtx.
  const shim = {
    _register(method: 'get' | 'post', path: string, handler: (c: any) => Promise<Response>) {
      const p = path.replace(/^\/restaurant/, '') || '/';
      (app as any)[method](p, async (c: any) => {
        const auth = authOf(c);
        return withOrgTx(deps.db, auth.orgId, async (tx) => {
          const bus = makeBusFor(tx, deps);
          const ctx: RestoCtx = { db: tx, orgId: auth.orgId, userId: auth.sub, bus } as RestoCtx;
          // gắn restoCtx cho module đọc
          c.set('restoCtx', ctx);
          const res = await handler(c);
          if (deps.audit && method === 'post') await deps.audit(c, { action: 'soul-restaurant.route', detail: { path } });
          return res;
        });
      });
    },
    post(path: string, handler: (c: any) => Promise<Response>) { this._register('post', path, handler); },
    get(path: string, handler: (c: any) => Promise<Response>) { this._register('get', path, handler); },
  };

  createRestoRoutes(shim as any);
  return app;
}

/** Read tools cho toolRegistry (Tiểu Tâm tra cứu nhà hàng). ToolDef host shape. */
export function soulRestaurantTools(db: any, emit?: SoulRestaurantDeps['emit']) {
  const bus = makeBus(emit);
  return restoReadTools.map((t) => ({
    name: t.name,
    module: 'soul-restaurant',
    description: (t as any).description ?? t.name,
    requiresPermission: t.permission,
    async handler(input: any, ctx: { orgId: string }) {
      return withOrgTx(db, ctx.orgId, async (tx) => {
        const restoCtx: RestoCtx = { db: tx, orgId: ctx.orgId, bus } as RestoCtx;
        return t.handler(restoCtx, input);
      });
    },
  }));
}
