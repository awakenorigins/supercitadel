/** SOUL-SALE 1A — finance.service.ts: chỉ tiêu, hoa hồng, chốt kỳ công nợ, tổng hợp doanh thu, sell-through. */
import { and, eq, inArray, sql, desc, isNull, or } from 'drizzle-orm';
import {
  ssTargets, ssCommissionPlans, ssCommissionEntries, ssDebtSnapshots, ssOrders, ssPayments,
  ssCustomers, ssAgencyProfiles, ssRetailerProfiles, ssAgencyStatements,
} from '../schema.js';
import type { Db, Ctx } from '../contract.js';
import { bad, addV, subV, cmpV, pctOf, ZERO, periodOf, nowOf, fmtV } from '../lib/util.js';
import { getCustomer, subtreeIds, rootAgencyOf } from './master.service.js';

const REVENUE_STATUSES = ['confirmed', 'delivering', 'delivered', 'invoiced', 'closed'];

function inPeriod(d: Date | string | null, period: string): boolean {
  return !!d && periodOf(new Date(d)) === period;
}

async function revenueOrders(db: Db, ctx: Ctx, period?: string) {
  const rows = await db.select().from(ssOrders).where(and(
    eq(ssOrders.orgId, ctx.orgId), inArray(ssOrders.status, REVENUE_STATUSES),
  ));
  return period ? rows.filter((o) => inPeriod(o.confirmedAt, period)) : rows;
}

/* ---------- TARGETS ---------- */
export async function setTarget(db: Db, ctx: Ctx, p: { scope: 'user' | 'agency' | 'territory' | 'org'; scopeId?: string; period: string; targetAmount: string }) {
  if (!/^\d{4}-\d{2}$/.test(p.period)) bad('BAD_PERIOD', 'period phải dạng YYYY-MM');
  const scopeId = p.scope === 'org' ? 'org' : p.scopeId;
  if (!scopeId) bad('SCOPE_ID_REQUIRED', 'Thiếu scopeId (userId/customerId/territoryId)');
  if (p.scope === 'agency') await getCustomer(db, ctx, scopeId!);
  const [row] = await db.insert(ssTargets)
    .values({ orgId: ctx.orgId, scope: p.scope, scopeId: scopeId!, period: p.period, targetAmount: p.targetAmount, createdBy: ctx.userId, updatedAt: nowOf(ctx) })
    .onConflictDoUpdate({
      target: [ssTargets.orgId, ssTargets.scope, ssTargets.scopeId, ssTargets.period],
      set: { targetAmount: p.targetAmount, updatedAt: nowOf(ctx) },
    }).returning();
  return row!;
}

async function territoryOfCustomer(db: Db, ctx: Ctx, customerId: string): Promise<string | null> {
  const ag = await db.select().from(ssAgencyProfiles).where(and(eq(ssAgencyProfiles.orgId, ctx.orgId), eq(ssAgencyProfiles.customerId, customerId)));
  if (ag[0]?.territoryId) return ag[0]!.territoryId;
  const rt = await db.select().from(ssRetailerProfiles).where(and(eq(ssRetailerProfiles.orgId, ctx.orgId), eq(ssRetailerProfiles.customerId, customerId)));
  return rt[0]?.territoryId ?? null;
}

