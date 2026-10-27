// V7A P3 test — vòng kinh tế khép kín: Ví Om → Cửa hàng → Kho chứa → Sử dụng → hiệu ứng thật.
// Mua trừ Om thật + chặn thiếu tiền + audit; tenant isolation kho; use food/recharge/decor; qty giảm/xóa; 404.
// Chạy: tsx src/v7a-p3.test.ts (PGlite in-memory, không cần Postgres thật)
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { eq, and } from 'drizzle-orm';
import { Hono } from 'hono';
import { AppError, type JwtPayload } from '@citadel/core';
import { auditLogs, users, orgs, ttSoulState, userItems, schema } from '@citadel/db';
import { getBalance, topup } from '@citadel/module-om/server/service.js';
import { makeAudit } from './audit/service.js';
import { buildStoreItemRoutes, buildInventoryItemRoutes } from './items/routes.js';

function assert(c: unknown, m: string) { if (!c) { console.error('  ✗', m); process.exitCode = 1; throw new Error(m); } console.log('  ✓', m); }

process.env.BETA_MODE = 'false'; // hiệu ứng energy phải THẬT (không bị beta ghim 100)

const client = new PGlite();
const mig = (f: string) => readFileSync(new URL(`../../../packages/db/migrations/${f}`, import.meta.url), 'utf8')
  .replace(/CREATE EXTENSION IF NOT EXISTS vector;\s*/i, '');
for (const f of ['0001_init.sql', '0002_org_modules.sql', '0003_super_admin.sql', '0004_v7a_p1.sql', '0005_v7a_p2.sql', '0006_v7a_p3.sql', '0007_module_rental.sql', '0013_r112_settings_org.sql']) await client.exec(mig(f));
await client.exec(readFileSync(new URL('../../../modules/om/migrations/0001_om.sql', import.meta.url), 'utf8'));
const db = drizzle(client, { schema }) as any;

// seed 2 org + 2 user (tenant isolation)
const [orgA] = await db.insert(orgs).values({ name: 'Org A', slug: 'org-a' }).returning();
const [orgB] = await db.insert(orgs).values({ name: 'Org B', slug: 'org-b' }).returning();
const [userA] = await db.insert(users).values({ orgId: orgA.id, displayName: 'An', role: 'owner' }).returning();
const [userB] = await db.insert(users).values({ orgId: orgB.id, displayName: 'Bình', role: 'owner' }).returning();
const authA: JwtPayload = { sub: userA.id, orgId: orgA.id, role: 'owner' as any };
const authB: JwtPayload = { sub: userB.id, orgId: orgB.id, role: 'owner' as any };

const fakeAuth = (auth: JwtPayload) => async (c: any, next: any) => { c.set('auth', auth); await next(); };
const mkApp = (auth: JwtPayload) => {
  const app = new Hono();
  app.onError((e, c) => e instanceof AppError ? c.json(e.toJSON(), e.status as 400) : (console.error(e), c.json({ error: { code: 'INTERNAL' } }, 500)));
  app.route('/store', buildStoreItemRoutes({ db, requireAuth: fakeAuth(auth) as any, audit: makeAudit(db) }));
  app.route('/inventory-items', buildInventoryItemRoutes({ db, requireAuth: fakeAuth(auth) as any, audit: makeAudit(db) }));
  return app;
};
const appA = mkApp(authA);
const appB = mkApp(authB);

// ── 1) Catalog ──
let r = await appA.request('/store/items');
let d = await r.json() as any;
assert(r.status === 200 && d.items.length === 6, 'GET /store/items → 6 vật phẩm seed');
const mochi = d.items.find((i: any) => i.code === 'mochi');
assert(mochi && mochi.price === 30 && mochi.effect?.type === 'feed_energy' && mochi.effect?.amount === 20, 'catalog: Bánh Mochi 30 Om, effect feed_energy +20');

// ── 2) Mua thiếu tiền → chặn, không vào kho, số dư không đổi ──
r = await appA.request('/store/items/mochi/buy', { method: 'POST' });
assert(r.status === 409, 'mua khi ví 0 Om → 409 chặn');
d = await r.json() as any;
assert(/Không đủ Om/.test(d.error?.message ?? ''), 'message thiếu tiền tiếng Việt rõ ràng');
assert((await db.select().from(userItems).where(eq(userItems.orgId, orgA.id))).length === 0, 'thiếu tiền → KHÔNG vào kho');
assert(await getBalance(db, orgA.id) === 0, 'thiếu tiền → số dư giữ nguyên 0');

