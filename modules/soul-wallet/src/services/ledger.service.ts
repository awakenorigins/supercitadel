/**
 * SOUL-WALLET 1A — ledger.service (xương sống)
 * · writeAudit: camera an ninh — mọi mutation (kể cả dry-run) đều lưu dấu
 * · nextDocNo: số chứng từ SW-TX-YYYY-NNNNNN, counter upsert nguyên tử
 * · postLedger: ghi bút toán delta — nguồn chân lý số dư
 * · accountBalance / allBalances: opening_balance + Σdelta (KHÔNG lưu cứng)
 * Mọi query bắt buộc lọc (org_id, owner_user_id) — isolation app-level.
 */
import { and, eq, sql } from 'drizzle-orm';
import type { SwCtx } from '../types.js';
import { SwError, money } from '../types.js';
import {
  swAccounts, swAuditEntries, swDocCounters, swLedgerEntries,
} from '../db/schema.js';

/** Điều kiện scope chuẩn — dùng cho MỌI truy vấn */
export const own = (t: { orgId: unknown; ownerUserId: unknown }, ctx: SwCtx) =>
  and(eq(t.orgId as never, ctx.orgId), eq(t.ownerUserId as never, ctx.ownerId));

export interface AuditInput {
  action: string;
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  isDryrun?: boolean;
}

export async function writeAudit(ctx: SwCtx, e: AuditInput): Promise<void> {
  await ctx.db.insert(swAuditEntries).values({
    orgId: ctx.orgId,
    ownerUserId: ctx.ownerId,
    actor: ctx.ownerId,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId,
    before: e.before as never,
    after: e.after as never,
    isDryrun: e.isDryrun ?? false,
  });
}

export async function listAudit(ctx: SwCtx, limit = 50) {
  return ctx.db.select().from(swAuditEntries)
    .where(own(swAuditEntries, ctx))
    .orderBy(sql`${swAuditEntries.at} DESC`)
    .limit(limit);
}

/** Số chứng từ tuần tự per (org, owner, key, year) — upsert nguyên tử */
export async function nextDocNo(ctx: SwCtx, key: string, when: Date): Promise<string> {
  const year = when.getUTCFullYear();
  const rows = await ctx.db.insert(swDocCounters)
    .values({ orgId: ctx.orgId, ownerUserId: ctx.ownerId, key, year, seq: 1 })
    .onConflictDoUpdate({
      target: [swDocCounters.orgId, swDocCounters.ownerUserId, swDocCounters.key, swDocCounters.year],
      set: { seq: sql`${swDocCounters.seq} + 1` },
    })
    .returning({ seq: swDocCounters.seq });
  const seq = rows[0]?.seq ?? 1;
  return `SW-${key}-${year}-${String(seq).padStart(6, '0')}`;
}

/** Lấy account CỦA CHỦ VÍ — chặn với tay sang ví người khác/org khác */
export async function getOwnAccount(ctx: SwCtx, accountId: string) {
  const rows = await ctx.db.select().from(swAccounts)
    .where(and(own(swAccounts, ctx), eq(swAccounts.id, accountId)))
    .limit(1);
  const acc = rows[0];
  if (!acc) throw new SwError('ACCOUNT_NOT_FOUND', `Không tìm thấy tài khoản ${accountId} trong ví của bạn`);
  return acc;
}

export interface LedgerLine { accountId: string; delta: string }

/** Ghi bút toán — mỗi giao dịch ≥1 dòng; transfer bắt buộc tổng delta = 0 */
export async function postLedger(ctx: SwCtx, txId: string, occurredAt: Date, lines: LedgerLine[]): Promise<void> {
  if (!lines.length) throw new SwError('INVALID_INPUT', 'postLedger: không có dòng bút toán');
  await ctx.db.insert(swLedgerEntries).values(lines.map((l) => ({
    orgId: ctx.orgId,
    ownerUserId: ctx.ownerId,
    txId,
    accountId: l.accountId,
    delta: l.delta,
    occurredAt,
  })));
}

/** Σdelta của 1 tài khoản (tùy chọn tới hết ngày asOf) */
export async function ledgerSum(ctx: SwCtx, accountId: string, asOfDay?: string): Promise<string> {
  const cond = asOfDay
    ? and(own(swLedgerEntries, ctx), eq(swLedgerEntries.accountId, accountId),
        sql`${swLedgerEntries.occurredAt} < (${asOfDay}::date + interval '1 day')`)
    : and(own(swLedgerEntries, ctx), eq(swLedgerEntries.accountId, accountId));
  const rows = await ctx.db
    .select({ s: sql<string>`COALESCE(SUM(${swLedgerEntries.delta}), 0)::numeric(18,0)::text` })
    .from(swLedgerEntries)
    .where(cond);
  return rows[0]?.s ?? '0';
}

/** Số dư 1 tài khoản = opening_balance + Σdelta */
export async function accountBalance(ctx: SwCtx, accountId: string, asOfDay?: string): Promise<string> {
  const acc = await getOwnAccount(ctx, accountId);
  const s = await ledgerSum(ctx, accountId, asOfDay);
  return money.add(String(acc.openingBalance), s);
}

/** Số dư toàn bộ tài khoản (kèm type để chia tài sản/nợ) */
export async function allBalances(ctx: SwCtx, includeArchived = false) {
  const accs = await ctx.db.select().from(swAccounts).where(own(swAccounts, ctx));
  const sums = await ctx.db
    .select({
      accountId: swLedgerEntries.accountId,
      s: sql<string>`COALESCE(SUM(${swLedgerEntries.delta}), 0)::numeric(18,0)::text`,
    })
    .from(swLedgerEntries)
    .where(own(swLedgerEntries, ctx))
    .groupBy(swLedgerEntries.accountId);
  const byId = new Map(sums.map((r) => [r.accountId, r.s]));
  return accs
    .filter((a) => includeArchived || !a.isArchived)
    .map((a) => ({
      id: a.id, name: a.name, type: a.type, currency: a.currency,
      is_archived: a.isArchived,
      balance: money.add(String(a.openingBalance), byId.get(a.id) ?? '0'),
    }));
}
