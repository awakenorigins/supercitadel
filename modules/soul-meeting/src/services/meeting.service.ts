/**
 * SOUL-MEETING 1A — meeting.service
 * Vòng đời: draft/scheduled → in_progress → completed | cancelled.
 * Tạo họp từ template loại họp (agenda + checklist), series định kỳ sinh
 * occurrence idempotent theo cửa sổ rolling (không trùng, tôn trọng until/count).
 */
import { and, asc, eq, gte, ilike, lte } from 'drizzle-orm';
import type { z } from 'zod';
import type { SmCtx } from '../types.js';
import { SmError, nowOf } from '../types.js';
import {
  smMeetings, smMeetingSeries, smAgendaItems, smChecklistItems, smParticipants,
} from '../db/schema.js';
import { writeAudit, getMeeting, getType, getSeries } from './common.js';
import { getSettings, typeTemplateOf } from './catalog.service.js';
import { occurrencesBetween, validateRule, type RecurRule } from './recurrence.js';
import type {
  meetingCreateSchema, meetingUpdateSchema, meetingRescheduleSchema, meetingCancelSchema,
  meetingListSchema, seriesCreateSchema, seriesGenerateSchema, seriesStatusSchema,
} from '../validation/schemas.js';

const MUTABLE = ['draft', 'scheduled'];

/** Đồng bộ participant cho chair/secretary khi gán trên meeting */
async function syncLeader(ctx: SmCtx, meetingId: string, userId: string | undefined | null, role: 'chair' | 'secretary') {
  if (!userId) return;
  const [existing] = await ctx.db.select().from(smParticipants)
    .where(and(eq(smParticipants.orgId, ctx.orgId), eq(smParticipants.meetingId, meetingId), eq(smParticipants.userId, userId))).limit(1);
  if (existing) {
    if (existing.role !== role) {
      await ctx.db.update(smParticipants).set({ role })
        .where(and(eq(smParticipants.orgId, ctx.orgId), eq(smParticipants.id, existing.id)));
    }
    return;
  }
  await ctx.db.insert(smParticipants).values({
    orgId: ctx.orgId, meetingId, userId, role, required: true, createdBy: ctx.userId,
  });
}

async function applyTypeTemplate(ctx: SmCtx, meetingId: string, typeId: string) {
  const t = await getType(ctx, typeId);
  const tpl = typeTemplateOf(t);
  let i = 0;
  for (const a of tpl.agenda) {
    await ctx.db.insert(smAgendaItems).values({
      orgId: ctx.orgId, meetingId, sortOrder: i++, title: a.title,
      timeboxMinutes: a.timebox_minutes, source: 'template', createdBy: ctx.userId,
    });
  }
  let j = 0;
  for (const c of tpl.checklist) {
    await ctx.db.insert(smChecklistItems).values({
      orgId: ctx.orgId, meetingId, sortOrder: j++, title: c, createdBy: ctx.userId,
    });
  }
}

export async function createMeeting(ctx: SmCtx, input: z.infer<typeof meetingCreateSchema>) {
  const startAt = new Date(input.start_at); const endAt = new Date(input.end_at);
  if (!(endAt.getTime() > startAt.getTime())) {
    throw new SmError('MEETING_TIME_INVALID', 'Giờ kết thúc phải sau giờ bắt đầu');
  }
  const settings = await getSettings(ctx);
  const rows = await ctx.db.insert(smMeetings).values({
    orgId: ctx.orgId, title: input.title, goal: input.goal,
    typeId: input.type_id, status: input.status,
    startAt, endAt, location: input.location, onlineLink: input.online_link,
    chairUserId: input.chair_user_id, secretaryUserId: input.secretary_user_id,
    costRate: settings.costEnabled ? settings.hourlyCost : null,
    createdBy: ctx.userId,
  }).returning();
  const m = rows[0]!;
  if (input.type_id && input.apply_template) await applyTypeTemplate(ctx, m.id, input.type_id);
  await syncLeader(ctx, m.id, input.chair_user_id, 'chair');
  await syncLeader(ctx, m.id, input.secretary_user_id, 'secretary');
  if (ctx.userId && ctx.userId !== input.chair_user_id && ctx.userId !== input.secretary_user_id) {
    await ctx.db.insert(smParticipants).values({
      orgId: ctx.orgId, meetingId: m.id, userId: ctx.userId, role: 'attendee', createdBy: ctx.userId,
    }).onConflictDoNothing();
  }
  await writeAudit(ctx, { action: 'sm.meeting.create', entity: 'smeet_meetings', entityId: m.id, after: input });
  await ctx.bus.emit('sm.meeting.scheduled', { org_id: ctx.orgId, meeting_id: m.id, title: m.title, start_at: m.startAt.toISOString() });
  return m;
}

