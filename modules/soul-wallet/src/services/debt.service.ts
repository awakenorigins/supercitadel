/**
 * SOUL-WALLET 1A — debt.service (sổ nợ cá nhân)
 * · direction: receivable = NGƯỜI TA nợ MÌNH · payable = MÌNH nợ người ta
 * · Lãi đơn theo ngày: principal × rate%/năm × days/365 (floor VND)
 * · Trả quá phần còn lại → PAYMENT_EXCEEDS_REMAINING
 * · Gắn ví (account_id) → sinh giao dịch dòng tiền thật (ghi rõ trong GUIDE:
 *   cho vay ra tiền = expense 'Cho vay', vay về tiền = income 'Nhận vay',
 *   thu nợ = income 'Thu nợ', trả nợ = expense 'Trả nợ')
 * · Aging 5 bucket theo ngày QUÁ HẠN: 0-7 / 8-30 / 31-60 / 61-90 / 90+
 */
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { SwCtx, AgingBucket } from '../types.js';
import { SwError, money, isoDay } from '../types.js';
import { swDebts, swDebtPayments, swContacts } from '../db/schema.js';
import { own, writeAudit } from './ledger.service.js';
import { findOrCreateContact, listCategories } from './catalog.service.js';
import { createTx } from './transaction.service.js';
import type { debtCreateSchema, debtPaySchema, debtListSchema } from '../validation/schemas.js';