export async function targetRollup(db: Db, ctx: Ctx, p: { period: string }): Promise<{ updated: number }> {
  const targets = await db.select().from(ssTargets).where(and(eq(ssTargets.orgId, ctx.orgId), eq(ssTargets.period, p.period)));
  if (targets.length === 0) return { updated: 0 };
  const orders = await revenueOrders(db, ctx, p.period);
  let updated = 0;
  for (const t of targets) {
    let achieved = ZERO;
    if (t.scope === 'org') achieved = orders.reduce((a, o) => addV(a, o.grandTotal), ZERO);
    else if (t.scope === 'user') achieved = orders.filter((o) => o.ownerUserId === t.scopeId).reduce((a, o) => addV(a, o.grandTotal), ZERO);
    else if (t.scope === 'agency') {
      const sub = new Set(await subtreeIds(db, ctx, t.scopeId));
      achieved = orders.filter((o) => sub.has(o.customerId)).reduce((a, o) => addV(a, o.grandTotal), ZERO);
    } else if (t.scope === 'territory') {
      let sum = ZERO;
      for (const o of orders) {
        const terr = o.territoryId ?? (await territoryOfCustomer(db, ctx, o.customerId));
        if (terr === t.scopeId) sum = addV(sum, o.grandTotal);
      }
      achieved = sum;
    }
    if (achieved !== t.achievedAmount) {
      await db.update(ssTargets).set({ achievedAmount: achieved, updatedAt: nowOf(ctx) })
        .where(and(eq(ssTargets.orgId, ctx.orgId), eq(ssTargets.id, t.id)));
      updated++;
    }
  }
  return { updated };
}

export async function targetProgress(db: Db, ctx: Ctx, p: { period: string; scope?: string }) {
  await targetRollup(db, ctx, { period: p.period });
  const conds = [eq(ssTargets.orgId, ctx.orgId), eq(ssTargets.period, p.period)];
  if (p.scope) conds.push(eq(ssTargets.scope, p.scope));
  const rows = await db.select().from(ssTargets).where(and(...conds));
  return rows.map((t) => {
    const pct = BigInt(t.targetAmount) === 0n ? 0 : Number((BigInt(t.achievedAmount) * 10000n) / BigInt(t.targetAmount)) / 100;
    return { scope: t.scope, scopeId: t.scopeId, period: t.period, target: t.targetAmount, achieved: t.achievedAmount, pct, gap: subV(t.targetAmount, t.achievedAmount) };
  }).sort((a, b) => b.pct - a.pct);
}

/* ---------- COMMISSION ---------- */
export async function setCommissionPlan(db: Db, ctx: Ctx, p: { code: string; name: string; ratePct: string; beneficiary: 'owner' | 'agency'; basis?: string; active?: boolean }) {
  const existing = await db.select().from(ssCommissionPlans).where(and(eq(ssCommissionPlans.orgId, ctx.orgId), eq(ssCommissionPlans.code, p.code)));
  if (existing[0]) {
    const [row] = await db.update(ssCommissionPlans)
      .set({ name: p.name, ratePct: p.ratePct, beneficiary: p.beneficiary, basis: p.basis ?? 'revenue', active: p.active ?? true })
      .where(and(eq(ssCommissionPlans.orgId, ctx.orgId), eq(ssCommissionPlans.id, existing[0]!.id))).returning();
    return row!;
  }
  const [row] = await db.insert(ssCommissionPlans).values({
    orgId: ctx.orgId, code: p.code, name: p.name, ratePct: p.ratePct, beneficiary: p.beneficiary,
    basis: p.basis ?? 'revenue', active: p.active ?? true, createdBy: ctx.userId,
  }).returning();
  return row!;
}

async function commissionCompute(db: Db, ctx: Ctx, p: { period: string; planCode?: string }) {
  const planConds = [eq(ssCommissionPlans.orgId, ctx.orgId), eq(ssCommissionPlans.active, true)];
  if (p.planCode) planConds.push(eq(ssCommissionPlans.code, p.planCode));
  const plans = await db.select().from(ssCommissionPlans).where(and(...planConds));
  const orders = await revenueOrders(db, ctx, p.period);
  const rows: { planId: string; planCode: string; orderId: string; orderCode: string; beneficiaryType: 'owner' | 'agency'; beneficiaryId: string; baseAmount: string; amount: string }[] = [];
  for (const plan of plans) {
    for (const o of orders) {
      let beneficiaryId: string | null = null;
      if (plan.beneficiary === 'owner') beneficiaryId = o.ownerUserId;
      else beneficiaryId = await rootAgencyOf(db, ctx, o.customerId);
      if (!beneficiaryId) continue;
      rows.push({
        planId: plan.id, planCode: plan.code, orderId: o.id, orderCode: o.code,
        beneficiaryType: plan.beneficiary as 'owner' | 'agency', beneficiaryId,
        baseAmount: o.grandTotal, amount: pctOf(o.grandTotal, plan.ratePct),
      });
    }
  }
  return rows;
}

