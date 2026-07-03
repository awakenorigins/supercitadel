// V8 rent test — thuê module theo gói ngày: trừ Om đúng, gate mở khi rent,
// hết hạn chặn (MODULE_RENT_EXPIRED), gia hạn cộng dồn từ thời điểm còn lại.
// Chạy: tsx src/v8-rent.test.ts (PGlite in-memory, không cần Postgres thật)
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { eq, and } from 'drizzle-orm';
import { Hono } from 'hono';
import { AppError, type JwtPayload } from '@citadel/core';
import { auditLogs, users, orgs, orgModules, schema } from '@citadel/db';
import { getBalance, topup } from '@citadel/module-om/server/service.js';
import { makeAudit } from './audit/service.js';
import { buildModuleRoutes, requireModule, rentPriceOm } from './modules/routes.js';

function assert(c: unknown, m: string) { if (!c) { console.error('  ✗', m); process.exitCode = 1; throw new Error(m); } console.log('  ✓', m); }

const client = new PGlite();
const mig = (f: string) => readFileSync(new URL(`../../../packages/db/migrations/${f}`, import.meta.url), 'utf8')
  .replace(/CREATE EXTENSION IF NOT EXISTS vector;\s*/i, '');
for (const f of ['0001_init.sql', '0002_org_modules.sql', '0003_super_admin.sql', '0004_v7a_p1.sql', '0005_v7a_p2.sql', '0006_v7a_p3.sql', '0007_module_rental.sql']) await client.exec(mig(f));
await client.exec(readFileSync(new URL('../../../modules/om/migrations/0001_om.sql', import.meta.url), 'utf8'));
const db = drizzle(client, { schema }) as any;

const [orgA] = await db.insert(orgs).values({ name: 'Org A', slug: 'org-a' }).returning();
const [userA] = await db.insert(users).values({ orgId: orgA.id, displayName: 'An', role: 'owner' }).returning();
const authA: JwtPayload = { sub: userA.id, orgId: orgA.id, role: 'owner' as any };
const fakeAuth = async (c: any, next: any) => { c.set('auth', authA); await next(); };

const app = new Hono();
app.onError((e, c) => e instanceof AppError ? c.json(e.toJSON(), e.status as 400) : (console.error(e), c.json({ error: { code: 'INTERNAL' } }, 500)));
app.route('/modules', buildModuleRoutes({ db, requireAuth: fakeAuth as any, audit: makeAudit(db) }));
// route giả lập được gate bởi requireModule('crm')
app.get('/crm-ping', fakeAuth as any, requireModule(db, 'crm'), (c) => c.json({ pong: true }));

const DAY = 86_400_000;
const post = (p: string, body?: unknown) => app.request(p, { method: 'POST', ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}) });

// ── 1) days không hợp lệ → 400 ──
let r = await post('/modules/crm/rent', { days: 15 });
assert(r.status === 400, 'rent days=15 → 400 gói không hợp lệ');
r = await post('/modules/crm/rent', {});
assert(r.status === 400, 'rent thiếu days → 400');

// ── 2) không đủ Om → 400 message tiếng Việt, không set rented ──
r = await post('/modules/crm/rent', { days: 7 });
let d = await r.json() as any;
assert(r.status === 400 && /Không đủ Om/.test(d.error?.message ?? ''), 'ví 0 Om → 400 "Không đủ Om" tiếng Việt');
assert((await db.select().from(orgModules).where(eq(orgModules.orgId, orgA.id))).every((m: any) => !m.rentedUntil), 'thiếu tiền → không set rented_until');

