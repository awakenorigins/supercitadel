/**
 * SOUL-MEETING 1A — report.service
 * Tuần này (lịch 7 ngày) · KPI kỳ (đúng giờ, điểm danh, hoàn thành việc, chi phí
 * họp = phút × người dự × đơn giá/60, tỷ lệ biên bản) · digest cá nhân ·
 * xuất Excel việc cần làm (SheetJS, trả base64 — adapter phục vụ binary).
 */
import * as XLSX from 'xlsx';
import { and, asc, eq, gte, inArray, lt, lte } from 'drizzle-orm';
import type { z } from 'zod';
import type { SmCtx } from '../types.js';
import { isoDate, nowOf } from '../types.js';
import {
  smMeetings, smParticipants, smActionItems, smMinutes, smFeedback,
} from '../db/schema.js';
import type { weekViewSchema, kpiRangeSchema, actionListSchema } from '../validation/schemas.js';
import { listActionItems } from './action.service.js';

const MS_DAY = 86_400_000;
const VN_OFFSET_MS = 7 * 3_600_000;

/** Thứ 2 (00:00 VN) của tuần chứa d */
function weekStartVN(d: Date): Date {
  const local = new Date(d.getTime() + VN_OFFSET_MS);
  const dow = local.getUTCDay(); // 0=CN
  const back = (dow + 6) % 7;    // về Thứ 2
  const monLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - back);
  return new Date(monLocal - VN_OFFSET_MS);
}

export async function weekView(ctx: SmCtx, input: z.infer<typeof weekViewSchema>) {
  const ref = input.week_of ? new Date(`${input.week_of}T00:00:00+07:00`) : nowOf(ctx);
  const start = weekStartVN(ref);
  const end = new Date(start.getTime() + 7 * MS_DAY);
  const rows = await ctx.db.select().from(smMeetings).where(and(
    eq(smMeetings.orgId, ctx.orgId),
    gte(smMeetings.startAt, start), lt(smMeetings.startAt, end),
  )).orderBy(asc(smMeetings.startAt));
  const days = Array.from({ length: 7 }, (_, i) => {
    const dayStart = new Date(start.getTime() + i * MS_DAY);
    const dayEnd = new Date(dayStart.getTime() + MS_DAY);
    return {
      date: new Date(dayStart.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10),
      meetings: rows.filter((m) => m.startAt >= dayStart && m.startAt < dayEnd).map((m) => ({
        id: m.id, title: m.title, status: m.status,
        start_at: m.startAt.toISOString(), end_at: m.endAt.toISOString(),
        location: m.location, online_link: m.onlineLink, agenda_published: m.agendaPublished,
      })),
    };
  });
  return { week_start: days[0]!.date, days };
}

export async function kpiRange(ctx: SmCtx, input: z.infer<typeof kpiRangeSchema>) {
  const from = new Date(`${input.from}T00:00:00+07:00`);
  const to = new Date(`${input.to}T23:59:59+07:00`);
  const meetings = await ctx.db.select().from(smMeetings).where(and(
    eq(smMeetings.orgId, ctx.orgId),
    gte(smMeetings.startAt, from), lte(smMeetings.startAt, to),
  ));
  const completed = meetings.filter((m) => m.status === 'completed');
  const cancelled = meetings.filter((m) => m.status === 'cancelled');
  const mIds = meetings.map((m) => m.id);
  const parts = mIds.length ? await ctx.db.select().from(smParticipants)
    .where(and(eq(smParticipants.orgId, ctx.orgId), inArray(smParticipants.meetingId, mIds))) : [];
  const minutesRows = mIds.length ? await ctx.db.select().from(smMinutes)
    .where(and(eq(smMinutes.orgId, ctx.orgId), inArray(smMinutes.meetingId, mIds), eq(smMinutes.status, 'published'))) : [];
  const fb = mIds.length ? await ctx.db.select().from(smFeedback)
    .where(and(eq(smFeedback.orgId, ctx.orgId), inArray(smFeedback.meetingId, mIds))) : [];

  let onTime = 0; let totalActualMin = 0; let totalCost = 0;
  const publishedMeetingIds = new Set(minutesRows.map((r) => r.meetingId));
  for (const m of completed) {
    const actMin = m.actualStartAt && m.actualEndAt
      ? Math.round((m.actualEndAt.getTime() - m.actualStartAt.getTime()) / 60000)
      : Math.round((m.endAt.getTime() - m.startAt.getTime()) / 60000);
    totalActualMin += actMin;
    if (m.actualStartAt && m.actualStartAt.getTime() <= m.startAt.getTime() + 5 * 60_000) onTime++;
    const presentCount = parts.filter((p) => p.meetingId === m.id && (p.attendance === 'present' || p.attendance === 'late')).length;
    totalCost += Math.round((actMin * presentCount * Number(m.costRate ?? 0)) / 60);
  }
  const eligibleParts = parts.filter((p) => {
    const m = meetings.find((x) => x.id === p.meetingId);
    return m?.status === 'completed' && p.role !== 'informed';
  });
  const attended = eligibleParts.filter((p) => p.attendance === 'present' || p.attendance === 'late').length;

  const actions = await ctx.db.select().from(smActionItems).where(and(
    eq(smActionItems.orgId, ctx.orgId),
    gte(smActionItems.createdAt, from), lte(smActionItems.createdAt, to),
  ));
  const done = actions.filter((a) => a.status === 'done').length;
  const overdueNow = (await listActionItems(ctx, { overdue_only: true, limit: 200 } as z.infer<typeof actionListSchema>)).length;

  const pctOf = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 10000) / 100 : 0);
  return {
    range: { from: input.from, to: input.to },
    meetings: {
      total: meetings.length, completed: completed.length, cancelled: cancelled.length,
      total_minutes: totalActualMin,
      on_time_start_pct: pctOf(onTime, completed.length),
      attendance_rate_pct: pctOf(attended, eligibleParts.length),
      minutes_published_pct: pctOf(completed.filter((m) => publishedMeetingIds.has(m.id)).length, completed.length),
      avg_feedback: fb.length ? Math.round((fb.reduce((s, r) => s + r.rating, 0) / fb.length) * 100) / 100 : null,
    },
    actions: {
      created: actions.length, done,
      completion_pct: pctOf(done, actions.length),
      overdue_open_now: overdueNow,
    },
    cost: { total_vnd: totalCost },
  };
}

