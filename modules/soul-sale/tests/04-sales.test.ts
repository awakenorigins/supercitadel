import { test, ok, eq, throws, done } from './_h.js';
import { newDb, ctx, ORG_A } from './setup.js';
import * as M from '../src/services/master.service.js';
import * as P from '../src/services/pricing.service.js';
import * as S from '../src/services/sales.service.js';
import { ssOrderStatusLog } from '../src/schema.js';
import { and, eq as deq } from 'drizzle-orm';

const { db } = await newDb();
const emits: { t: string; p: Record<string, unknown> }[] = [];
const c = ctx(ORG_A, 'u-sales', emits);
c.now = new Date('2026-07-06T03:00:00Z');
await M.ensureDefaults(db, c);

const dl = await M.createAgency(db, c, { name: 'Đại lý Sông Tiền', level: 2 });
await P.setPriceRule(db, c, { productCode: 'PB-NPK', unitPrice: '520000' });
await P.setPriceRule(db, c, { productCode: 'PB-NPK', unitPrice: '480000', agencyLevel: 2 });
await P.setPriceRule(db, c, { productCode: 'PB-URE', unitPrice: '350000', discountPct: '5' });

let quote: any, order: any;

await test('createQuote tự resolve giá tầng: đại lý level 2 ăn 480k, tổng đúng', async () => {
  quote = await S.createQuote(db, c, {
    customerId: dl.id, validUntil: '2026-07-20',
    items: [
      { productCode: 'PB-NPK', productName: 'NPK 16-16-8', qty: 10 },
      { productCode: 'PB-URE', productName: 'Urê Phú Mỹ', qty: 20 },
    ],
  });
  ok(/^BG-\d{4}$/.test(quote.code), quote.code);
  // 10×480k + 20×350k×95% = 4.8tr + 6.65tr
  eq(quote.total, '11450000');
  ok(emits.some((e) => e.t === 'soulsale.quote.created'));
});

await test('createQuote chặn khi sản phẩm chưa có giá và không truyền unitPrice', async () => {
  await throws(() => S.createQuote(db, c, { customerId: dl.id, items: [{ productCode: 'SP-LA', productName: 'Hàng lạ', qty: 1 }] }), 'Chưa có giá');
});

await test('closeQuote rejected bắt buộc lý do; accepted thì khoá chốt lại', async () => {
  await throws(() => S.closeQuote(db, c, { quoteId: quote.id, outcome: 'rejected' }), 'lý do');
  const acc = await S.closeQuote(db, c, { quoteId: quote.id, outcome: 'accepted' });
  eq(acc.status, 'accepted');
  await throws(() => S.closeQuote(db, c, { quoteId: quote.id, outcome: 'rejected', reason: 'x' }), 'không chốt lại');
});

await test('createOrder từ quote: copy items, giữ giá đã chốt, mã SO theo kỳ', async () => {
  order = await S.createOrder(db, c, { fromQuoteId: quote.id, paymentTermCode: 'NET15' });
  eq(order.status, 'draft');
  eq(order.grandTotal, '11450000');
  ok(order.code.startsWith('SO-202607-'), order.code);
});

await test('confirmPreview: chưa có hạn mức → willBlock=false (khách không quản công nợ thì cho qua)', async () => {
  const pv = await S.confirmPreview(db, c, { orderId: order.id });
  eq(pv.willBlock, false);
  eq(pv.credit.limit, '0');
});

await test('confirmOrder happy path: status confirmed, log draft→confirmed, emit order.created', async () => {
  const r = await S.confirmOrder(db, c, { orderId: order.id });
  eq(r.status, 'confirmed');
  ok(r.confirmedAt);
  const logs = await db.select().from(ssOrderStatusLog).where(and(deq(ssOrderStatusLog.orgId, ORG_A), deq(ssOrderStatusLog.orderId, order.id)));
  eq(logs.length, 1); eq(logs[0]!.toStatus, 'confirmed');
  ok(emits.some((e) => e.t === 'soulsale.order.created'));
});

await test('credit gate: đặt hạn mức 15tr (đang nợ 11.45tr) → đơn mới 10tr bị CREDIT_EXCEEDED kèm số liệu', async () => {
  await P.setCreditLimit(db, c, { customerId: dl.id, limitAmount: '15000000' });
  const o2 = await S.createOrder(db, c, { customerId: dl.id, items: [{ productCode: 'PB-NPK', productName: 'NPK', qty: 21 }] }); // 21×480k=10.08tr
  const pv = await S.confirmPreview(db, c, { orderId: o2.id });
  eq(pv.willBlock, true);
  await throws(() => S.confirmOrder(db, c, { orderId: o2.id }), 'Vượt hạn mức');
  // duyệt vượt tường minh rồi confirm lọt
  await S.holdToggleOrder(db, c, { orderId: o2.id, hold: false, overrideCredit: true, reason: 'sếp duyệt miệng 06/07' });
  const r = await S.confirmOrder(db, c, { orderId: o2.id });
  eq(r.status, 'confirmed');
  eq(r.creditOverride, true);
});