export async function commissionPreview(db: Db, ctx: Ctx, p: { period: string; planCode?: string }) {
  const rows = await commissionCompute(db, ctx, p);
  const total = rows.reduce((a, r) => addV(a, r.amount), ZERO);
  const byBeneficiary = new Map<string, string>();
  for (const r of rows) {
    const k = `${r.beneficiaryType}:${r.beneficiaryId}`;
    byBeneficiary.set(k, addV(byBeneficiary.get(k) ?? ZERO, r.amount));
  }
  return {
    period: p.period, entryCount: rows.length, total, totalFmt: fmtV(total),
    byBeneficiary: [...byBeneficiary.entries()].map(([k, v]) => ({ beneficiary: k, amount: v })),
    entries: rows.slice(0, 50),
  };
}

export async function commissionPost(db: Db, ctx: Ctx, p: { period: string; planCode?: string }) {
  const rows = await commissionCompute(db, ctx, p);
  let created = 0, skipped = 0;
  for (const r of rows) {
    const inserted = await db.insert(ssCommissionEntries).values({
      orgId: ctx.orgId, planId: r.planId, orderId: r.orderId,
      beneficiaryType: r.beneficiaryType, beneficiaryId: r.beneficiaryId,
      baseAmount: r.baseAmount, amount: r.amount, period: p.period,
      status: 'posted', postedBy: ctx.userId, postedAt: nowOf(ctx),
    }).onConflictDoNothing({ target: [ssCommissionEntries.orgId, ssCommissionEntries.planId, ssCommissionEntries.orderId, ssCommissionEntries.beneficiaryType] }).returning();
    if (inserted.length) created++; else skipped++;
  }
  const total = rows.reduce((a, r) => addV(a, r.amount), ZERO);
  await ctx.emit?.('soulsale.commission.posted', { period: p.period, created, skipped, total });
  return { period: p.period, created, skipped, total };
}

