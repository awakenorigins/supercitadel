/** SOUL-SALE 1A — crm.service.ts: lead lifecycle, deal + stage machine, activity, pipeline summary, health, forecast. */
import { and, eq, desc, inArray, sql } from 'drizzle-orm';
import { ssLeads, ssPipelines, ssPipelineStages, ssDeals, ssActivities, ssScores, ssOrders, ssCustomers } from '../schema.js';
import type { Db, Ctx } from '../contract.js';
import { bad, nextCode, nowOf, addV, pctOf, ZERO, periodOf, normPhone } from '../lib/util.js';
import { createCustomer, duplicateCheck, getCustomer } from './master.service.js';

const SOURCE_WEIGHT: Record<string, number> = {
  referral: 30, showroom: 25, zalo: 20, facebook: 15, tiktok: 15, campaign: 10, import: 5, other: 5,
};

export function leadScoreOf(source: string, activityCount: number, ageDays: number): number {
  const base = SOURCE_WEIGHT[source] ?? 5;
  const act = Math.min(activityCount * 10, 40);
  const fresh = ageDays <= 7 ? 10 : ageDays <= 30 ? 5 : 0;
  return Math.min(base + act + fresh, 100);
}

async function upsertScore(db: Db, ctx: Ctx, entityType: string, entityId: string, kind: string, value: number, meta?: Record<string, unknown>) {
  await db.insert(ssScores)
    .values({ orgId: ctx.orgId, entityType, entityId, kind, value: String(value), meta: meta ?? null, computedAt: nowOf(ctx) })
    .onConflictDoUpdate({
      target: [ssScores.orgId, ssScores.entityType, ssScores.entityId, ssScores.kind],
      set: { value: String(value), meta: meta ?? null, computedAt: nowOf(ctx) },
    });
}

/* ---------- LEADS ---------- */
export async function createLead(db: Db, ctx: Ctx, p: { source: string; name: string; phone?: string; email?: string; note?: string; ownerUserId?: string }) {
  const score = leadScoreOf(p.source, 0, 0);
  const [row] = await db.insert(ssLeads).values({
    orgId: ctx.orgId, source: p.source, name: p.name, phone: normPhone(p.phone), email: p.email ?? null,
    note: p.note ?? null, ownerUserId: p.ownerUserId ?? ctx.userId, score, createdBy: ctx.userId,
  }).returning();
  await upsertScore(db, ctx, 'lead', row!.id, 'lead_score', score, { source: p.source });
  await ctx.emit?.('soulsale.lead.created', { lead_id: row!.id, source: p.source });
  return row!;
}

export async function getLead(db: Db, ctx: Ctx, id: string) {
  const rows = await db.select().from(ssLeads).where(and(eq(ssLeads.orgId, ctx.orgId), eq(ssLeads.id, id)));
  if (!rows[0]) bad('LEAD_NOT_FOUND', `Không tìm thấy lead ${id}`);
  return rows[0]!;
}

export async function assignLead(db: Db, ctx: Ctx, p: { leadId: string; ownerUserId: string }) {
  const lead = await getLead(db, ctx, p.leadId);
  if (['converted', 'disqualified'].includes(lead.status)) bad('LEAD_CLOSED', 'Lead đã đóng, không gán lại');
  const [row] = await db.update(ssLeads)
    .set({ ownerUserId: p.ownerUserId, status: lead.status === 'new' ? 'working' : lead.status, updatedAt: nowOf(ctx) })
    .where(and(eq(ssLeads.orgId, ctx.orgId), eq(ssLeads.id, p.leadId))).returning();
  return row!;
}

export async function disqualifyLead(db: Db, ctx: Ctx, p: { leadId: string; reason: string }) {
  const lead = await getLead(db, ctx, p.leadId);
  if (lead.status === 'converted') bad('LEAD_CONVERTED', 'Lead đã convert, không thể loại');
  const [row] = await db.update(ssLeads)
    .set({ status: 'disqualified', disqualifyReason: p.reason, updatedAt: nowOf(ctx) })
    .where(and(eq(ssLeads.orgId, ctx.orgId), eq(ssLeads.id, p.leadId))).returning();
  return row!;
}

