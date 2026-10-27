import { test, ok, eq, throws, done } from './_h.js';
import { newDb, ctx, ORG_A } from './setup.js';
import * as M from '../src/services/master.service.js';
import * as C from '../src/services/crm.service.js';

const { db } = await newDb();
const emits: { t: string; p: Record<string, unknown> }[] = [];
const c = ctx(ORG_A, 'u-crm', emits);
await M.ensureDefaults(db, c);

let lead: any, deal: any, cust: any;

await test('createLead: điểm nguồn referral=30 + fresh 10 = 40, emit lead.created', async () => {
  lead = await C.createLead(db, c, { source: 'referral', name: 'Anh Bảy Cà Mau', phone: '84 933 111 222' });
  eq(lead.score, 40);
  eq(lead.phone, '0933111222');
  ok(emits.some((e) => e.t === 'soulsale.lead.created'));
});

await test('assignLead: new → working', async () => {
  const r = await C.assignLead(db, c, { leadId: lead.id, ownerUserId: 'sale-01' });
  eq(r.status, 'working'); eq(r.ownerUserId, 'sale-01');
});

await test('logActivity trên lead → score tăng theo số hoạt động (40+10)', async () => {
  await C.logActivity(db, c, { kind: 'call', subject: 'Gọi giới thiệu', refType: 'lead', refId: lead.id });
  const l = await C.getLead(db, c, lead.id);
  eq(l.score, 50);
});

await test('convertLead: SĐT trùng khách có sẵn 0.95 → tái sử dụng, không tạo trùng', async () => {
  cust = await M.createCustomer(db, c, { kind: 'person', name: 'Bảy Cà Mau', phone: '0933111222' });
  const r = await C.convertLead(db, c, { leadId: lead.id, dealTitle: 'Đơn phân bón vụ hè', amount: '25000000' });
  eq(r.customerReused, true);
  eq(r.customerId, cust.id);
  ok(r.dealId, 'có deal');
  const l = await C.getLead(db, c, lead.id);
  eq(l.status, 'converted');
  ok(emits.some((e) => e.t === 'soulsale.lead.converted'));
  deal = await C.getDeal(db, c, r.dealId);
  eq(deal.amount, '25000000');
});

await test('convert lần 2 bị chặn; disqualify lead đã convert bị chặn', async () => {
  await throws(() => C.convertLead(db, c, { leadId: lead.id }), 'đã convert');
  await throws(() => C.disqualifyLead(db, c, { leadId: lead.id, reason: 'x' }), 'đã convert');
});

await test('lead mới không trùng SĐT → convert tạo khách mới', async () => {
  const l2 = await C.createLead(db, c, { source: 'facebook', name: 'Chị Út Bến Tre', phone: '0988777666' });
  const r = await C.convertLead(db, c, { leadId: l2.id });
  eq(r.customerReused, false);
  const nc = await M.getCustomer(db, c, r.customerId);
  eq(nc.name, 'Chị Út Bến Tre');
});

await test('disqualifyLead ghi lý do', async () => {
  const l3 = await C.createLead(db, c, { source: 'tiktok', name: 'Spam Bot' });
  const r = await C.disqualifyLead(db, c, { leadId: l3.id, reason: 'SĐT ảo' });
  eq(r.status, 'disqualified'); eq(r.disqualifyReason, 'SĐT ảo');
  await throws(() => C.convertLead(db, c, { leadId: l3.id }), 'bị loại');
});

await test('moveDealStage: Báo giá; về Thua bắt buộc lostReason; sau khi đóng thì khoá', async () => {
  const m = await C.moveDealStage(db, c, { dealId: deal.id, stageName: 'Báo giá' });
  eq(m.status, 'open');
  await throws(() => C.moveDealStage(db, c, { dealId: deal.id, stageName: 'Thua' }), 'lý do');
  const lost = await C.moveDealStage(db, c, { dealId: deal.id, stageName: 'Thua', lostReason: 'giá đối thủ rẻ hơn 8%' });
  eq(lost.status, 'lost');
  await throws(() => C.moveDealStage(db, c, { dealId: deal.id, stageName: 'Mới' }), 'không di chuyển');
  ok(emits.filter((e) => e.t === 'soulsale.deal.moved').length >= 2);
});

