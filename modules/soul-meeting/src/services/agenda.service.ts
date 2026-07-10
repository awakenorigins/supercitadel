/**
 * SOUL-MEETING 1A — agenda.service
 * Agenda: thêm/sửa/xóa/sắp xếp · publish (draft→công khai, điều kiện ≥1 mục) ·
 * parking lot khi đang họp · run ops (start/stop/skip) — 1 mục active tại 1 thời điểm.
 */
import { and, asc, eq, inArray, max } from 'drizzle-orm';
import type { z } from 'zod';
import type { SmCtx } from '../types.js';
import { SmError, nowOf } from '../types.js';
import { smAgendaItems, smMeetings } from '../db/schema.js';
import { writeAudit, getMeeting, getAgendaItem } from './common.js';
import type {
  agendaAddSchema, agendaUpdateSchema, agendaReorderSchema, agendaRunSchema,
} from '../validation/schemas.js';

const CLOSED = ['completed', 'cancelled'];

export async function addAgendaItem(ctx: SmCtx, input: z.infer<typeof agendaAddSchema>) {
  const m = await getMeeting(ctx, input.meeting_id);
  if (CLOSED.includes(m.status)) throw new SmError('MEETING_STATUS_INVALID', `Họp đang ${m.status} — không thêm agenda`);
  if (input.source === 'parking_lot' && m.status !== 'in_progress') {
    throw new SmError('MEETING_STATUS_INVALID', 'Parking lot chỉ dùng khi đang họp');
  }
  const [mx] = await ctx.db.select({ m: max(smAgendaItems.sortOrder) }).from(smAgendaItems)
    .where(and(eq(smAgendaItems.orgId, ctx.orgId), eq(smAgendaItems.meetingId, input.meeting_id)));
  const rows = await ctx.db.insert(smAgendaItems).values({
    orgId: ctx.orgId, meetingId: input.meeting_id,
    sortOrder: (mx?.m ?? -1) + 1,
    title: input.title, detail: input.detail,
    presenterParticipantId: input.presenter_participant_id,
    timeboxMinutes: input.timebox_minutes,
    source: input.source, createdBy: ctx.userId,
  }).returning();
  await writeAudit(ctx, { action: 'sm.agenda.add', entity: 'smeet_agenda_items', entityId: rows[0]!.id, after: input });
  return rows[0]!;
}

export async function updateAgendaItem(ctx: SmCtx, input: z.infer<typeof agendaUpdateSchema>) {
  const before = await getAgendaItem(ctx, input.id);
  const m = await getMeeting(ctx, before.meetingId);
  if (CLOSED.includes(m.status)) throw new SmError('MEETING_STATUS_INVALID', `Họp đang ${m.status} — không sửa agenda`);
  const rows = await ctx.db.update(smAgendaItems).set({
    title: input.title ?? before.title,
    detail: input.detail ?? before.detail,
    presenterParticipantId: input.presenter_participant_id === undefined ? before.presenterParticipantId : input.presenter_participant_id,
    timeboxMinutes: input.timebox_minutes === undefined ? before.timeboxMinutes : input.timebox_minutes,
  }).where(and(eq(smAgendaItems.orgId, ctx.orgId), eq(smAgendaItems.id, input.id))).returning();
  await writeAudit(ctx, { action: 'sm.agenda.update', entity: 'smeet_agenda_items', entityId: input.id, before, after: input });
  return rows[0]!;
}

export async function removeAgendaItem(ctx: SmCtx, id: string) {
  const item = await getAgendaItem(ctx, id);
  const m = await getMeeting(ctx, item.meetingId);
  if (CLOSED.includes(m.status)) throw new SmError('MEETING_STATUS_INVALID', `Họp đang ${m.status} — không xóa agenda`);
  if (item.status !== 'pending') throw new SmError('AGENDA_ITEM_NOT_FOUND', 'Chỉ xóa được mục chưa chạy (pending)');
  await ctx.db.delete(smAgendaItems).where(and(eq(smAgendaItems.orgId, ctx.orgId), eq(smAgendaItems.id, id)));
  await writeAudit(ctx, { action: 'sm.agenda.remove', entity: 'smeet_agenda_items', entityId: id, before: item });
  return { removed: true };
}