export async function convertLead(db: Db, ctx: Ctx, p: {
  leadId: string; dealTitle?: string; amount?: string;
  customerId?: string; customerKind?: 'person' | 'company';
}) {
  const lead = await getLead(db, ctx, p.leadId);
  if (lead.status === 'converted') bad('LEAD_CONVERTED', 'Lead đã convert trước đó');
  if (lead.status === 'disqualified') bad('LEAD_DISQUALIFIED', 'Lead đã bị loại — mở lại trước khi convert');

  let customerId = p.customerId ?? null;
  let customerReused = false;
  if (!customerId && lead.phone) {
    const dups = await duplicateCheck(db, ctx, { phone: lead.phone });
    if (dups[0] && dups[0].score >= 0.95) { customerId = dups[0].customerId; customerReused = true; }
  }
  if (customerId) await getCustomer(db, ctx, customerId);
  else {
    const cust = await createCustomer(db, ctx, {
      kind: p.customerKind ?? 'person', name: lead.name, phone: lead.phone ?? undefined,
      email: lead.email ?? undefined, ownerUserId: lead.ownerUserId ?? undefined, note: `Convert từ lead (${lead.source})`,
    });
    customerId = cust.id;
  }
  const deal = await createDeal(db, ctx, {
    customerId, leadId: lead.id, title: p.dealTitle ?? `Cơ hội từ ${lead.name}`,
    amount: p.amount, ownerUserId: lead.ownerUserId ?? undefined,
  });
  await db.update(ssLeads)
    .set({ status: 'converted', convertedCustomerId: customerId, convertedDealId: deal.id, updatedAt: nowOf(ctx) })
    .where(and(eq(ssLeads.orgId, ctx.orgId), eq(ssLeads.id, lead.id)));
  await ctx.emit?.('soulsale.lead.converted', { lead_id: lead.id, customer_id: customerId, deal_id: deal.id, customer_reused: customerReused });
  return { leadId: lead.id, customerId, dealId: deal.id, customerReused };
}

/* ---------- DEALS ---------- */
async function defaultPipeline(db: Db, ctx: Ctx, code = 'MAIN') {
  const p = await db.select().from(ssPipelines).where(and(eq(ssPipelines.orgId, ctx.orgId), eq(ssPipelines.code, code)));
  if (!p[0]) bad('PIPELINE_NOT_FOUND', `Pipeline ${code} chưa tồn tại (chạy ensureDefaults trước)`);
  const stages = await db.select().from(ssPipelineStages)
    .where(and(eq(ssPipelineStages.orgId, ctx.orgId), eq(ssPipelineStages.pipelineId, p[0]!.id)))
    .orderBy(ssPipelineStages.sortOrder);
  return { pipeline: p[0]!, stages };
}

export async function createDeal(db: Db, ctx: Ctx, p: {
  customerId?: string; leadId?: string; title: string; amount?: string;
  pipelineCode?: string; stageName?: string; expectedClose?: string; ownerUserId?: string;
}) {
  if (p.customerId) await getCustomer(db, ctx, p.customerId);
  const { pipeline, stages } = await defaultPipeline(db, ctx, p.pipelineCode ?? 'MAIN');
  const stage = p.stageName ? stages.find((s) => s.name === p.stageName) : stages[0];
  if (!stage) bad('STAGE_NOT_FOUND', `Không có stage "${p.stageName}" trong pipeline ${pipeline.code}`);
  const code = await nextCode(db, ctx, 'DL');
  const [row] = await db.insert(ssDeals).values({
    orgId: ctx.orgId, code, customerId: p.customerId ?? null, leadId: p.leadId ?? null,
    pipelineId: pipeline.id, stageId: stage!.id, title: p.title, amount: p.amount ?? '0',
    expectedClose: p.expectedClose ? new Date(p.expectedClose) : null,
    ownerUserId: p.ownerUserId ?? ctx.userId, stageEnteredAt: nowOf(ctx), createdBy: ctx.userId,
    createdAt: nowOf(ctx), updatedAt: nowOf(ctx),
  }).returning();
  await ctx.emit?.('soulsale.deal.created', { deal_id: row!.id, code, amount: row!.amount });
  return row!;
}

export async function getDeal(db: Db, ctx: Ctx, id: string) {
  const rows = await db.select().from(ssDeals).where(and(eq(ssDeals.orgId, ctx.orgId), eq(ssDeals.id, id)));
  if (!rows[0]) bad('DEAL_NOT_FOUND', `Không tìm thấy deal ${id}`);
  return rows[0]!;
}