await test('stage Thắng → status won', async () => {
  const d2 = await C.createDeal(db, c, { customerId: cust.id, title: 'Deal thắng', amount: '10000000' });
  const w = await C.moveDealStage(db, c, { dealId: d2.id, stageName: 'Thắng' });
  eq(w.status, 'won');
});

await test('pipelineSummary: đếm + weighted đúng theo probability', async () => {
  await C.createDeal(db, c, { customerId: cust.id, title: 'Deal A', amount: '10000000' });            // Mới 10%
  const dB = await C.createDeal(db, c, { customerId: cust.id, title: 'Deal B', amount: '20000000' }); // → Báo giá 60%
  await C.moveDealStage(db, c, { dealId: dB.id, stageName: 'Báo giá' });
  const s = await C.pipelineSummary(db, c);
  const moi = s.stages.find((x) => x.stage === 'Mới')!;
  const bg = s.stages.find((x) => x.stage === 'Báo giá')!;
  eq(moi.count >= 1, true);
  eq(bg.weighted, '12000000', '20tr × 60%');
  ok(BigInt(s.weightedTotal) >= 13000000n, 'tổng weighted ≥ 13tr');
});

await test('healthOf rules: hot / cold / at_risk theo ngày im lặng & ngày kẹt stage', async () => {
  const now = new Date('2026-07-06T00:00:00Z');
  const mk = (actDaysAgo: number | null, stageDaysAgo: number) => ({
    lastActivityAt: actDaysAgo === null ? null : new Date(now.getTime() - actDaysAgo * 86400000),
    createdAt: new Date(now.getTime() - 60 * 86400000),
    stageEnteredAt: new Date(now.getTime() - stageDaysAgo * 86400000),
  });
  eq(C.healthOf(now, mk(1, 2), 60), 'hot');
  eq(C.healthOf(now, mk(10, 5), 30), 'cold');
  eq(C.healthOf(now, mk(20, 5), 60), 'at_risk', 'im lặng >14 ngày');
  eq(C.healthOf(now, mk(2, 40), 60), 'at_risk', 'kẹt stage >30 ngày');
  eq(C.healthOf(now, mk(5, 5), 30), 'warm');
});

await test('dealHealthList: deal im lặng 20 ngày bị gắn at_risk (time-travel qua ctx.now)', async () => {
  const past = ctx(ORG_A, 'u-crm'); past.now = new Date('2026-06-10T00:00:00Z');
  const dOld = await C.createDeal(db, past, { customerId: cust.id, title: 'Deal bị bỏ rơi', amount: '5000000' });
  const today = ctx(ORG_A, 'u-crm'); today.now = new Date('2026-07-06T00:00:00Z');
  const list = await C.dealHealthList(db, today, { health: 'at_risk' });
  ok(list.some((d) => d.id === dOld.id), 'deal cũ vào danh sách at_risk');
});

await test('activityTimeline theo ref', async () => {
  await C.logActivity(db, c, { kind: 'note', subject: 'Ghi chú khách', refType: 'customer', refId: cust.id });
  const tl = await C.activityTimeline(db, c, { refType: 'customer', refId: cust.id });
  eq(tl.length, 1);
});

await test('salesForecast trả bucket theo tháng + run-rate, method rule-based minh bạch', async () => {
  const now = ctx(ORG_A, 'u-crm'); now.now = new Date('2026-07-06T00:00:00Z');
  const d = await C.createDeal(db, now, { customerId: cust.id, title: 'Deal tháng này', amount: '30000000', expectedClose: '2026-07-20' });
  await C.moveDealStage(db, now, { dealId: d.id, stageName: 'Báo giá' });
  const f = await C.salesForecast(db, now, { months: 2 });
  eq(f.months.length, 2);
  eq(f.months[0]!.period, '2026-07');
  ok(BigInt(f.months[0]!.pipelineWeighted) >= 18000000n, '30tr×60% nằm trong bucket');
  ok(f.method.includes('rule-based'));
});

done('02-crm');
