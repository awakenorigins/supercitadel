// V7A P2 test — API: GET /state, PATCH /engine (audit + swap qua HTTP), chat energy tick, SSE energy event, kiệt sức.
// Chạy: tsx src/v7a-p2.test.ts (PGlite in-memory, không cần Postgres thật)
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { eq, and } from 'drizzle-orm';
import { Hono } from 'hono';
import { AppError, type JwtPayload } from '@citadel/core';
import { auditLogs, users, orgs, ttSoulState, schema } from '@citadel/db';
import { remember } from '@citadel/tieu-tam';
import { makeAudit } from './audit/service.js';
import { buildTieuTamRoutes } from './tieu-tam/routes.js';

function assert(c: unknown, m: string) { if (!c) { console.error('  ✗', m); process.exitCode = 1; throw new Error(m); } console.log('  ✓', m); }

process.env.BETA_MODE = 'false'; // test enforce thật; beta test riêng bên dưới

const client = new PGlite();
const mig = (f: string) => readFileSync(new URL(`../../../packages/db/migrations/${f}`, import.meta.url), 'utf8')
  .replace(/CREATE EXTENSION IF NOT EXISTS vector;\s*/i, '');
for (const f of ['0001_init.sql', '0002_org_modules.sql', '0003_super_admin.sql', '0004_v7a_p1.sql', '0005_v7a_p2.sql', '0006_v7a_p3.sql', '0007_module_rental.sql', '0008_r6_sonnet_default.sql']) await client.exec(mig(f));
const db = drizzle(client, { schema }) as any;

const [orgA] = await db.insert(orgs).values({ name: 'Org A', slug: 'org-a' }).returning();
const [userA] = await db.insert(users).values({ orgId: orgA.id, displayName: 'An', role: 'owner' }).returning();
const authA: JwtPayload = { sub: userA.id, orgId: orgA.id, role: 'owner' as any };

const fakeAuth = (auth: JwtPayload) => async (c: any, next: any) => { c.set('auth', auth); await next(); };
const app = new Hono();
app.onError((e, c) => e instanceof AppError ? c.json(e.toJSON(), e.status as 400) : (console.error(e), c.json({ error: { code: 'INTERNAL' } }, 500)));
app.route('/tieu-tam', buildTieuTamRoutes({ db, requireAuth: fakeAuth(authA) as any, audit: makeAudit(db) }));
const H = { 'Content-Type': 'application/json' };

// ── 1) GET /state ──
let r = await app.request('/tieu-tam/state');
assert(r.status === 200, 'GET /state → 200');
let d = await r.json() as any;
assert(d.energy === 100 && d.status === 'tran_day' && d.engine === 'sonnet-4.6', 'state khởi tạo: 100 / Tràn đầy / sonnet-4.6');
assert(d.statusLabel === 'Tràn đầy' && typeof d.statusMessage === 'string', 'state có label + message tiếng Việt');
assert(d.betaMode === false, 'state phản ánh BETA_MODE=false');

// ── 2) Chat trừ energy + học ngược về hồn ──
await db.update(ttSoulState).set({ engine: 'stub-a' }).where(and(eq(ttSoulState.orgId, orgA.id), eq(ttSoulState.userId, userA.id)));
await remember(db, orgA.id, userA.id, 'topic', 'Dự án Citadel tới bước Phase 2', 0.8);
r = await app.request('/tieu-tam/chat', { method: 'POST', headers: H, body: JSON.stringify({ message: 'tôi tên là Khoa, dự án Citadel tới đâu rồi?' }) });
d = await r.json() as any;
assert(r.status === 200 && d.text.includes('Phase 2'), 'chat trả lời từ trí nhớ (Phase 2)');
assert(d.energy === 95 && d.status === 'tran_day', 'lượt nặng trừ 5 → 95 trong response');
r = await app.request('/tieu-tam/chat', { method: 'POST', headers: H, body: JSON.stringify({ message: 'em còn nhớ tôi tên gì không?' }) });
d = await r.json() as any;
assert(d.text.includes('Khoa'), 'học ngược về hồn: nhớ tên Khoa từ lượt trước');

// ── 3) PATCH /engine — gạt công tắc + audit ──
r = await app.request('/tieu-tam/engine', { method: 'PATCH', headers: H, body: JSON.stringify({ engine: 'gpt-99' }) });
assert(r.status === 400, 'PATCH /engine tên lạ → 400');
r = await app.request('/tieu-tam/engine', { method: 'PATCH', headers: H, body: JSON.stringify({ engine: 'stub-b' }) });
d = await r.json() as any;
assert(r.status === 200 && d.engine === 'stub-b', 'PATCH /engine → stub-b');
const logs = await db.select().from(auditLogs).where(eq(auditLogs.orgId, orgA.id));
const el = logs.find((l: any) => l.action === 'tieu_tam.engine_change');
assert(!!el && el.detail?.from === 'stub-a' && el.detail?.to === 'stub-b', 'audit ghi vết engine_change from/to');

// ── 4) Swap qua HTTP: engine mới vẫn trả lời đúng fact ──
r = await app.request('/tieu-tam/chat', { method: 'POST', headers: H, body: JSON.stringify({ message: 'em còn nhớ tôi tên gì không?' }) });
d = await r.json() as any;
assert(d.text.includes('Khoa'), 'sau swap stub-b: vẫn nhớ tên Khoa (hồn giữ nguyên)');

// ── 5) SSE stream có event energy ──
r = await app.request('/tieu-tam/chat/stream', { method: 'POST', headers: H, body: JSON.stringify({ message: 'doanh thu hôm nay' }) });
const txt = await r.text();
assert(r.status === 200 && txt.includes('event: energy') && txt.includes('event: token') && txt.includes('event: done'), 'SSE: energy tick + token + done');

// ── 6) Kiệt sức: từ chối việc nặng, vẫn trò chuyện nhẹ ──
await db.update(ttSoulState).set({ energy: 8, updatedAt: new Date() })
  .where(and(eq(ttSoulState.orgId, orgA.id), eq(ttSoulState.userId, userA.id)));
r = await app.request('/tieu-tam/chat', { method: 'POST', headers: H, body: JSON.stringify({ message: 'doanh thu hôm nay bao nhiêu' }) });
d = await r.json() as any;
assert(d.refused === true && /em mệt rồi/i.test(d.text), 'kiệt sức + việc nặng → từ chối dễ thương');
r = await app.request('/tieu-tam/chat', { method: 'POST', headers: H, body: JSON.stringify({ message: 'chào em' }) });
d = await r.json() as any;
assert(d.refused === false, 'kiệt sức vẫn trò chuyện nhẹ');

// ── 7) BETA_MODE=true: không bao giờ cạn/từ chối ──
process.env.BETA_MODE = 'true';
r = await app.request('/tieu-tam/chat', { method: 'POST', headers: H, body: JSON.stringify({ message: 'doanh thu hôm nay bao nhiêu' }) });
d = await r.json() as any;
assert(d.refused === false && d.energy === 100, 'beta mode: việc nặng OK, energy giữ 100');
delete process.env.BETA_MODE;

console.log('[api/v7a-p2] PASSED');
