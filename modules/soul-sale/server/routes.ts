/** SOUL-SALE 1A — server/routes.ts: Hono builder — host inject db/auth/gate/audit, module không tự dựng hạ tầng.
 *  RLS: mọi truy vấn chạy qua withOrg() → transaction đã SET LOCAL app.current_org_id = orgId.
 *  Vì migrations/0001_rls.sql bật FORCE ROW LEVEL SECURITY, đây là bắt buộc để RLS không fail-closed;
 *  đồng thời services vẫn tự lọc theo ctx.orgId (isolation kép defense-in-depth). */
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { ZodError } from 'zod';
import { sql } from 'drizzle-orm';
import type { Db, Ctx, HostAuditSink, HostJwtPayload } from '../src/contract.js';
import { executeAction } from '../src/contract.js';
import { SsError } from '../src/lib/util.js';
import { readTools } from '../src/registry/reads.js';
import { writeActions } from '../src/registry/writes.js';
import * as M from '../src/services/master.service.js';
import * as C from '../src/services/crm.service.js';
import * as S from '../src/services/sales.service.js';
import * as F from '../src/services/finance.service.js';
import * as SP from '../src/services/splitter.service.js';
import * as I from '../src/services/intel.service.js';
import { runScheduledTasks } from '../src/services/automation.js';

export interface SoulSaleRouteDeps {
  db: Db;
  /** middleware của host: xác thực JWT, set c.set('auth', HostJwtPayload) */
  requireAuth: MiddlewareHandler;
  /** middleware factory của host: kiểm permission theo RBAC */
  gate: (permission: string) => MiddlewareHandler;
  audit?: HostAuditSink;
  /** host nối vào event outbox */
  emit?: (orgId: string, topic: string, payload: Record<string, unknown>) => void | Promise<void>;
}

const MODULE_ID = 'soul-sale';
const VERSION = '1.0.0';

