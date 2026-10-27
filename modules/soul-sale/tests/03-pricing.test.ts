import { test, ok, eq, throws, done } from './_h.js';
import { newDb, ctx, ORG_A } from './setup.js';
import * as M from '../src/services/master.service.js';
import * as P from '../src/services/pricing.service.js';
import { ssOrders, ssPayments } from '../src/schema.js';

const { db } = await newDb();
const c = ctx(ORG_A, 'u-price');
await M.ensureDefaults(db, c);

const npp = await M.createAgency(db, c, { name: 'NPP Giá Test', level: 1 });
const c2 = await M.createAgency(db, c, { name: 'C2 Giá Test', level: 2, parentAgencyCustomerId: npp.id });
const vip = await M.createCustomer(db, c, { kind: 'company', name: 'Khách VIP', segmentCode: 'VIP' });
const thuong = await M.createCustomer(db, c, { kind: 'person', name: 'Khách thường' });

await test('setPriceRule chặn rule đa phạm vi', async () => {
  await throws(() => P.setPriceRule(db, c, { productCode: 'SP01', unitPrice: '100000', customerId: vip.id, agencyLevel: 2 }), 'MỘT phạm vi');
});

await test('resolve: chưa có rule → found=false (không bịa giá)', async () => {
  const r = await P.priceCheck(db, c, { productCode: 'SP01', customerId: thuong.id });
  eq(r.found, false);
});

await test('tầng giá: default 100k / level2 90k / VIP 85k / đích danh 80k — resolve đúng từng đối tượng', async () => {
  await P.setPriceRule(db, c, { productCode: 'SP01', unitPrice: '100000' });
  await P.setPriceRule(db, c, { productCode: 'SP01', unitPrice: '90000', agencyLevel: 2 });
  await P.setPriceRule(db, c, { productCode: 'SP01', unitPrice: '85000', segmentCode: 'VIP' });
  await P.setPriceRule(db, c, { productCode: 'SP01', unitPrice: '80000', customerId: vip.id });
  eq((await P.priceCheck(db, c, { productCode: 'SP01', customerId: thuong.id })).unitPrice, '100000', 'khách thường ăn default');
  const rc2 = await P.priceCheck(db, c, { productCode: 'SP01', customerId: c2.id });
  eq(rc2.unitPrice, '90000'); eq(rc2.source, 'agency_level');
  const rvip = await P.priceCheck(db, c, { productCode: 'SP01', customerId: vip.id });
  eq(rvip.unitPrice, '80000'); eq(rvip.source, 'customer', 'đích danh thắng segment');
});

await test('bậc số lượng minQty: mua 100 ăn giá sỉ, mua 5 ăn giá lẻ', async () => {
  await P.setPriceRule(db, c, { productCode: 'SP02', unitPrice: '50000' });
  await P.setPriceRule(db, c, { productCode: 'SP02', unitPrice: '42000', minQty: 100 });
  eq((await P.priceCheck(db, c, { productCode: 'SP02', qty: 5 })).unitPrice, '50000');
  eq((await P.priceCheck(db, c, { productCode: 'SP02', qty: 150 })).unitPrice, '42000');
});

await test('hiệu lực thời gian: rule khuyến mãi hết hạn không được chọn', async () => {
  await P.setPriceRule(db, c, { productCode: 'SP03', unitPrice: '200000' });
  await P.setPriceRule(db, c, { productCode: 'SP03', unitPrice: '150000', validFrom: '2026-06-01', validTo: '2026-06-30', priority: 10 });
  const inPromo = await P.priceCheck(db, c, { productCode: 'SP03', at: '2026-06-15' });
  eq(inPromo.unitPrice, '150000');
  const after = await P.priceCheck(db, c, { productCode: 'SP03', at: '2026-07-05' });
  eq(after.unitPrice, '200000');
});

