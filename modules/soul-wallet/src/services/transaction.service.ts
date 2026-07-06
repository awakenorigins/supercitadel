/**
 * SOUL-WALLET 1A — transaction.service (trái tim sổ tiền)
 * Semantics bút toán delta:
 *   income:+ · expense:− · fee:− · refund:+ · transfer: −nguồn/+đích (Σ=0)
 *   adjust: dấu theo meta.sign (reconcile dùng) — mặc định +
 * · Hủy = ĐẢO: sinh giao dịch mới reversal_of + bút toán delta ngược, KHÔNG DELETE
 * · draft (từ recurring) KHÔNG ghi ledger — postDraft mới ghi
 * · Sau mỗi posting: refresh snapshot ngày + tổng hợp tháng (summary layer)
 */
import { and, eq, gte, lte, sql, inArray } from 'drizzle-orm';
import type { SwCtx, TxKind } from '../types.js';
import { SwError, money, isoDay, isoMonth, vnd } from '../types.js';
import {
  swTransactions, swTransactionSplits, swTransactionTags, swAttachments, swLedgerEntries,
} from '../db/schema.js';
import { own, writeAudit, nextDocNo, getOwnAccount, postLedger, type LedgerLine } from './ledger.service.js';
import { refreshDailySnapshots, refreshMonthAggregates } from './analytics.service.js';
import type { TxCreateInput, TxSearchInput } from '../validation/schemas.js';

function ledgerLinesFor(kind: TxKind, amount: string, accountId: string, counterId?: string, sign: 1 | -1 = 1): LedgerLine[] {
  switch (kind) {
    case 'income':
    case 'refund':
      return [{ accountId, delta: amount }];
    case 'expense':
    case 'fee':
      return [{ accountId, delta: money.neg(amount) }];
    case 'transfer': {
      if (!counterId) throw new SwError('INVALID_INPUT', 'Chuyển tiền cần counter_account_id (ví đích)');
      return [
        { accountId, delta: money.neg(amount) },
        { accountId: counterId, delta: amount },
      ];
    }
    case 'adjust':
      return [{ accountId, delta: sign === -1 ? money.neg(amount) : amount }];
  }
}

async function refreshAfterPosting(ctx: SwCtx, accountIds: string[], occurredAt: Date) {
  const day = isoDay(occurredAt);
  for (const accId of [...new Set(accountIds)]) {
    await refreshDailySnapshots(ctx, accId, day);
  }
  await refreshMonthAggregates(ctx, [isoMonth(occurredAt)]);
}

