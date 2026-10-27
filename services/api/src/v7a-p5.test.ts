// V7A P5 test — trang riêng Tiểu Tâm: GET/DELETE /memories (org isolation + audit memory_delete).
// Chạy: tsx src/v7a-p5.test.ts (PGlite in-memory, không cần Postgres thật)
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { AppError, type JwtPayload } from '@citadel/core';
import { auditLogs, users, orgs, ttMemories, schema } from '@citadel/db';
import { remember } from '@citadel/tieu-tam';
import { makeAudit } from './audit/service.js';
import { buildTieuTamRoutes } from './tieu-tam/routes.js';

function assert(c: unknown, m: string) { if (!c) { console.error('  ✗', m); process.exitCode = 1; throw new Error(m); } console.log('  ✓', m); }

const client = new PGlite();
const mig = (f: string) => readFileSync(new URL(`../../../packages/db/migrations/${f}`, import.meta.url), 'utf8')
  .replace(/CREATE EXTENSION IF NOT EXISTS vector;\s*/i, '');
for (const f of ['0001_init.sql', '0002_org_modules.sql', '0003_super_admin.sql', '0004_v7a_p1.sql', '0005_v7a_p2.sql', '0006_v7a_p3.sql', '0007_module_rental.sql', '0013_r112_settings_org.sql']) await client.exec(mig(f));
const db = drizzle(client, { schema }) as any;

const [orgA] = await db.insert(orgs).values({ name: 'Org A', slug: 'p5-org-a' }).returning();
const [orgB] = await db.insert(orgs).values({ name: 'Org B', slug: 'p5-org-b' }).returning();
const [userA] = await db.insert(users).values({ orgId: orgA.id, displayName: 'An', role: 'owner' }).returning();
const [userA2] = await db.insert(users).values({ orgId: orgA.id, displayName: 'Bình', role: 'staff' }).returning();
const [userB] = await db.insert(users).values({ orgId: orgB.id, displayName: 'Cường', role: 'owner' }).returning();
const authA: JwtPayload = { sub: userA.id, orgId: orgA.id, role: 'owner' as any };
const authA2: JwtPayload = { sub: userA2.id, orgId: orgA.id, role: 'staff' as any };
const authB: JwtPayload = { sub: userB.id, orgId: orgB.id, role: 'owner' as any };

const fakeAuth = (auth: JwtPayload) => async (c: any, next: any) => { c.set('auth', auth); await next(); };
const mkApp = (auth: JwtPayload) => {
  const app = new Hono();
  app.onError((e, c) => e instanceof AppError ? c.json(e.toJSON(), e.status as 400) : (console.error(e), c.json({ error: { code: 'INTERNAL' } }, 500)));
  app.route('/tieu-tam', buildTieuTamRoutes({ db, requireAuth: fakeAuth(auth) as any, audit: makeAudit(db) }));
  return app;
};
const appA = mkApp(authA);
const appA2 = mkApp(authA2);
const appB = mkApp(authB);

// seed trí nhớ: user A (2 mảnh) + org-level (1 mảnh userId NULL) + user B org khác (1 mảnh)
const memA1 = await remember(db, orgA.id, userA.id, 'person', 'Người dùng tên là Khoa', 0.9);
await remember(db, orgA.id, userA.id, 'topic', 'Đang quan tâm dự án Citadel', 0.7);
const memOrg = await remember(db, orgA.id, null, 'fact', 'Quán mở cửa 7h sáng', 0.6);
const memB = await remember(db, orgB.id, userB.id, 'person', 'Người dùng tên là Cường', 0.9);

