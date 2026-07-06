/** SOUL-SALE 1A — intel.service.ts: rule-based intelligence — churn, quét trùng, hết hạn báo giá, next-best-actions, tuổi nợ. */
import { and, eq, desc, inArray, sql, isNotNull, lt } from 'drizzle-orm';
import { ssCustomers, ssOrders, ssScores, ssSuggestions, ssQuotes } from '../schema.js';
import type { Db, Ctx } from '../contract.js';
import { nowOf, addV, subV, cmpV, ZERO, fmtV } from '../lib/util.js';
import { debtSummary } from './finance.service.js';

const REVENUE_STATUSES = ['confirmed', 'delivering', 'delivered', 'invoiced', 'closed'];

async function upsertScore(db: Db, ctx: Ctx, entityType: string, entityId: string, kind: string, value: number, meta?: Record<string, unknown>) {
  await db.insert(ssScores)
    .values({ orgId: ctx.orgId, entityType, entityId, kind, value: String(value), meta: meta ?? null, computedAt: nowOf(ctx) })
    .onConflictDoUpdate({
      target: [ssScores.orgId, ssScores.entityType, ssScores.entityId, ssScores.kind],
      set: { value: String(value), meta: meta ?? null, computedAt: nowOf(ctx) },
    });
}

/** Khách từng mua nhưng im ắng > inactiveDays → chấm churn_risk 0..100 (tăng theo độ im ắng). */
export async function churnScan(db: Db, ctx: Ctx, p?: { inactiveDays?: number }): Promise<{ flagged: number }> {
  const inactiveDays = p?.inactiveDays ?? 45;
  const now = nowOf(ctx);
  const orders = await db.select().from(ssOrders).where(and(
    eq(ssOrders.orgId, ctx.orgId), inArray(ssOrders.status, REVENUE_STATUSES), isNotNull(ssOrders.confirmedAt),
  ));
  const lastByCust = new Map<string, Date>();
  for (const o of orders) {
    const at = new Date(o.confirmedAt!);
    if (!lastByCust.has(o.customerId) || at > lastByCust.get(o.customerId)!) lastByCust.set(o.customerId, at);
  }
  let flagged = 0;
  for (const [customerId, lastAt] of lastByCust) {
    const days = Math.floor((now.getTime() - lastAt.getTime()) / 86400000);
    if (days <= inactiveDays) continue;
    const value = Math.min(Math.round((days / inactiveDays) * 40), 100);
    await upsertScore(db, ctx, 'customer', customerId, 'churn_risk', value, { lastOrderAt: lastAt.toISOString(), daysSince: days });
    flagged++;
  }
  return { flagged };
}

export async function churnRiskList(db: Db, ctx: Ctx, p?: { limit?: number }) {
  const scores = await db.select().from(ssScores).where(and(
    eq(ssScores.orgId, ctx.orgId), eq(ssScores.entityType, 'customer'), eq(ssScores.kind, 'churn_risk'),
  )).orderBy(desc(ssScores.value)).limit(p?.limit ?? 20);
  if (scores.length === 0) return [];
  const custs = await db.select().from(ssCustomers).where(and(
    eq(ssCustomers.orgId, ctx.orgId), inArray(ssCustomers.id, scores.map((s) => s.entityId)),
  ));
  const nameOf = new Map(custs.map((c) => [c.id, { code: c.code, name: c.name }]));
  return scores.map((s) => ({
    customerId: s.entityId, ...(nameOf.get(s.entityId) ?? { code: '?', name: '?' }),
    risk: Number(s.value), meta: s.meta,
  }));
}

/** Nhóm khách active trùng SĐT → mở suggestion merge_customer (idempotent theo refId+action còn open). */
export async function duplicateScan(db: Db, ctx: Ctx): Promise<{ suggestions: number }> {
  const custs = await db.select().from(ssCustomers).where(and(
    eq(ssCustomers.orgId, ctx.orgId), sql`${ssCustomers.status} <> 'merged'`, isNotNull(ssCustomers.phone),
  ));
  const byPhone = new Map<string, typeof custs>();
  for (const c of custs) {
    const arr = byPhone.get(c.phone!) ?? [];
    arr.push(c); byPhone.set(c.phone!, arr);
  }
  let made = 0;
  for (const [phone, group] of byPhone) {
    if (group.length < 2) continue;
    group.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const keeper = group[0]!;
    for (const dupe of group.slice(1)) {
      const open = await db.select().from(ssSuggestions).where(and(
        eq(ssSuggestions.orgId, ctx.orgId), eq(ssSuggestions.refType, 'customer'),
        eq(ssSuggestions.refId, dupe.id), eq(ssSuggestions.action, 'merge_customer'), eq(ssSuggestions.status, 'open'),
      ));
      if (open.length) continue;
      await db.insert(ssSuggestions).values({
        orgId: ctx.orgId, refType: 'customer', refId: dupe.id, action: 'merge_customer',
        reason: `Trùng SĐT ${phone} với ${keeper.code} (${keeper.name}) — cân nhắc gộp ${dupe.code} → ${keeper.code}`,
        createdAt: nowOf(ctx),
      });
      made++;
    }
  }
  return { suggestions: made };
}

