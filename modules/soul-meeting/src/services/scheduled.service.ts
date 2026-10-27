/**
 * SOUL-MEETING 1A — scheduled.service (việc đêm / định kỳ per-org)
 * 1) Sinh occurrence rolling cho mọi series active
 * 2) Nhắc lịch 2 mốc T-remind_hours_1 / T-remind_hours_2 (cờ reminded chống lặp,
 *    reschedule đã reset cờ) — gửi qua caps.notify nếu có, không thì chỉ đếm
 * 3) Bắn event sm.actionitem.overdue cho việc quá hạn đang mở
 * 4) Liệt kê ghi âm quá hạn lưu (audio_retention_days) — file thuộc host,
 *    module KHÔNG xóa, chỉ trả purge_candidates cho host cron xử lý.
 */
import { and, eq, gte, inArray, lt, lte } from 'drizzle-orm';
import type { SmCtx } from '../types.js';
import { isoDate, nowOf } from '../types.js';
import { smMeetings, smMeetingSeries, smParticipants, smActionItems, smRecordings } from '../db/schema.js';
import { generateOccurrences } from './meeting.service.js';
import { getSettings } from './catalog.service.js';
import { writeAudit } from './common.js';

export interface ScheduledResult {
  occurrences_created: number;
  reminders_stage1: number;
  reminders_stage2: number;
  notified: number;
  overdue_flagged: number;
  purge_candidates: Array<{ id: string; file_ref: string; created_at: string }>;
}

async function remindStage(
  ctx: SmCtx, stage: 1 | 2, hours: number, now: Date,
): Promise<{ meetings: number; notified: number }> {
  const flagCol = stage === 1 ? smMeetings.reminded1 : smMeetings.reminded2;
  const horizon = new Date(now.getTime() + hours * 3_600_000);
  const due = await ctx.db.select().from(smMeetings).where(and(
    eq(smMeetings.orgId, ctx.orgId),
    eq(smMeetings.status, 'scheduled'),
    eq(flagCol, false),
    gte(smMeetings.startAt, now), lte(smMeetings.startAt, horizon),
  ));
  let notified = 0;
  for (const m of due) {
    await ctx.db.update(smMeetings).set(stage === 1 ? { reminded1: true } : { reminded2: true })
      .where(and(eq(smMeetings.orgId, ctx.orgId), eq(smMeetings.id, m.id)));
    if (ctx.caps?.notify) {
      const parts = await ctx.db.select().from(smParticipants)
        .where(and(eq(smParticipants.orgId, ctx.orgId), eq(smParticipants.meetingId, m.id)));
      for (const p of parts) {
        if (!p.userId || p.rsvp === 'declined') continue;
        await ctx.caps.notify({
          orgId: ctx.orgId, userId: p.userId,
          title: `Sắp họp: ${m.title}`,
          body: `Bắt đầu ${new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(m.startAt)}${m.agendaPublished ? '' : ' · agenda CHƯA publish'}`,
          link: `/soul-meeting?meeting=${m.id}`,
        });
        notified++;
      }
    }
  }
  return { meetings: due.length, notified };
}

export async function runScheduledTasks(ctx: SmCtx, horizonDays = 35): Promise<ScheduledResult> {
  const now = nowOf(ctx);
  const settings = await getSettings(ctx);

  // 1) series rolling
  let occurrencesCreated = 0;
  const activeSeries = await ctx.db.select({ id: smMeetingSeries.id }).from(smMeetingSeries)
    .where(and(eq(smMeetingSeries.orgId, ctx.orgId), eq(smMeetingSeries.status, 'active')));
  for (const s of activeSeries) {
    const r = await generateOccurrences(ctx, { id: s.id, horizon_days: horizonDays });
    occurrencesCreated += r.created;
  }

  // 2) nhắc 2 mốc — mốc xa trước, mốc gần sau (họp trong cửa sổ gần ăn cả 2 cờ)
  const st1 = await remindStage(ctx, 1, settings.remindHours1, now);
  const st2 = await remindStage(ctx, 2, settings.remindHours2, now);

  // 3) việc quá hạn → event (host route sang notify/TT tuỳ subscriber)
  const today = isoDate(now);
  const overdue = await ctx.db.select().from(smActionItems).where(and(
    eq(smActionItems.orgId, ctx.orgId),
    inArray(smActionItems.status, ['open', 'in_progress']),
    lt(smActionItems.dueDate, today),
  ));
  for (const a of overdue) {
    await ctx.bus.emit('sm.actionitem.overdue', {
      org_id: ctx.orgId, action_item_id: a.id, title: a.title,
      owner_user_id: a.ownerUserId, due_date: a.dueDate,
    });
  }

  // 4) retention audio
  const cutoff = new Date(now.getTime() - settings.audioRetentionDays * 86_400_000);
  const oldRecs = await ctx.db.select().from(smRecordings).where(and(
    eq(smRecordings.orgId, ctx.orgId), lt(smRecordings.createdAt, cutoff),
  ));

  const result: ScheduledResult = {
    occurrences_created: occurrencesCreated,
    reminders_stage1: st1.meetings, reminders_stage2: st2.meetings,
    notified: st1.notified + st2.notified,
    overdue_flagged: overdue.length,
    purge_candidates: oldRecs.map((r) => ({ id: r.id, file_ref: r.fileRef, created_at: r.createdAt.toISOString() })),
  };
  await writeAudit(ctx, { action: 'sm.scheduled.run', after: result as unknown as Record<string, unknown> });
  return result;
}