await test('credit hold chặn confirm bất kể hạn mức', async () => {
  await P.creditHoldToggle(db, c, { customerId: dl.id, hold: true, reason: 'nợ xấu kỳ 6' });
  const o3 = await S.createOrder(db, c, { customerId: dl.id, items: [{ productCode: 'PB-URE', productName: 'Urê', qty: 1 }] });
  await throws(() => S.confirmOrder(db, c, { orderId: o3.id }), 'KHOÁ công nợ');
  await P.creditHoldToggle(db, c, { customerId: dl.id, hold: false });
});

await test('holdToggle: giữ đơn confirmed kèm lý do → on_hold; thả về confirmed; log đủ 2 chiều', async () => {
  await throws(() => S.holdToggleOrder(db, c, { orderId: order.id, hold: true }), 'lý do');
  const h = await S.holdToggleOrder(db, c, { orderId: order.id, hold: true, reason: 'chờ đối chiếu kho' });
  eq(h.status, 'on_hold');
  const rel = await S.holdToggleOrder(db, c, { orderId: order.id, hold: false });
  eq(rel.status, 'confirmed');
  const logs = await db.select().from(ssOrderStatusLog).where(and(deq(ssOrderStatusLog.orgId, ORG_A), deq(ssOrderStatusLog.orderId, order.id)));
  eq(logs.length, 3);
});

await test('advanceOrder tuyến tính: confirmed→delivering→delivered; nhảy cóc bị chặn', async () => {
  await throws(() => S.advanceOrder(db, c, { orderId: order.id, to: 'delivered' }), 'Không đi được');
  await S.advanceOrder(db, c, { orderId: order.id, to: 'delivering' });
  const r = await S.advanceOrder(db, c, { orderId: order.id, to: 'delivered' });
  eq(r.status, 'delivered');
});

await test('recordPayment: thu 5tr trên đơn, refund vượt số đã thu bị chặn, emit payment.recorded', async () => {
  const pay = await S.recordPayment(db, c, { orderId: order.id, kind: 'payment', amount: '5000000', method: 'bank' });
  ok(pay.code.startsWith('PC-202607-'));
  await throws(() => S.recordPayment(db, c, { orderId: order.id, kind: 'refund', amount: '6000000' }), 'vượt số đã thu');
  const rf = await S.recordPayment(db, c, { orderId: order.id, kind: 'refund', amount: '1000000' });
  eq(rf.kind, 'refund');
  ok(emits.filter((e) => e.t === 'soulsale.payment.recorded').length >= 2);
});

await test('exposure phản ánh payment: nợ đơn 1 = 11.45 − 5 + 1 = 7.45tr (+ đơn override 10.08tr)', async () => {
  const cr = await P.creditCheck(db, c, { customerId: dl.id });
  eq(cr.exposure, '17530000');
});

await test('cancelOrder từ delivered bị chặn (đi đường kế toán); hủy đơn confirmed thì log + emit, exposure giảm', async () => {
  await throws(() => S.cancelOrder(db, c, { orderId: order.id, reason: 'x' }), 'chứng từ đảo');
  const orders = await S.searchOrders(db, c, { customerId: dl.id, status: 'confirmed' });
  const target = orders[0]!;
  const r = await S.cancelOrder(db, c, { orderId: target.id, reason: 'đại lý báo nhập nhầm' });
  eq(r.status, 'cancelled');
  ok(emits.some((e) => e.t === 'soulsale.order.cancelled'));
  const cr = await P.creditCheck(db, c, { customerId: dl.id });
  eq(cr.exposure, '7450000', 'đơn hủy rời khỏi phơi nhiễm');
  await throws(() => S.cancelOrder(db, c, { orderId: target.id, reason: 'y' }), 'đã hủy');
});

await test('searchOrders theo kỳ + status + mã', async () => {
  const byPeriod = await S.searchOrders(db, c, { period: '2026-07' });
  ok(byPeriod.length >= 3);
  const byCode = await S.searchOrders(db, c, { q: order.code.slice(-4) });
  ok(byCode.some((o) => o.id === order.id));
});

await test('quoteStatus expiringDays: báo giá sắp hết hạn trong 30 ngày', async () => {
  await S.createQuote(db, c, { customerId: dl.id, validUntil: '2026-07-10', items: [{ productCode: 'PB-URE', productName: 'Urê', qty: 2 }] });
  const exp = await S.quoteStatus(db, c, { expiringDays: 30 });
  ok(exp.length >= 1);
  ok(exp.every((q) => ['draft', 'sent'].includes(q.status)));
});

done('04-sales');