await test('discountPct → effectiveUnitPrice trừ đúng, làm tròn về 0', async () => {
  await P.setPriceRule(db, c, { productCode: 'SP04', unitPrice: '99999', discountPct: '10.5' });
  const r = await P.priceCheck(db, c, { productCode: 'SP04' });
  eq(r.effectiveUnitPrice, '89500', '99999 − trunc(10499.895)=10499 → 89500');
});

await test('upsert theo scope: set lại giá level 2 KHÔNG nhân đôi rule', async () => {
  const r1 = await P.setPriceRule(db, c, { productCode: 'SP01', unitPrice: '88000', agencyLevel: 2 });
  eq(r1.upserted, 'updated');
  eq((await P.priceCheck(db, c, { productCode: 'SP01', customerId: c2.id })).unitPrice, '88000');
});

await test('creditCheck khi chưa đặt hạn mức: limit 0, hasLimit=false', async () => {
  const r = await P.creditCheck(db, c, { customerId: c2.id });
  eq(r.limit, '0'); eq(r.hasLimit, false); eq(r.exposure, '0');
});

await test('exposure = đơn mở − đã thu (refund cộng ngược); available; wouldExceed', async () => {
  await P.setCreditLimit(db, c, { customerId: c2.id, limitAmount: '50000000', paymentTermCode: 'NET15' });
  // bơm thẳng 2 đơn mở + 1 đơn draft (không tính) + payments
  const [o1] = await db.insert(ssOrders).values({ orgId: ORG_A, code: 'T-O1', customerId: c2.id, status: 'confirmed', grandTotal: '30000000', createdBy: 'seed' }).returning();
  await db.insert(ssOrders).values({ orgId: ORG_A, code: 'T-O2', customerId: c2.id, status: 'delivered', grandTotal: '15000000', createdBy: 'seed' });
  await db.insert(ssOrders).values({ orgId: ORG_A, code: 'T-O3', customerId: c2.id, status: 'draft', grandTotal: '99000000', createdBy: 'seed' });
  await db.insert(ssPayments).values({ orgId: ORG_A, code: 'T-P1', customerId: c2.id, orderId: o1!.id, kind: 'payment', amount: '10000000', recordedBy: 'seed' });
  await db.insert(ssPayments).values({ orgId: ORG_A, code: 'T-P2', customerId: c2.id, orderId: o1!.id, kind: 'refund', amount: '2000000', recordedBy: 'seed' });
  const r = await P.creditCheck(db, c, { customerId: c2.id, extraAmount: '20000000' });
  eq(r.exposure, '37000000', '45tr − 10tr + 2tr refund');
  eq(r.available, '13000000');
  eq(r.wouldExceed, true, 'thêm 20tr thì vượt');
  const r2 = await P.creditCheck(db, c, { customerId: c2.id, extraAmount: '13000000' });
  eq(r2.wouldExceed, false, 'đúng bằng available thì lọt');
});

await test('creditHoldToggle: khoá phải có lý do; mở thì xoá lý do', async () => {
  await throws(() => P.creditHoldToggle(db, c, { customerId: c2.id, hold: true }), 'lý do');
  const h = await P.creditHoldToggle(db, c, { customerId: c2.id, hold: true, reason: 'quá hạn NET15 hai kỳ' });
  eq(h.hold, true);
  const u = await P.creditHoldToggle(db, c, { customerId: c2.id, hold: false });
  eq(u.hold, false); eq(u.holdReason, null);
});

await test('setPaymentTerm gán NET30 cho khách chưa có credit row (tự tạo limit 0)', async () => {
  const r = await P.setPaymentTerm(db, c, { customerId: thuong.id, termCode: 'NET30' });
  eq(r.term, 'NET30');
  eq(r.creditRow.limitAmount, '0');
  await throws(() => P.setPaymentTerm(db, c, { customerId: thuong.id, termCode: 'NET99' }), 'Không có điều khoản');
});

done('03-pricing');