// ── 3) Nạp + mua: trừ Om ĐÚNG, vào kho, audit ──
await topup(db, orgA.id, 500);
r = await appA.request('/store/items/mochi/buy', { method: 'POST' });
d = await r.json() as any;
assert(r.status === 200 && d.paidOm === 30 && d.balance === 470, 'mua Mochi: trừ đúng 30 Om (500→470)');
r = await appA.request('/store/items/mochi/buy', { method: 'POST' });
d = await r.json() as any;
assert(d.qty === 2 && d.balance === 440, 'mua Mochi lần 2: gộp qty=2, số dư 440');
await appA.request('/store/items/pin-sac-day/buy', { method: 'POST' });
await appA.request('/store/items/theme-ho-phach/buy', { method: 'POST' });
assert(await getBalance(db, orgA.id) === 500 - 30 - 30 - 120 - 200, 'số dư chính xác tuyệt đối sau 4 lần mua (120)');
const buyLogs = await db.select().from(auditLogs).where(and(eq(auditLogs.orgId, orgA.id), eq(auditLogs.action, 'store.item_purchase')));
assert(buyLogs.length === 4 && buyLogs.every((l: any) => l.userId === userA.id), 'audit store.item_purchase ghi 4 lần đúng org+user');

// ── 4) Kho: info đầy đủ + tenant isolation ──
r = await appA.request('/inventory-items');
d = await r.json() as any;
assert(d.items.length === 3, 'kho A: 3 dòng (mochi ×2, pin, theme)');
const km = d.items.find((i: any) => i.itemCode === 'mochi');
assert(km.qty === 2 && km.name === 'Bánh Mochi' && km.description.length > 10 && km.category === 'food' && km.effect?.amount === 20, 'kho trả info ĐẦY ĐỦ từ catalog (tên/mô tả/category/effect)');
r = await appB.request('/inventory-items');
d = await r.json() as any;
assert(d.items.length === 0, 'tenant isolation: org B KHÔNG thấy đồ của org A');