// ── 3) rent 7 ngày CRM (priceOm 400 → ceil(400*0.10)=40): trừ đúng, gate mở ──
await topup(db, orgA.id, 1000);
r = await post('/modules/crm/rent', { days: 7 });
d = await r.json() as any;
assert(r.status === 200 && d.paidOm === 40 && d.balance === 960, `rent CRM 7 ngày: trừ đúng 40 Om (1000→960), paidOm=${d.paidOm}`);
assert(rentPriceOm(400, 30) === 100 && rentPriceOm(400, 90) === 240 && rentPriceOm(250, 7) === 25, 'bảng giá: 30d=25%, 90d=60%, ceil đúng');
const until1 = new Date(d.rentedUntil).getTime();
assert(Math.abs(until1 - (Date.now() + 7 * DAY)) < 5000, 'rented_until ≈ now + 7 ngày');

r = await app.request('/crm-ping');
assert(r.status === 200 && ((await r.json()) as any).pong === true, 'gate requireModule MỞ khi đang thuê');

// GET /modules trả rentedUntil + rentDaysLeft
r = await app.request('/modules');
d = await r.json() as any;
const crm = d.modules.find((m: any) => m.id === 'crm');
assert(crm.rentedUntil && crm.rentDaysLeft === 7 && crm.active === true && crm.purchased === false, 'GET /modules: crm có rentedUntil + rentDaysLeft=7, active, chưa purchased');

// audit module.rent
const logs = await db.select().from(auditLogs).where(and(eq(auditLogs.orgId, orgA.id), eq(auditLogs.action, 'module.rent')));
assert(logs.length === 1 && logs[0].detail?.days === 7 && logs[0].detail?.paidOm === 40, 'audit module.rent ghi {days:7, paidOm:40}');

// ── 4) gia hạn cộng dồn từ thời điểm CÒN LẠI ──
r = await post('/modules/crm/rent', { days: 30 });
d = await r.json() as any;
assert(r.status === 200 && d.paidOm === 100 && d.balance === 860, 'gia hạn 30 ngày: trừ 100 Om (960→860)');
const until2 = new Date(d.rentedUntil).getTime();
assert(Math.abs(until2 - (until1 + 30 * DAY)) < 5000, 'gia hạn CỘNG DỒN: rented_until cũ + 30 ngày (không reset từ now)');

// ── 5) hết hạn → gate chặn 403 MODULE_RENT_EXPIRED ──
await db.update(orgModules).set({ rentedUntil: new Date(Date.now() - DAY) })
  .where(and(eq(orgModules.orgId, orgA.id), eq(orgModules.moduleId, 'crm')));
r = await app.request('/crm-ping');
d = await r.json() as any;
assert(r.status === 403 && d.error?.code === 'MODULE_RENT_EXPIRED', 'hết hạn thuê → 403 MODULE_RENT_EXPIRED');
assert(/hết hạn thuê/.test(d.error?.message ?? ''), 'message tiếng Việt "hết hạn thuê — gia hạn trong Cửa hàng"');

// GET /modules: hết hạn → rentDaysLeft null
r = await app.request('/modules');
d = await r.json() as any;
assert(d.modules.find((m: any) => m.id === 'crm').rentDaysLeft === null, 'hết hạn → rentDaysLeft=null');

// ── 6) gia hạn sau khi hết hạn → tính từ NOW (không từ quá khứ) ──
r = await post('/modules/crm/rent', { days: 7 });
d = await r.json() as any;
const until3 = new Date(d.rentedUntil).getTime();
assert(r.status === 200 && Math.abs(until3 - (Date.now() + 7 * DAY)) < 5000, 'gia hạn khi ĐÃ hết hạn → tính từ now + 7 ngày');
r = await app.request('/crm-ping');
assert(r.status === 200, 'gate mở lại sau gia hạn');

// ── 7) module đã purchased → rent bị chặn ──
await topup(db, orgA.id, 1000);
r = await post('/modules/hr/purchase');
assert(r.status === 200, 'mua đứt HR ok');
r = await post('/modules/hr/rent', { days: 7 });
assert(r.status === 409, 'đã mua đứt → rent 409');

assert(await getBalance(db, orgA.id) === 1000 - 40 - 100 - 40 + 1000 - 250, 'số dư cuối chính xác tuyệt đối');

console.log('\nv8-rent: ALL PASS');
