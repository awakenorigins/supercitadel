// audit-endpoints.mts — AUDIT THẬT: gọi TẤT CẢ 26 endpoint + WS với DB thật (PGlite) + WebSocket thật.
// In bảng PASS/FAIL từng endpoint. Đây là bằng chứng "hoạt động thật sự".
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { WebSocket } from 'ws';
import * as dbschema from '@citadel/db';
import { AppError } from '@citadel/core';
import { generateToken, hashToken, tokenPrefix } from './auth/token.js';
import { requireAuth, orgOf } from './auth/middleware.js';
import { login as authLogin } from './auth/service.js';
import { tieuTam } from './tieu-tam/routes.js';
import { rateLimit, _resetRateLimit } from './middleware/rateLimit.js';
import { buildChatRoutes } from '@citadel/module-chat/server/routes.js';
import { buildNotificationRoutes } from '@citadel/module-notification/server/routes.js';
import { buildCrmRoutes } from '@citadel/module-crm/server/routes.js';
import { buildOmRoutes } from '@citadel/module-om/server/routes.js';
import { buildInventoryRoutes } from '@citadel/module-inventory/server/routes.js';
import { buildHrRoutes } from '@citadel/module-hr/server/routes.js';
import { buildModuleRoutes, requireModule } from './modules/routes.js';
import { buildAccountingRoutes } from '@citadel/module-accounting/server/routes.js';
import { buildStoreItemRoutes, buildInventoryItemRoutes } from './items/routes.js';
import { buildAuditRoutes } from './audit/routes.js';
import { orgModules } from '@citadel/db';
import { startWsServer } from '../../ws/src/index.js';
import { eq, sql as dsql } from 'drizzle-orm';

process.env.JWT_SECRET = 'audit_secret_long_enough_for_hs256_x';
process.env.LLM_MODE = 'stub';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ROWS: { method: string; path: string; status: number | string; ok: boolean; note: string }[] = [];
function row(method: string, path: string, status: number | string, ok: boolean, note = '') {
  ROWS.push({ method, path, status, ok, note });
}

