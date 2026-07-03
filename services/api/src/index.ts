import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { AppError, loadApiEnv } from '@citadel/core';
import { getDb, users } from '@citadel/db';
import { sql, eq, and } from 'drizzle-orm';
import { login } from './auth/service.js';
import { requireAuth, orgOf } from './auth/middleware.js';
import { rateLimit } from './middleware/rateLimit.js';
import { buildTieuTamRoutes } from './tieu-tam/routes.js';
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
import { buildCompanyModuleRoutes } from './company-module-routes.js';
import { buildStoreItemRoutes, buildInventoryItemRoutes } from './items/routes.js';
import { toolRegistry } from '@citadel/tieu-tam';
import { buildAuditRoutes } from './audit/routes.js';
import { logAudit, makeAudit, ipOf } from './audit/service.js';
import { bindEmail, bindPhone, securityInfo, assertSecurityLevel, SENSITIVE_OM_THRESHOLD } from './security/service.js';
import { getBalance } from '@citadel/module-om/server/service.js';
import { ROLE_RANK, Errors, type Role } from '@citadel/core';

// R8: fail-fast — production KHÔNG được chạy với secret default (người clone deploy trần là tự mở két)
if (process.env.NODE_ENV === 'production') {
  const jwt = process.env.JWT_SECRET ?? '';
  const dbUrl = process.env.DATABASE_URL ?? '';
  const bad: string[] = [];
  const JWT_PLACEHOLDERS = ['dev_secret_change_me', 'change_me_to_a_long_random_string', 'doi_thanh_chuoi_ngau_nhien_dai_32_ky_tu_tro_len'];
  if (!jwt || JWT_PLACEHOLDERS.includes(jwt) || jwt.length < 16) bad.push('JWT_SECRET (thiếu/default/quá ngắn <16)');
  if (dbUrl.includes('citadel_dev') || dbUrl.includes('doi_mat_khau_nay')) bad.push('DB_PASSWORD (còn default/placeholder)');
  if (bad.length) {
    console.error(`[api] FATAL: production chạy với secret default — ${bad.join(' · ')}. Set env thật trong .env rồi khởi động lại.`);
    process.exit(1);
  }
}

const app = new Hono();