// ── 4b) R5: mua qty>1 trong 1 giao dịch — trừ Om đúng tổng, gộp kho đúng ──
{
  const balBefore = await getBalance(db, orgA.id);
  r = await appA.request('/store/items/mochi/buy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ qty: 3 }) });
  d = await r.json() as any;
  assert(r.status === 200 && d.qtyBought === 3 && d.paidOm === 90, 'R5 mua 3 × Mochi: paidOm = 90 (3×30)');
  assert(await getBalance(db, orgA.id) === balBefore - 90, 'R5 mua qty 3: số dư trừ đúng tổng 90');
  assert(d.qty === 5, 'R5 kho gộp mochi 2+3 = 5');
  // qty không hợp lệ → 400 validation rõ ràng
  r = await appA.request('/store/items/mochi/buy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ qty: 0 }) });
  assert(r.status === 400, 'R5 qty=0 → 400 validation');
  r = await appA.request('/store/items/mochi/buy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ qty: 100 }) });
  assert(r.status === 400, 'R5 qty=100 → 400 validation (max 99)');
  // trả kho về trạng thái cũ để các assert sau (qty 2→1) vẫn đúng
  await db.update(userItems).set({ qty: 2 }).where(and(eq(userItems.orgId, orgA.id), eq(userItems.userId, userA.id), eq(userItems.itemCode, 'mochi')));
  await topup(db, orgA.id, 90); // hoàn lại 90 Om để số dư khớp assert sau
}

// ── 5) Use item của người khác → 404 (tenant isolation qua use) ──
r = await appB.request(`/inventory-items/${km.id}/use`, { method: 'POST' });
assert(r.status === 404, 'org B use item của org A → 404');
r = await appA.request('/inventory-items/00000000-0000-0000-0000-000000000099/use', { method: 'POST' });
assert(r.status === 404, 'use item không tồn tại → 404');

// ── 6) Use food: energy tăng ĐÚNG amount, thấy được trước/sau ──
// đặt energy = 45 (tạo soul state nếu chưa có)
const [soul] = await db.select().from(ttSoulState).where(and(eq(ttSoulState.orgId, orgA.id), eq(ttSoulState.userId, userA.id)));
if (!soul) await db.insert(ttSoulState).values({ orgId: orgA.id, userId: userA.id, energy: 45 });
else await db.update(ttSoulState).set({ energy: 45, updatedAt: new Date() }).where(and(eq(ttSoulState.orgId, orgA.id), eq(ttSoulState.userId, userA.id)));

r = await appA.request(`/inventory-items/${km.id}/use`, { method: 'POST' });
d = await r.json() as any;
assert(r.status === 200 && d.energyBefore === 45 && d.energyAfter === 65, 'ăn Mochi: energy 45→65 (+20 đúng amount)');
assert(/Tiểu Tâm ăn Bánh Mochi/.test(d.message) && /45→65/.test(d.message), 'message hiệu ứng tiếng Việt kèm số trước/sau');
assert(d.qtyLeft === 1, 'qty giảm 2→1');

// use lần 2 → hết, row bị xóa
r = await appA.request(`/inventory-items/${km.id}/use`, { method: 'POST' });
d = await r.json() as any;
assert(d.qtyLeft === 0, 'ăn Mochi lần 2: qtyLeft=0');
const leftRows = await db.select().from(userItems).where(and(eq(userItems.orgId, orgA.id), eq(userItems.itemCode, 'mochi')));
assert(leftRows.length === 0, 'qty=0 → row xóa khỏi kho');
r = await appA.request(`/inventory-items/${km.id}/use`, { method: 'POST' });
assert(r.status === 404, 'use item đã hết → 404');

// ── 7) Use recharge: energy → 100 ──
r = await appA.request('/inventory-items');
d = await r.json() as any;
const pin = d.items.find((i: any) => i.itemCode === 'pin-sac-day');
r = await appA.request(`/inventory-items/${pin.id}/use`, { method: 'POST' });
d = await r.json() as any;
assert(r.status === 200 && d.energyAfter === 100 && d.energy === 100, 'Pin Sạc Đầy: energy hồi đầy 100');

// ── 8) Use decor: theme lưu vào hồn ──
r = await appA.request('/inventory-items');
d = await r.json() as any;
const th = d.items.find((i: any) => i.itemCode === 'theme-ho-phach');
r = await appA.request(`/inventory-items/${th.id}/use`, { method: 'POST' });
d = await r.json() as any;
assert(r.status === 200 && d.theme === 'gold', 'Theme Hổ Phách: trả theme=gold cho web đổi màu ngay');
const [soulAfter] = await db.select().from(ttSoulState).where(and(eq(ttSoulState.orgId, orgA.id), eq(ttSoulState.userId, userA.id)));
assert(soulAfter.theme === 'gold', 'theme lưu bền vào tt_soul_state');

// ── 9) Audit item.use ──
const useLogs = await db.select().from(auditLogs).where(and(eq(auditLogs.orgId, orgA.id), eq(auditLogs.action, 'item.use')));
assert(useLogs.length === 4, 'audit item.use ghi đủ 4 lần dùng');
assert(useLogs.some((l: any) => l.detail?.itemCode === 'mochi' && l.detail?.energyBefore === 45 && l.detail?.energyAfter === 65), 'audit detail giữ effect + energy trước/sau');

// ── 10) Vòng khép kín cho org B: nạp → mua → kho → dùng → hiệu ứng ──
await topup(db, orgB.id, 100);
r = await appB.request('/store/items/tra-o-long/buy', { method: 'POST' });
d = await r.json() as any;
assert(r.status === 200 && d.balance === 50, 'org B mua Trà Ô Long: 100→50');
r = await appB.request('/inventory-items');
d = await r.json() as any;
assert(d.items.length === 1 && d.items[0].itemCode === 'tra-o-long', 'kho B chỉ có đồ của B');
await db.insert(ttSoulState).values({ orgId: orgB.id, userId: userB.id, energy: 30 });
r = await appB.request(`/inventory-items/${d.items[0].id}/use`, { method: 'POST' });
d = await r.json() as any;
assert(d.energyBefore === 30 && d.energyAfter === 65, 'VÒNG KHÉP KÍN org B: nạp→mua→kho→dùng→energy 30→65 (+35)');

delete process.env.BETA_MODE;
console.log('[api/v7a-p3] PASSED');