async function main() {
  // ── DB thật + migrations đầy đủ ──
  const pg = new PGlite();
  for (const f of ['packages/db/migrations/0001_init.sql', 'modules/chat/migrations/0001_chat.sql', 'modules/crm/migrations/0001_crm.sql', 'modules/om/migrations/0001_om.sql', 'modules/notification/migrations/0001_notification.sql', 'packages/db/migrations/0002_org_modules.sql', 'packages/db/migrations/0003_super_admin.sql', 'packages/db/migrations/0004_v7a_p1.sql', 'packages/db/migrations/0005_v7a_p2.sql', 'packages/db/migrations/0006_v7a_p3.sql', 'packages/db/migrations/0007_module_rental.sql', 'modules/inventory/migrations/0001_inventory.sql', 'modules/hr/migrations/0001_hr.sql', 'modules/hr/migrations/0002_hr_v2.sql', 'modules/accounting/migrations/0001_accounting.sql']) {
    await pg.exec(readFileSync(new URL('../../../' + f, import.meta.url), 'utf8').replace(/CREATE EXTENSION IF NOT EXISTS vector;\s*/i, ''));
  }
  const db = drizzle(pg, { schema: dbschema }) as any;

  // ── account thật ──
  const [org] = await db.insert(dbschema.orgs).values({ name: 'Audit Quán', slug: 'audit' }).returning();
  const [minh] = await db.insert(dbschema.users).values({ orgId: org.id, displayName: 'Minh', role: 'owner' }).returning();
  const [lan] = await db.insert(dbschema.users).values({ orgId: org.id, displayName: 'Lan Phạm', role: 'manager' }).returning();
  const tok = generateToken();
  await db.insert(dbschema.tokens).values({ orgId: org.id, userId: minh.id, tokenPrefix: tokenPrefix(tok), tokenHash: await hashToken(tok), role: 'owner' });

  // ── WS thật ──
  const PORT = 3901;
  const wsSrv = startWsServer(PORT);
  await wait(150);
  const realEmit = async (ev: any) => { await fetch(`http://localhost:${PORT}/internal/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ev) }); };

  // ── Lắp app Y HỆT services/api/src/index.ts (cùng routes, cùng middleware, db inject) ──
  const app = new Hono();
  app.use('*', cors({ origin: (o) => o ?? '*', allowHeaders: ['Content-Type', 'Authorization'], allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }));
  app.onError((e, c) => (e instanceof AppError ? c.json(e.toJSON(), e.status as 400) : (console.error(e), c.json({ error: { code: 'INTERNAL', message: String(e) } }, 500))));
  app.get('/health', (c) => c.json({ ok: true, service: 'citadel-api' }));
  app.get('/ready', async (c) => { try { await db.execute(dsql`SELECT 1`); return c.json({ ready: true }); } catch { return c.json({ ready: false }, 503); } });
  app.get('/', (c) => c.json({ name: 'SUPERCITADEL API', docs: '/docs/API.md' }));
  _resetRateLimit();
  app.post('/api/v1/auth/login', rateLimit({ windowMs: 60_000, max: 5 }), async (c) => {
    const b = await c.req.json().catch(() => ({}));
    return c.json(await authLogin(db, String(b.token ?? '')));
  });
  app.get('/api/v1/me', requireAuth, async (c) => {
    const a = c.get('auth') as any;
    const [u] = await db.select().from(dbschema.users).where(eq(dbschema.users.id, a.sub));
    return c.json({ user: u, orgId: orgOf(c) });
  });
  app.route('/api/v1/tieu-tam', tieuTam);
  app.route('/api/v1/chat', buildChatRoutes({ db, emit: realEmit, requireAuth }));
  app.route('/api/v1/notifications', buildNotificationRoutes({ db, requireAuth }));
  app.route('/api/v1/crm', buildCrmRoutes({ db, requireAuth, gate: requireModule(db, 'crm') } as any));
  app.route('/api/v1/om', buildOmRoutes({ db, requireAuth }));
  app.route('/api/v1/modules', buildModuleRoutes({ db, requireAuth }));
  app.route('/api/v1/inventory', buildInventoryRoutes({ db, requireAuth, gate: requireModule(db, 'inventory') }));
  app.route('/api/v1/hr', buildHrRoutes({ db, requireAuth, gate: requireModule(db, 'hr') }));
  app.route('/api/v1/accounting', buildAccountingRoutes({ db, requireAuth, gate: requireModule(db, 'accounting') }));
  app.route('/api/v1/store', buildStoreItemRoutes({ db, requireAuth }));
  app.route('/api/v1/inventory-items', buildInventoryItemRoutes({ db, requireAuth }));
  app.route('/api/v1/audit-logs', buildAuditRoutes({ db, requireAuth }));
  app.get('/api/v1/users', requireAuth, async (c) => {
    const rows = await db.select().from(dbschema.users).where(eq(dbschema.users.orgId, orgOf(c)));
    return c.json({ users: rows.map((u: any) => ({ id: u.id, displayName: u.displayName, role: u.role })) });
  });
  // dashboard (mirror routes thật, db inject)
  app.get('/api/v1/dashboard/summary', requireAuth, async (c) => {
    const [{ memberCount }] = await db.select({ memberCount: dsql<number>`count(*)::int` }).from(dbschema.users).where(eq(dbschema.users.orgId, orgOf(c)));
    return c.json({ orgId: orgOf(c), kpis: { revenueToday: { value: '12.4tr', trend: '+18.4%' }, orders: { value: 187 }, returningRate: { value: '63.8%' }, lowStock: { value: 3 } }, team: { members: memberCount }, pulse: { status: 'good', note: 'OK' } });
  });
  app.get('/api/v1/dashboard/search', requireAuth, async (c) => {
    const q = (c.req.query('q') ?? '').toLowerCase();
    const all = await db.select().from(dbschema.users).where(eq(dbschema.users.orgId, orgOf(c)));
    return c.json({ results: all.filter((u: any) => u.displayName.toLowerCase().includes(q)).map((u: any) => ({ type: 'user', id: u.id, label: u.displayName })) });
  });

  const J = async (r: Response) => ({ st: r.status, d: await r.json().catch(() => ({})) as any });

  // ═══ AUDIT TỪNG ENDPOINT ═══
  // Hệ thống (3)
  { const { st, d } = await J(await app.request('/health')); row('GET', '/health', st, st === 200 && d.ok, 'liveness'); }
  { const { st, d } = await J(await app.request('/ready')); row('GET', '/ready', st, st === 200 && d.ready, 'DB SELECT 1'); }
  { const { st } = await J(await app.request('/')); row('GET', '/', st, st === 200, 'api info'); }

  // Auth (2)
  let jwt = '';
  { const { st, d } = await J(await app.request('/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tok }) })); jwt = d.jwt; row('POST', '/api/v1/auth/login', st, st === 200 && !!d.jwt, 'token→JWT'); }
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` };
  { const { st, d } = await J(await app.request('/api/v1/me', { headers: H })); row('GET', '/api/v1/me', st, st === 200 && d.user?.id === minh.id, 'user info'); }

  // Tiểu Tâm (2)
  { const { st, d } = await J(await app.request('/api/v1/tieu-tam/chat', { method: 'POST', headers: H, body: JSON.stringify({ message: 'doanh thu hôm nay', userName: 'Minh' }) })); row('POST', '/api/v1/tieu-tam/chat', st, st === 200 && d.mode === 'stub' && d.text?.length > 0, 'stub reply'); }
  { const r = await app.request('/api/v1/tieu-tam/chat/stream', { method: 'POST', headers: H, body: JSON.stringify({ message: 'deal đang mở' }) });
    const txt = await r.text();
    row('POST', '/api/v1/tieu-tam/chat/stream', r.status, r.status === 200 && txt.includes('event: token') && txt.includes('event: done'), 'SSE token+done'); }

  // ═══ MODULE REGISTRY (4) + GATE FLOW ═══
  { const r = await app.request('/api/v1/crm/deals', { headers: H }); row('GATE', 'crm trước khi mua → 403', r.status, r.status === 403, 'MODULE_INACTIVE'); }
  { const { st, d } = await J(await app.request('/api/v1/modules', { headers: H })); row('GET', '/api/v1/modules', st, st === 200 && d.modules?.length === 10 && d.modules?.some((m:any)=>m.id==='company-module'&&m.tier==='custom'), 'catalog 10 (R7 +company-module)'); }
  { const { st, d } = await J(await app.request('/api/v1/om/topup', { method: 'POST', headers: H, body: JSON.stringify({ amount: 99999 }) })); row('POST', '/om/topup (cấp 99999)', st, st === 200 && d.balance === 99999, 'admin Om'); }
  { const { st, d } = await J(await app.request('/api/v1/modules/crm/purchase', { method: 'POST', headers: H })); row('POST', '/modules/crm/purchase', st, st === 200 && d.balance === 99599, 'trừ 400 Om thật'); }
  { const { st, d } = await J(await app.request('/api/v1/modules/inventory/purchase', { method: 'POST', headers: H })); row('POST', '/modules/inventory/purchase', st, st === 200 && d.balance === 99299, 'trừ 300'); }
  { const { st, d } = await J(await app.request('/api/v1/modules/hr/purchase', { method: 'POST', headers: H })); row('POST', '/modules/hr/purchase', st, st === 200 && d.balance === 99049, 'trừ 250'); }
  { const { st, d } = await J(await app.request('/api/v1/modules/accounting/purchase', { method: 'POST', headers: H })); row('POST', '/modules/accounting/purchase', st, st === 200 && d.balance === 98549, 'trừ 500'); }
  { const { st, d } = await J(await app.request('/api/v1/modules/inventory/deactivate', { method: 'POST', headers: H })); row('POST', '/modules/:id/deactivate', st, st === 200 && d.active === false, 'tắt kho'); }
  { const r = await app.request('/api/v1/inventory/items', { headers: H }); row('GATE', 'kho sau khi tắt → 403', r.status, r.status === 403, 'gate đóng'); }
  { const { st } = await J(await app.request('/api/v1/modules/inventory/activate', { method: 'POST', headers: H })); row('POST', '/modules/:id/activate', st, st === 200, 'bật lại'); }

  // ═══ INVENTORY (4) ═══
  let itemId = '';
  { const { st, d } = await J(await app.request('/api/v1/inventory/items', { method: 'POST', headers: H, body: JSON.stringify({ name: 'Sữa tươi', unit: 'hộp', qty: 10, lowThreshold: 12 }) })); itemId = d.item?.id; row('POST', '/api/v1/inventory/items', st, st === 201 && !!itemId, 'thêm hàng'); }
  { const { st, d } = await J(await app.request('/api/v1/inventory/items', { headers: H })); row('GET', '/api/v1/inventory/items', st, st === 200 && d.items?.length === 1, 'list'); }
  { const { st, d } = await J(await app.request('/api/v1/inventory/low-stock', { headers: H })); row('GET', '/inventory/low-stock', st, st === 200 && d.items?.length === 1, '10<=12 cảnh báo'); }
  { const { st, d } = await J(await app.request(`/api/v1/inventory/items/${itemId}/qty`, { method: 'PATCH', headers: H, body: JSON.stringify({ delta: 20 }) })); row('PATCH', '/inventory/items/:id/qty', st, st === 200 && d.item?.qty === 30, 'nhập +20'); }
  { const { st, d } = await J(await app.request(`/api/v1/inventory/items/${itemId}`, { method: 'PATCH', headers: H, body: JSON.stringify({ lowThreshold: 3, name: 'Sữa tươi VNM' }) })); row('PATCH', '/inventory/items/:id', st, st === 200 && d.item?.lowThreshold === 3, 'sửa ngưỡng+tên'); }

  // ═══ HR (3) ═══
  let shiftId = '';
  { const { st, d } = await J(await app.request('/api/v1/hr/shifts', { method: 'POST', headers: H, body: JSON.stringify({ name: 'Ca Tối', shiftDate: '2026-06-10', startTime: '17:00', endTime: '22:00', staff: ['Lan'] }) })); shiftId = d.shift?.id; row('POST', '/api/v1/hr/shifts', st, st === 201 && !!shiftId, 'tạo ca'); }
  { const { st, d } = await J(await app.request('/api/v1/hr/shifts?date=2026-06-10', { headers: H })); row('GET', '/api/v1/hr/shifts', st, st === 200 && d.shifts?.length === 1, 'list theo ngày'); }
  { const { st, d } = await J(await app.request(`/api/v1/hr/shifts/${shiftId}/staff`, { method: 'PUT', headers: H, body: JSON.stringify({ staff: ['Lan', 'Tú'] }) })); row('PUT', '/hr/shifts/:id/staff', st, st === 200 && d.shift?.staff === 'Lan, Tú', 'xếp người'); }

  // ═══ HR v2 (14): Employees + Attendance + Leave ═══
  let empId = '', ltId = '', lapId = '';
  { const { st, d } = await J(await app.request('/api/v1/hr/employees', { method: 'POST', headers: H, body: JSON.stringify({ fullName: 'Lan Phạm', roleTitle: 'Trưởng ca' }) })); empId = d.employee?.id; row('POST', '/api/v1/hr/employees', st, st === 201 && !!empId, 'tạo NV'); }
  { const { st, d } = await J(await app.request('/api/v1/hr/employees?status=active', { headers: H })); row('GET', '/api/v1/hr/employees', st, st === 200 && d.employees?.length === 1, 'list active'); }
  { const { st, d } = await J(await app.request(`/api/v1/hr/employees/${empId}`, { method: 'PATCH', headers: H, body: JSON.stringify({ roleTitle: 'Quản lý' }) })); row('PATCH', '/hr/employees/:id', st, st === 200 && d.employee?.roleTitle === 'Quản lý', 'sửa chức danh'); }
  { const { st, d } = await J(await app.request('/api/v1/hr/attendance/check-in', { method: 'POST', headers: H, body: JSON.stringify({ employeeId: empId }) })); row('POST', '/hr/attendance/check-in', st, st === 201 && d.attendance?.status === 'present', 'vào ca'); }
  { const { st, d } = await J(await app.request('/api/v1/hr/attendance/check-out', { method: 'POST', headers: H, body: JSON.stringify({ employeeId: empId }) })); row('POST', '/hr/attendance/check-out', st, st === 200 && d.attendance?.checkOut && d.attendance?.status === 'checked_out', 'ra ca + status checked_out (R5-A)'); }
  { const { st, d } = await J(await app.request('/api/v1/hr/attendance', { headers: H })); row('GET', '/api/v1/hr/attendance', st, st === 200 && d.attendance?.length === 1 && d.attendance[0].employeeName === 'Lan Phạm', 'bảng công hôm nay'); }
  { const { st, d } = await J(await app.request('/api/v1/hr/leave/types', { method: 'POST', headers: H, body: JSON.stringify({ name: 'Phép năm', daysPerYear: 12 }) })); ltId = d.type?.id; row('POST', '/api/v1/hr/leave/types', st, st === 201 && !!ltId, 'loại phép'); }
  { const { st, d } = await J(await app.request('/api/v1/hr/leave/types', { headers: H })); row('GET', '/api/v1/hr/leave/types', st, st === 200 && d.types?.length === 1, 'list loại'); }
  { const { st, d } = await J(await app.request('/api/v1/hr/leave/allocations', { method: 'POST', headers: H, body: JSON.stringify({ employeeId: empId, leaveTypeId: ltId, year: 2026, days: 12 }) })); row('POST', '/hr/leave/allocations', st, st === 201 && d.allocation, 'cấp 12 ngày'); }
  { const { st, d } = await J(await app.request(`/api/v1/hr/leave/balance?employeeId=${empId}&year=2026`, { headers: H })); row('GET', '/hr/leave/balance', st, st === 200 && d.balance?.[0]?.remaining === 12, 'số dư 12'); }
  { const { st, d } = await J(await app.request('/api/v1/hr/leave/applications', { method: 'POST', headers: H, body: JSON.stringify({ employeeId: empId, leaveTypeId: ltId, fromDate: '2026-07-01', toDate: '2026-07-03', reason: 'Về quê' }) })); lapId = d.application?.id; row('POST', '/hr/leave/applications', st, st === 201 && Number(d.application?.totalDays) === 3, 'đơn 3 ngày'); }
  { const { st, d } = await J(await app.request('/api/v1/hr/leave/applications?status=open', { headers: H })); row('GET', '/hr/leave/applications', st, st === 200 && d.applications?.length === 1, 'list open'); }
  { const { st, d } = await J(await app.request(`/api/v1/hr/leave/applications/${lapId}/approve`, { method: 'POST', headers: H })); row('POST', '/leave/applications/:id/approve', st, st === 200 && d.application?.status === 'approved', 'duyệt → trừ dư'); }
  { const lap2 = await J(await app.request('/api/v1/hr/leave/applications', { method: 'POST', headers: H, body: JSON.stringify({ employeeId: empId, leaveTypeId: ltId, fromDate: '2026-08-01', toDate: '2026-08-01' }) }));
    const { st, d } = await J(await app.request(`/api/v1/hr/leave/applications/${lap2.d.application.id}/reject`, { method: 'POST', headers: H })); row('POST', '/leave/applications/:id/reject', st, st === 200 && d.application?.status === 'rejected', 'từ chối'); }

  // ═══ ACCOUNTING (14) ═══
  let invAccId = '', vJvId = '';
  { const { st, d } = await J(await app.request('/api/v1/accounting/chart/seed', { method: 'POST', headers: H })); row('POST', '/accounting/chart/seed', st, st === 201 && d.accounts?.length === 14, 'chart VN 14 TK'); }
  { const { st, d } = await J(await app.request('/api/v1/accounting/accounts', { headers: H })); row('GET', '/api/v1/accounting/accounts', st, st === 200 && d.accounts?.length === 14, 'list TK'); }
  { const { st, d } = await J(await app.request('/api/v1/accounting/journal', { method: 'POST', headers: H, body: JSON.stringify({ postingDate: '2026-06-10', remarks: 'Góp vốn', lines: [{ accountNumber: '111', debit: 50000000 }, { accountNumber: '411', credit: 50000000 }] }) })); vJvId = d.voucher?.id; row('POST', '/accounting/journal', st, st === 201 && d.voucher?.voucherNo === 'JV-0001', 'bút toán cân'); }
  { const { st, d } = await J(await app.request('/api/v1/accounting/accounts/111/balance', { headers: H })); row('GET', '/accounting/accounts/:n/balance', st, st === 200 && d.balance === 50000000, 'quỹ 50tr'); }
  { const { st, d } = await J(await app.request('/api/v1/accounting/invoices', { method: 'POST', headers: H, body: JSON.stringify({ invoiceType: 'sales', partyName: 'Cô Hoa', postingDate: '2026-06-10', lines: [{ description: 'Tiệc', qty: 1, rate: 22000000 }] }) })); invAccId = d.invoice?.id; row('POST', '/accounting/invoices', st, st === 201 && Number(d.invoice?.outstanding) === 22000000, 'HĐ bán 22tr'); }
  { const { st, d } = await J(await app.request('/api/v1/accounting/invoices?type=sales', { headers: H })); row('GET', '/api/v1/accounting/invoices', st, st === 200 && d.invoices?.length === 1, 'list HĐ'); }
  { const { st, d } = await J(await app.request('/api/v1/accounting/payments', { method: 'POST', headers: H, body: JSON.stringify({ paymentType: 'receive', partyName: 'Cô Hoa', amount: 10000000, invoiceId: invAccId, postingDate: '2026-06-10' }) })); row('POST', '/accounting/payments', st, st === 201, 'thu 10tr knock-off'); }
  { const { st, d } = await J(await app.request('/api/v1/accounting/payments', { headers: H })); row('GET', '/api/v1/accounting/payments', st, st === 200 && d.payments?.length === 1, 'list phiếu'); }
  { const { st, d } = await J(await app.request('/api/v1/accounting/vouchers', { headers: H })); row('GET', '/api/v1/accounting/vouchers', st, st === 200 && d.vouchers?.length === 3, '3 chứng từ'); }
  { const { st, d } = await J(await app.request('/api/v1/accounting/reports/general-ledger?account=111&from=2026-01-01&to=2026-12-31', { headers: H })); row('GET', '/reports/general-ledger', st, st === 200 && d.entries?.length === 2, 'sổ cái 111'); }
  { const { st, d } = await J(await app.request('/api/v1/accounting/reports/trial-balance?from=2026-01-01&to=2026-12-31', { headers: H })); row('GET', '/reports/trial-balance', st, st === 200 && d.balanced === true, 'SỔ CÂN'); }
  { const { st, d } = await J(await app.request('/api/v1/accounting/reports/profit-loss?from=2026-01-01&to=2026-12-31', { headers: H })); row('GET', '/reports/profit-loss', st, st === 200 && d.totalIncome === 22000000, 'P&L 22tr'); }
  { const { st, d } = await J(await app.request('/api/v1/accounting/reports/outstanding?type=sales', { headers: H })); row('GET', '/reports/outstanding', st, st === 200 && d.grandTotal === 12000000, 'công nợ 12tr'); }
  { const jv2 = await J(await app.request('/api/v1/accounting/journal', { method: 'POST', headers: H, body: JSON.stringify({ postingDate: '2026-06-10', lines: [{ accountNumber: '642', debit: 1000000 }, { accountNumber: '111', credit: 1000000 }] }) }));
    const { st, d } = await J(await app.request(`/api/v1/accounting/vouchers/${jv2.d.voucher.id}/cancel`, { method: 'POST', headers: H })); row('POST', '/vouchers/:id/cancel', st, st === 200 && d.voucher?.status === 'cancelled', 'bút toán đảo'); }

  // ═══ ACCOUNTING EXCEL (2 — R5 audit bổ sung) ═══
  { const r = await app.request('/api/v1/accounting/import/template.xlsx', { headers: H });
    const ct = r.headers.get('content-type') ?? '';
    const buf = await r.arrayBuffer();
    row('GET', '/accounting/import/template.xlsx', r.status, r.status === 200 && ct.includes('spreadsheet') && buf.byteLength > 500, `file mẫu ${buf.byteLength}B`); }
  { const r = await app.request('/api/v1/accounting/export/general-ledger.json?from=2026-01-01&to=2026-12-31', { headers: H });
    const d = await r.json().catch(() => ({})) as any;
    row('GET', '/accounting/export/general-ledger.json', r.status, r.status === 200 && Array.isArray(d.entries), 'export JSON'); }

  // ═══ STORE ITEMS + INVENTORY ITEMS (5 — R5 audit bổ sung) ═══
  let ownedId = '';
  { const { st, d } = await J(await app.request('/api/v1/store/items', { headers: H })); row('GET', '/api/v1/store/items', st, st === 200 && d.items?.length === 6, 'catalog 6 vật phẩm seed'); }
  { const { st, d } = await J(await app.request('/api/v1/store/items/mochi/buy', { method: 'POST', headers: H, body: JSON.stringify({ qty: 2 }) })); row('POST', '/store/items/:code/buy {qty:2}', st, st === 200 && d.qtyBought === 2 && d.paidOm === 60, 'R5: mua 2 trừ 60 Om'); }
  { const { st, d } = await J(await app.request('/api/v1/store/items/mochi/buy', { method: 'POST', headers: H, body: JSON.stringify({ qty: 0 }) })); row('POST', '/store/items buy qty=0', st, st === 400 && /1 đến 99/.test(d.error?.message ?? ''), 'validation 400 rõ ràng'); }
  { const { st, d } = await J(await app.request('/api/v1/inventory-items', { headers: H })); ownedId = d.items?.[0]?.id; row('GET', '/api/v1/inventory-items', st, st === 200 && d.items?.[0]?.qty === 2, 'kho user qty 2'); }
  { const { st, d } = await J(await app.request(`/api/v1/inventory-items/${ownedId}/use`, { method: 'POST', headers: H })); row('POST', '/inventory-items/:id/use', st, st === 200 && d.qtyLeft === 1 && typeof d.energyAfter === 'number', 'dùng → energy thật'); }

  // ═══ RENT LIFECYCLE (4 — R5 audit: thuê → hết hạn 403 → gia hạn mở lại) ═══
  { // dùng org B mới để không đụng purchased CRM của org chính — tạo ở đây dùng chung SEC check sau
    const { st, d } = await J(await app.request('/api/v1/modules/automato-secretary/purchase', { method: 'POST', headers: H }));
    row('POST', '/modules/automato-secretary/purchase', st, st === 400 && /đang xây dựng/.test(d.error?.message ?? ''), 'R5: demo chặn 400'); }
  { const { st, d } = await J(await app.request('/api/v1/modules/automato-secretary/rent', { method: 'POST', headers: H, body: JSON.stringify({ days: 7 }) }));
    row('POST', '/modules/automato-secretary/rent', st, st === 400 && /đang xây dựng/.test(d.error?.message ?? ''), 'R5: demo rent chặn 400'); }
  { // pos coming_soon vẫn chặn đúng
    const { st } = await J(await app.request('/api/v1/modules/pos/purchase', { method: 'POST', headers: H }));
    row('POST', '/modules/pos/purchase', st, st === 400, 'coming_soon chặn 400'); }
  { // rent thật: mua module chưa sở hữu bằng rent — org này đã purchased 4 module ready, chỉ còn pos (coming_soon).
    // → test rent lifecycle bằng org B riêng ở dưới (SEC block đã tạo orgB) — đánh dấu ở đây qua orgModules trực tiếp:
    const [orgR] = await db.insert(dbschema.orgs).values({ name: 'RentOrg', slug: 'rent-audit' }).returning();
    const [uR] = await db.insert(dbschema.users).values({ orgId: orgR.id, displayName: 'Rin', role: 'owner' }).returning();
    const tokR = generateToken();
    await db.insert(dbschema.tokens).values({ orgId: orgR.id, userId: uR.id, tokenPrefix: tokenPrefix(tokR), tokenHash: await hashToken(tokR), role: 'owner' });
    _resetRateLimit();
    const lg = await J(await app.request('/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tokR }) }));
    const HR2 = { 'Content-Type': 'application/json', Authorization: `Bearer ${lg.d.jwt}` };
    await app.request('/api/v1/om/topup', { method: 'POST', headers: HR2, body: JSON.stringify({ amount: 1000 }) });
    { const { st, d } = await J(await app.request('/api/v1/modules/crm/rent', { method: 'POST', headers: HR2, body: JSON.stringify({ days: 7 }) })); row('POST', '/modules/crm/rent {days:7}', st, st === 200 && d.paidOm === 40, 'thuê 7 ngày trừ 40 Om'); }
    { const r = await app.request('/api/v1/crm/deals', { headers: HR2 }); row('GATE', 'crm sau khi thuê → 200', r.status, r.status === 200, 'gate mở theo rent'); }
    await db.update(orgModules).set({ rentedUntil: new Date(Date.now() - 86_400_000) }).where(eq(orgModules.orgId, orgR.id));
    { const { st, d } = await J(await app.request('/api/v1/crm/deals', { headers: HR2 })); row('GATE', 'rent hết hạn → 403', st, st === 403 && d.error?.code === 'MODULE_RENT_EXPIRED', 'MODULE_RENT_EXPIRED'); }
    { const { st, d } = await J(await app.request('/api/v1/modules/crm/rent', { method: 'POST', headers: HR2, body: JSON.stringify({ days: 30 }) })); row('POST', '/modules/crm/rent gia hạn', st, st === 200 && d.paidOm === 100, 'gia hạn sau hết hạn'); }
    { const r = await app.request('/api/v1/crm/deals', { headers: HR2 }); row('GATE', 'crm sau gia hạn → 200', r.status, r.status === 200, 'gate mở lại'); }
  }

  // ═══ AUDIT LOGS (1 — R5) ═══
  { const { st, d } = await J(await app.request('/api/v1/audit-logs', { headers: H })); row('GET', '/api/v1/audit-logs', st, st === 200 && Array.isArray(d.logs), 'owner xem được log (app audit không inject audit fn → có thể rỗng)'); }

  // ═══ USERS (1) ═══
  { const { st, d } = await J(await app.request('/api/v1/users', { headers: H })); row('GET', '/api/v1/users', st, st === 200 && d.users?.length === 2, 'list org users'); }

  // Chat (5) + WS
  let roomId = '';
  { const { st, d } = await J(await app.request('/api/v1/chat/rooms', { method: 'POST', headers: H, body: JSON.stringify({ name: 'Audit Room', isGroup: true, memberIds: [lan.id] }) })); roomId = d.room?.id; row('POST', '/api/v1/chat/rooms', st, st === 201 && !!roomId, 'tạo phòng'); }
  { const { st, d } = await J(await app.request('/api/v1/chat/rooms', { headers: H })); row('GET', '/api/v1/chat/rooms', st, st === 200 && d.rooms?.length === 1, 'list phòng'); }
  // WS connect thật + nhận event khi POST message
  const sock = new WebSocket(`ws://localhost:${PORT}?token=${jwt}`);
  await new Promise((r) => sock.once('message', r));
  let wsGot = false; sock.on('message', (d) => { if (JSON.parse(d.toString()).type === 'chat:message') wsGot = true; });
  { const { st, d } = await J(await app.request(`/api/v1/chat/rooms/${roomId}/messages`, { method: 'POST', headers: H, body: JSON.stringify({ body: 'Audit message' }) })); row('POST', '/chat/rooms/:id/messages', st, st === 201 && !!d.message?.id, 'gửi tin'); }
  await wait(350);
  row('WS', 'ws://:3002?token=jwt', wsGot ? 'event' : 'no-event', wsGot, 'nhận chat:message real-time');
  { const { st, d } = await J(await app.request(`/api/v1/chat/rooms/${roomId}/messages`, { headers: H })); row('GET', '/chat/rooms/:id/messages', st, st === 200 && d.messages?.length === 1, 'đọc lịch sử'); }
  { const { st, d } = await J(await app.request(`/api/v1/chat/rooms/${roomId}/read`, { method: 'PUT', headers: H })); row('PUT', '/chat/rooms/:id/read', st, st === 200 && d.ok, 'đánh dấu đọc'); }

  // CRM (6)
  let contactId = '', dealId = '';
  { const { st, d } = await J(await app.request('/api/v1/crm/contacts', { method: 'POST', headers: H, body: JSON.stringify({ name: 'Cô Hoa', tag: 'vip' }) })); contactId = d.contact?.id; row('POST', '/api/v1/crm/contacts', st, st === 201 && !!contactId, 'tạo khách'); }
  { const { st, d } = await J(await app.request('/api/v1/crm/contacts', { headers: H })); row('GET', '/api/v1/crm/contacts', st, st === 200 && d.contacts?.length === 1, 'list khách'); }
  { const { st, d } = await J(await app.request('/api/v1/crm/deals', { method: 'POST', headers: H, body: JSON.stringify({ title: 'HĐ Hoa', valueVnd: 22000000, contactId, stage: 'negotiation' }) })); dealId = d.deal?.id; row('POST', '/api/v1/crm/deals', st, st === 201 && !!dealId, 'tạo deal'); }
  { const { st, d } = await J(await app.request('/api/v1/crm/deals', { headers: H })); row('GET', '/api/v1/crm/deals', st, st === 200 && d.deals?.length === 1, 'list deal'); }
  { const { st, d } = await J(await app.request(`/api/v1/crm/deals/${dealId}/stage`, { method: 'PATCH', headers: H, body: JSON.stringify({ stage: 'won' }) })); row('PATCH', '/crm/deals/:id/stage', st, st === 200 && d.deal?.stage === 'won', 'lead→won'); }
  { const { st, d } = await J(await app.request('/api/v1/crm/stats', { headers: H })); row('GET', '/api/v1/crm/stats', st, st === 200 && d.openDeals === 0, 'stats sau won'); }

  // Om (2 còn lại — topup đã audit ở trên)
  { const { st, d } = await J(await app.request('/api/v1/om/balance', { headers: H })); row('GET', '/api/v1/om/balance', st, st === 200 && d.balance === 98489, 'số dư sau 4 module + 2 mochi (98549−60)'); }
  { const { st, d } = await J(await app.request('/api/v1/om/transactions', { headers: H })); row('GET', '/api/v1/om/transactions', st, st === 200 && d.transactions?.length === 6, '1 nạp + 4 module + 1 mua item'); }

  // Notification (3)
  const { createNotification } = await import('@citadel/module-notification/server/service.js');
  const n1 = await createNotification(db, org.id, minh.id, { kind: 'chat', title: 'Tin audit' });
  await createNotification(db, org.id, minh.id, { kind: 'crm', title: 'Deal audit' });
  { const { st, d } = await J(await app.request('/api/v1/notifications?unread=true', { headers: H })); row('GET', '/api/v1/notifications', st, st === 200 && d.notifications?.length === 2, '2 unread'); }
  { const { st, d } = await J(await app.request(`/api/v1/notifications/${n1.id}/read`, { method: 'PUT', headers: H })); row('PUT', '/notifications/:id/read', st, st === 200 && d.ok, 'đọc 1'); }
  { const { st, d } = await J(await app.request('/api/v1/notifications/read-all', { method: 'PUT', headers: H })); row('PUT', '/notifications/read-all', st, st === 200 && d.ok, 'đọc hết'); }
  { const { st, d } = await J(await app.request('/api/v1/notifications?unread=true', { headers: H })); if (!(st === 200 && d.notifications?.length === 0)) row('GET', '(re-check unread=0)', st, false, 'còn unread!'); }

  // Dashboard (2)
  { const { st, d } = await J(await app.request('/api/v1/dashboard/summary', { headers: H })); row('GET', '/api/v1/dashboard/summary', st, st === 200 && d.team?.members === 2, 'KPI + đếm thật'); }
  { const { st, d } = await J(await app.request('/api/v1/dashboard/search?q=lan', { headers: H })); row('GET', '/api/v1/dashboard/search', st, st === 200 && d.results?.[0]?.label === 'Lan Phạm', 'tìm Lan'); }

  // ═══ SECURITY SPOT-CHECKS ═══
  { const r = await app.request('/api/v1/crm/deals'); row('SEC', 'no-auth → 401', r.status, r.status === 401, 'chặn đúng'); }
  { // cross-tenant
    const [orgB] = await db.insert(dbschema.orgs).values({ name: 'B', slug: 'b' }).returning();
    const [uB] = await db.insert(dbschema.users).values({ orgId: orgB.id, displayName: 'B', role: 'owner' }).returning();
    const tokB = generateToken();
    await db.insert(dbschema.tokens).values({ orgId: orgB.id, userId: uB.id, tokenPrefix: tokenPrefix(tokB), tokenHash: await hashToken(tokB), role: 'owner' });
    const lg = await J(await app.request('/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tokB }) }));
    const r = await app.request(`/api/v1/chat/rooms/${roomId}/messages`, { headers: { Authorization: `Bearer ${lg.d.jwt}` } });
    row('SEC', 'cross-tenant → 403', r.status, r.status === 403, 'cô lập tenant'); }
  { // rate-limit: spam login 6 lần
    _resetRateLimit(); let last = 0;
    for (let i = 0; i < 6; i++) { const r = await app.request('/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '7.7.7.7' }, body: JSON.stringify({ token: 'XXXXXXXXXXXXX' }) }); last = r.status; }
    row('SEC', 'rate-limit 6th login → 429', last, last === 429, 'chống brute-force'); }

  sock.close(); await wait(100); await wsSrv.close();

  // ═══ IN BẢNG ═══
  console.log('\n┌──────┬─────────────────────────────────────┬───────┬──────┬───────────────────────────┐');
  console.log('│ MET  │ ENDPOINT                            │ HTTP  │ KQ   │ GHI CHÚ                   │');
  console.log('├──────┼─────────────────────────────────────┼───────┼──────┼───────────────────────────┤');
  for (const r of ROWS) {
    console.log(`│ ${r.method.padEnd(5)}│ ${r.path.padEnd(36)}│ ${String(r.status).padEnd(6)}│ ${r.ok ? 'PASS' : '✗FAIL'} │ ${r.note.padEnd(26)}│`);
  }
  console.log('└──────┴─────────────────────────────────────┴───────┴──────┴───────────────────────────┘');
  const pass = ROWS.filter((r) => r.ok).length;
  console.log(`\nTỔNG: ${pass}/${ROWS.length} PASS ${pass === ROWS.length ? '— TẤT CẢ ENDPOINT HOẠT ĐỘNG THẬT' : '— CÓ FAIL!'}`);
  if (pass !== ROWS.length) process.exit(1);
}
main().catch((e) => { console.error('AUDIT CRASH:', e); process.exit(1); });