export async function updateMeeting(ctx: SmCtx, input: z.infer<typeof meetingUpdateSchema>) {
  const before = await getMeeting(ctx, input.id);
  if (!MUTABLE.includes(before.status)) {
    throw new SmError('MEETING_STATUS_INVALID', `Chỉ sửa được họp draft/scheduled (đang ${before.status})`);
  }
  const rows = await ctx.db.update(smMeetings).set({
    title: input.title ?? before.title,
    goal: input.goal ?? before.goal,
    location: input.location ?? before.location,
    onlineLink: input.online_link ?? before.onlineLink,
    chairUserId: input.chair_user_id ?? before.chairUserId,
    secretaryUserId: input.secretary_user_id ?? before.secretaryUserId,
    updatedAt: new Date(),
  }).where(and(eq(smMeetings.orgId, ctx.orgId), eq(smMeetings.id, input.id))).returning();
  if (input.chair_user_id && input.chair_user_id !== before.chairUserId) {
    if (before.chairUserId) {
      await ctx.db.update(smParticipants).set({ role: 'attendee' })
        .where(and(eq(smParticipants.orgId, ctx.orgId), eq(smParticipants.meetingId, input.id), eq(smParticipants.userId, before.chairUserId)));
    }
    await syncLeader(ctx, input.id, input.chair_user_id, 'chair');
  }
  if (input.secretary_user_id && input.secretary_user_id !== before.secretaryUserId) {
    if (before.secretaryUserId) {
      await ctx.db.update(smParticipants).set({ role: 'attendee' })
        .where(and(eq(smParticipants.orgId, ctx.orgId), eq(smParticipants.meetingId, input.id), eq(smParticipants.userId, before.secretaryUserId)));
    }
    await syncLeader(ctx, input.id, input.secretary_user_id, 'secretary');
  }
  await writeAudit(ctx, { action: 'sm.meeting.update', entity: 'smeet_meetings', entityId: input.id, before, after: input });
  return rows[0]!;
}

export async function rescheduleMeeting(ctx: SmCtx, input: z.infer<typeof meetingRescheduleSchema>) {
  const before = await getMeeting(ctx, input.id);
  if (!MUTABLE.includes(before.status)) {
    throw new SmError('MEETING_STATUS_INVALID', `Chỉ dời được họp draft/scheduled (đang ${before.status})`);
  }
  const startAt = new Date(input.start_at); const endAt = new Date(input.end_at);
  if (!(endAt.getTime() > startAt.getTime())) {
    throw new SmError('MEETING_TIME_INVALID', 'Giờ kết thúc phải sau giờ bắt đầu');
  }
  const rows = await ctx.db.update(smMeetings).set({
    startAt, endAt, reminded1: false, reminded2: false, updatedAt: new Date(),
  }).where(and(eq(smMeetings.orgId, ctx.orgId), eq(smMeetings.id, input.id))).returning();
  await writeAudit(ctx, { action: 'sm.meeting.reschedule', entity: 'smeet_meetings', entityId: input.id, before: { start_at: before.startAt }, after: input });
  await ctx.bus.emit('sm.meeting.scheduled', { org_id: ctx.orgId, meeting_id: input.id, rescheduled: true, start_at: startAt.toISOString() });
  return rows[0]!;
}

export async function cancelMeeting(ctx: SmCtx, input: z.infer<typeof meetingCancelSchema>) {
  const before = await getMeeting(ctx, input.id);
  if (before.status === 'completed' || before.status === 'cancelled') {
    throw new SmError('MEETING_STATUS_INVALID', `Họp đang ${before.status} — không hủy được`);
  }
  const rows = await ctx.db.update(smMeetings).set({
    status: 'cancelled', cancelledReason: input.reason, updatedAt: new Date(),
  }).where(and(eq(smMeetings.orgId, ctx.orgId), eq(smMeetings.id, input.id))).returning();
  await writeAudit(ctx, { action: 'sm.meeting.cancel', entity: 'smeet_meetings', entityId: input.id, after: input });
  await ctx.bus.emit('sm.meeting.cancelled', { org_id: ctx.orgId, meeting_id: input.id, reason: input.reason });
  return rows[0]!;
}