export async function moveDealStage(db: Db, ctx: Ctx, p: { dealId: string; stageName: string; lostReason?: string; amount?: string }) {
  const deal = await getDeal(db, ctx, p.dealId);
  if (deal.status !== 'open') bad('DEAL_CLOSED', `Deal đã ${deal.status === 'won' ? 'thắng' : 'thua'} — không di chuyển nữa`);
  const stages = await db.select().from(ssPipelineStages)
    .where(and(eq(ssPipelineStages.orgId, ctx.orgId), eq(ssPipelineStages.pipelineId, deal.pipelineId)));
  const stage = stages.find((s) => s.name === p.stageName);
  if (!stage) bad('STAGE_NOT_FOUND', `Pipeline này không có stage "${p.stageName}"`);
  const status = stage!.isWon ? 'won' : stage!.isLost ? 'lost' : 'open';
  if (status === 'lost' && !p.lostReason) bad('LOST_REASON_REQUIRED', 'Đưa deal về Thua phải kèm lý do (lostReason)');
  const [row] = await db.update(ssDeals).set({
    stageId: stage!.id, stageEnteredAt: nowOf(ctx), status,
    lostReason: status === 'lost' ? p.lostReason! : deal.lostReason,
    amount: p.amount ?? deal.amount, updatedAt: nowOf(ctx),
  }).where(and(eq(ssDeals.orgId, ctx.orgId), eq(ssDeals.id, deal.id))).returning();
  await ctx.emit?.('soulsale.deal.moved', { deal_id: deal.id, stage: stage!.name, status });
  return row!;
}

/* ---------- ACTIVITIES ---------- */
export async function logActivity(db: Db, ctx: Ctx, p: {
  kind: 'call' | 'meet' | 'note' | 'task' | 'email' | 'zalo'; subject: string; content?: string;
  refType: 'lead' | 'deal' | 'customer' | 'order'; refId: string; dueAt?: string; doneAt?: string;
}) {
  if (p.refType === 'lead') await getLead(db, ctx, p.refId);
  if (p.refType === 'deal') await getDeal(db, ctx, p.refId);
  if (p.refType === 'customer') await getCustomer(db, ctx, p.refId);
  const [row] = await db.insert(ssActivities).values({
    orgId: ctx.orgId, kind: p.kind, subject: p.subject, content: p.content ?? null,
    refType: p.refType, refId: p.refId,
    dueAt: p.dueAt ? new Date(p.dueAt) : null, doneAt: p.doneAt ? new Date(p.doneAt) : null,
    ownerUserId: ctx.userId, createdBy: ctx.userId, createdAt: nowOf(ctx),
  }).returning();
  if (p.refType === 'deal') {
    await db.update(ssDeals).set({ lastActivityAt: nowOf(ctx), updatedAt: nowOf(ctx) })
      .where(and(eq(ssDeals.orgId, ctx.orgId), eq(ssDeals.id, p.refId)));
  }
  if (p.refType === 'lead') {
    const lead = await getLead(db, ctx, p.refId);
    const n = (await db.select({ n: sql<number>`count(*)::int` }).from(ssActivities)
      .where(and(eq(ssActivities.orgId, ctx.orgId), eq(ssActivities.refType, 'lead'), eq(ssActivities.refId, p.refId))))[0]!.n;
    const age = Math.floor((nowOf(ctx).getTime() - new Date(lead.createdAt).getTime()) / 86400000);
    const score = leadScoreOf(lead.source, n, age);
    await db.update(ssLeads).set({ score, updatedAt: nowOf(ctx) }).where(and(eq(ssLeads.orgId, ctx.orgId), eq(ssLeads.id, p.refId)));
    await upsertScore(db, ctx, 'lead', p.refId, 'lead_score', score, { activities: n });
  }
  return row!;
}

export async function activityTimeline(db: Db, ctx: Ctx, p: { refType: string; refId: string; limit?: number }) {
  return db.select().from(ssActivities)
    .where(and(eq(ssActivities.orgId, ctx.orgId), eq(ssActivities.refType, p.refType), eq(ssActivities.refId, p.refId)))
    .orderBy(desc(ssActivities.createdAt)).limit(p.limit ?? 20);
}

/* ---------- HEALTH / SUMMARY / FORECAST ---------- */
export function healthOf(now: Date, deal: { lastActivityAt: Date | null; createdAt: Date; stageEnteredAt: Date }, stageProbability: number): 'hot' | 'warm' | 'cold' | 'at_risk' {
  const dAct = Math.floor((now.getTime() - new Date(deal.lastActivityAt ?? deal.createdAt).getTime()) / 86400000);
  const dStage = Math.floor((now.getTime() - new Date(deal.stageEnteredAt).getTime()) / 86400000);
  if (dAct > 14 || dStage > 30) return 'at_risk';
  if (dAct <= 3 && stageProbability >= 60) return 'hot';
  if (dAct > 7) return 'cold';
  return 'warm';
}