/* ---------- DEBT ---------- */
export async function debtSummary(db: Db, ctx: Ctx, p?: { customerId?: string; topN?: number }) {
  if (p?.customerId) {
    const cust = await getCustomer(db, ctx, p.customerId);
    const open = await db.select().from(ssOrders).where(and(
      eq(ssOrders.orgId, ctx.orgId), eq(ssOrders.customerId, cust.id), inArray(ssOrders.status, ['confirmed', 'delivering', 'delivered', 'invoiced']),
    ));
    const openIds = open.map((o) => o.id);
    const pays = await db.select().from(ssPayments).where(and(
      eq(ssPayments.orgId, ctx.orgId), eq(ssPayments.customerId, cust.id),
      openIds.length ? or(isNull(ssPayments.orderId), inArray(ssPayments.orderId, openIds))! : isNull(ssPayments.orderId),
    ));
    const ordered = open.reduce((a, o) => addV(a, o.grandTotal), ZERO);
    const paid = pays.reduce((a, x) => addV(a, x.kind === 'refund' ? `-${x.amount}` : x.amount), ZERO);
    const snaps = await db.select().from(ssDebtSnapshots)
      .where(and(eq(ssDebtSnapshots.orgId, ctx.orgId), eq(ssDebtSnapshots.customerId, cust.id)))
      .orderBy(desc(ssDebtSnapshots.period)).limit(3);
    return { customer: { id: cust.id, code: cust.code, name: cust.name }, openOrderTotal: ordered, paid, outstanding: subV(ordered, paid), recentSnapshots: snaps };
  }
  // top nợ: gộp theo khách
  const open = await db.select().from(ssOrders).where(and(
    eq(ssOrders.orgId, ctx.orgId), inArray(ssOrders.status, ['confirmed', 'delivering', 'delivered', 'invoiced']),
  ));
  const pays = await db.select().from(ssPayments).where(eq(ssPayments.orgId, ctx.orgId));
  const byCust = new Map<string, { ordered: string; paid: string }>();
  for (const o of open) {
    const e = byCust.get(o.customerId) ?? { ordered: ZERO, paid: ZERO };
    e.ordered = addV(e.ordered, o.grandTotal); byCust.set(o.customerId, e);
  }
  const openIdSet = new Set(open.map((o) => o.id));
  for (const x of pays) {
    if (x.orderId && !openIdSet.has(x.orderId)) continue;
    const e = byCust.get(x.customerId) ?? { ordered: ZERO, paid: ZERO };
    e.paid = addV(e.paid, x.kind === 'refund' ? `-${x.amount}` : x.amount); byCust.set(x.customerId, e);
  }
  const ids = [...byCust.keys()];
  const custs = ids.length ? await db.select().from(ssCustomers).where(and(eq(ssCustomers.orgId, ctx.orgId), inArray(ssCustomers.id, ids))) : [];
  const nameOf = new Map(custs.map((cc) => [cc.id, { code: cc.code, name: cc.name }]));
  const list = ids.map((id) => {
    const e = byCust.get(id)!;
    return { customerId: id, ...(nameOf.get(id) ?? { code: '?', name: '?' }), outstanding: subV(e.ordered, e.paid) };
  }).filter((x) => cmpV(x.outstanding, ZERO) > 0)
    .sort((a, b) => cmpV(b.outstanding, a.outstanding))
    .slice(0, p?.topN ?? 10);
  return { topDebtors: list, totalOutstanding: list.reduce((a, x) => addV(a, x.outstanding), ZERO) };
}

function prevPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 2, 1));
  return periodOf(d);
}

export async function debtCloseSummaryPreview(db: Db, ctx: Ctx, p: { period: string; customerId?: string }) {
  const { rows } = await debtCloseCompute(db, ctx, p);
  return {
    period: p.period, customers: rows.length,
    totalClosing: rows.reduce((a, r) => addV(a, r.closing), ZERO),
    sample: rows.slice(0, 10).map((r) => ({ customerId: r.customerId, opening: r.opening, invoiced: r.invoiced, paid: r.paid, closing: r.closing })),
  };
}

async function debtCloseCompute(db: Db, ctx: Ctx, p: { period: string; customerId?: string }) {
  const orders = await db.select().from(ssOrders).where(and(eq(ssOrders.orgId, ctx.orgId), inArray(ssOrders.status, REVENUE_STATUSES)));
  const pays = await db.select().from(ssPayments).where(eq(ssPayments.orgId, ctx.orgId));
  const prevSnaps = await db.select().from(ssDebtSnapshots).where(and(eq(ssDebtSnapshots.orgId, ctx.orgId), eq(ssDebtSnapshots.period, prevPeriod(p.period))));
  const openingOf = new Map(prevSnaps.map((s) => [s.customerId, s.closing]));
  const custIds = new Set<string>([
    ...orders.filter((o) => inPeriod(o.confirmedAt, p.period)).map((o) => o.customerId),
    ...pays.filter((x) => inPeriod(x.at, p.period)).map((x) => x.customerId),
    ...openingOf.keys(),
  ]);
  const target = p.customerId ? [...custIds].filter((id) => id === p.customerId) : [...custIds];
  const rows = target.map((customerId) => {
    const opening = openingOf.get(customerId) ?? ZERO;
    const invoiced = orders.filter((o) => o.customerId === customerId && inPeriod(o.confirmedAt, p.period))
      .reduce((a, o) => addV(a, o.grandTotal), ZERO);
    const paid = pays.filter((x) => x.customerId === customerId && inPeriod(x.at, p.period))
      .reduce((a, x) => addV(a, x.kind === 'refund' ? `-${x.amount}` : x.amount), ZERO);
    return { customerId, opening, invoiced, paid, closing: subV(addV(opening, invoiced), paid) };
  });
  return { rows };
}