function daysBetween(a: string, b: string): number {
  return Math.floor((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400_000);
}

export function interestAccrued(principal: string, ratePerYear: number, startDate: string, asOf: string): string {
  if (ratePerYear <= 0) return '0';
  const days = Math.max(0, daysBetween(startDate, asOf));
  const v = (BigInt(principal) * BigInt(Math.round(ratePerYear * 10000)) * BigInt(days)) / (10000n * 100n * 365n);
  return v.toString();
}

async function paidOf(ctx: SwCtx, debtId: string): Promise<string> {
  const rows = await ctx.db.select().from(swDebtPayments)
    .where(and(own(swDebtPayments, ctx), eq(swDebtPayments.debtId, debtId)));
  return rows.reduce((s, r) => money.add(s, String(r.amount)), '0');
}

export async function createDebt(ctx: SwCtx, input: z.infer<typeof debtCreateSchema>) {
  let contactId = input.contact_id;
  if (!contactId) {
    if (!input.contact_name) throw new SwError('INVALID_INPUT', 'Cần contact_id hoặc contact_name');
    const c = await findOrCreateContact(ctx, input.contact_name,
      input.direction === 'receivable' ? 'borrower' : 'lender');
    contactId = c.id;
  } else {
    const found = await ctx.db.select().from(swContacts)
      .where(and(own(swContacts, ctx), eq(swContacts.id, contactId))).limit(1);
    if (!found[0]) throw new SwError('CONTACT_NOT_FOUND', `Không tìm thấy đối tác ${contactId}`);
  }

  const rows = await ctx.db.insert(swDebts).values({
    orgId: ctx.orgId, ownerUserId: ctx.ownerId, createdBy: ctx.ownerId,
    contactId, direction: input.direction, principal: input.principal,
    interestRate: String(input.interest_rate), startDate: input.start_date,
    dueDate: input.due_date, note: input.note,
  }).returning();
  const debt = rows[0]!;

  let txId: string | undefined;
  if (input.account_id) {
    const isLend = input.direction === 'receivable';
    const cats = await listCategories(ctx, isLend ? 'expense' : 'income');
    const cat = cats.find((c) => c.name === (isLend ? 'Khác (chi)' : 'Khác (thu)'));
    const tx = await createTx(ctx, {
      kind: isLend ? 'expense' : 'income',
      occurred_at: `${input.start_date}T00:00:00Z`,
      account_id: input.account_id,
      contact_id: contactId,
      category_id: cat?.id,
      amount: input.principal,
      memo: isLend ? `Cho vay: ${input.note ?? ''}`.trim() : `Nhận vay: ${input.note ?? ''}`.trim(),
      status: 'posted',
    } as never);
    txId = tx.id;
  }

  await writeAudit(ctx, { action: 'sw.debt.create', entity: 'sw_debts', entityId: debt.id, after: { ...input, tx_id: txId } });
  return { ...debt, cashflow_tx_id: txId };
}

export async function payDebt(ctx: SwCtx, input: z.infer<typeof debtPaySchema>) {
  const rows = await ctx.db.select().from(swDebts)
    .where(and(own(swDebts, ctx), eq(swDebts.id, input.debt_id))).limit(1);
  const debt = rows[0];
  if (!debt) throw new SwError('DEBT_NOT_FOUND', `Không tìm thấy khoản nợ ${input.debt_id}`);
  if (debt.status === 'settled') throw new SwError('DEBT_ALREADY_SETTLED', 'Khoản nợ đã tất toán');

  const paid = await paidOf(ctx, debt.id);
  const remaining = money.sub(String(debt.principal), paid);
  if (money.cmp(input.amount, remaining) > 0) {
    throw new SwError('PAYMENT_EXCEEDS_REMAINING',
      `Trả ${input.amount} vượt phần gốc còn lại ${remaining}`, { remaining });
  }

  let txId: string | undefined;
  if (input.account_id) {
    const isCollect = debt.direction === 'receivable'; // thu nợ về
    const cats = await listCategories(ctx, isCollect ? 'income' : 'expense');
    const cat = cats.find((c) => c.name === (isCollect ? 'Thu nợ' : 'Khác (chi)'));
    const tx = await createTx(ctx, {
      kind: isCollect ? 'income' : 'expense',
      occurred_at: `${input.paid_at}T00:00:00Z`,
      account_id: input.account_id,
      contact_id: debt.contactId,
      category_id: cat?.id,
      amount: input.amount,
      memo: isCollect ? 'Thu nợ' : 'Trả nợ',
      status: 'posted',
    } as never);
    txId = tx.id;
  }

  await ctx.db.insert(swDebtPayments).values({
    orgId: ctx.orgId, ownerUserId: ctx.ownerId,
    debtId: debt.id, amount: input.amount, paidAt: input.paid_at, txId, note: input.note,
  });
  const newRemaining = money.sub(remaining, input.amount);
  const settled = money.cmp(newRemaining, '0') === 0;
  if (settled) {
    await ctx.db.update(swDebts).set({ status: 'settled', updatedAt: new Date() })
      .where(and(own(swDebts, ctx), eq(swDebts.id, debt.id)));
  }
  await writeAudit(ctx, {
    action: 'sw.debt.pay', entity: 'sw_debts', entityId: debt.id,
    after: { amount: input.amount, remaining: newRemaining, settled, tx_id: txId },
  });
  return { debt_id: debt.id, paid_now: input.amount, remaining: newRemaining, settled, tx_id: txId };
}

export async function listDebts(ctx: SwCtx, f: z.infer<typeof debtListSchema>) {
  const asOf = f.as_of ?? isoDay(new Date());
  const conds = [own(swDebts, ctx)];
  if (f.direction) conds.push(eq(swDebts.direction, f.direction));
  if (f.status) conds.push(eq(swDebts.status, f.status));
  const debts = await ctx.db.select().from(swDebts).where(and(...conds));
  const contacts = new Map((await ctx.db.select().from(swContacts).where(own(swContacts, ctx))).map((c) => [c.id, c.name]));

  const out = [];
  for (const d of debts) {
    const paid = await paidOf(ctx, d.id);
    const remaining = money.sub(String(d.principal), paid);
    const overdueDays = d.dueDate && d.status === 'open' ? Math.max(0, daysBetween(String(d.dueDate), asOf)) : 0;
    out.push({
      id: d.id, contact: contacts.get(d.contactId) ?? '?', direction: d.direction,
      principal: String(d.principal), paid, remaining,
      interest_rate: Number(d.interestRate),
      interest_accrued: interestAccrued(String(d.principal), Number(d.interestRate), String(d.startDate), asOf),
      start_date: String(d.startDate), due_date: d.dueDate ? String(d.dueDate) : null,
      status: d.status, overdue_days: overdueDays,
    });
  }
  return out;
}

export function bucketOf(overdueDays: number): AgingBucket | 'not_due' {
  if (overdueDays <= 0) return 'not_due';
  if (overdueDays <= 7) return '0-7';
  if (overdueDays <= 30) return '8-30';
  if (overdueDays <= 60) return '31-60';
  if (overdueDays <= 90) return '61-90';
  return '90+';
}

export async function debtAging(ctx: SwCtx, asOf?: string) {
  const day = asOf ?? isoDay(new Date());
  const debts = await listDebts(ctx, { status: 'open', as_of: day } as never);
  const empty = () => ({ 'not_due': '0', '0-7': '0', '8-30': '0', '31-60': '0', '61-90': '0', '90+': '0' } as Record<string, string>);
  const receivable = empty(); const payable = empty();
  for (const d of debts) {
    const b = bucketOf(d.overdue_days);
    const target = d.direction === 'receivable' ? receivable : payable;
    target[b] = money.add(target[b]!, d.remaining);
  }
  return { as_of: day, receivable, payable, open_count: debts.length };
}

/** Nhắc nợ đến hạn trong N ngày — dùng bởi scheduled task, emit sw.debt.due */
export async function checkDueAndEmit(ctx: SwCtx, withinDays = 7) {
  const today = isoDay(new Date());
  const debts = await listDebts(ctx, { status: 'open' } as never);
  const due = debts.filter((d) => d.due_date &&
    (daysBetween(today, d.due_date) <= withinDays || d.overdue_days > 0));
  for (const d of due) {
    await ctx.bus.emit('sw.debt.due', {
      org_id: ctx.orgId, owner_user_id: ctx.ownerId,
      debt_id: d.id, contact: d.contact, direction: d.direction,
      remaining: d.remaining, due_date: d.due_date, overdue_days: d.overdue_days,
    });
  }
  return { notified: due.length };
}