export async function recomputeDealHealth(db: Db, ctx: Ctx): Promise<{ updated: number }> {
  const deals = await db.select().from(ssDeals).where(and(eq(ssDeals.orgId, ctx.orgId), eq(ssDeals.status, 'open')));
  if (deals.length === 0) return { updated: 0 };
  const stages = await db.select().from(ssPipelineStages).where(eq(ssPipelineStages.orgId, ctx.orgId));
  const probOf = new Map(stages.map((s) => [s.id, s.probability]));
  let updated = 0;
  for (const d of deals) {
    const h = healthOf(nowOf(ctx), d, probOf.get(d.stageId) ?? 0);
    if (h !== d.health) {
      await db.update(ssDeals).set({ health: h, updatedAt: nowOf(ctx) }).where(and(eq(ssDeals.orgId, ctx.orgId), eq(ssDeals.id, d.id)));
      await upsertScore(db, ctx, 'deal', d.id, 'deal_health', { hot: 90, warm: 60, cold: 30, at_risk: 10 }[h]!, { health: h });
      updated++;
    }
  }
  return { updated };
}

export async function dealHealthList(db: Db, ctx: Ctx, p?: { health?: string; limit?: number }) {
  await recomputeDealHealth(db, ctx);
  const conds = [eq(ssDeals.orgId, ctx.orgId), eq(ssDeals.status, 'open')];
  if (p?.health) conds.push(eq(ssDeals.health, p.health));
  const rows = await db.select().from(ssDeals).where(and(...conds)).orderBy(desc(ssDeals.updatedAt)).limit(p?.limit ?? 50);
  return rows.map((d) => ({ id: d.id, code: d.code, title: d.title, amount: d.amount, health: d.health, lastActivityAt: d.lastActivityAt, stageEnteredAt: d.stageEnteredAt }));
}

export async function pipelineSummary(db: Db, ctx: Ctx, p?: { pipelineCode?: string }) {
  const { pipeline, stages } = await defaultPipeline(db, ctx, p?.pipelineCode ?? 'MAIN');
  const deals = await db.select().from(ssDeals)
    .where(and(eq(ssDeals.orgId, ctx.orgId), eq(ssDeals.pipelineId, pipeline.id), eq(ssDeals.status, 'open')));
  const byStage = stages.filter((s) => !s.isWon && !s.isLost).map((s) => {
    const ds = deals.filter((d) => d.stageId === s.id);
    const total = ds.reduce((a, d) => addV(a, d.amount), ZERO);
    return { stage: s.name, probability: s.probability, count: ds.length, total, weighted: pctOf(total, String(s.probability)) };
  });
  return {
    pipeline: pipeline.code,
    stages: byStage,
    openCount: deals.length,
    openTotal: byStage.reduce((a, s) => addV(a, s.total), ZERO),
    weightedTotal: byStage.reduce((a, s) => addV(a, s.weighted), ZERO),
  };
}

/** Forecast = pipeline có trọng số theo tháng expectedClose + run-rate 3 tháng đơn đã chốt. */
export async function salesForecast(db: Db, ctx: Ctx, p?: { months?: number }) {
  const months = p?.months ?? 3;
  const now = nowOf(ctx);
  const stages = await db.select().from(ssPipelineStages).where(eq(ssPipelineStages.orgId, ctx.orgId));
  const probOf = new Map(stages.map((s) => [s.id, s.probability]));
  const deals = await db.select().from(ssDeals).where(and(eq(ssDeals.orgId, ctx.orgId), eq(ssDeals.status, 'open')));
  const buckets: { period: string; pipelineWeighted: string }[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const period = periodOf(d);
    const inMonth = deals.filter((x) => x.expectedClose && periodOf(new Date(x.expectedClose)) === period);
    const weighted = inMonth.reduce((a, x) => addV(a, pctOf(x.amount, String(probOf.get(x.stageId) ?? 0))), ZERO);
    buckets.push({ period, pipelineWeighted: weighted });
  }
  // run-rate: trung bình grandTotal đơn confirmed+ trong 3 tháng gần nhất
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
  const orders = await db.select().from(ssOrders).where(and(
    eq(ssOrders.orgId, ctx.orgId),
    inArray(ssOrders.status, ['confirmed', 'delivering', 'delivered', 'invoiced', 'closed']),
    sql`${ssOrders.confirmedAt} >= ${since.toISOString()}`,
  ));
  const total = orders.reduce((a, o) => addV(a, o.grandTotal), ZERO);
  const runRate = (BigInt(total) / 3n).toString();
  return { method: 'pipeline_weighted + run_rate_3m (rule-based V1)', months: buckets, runRatePerMonth: runRate };
}
