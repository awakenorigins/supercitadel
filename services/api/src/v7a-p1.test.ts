// V7A P1 test — audit log (tenant isolation) + progressive security lớp 2 + sensitive gate.
// Chạy: tsx src/v7a-p1.test.ts (PGlite in-memory, không cần Postgres thật)
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { AppError, type JwtPayload } from '@citadel/core';
import { auditLogs, users, orgs, schema } from '@citadel/db';
import { logAudit } from './audit/service.js';
import { buildAuditRoutes } from './audit/routes.js';
import { bindEmail, bindPhone, securityLevelOf, assertSecurityLevel, securityInfo } from './security/service.js';

function assert(c: unknown, m: string) { if (!c) { console.error('  ✗', m); process.exitCode = 1; throw new Error(m); } console.log('  ✓', m); }

const client = new PGlite();
const initSql = readFileSync(new URL('../../../packages/db/migrations/0001_init.sql', import.meta.url), 'utf8')
  .replace(/CREATE EXTENSION IF NOT EXISTS vector;\s*/i, '');
await client.exec(initSql);
await client.exec(readFileSync(new URL('../../../packages/db/migrations/0003_super_admin.sql', import.meta.url), 'utf8'));
await client.exec(readFileSync(new URL('../../../packages/db/migrations/0004_v7a_p1.sql', import.meta.url), 'utf8'));
const db = drizzle(client, { schema }) as any;

// seed 2 org + 2 user (tenant isolation)
const [orgA] = await db.insert(orgs).values({ name: 'Org A', slug: 'org-a' }).returning();
const [orgB] = await db.insert(orgs).values({ name: 'Org B', slug: 'org-b' }).returning();
const [userA] = await db.insert(users).values({ orgId: orgA.id, displayName: 'An', role: 'owner' }).returning();
const [userB] = await db.insert(users).values({ orgId: orgB.id, displayName: 'Bình', role: 'owner' }).returning();
const authA: JwtPayload = { sub: userA.id, orgId: orgA.id, role: 'owner' as any };

// ── 1) Audit log ghi đúng org, tenant isolation ──
await logAudit(db, { orgId: orgA.id, userId: userA.id, action: 'auth.login', resource: 'auth', ip: '1.2.3.4' });
await logAudit(db, { orgId: orgA.id, userId: userA.id, action: 'om.spend', resource: 'om_ledger', detail: { amount: 500 } });
await logAudit(db, { orgId: orgB.id, userId: userB.id, action: 'auth.login', resource: 'auth' });
const logsA = await db.select().from(auditLogs).where(eq(auditLogs.orgId, orgA.id));
assert(logsA.length === 2, 'audit: org A có đúng 2 log');
assert(logsA.every((l: any) => l.orgId === orgA.id), 'audit: mọi log đều gắn org A');
assert(logsA.some((l: any) => l.action === 'om.spend' && l.detail?.amount === 500), 'audit: detail jsonb giữ nguyên');

// GET /audit-logs qua route: owner thấy, staff bị 403, org khác không lộ
const fakeAuth = (auth: JwtPayload) => async (c: any, next: any) => { c.set('auth', auth); await next(); };
const mkApp = (auth: JwtPayload) => {
  const app = new Hono();
  app.onError((e, c) => e instanceof AppError ? c.json(e.toJSON(), e.status as 400) : c.json({ error: { code: 'INTERNAL' } }, 500));
  app.route('/audit-logs', buildAuditRoutes({ db, requireAuth: fakeAuth(auth) }));
  return app;
};
const rOwner = await mkApp(authA).request('/audit-logs');
assert(rOwner.status === 200, 'GET /audit-logs owner → 200');
const bodyOwner = await rOwner.json() as any;
assert(bodyOwner.logs.length === 2 && bodyOwner.logs.every((l: any) => l.orgId === orgA.id), 'GET /audit-logs chỉ trả log org mình (không lộ org B)');
const rStaff = await mkApp({ sub: userA.id, orgId: orgA.id, role: 'staff' as any }).request('/audit-logs');
assert(rStaff.status === 403, 'GET /audit-logs staff → 403');

// ── 2) Bind email/phone nâng security_level ──
assert(await securityLevelOf(db, authA) === 1, 'security: mặc định lớp 1');
let bad = false; try { await bindEmail(db, authA, 'khong-phai-email'); } catch (e) { bad = e instanceof AppError && (e as AppError).status === 400; }
assert(bad, 'bind email sai format → 400');
const be = await bindEmail(db, authA, 'an@caphenha.vn');
assert(be.securityLevel === 2, 'bind email → lớp 2');
assert(await securityLevelOf(db, authA) === 2, 'security: đọc lại từ DB = lớp 2');
let badPhone = false; try { await bindPhone(db, authA, '12ab'); } catch (e) { badPhone = e instanceof AppError; }
assert(badPhone, 'bind phone sai format → lỗi');
const bp = await bindPhone(db, authA, '0912 345 678');
assert(bp.phone === '0912345678' && bp.securityLevel === 2, 'bind phone chuẩn hóa + giữ lớp 2');

// ── 3) Sensitive gate: 403 khi lớp 1, pass khi lớp 2 ──
const authB: JwtPayload = { sub: userB.id, orgId: orgB.id, role: 'owner' as any };
let gated = false;
try { await assertSecurityLevel(db, authB, 2); } catch (e) { gated = e instanceof AppError && (e as AppError).status === 403 && /Bảo mật|bảo mật|lớp 2/.test((e as AppError).message); }
assert(gated, 'gate: lớp 1 → 403 kèm hướng dẫn tiếng Việt');
await assertSecurityLevel(db, authA, 2); // không throw
assert(true, 'gate: lớp 2 → pass (200)');

// ── 4) needsUpgrade: ví > 0 mà lớp < 2 ──
const infoB = await securityInfo(db, authB, 5000);
assert(infoB.needsUpgrade === true && infoB.securityLevel === 1, 'needsUpgrade: ví 5000 Om + lớp 1 → true');
const infoA = await securityInfo(db, authA, 5000);
assert(infoA.needsUpgrade === false, 'needsUpgrade: lớp 2 → false');
const infoB0 = await securityInfo(db, authB, 0);
assert(infoB0.needsUpgrade === false, 'needsUpgrade: ví 0 Om → false');

console.log('[api/v7a-p1] PASSED');
