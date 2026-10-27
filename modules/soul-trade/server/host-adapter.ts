/**
 * SOUL-TRADE — host adapter for SuperCitadel's api service (Hono).
 * Mirrors soul-manager/soul-inventory: export a builder returning a Hono app the loader
 * mounts. Binds framework-neutral routes, enforces auth + module gate, and runs each
 * request in an org-scoped transaction (fail-closed RLS) via server/runtime.
 *
 * Wire in services/api/src/modules/loader.ts:
 *   import { buildSoulTradeRoutes } from '@citadel/module-soul-trade/server/host-adapter.js';
 *   'soul-trade': (d) => buildSoulTradeRoutes({ requireAuth: d.requireAuth, gate: d.requireModule(d.db, 'soul-trade') }),
 */
import { Hono, type MiddlewareHandler } from 'hono';
import { createTradeRoutes } from '../src/routes.js';
import { withOrgCtx } from './runtime.js';
export { withOrgCtx, startAutomatoWorker } from './runtime.js';

export interface SoulTradeDeps { requireAuth: MiddlewareHandler; gate?: MiddlewareHandler; databaseUrl?: string; }

export function buildSoulTradeRoutes(deps: SoulTradeDeps): Hono {
  const app = new Hono();
  const mids: MiddlewareHandler[] = [deps.requireAuth, ...(deps.gate ? [deps.gate] : [])];
  for (const r of createTradeRoutes()) {
    app.on(r.method, [r.path], ...mids, async (c) => {
      const auth = (c as any).get('auth') as { orgId: string; sub?: string } | undefined;
      if (!auth?.orgId) return c.json({ error: 'unauthenticated' }, 401);
      const body = r.method === 'POST' ? await c.req.json().catch(() => ({})) : undefined;
      const req = { params: c.req.param() as Record<string, string>, query: Object.fromEntries(new URL(c.req.url).searchParams.entries()), body };
      try {
        const out = await withOrgCtx(auth.orgId, auth.sub, (ctx) => r.handler(ctx, req), deps.databaseUrl);
        return c.json((out ?? {}) as any);
      } catch (e: any) {
        return c.json({ error: String(e?.message ?? e) }, 400);
      }
    });
  }
  return app;
}
