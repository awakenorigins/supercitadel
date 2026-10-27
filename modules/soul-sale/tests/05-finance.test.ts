import { test, ok, eq, throws, done } from './_h.js';
import { newDb, ctx, ORG_A } from './setup.js';
import * as M from '../src/services/master.service.js';
import * as P from '../src/services/pricing.service.js';
import * as S from '../src/services/sales.service.js';
import * as F from '../src/services/finance.service.js';
import { ssAgencyStatements } from '../src/schema.js';

const { db } = await newDb();
const emits: { t: string; p: Record<string, unknown> }[] = [];
const c = ctx(ORG_A, 'sale-A', emits);
c.now = new Date('2026-06-15T03:00:00Z'); // làm việc trong kỳ 2026-06
await M.ensureDefaults(db, c);

const npp = await M.createAgency(db, c, { name: 'NPP Cửu Long', level: 1, territoryCode: 'MEKONG' });
const shop = await M.createRetailer(db, c, { name: 'Shop Bến Tre', parentAgencyCustomerId: npp.id });
const le = await M.createCustomer(db, c, { kind: 'person', name: 'Khách lẻ HN' });
await P.setPriceRule(db, c, { productCode: 'SP', unitPrice: '1000000' });

async function mkOrder(cust: string, qty: number, owner: string) {
  const cc = ctx(ORG_A, owner); cc.now = c.now;
  const o = await S.createOrder(db, cc, { customerId: cust, items: [{ productCode: 'SP', productName: 'SP', qty }] });
  await S.confirmOrder(db, cc, { orderId: o.id });
  return o;
}

// kỳ 06: shop 10tr (sale-A) + lẻ 5tr (sale-B); 1 đơn hủy 99tr không được tính
await mkOrder(shop.id, 10, 'sale-A');
await mkOrder(le.id, 5, 'sale-B');
const dead = await mkOrder(shop.id, 99, 'sale-A');
await S.cancelOrder(db, { ...c, userId: 'sale-A' }, { orderId: dead.id, reason: 'test hủy' });

await test('setTarget upsert + validate period', async () => {
  await throws(() => F.setTarget(db, c, { scope: 'org', period: '06/2026', targetAmount: '1' }), 'YYYY-MM');
  await F.setTarget(db, c, { scope: 'user', scopeId: 'sale-A', period: '2026-06', targetAmount: '12000000' });
  await F.setTarget(db, c, { scope: 'agency', scopeId: npp.id, period: '2026-06', targetAmount: '20000000' });
  const again = await F.setTarget(db, c, { scope: 'user', scopeId: 'sale-A', period: '2026-06', targetAmount: '15000000' });
  eq(again.targetAmount, '15000000', 'upsert không nhân dòng');
});

await test('targetProgress: rollup đúng scope, loại đơn hủy — sale-A 10tr/15tr=66.66%, NPP ăn cả tuyến dưới', async () => {
  const rows = await F.targetProgress(db, c, { period: '2026-06' });
  const sa = rows.find((r) => r.scopeId === 'sale-A')!;
  eq(sa.achieved, '10000000');
  eq(sa.pct, 66.66);
  const ag = rows.find((r) => r.scope === 'agency')!;
  eq(ag.achieved, '10000000', 'đơn shop thuộc tuyến NPP');
});

await test('commissionPreview: 2 plan (owner 2%, agency 1%) tính đúng, khách lẻ không sinh hoa hồng agency', async () => {
  await F.setCommissionPlan(db, c, { code: 'HH-NV', name: 'Hoa hồng NV', ratePct: '2', beneficiary: 'owner' });
  await F.setCommissionPlan(db, c, { code: 'HH-DL', name: 'Hoa hồng đại lý', ratePct: '1', beneficiary: 'agency' });
  const pv = await F.commissionPreview(db, c, { period: '2026-06' });
  // owner: 2%×15tr = 300k; agency: 1%×10tr (chỉ đơn shop) = 100k
  eq(pv.total, '400000');
  eq(pv.entryCount, 3);
});

await test('commissionPost idempotent: lần 1 tạo 3, lần 2 skip 3, emit commission.posted', async () => {
  const r1 = await F.commissionPost(db, c, { period: '2026-06' });
  eq(r1.created, 3); eq(r1.skipped, 0);
  const r2 = await F.commissionPost(db, c, { period: '2026-06' });
  eq(r2.created, 0); eq(r2.skipped, 3);
  ok(emits.some((e) => e.t === 'soulsale.commission.posted'));
});

await test('debtSummary top nợ: shop nợ 10tr đứng đầu (chưa thu đồng nào)', async () => {
  const d = (await F.debtSummary(db, c)) as any;
  eq(d.topDebtors[0]!.outstanding, '10000000');
});

await test('debtSnapshotClose kỳ 06: opening 0 → closing đúng; emit debt.closed', async () => {
  await S.recordPayment(db, c, { customerId: shop.id, kind: 'payment', amount: '4000000' });
  const r = await F.debtSnapshotClose(db, c, { period: '2026-06' });
  ok(r.customers >= 2);
  const d = (await F.debtSummary(db, c, { customerId: shop.id })) as any;
  eq(d.recentSnapshots[0]!.closing, '6000000', '10tr − 4tr');
  ok(emits.some((e) => e.t === 'soulsale.debt.closed'));
});

await test('chuỗi kỳ: sang 07 phát sinh 3tr + thu 2tr → opening 6tr, closing 7tr', async () => {
  const c7 = ctx(ORG_A, 'sale-A'); c7.now = new Date('2026-07-06T03:00:00Z');
  const o = await S.createOrder(db, c7, { customerId: shop.id, items: [{ productCode: 'SP', productName: 'SP', qty: 3 }] });
  await S.confirmOrder(db, c7, { orderId: o.id });
  await S.recordPayment(db, c7, { customerId: shop.id, kind: 'payment', amount: '2000000' });
  await F.debtSnapshotClose(db, c7, { period: '2026-07', customerId: shop.id });
  const d = (await F.debtSummary(db, c7, { customerId: shop.id })) as any;
  const snap7 = d.recentSnapshots.find((s: any) => s.period === '2026-07')!;
  eq(snap7.opening, '6000000');
  eq(snap7.invoiced, '3000000');
  eq(snap7.paid, '2000000');
  eq(snap7.closing, '7000000');
});

await test('revenueSummary groupBy owner + period lọc đúng kỳ', async () => {
  const byOwner = await F.revenueSummary(db, c, { period: '2026-06', groupBy: 'owner' });
  eq(byOwner.grandTotal, '15000000');
  const a = byOwner.rows.find((r) => r.key === 'sale-A')!;
  eq(a.total, '10000000');
  const byAgency = await F.revenueSummary(db, c, { period: '2026-06', groupBy: 'agency' });
  ok(byAgency.rows.some((r) => r.key === npp.id && r.total === '10000000'));
});

await test('sellthroughSummary: sell-in 10tr vs sell-out 7tr (statement bơm tay) → gap 3tr', async () => {
  await db.insert(ssAgencyStatements).values({
    orgId: ORG_A, agencyCustomerId: npp.id, batchId: '00000000-0000-0000-0000-00000000aaaa',
    period: '2026-06', revenue: '7000000', ship: '0', deposit: '0', discount: '0', debtDelta: '0', confirmedBy: 'seed',
  });
  const st = await F.sellthroughSummary(db, c, { agencyCustomerId: npp.id, period: '2026-06' });
  eq(st.sellIn, '10000000');
  eq(st.sellOut, '7000000');
  eq(st.gap, '3000000');
});

done('05-finance');