export async function createTx(ctx: SwCtx, input: TxCreateInput) {
  const occurredAt = new Date(input.occurred_at);
  if (Number.isNaN(occurredAt.getTime())) throw new SwError('INVALID_INPUT', `occurred_at không hợp lệ: ${input.occurred_at}`);
  // Defensive: KHÔNG tin caller đã qua Zod — chuẩn hóa tại đây để ledger không bao giờ bị skip lặng lẽ
  const status: 'posted' | 'draft' = input.status ?? 'posted';
  const amount = vnd(input.amount, 'amount');
  const splits = input.splits?.map((s) => ({ ...s, amount: vnd(s.amount, 'splits.amount') }));
  if (money.cmp(amount, '0') <= 0) throw new SwError('AMOUNT_INVALID', 'Số tiền phải > 0');

  await getOwnAccount(ctx, input.account_id);
  if (input.kind === 'transfer') {
    if (!input.counter_account_id) throw new SwError('INVALID_INPUT', 'Chuyển tiền cần counter_account_id');
    if (input.counter_account_id === input.account_id) throw new SwError('TRANSFER_SAME_ACCOUNT', 'Ví nguồn và ví đích phải khác nhau');
    await getOwnAccount(ctx, input.counter_account_id);
  }
  if (splits?.length) {
    if (input.kind === 'transfer' || input.kind === 'adjust') {
      throw new SwError('INVALID_INPUT', 'Splits chỉ áp dụng cho thu/chi/hoàn/phí');
    }
    const sum = splits.reduce((s, x) => money.add(s, x.amount), '0');
    if (money.cmp(sum, amount) !== 0) {
      throw new SwError('SPLIT_SUM_MISMATCH', `Tổng splits (${sum}) phải bằng amount (${amount})`);
    }
  }

  const sign: 1 | -1 = (input.meta as { sign?: number } | undefined)?.sign === -1 ? -1 : 1;
  const docNo = await nextDocNo(ctx, 'TX', occurredAt);
  const rows = await ctx.db.insert(swTransactions).values({
    orgId: ctx.orgId, ownerUserId: ctx.ownerId, createdBy: ctx.ownerId,
    docNo, kind: input.kind, status, occurredAt,
    accountId: input.account_id, counterAccountId: input.counter_account_id,
    contactId: input.contact_id, categoryId: input.category_id,
    amount, memo: input.memo, refNo: input.ref_no,
    importRowId: input.import_row_id, meta: input.meta as never,
  }).returning();
  const tx = rows[0]!;

  if (splits?.length) {
    await ctx.db.insert(swTransactionSplits).values(splits.map((s) => ({
      orgId: ctx.orgId, ownerUserId: ctx.ownerId, txId: tx.id,
      categoryId: s.category_id, amount: s.amount, note: s.note,
    })));
  }
  if (input.tag_ids?.length) {
    await ctx.db.insert(swTransactionTags).values(input.tag_ids.map((tagId) => ({
      txId: tx.id, tagId, orgId: ctx.orgId, ownerUserId: ctx.ownerId,
    })));
  }
  if (input.attachments?.length) {
    await ctx.db.insert(swAttachments).values(input.attachments.map((a) => ({
      orgId: ctx.orgId, ownerUserId: ctx.ownerId, createdBy: ctx.ownerId, txId: tx.id,
      fileName: a.file_name, mime: a.mime, sizeBytes: a.size_bytes, storageKey: a.storage_key,
    })));
  }

  if (status === 'posted') {
    const lines = ledgerLinesFor(input.kind, amount, input.account_id, input.counter_account_id, sign);
    await postLedger(ctx, tx.id, occurredAt, lines);
    await refreshAfterPosting(ctx, lines.map((l) => l.accountId), occurredAt);
  }

  await writeAudit(ctx, { action: 'sw.tx.create', entity: 'sw_transactions', entityId: tx.id, after: { ...input, doc_no: docNo } });
  await ctx.bus.emit('sw.transaction.created', {
    org_id: ctx.orgId, owner_user_id: ctx.ownerId,
    tx_id: tx.id, doc_no: docNo, kind: input.kind, amount, status,
  });
  return tx;
}

export async function getTx(ctx: SwCtx, id: string) {
  const rows = await ctx.db.select().from(swTransactions)
    .where(and(own(swTransactions, ctx), eq(swTransactions.id, id))).limit(1);
  if (!rows[0]) throw new SwError('TX_NOT_FOUND', `Không tìm thấy giao dịch ${id}`);
  return rows[0];
}

/** Duyệt draft (recurring sinh) → posted + ghi ledger */
export async function postDraft(ctx: SwCtx, id: string) {
  const tx = await getTx(ctx, id);
  if (tx.status !== 'draft') throw new SwError('TX_NOT_POSTED', 'Chỉ duyệt được giao dịch draft');
  const sign: 1 | -1 = (tx.meta as { sign?: number } | null)?.sign === -1 ? -1 : 1;
  const lines = ledgerLinesFor(tx.kind as TxKind, String(tx.amount), tx.accountId, tx.counterAccountId ?? undefined, sign);
  await postLedger(ctx, tx.id, tx.occurredAt, lines);
  await ctx.db.update(swTransactions).set({ status: 'posted', updatedAt: new Date() })
    .where(and(own(swTransactions, ctx), eq(swTransactions.id, id)));
  await refreshAfterPosting(ctx, lines.map((l) => l.accountId), tx.occurredAt);
  await writeAudit(ctx, { action: 'sw.tx.post_draft', entity: 'sw_transactions', entityId: id });
  return { ...tx, status: 'posted' };
}