export async function reorderAgenda(ctx: SmCtx, input: z.infer<typeof agendaReorderSchema>) {
  await getMeeting(ctx, input.meeting_id);
  const items = await ctx.db.select().from(smAgendaItems)
    .where(and(
      eq(smAgendaItems.orgId, ctx.orgId), eq(smAgendaItems.meetingId, input.meeting_id),
      inArray(smAgendaItems.id, input.ordered_ids),
    ));
  if (items.length !== input.ordered_ids.length) {
    throw new SmError('AGENDA_ITEM_NOT_FOUND', 'ordered_ids chứa mục không thuộc cuộc họp này');
  }
  for (let i = 0; i < input.ordered_ids.length; i++) {
    await ctx.db.update(smAgendaItems).set({ sortOrder: i })
      .where(and(eq(smAgendaItems.orgId, ctx.orgId), eq(smAgendaItems.id, input.ordered_ids[i]!)));
  }
  await writeAudit(ctx, { action: 'sm.agenda.reorder', entity: 'smeet_meetings', entityId: input.meeting_id, after: { count: input.ordered_ids.length } });
  return listAgenda(ctx, input.meeting_id);
}

export async function listAgenda(ctx: SmCtx, meetingId: string) {
  await getMeeting(ctx, meetingId);
  return ctx.db.select().from(smAgendaItems)
    .where(and(eq(smAgendaItems.orgId, ctx.orgId), eq(smAgendaItems.meetingId, meetingId)))
    .orderBy(asc(smAgendaItems.sortOrder));
}

/** Publish agenda: điều kiện ≥1 mục. Idempotent (publish lần 2 trả về luôn). */
export async function publishAgenda(ctx: SmCtx, meetingId: string) {
  const m = await getMeeting(ctx, meetingId);
  if (CLOSED.includes(m.status)) throw new SmError('MEETING_STATUS_INVALID', `Họp đang ${m.status}`);
  if (m.agendaPublished) return m;
  const items = await ctx.db.select({ id: smAgendaItems.id }).from(smAgendaItems)
    .where(and(eq(smAgendaItems.orgId, ctx.orgId), eq(smAgendaItems.meetingId, meetingId))).limit(1);
  if (items.length === 0) throw new SmError('AGENDA_REQUIRED', 'Agenda trống — thêm ít nhất 1 mục rồi mới publish');
  const rows = await ctx.db.update(smMeetings).set({ agendaPublished: true, updatedAt: new Date() })
    .where(and(eq(smMeetings.orgId, ctx.orgId), eq(smMeetings.id, meetingId))).returning();
  await writeAudit(ctx, { action: 'sm.agenda.publish', entity: 'smeet_meetings', entityId: meetingId });
  return rows[0]!;
}

/** Run ops khi đang họp: start (auto-stop mục đang chạy), stop, skip */
export async function runAgendaItem(ctx: SmCtx, input: z.infer<typeof agendaRunSchema>) {
  const item = await getAgendaItem(ctx, input.id);
  const m = await getMeeting(ctx, item.meetingId);
  if (m.status !== 'in_progress') throw new SmError('MEETING_STATUS_INVALID', 'Chỉ chạy agenda khi họp đang diễn ra');
  const now = nowOf(ctx);
  if (input.op === 'start') {
    if (item.status !== 'pending') throw new SmError('MEETING_STATUS_INVALID', `Mục đang ${item.status} — không start được`);
    await ctx.db.update(smAgendaItems).set({ status: 'done', actualEndAt: now })
      .where(and(
        eq(smAgendaItems.orgId, ctx.orgId), eq(smAgendaItems.meetingId, item.meetingId),
        eq(smAgendaItems.status, 'in_progress'),
      ));
    const rows = await ctx.db.update(smAgendaItems).set({ status: 'in_progress', actualStartAt: now })
      .where(and(eq(smAgendaItems.orgId, ctx.orgId), eq(smAgendaItems.id, input.id))).returning();
    await writeAudit(ctx, { action: 'sm.agenda.item_start', entity: 'smeet_agenda_items', entityId: input.id });
    return rows[0]!;
  }
  if (input.op === 'stop') {
    if (item.status !== 'in_progress') throw new SmError('MEETING_STATUS_INVALID', `Mục đang ${item.status} — không stop được`);
    const rows = await ctx.db.update(smAgendaItems).set({ status: 'done', actualEndAt: now })
      .where(and(eq(smAgendaItems.orgId, ctx.orgId), eq(smAgendaItems.id, input.id))).returning();
    await writeAudit(ctx, { action: 'sm.agenda.item_stop', entity: 'smeet_agenda_items', entityId: input.id });
    return rows[0]!;
  }
  // skip
  if (item.status !== 'pending') throw new SmError('MEETING_STATUS_INVALID', `Mục đang ${item.status} — không skip được`);
  const rows = await ctx.db.update(smAgendaItems).set({ status: 'skipped' })
    .where(and(eq(smAgendaItems.orgId, ctx.orgId), eq(smAgendaItems.id, input.id))).returning();
  await writeAudit(ctx, { action: 'sm.agenda.item_skip', entity: 'smeet_agenda_items', entityId: input.id });
  return rows[0]!;
}