export function buildSoulSaleRoutes(deps: SoulSaleRouteDeps): Hono {
  const app = new Hono();
  const ctxOf = (c: { get: (k: string) => unknown }): Ctx => {
    const auth = c.get('auth') as HostJwtPayload & { orgId?: string };
    // Host SuperCitadel set c.set('auth', payload) với payload.orgId (camelCase);
    // module mirror shape dùng org_id — nhận cả hai để khỏi lệch tên.
    const orgId = (auth as any).orgId ?? auth.org_id;
    const userId = auth.sub ?? (auth as any).userId ?? (auth as any).uid;
    const roles = auth.roles ?? ((auth as any).role ? [(auth as any).role] : undefined);
    return {
      orgId, userId, roles,
      emit: deps.emit ? (t, p) => deps.emit!(orgId, t, p) : undefined,
    };
  };

  /** Chạy fn trong 1 transaction đã set app.current_org_id (RLS-aware, defense-in-depth). */
  const withOrg = <T>(orgId: string, fn: (tx: Db) => Promise<T>): Promise<T> =>
    (deps.db as any).transaction(async (tx: any) => {
      await tx.execute(sql`select set_config('app.current_org_id', ${orgId}, true)`);
      return fn(tx as Db);
    });

  app.onError((err, c) => {
    if (err instanceof SsError) return c.json({ error: { code: err.code, message: err.message } }, 400);
    if (err instanceof ZodError) return c.json({ error: { code: 'VALIDATION', issues: err.issues } }, 422);
    console.error('[soul-sale] INTERNAL', err instanceof Error ? err.message : String(err), '| query:', (err as any)?.query ?? '(none)', '| stack:', (err as any)?.stack?.split('\n').slice(0,3).join(' | '));
    return c.json({ error: { code: 'INTERNAL', message: err instanceof Error ? err.message : String(err) } }, 500);
  });

  app.get('/health', (c) => c.json({ ok: true, module: MODULE_ID, version: VERSION }));

  /* ---- bề mặt khám phá cho Tiểu Tâm / FE ---- */
  app.get('/tools', deps.requireAuth, (c) => c.json(readTools.map((t) => ({
    name: t.name, description: t.description, permission: t.permission, examples: t.examples ?? [],
  }))));
  app.get('/actions', deps.requireAuth, (c) => c.json(writeActions.map((a) => ({
    name: a.name, description: a.description, permission: a.permission,
    securityLevel: a.securityLevel, sensitive: a.sensitive, examples: a.examples ?? [],
  }))));

  /* ---- RPC thống nhất: đọc ---- */
  for (const t of readTools) {
    app.post(`/tools/${t.name}`, deps.requireAuth, deps.gate(t.permission), async (c) => {
      const body = await c.req.json().catch(() => ({}));
      const params = t.params.parse(body ?? {});
      const ctx = ctxOf(c);
      return c.json({ ok: true, data: await withOrg(ctx.orgId, (tx) => t.handler(tx, ctx, params)) });
    });
  }

  /* ---- RPC thống nhất: ghi (dry-run→confirm) ---- */
  for (const a of writeActions) {
    app.post(`/actions/${a.name}`, deps.requireAuth, deps.gate(a.permission), async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
      const ctx = ctxOf(c);
      // executeAction tự mở db.transaction cho nhánh confirm; ta set org context ở tx ngoài.
      const result = await withOrg(ctx.orgId, (tx) => executeAction(tx, ctx, a, body, deps.audit));
      return c.json({ ok: true, data: result });
    });
  }
  app.post('/actions/:name{.+}', deps.requireAuth, (c) => c.json({ error: { code: 'ACTION_NOT_FOUND', message: `Không có action ${c.req.param('name')}` } }, 404));

  /* ---- REST sugar cho FE ---- */
  app.get('/customers', deps.requireAuth, deps.gate('soulsale.customer.read'), async (c) => {
    const ctx = ctxOf(c);
    return c.json({ ok: true, data: await withOrg(ctx.orgId, (tx) => M.searchCustomers(tx, ctx, { q: c.req.query('q'), kind: c.req.query('kind'), limit: Number(c.req.query('limit') ?? 20) })) });
  });
  app.get('/customers/:id', deps.requireAuth, deps.gate('soulsale.customer.read'), async (c) => {
    const ctx = ctxOf(c);
    return c.json({ ok: true, data: await withOrg(ctx.orgId, (tx) => M.customerProfile(tx, ctx, { customerId: c.req.param('id') })) });
  });
  app.get('/agency-tree', deps.requireAuth, deps.gate('soulsale.channel.read'), async (c) => {
    const ctx = ctxOf(c);
    return c.json({ ok: true, data: await withOrg(ctx.orgId, (tx) => M.agencyTree(tx, ctx, {})) });
  });
  app.get('/leads', deps.requireAuth, deps.gate('soulsale.lead.read'), async (c) => {
    const { ssLeads } = await import('../src/schema.js');
    const { and, eq: deq, desc } = await import('drizzle-orm');
    const ctx = ctxOf(c);
    const status = c.req.query('status');
    const rows = await withOrg<any[]>(ctx.orgId, (tx) => {
      const conds = [deq(ssLeads.orgId, ctx.orgId), ...(status ? [deq(ssLeads.status, status)] : [])];
      return (tx as any).select().from(ssLeads).where(and(...conds)).orderBy(desc(ssLeads.createdAt)).limit(Number(c.req.query('limit') ?? 50));
    });
    return c.json({ ok: true, data: rows.map((l: any) => ({ id: l.id, name: l.name, source: l.source, status: l.status, score: l.score, phone: l.phone })) });
  });
  app.get('/pipeline/summary', deps.requireAuth, deps.gate('soulsale.deal.read'), async (c) => {
    const ctx = ctxOf(c);
    return c.json({ ok: true, data: await withOrg(ctx.orgId, (tx) => C.pipelineSummary(tx, ctx, {})) });
  });
  app.get('/orders', deps.requireAuth, deps.gate('soulsale.order.read'), async (c) => {
    const ctx = ctxOf(c);
    return c.json({ ok: true, data: await withOrg(ctx.orgId, (tx) => S.searchOrders(tx, ctx, { q: c.req.query('q'), status: c.req.query('status'), period: c.req.query('period'), customerId: c.req.query('customerId'), limit: Number(c.req.query('limit') ?? 50) })) });
  });
  app.patch('/orders/:id/advance', deps.requireAuth, deps.gate('soulsale.order.write'), async (c) => {
    const body = (await c.req.json()) as { to: string };
    const ctx = ctxOf(c);
    return c.json({ ok: true, data: await withOrg(ctx.orgId, (tx) => S.advanceOrder(tx, ctx, { orderId: c.req.param('id'), to: body.to })) });
  });
  app.get('/debt/summary', deps.requireAuth, deps.gate('soulsale.finance.read'), async (c) => {
    const ctx = ctxOf(c);
    return c.json({ ok: true, data: await withOrg(ctx.orgId, (tx) => F.debtSummary(tx, ctx, { customerId: c.req.query('customerId') || undefined, topN: Number(c.req.query('topN') ?? 10) })) });
  });
  app.get('/import/batches', deps.requireAuth, deps.gate('soulsale.import.read'), async (c) => {
    const ctx = ctxOf(c);
    return c.json({ ok: true, data: await withOrg(ctx.orgId, (tx) => SP.batchStatus(tx, ctx, { period: c.req.query('period') || undefined })) });
  });
  app.get('/intel/next-best', deps.requireAuth, deps.gate('soulsale.report.read'), async (c) => {
    const ctx = ctxOf(c);
    return c.json({ ok: true, data: await withOrg(ctx.orgId, (tx) => I.nextBestActions(tx, ctx, { limit: Number(c.req.query('limit') ?? 10) })) });
  });

  /* ---- cron của host gọi (đêm, per-org) ---- */
  app.post('/automation/run', deps.requireAuth, deps.gate('soulsale.report.read'), async (c) => {
    const ctx = ctxOf(c);
    return c.json({ ok: true, data: await withOrg(ctx.orgId, (tx) => runScheduledTasks(tx, ctx)) });
  });

  /* ---- host gọi 1 lần khi activate module cho org (idempotent) ---- */
  app.post('/setup', deps.requireAuth, deps.gate('soulsale.customer.write'), async (c) => {
    const ctx = ctxOf(c);
    await withOrg(ctx.orgId, (tx) => M.ensureDefaults(tx, ctx));
    return c.json({ ok: true, data: { seeded: ['pipeline MAIN + 5 stages', '5 payment terms', 'price book DEFAULT'] } });
  });

  return app;
}
