import { test, ok, eq, throws, done } from './_h.js';
import { newDb, ctx, ORG_A } from './setup.js';
import { readTools } from '../src/registry/reads.js';
import { writeActions } from '../src/registry/writes.js';
import { executeAction, type DryRunPreview } from '../src/contract.js';
import * as M from '../src/services/master.service.js';
import * as P from '../src/services/pricing.service.js';
import * as S from '../src/services/sales.service.js';
import { ssActionAudit } from '../src/schema.js';
import { and, eq as deq } from 'drizzle-orm';

const SLUG = /^soulsale\.[a-z]+(-[a-z]+)*\.[a-z]+(-[a-z]+)*$/;
const PERMS = new Set([
  'soulsale.customer.read', 'soulsale.customer.write', 'soulsale.channel.read', 'soulsale.channel.write',
  'soulsale.lead.read', 'soulsale.lead.write', 'soulsale.deal.read', 'soulsale.deal.write',
  'soulsale.quote.read', 'soulsale.quote.write', 'soulsale.order.read', 'soulsale.order.write',
  'soulsale.finance.read', 'soulsale.finance.write', 'soulsale.price.read', 'soulsale.price.write',
  'soulsale.target.read', 'soulsale.target.write', 'soulsale.import.read', 'soulsale.import.write',
  'soulsale.report.read',
]);

await test('bề mặt 57 tác vụ: 23 read + 34 write, không trùng tên', async () => {
  eq(readTools.length, 23);
  eq(writeActions.length, 34);
  const names = [...readTools.map((t) => t.name), ...writeActions.map((a) => a.name)];
  eq(new Set(names).size, 57, 'tên duy nhất');
});

await test('slug chuẩn hyphen 3 đoạn soulsale.resource.action — không underscore', async () => {
  for (const n of [...readTools, ...writeActions].map((x) => x.name)) {
    ok(SLUG.test(n), `slug lệch chuẩn: ${n}`);
    ok(!n.includes('_'), `slug chứa underscore: ${n}`);
  }
});

await test('mọi permission nằm trong bộ 21 key; read dùng *.read, write dùng *.write', async () => {
  for (const t of readTools) {
    ok(PERMS.has(t.permission), `read perm lạ: ${t.permission}`);
    ok(t.permission.endsWith('.read'), `read tool phải perm .read: ${t.name}`);
  }
  for (const a of writeActions) {
    ok(PERMS.has(a.permission), `write perm lạ: ${a.permission}`);
    ok(a.permission.endsWith('.write'), `write action phải perm .write: ${a.name}`);
  }
});

await test('đúng 14 action L2; sensitive ⟺ securityLevel 2; L2 nào cũng có preview thật trừ plan-set', async () => {
  const l2 = writeActions.filter((a) => a.securityLevel === 2);
  eq(l2.length, 14);
  for (const a of writeActions) eq(a.sensitive, a.securityLevel === 2, `lệch sensitive/level: ${a.name}`);
  const noPreview = l2.filter((a) => !a.preview).map((a) => a.name);
  eq(noPreview, ['soulsale.commission.plan-set'], 'chỉ plan-set (metadata thuần) không cần preview DB');
});

await test('mọi tác vụ đủ description + params zod + ví dụ tiếng Việt', async () => {
  for (const x of [...readTools, ...writeActions]) {
    ok(x.description.length >= 20, `description quá ngắn: ${x.name}`);
    ok(x.params && typeof (x.params as { parse?: unknown }).parse === 'function', `thiếu zod params: ${x.name}`);
    ok((x.examples?.length ?? 0) >= 1, `thiếu ví dụ: ${x.name}`);
  }
});

/* ---- protocol dry-run → confirm end-to-end trên action thật ---- */
const { db } = await newDb();
const c = ctx(ORG_A, 'u-reg');
await M.ensureDefaults(db, c);
const kh = await M.createCustomer(db, c, { kind: 'company', name: 'Cty Registry Test' });
await P.setPriceRule(db, c, { productCode: 'SP', unitPrice: '2000000' });
await P.setCreditLimit(db, c, { customerId: kh.id, limitAmount: '3000000' });
const order = await S.createOrder(db, c, { customerId: kh.id, items: [{ productCode: 'SP', productName: 'SP', qty: 2 }] }); // 4tr > 3tr limit
const confirmAction = writeActions.find((a) => a.name === 'soulsale.order.confirm')!;

await test('executeAction dry-run: sensitive không confirm → preview công nợ thật + audit dryrun, KHÔNG ghi', async () => {
  const r = (await executeAction(db, c, confirmAction, { orderId: order.id })) as DryRunPreview;
  eq(r.dry_run, true);
  eq(r.requires_security_level, 2);
  const pv = r.preview as { willBlock: boolean; credit: { available: string } };
  eq(pv.willBlock, true, 'preview báo trước sẽ kẹt cổng công nợ');
  eq(pv.credit.available, '3000000');
  const o = await S.getOrder(db, c, order.id);
  eq(o.status, 'draft', 'dry-run không đổi trạng thái');
  const audits = await db.select().from(ssActionAudit).where(and(deq(ssActionAudit.orgId, ORG_A), deq(ssActionAudit.action, 'soulsale.order.confirm')));
  eq(audits[0]!.result, 'dryrun');
});

await test('confirm:true chạy thật — kẹt CREDIT_EXCEEDED được audit error; nâng hạn mức rồi chạy lại → ok', async () => {
  await throws(() => executeAction(db, c, confirmAction, { orderId: order.id, confirm: true }), 'Vượt hạn mức');
  const limitAction = writeActions.find((a) => a.name === 'soulsale.credit.limit-set')!;
  await executeAction(db, c, limitAction, { customerId: kh.id, limitAmount: '10000000', confirm: true });
  const r = (await executeAction(db, c, confirmAction, { orderId: order.id, confirm: true })) as { status: string };
  eq(r.status, 'confirmed');
  const audits = await db.select().from(ssActionAudit).where(and(deq(ssActionAudit.orgId, ORG_A), deq(ssActionAudit.action, 'soulsale.order.confirm')));
  eq(audits.map((a) => a.result).sort(), ['dryrun', 'error', 'ok']);
});

await test('zod fail-fast: input rác bị chặn TRƯỚC khi đụng DB, kể cả có confirm', async () => {
  await throws(() => executeAction(db, c, confirmAction, { orderId: 'not-a-uuid', confirm: true }));
  const payAction = writeActions.find((a) => a.name === 'soulsale.payment.record')!;
  await throws(() => executeAction(db, c, payAction, { customerId: kh.id, kind: 'payment', amount: '1,5 triệu', confirm: true }));
});

await test('action L1 (không sensitive) chạy thẳng không cần confirm', async () => {
  const leadAction = writeActions.find((a) => a.name === 'soulsale.lead.create')!;
  const r = (await executeAction(db, c, leadAction, { source: 'zalo', name: 'Lead qua registry' })) as { id: string };
  ok(r.id);
});

await test('read tools gọi được qua handler với zod parse (mẫu 3 tool)', async () => {
  for (const name of ['soulsale.customer.search', 'soulsale.price.check', 'soulsale.debt.summary']) {
    const t = readTools.find((x) => x.name === name)!;
    const p = t.params.parse(name === 'soulsale.price.check' ? { productCode: 'SP' } : {});
    const out = await t.handler(db, c, p);
    ok(out !== undefined, name);
  }
});

done('08-registry');
