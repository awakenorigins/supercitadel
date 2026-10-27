/**
 * SOUL-WALLET 1A — account.service
 * Ví/tài khoản: tạo, sửa, đóng (archive — không DELETE), danh sách kèm số dư.
 * Đóng ví bắt buộc số dư = 0 (trừ khi force) — tiền không được bốc hơi.
 */
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { SwCtx } from '../types.js';
import { SwError, money } from '../types.js';
import { swAccounts } from '../db/schema.js';
import { own, writeAudit, getOwnAccount, accountBalance, allBalances } from './ledger.service.js';
import type { accountCreateSchema, accountUpdateSchema, accountCloseSchema } from '../validation/schemas.js';

export async function createAccount(ctx: SwCtx, input: z.infer<typeof accountCreateSchema>) {
  const rows = await ctx.db.insert(swAccounts).values({
    orgId: ctx.orgId, ownerUserId: ctx.ownerId, createdBy: ctx.ownerId,
    name: input.name, type: input.type,
    openingBalance: input.opening_balance,
    statementDay: input.statement_day, dueDay: input.due_day, creditLimit: input.credit_limit,
    termMonths: input.term_months,
    interestRate: input.interest_rate !== undefined ? String(input.interest_rate) : undefined,
    maturityDate: input.maturity_date,
    icon: input.icon, note: input.note,
  }).returning();
  const acc = rows[0]!;
  await writeAudit(ctx, { action: 'sw.account.create', entity: 'sw_accounts', entityId: acc.id, after: input });
  return acc;
}

export async function updateAccount(ctx: SwCtx, input: z.infer<typeof accountUpdateSchema>) {
  const before = await getOwnAccount(ctx, input.id);
  const rows = await ctx.db.update(swAccounts).set({
    name: input.name ?? before.name,
    statementDay: input.statement_day ?? before.statementDay,
    dueDay: input.due_day ?? before.dueDay,
    creditLimit: input.credit_limit ?? before.creditLimit,
    termMonths: input.term_months ?? before.termMonths,
    interestRate: input.interest_rate !== undefined ? String(input.interest_rate) : before.interestRate,
    maturityDate: input.maturity_date ?? before.maturityDate,
    icon: input.icon ?? before.icon,
    note: input.note ?? before.note,
    updatedAt: new Date(),
  }).where(and(own(swAccounts, ctx), eq(swAccounts.id, input.id))).returning();
  await writeAudit(ctx, { action: 'sw.account.update', entity: 'sw_accounts', entityId: input.id, before, after: input });
  return rows[0]!;
}

export async function closeAccount(ctx: SwCtx, input: z.infer<typeof accountCloseSchema>) {
  const acc = await getOwnAccount(ctx, input.id);
  if (acc.isArchived) throw new SwError('ACCOUNT_ARCHIVED', 'Tài khoản đã đóng từ trước');
  const bal = await accountBalance(ctx, input.id);
  if (money.cmp(bal, '0') !== 0 && !input.force) {
    throw new SwError('ACCOUNT_HAS_BALANCE',
      `Tài khoản còn số dư ${bal} VND — chuyển hết tiền ra trước khi đóng, hoặc force:true nếu chấp nhận`,
      { balance: bal });
  }
  const rows = await ctx.db.update(swAccounts)
    .set({ isArchived: true, updatedAt: new Date() })
    .where(and(own(swAccounts, ctx), eq(swAccounts.id, input.id))).returning();
  await writeAudit(ctx, { action: 'sw.account.close', entity: 'sw_accounts', entityId: input.id, before: { balance: bal }, after: { force: input.force } });
  return { ...rows[0]!, closed_balance: bal };
}

export async function listAccounts(ctx: SwCtx, includeArchived = false) {
  return allBalances(ctx, includeArchived);
}