/** Digest cá nhân: họp 7 ngày tới + việc của tôi (sắp hạn/quá hạn) */
export async function digest(ctx: SmCtx, userId?: string) {
  const uid = userId ?? ctx.userId;
  const now = nowOf(ctx);
  const in7 = new Date(now.getTime() + 7 * MS_DAY);
  const myParts = await ctx.db.select().from(smParticipants)
    .where(and(eq(smParticipants.orgId, ctx.orgId), eq(smParticipants.userId, uid)));
  const mIds = myParts.map((p) => p.meetingId);
  const upcoming = mIds.length ? await ctx.db.select().from(smMeetings).where(and(
    eq(smMeetings.orgId, ctx.orgId), inArray(smMeetings.id, mIds),
    inArray(smMeetings.status, ['scheduled', 'in_progress']),
    gte(smMeetings.startAt, now), lte(smMeetings.startAt, in7),
  )).orderBy(asc(smMeetings.startAt)) : [];
  const myActions = await ctx.db.select().from(smActionItems).where(and(
    eq(smActionItems.orgId, ctx.orgId), eq(smActionItems.ownerUserId, uid),
    inArray(smActionItems.status, ['open', 'in_progress']),
  )).orderBy(asc(smActionItems.dueDate));
  const today = isoDate(now);
  return {
    user_id: uid,
    upcoming_meetings: upcoming.map((m) => ({
      id: m.id, title: m.title, start_at: m.startAt.toISOString(),
      agenda_published: m.agendaPublished, location: m.location ?? m.onlineLink,
    })),
    my_open_actions: myActions.map((a) => ({
      id: a.id, title: a.title, due_date: a.dueDate, priority: a.priority,
      overdue: !!a.dueDate && a.dueDate < today,
    })),
    overdue_count: myActions.filter((a) => a.dueDate && a.dueDate < today).length,
  };
}

const VN_STATUS: Record<string, string> = {
  open: 'Đang mở', in_progress: 'Đang làm', done: 'Xong', cancelled: 'Hủy', carried_over: 'Đã chuyển kỳ',
};

/** Xuất Excel việc cần làm — trả base64, adapter phục vụ file thật + downloadUrl */
export async function exportActionsXlsx(ctx: SmCtx, input: z.infer<typeof actionListSchema>) {
  const items = await listActionItems(ctx, input);
  const mIds = [...new Set(items.map((i) => i.meetingId).filter(Boolean))] as string[];
  const meetings = mIds.length ? await ctx.db.select({ id: smMeetings.id, title: smMeetings.title })
    .from(smMeetings).where(and(eq(smMeetings.orgId, ctx.orgId), inArray(smMeetings.id, mIds))) : [];
  const mTitle = new Map(meetings.map((m) => [m.id, m.title]));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(items.map((a) => ({
    'Việc': a.title,
    'Phụ trách': a.ownerUserId ?? a.externalOwner ?? '',
    'Hạn': a.dueDate ?? '',
    'Ưu tiên': a.priority,
    'Trạng thái': VN_STATUS[a.status] ?? a.status,
    'Cuộc họp': a.meetingId ? mTitle.get(a.meetingId) ?? '' : '',
  }))), 'Việc cần làm');
  const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string;
  return {
    file_name: `soul-meeting-viec-${isoDate(nowOf(ctx))}.xlsx`,
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    content_base64: b64,
    rows: items.length,
  };
}
