/**
 * SOUL-MEETING 1A — action.service
 * Việc cần làm: tạo/batch (dedup fuzzy chống trùng — học Minutia, tự hiện thực),
 * cập nhật + lịch sử, hoàn thành, carry-over sang kỳ họp sau (kèm agenda
 * "Rà soát việc kỳ trước"), danh sách + quá hạn.
 */
import { and, asc, desc, eq, inArray, lt } from 'drizzle-orm';
import type { z } from 'zod';
import type { SmCtx } from '../types.js';
import { SmError, isoDate, nowOf } from '../types.js';
import { smActionItems, smActionUpdates, smAgendaItems } from '../db/schema.js';
import { writeAudit, getMeeting, getActionItem } from './common.js';
import type {
  actionCreateSchema, actionBatchSchema, actionUpdateSchema, actionListSchema, carryoverSchema,
} from '../validation/schemas.js';

// ── Fuzzy dedup (deterministic, không LLM) ──────────────────────────────────
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const tokens = (s: string) => new Set(norm(s).match(/[a-z0-9]+/g) ?? []);
export function similarity(a: string, b: string): number {
  const ta = tokens(a); const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0; for (const t of ta) if (tb.has(t)) inter++;
  const jaccard = inter / (ta.size + tb.size - inter);
  // containment: title ngắn nằm trọn trong title dài (vd thêm "trước ngày 25/07")
  // guard: tập nhỏ >= 3 token để "họp"/"kho" không match bừa
  const minSize = Math.min(ta.size, tb.size);
  const containment = minSize >= 3 ? inter / minSize : 0;
  return Math.max(jaccard, containment);
}

/** Tìm việc ĐANG MỞ (open/in_progress) toàn org na ná title — trả top match */
export async function findSimilarOpen(ctx: SmCtx, title: string, threshold = 0.6) {
  const open = await ctx.db.select({ id: smActionItems.id, title: smActionItems.title })
    .from(smActionItems)
    .where(and(eq(smActionItems.orgId, ctx.orgId), inArray(smActionItems.status, ['open', 'in_progress'])));
  const scored = open
    .map((r) => ({ id: r.id, title: r.title, score: similarity(title, r.title) }))
    .filter((r) => r.score >= threshold)
    .sort((a, b) => b.score - a.score);
  return scored[0];
}

async function history(ctx: SmCtx, actionItemId: string, from: string | null, to: string | null, comment?: string) {
  await ctx.db.insert(smActionUpdates).values({
    orgId: ctx.orgId, actionItemId, authorUserId: ctx.userId,
    statusFrom: from, statusTo: to, comment,
  });
}

export async function createActionItem(ctx: SmCtx, input: z.infer<typeof actionCreateSchema>) {
  if (input.meeting_id) await getMeeting(ctx, input.meeting_id);
  const rows = await ctx.db.insert(smActionItems).values({
    orgId: ctx.orgId, meetingId: input.meeting_id, decisionId: input.decision_id,
    agendaItemId: input.agenda_item_id, title: input.title, description: input.description,
    ownerUserId: input.owner_user_id, externalOwner: input.external_owner,
    dueDate: input.due_date, priority: input.priority, createdBy: ctx.userId,
  }).returning();
  const it = rows[0]!;
  await history(ctx, it.id, null, 'open');
  await writeAudit(ctx, { action: 'sm.action.create', entity: 'smeet_action_items', entityId: it.id, after: input });
  await ctx.bus.emit('sm.actionitem.created', { org_id: ctx.orgId, action_item_id: it.id, title: it.title });
  return it;
}

/** Batch có dedup: trùng (Jaccard ≥ 0.6 với việc đang mở) → skip + báo trùng với ai */
export async function createActionItemsBatch(ctx: SmCtx, input: z.infer<typeof actionBatchSchema>) {
  const created: Array<{ id: string; title: string }> = [];
  const skipped: Array<{ title: string; similar_to: { id: string; title: string; score: number } }> = [];
  for (const raw of input.items) {
    const dup = input.skip_duplicates ? await findSimilarOpen(ctx, raw.title) : undefined;
    if (dup) { skipped.push({ title: raw.title, similar_to: dup }); continue; }
    const it = await createActionItem(ctx, { ...raw, meeting_id: input.meeting_id });
    created.push({ id: it.id, title: it.title });
  }
  return { created, skipped };
}

export async function updateActionItem(ctx: SmCtx, input: z.infer<typeof actionUpdateSchema>) {
  const before = await getActionItem(ctx, input.id);
  if (before.status === 'carried_over') throw new SmError('ACTION_STATUS_INVALID', 'Việc đã carry-over — thao tác trên bản kỳ mới');
  if (input.status === 'done') return completeActionItem(ctx, input.id, input.comment);
  const rows = await ctx.db.update(smActionItems).set({
    title: input.title ?? before.title,
    description: input.description === undefined ? before.description : input.description,
    ownerUserId: input.owner_user_id === undefined ? before.ownerUserId : input.owner_user_id,
    externalOwner: input.external_owner === undefined ? before.externalOwner : input.external_owner,
    dueDate: input.due_date === undefined ? before.dueDate : input.due_date,
    priority: input.priority ?? before.priority,
    status: input.status ?? before.status,
    updatedAt: new Date(),
  }).where(and(eq(smActionItems.orgId, ctx.orgId), eq(smActionItems.id, input.id))).returning();
  if ((input.status && input.status !== before.status) || input.comment) {
    await history(ctx, input.id, before.status, input.status ?? before.status, input.comment);
  }
  await writeAudit(ctx, { action: 'sm.action.update', entity: 'smeet_action_items', entityId: input.id, before: { status: before.status }, after: input });
  return rows[0]!;
}