export async function startMeeting(ctx: SmCtx, id: string) {
  const before = await getMeeting(ctx, id);
  if (before.status !== 'scheduled' && before.status !== 'draft') {
    throw new SmError('MEETING_STATUS_INVALID', `Họp đang ${before.status} — không start được`);
  }
  const settings = await getSettings(ctx);
  if (settings.hygieneRequireAgenda && !before.agendaPublished) {
    throw new SmError('AGENDA_REQUIRED', 'Quy tắc họp: chưa publish agenda thì không được bắt đầu họp');
  }
  const rows = await ctx.db.update(smMeetings).set({
    status: 'in_progress', actualStartAt: nowOf(ctx), updatedAt: new Date(),
  }).where(and(eq(smMeetings.orgId, ctx.orgId), eq(smMeetings.id, id))).returning();
  await writeAudit(ctx, { action: 'sm.meeting.start', entity: 'smeet_meetings', entityId: id });
  await ctx.bus.emit('sm.meeting.started', { org_id: ctx.orgId, meeting_id: id });
  return rows[0]!;
}

export async function finishMeeting(ctx: SmCtx, id: string) {
  const before = await getMeeting(ctx, id);
  if (before.status !== 'in_progress') {
    throw new SmError('MEETING_STATUS_INVALID', `Họp đang ${before.status} — không kết thúc được`);
  }
  const now = nowOf(ctx);
  // đóng mọi agenda item đang chạy dở
  await ctx.db.update(smAgendaItems).set({ status: 'done', actualEndAt: now })
    .where(and(eq(smAgendaItems.orgId, ctx.orgId), eq(smAgendaItems.meetingId, id), eq(smAgendaItems.status, 'in_progress')));
  const rows = await ctx.db.update(smMeetings).set({
    status: 'completed', actualEndAt: now, updatedAt: new Date(),
  }).where(and(eq(smMeetings.orgId, ctx.orgId), eq(smMeetings.id, id))).returning();
  const m = rows[0]!;
  const durMin = m.actualStartAt ? Math.max(0, Math.round((now.getTime() - m.actualStartAt.getTime()) / 60000)) : 0;
  await writeAudit(ctx, { action: 'sm.meeting.finish', entity: 'smeet_meetings', entityId: id, after: { duration_minutes: durMin } });
  await ctx.bus.emit('sm.meeting.completed', { org_id: ctx.orgId, meeting_id: id, duration_minutes: durMin });
  return m;
}

export async function listMeetings(ctx: SmCtx, input: z.infer<typeof meetingListSchema>) {
  const conds = [eq(smMeetings.orgId, ctx.orgId)];
  if (input.from) conds.push(gte(smMeetings.startAt, new Date(input.from)));
  if (input.to) conds.push(lte(smMeetings.startAt, new Date(input.to)));
  if (input.status) conds.push(eq(smMeetings.status, input.status));
  if (input.series_id) conds.push(eq(smMeetings.seriesId, input.series_id));
  if (input.type_id) conds.push(eq(smMeetings.typeId, input.type_id));
  if (input.q) conds.push(ilike(smMeetings.title, `%${input.q}%`));
  return ctx.db.select().from(smMeetings).where(and(...conds))
    .orderBy(asc(smMeetings.startAt)).limit(input.limit);
}

// ── SERIES ───────────────────────────────────────────────────────────────────

function ruleOf(s: { freq: string; interval: number; byDays: string | null; byMonthday: number | null; untilDate: string | null; maxCount: number | null }): RecurRule {
  return {
    freq: s.freq as RecurRule['freq'],
    interval: s.interval,
    byDays: s.byDays ? s.byDays.split(',').filter(Boolean) : undefined,
    byMonthday: s.byMonthday ?? undefined,
    untilDate: s.untilDate ?? undefined,
    maxCount: s.maxCount ?? undefined,
  };
}

export async function createSeries(ctx: SmCtx, input: z.infer<typeof seriesCreateSchema>) {
  const rule: RecurRule = {
    freq: input.freq, interval: input.interval, byDays: input.by_days,
    byMonthday: input.by_monthday, untilDate: input.until_date, maxCount: input.max_count,
  };
  const err = validateRule(rule);
  if (err) throw new SmError('SERIES_RULE_INVALID', `Rule định kỳ không hợp lệ: ${err}`);
  let agendaTpl: unknown = [];
  if (input.type_id) agendaTpl = typeTemplateOf(await getType(ctx, input.type_id)).agenda;
  const rows = await ctx.db.insert(smMeetingSeries).values({
    orgId: ctx.orgId, typeId: input.type_id, title: input.title,
    freq: input.freq, interval: input.interval,
    byDays: input.by_days?.join(','), byMonthday: input.by_monthday,
    anchorStart: new Date(input.anchor_start), durationMinutes: input.duration_minutes,
    untilDate: input.until_date, maxCount: input.max_count,
    location: input.location, onlineLink: input.online_link,
    templateSnapshot: {
      agenda: agendaTpl,
      participant_user_ids: input.participant_user_ids,
      chair_user_id: input.chair_user_id, secretary_user_id: input.secretary_user_id,
    },
    createdBy: ctx.userId,
  }).returning();
  const s = rows[0]!;
  await writeAudit(ctx, { action: 'sm.series.create', entity: 'smeet_meeting_series', entityId: s.id, after: input });
  return s;
}

