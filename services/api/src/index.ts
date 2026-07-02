import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { AppError, loadApiEnv } from '@citadel/core';
import { getDb, users } from '@citadel/db';
import { sql, eq } from 'drizzle-orm';
import { login } from './auth/service.js';
import { requireAuth, orgOf } from './auth/middleware.js';
import { rateLimit } from './middleware/rateLimit.js';
import { tieuTam } from './tieu-tam/routes.js';
import { buildChatRoutes } from '@citadel/module-chat/server/routes.js';
import { publishEvent } from '@citadel/module-chat/server/emit.js';
import { dashboard } from './dashboard/routes.js';
import { buildNotificationRoutes } from '@citadel/module-notification/server/routes.js';
import { buildCrmRoutes } from '@citadel/module-crm/server/routes.js';
import { crmTools } from '@citadel/module-crm/server/tools.js';
import { buildOmRoutes } from '@citadel/module-om/server/routes.js';
import { buildInventoryRoutes } from '@citadel/module-inventory/server/routes.js';
import { buildHrRoutes } from '@citadel/module-hr/server/routes.js';
import { buildAccountingRoutes } from '@citadel/module-accounting/server/routes.js';
import { buildModuleRoutes, requireModule } from './modules/routes.js';
import { toolRegistry } from '@citadel/tieu-tam';

const app = new Hono();

// CORS — cho browser (web :3000) gọi API. Prod: set CORS_ORIGIN trong .env.
app.use('*', cors({
  origin: (origin) => origin ?? '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

app.onError((err, c) => {
  if (err instanceof AppError) return c.json(err.toJSON(c.req.header('x-request-id')), err.status as 400);
  console.error('[api] unhandled', err);
  return c.json({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống' } }, 500);
});

app.get('/health', (c) => c.json({ ok: true, service: 'citadel-api', ts: Date.now() }));
app.get('/', (c) => c.json({ name: 'Citadel V8 API', status: 'OK', version: '8.0.0' }));

app.post('/api/v1/auth/login', rateLimit({ windowMs: 60_000, max: 5 }), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const res = await login(getDb(), String(body.token ?? ''));
  return c.json(res);
});

app.get('/api/v1/me', requireAuth, (c) => {
  const auth = c.get('auth');
  return c.json({ id: auth.sub, orgId: orgOf(c), role: auth.role });
});

app.route('/api/v1/tieu-tam', tieuTam);
app.route('/api/v1/chat', buildChatRoutes({ db: getDb(), emit: publishEvent, requireAuth }));
app.route('/api/v1/dashboard', dashboard);
app.route('/api/v1/notifications', buildNotificationRoutes({ db: getDb(), requireAuth }));
app.route('/api/v1/crm', buildCrmRoutes({ db: getDb(), requireAuth, gate: requireModule(getDb(), 'crm') } as any));
app.route('/api/v1/om', buildOmRoutes({ db: getDb(), requireAuth }));
app.route('/api/v1/modules', buildModuleRoutes({ db: getDb(), requireAuth }));
app.route('/api/v1/inventory', buildInventoryRoutes({ db: getDb(), requireAuth, gate: requireModule(getDb(), 'inventory') }));
app.route('/api/v1/hr', buildHrRoutes({ db: getDb(), requireAuth, gate: requireModule(getDb(), 'hr') }));
app.route('/api/v1/accounting', buildAccountingRoutes({ db: getDb(), requireAuth, gate: requireModule(getDb(), 'accounting') }));

// list users trong org (cho modal tạo phòng chat)
app.get('/api/v1/users', requireAuth, async (c) => {
  const rows = await getDb().select().from(users).where(eq(users.orgId, orgOf(c)));
  return c.json({ users: rows.map((u: any) => ({ id: u.id, displayName: u.displayName, role: u.role, avatarColor: u.avatarColor })) });
});
// register CRM tools so Tiểu Tâm can read live CRM data
try { crmTools(getDb()).forEach((t) => toolRegistry.register(t)); } catch (e) { /* idempotent */ }

// fail-fast env validation at boot
const env = loadApiEnv();

// readiness probe — checks DB connectivity (for orchestrators)
app.get('/ready', async (c) => {
  try { await getDb().execute(sql`SELECT 1`); return c.json({ ready: true }); }
  catch { return c.json({ ready: false, reason: 'db_unreachable' }, 503); }
});

const port = env.PORT;
serve({ fetch: app.fetch, port }, () => console.log(`[api] listening on :${port}`));

export default app;
