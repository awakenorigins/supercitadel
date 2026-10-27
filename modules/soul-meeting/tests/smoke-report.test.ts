/**
 * SOUL-MEETING 1A — SMOKE REPORT (Beat 6)
 * KPI kỳ (đúng giờ/điểm danh/chi phí/biên bản/việc) · Tuần này · Digest cá nhân ·
 * ICS chuẩn RFC5545 (escape/fold/CRLF) · Excel roundtrip · Scheduled: series
 * rolling + nhắc 2 mốc idempotent + overdue event + retention candidates.
 */
import { randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';
import { sql, and, eq } from 'drizzle-orm';
import { setup, check, eq as eqc, expectErr, events, resetEvents, summary } from './harness.js';
import { seedDefaultTypes, updateSettings } from '../src/services/catalog.service.js';
import { createMeeting, startMeeting, finishMeeting, createSeries } from '../src/services/meeting.service.js';
import { addParticipant, updateParticipant, checkin, setAttendance, setRsvp, listParticipants } from '../src/services/participant.service.js';
import { createActionItem, completeActionItem } from '../src/services/action.service.js';
import { generateDraft, publishMinutes, submitFeedback } from '../src/services/minutes.service.js';
import { registerRecording } from '../src/services/recording.service.js';
import { weekView, kpiRange, digest, exportActionsXlsx } from '../src/services/report.service.js';
import { buildMeetingIcs } from '../src/services/ics.service.js';
import { runScheduledTasks } from '../src/services/scheduled.service.js';
import { smRecordings } from '../src/db/schema.js';

const ORG = randomUUID();
const A = 'user-an'; const B = 'user-binh'; const C = 'user-cuong'; const D = 'user-dung';

async function main() {
  console.log('— SOUL-MEETING SMOKE REPORT (Beat 6) —');
  const h = await setup();
  await h.as(ORG, A, (ctx) => seedDefaultTypes(ctx));
  await h.as(ORG, A, (ctx) => updateSettings(ctx, { hourly_cost: 100000, remind_hours_1: 24, remind_hours_2: 1, audio_retention_days: 30 }));

  // ── FIXTURE M1: completed, đúng giờ, 60', 3/4 dự ──────────────
  const m1 = await h.as(ORG, A, (ctx) => createMeeting(ctx, {
    title: 'Giao ban 13/07', start_at: '2026-07-13T01:00:00Z', end_at: '2026-07-13T02:00:00Z',
    chair_user_id: A, apply_template: false, status: 'scheduled',
  }));
  await h.as(ORG, A, (ctx) => addParticipant(ctx, { meeting_id: m1.id, user_id: B, role: 'attendee', required: true, vote_weight: 0 }));
  await h.as(ORG, A, (ctx) => addParticipant(ctx, { meeting_id: m1.id, user_id: C, role: 'attendee', required: true, vote_weight: 0 }));
  await h.as(ORG, A, (ctx) => addParticipant(ctx, { meeting_id: m1.id, user_id: D, role: 'attendee', required: true, vote_weight: 0 }));
  const p1 = await h.as(ORG, A, (ctx) => listParticipants(ctx, m1.id));
  const pid = (u: string) => p1.find((p) => p.userId === u)!.id;
  await h.as(ORG, A, (ctx) => startMeeting(ctx, m1.id), { now: () => new Date('2026-07-13T01:00:00Z') });
  await h.as(ORG, A, (ctx) => checkin(ctx, { participant_id: pid(A), late_grace_minutes: 5 }), { now: () => new Date('2026-07-13T01:01:00Z') });
  await h.as(ORG, B, (ctx) => checkin(ctx, { participant_id: pid(B), late_grace_minutes: 5 }), { now: () => new Date('2026-07-13T01:02:00Z') });
  await h.as(ORG, C, (ctx) => checkin(ctx, { participant_id: pid(C), late_grace_minutes: 5 }), { now: () => new Date('2026-07-13T01:20:00Z') });
  await h.as(ORG, A, (ctx) => setAttendance(ctx, { participant_id: pid(D), attendance: 'absent' }));
  await h.as(ORG, A, (ctx) => finishMeeting(ctx, m1.id), { now: () => new Date('2026-07-13T02:00:00Z') });
  const mn = await h.as(ORG, A, (ctx) => generateDraft(ctx, { meeting_id: m1.id }));
  await h.as(ORG, A, (ctx) => publishMinutes(ctx, { id: mn.id }));
  await h.as(ORG, B, (ctx) => submitFeedback(ctx, { meeting_id: m1.id, rating: 4 }));
  await h.as(ORG, C, (ctx) => submitFeedback(ctx, { meeting_id: m1.id, rating: 5 }));

  // M2: scheduled 15/07 (chair A, secretary B, C declined)
  const m2 = await h.as(ORG, A, (ctx) => createMeeting(ctx, {
    title: 'Họp dự án, khu B', goal: 'Rà tiến độ kho Cần Thơ giai đoạn 2 — chuẩn bị số liệu tồn kho, công nợ, nhân sự và phương án vận chuyển đường sông cho mùa nước nổi.',
    start_at: '2026-07-15T02:00:00Z', end_at: '2026-07-15T03:00:00Z',
    chair_user_id: A, secretary_user_id: B, apply_template: false, status: 'scheduled',
  }));
  await h.as(ORG, A, (ctx) => addParticipant(ctx, { meeting_id: m2.id, user_id: C, role: 'attendee', required: false, vote_weight: 0 }));
  const p2 = await h.as(ORG, A, (ctx) => listParticipants(ctx, m2.id));
  await h.as(ORG, C, (ctx) => setRsvp(ctx, { participant_id: p2.find((p) => p.userId === C)!.id, rsvp: 'declined' }));

  // Actions: 1 done, 1 overdue, 1 tương lai (owner B)
  const a1 = await h.as(ORG, A, (ctx) => createActionItem(ctx, { meeting_id: m1.id, title: 'Gửi biên bản cho cả nhóm', owner_user_id: B, due_date: '2026-07-14', priority: 'normal' }));
  await h.as(ORG, B, (ctx) => completeActionItem(ctx, a1.id));
  await h.as(ORG, A, (ctx) => createActionItem(ctx, { meeting_id: m1.id, title: 'Chốt báo giá vận chuyển', owner_user_id: B, due_date: '2026-07-05', priority: 'normal' }));
  await h.as(ORG, A, (ctx) => createActionItem(ctx, { meeting_id: m1.id, title: 'Lên kế hoạch Q4', owner_user_id: A, due_date: '2026-08-30', priority: 'normal' }));

  // ── A. WEEK VIEW ───────────────────────────────────────────────
  console.log('\n— A. TUẦN NÀY —');
  const wv = await h.as(ORG, A, (ctx) => weekView(ctx, { week_of: '2026-07-15' }));
  eqc('A1. tuần bắt đầu Thứ 2 13/07', wv.week_start, '2026-07-13');
  check('A2. M1 nằm Thứ 2, M2 nằm Thứ 4', wv.days[0]!.meetings.some((x) => x.id === m1.id) && wv.days[2]!.meetings.some((x) => x.id === m2.id));

  // ── B. KPI ─────────────────────────────────────────────────────
  console.log('\n— B. KPI —');
  const k = await h.as(ORG, A, (ctx) => kpiRange(ctx, { from: '2026-07-01', to: '2026-07-31' }), { now: () => new Date('2026-07-10T12:00:00Z') });
  check('B1. meetings total 2, completed 1', k.meetings.total === 2 && k.meetings.completed === 1);
  eqc('B2. đúng giờ 100%', k.meetings.on_time_start_pct, 100);
  eqc('B3. điểm danh 75% (3/4)', k.meetings.attendance_rate_pct, 75);
  eqc('B4. biên bản phát hành 100%', k.meetings.minutes_published_pct, 100);
  eqc('B5. feedback avg 4.5', k.meetings.avg_feedback, 4.5);
  eqc('B6. chi phí = 60p × 3 người × 100k/60 = 300.000đ', k.cost.total_vnd, 300000);
  check('B7. việc: 3 tạo, 1 xong (33.33%), 1 quá hạn', k.actions.created === 3 && k.actions.done === 1 && k.actions.completion_pct === 33.33 && k.actions.overdue_open_now === 1, JSON.stringify(k.actions));

  // ── C. DIGEST ──────────────────────────────────────────────────
  console.log('\n— C. DIGEST —');
  const dg = await h.as(ORG, B, (ctx) => digest(ctx), { now: () => new Date('2026-07-12T00:00:00Z') });
  check('C1. B có 1 họp sắp tới (M2)', dg.upcoming_meetings.length === 1 && dg.upcoming_meetings[0]!.id === m2.id, JSON.stringify(dg.upcoming_meetings.map((x) => x.title)));
  check('C2. B có 1 việc mở, quá hạn đánh dấu', dg.my_open_actions.length === 1 && dg.my_open_actions[0]!.overdue === true && dg.overdue_count === 1);

  // ── D. ICS ─────────────────────────────────────────────────────
  console.log('\n— D. ICS —');
  const ics = buildMeetingIcs({ ...m2, createdAt: new Date('2026-07-10T00:00:00Z') });
  check('D1. DTSTART/DTEND UTC đúng', ics.includes('DTSTART:20260715T020000Z') && ics.includes('DTEND:20260715T030000Z'));
  check('D2. SUMMARY escape dấu phẩy', ics.includes('SUMMARY:Họp dự án\\, khu B'));
  check('D3. UID + CRLF + CONFIRMED', ics.includes(`UID:${m2.id}@soul-meeting`) && ics.includes('\r\n') && ics.includes('STATUS:CONFIRMED'));
  check('D4. fold dòng DESCRIPTION dài (dòng nối bắt đầu bằng space)', /\r\n [^\r\n]/.test(ics));
  const cancelledIcs = buildMeetingIcs({ ...m2, status: 'cancelled', createdAt: new Date() });
  check('D5. họp hủy → STATUS:CANCELLED', cancelledIcs.includes('STATUS:CANCELLED'));

  // ── E. EXCEL ───────────────────────────────────────────────────
  console.log('\n— E. EXCEL —');
  const xl = await h.as(ORG, A, (ctx) => exportActionsXlsx(ctx, { limit: 200, overdue_only: false }));
  const wb = XLSX.read(xl.content_base64, { type: 'base64' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]!]!);
  check('E1. roundtrip 3 dòng + cột tiếng Việt', xl.rows === 3 && rows.length === 3 && 'Phụ trách' in (rows[0] as object), JSON.stringify(Object.keys(rows[0] as object)));

  // ── F. SCHEDULED ───────────────────────────────────────────────
  console.log('\n— F. SCHEDULED —');
  await h.as(ORG, A, (ctx) => createSeries(ctx, {
    title: 'Standup kho', freq: 'weekly', interval: 1, by_days: ['MO'],
    anchor_start: '2026-07-20T01:00:00Z', duration_minutes: 15, max_count: 2,
    participant_user_ids: [], chair_user_id: A,
  }));
  // backdate 1 recording để test retention (chỉnh created_at trực tiếp — fixture)
  const rec = await h.as(ORG, A, (ctx) => registerRecording(ctx, { meeting_id: m1.id, file_ref: 'files://old.m4a', lang: 'vi' }));
  await h.as(ORG, A, (ctx) => ctx.db.update(smRecordings).set({ createdAt: new Date('2026-05-01T00:00:00Z') })
    .where(and(eq(smRecordings.orgId, ctx.orgId), eq(smRecordings.id, rec.id))));

  const notifyLog: string[] = [];
  const caps = { notify: async (n: { userId: string }) => { notifyLog.push(n.userId); } };
  resetEvents();
  const run1 = await h.as(ORG, A, (ctx) => runScheduledTasks(ctx), { now: () => new Date('2026-07-14T03:00:00Z'), caps });
  check('F1. series sinh 2 occurrence', run1.occurrences_created === 2, String(run1.occurrences_created));
  check('F2. nhắc mốc 1 (T-23h): 1 họp, notify A+B (C declined bị bỏ)', run1.reminders_stage1 === 1 && run1.reminders_stage2 === 0 && notifyLog.sort().join(',') === [A, B].sort().join(','), JSON.stringify(run1) + ' ' + JSON.stringify(notifyLog));
  check('F3. overdue event bắn cho việc quá hạn', run1.overdue_flagged === 1 && events.some((e) => e.name === 'sm.actionitem.overdue'));
  check('F4. retention: 1 purge candidate (file cũ 30+ ngày)', run1.purge_candidates.length === 1 && run1.purge_candidates[0]!.file_ref === 'files://old.m4a');
  notifyLog.length = 0;
  const run2 = await h.as(ORG, A, (ctx) => runScheduledTasks(ctx), { now: () => new Date('2026-07-14T03:10:00Z'), caps });
  check('F5. chạy lại: nhắc mốc 1 KHÔNG lặp, series không sinh thêm', run2.reminders_stage1 === 0 && run2.occurrences_created === 0 && notifyLog.length === 0);
  const run3 = await h.as(ORG, A, (ctx) => runScheduledTasks(ctx), { now: () => new Date('2026-07-15T01:30:00Z') , caps });
  check('F6. T-30p: mốc 2 nổ đúng 1 họp, notify lại A+B', run3.reminders_stage2 === 1 && notifyLog.length === 2);

  summary('SMOKE REPORT');
}
main().catch((e) => { console.error(e); process.exit(1); });