/** Báo giá draft/sent quá validUntil → expired. */
export async function quoteExpiryScan(db: Db, ctx: Ctx): Promise<{ expired: number }> {
  const rows = await db.update(ssQuotes)
    .set({ status: 'expired', updatedAt: nowOf(ctx) })
    .where(and(
      eq(ssQuotes.orgId, ctx.orgId), inArray(ssQuotes.status, ['draft', 'sent']),
      isNotNull(ssQuotes.validUntil), lt(ssQuotes.validUntil, nowOf(ctx)),
    )).returning({ id: ssQuotes.id });
  return { expired: rows.length };
}

/** Tuổi nợ: khách còn outstanding > 0 → score debt_aging = số ngày từ đơn mở cũ nhất. */
export async function debtAgingRefresh(db: Db, ctx: Ctx): Promise<{ scored: number }> {
  const d = (await debtSummary(db, ctx, { topN: 100 })) as { topDebtors: { customerId: string; outstanding: string }[] };
  const now = nowOf(ctx);
  let scored = 0;
  for (const debtor of d.topDebtors) {
    const open = await db.select().from(ssOrders).where(and(
      eq(ssOrders.orgId, ctx.orgId), eq(ssOrders.customerId, debtor.customerId),
      inArray(ssOrders.status, ['confirmed', 'delivering', 'delivered', 'invoiced']), isNotNull(ssOrders.confirmedAt),
    ));
    if (open.length === 0) continue;
    const oldest = open.reduce((a, o) => (new Date(o.confirmedAt!) < a ? new Date(o.confirmedAt!) : a), new Date(open[0]!.confirmedAt!));
    const days = Math.floor((now.getTime() - oldest.getTime()) / 86400000);
    await upsertScore(db, ctx, 'customer', debtor.customerId, 'debt_aging', days, { outstanding: debtor.outstanding });
    scored++;
  }
  return { scored };
}

/** Next-best-actions: tổng hợp rule-based từ suggestions + báo giá sắp hết hạn + nợ lớn + churn cao. */
export async function nextBestActions(db: Db, ctx: Ctx, p?: { limit?: number }) {
  const limit = p?.limit ?? 10;
  const out: { priority: number; action: string; refType: string; refId: string; reason: string }[] = [];

  const sugg = await db.select().from(ssSuggestions)
    .where(and(eq(ssSuggestions.orgId, ctx.orgId), eq(ssSuggestions.status, 'open')))
    .orderBy(desc(ssSuggestions.createdAt)).limit(limit);
  for (const s of sugg) out.push({ priority: 70, action: s.action, refType: s.refType, refId: s.refId, reason: s.reason });

  const expiring = await db.select().from(ssQuotes).where(and(
    eq(ssQuotes.orgId, ctx.orgId), inArray(ssQuotes.status, ['draft', 'sent']), isNotNull(ssQuotes.validUntil),
  ));
  const soon = nowOf(ctx).getTime() + 7 * 86400000;
  for (const q of expiring) {
    const vu = new Date(q.validUntil!).getTime();
    if (vu >= nowOf(ctx).getTime() && vu <= soon) {
      out.push({ priority: 80, action: 'chase_quote', refType: 'quote', refId: q.id, reason: `Báo giá ${q.code} (${fmtV(q.total)}đ) hết hạn trong ≤7 ngày — gọi chốt` });
    }
  }

  const debt = (await debtSummary(db, ctx, { topN: 3 })) as { topDebtors: { customerId: string; code: string; name: string; outstanding: string }[] };
  for (const dd of debt.topDebtors) {
    if (cmpV(dd.outstanding, ZERO) > 0) {
      out.push({ priority: 75, action: 'remind_debt', refType: 'customer', refId: dd.customerId, reason: `${dd.name} (${dd.code}) đang nợ ${fmtV(dd.outstanding)}đ — nhắc thu` });
    }
  }

  const churn = await churnRiskList(db, ctx, { limit: 3 });
  for (const ch of churn) {
    if (ch.risk >= 60) out.push({ priority: 65, action: 'win_back', refType: 'customer', refId: ch.customerId, reason: `${ch.name} (${ch.code}) im ắng lâu (churn ${ch.risk}) — gọi hỏi thăm/ưu đãi` });
  }

  return out.sort((a, b) => b.priority - a.priority).slice(0, limit);
}
