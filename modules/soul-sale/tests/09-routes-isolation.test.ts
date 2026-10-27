import type { MiddlewareHandler } from 'hono';
import { test, ok, eq, done } from './_h.js';
import { newDb, ORG_A, ORG_B } from './setup.js';
import { buildSoulSaleRoutes, soulSaleEventHandlers, soulSaleTools, soulSaleTieuTamActions, SOUL_SALE_SUBSCRIBES } from '../server/host-adapter.js';
import { ssInboxEvents } from '../src/schema.js';
import { eq as deq } from 'drizzle-orm';

const { db } = await newDb();

// Fake host: auth từ header test, gate cho qua (RBAC test thuộc host — module chỉ khai permission đúng)
const requireAuth: MiddlewareHandler = async (c, next) => {
  const org = c.req.header('x-test-org'); const user = c.req.header('x-test-user') ?? 'route-tester';
  if (!org) return c.json({ error: { code: 'UNAUTHORIZED' } }, 401);
  c.set('auth', { sub: user, org_id: org, roles: ['manager'] });
  await next();
};
const gate = (_perm: string): MiddlewareHandler => async (_c, next) => { await next(); };
const emitted: { org: string; t: string; p: Record<string, unknown> }[] = [];
const app = buildSoulSaleRoutes({ db, requireAuth, gate, emit: async (org, t, p) => { emitted.push({ org, t, p }); } });

const jA = { 'x-test-org': ORG_A, 'content-type': 'application/json' };
const jB = { 'x-test-org': ORG_B, 'content-type': 'application/json' };
const post = (path: string, body: unknown, h = jA) => app.request(path, { method: 'POST', headers: h, body: JSON.stringify(body) });

let custId = '';

await test('GET /health public 200; route cần auth trả 401 khi thiếu header', async () => {
  const h = await app.request('/health');
  eq(h.status, 200);
  const noAuth = await app.request('/customers');
  eq(noAuth.status, 401);
});

await test('GET /tools + /actions liệt kê đúng 23/34 cho Tiểu Tâm khám phá', async () => {
  const t = await (await app.request('/tools', { headers: jA })).json() as unknown[];
  const a = await (await app.request('/actions', { headers: jA })).json() as unknown[];
  eq(t.length, 23); eq(a.length, 34);
});

await test('POST /actions/customer.create → tạo thật; emit đi kèm orgId qua deps.emit', async () => {
  const r = await post('/actions/soulsale.customer.create', { kind: 'company', name: 'Cty Route Test', phone: '0905111222' });
  eq(r.status, 200);
  const body = await r.json() as { ok: boolean; data: { id: string; code: string } };
  custId = body.data.id;
  ok(body.data.code.startsWith('KH-'));
  ok(emitted.some((e) => e.org === ORG_A && e.t === 'soulsale.customer.created'));
});

await test('POST /tools/customer.search thấy khách vừa tạo; org B tìm thì rỗng (isolation qua route)', async () => {
  const a = await (await post('/tools/soulsale.customer.search', { q: 'route test' })).json() as { data: unknown[] };
  eq(a.data.length, 1);
  const b = await (await post('/tools/soulsale.customer.search', { q: 'route test' }, jB)).json() as { data: unknown[] };
  eq(b.data.length, 0);
});

await test('org B đọc profile khách org A → 400 CUSTOMER_NOT_FOUND (không lộ tồn tại)', async () => {
  const r = await app.request(`/customers/${custId}`, { headers: jB });
  eq(r.status, 400);
  const body = await r.json() as { error: { code: string } };
  eq(body.error.code, 'CUSTOMER_NOT_FOUND');
});

await test('dry-run qua HTTP: credit.limit-set không confirm → dry_run + preview; confirm:true ghi thật', async () => {
  const dr = await (await post('/actions/soulsale.credit.limit-set', { customerId: custId, limitAmount: '5000000' })).json() as { data: { dry_run: boolean; preview: unknown } };
  eq(dr.data.dry_run, true);
  ok(dr.data.preview, 'preview creditCheck đính kèm');
  const real = await (await post('/actions/soulsale.credit.limit-set', { customerId: custId, limitAmount: '5000000', confirm: true })).json() as { data: { limitAmount: string } };
  eq(real.data.limitAmount, '5000000');
});

await test('zod rác → 422 VALIDATION; action không tồn tại → 404', async () => {
  const bad = await post('/actions/soulsale.customer.create', { kind: 'alien', name: 'X' });
  eq(bad.status, 422);
  const nf = await post('/actions/soulsale.khong.co-that', {});
  eq(nf.status, 404);
});

await test('PATCH /orders/:id/advance sai tuyến → 400 BAD_TRANSITION', async () => {
  await post('/actions/soulsale.price.rule-set', { productCode: 'R1', unitPrice: '100000', confirm: true });
  const or = await (await post('/actions/soulsale.order.create', { customerId: custId, items: [{ productCode: 'R1', productName: 'R1', qty: 1 }] })).json() as { data: { id: string } };
  const r = await app.request(`/orders/${or.data.id}/advance`, { method: 'PATCH', headers: jA, body: JSON.stringify({ to: 'delivered' }) });
  eq(r.status, 400);
  const body = await r.json() as { error: { code: string } };
  eq(body.error.code, 'BAD_TRANSITION');
});

await test('POST /automation/run trả đủ 6 job', async () => {
  const r = await (await post('/automation/run', {})).json() as { data: Record<string, unknown> };
  for (const k of ['quoteExpiry', 'dealHealth', 'churn', 'duplicates', 'targetRollup', 'debtAging']) ok(k in r.data, k);
});

await test('eventHandlers: đủ 3 topic subscribe; payment.created có soulsale_order_id → inbox processed=true, org-scoped', async () => {
  eq(Object.keys(soulSaleEventHandlers).sort(), [...SOUL_SALE_SUBSCRIBES].sort());
  await soulSaleEventHandlers['accounting.payment.created']!({ db }, { orgId: ORG_A, topic: 'accounting.payment.created', payload: { soulsale_order_id: custId, amount: '1' } });
  await soulSaleEventHandlers['kho.stock.low']!({ db }, { orgId: ORG_B, topic: 'kho.stock.low', payload: { sku: 'SP' } });
  const rows = await db.select().from(ssInboxEvents).where(deq(ssInboxEvents.orgId, ORG_A));
  eq(rows.length, 1);
  eq(rows[0]!.processed, true);
});

await test('bề mặt host-adapter: tools/actions map giữ nguyên metadata registry', async () => {
  eq(soulSaleTools.length, 23);
  eq(soulSaleTieuTamActions.length, 34);
  ok(soulSaleTools.every((t) => t.module === 'soul-sale'));
  ok(soulSaleTieuTamActions.every((a) => a.requiredModule === 'soul-sale'));
  eq(soulSaleTieuTamActions.filter((a) => a.securityLevel === 2).length, 14);
});

done('09-routes-isolation');