// ── 1) GET /memories: đủ trí nhớ của mình + org-level, KHÔNG lộ org khác ──
let r = await appA.request('/tieu-tam/memories');
assert(r.status === 200, 'GET /memories → 200');
let d = await r.json() as any;
assert(d.memories.length === 3, 'user A thấy 3 mảnh (2 của mình + 1 org-level)');
assert(d.memories.every((m: any) => m.id && m.kind && m.content && typeof m.salience === 'number'), 'mỗi mảnh có id/kind/content/salience');
assert(!d.memories.some((m: any) => m.content.includes('Cường')), 'KHÔNG lộ trí nhớ org B (tenant isolation)');

r = await appB.request('/tieu-tam/memories');
d = await r.json() as any;
assert(d.memories.length === 1 && d.memories[0].content.includes('Cường'), 'org B chỉ thấy trí nhớ của org B');

// ── 2) DELETE /memories/:id — xóa trí nhớ của mình + audit ──
r = await appA.request(`/tieu-tam/memories/${memA1.id}`, { method: 'DELETE' });
d = await r.json() as any;
assert(r.status === 200 && d.ok === true, 'DELETE trí nhớ của mình → 200 ok');
const left = await db.select().from(ttMemories).where(eq(ttMemories.id, memA1.id));
assert(left.length === 0, 'mảnh trí nhớ đã bị xóa thật khỏi DB');
const logs = await db.select().from(auditLogs).where(eq(auditLogs.orgId, orgA.id));
const dl = logs.find((l: any) => l.action === 'tieu_tam.memory_delete');
assert(!!dl && dl.resourceId === memA1.id && dl.userId === userA.id, 'audit tieu_tam.memory_delete ghi đúng resource + user');

// ── 3) DELETE cross-org → 404, trí nhớ org B còn nguyên ──
r = await appA.request(`/tieu-tam/memories/${memB.id}`, { method: 'DELETE' });
assert(r.status === 404, 'DELETE trí nhớ org khác → 404 (tenant isolation)');
const stillB = await db.select().from(ttMemories).where(eq(ttMemories.id, memB.id));
assert(stillB.length === 1, 'trí nhớ org B còn nguyên sau attempt cross-org');

// ── 4) DELETE trí nhớ user khác cùng org → 404 (user chỉ xóa của mình / org-level) ──
const memA2own = await remember(db, orgA.id, userA2.id, 'preference', 'Người dùng thích trà sữa', 0.6);
r = await appA.request(`/tieu-tam/memories/${memA2own.id}`, { method: 'DELETE' });
assert(r.status === 404, 'user A không xóa được trí nhớ riêng của user khác cùng org');
r = await appA2.request(`/tieu-tam/memories/${memA2own.id}`, { method: 'DELETE' });
assert(r.status === 200, 'chính chủ (user A2) xóa được trí nhớ của mình');

// ── 5) DELETE org-level memory: thành viên org xóa được (trí nhớ chung) ──
r = await appA.request(`/tieu-tam/memories/${memOrg.id}`, { method: 'DELETE' });
assert(r.status === 200, 'xóa được trí nhớ org-level (userId NULL) trong org mình');

// ── 6) id rác không crash ──
r = await appA.request('/tieu-tam/memories/not-a-uuid', { method: 'DELETE' });
assert(r.status === 404, 'id không phải uuid → 404 sạch, không crash');
r = await appA.request('/tieu-tam/memories/00000000-0000-4000-8000-000000000000', { method: 'DELETE' });
assert(r.status === 404, 'uuid không tồn tại → 404');

// ── 7) GET /memories sau khi xóa: phản ánh đúng ──
r = await appA.request('/tieu-tam/memories');
d = await r.json() as any;
assert(d.memories.length === 1 && d.memories[0].content.includes('Citadel'), 'GET sau xóa: chỉ còn 1 mảnh đúng nội dung');

// ── 8) GET /state vẫn hoạt động (không phá tính năng cũ) ──
r = await appA.request('/tieu-tam/state');
d = await r.json() as any;
assert(r.status === 200 && typeof d.energy === 'number' && d.statusLabel, 'GET /state còn nguyên (energy + statusLabel)');

console.log('[api/v7a-p5] PASSED');