export async function debtSnapshotClose(db: Db, ctx: Ctx, p: { period: string; customerId?: string }) {
  if (!/^\d{4}-\d{2}$/.test(p.period)) bad('BAD_PERIOD', 'period phải dạng YYYY-MM');
  const { rows } = await debtCloseCompute(db, ctx, p);
  let upserted = 0;
  for (const r of rows) {
    await db.insert(ssDebtSnapshots).values({
      orgId: ctx.orgId, customerId: r.customerId, period: p.period,
      opening: r.opening, invoiced: r.invoiced, paid: r.paid, closing: r.closing,
      closedAt: nowOf(ctx), closedBy: ctx.userId,
    }).onConflictDoUpdate({
      target: [ssDebtSnapshots.orgId, ssDebtSnapshots.customerId, ssDebtSnapshots.period],
      set: { opening: r.opening, invoiced: r.invoiced, paid: r.paid, closing: r.closing, closedAt: nowOf(ctx), closedBy: ctx.userId },
    });
    upserted++;
  }
  await ctx.emit?.('soulsale.debt.closed', { period: p.period, customers: upserted });
  return { period: p.period, customers: upserted };
}

/* ---------- REVENUE / SELL-THROUGH ---------- */
export async function revenueSummary(db: Db, ctx: Ctx, p?: { period?: string; groupBy?: 'period' | 'owner' | 'channel' | 'agency' }) {
  const groupBy = p?.groupBy ?? 'period';
  const orders = await revenueOrders(db, ctx, p?.period);
  const buckets = new Map<string, { total: string; count: number }>();
  for (const o of orders) {
    let key: string;
    if (groupBy === 'period') key = o.confirmedAt ? periodOf(new Date(o.confirmedAt)) : 'chưa-confirm';
    else if (groupBy === 'owner') key = o.ownerUserId ?? '∅';
    else if (groupBy === 'channel') key = o.channel;
    else key = (await rootAgencyOf(db, ctx, o.customerId)) ?? 'không-qua-kênh';
    const e = buckets.get(key) ?? { total: ZERO, count: 0 };
    e.total = addV(e.total, o.grandTotal); e.count++;
    buckets.set(key, e);
  }
  const rows = [...buckets.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => cmpV(b.total, a.total));
  return { groupBy, period: p?.period ?? 'tất cả', rows, grandTotal: rows.reduce((a, r) => addV(a, r.total), ZERO) };
}

/** Sell-in (đơn công ty bán vào tuyến agency) vs Sell-out (doanh thu agency báo qua Splitter). */
export async function sellthroughSummary(db: Db, ctx: Ctx, p: { agencyCustomerId: string; period?: string }) {
  await getCustomer(db, ctx, p.agencyCustomerId);
  const sub = new Set(await subtreeIds(db, ctx, p.agencyCustomerId));
  const orders = (await revenueOrders(db, ctx, p.period)).filter((o) => sub.has(o.customerId));
  const sellIn = orders.reduce((a, o) => addV(a, o.grandTotal), ZERO);
  const stConds = [eq(ssAgencyStatements.orgId, ctx.orgId), eq(ssAgencyStatements.agencyCustomerId, p.agencyCustomerId)];
  if (p.period) stConds.push(eq(ssAgencyStatements.period, p.period));
  const stmts = await db.select().from(ssAgencyStatements).where(and(...stConds));
  const sellOut = stmts.reduce((a, s) => addV(a, s.revenue), ZERO);
  return {
    agencyCustomerId: p.agencyCustomerId, period: p.period ?? 'tất cả',
    sellIn, sellOut, gap: subV(sellIn, sellOut),
    note: 'sell-in = đơn công ty → tuyến agency; sell-out = doanh thu agency khai qua Splitter (đã confirm)',
  };
}
