/**
 * SOUL-MEETING 1A — SMOKE CORE (Beat 1)
 * seed 6 loại họp idempotent · settings · tạo họp từ template (agenda+checklist
 * + chair/secretary auto-participant) · lifecycle + hygiene gate · reschedule
 * reset nhắc · series weekly sinh occurrence idempotent · participants đủ đường
 * (dup/bulk/rsvp/checkin đúng giờ-muộn/remove chair bị chặn) · org isolation ·
 * audit + event mang org_id.
 */
import { randomUUID } from 'node:crypto';
import { sql, and, eq } from 'drizzle-orm';
import { setup, check, eq as eqc, expectErr, events, resetEvents, summary } from './harness.js';
import { seedDefaultTypes, listTypes, getSettings, updateSettings } from '../src/services/catalog.service.js';
import {
  createMeeting, updateMeeting, rescheduleMeeting, cancelMeeting, startMeeting,
  finishMeeting, listMeetings, createSeries, generateOccurrences,
} from '../src/services/meeting.service.js';
import {
  addParticipant, bulkAddParticipants, removeParticipant, setRsvp, checkin,
  setAttendance, listParticipants, suggestExternal,
} from '../src/services/participant.service.js';
import { listAudit } from '../src/services/common.js';
import { smMeetings, smAgendaItems, smChecklistItems } from '../src/db/schema.js';

const ORG_A = randomUUID(); const ORG_B = randomUUID();
const FROM = 'user-from'; const HAI = 'user-hai'; const BA = 'user-ba';