// CORS (R8) — production: CHỈ allow origin trong CORS_ORIGIN (danh sách phᡉy). Dev: localhost.
// Không còn wildcard '*' ở production — origin lạ bị reject (trả null → không có CORS header).
const IS_PROD = process.env.NODE_ENV === 'production';
const CORS_ALLOWED = (process.env.CORS_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const DEV_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];
app.use('*', cors({
  origin: (origin) => {
    if (!origin) return IS_PROD ? (CORS_ALLOWED[0] ?? '') : '*'; // same-origin/curl không gửi Origin
    if (CORS_ALLOWED.includes(origin)) return origin;
    if (!IS_PROD && DEV_ORIGINS.includes(origin)) return origin;
    return ''; // origin lạ → không cấp CORS header
  },
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

app.onError((err, c) => {
  if (err instanceof AppError) return c.json(err.toJSON(c.req.header('x-request-id')), err.status as 400);
  console.error('[api] unhandled', err);
  return c.json({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống' } }, 500);
});

app.get('/health', (c) => c.json({ ok: true, service: 'citadel-api', ts: Date.now() }));
app.get('/', (c) => c.json({ name: 'SUPERCITADEL API', status: 'OK', version: '8.0.0' }));

app.post('/api/v1/auth/login', rateLimit({ windowMs: 60_000, max: 5 }), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const res = await login(getDb(), String(body.token ?? ''));
  await logAudit(getDb(), { orgId: res.user.orgId, userId: res.user.id, action: 'auth.login', resource: 'auth', ip: ipOf(c) });
  return c.json(res);
});

// audit fn gắn context — truyền vào các module route builders
const audit = makeAudit(getDb());

app.get('/api/v1/me', requireAuth, async (c) => {
  const auth = c.get('auth');
  const balance = await getBalance(getDb(), orgOf(c)).catch(() => 0);
  const sec = await securityInfo(getDb(), auth, balance);
  return c.json({ id: auth.sub, orgId: orgOf(c), role: auth.role, ...sec });
});

// Progressive security lớp 2 — gắn email/SĐT nâng security_level
app.post('/api/v1/me/bind-email', requireAuth, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const res = await bindEmail(getDb(), c.get('auth'), String(b.email ?? ''));
  await audit(c, { action: 'security.bind_email', resource: 'user', resourceId: c.get('auth').sub });
  return c.json({ ok: true, ...res, message: 'Đã gắn email — tài khoản đạt bảo mật lớp 2' });
});
app.post('/api/v1/me/bind-phone', requireAuth, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const res = await bindPhone(getDb(), c.get('auth'), String(b.phone ?? ''));
  await audit(c, { action: 'security.bind_phone', resource: 'user', resourceId: c.get('auth').sub });
  return c.json({ ok: true, ...res, message: 'Đã gắn số điện thoại — tài khoản đạt bảo mật lớp 2' });
});

// Đổi role user — chỉ owner+, đòi bảo mật lớp 2 (hành động nhạy cảm)
app.patch('/api/v1/users/:id/role', requireAuth, async (c) => {
  const auth = c.get('auth');
  if (ROLE_RANK[auth.role as Role] < ROLE_RANK.owner) throw Errors.forbidden('Chỉ chủ tổ chức mới đổi được quyền thành viên');
  await assertSecurityLevel(getDb(), auth, 2);
  const b = await c.req.json().catch(() => ({}));
  const role = String(b.role ?? '');
  if (!['owner', 'manager', 'staff'].includes(role)) throw Errors.validation('Quyền không hợp lệ — chọn owner/manager/staff', 'role');
  const targetId = String(c.req.param('id') ?? '');
  const [row] = await getDb().update(users).set({ role: role as any })
    .where(and(eq(users.id, targetId), eq(users.orgId, orgOf(c)))).returning();
  if (!row) throw Errors.notFound('Không tìm thấy thành viên trong tổ chức');
  await audit(c, { action: 'user.role_change', resource: 'user', resourceId: row.id, detail: { role } });
  return c.json({ ok: true, user: { id: row.id, role: row.role } });
});

app.route('/api/v1/tieu-tam', buildTieuTamRoutes({ db: getDb(), requireAuth, audit }));
app.route('/api/v1/chat', buildChatRoutes({ db: getDb(), emit: publishEvent, requireAuth }));
app.route('/api/v1/dashboard', dashboard);
app.route('/api/v1/notifications', buildNotificationRoutes({ db: getDb(), requireAuth }));
app.route('/api/v1/crm', buildCrmRoutes({ db: getDb(), requireAuth, gate: requireModule(getDb(), 'crm') } as any));
app.route('/api/v1/om', buildOmRoutes({
  db: getDb(), requireAuth, audit,
  // chi/chuyển Om > ngưỡng nhạy cảm → đòi bảo mật lớp 2
  sensitiveGate: async (c, amount) => { if (amount > SENSITIVE_OM_THRESHOLD) await assertSecurityLevel(getDb(), c.get('auth'), 2); },
}));
app.route('/api/v1/modules', buildModuleRoutes({ db: getDb(), requireAuth, audit }));
app.route('/api/v1/company-module', buildCompanyModuleRoutes({ db: getDb(), requireAuth, audit }));
// V7A P3 — vòng kinh tế khép kín: store vật phẩm + kho chứa + sử dụng (hiệu ứng thật)
app.route('/api/v1/store', buildStoreItemRoutes({ db: getDb(), requireAuth, audit }));
app.route('/api/v1/inventory-items', buildInventoryItemRoutes({ db: getDb(), requireAuth, audit }));
app.route('/api/v1/inventory', buildInventoryRoutes({ db: getDb(), requireAuth, gate: requireModule(getDb(), 'inventory') }));
app.route('/api/v1/hr', buildHrRoutes({ db: getDb(), requireAuth, gate: requireModule(getDb(), 'hr'), audit }));
app.route('/api/v1/accounting', buildAccountingRoutes({
  db: getDb(), requireAuth, gate: requireModule(getDb(), 'accounting'), audit,
  // hủy phiếu thu/chi (tiền đã vào sổ) = nhạy cảm → đòi lớp 2
  cancelGate: async (c, kind) => { if (kind === 'payment') await assertSecurityLevel(getDb(), c.get('auth'), 2); },
}));
app.route('/api/v1/audit-logs', buildAuditRoutes({ db: getDb(), requireAuth }));

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