/** ĐẢO bút toán — tạo giao dịch đảo, không bao giờ DELETE */
export async function reverseTx(ctx: SwCtx, id: string, reason?: string) {
  const orig = await getTx(ctx, id);
  if (orig.status === 'reversed') throw new SwError('TX_ALREADY_REVERSED', `Giao dịch ${orig.docNo} đã bị đảo trước đó`);
  if (orig.status !== 'posted') throw new SwError('TX_NOT_POSTED', 'Chỉ đảo được giao dịch đã posted');

  const entries = await ctx.db.select().from(swLedgerEntries)
    .where(and(own(swLedgerEntries, ctx), eq(swLedgerEntries.txId, id)));
  const now = new Date();
  const docNo = await nextDocNo(ctx, 'TX', now);
  const rows = await ctx.db.insert(swTransactions).values({
    orgId: ctx.orgId, ownerUserId: ctx.ownerId, createdBy: ctx.ownerId,
    docNo, kind: orig.kind, status: 'posted', occurredAt: now,
    accountId: orig.accountId, counterAccountId: orig.counterAccountId,
    contactId: orig.contactId, categoryId: orig.categoryId,
    amount: orig.amount, memo: `Đảo ${orig.docNo}${reason ? ` — ${reason}` : ''}`,
    reversalOf: orig.id, meta: { reversal: true } as never,
  }).returning();
  const rev = rows[0]!;

  await postLedger(ctx, rev.id, now, entries.map((e) => ({
    accountId: e.accountId, delta: money.neg(String(e.delta)),
  })));
  await ctx.db.update(swTransactions).set({ status: 'reversed', updatedAt: now })
    .where(and(own(swTransactions, ctx), eq(swTransactions.id, id)));

  const touched = [...new Set(entries.map((e) => e.accountId))];
  for (const accId of touched) {
    // rebuild từ ngày giao dịch GỐC (backdate) — snapshot phải đúng lịch sử
    await refreshDailySnapshots(ctx, accId, isoDay(orig.occurredAt));
  }
  await refreshMonthAggregates(ctx, [...new Set([isoMonth(orig.occurredAt), isoMonth(now)])]);

  await writeAudit(ctx, {
    action: 'sw.tx.reverse', entity: 'sw_transactions', entityId: id,
    before: { doc_no: orig.docNo }, after: { reversal_id: rev.id, reversal_doc_no: docNo, reason },
  });
  await ctx.bus.emit('sw.transaction.reversed', {
    org_id: ctx.orgId, owner_user_id: ctx.ownerId,
    tx_id: orig.id, reversal_id: rev.id, amount: String(orig.amount),
  });
  return rev;
}

export async function searchTx(ctx: SwCtx, f: TxSearchInput) {
  const conds = [own(swTransactions, ctx)];
  if (f.from) conds.push(gte(swTransactions.occurredAt, new Date(`${f.from}T00:00:00Z`)));
  if (f.to) conds.push(lte(swTransactions.occurredAt, new Date(`${f.to}T23:59:59Z`)));
  if (f.kind) conds.push(eq(swTransactions.kind, f.kind));
  if (f.account_id) conds.push(eq(swTransactions.accountId, f.account_id));
  if (f.category_id) conds.push(eq(swTransactions.categoryId, f.category_id));
  if (f.contact_id) conds.push(eq(swTransactions.contactId, f.contact_id));
  if (f.status) conds.push(eq(swTransactions.status, f.status));
  if (f.memo_contains) conds.push(sql`${swTransactions.memo} ILIKE ${'%' + f.memo_contains + '%'}`);
  if (f.min_amount) conds.push(sql`${swTransactions.amount} >= ${f.min_amount}::numeric`);
  if (f.max_amount) conds.push(sql`${swTransactions.amount} <= ${f.max_amount}::numeric`);
  return ctx.db.select().from(swTransactions)
    .where(and(...conds))
    .orderBy(sql`${swTransactions.occurredAt} DESC`)
    .limit(f.limit);
}

/** Lấy splits của một mớ tx — dùng inArray đúng bài học */
export async function splitsOf(ctx: SwCtx, txIds: string[]) {
  if (!txIds.length) return [];
  return ctx.db.select().from(swTransactionSplits)
    .where(and(own(swTransactionSplits, ctx), inArray(swTransactionSplits.txId, txIds)));
}