async function main() {
  console.log('— SOUL-MEETING SMOKE CORE (Beat 1) —');
  const h = await setup();

  // ── A. SEED + SETTINGS ──────────────────────────────────────────
  console.log('\n— A. SEED + SETTINGS —');
  await h.as(ORG_A, FROM, (ctx) => seedDefaultTypes(ctx));
  await h.as(ORG_A, FROM, (ctx) => seedDefaultTypes(ctx)); // chạy lần 2
  const types = await h.as(ORG_A, FROM, (ctx) => listTypes(ctx));
  eqc('A1. seed idempotent → đúng 6 loại', types.length, 6);
  const hdtv = types.find((t) => t.name === 'Họp HĐTV/HĐQT')!;
  check('A2. HĐTV mang quorum capital_pct 65/65', 
    (hdtv.template as any).quorum_mode === 'capital_pct' && Number((hdtv.template as any).quorum_threshold) === 65);
  const st0 = await h.as(ORG_A, FROM, (ctx) => getSettings(ctx));
  eqc('A3. settings mặc định hourly_cost=0', st0.hourlyCost, '0');
  const st1 = await h.as(ORG_A, FROM, (ctx) => updateSettings(ctx, { hourly_cost: 150000, hygiene_require_agenda: true }));
  check('A4. update settings: cost 150k + hygiene bật', st1.hourlyCost === '150000' && st1.hygieneRequireAgenda === true);

  // ── B. MEETING TỪ TEMPLATE ──────────────────────────────────────
  console.log('\n— B. MEETING TỪ TEMPLATE —');
  const giaoban = types.find((t) => t.name === 'Giao ban tuần')!;
  resetEvents();
  const m1 = await h.as(ORG_A, FROM, (ctx) => createMeeting(ctx, {
    title: 'Giao ban tuần 29', type_id: giaoban.id,
    start_at: '2026-07-13T01:00:00Z', end_at: '2026-07-13T02:00:00Z',
    chair_user_id: FROM, secretary_user_id: HAI,
    apply_template: true, status: 'scheduled',
  }));
  const agA = await h.as(ORG_A, FROM, (ctx) => ctx.db.select().from(smAgendaItems).where(and(eq(smAgendaItems.orgId, ctx.orgId), eq(smAgendaItems.meetingId, m1.id))));
  const ckA = await h.as(ORG_A, FROM, (ctx) => ctx.db.select().from(smChecklistItems).where(and(eq(smChecklistItems.orgId, ctx.orgId), eq(smChecklistItems.meetingId, m1.id))));
  eqc('B1. agenda copy từ template = 5 mục', agA.length, 5);
  eqc('B2. checklist copy = 2 mục', ckA.length, 2);
  check('B3. cost_rate snapshot 150000', m1.costRate === '150000');
  const partsB = await h.as(ORG_A, FROM, (ctx) => listParticipants(ctx, m1.id));
  check('B4. chair+secretary auto-participant đúng vai',
    partsB.some((p) => p.userId === FROM && p.role === 'chair') && partsB.some((p) => p.userId === HAI && p.role === 'secretary'));
  check('B5. event sm.meeting.scheduled mang org_id', events.some((e) => e.name === 'sm.meeting.scheduled' && e.payload.org_id === ORG_A));

  // ── C. LIFECYCLE + HYGIENE ──────────────────────────────────────
  console.log('\n— C. LIFECYCLE + HYGIENE —');
  await expectErr('C1. hygiene: chưa publish agenda → start bị chặn', 'AGENDA_REQUIRED',
    () => h.as(ORG_A, FROM, (ctx) => startMeeting(ctx, m1.id)));
  await h.as(ORG_A, FROM, (ctx) => ctx.db.update(smMeetings).set({ agendaPublished: true })
    .where(and(eq(smMeetings.orgId, ctx.orgId), eq(smMeetings.id, m1.id))));
  const started = await h.as(ORG_A, FROM, (ctx) => startMeeting(ctx, m1.id));
  check('C2. start OK sau publish, có actualStartAt', started.status === 'in_progress' && !!started.actualStartAt);
  await expectErr('C3. start lần 2 bị chặn', 'MEETING_STATUS_INVALID',
    () => h.as(ORG_A, FROM, (ctx) => startMeeting(ctx, m1.id)));
  await expectErr('C4. update khi in_progress bị chặn', 'MEETING_STATUS_INVALID',
    () => h.as(ORG_A, FROM, (ctx) => updateMeeting(ctx, { id: m1.id, title: 'đổi tên' })));
  resetEvents();
  const fin = await h.as(ORG_A, FROM, (ctx) => finishMeeting(ctx, m1.id));
  check('C5. finish OK → completed + event completed', fin.status === 'completed' && events.some((e) => e.name === 'sm.meeting.completed'));
  await expectErr('C6. cancel họp đã completed bị chặn', 'MEETING_STATUS_INVALID',
    () => h.as(ORG_A, FROM, (ctx) => cancelMeeting(ctx, { id: m1.id })));

  const m2 = await h.as(ORG_A, FROM, (ctx) => createMeeting(ctx, {
    title: 'Họp dời lịch', start_at: '2026-07-20T01:00:00Z', end_at: '2026-07-20T02:00:00Z', apply_template: true, status: 'scheduled',
  }));
  await h.as(ORG_A, FROM, (ctx) => ctx.db.update(smMeetings).set({ reminded1: true })
    .where(and(eq(smMeetings.orgId, ctx.orgId), eq(smMeetings.id, m2.id))));
  const m2r = await h.as(ORG_A, FROM, (ctx) => rescheduleMeeting(ctx, { id: m2.id, start_at: '2026-07-21T01:00:00Z', end_at: '2026-07-21T02:00:00Z' }));
  check('C7. reschedule reset cờ nhắc', m2r.reminded1 === false && m2r.startAt.toISOString().startsWith('2026-07-21'));
  await expectErr('C8. reschedule giờ ngược bị chặn', 'MEETING_TIME_INVALID',
    () => h.as(ORG_A, FROM, (ctx) => rescheduleMeeting(ctx, { id: m2.id, start_at: '2026-07-21T03:00:00Z', end_at: '2026-07-21T02:00:00Z' })));
  const canc = await h.as(ORG_A, FROM, (ctx) => cancelMeeting(ctx, { id: m2.id, reason: 'trùng lịch' }));
  check('C9. cancel scheduled OK + lý do', canc.status === 'cancelled' && canc.cancelledReason === 'trùng lịch');

  // ── D. SERIES ───────────────────────────────────────────────────
  console.log('\n— D. SERIES ĐỊNH KỲ —');
  const s1 = await h.as(ORG_A, FROM, (ctx) => createSeries(ctx, {
    title: 'Giao ban T2 hàng tuần', type_id: giaoban.id,
    freq: 'weekly', interval: 1, by_days: ['MO'],
    anchor_start: '2026-07-13T01:00:00Z', duration_minutes: 60, max_count: 3,
    participant_user_ids: [FROM, HAI, BA], chair_user_id: FROM, secretary_user_id: HAI,
  }));
  const gen1 = await h.as(ORG_A, FROM, (ctx) => generateOccurrences(ctx, { id: s1.id, horizon_days: 35 }), { now: () => new Date('2026-07-10T00:00:00Z') });
  check('D0. lần đầu sinh 3 occurrence', gen1.created === 3, `(${gen1.created})`);
  const occ = await h.as(ORG_A, FROM, (ctx) => listMeetings(ctx, { series_id: s1.id, limit: 50 }));
  eqc('D1. series count=3 trong horizon 35d → đúng 3 họp', occ.length, 3);
  const gen2 = await h.as(ORG_A, FROM, (ctx) => generateOccurrences(ctx, { id: s1.id, horizon_days: 35 }), { now: () => new Date('2026-07-10T00:00:00Z') });
  eqc('D2. regenerate idempotent → created 0', gen2.created, 0);
  const occ0parts = await h.as(ORG_A, FROM, (ctx) => listParticipants(ctx, occ[0]!.id));
  check('D3. occurrence copy participants + chair/secretary', 
    occ0parts.length === 3 && occ0parts.some((p) => p.userId === FROM && p.role === 'chair'));
  const occ0agenda = await h.as(ORG_A, FROM, (ctx) => ctx.db.select().from(smAgendaItems).where(and(eq(smAgendaItems.orgId, ctx.orgId), eq(smAgendaItems.meetingId, occ[0]!.id))));
  eqc('D4. occurrence copy agenda template = 5 mục', occ0agenda.length, 5);
  await expectErr('D5. rule sai (byMonthday=31) bị chặn', 'SERIES_RULE_INVALID',
    () => h.as(ORG_A, FROM, (ctx) => createSeries(ctx, {
      title: 'x', freq: 'monthly', interval: 1, by_monthday: 31 as never,
      anchor_start: '2026-07-13T01:00:00Z', duration_minutes: 30, participant_user_ids: [],
    } as never)));

  // ── E. PARTICIPANTS ─────────────────────────────────────────────
  console.log('\n— E. PARTICIPANTS —');
  const mp = occ[1]!;
  await expectErr('E1. thêm trùng user bị chặn', 'PARTICIPANT_DUPLICATE',
    () => h.as(ORG_A, FROM, (ctx) => addParticipant(ctx, { meeting_id: mp.id, user_id: FROM, role: 'attendee', required: true, vote_weight: 0 })));
  const ext = await h.as(ORG_A, FROM, (ctx) => addParticipant(ctx, {
    meeting_id: mp.id, external_name: 'Anh Khách', external_email: 'khach@x.vn', role: 'attendee', required: false, vote_weight: 0,
  }));
  check('E2. khách ngoài free-text OK', ext.externalName === 'Anh Khách' && ext.userId === null);
  const bulk = await h.as(ORG_A, FROM, (ctx) => bulkAddParticipants(ctx, { meeting_id: mp.id, user_ids: [BA, 'user-tu'], role: 'attendee' }));
  check('E3. bulk skip người đã có', bulk.added === 1 && bulk.skipped === 1);
  const rs = await h.as(ORG_A, HAI, (ctx) => setRsvp(ctx, { participant_id: occ0parts.find((p) => p.userId === HAI)!.id, rsvp: 'accepted' }));
  eqc('E4. RSVP accepted', rs.rsvp, 'accepted');
  // check-in: họp 08:00 VN (01:00Z) — 08:03 đúng giờ (grace 5), 08:20 muộn
  const pHai = occ0parts.find((p) => p.userId === HAI)!;
  const pBa = occ0parts.find((p) => p.userId === BA)!;
  const early = await h.as(ORG_A, HAI, (ctx) => checkin(ctx, { participant_id: pHai.id, late_grace_minutes: 5 }), { now: () => new Date('2026-07-13T01:03:00Z') });
  eqc('E5. check-in 08:03 (grace 5) = present', early.attendance, 'present');
  const late = await h.as(ORG_A, BA, (ctx) => checkin(ctx, { participant_id: pBa.id, late_grace_minutes: 5 }), { now: () => new Date('2026-07-13T01:20:00Z') });
  eqc('E6. check-in 08:20 = late', late.attendance, 'late');
  const exc = await h.as(ORG_A, FROM, (ctx) => setAttendance(ctx, { participant_id: ext.id, attendance: 'absent_excused' }));
  eqc('E7. override vắng có phép', exc.attendance, 'absent_excused');
  await expectErr('E8. remove chair bị chặn', 'PARTICIPANT_INVALID',
    () => h.as(ORG_A, FROM, (ctx) => removeParticipant(ctx, occ0parts.find((p) => p.userId === FROM)!.id)));
  const rm = await h.as(ORG_A, FROM, (ctx) => removeParticipant(ctx, ext.id));
  check('E9. remove khách ngoài OK', rm.removed === true);
  const sug = await h.as(ORG_A, FROM, (ctx) => suggestExternal(ctx, { q: 'khach', limit: 5 }));
  check('E10. suggest không có caps.contacts → degrade []', sug.available === false && sug.results.length === 0);
  const sug2 = await h.as(ORG_A, FROM, (ctx) => suggestExternal(ctx, { q: 'jo', limit: 5 }),
    { caps: { contacts: async () => [{ ref: 'ss-c1', name: 'Jolipoli Corp', email: 'hi@jolipoli.vn' }] } });
  check('E11. có caps.contacts → trả kết quả từ injection', sug2.available === true && sug2.results[0]!.name === 'Jolipoli Corp');

  // ── F. ISOLATION + AUDIT ────────────────────────────────────────
  console.log('\n— F. ISOLATION + AUDIT —');
  const listB = await h.as(ORG_B, FROM, (ctx) => listMeetings(ctx, { limit: 50 }));
  eqc('F1. ORG_B không thấy họp ORG_A', listB.length, 0);
  const audits = await h.as(ORG_A, FROM, (ctx) => listAudit(ctx, 200));
  check('F2. audit ghi đủ nghiệp vụ (>=15 dòng)', audits.length >= 15, `(${audits.length})`);
  check('F3. mọi event đều mang org_id', events.every((e) => typeof e.payload.org_id === 'string' && e.payload.org_id.length > 0));

  summary('SMOKE CORE');
}
main().catch((e) => { console.error(e); process.exit(1); });
