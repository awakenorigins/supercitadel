import { test, ok, eq, done } from './_h.js';
import { newDb, ctx, ORG_A } from './setup.js';
import * as M from '../src/services/master.service.js';
import * as P from '../src/services/pricing.service.js';
import * as S from '../src/services/sales.service.js';
import * as I from '../src/services/intel.service.js';
import { runScheduledTasks } from '../src/services/automation.js';

const { db } = await newDb();
const emits: { t: string; p: Record<string, unknown> }[] = [];
const c = ctx(ORG_A, 'u-intel', emits);
c.now = new Date('2026-07-06T02:00:00Z');
await M.ensureDefaults(db, c);
await P.setPriceRule(db, c, { productCode: 'SP', unitPrice: '1000000' });

// Khách mua lần cuối 90 ngày trước (churn) + khách mới mua hôm qua (không churn)
const oldBuyer = await M.createCustomer(db, c, { kind: 'person', name: 'Khách Bỏ Đi', phone: '0900000001' });
const freshBuyer = await M.createCustomer(db, c, { kind: 'person', name: 'Khách Mới Mua', phone: '0900000002' });
async function orderAt(cust: string, when: string, qty = 1) {
  const cc = ctx(ORG_A, 'u-intel'); cc.now = new Date(when);
  const o = await S.createOrder(db, cc, { customerId: cust, items: [{ productCode: 'SP', productName: 'SP', qty }] });
  await S.confirmOrder(db, cc, { orderId: o.id });
  return o;
}
await orderAt(oldBuyer.id, '2026-04-07T02:00:00Z', 2);
await orderAt(freshBuyer.id, '2026-07-05T02:00:00Z', 1);

await test('churnScan: khách im 90 ngày bị chấm risk, khách vừa mua thì không', async () => {
  const r = await I.churnScan(db, c);
  eq(r.flagged, 1);
  const list = await I.churnRiskList(db, c);
  eq(list.length, 1);
  eq(list[0]!.customerId, oldBuyer.id);
  ok(list[0]!.risk >= 60, `risk=${list[0]!.risk}`);
});

await test('duplicateScan: 2 khách trùng SĐT → 1 suggestion merge, chạy lại không nhân đôi', async () => {
  await M.createCustomer(db, c, { kind: 'person', name: 'Khach Bo Di Ban Sao', phone: '0900 000 001' });
  const r1 = await I.duplicateScan(db, c);
  eq(r1.suggestions, 1);
  const r2 = await I.duplicateScan(db, c);
  eq(r2.suggestions, 0, 'idempotent khi suggestion còn open');
});

await test('quoteExpiryScan: báo giá quá validUntil → expired', async () => {
  const past = ctx(ORG_A, 'u-intel'); past.now = new Date('2026-06-20T02:00:00Z');
  await S.createQuote(db, past, { customerId: freshBuyer.id, validUntil: '2026-06-30', items: [{ productCode: 'SP', productName: 'SP', qty: 1 }] });
  const r = await I.quoteExpiryScan(db, c);
  eq(r.expired, 1);
  const again = await I.quoteExpiryScan(db, c);
  eq(again.expired, 0);
});

await test('debtAgingRefresh: khách nợ được chấm số ngày tuổi nợ', async () => {
  const r = await I.debtAgingRefresh(db, c);
  ok(r.scored >= 2, `scored=${r.scored}`);
});

await test('nextBestActions gom: nhắc nợ + gộp trùng + win-back churn, sắp theo priority', async () => {
  await S.createQuote(db, c, { customerId: freshBuyer.id, validUntil: '2026-07-10', items: [{ productCode: 'SP', productName: 'SP', qty: 1 }] });
  const acts = await I.nextBestActions(db, c, { limit: 10 });
  ok(acts.some((a) => a.action === 'chase_quote'), 'có chốt báo giá sắp hết hạn');
  ok(acts.some((a) => a.action === 'remind_debt'), 'có nhắc nợ');
  ok(acts.some((a) => a.action === 'merge_customer'), 'có gợi ý gộp trùng');
  ok(acts.some((a) => a.action === 'win_back'), 'có win-back churn');
  for (let i = 1; i < acts.length; i++) ok(acts[i - 1]!.priority >= acts[i]!.priority, 'sort priority desc');
});

await test('runScheduledTasks: đủ 6 job có số liệu, không job nào -1, emit automation.ran', async () => {
  const r = await runScheduledTasks(db, c);
  eq(r.period, '2026-07');
  for (const k of ['quoteExpiry', 'dealHealth', 'churn', 'duplicates', 'targetRollup', 'debtAging'] as const) {
    ok(JSON.stringify(r[k]).indexOf('-1') === -1, `job ${k} chạy sạch: ${JSON.stringify(r[k])}`);
  }
  ok(emits.some((e) => e.t === 'soulsale.automation.ran'));
});

done('07-intel-automation');
