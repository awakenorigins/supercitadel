// Accounting reports — tính trực tiếp từ GL (nguồn sự thật duy nhất, kể cả bút toán đảo).
import { eq, and, sql, gte, lte } from 'drizzle-orm';
import { accAccounts, accGlEntries, accInvoices } from './schema.js';
type DB = any;

/** Sổ cái 1 tài khoản trong kỳ — kèm số dư lũy kế. */
export async function generalLedger(db: DB, orgId: string, accountNumber: string, from: string, to: string) {
  const [acct] = await db.select().from(accAccounts)
    .where(and(eq(accAccounts.orgId, orgId), eq(accAccounts.number, accountNumber)));
  if (!acct) return { account: null, entries: [] };
  const entries = await db.select().from(accGlEntries)
    .where(and(eq(accGlEntries.orgId, orgId), eq(accGlEntries.accountId, acct.id),
      gte(accGlEntries.postingDate, from), lte(accGlEntries.postingDate, to)))
    .orderBy(accGlEntries.postingDate, accGlEntries.createdAt);
  let running = 0;
  const sign = ['asset', 'expense'].includes(acct.rootType) ? 1 : -1; // dư Nợ vs dư Có
  const rows = entries.map((e: any) => {
    running += sign * (Number(e.debit) - Number(e.credit));
    return { ...e, balance: running };
  });
  return { account: acct, entries: rows };
}

/** Bảng cân đối thử: Σ Nợ / Σ Có / số dư từng tài khoản (không nhóm). */
export async function trialBalance(db: DB, orgId: string, from: string, to: string) {
  const rows = await db.select({
    accountId: accGlEntries.accountId,
    number: accAccounts.number, name: accAccounts.name, rootType: accAccounts.rootType,
    totalDebit: sql<string>`COALESCE(SUM(${accGlEntries.debit}),0)`,
    totalCredit: sql<string>`COALESCE(SUM(${accGlEntries.credit}),0)`,
  }).from(accGlEntries)
    .innerJoin(accAccounts, eq(accGlEntries.accountId, accAccounts.id))
    .where(and(eq(accGlEntries.orgId, orgId), gte(accGlEntries.postingDate, from), lte(accGlEntries.postingDate, to)))
    .groupBy(accGlEntries.accountId, accAccounts.number, accAccounts.name, accAccounts.rootType)
    .orderBy(accAccounts.number);
  const out = rows.map((r: any) => {
    const d = Number(r.totalDebit), c = Number(r.totalCredit);
    const drBal = ['asset', 'expense'].includes(r.rootType) ? d - c : 0;
    const crBal = ['asset', 'expense'].includes(r.rootType) ? 0 : c - d;
    return { ...r, totalDebit: d, totalCredit: c, balance: drBal || crBal, balanceSide: drBal ? 'debit' : 'credit' };
  });
  const sumD = out.reduce((s: number, r: any) => s + r.totalDebit, 0);
  const sumC = out.reduce((s: number, r: any) => s + r.totalCredit, 0);
  return { rows: out, sumDebit: sumD, sumCredit: sumC, balanced: sumD === sumC };
}

/** Lãi lỗ kỳ: doanh thu (Có−Nợ các TK income) − chi phí (Nợ−Có các TK expense). */
export async function profitLoss(db: DB, orgId: string, from: string, to: string) {
  const tb = await trialBalance(db, orgId, from, to);
  const income = tb.rows.filter((r: any) => r.rootType === 'income')
    .map((r: any) => ({ number: r.number, name: r.name, amount: r.totalCredit - r.totalDebit }));
  const expense = tb.rows.filter((r: any) => r.rootType === 'expense')
    .map((r: any) => ({ number: r.number, name: r.name, amount: r.totalDebit - r.totalCredit }));
  const totalIncome = income.reduce((s: number, r: any) => s + r.amount, 0);
  const totalExpense = expense.reduce((s: number, r: any) => s + r.amount, 0);
  return { income, expense, totalIncome, totalExpense, netProfit: totalIncome - totalExpense };
}

/** Công nợ theo đối tác — từ hóa đơn còn outstanding. */
export async function partyOutstanding(db: DB, orgId: string, invoiceType: 'sales' | 'purchase') {
  const rows = await db.select({
    partyName: accInvoices.partyName,
    total: sql<string>`COALESCE(SUM(${accInvoices.outstanding}),0)`,
    count: sql<number>`count(*)::int`,
  }).from(accInvoices)
    .where(and(eq(accInvoices.orgId, orgId), eq(accInvoices.invoiceType, invoiceType),
      sql`${accInvoices.outstanding} > 0`, sql`${accInvoices.status} != 'cancelled'`))
    .groupBy(accInvoices.partyName)
    .orderBy(sql`SUM(${accInvoices.outstanding}) DESC`);
  const list = rows.map((r: any) => ({ ...r, total: Number(r.total) }));
  return { parties: list, grandTotal: list.reduce((s: number, r: any) => s + r.total, 0) };
}

/** Số dư hiện tại 1 tài khoản (mọi thời gian). */
export async function accountBalance(db: DB, orgId: string, accountNumber: string) {
  const [acct] = await db.select().from(accAccounts)
    .where(and(eq(accAccounts.orgId, orgId), eq(accAccounts.number, accountNumber)));
  if (!acct) return { account: null, balance: 0 };
  const [r] = await db.select({
    d: sql<string>`COALESCE(SUM(${accGlEntries.debit}),0)`, c: sql<string>`COALESCE(SUM(${accGlEntries.credit}),0)`,
  }).from(accGlEntries).where(and(eq(accGlEntries.orgId, orgId), eq(accGlEntries.accountId, acct.id)));
  const sign = ['asset', 'expense'].includes(acct.rootType) ? 1 : -1;
  return { account: acct, balance: sign * (Number(r.d) - Number(r.c)) };
}
