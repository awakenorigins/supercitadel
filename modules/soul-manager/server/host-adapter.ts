/**
 * SOUL-MANAGER — Host adapter cho SuperCitadel (Hono + postgres-js/Drizzle).
 *
 * Module lõi là framework-neutral (src/routes.ts trả về bản khai route,
 * src/tools trả về tool objects). File này BIND vào host:
 *  - buildSoulManagerRoutes: dựng Hono app từ createHrRoutes()
 *  - soulManagerTools: tool objects cho toolRegistry của Tiểu Tâm
 *  - mountSoulManager: actions cho tieu-tam/actions.ts
 *
 * RLS: mọi request/tool chạy trong 1 transaction đã `SET LOCAL app.current_org_id`
 * = RLS fail-closed của module có hiệu lực thật (defense-in-depth), đồng thời
 * services vẫn tự lọc theo ctx.orgId (isolation kép).
 */
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { sql } from 'drizzle-orm';
import { createHrRoutes, type HrRouteRequest } from '../src/routes.js';
import { hrReadTools, hrRecruitmentReadTools, hrWriteActions } from '../src/tools/index.js';
import type { HrCtx, EventBus } from '../src/types.js';

type AuthLike = { orgId: string; sub?: string; role?: string };
type AuditFn = (c: Context, e: { action: string; resource?: string; resourceId?: string; detail?: unknown }) => Promise<void>;

/** Bus host: phát event ra outbox nếu có, không thì no-op (không chặn nghiệp vụ). */
function makeBus(emit?: (topic: string, payload: Record<string, unknown>) => unknown): EventBus {
  return { emit: async (name, payload) => { try { await emit?.(name, payload); } catch { /* non-fatal */ } } };
}

/**
 * Chạy fn trong 1 transaction có SET LOCAL app.current_org_id (RLS-aware).
 * Trả về kết quả fn. postgres-js/Drizzle: db.transaction cấp tx handle.
 */
async function withOrgTx<T>(db: any, orgId: string, fn: (tx: any) => Promise<T>): Promise<T> {
  return db.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
    return fn(tx);
  });
}

export interface SoulManagerDeps {
  db: any;
  requireAuth: MiddlewareHandler;
  gate?: MiddlewareHandler;
  audit?: AuditFn;
  emit?: (topic: string, payload: Record<string, unknown>) => unknown;
}

const authOf = (c: any): AuthLike => c.get('auth') as AuthLike;

/** Dựng Hono app: strip tiền tố '/hr' của route nội bộ → mount phẳng dưới /api/v1/soul-manager. */
export function buildSoulManagerRoutes(deps: SoulManagerDeps): Hono {
  const app = new Hono();
  app.use('*', deps.requireAuth);
  if (deps.gate) app.use('*', deps.gate);
  const bus = makeBus(deps.emit);
  const routes = createHrRoutes();

  for (const def of routes) {
    // '/hr/employees/:code' -> '/employees/:code'
    const path = def.path.replace(/^\/hr/, '') || '/';
    const method = def.method.toLowerCase() as 'get' | 'post' | 'patch';
    app[method](path, async (c) => {
      const auth = authOf(c);
      const body = ['post', 'patch'].includes(method) ? await c.req.json().catch(() => undefined) : undefined;
      const req: HrRouteRequest = {
        params: c.req.param() as Record<string, string>,
        query: c.req.query() as Record<string, string | undefined>,
        body,
      };
      const data = await withOrgTx(deps.db, auth.orgId, async (tx) => {
        const ctx: HrCtx = { db: tx, orgId: auth.orgId, userId: auth.sub, bus };
        return def.handler(ctx, req);
      });
      if (deps.audit && def.method !== 'GET') {
        await deps.audit(c, { action: def.tool, detail: { path: def.path } });
      }
      return c.json(data as any, def.method === 'POST' ? 201 : 200);
    });
  }
  return app;
}

/** Tool objects cho toolRegistry (Tiểu Tâm đọc dữ liệu HR trực tiếp).
 *  Khớp ToolDef của host: { name, module, description, requiresPermission, handler(input, ctx) }. */
export function soulManagerTools(db: any, emit?: SoulManagerDeps['emit']) {
  const bus = makeBus(emit);
  const readOnly = [...hrReadTools, ...hrRecruitmentReadTools];
  return readOnly.map((t) => ({
    name: t.name,
    module: 'soul-manager',
    description: (t as any).description ?? t.name,
    requiresPermission: t.permission,
    async handler(input: any, ctx: { orgId: string }) {
      return withOrgTx(db, ctx.orgId, async (tx) => {
        const hrCtx: HrCtx = { db: tx, orgId: ctx.orgId, bus };
        return t.handler(hrCtx, input);
      });
    },
  }));
}

/** Actions cho tieu-tam/actions.ts (write actions Tiểu Tâm gọi được). */
export function mountSoulManager(deps: { db: any; emit?: SoulManagerDeps['emit'] }) {
  const bus = makeBus(deps.emit);
  const actions = hrWriteActions.map((a) => ({
    id: a.name,
    description: (a as any).description ?? a.name,
    parameters: {} as Record<string, unknown>,
  }));
  return {
    actions,
    async invokeAction(ctx: { orgId: string; actor?: string; source?: string }, id: string, params: unknown) {
      const tool = hrWriteActions.find((a) => a.name === id);
      if (!tool) throw new Error(`Soul-Manager: không có action ${id}`);
      const data = await withOrgTx(deps.db, ctx.orgId, async (tx) => {
        const hrCtx: HrCtx = { db: tx, orgId: ctx.orgId, userId: ctx.actor, bus };
        return tool.handler(hrCtx, params);
      });
      return { message: `Soul-Manager: ${id} xong`, data: data as any };
    },
  };
}