export async function completeActionItem(ctx: SmCtx, id: string, comment?: string) {
  const before = await getActionItem(ctx, id);
  if (before.status === 'done') return before;
  if (!['open', 'in_progress'].includes(before.status)) {
    throw new SmError('ACTION_STATUS_INVALID', `Việc đang ${before.status} — không hoàn thành được`);
  }
  const rows = await ctx.db.update(smActionItems).set({
    status: 'done', completedAt: nowOf(ctx), completedBy: ctx.userId, updatedAt: new Date(),
  }).where(and(eq(smActionItems.orgId, ctx.orgId), eq(smActionItems.id, id))).returning();
  await history(ctx, id, before.status, 'done', comment);
  await writeAudit(ctx, { action: 'sm.action.complete', entity: 'smeet_action_items', entityId: id });
  return rows[0]!;
}

export async function listActionItems(ctx: SmCtx, input: z.infer<typeof actionListSchema>) {
  const conds = [eq(smActionItems.orgId, ctx.orgId)];
  if (input.status) conds.push(eq(smActionItems.status, input.status));
  if (input.owner_user_id) conds.push(eq(smActionItems.ownerUserId, input.owner_user_id));
  if (input.meeting_id) conds.push(eq(smActionItems.meetingId, input.meeting_id));
  if (input.overdue_only) {
    conds.push(inArray(smActionItems.status, ['open', 'in_progress']));
    conds.push(lt(smActionItems.dueDate, isoDate(nowOf(ctx))));
  }
  return ctx.db.select().from(smActionItems).where(and(...conds))
    .orderBy(asc(smActionItems.dueDate), desc(smActionItems.priority)).limit(input.limit);
}

export async function actionHistory(ctx: SmCtx, actionItemId: string) {
  await getActionItem(ctx, actionItemId);
  return ctx.db.select().from(smActionUpdates)
    .where(and(eq(smActionUpdates.orgId, ctx.orgId), eq(smActionUpdates.actionItemId, actionItemId)))
    .orderBy(asc(smActionUpdates.createdAt));
}

/** Carry-over việc chưa xong sang kỳ họp sau + agenda "Rà soát việc kỳ trước" */
export async function carryoverOpenItems(ctx: SmCtx, input: z.infer<typeof carryoverSchema>) {
  await getMeeting(ctx, input.from_meeting_id);
  const to = await getMeeting(ctx, input.to_meeting_id);
  if (!['draft', 'scheduled'].includes(to.status)) {
    throw new SmError('MEETING_STATUS_INVALID', `Kỳ đích đang ${to.status} — chỉ carry sang họp chưa diễn ra`);
  }
  const conds = [
    eq(smActionItems.orgId, ctx.orgId),
    eq(smActionItems.meetingId, input.from_meeting_id),
    inArray(smActionItems.status, ['open', 'in_progress']),
  ];
  if (input.action_item_ids?.length) conds.push(inArray(smActionItems.id, input.action_item_ids));
  const items = await ctx.db.select().from(smActionItems).where(and(...conds));
  if (items.length === 0) return { carried: 0, review_agenda_item_id: null };

  // agenda "Rà soát việc kỳ trước" — tạo 1 lần
  const [existing] = await ctx.db.select().from(smAgendaItems).where(and(
    eq(smAgendaItems.orgId, ctx.orgId), eq(smAgendaItems.meetingId, input.to_meeting_id),
    eq(smAgendaItems.source, 'carryover'),
  )).limit(1);
  let reviewItem = existing;
  if (!reviewItem) {
    const rows = await ctx.db.insert(smAgendaItems).values({
      orgId: ctx.orgId, meetingId: input.to_meeting_id, sortOrder: -1,
      title: 'Rà soát việc kỳ trước', detail: '', timeboxMinutes: 15,
      source: 'carryover', createdBy: ctx.userId,
    }).returning();
    reviewItem = rows[0]!;
  }

  let carried = 0;
  const lines: string[] = reviewItem.detail ? [reviewItem.detail] : [];
  for (const it of items) {
    const rows = await ctx.db.insert(smActionItems).values({
      orgId: ctx.orgId, meetingId: input.to_meeting_id, agendaItemId: reviewItem.id,
      title: it.title, description: it.description,
      ownerUserId: it.ownerUserId, externalOwner: it.externalOwner,
      dueDate: it.dueDate, priority: it.priority, createdBy: ctx.userId,
    }).returning();
    await history(ctx, rows[0]!.id, null, 'open', `carry-over từ họp ${input.from_meeting_id}`);
    await ctx.db.update(smActionItems).set({
      status: 'carried_over', carriedToMeetingId: input.to_meeting_id, updatedAt: new Date(),
    }).where(and(eq(smActionItems.orgId, ctx.orgId), eq(smActionItems.id, it.id)));
    await history(ctx, it.id, it.status, 'carried_over');
    lines.push(`• ${it.title}${it.ownerUserId ? ` — ${it.ownerUserId}` : ''}`);
    carried++;
  }
  await ctx.db.update(smAgendaItems).set({ detail: lines.join('\n') })
    .where(and(eq(smAgendaItems.orgId, ctx.orgId), eq(smAgendaItems.id, reviewItem.id)));
  await writeAudit(ctx, { action: 'sm.action.carryover', entity: 'smeet_meetings', entityId: input.to_meeting_id, after: { carried, from: input.from_meeting_id } });
  return { carried, review_agenda_item_id: reviewItem.id };
}
