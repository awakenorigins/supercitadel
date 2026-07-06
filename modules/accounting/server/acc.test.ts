// acc.test.ts — verify thật engine kế toán trên PGlite: mọi quy tắc port từ ERPNext.
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import * as acc from './schema.js';
import { seedChart, createJournal, createInvoice, createPayment, cancelVoucher, accountByNumber } from './service.js';
import { trialBalance, profitLoss, partyOutstanding, accountBalance, generalLedger } from './reports.js';

function assert(c: unknown, m: string) { if (!c) { console.error('  ✗', m); process.exitCode = 1; throw new Error(m); } console.log('  ✓', m); }
async function expectErr(fn: () => Promise<unknown>, code: number, m: string) {
  try { await fn(); assert(false, m + ' (không throw)'); }
  catch (e: any) { assert(e?.status === code, `${m} (status=${e?.status ?? e?.message})`); }
}
const ORG = 'aaaaaaaa-0000-0000-0000-000000000001';
const ORG_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const D = '2026-06-10';

const client = new PGlite();
await client.exec(readFileSync(new URL('../migrations/0001_accounting.sql', import.meta.url), 'utf8'));
const db = drizzle(client, { schema: acc }) as any;

// ── Chart ──
const chart = await seedChart(db, ORG);
assert(chart.length === 14, `seed chart VN = 14 tài khoản (=${chart.length})`);
assert((await seedChart(db, ORG)).length === 14, 'seed lần 2 idempotent');
await seedChart(db, ORG_B);

// ── Posting rules ──
await expectErr(() => createJournal(db, ORG, { postingDate: D, lines: [{ accountNumber: '111', debit: 1000 }] }), 400, 'chứng từ 1 dòng → 400');
await expectErr(() => createJournal(db, ORG, { postingDate: D, lines: [{ accountNumber: '111', debit: 1000 }, { accountNumber: '411', credit: 900 }] }), 400, 'Nợ 1000 ≠ Có 900 → 400');
await expectErr(() => createJournal(db, ORG, { postingDate: D, lines: [{ accountNumber: '111', debit: 500, credit: 500 }, { accountNumber: '411', credit: 0 }] }), 400, 'dòng vừa Nợ vừa Có → 400');
await expectErr(() => createJournal(db, ORG, { postingDate: D, lines: [{ accountNumber: '1', debit: 1000 }, { accountNumber: '411', credit: 1000 }] }), 400, 'hạch toán vào TK nhóm → 400');

// Góp vốn 50tr: Nợ 111 / Có 411
const jv1 = await createJournal(db, ORG, { postingDate: D, remarks: 'Góp vốn khởi nghiệp', lines: [{ accountNumber: '111', debit: 50_000_000 }, { accountNumber: '411', credit: 50_000_000 }] });
assert(jv1.voucherNo === 'JV-0001' && Number(jv1.total) === 50_000_000, 'JV-0001 góp vốn 50tr');
assert((await accountBalance(db, ORG, '111')).balance === 50_000_000, 'số dư 111 = 50tr');
assert((await accountBalance(db, ORG, '411')).balance === 50_000_000, 'số dư 411 = 50tr (dư Có)');

// ── Invoice bán: Nợ 131 / Có 511 ──
const inv = await createInvoice(db, ORG, { invoiceType: 'sales', partyName: 'Cô Hoa', postingDate: D, lines: [{ description: 'Cà phê 100 ly', qty: 100, rate: 180_000 }, { description: 'Bánh', qty: 20, rate: 200_000 }] });
assert(Number(inv.grandTotal) === 22_000_000 && Number(inv.outstanding) === 22_000_000 && inv.status === 'unpaid', 'HĐ bán 22tr, nợ 22tr');
assert((await accountBalance(db, ORG, '131')).balance === 22_000_000, '131 Phải thu = 22tr');
assert((await accountBalance(db, ORG, '511')).balance === 22_000_000, '511 Doanh thu = 22tr');
await expectErr(() => createInvoice(db, ORG, { invoiceType: 'sales', partyName: 'X', postingDate: D, lines: [{ description: 'x', qty: 0, rate: 100 }] }), 400, 'qty=0 → 400');

// ── Payment thu 1 phần: knock-off ──
const p1 = await createPayment(db, ORG, { paymentType: 'receive', partyName: 'Cô Hoa', amount: 10_000_000, invoiceId: inv.id, postingDate: D });
let [inv2] = await db.select().from(acc.accInvoices).where((await import('drizzle-orm')).eq(acc.accInvoices.id, inv.id));
assert(Number(inv2.outstanding) === 12_000_000 && inv2.status === 'partly_paid', 'thu 10tr → còn nợ 12tr, partly_paid');
assert((await accountBalance(db, ORG, '111')).balance === 60_000_000, '111 = 50+10 = 60tr');
assert((await accountBalance(db, ORG, '131')).balance === 12_000_000, '131 còn 12tr');
await expectErr(() => createPayment(db, ORG, { paymentType: 'receive', partyName: 'Cô Hoa', amount: 13_000_000, invoiceId: inv.id, postingDate: D }), 409, 'thu 13tr > nợ 12tr → 409');
await createPayment(db, ORG, { paymentType: 'receive', partyName: 'Cô Hoa', amount: 12_000_000, invoiceId: inv.id, postingDate: D });
[inv2] = await db.select().from(acc.accInvoices).where((await import('drizzle-orm')).eq(acc.accInvoices.id, inv.id));
assert(Number(inv2.outstanding) === 0 && inv2.status === 'paid', 'thu nốt 12tr → paid, nợ 0');