/** Sinh occurrence rolling — idempotent: (series_id, start_at) đã có thì bỏ qua */
export async function generateOccurrences(ctx: SmCtx, input: z.infer<typeof seriesGenerateSchema>) {
  const s = await getSeries(ctx, input.id);
  if (s.status !== 'active') return { created: 0, series_id: s.id, note: `series ${s.status}` };
  const now = nowOf(ctx);
  const windowStart = s.anchorStart;                    // luôn quét từ anchor — idempotency lo chuyện trùng
  const windowEnd = new Date(now.getTime() + input.horizon_days * 86_400_000);
  const snap = (s.templateSnapshot ?? {}) as {
    agenda?: Array<{ title: string; timebox_minutes?: number }>;
    participant_user_ids?: string[]; chair_user_id?: string; secretary_user_id?: string;
  };
  const existing = await ctx.db.select({ startAt: smMeetings.startAt }).from(smMeetings)
    .where(and(eq(smMeetings.orgId, ctx.orgId), eq(smMeetings.seriesId, s.id)));
  const have = new Set(existing.map((r) => r.startAt.getTime()));
  const marks = occurrencesBetween(s.anchorStart, ruleOf(s), windowStart, windowEnd);
  let created = 0;
  for (const startAt of marks) {
    if (have.has(startAt.getTime())) continue;
    const endAt = new Date(startAt.getTime() + s.durationMinutes * 60_000);
    const rows = await ctx.db.insert(smMeetings).values({
      orgId: ctx.orgId, seriesId: s.id, typeId: s.typeId, title: s.title,
      startAt, endAt, location: s.location, onlineLink: s.onlineLink,
      chairUserId: snap.chair_user_id, secretaryUserId: snap.secretary_user_id,
      createdBy: ctx.userId,
    }).returning();
    const m = rows[0]!;
    let i = 0;
    for (const a of snap.agenda ?? []) {
      await ctx.db.insert(smAgendaItems).values({
        orgId: ctx.orgId, meetingId: m.id, sortOrder: i++, title: a.title,
        timeboxMinutes: a.timebox_minutes, source: 'template', createdBy: ctx.userId,
      });
    }
    await syncLeader(ctx, m.id, snap.chair_user_id, 'chair');
    await syncLeader(ctx, m.id, snap.secretary_user_id, 'secretary');
    for (const uid of snap.participant_user_ids ?? []) {
      if (uid === snap.chair_user_id || uid === snap.secretary_user_id) continue;
      await ctx.db.insert(smParticipants).values({
        orgId: ctx.orgId, meetingId: m.id, userId: uid, role: 'attendee', createdBy: ctx.userId,
      }).onConflictDoNothing();
    }
    created++;
  }
  await ctx.db.update(smMeetingSeries).set({ generatedUntil: windowEnd, updatedAt: new Date() })
    .where(and(eq(smMeetingSeries.orgId, ctx.orgId), eq(smMeetingSeries.id, s.id)));
  if (created > 0) await writeAudit(ctx, { action: 'sm.series.generate', entity: 'smeet_meeting_series', entityId: s.id, after: { created } });
  return { created, series_id: s.id };
}

export async function setSeriesStatus(ctx: SmCtx, input: z.infer<typeof seriesStatusSchema>) {
  await getSeries(ctx, input.id);
  const rows = await ctx.db.update(smMeetingSeries).set({ status: input.status, updatedAt: new Date() })
    .where(and(eq(smMeetingSeries.orgId, ctx.orgId), eq(smMeetingSeries.id, input.id))).returning();
  await writeAudit(ctx, { action: 'sm.series.status', entity: 'smeet_meeting_series', entityId: input.id, after: input });
  return rows[0]!;
}

export async function listSeries(ctx: SmCtx) {
  return ctx.db.select().from(smMeetingSeries).where(eq(smMeetingSeries.orgId, ctx.orgId))
    .orderBy(asc(smMeetingSeries.createdAt));
}