// ── Invoice mua + chi ──
const pinv = await createInvoice(db, ORG, { invoiceType: 'purchase', partyName: 'NCC Sữa Việt', postingDate: D, lines: [{ description: 'Sữa 200 hộp', qty: 200, rate: 25_000 }] });
assert(Number(pinv.grandTotal) === 5_000_000, 'HĐ mua 5tr');
assert((await accountBalance(db, ORG, '331')).balance === 5_000_000, '331 Phải trả = 5tr (dư Có)');
await createPayment(db, ORG, { paymentType: 'pay', partyName: 'NCC Sữa Việt', amount: 5_000_000, invoiceId: pinv.id, postingDate: D });
assert((await accountBalance(db, ORG, '331')).balance === 0, 'trả hết → 331 = 0');
assert((await accountBalance(db, ORG, '111')).balance === 67_000_000, '111 = 60+12−5 = 67tr');

// ── Chi phí thuê mặt bằng (journal) ──
await createJournal(db, ORG, { postingDate: D, remarks: 'Thuê mặt bằng T6', lines: [{ accountNumber: '642', debit: 8_000_000 }, { accountNumber: '111', credit: 8_000_000 }] });

// ── Reports ──
const tb = await trialBalance(db, ORG, '2026-01-01', '2026-12-31');
assert(tb.balanced === true, `trial balance CÂN (ΣNợ=${tb.sumDebit.toLocaleString('vi')})`);
const pl = await profitLoss(db, ORG, '2026-01-01', '2026-12-31');
assert(pl.totalIncome === 22_000_000, 'P&L: doanh thu 22tr');
assert(pl.totalExpense === 13_000_000, 'P&L: chi phí 5+8 = 13tr');
assert(pl.netProfit === 9_000_000, 'P&L: lãi ròng 9tr');
const gl111 = await generalLedger(db, ORG, '111', '2026-01-01', '2026-12-31');
assert(gl111.entries.length === 5 && gl111.entries.at(-1).balance === 59_000_000, `sổ cái 111: 5 dòng, dư cuối 59tr (67−8)`);

// ── Công nợ mới + outstanding report ──
const inv3 = await createInvoice(db, ORG, { invoiceType: 'sales', partyName: 'Anh Tú', postingDate: D, lines: [{ description: 'Tiệc', qty: 1, rate: 15_200_000 }] });
const ar = await partyOutstanding(db, ORG, 'sales');
assert(ar.grandTotal === 15_200_000 && ar.parties[0].partyName === 'Anh Tú', 'công nợ phải thu: Anh Tú 15.2tr');

// ── Cancel rules ──
await expectErr(() => cancelVoucher(db, ORG, inv.voucherId), 409, 'hủy HĐ đã thanh toán → 409');
const balBefore131 = (await accountBalance(db, ORG, '131')).balance;
await cancelVoucher(db, ORG, inv3.voucherId);
assert((await accountBalance(db, ORG, '131')).balance === balBefore131 - 15_200_000, 'hủy HĐ Anh Tú: bút toán ĐẢO trả 131 về cũ');
const [inv3b] = await db.select().from(acc.accInvoices).where((await import('drizzle-orm')).eq(acc.accInvoices.id, inv3.id));
assert(inv3b.status === 'cancelled' && Number(inv3b.outstanding) === 0, 'HĐ Anh Tú: cancelled, nợ 0');
assert((await partyOutstanding(db, ORG, 'sales')).grandTotal === 0, 'công nợ về 0 sau hủy');
const tb2 = await trialBalance(db, ORG, '2026-01-01', '2026-12-31');
assert(tb2.balanced === true, 'trial balance VẪN CÂN sau bút toán đảo');
// hủy payment → hoàn nợ
const inv4 = await createInvoice(db, ORG, { invoiceType: 'sales', partyName: 'Chị Mai', postingDate: D, lines: [{ description: 'x', qty: 1, rate: 10_000_000 }] });
const p4 = await createPayment(db, ORG, { paymentType: 'receive', partyName: 'Chị Mai', amount: 10_000_000, invoiceId: inv4.id, postingDate: D });
await cancelVoucher(db, ORG, p4.voucherId);
const [inv4b] = await db.select().from(acc.accInvoices).where((await import('drizzle-orm')).eq(acc.accInvoices.id, inv4.id));
assert(Number(inv4b.outstanding) === 10_000_000 && inv4b.status === 'unpaid', 'hủy phiếu thu → công nợ hoàn 10tr, unpaid');

// ── Tenant isolation ──
assert((await accountBalance(db, ORG_B, '111')).balance === 0, 'tenant isolation: org B sạch');
await expectErr(() => accountByNumber(db, ORG, '999'), 404, 'TK không tồn tại → 404');

console.log('[accounting] ALL PASSED');
