/**
 * SOUL-MEETING 1A — SMOKE PREP (Beat 2)
 * publish gate (agenda trống bị chặn) · reorder validate · run ops 1-active ·
 * parking lot chỉ khi đang họp · read-receipt "ai chưa đọc" · checklist · notes.
 */
import { randomUUID } from 'node:crypto';
import { setup, check, eq as eqc, expectErr, summary } from './harness.js';
import { seedDefaultTypes, updateSettings } from '../src/services/catalog.service.js';
import { createMeeting, startMeeting } from '../src/services/meeting.service.js';
import { addParticipant } from '../src/services/participant.service.js';
import {
  addAgendaItem, updateAgendaItem, removeAgendaItem, reorderAgenda, listAgenda,
  publishAgenda, runAgendaItem,
} from '../src/services/agenda.service.js';
import {
  addDocument, removeDocument, listDocuments, markRead, readStatus,
  addChecklistItem, toggleChecklistItem, listChecklist, addNote, listNotes,
} from '../src/services/prep.service.js';

const ORG = randomUUID();
const FROM = 'user-from'; const HAI = 'user-hai';

async function main() {
  console.log('— SOUL-MEETING SMOKE PREP (Beat 2) —');
  const h = await setup();
  await h.as(ORG, FROM, (ctx) => seedDefaultTypes(ctx));
  await h.as(ORG, FROM, (ctx) => updateSettings(ctx, { hygiene_require_agenda: true }));

  const m = await h.as(ORG, FROM, (ctx) => createMeeting(ctx, {
    title: 'Họp chuẩn bị', start_at: '2026-07-14T02:00:00Z', end_at: '2026-07-14T03:00:00Z',
    chair_user_id: FROM, secretary_user_id: HAI, apply_template: true, status: 'scheduled',
  }));

  // ── A. AGENDA DRAFT → PUBLISH ──────────────────────────────────
  console.log('\n— A. AGENDA —');
  await expectErr('A1. publish agenda trống bị chặn', 'AGENDA_REQUIRED',
    () => h.as(ORG, FROM, (ctx) => publishAgenda(ctx, m.id)));
  const a1 = await h.as(ORG, FROM, (ctx) => addAgendaItem(ctx, { meeting_id: m.id, title: 'Mở đầu', timebox_minutes: 5, source: 'manual' }));
  const a2 = await h.as(ORG, FROM, (ctx) => addAgendaItem(ctx, { meeting_id: m.id, title: 'Nội dung chính', timebox_minutes: 30, source: 'manual' }));
  const a3 = await h.as(ORG, FROM, (ctx) => addAgendaItem(ctx, { meeting_id: m.id, title: 'Chốt việc', timebox_minutes: 10, source: 'manual' }));
  check('A2. sortOrder tự tăng 0,1,2', a1.sortOrder === 0 && a2.sortOrder === 1 && a3.sortOrder === 2);
  const upd = await h.as(ORG, FROM, (ctx) => updateAgendaItem(ctx, { id: a2.id, title: 'Nội dung chính (v2)' }));
  eqc('A3. update title', upd.title, 'Nội dung chính (v2)');
  await expectErr('A4. reorder chứa id lạ bị chặn', 'AGENDA_ITEM_NOT_FOUND',
    () => h.as(ORG, FROM, (ctx) => reorderAgenda(ctx, { meeting_id: m.id, ordered_ids: [a1.id, randomUUID()] })));
  const reordered = await h.as(ORG, FROM, (ctx) => reorderAgenda(ctx, { meeting_id: m.id, ordered_ids: [a3.id, a1.id, a2.id] }));
  check('A5. reorder đúng thứ tự mới', reordered[0]!.id === a3.id && reordered[2]!.id === a2.id);
  const pub = await h.as(ORG, FROM, (ctx) => publishAgenda(ctx, m.id));
  check('A6. publish OK', pub.agendaPublished === true);
  const pub2 = await h.as(ORG, FROM, (ctx) => publishAgenda(ctx, m.id));
  check('A7. publish idempotent', pub2.agendaPublished === true);
  await expectErr('A8. parking lot khi chưa họp bị chặn', 'MEETING_STATUS_INVALID',
    () => h.as(ORG, FROM, (ctx) => addAgendaItem(ctx, { meeting_id: m.id, title: 'Ngoài lề', source: 'parking_lot' })));

  // ── B. RUN OPS (đang họp) ──────────────────────────────────────
  console.log('\n— B. RUN OPS —');
  await h.as(ORG, FROM, (ctx) => startMeeting(ctx, m.id), { now: () => new Date('2026-07-14T02:00:00Z') });
  const r1 = await h.as(ORG, FROM, (ctx) => runAgendaItem(ctx, { id: a3.id, op: 'start' }), { now: () => new Date('2026-07-14T02:01:00Z') });
  check('B1. start mục #1 → in_progress', r1.status === 'in_progress' && !!r1.actualStartAt);
  const r2 = await h.as(ORG, FROM, (ctx) => runAgendaItem(ctx, { id: a1.id, op: 'start' }), { now: () => new Date('2026-07-14T02:07:00Z') });
  const ag = await h.as(ORG, FROM, (ctx) => listAgenda(ctx, m.id));
  const a3after = ag.find((x) => x.id === a3.id)!;
  check('B2. start mục #2 auto-stop mục #1 (done + actualEnd)', r2.status === 'in_progress' && a3after.status === 'done' && !!a3after.actualEndAt);
  const stopped = await h.as(ORG, FROM, (ctx) => runAgendaItem(ctx, { id: a1.id, op: 'stop' }), { now: () => new Date('2026-07-14T02:15:00Z') });
  check('B3. stop → done', stopped.status === 'done');
  const skipped = await h.as(ORG, FROM, (ctx) => runAgendaItem(ctx, { id: a2.id, op: 'skip' }));
  check('B4. skip mục pending → skipped', skipped.status === 'skipped');
  await expectErr('B5. skip mục đã done bị chặn', 'MEETING_STATUS_INVALID',
    () => h.as(ORG, FROM, (ctx) => runAgendaItem(ctx, { id: a1.id, op: 'skip' })));
  const park = await h.as(ORG, FROM, (ctx) => addAgendaItem(ctx, { meeting_id: m.id, title: 'Vấn đề gửi xe', source: 'parking_lot' }));
  check('B6. parking lot khi đang họp OK', park.source === 'parking_lot');
  await expectErr('B7. xóa mục đã done bị chặn', 'AGENDA_ITEM_NOT_FOUND',
    () => h.as(ORG, FROM, (ctx) => removeAgendaItem(ctx, a1.id)));
  const rm = await h.as(ORG, FROM, (ctx) => removeAgendaItem(ctx, park.id));
  check('B8. xóa mục pending OK', rm.removed === true);

  // ── C. DOCUMENTS + READ-RECEIPT ────────────────────────────────
  console.log('\n— C. DOCUMENTS —');
  await h.as(ORG, FROM, (ctx) => addParticipant(ctx, { meeting_id: m.id, external_name: 'Khách', role: 'attendee', required: true, vote_weight: 0 }));
  const d1 = await h.as(ORG, FROM, (ctx) => addDocument(ctx, {
    meeting_id: m.id, kind: 'pre_read', name: 'Báo cáo Q2.pdf', file_ref: 'files://bao-cao-q2', requires_read: true,
  }));
  await h.as(ORG, FROM, (ctx) => addDocument(ctx, {
    meeting_id: m.id, kind: 'handout', name: 'Slide.pptx', file_ref: 'files://slide', requires_read: false,
  }));
  eqc('C1. list 2 tài liệu', (await h.as(ORG, FROM, (ctx) => listDocuments(ctx, m.id))).length, 2);
  await h.as(ORG, HAI, (ctx) => markRead(ctx, { document_id: d1.id }));
  await h.as(ORG, HAI, (ctx) => markRead(ctx, { document_id: d1.id })); // idempotent
  const rs = await h.as(ORG, FROM, (ctx) => readStatus(ctx, m.id));
  check('C2. readStatus chỉ tính tài liệu requires_read', rs.length === 1 && rs[0]!.document_id === d1.id);
  check('C3. HAI đã đọc, FROM chưa — khách ngoài không tính',
    rs[0]!.read_count === 1 && rs[0]!.unread_user_ids.length === 1 && rs[0]!.unread_user_ids[0] === FROM);
  await h.as(ORG, FROM, (ctx) => markRead(ctx, { document_id: d1.id }));
  const rs2 = await h.as(ORG, FROM, (ctx) => readStatus(ctx, m.id));
  eqc('C4. sau khi FROM đọc → unread 0', rs2[0]!.unread_user_ids.length, 0);
  const rmd = await h.as(ORG, FROM, (ctx) => removeDocument(ctx, d1.id));
  check('C5. remove document (kèm reads) OK', rmd.removed === true && (await h.as(ORG, FROM, (ctx) => listDocuments(ctx, m.id))).length === 1);

  // ── D. CHECKLIST + NOTES ───────────────────────────────────────
  console.log('\n— D. CHECKLIST + NOTES —');
  const c1 = await h.as(ORG, FROM, (ctx) => addChecklistItem(ctx, { meeting_id: m.id, title: 'In tài liệu', assignee_user_id: HAI }));
  const t1 = await h.as(ORG, HAI, (ctx) => toggleChecklistItem(ctx, { id: c1.id, done: true }));
  check('D1. toggle done ghi done_by', !!t1.doneAt && t1.doneBy === HAI);
  const t2 = await h.as(ORG, HAI, (ctx) => toggleChecklistItem(ctx, { id: c1.id, done: false }));
  check('D2. toggle undone xóa dấu', t2.doneAt === null && t2.doneBy === null);
  eqc('D3. listChecklist', (await h.as(ORG, FROM, (ctx) => listChecklist(ctx, m.id))).length, 1);
  await expectErr('D4. toggle id lạ → CHECKLIST_NOT_FOUND', 'CHECKLIST_NOT_FOUND',
    () => h.as(ORG, FROM, (ctx) => toggleChecklistItem(ctx, { id: randomUUID(), done: true })));
  const n1 = await h.as(ORG, HAI, (ctx) => addNote(ctx, { meeting_id: m.id, agenda_item_id: a1.id, content: 'Chốt phương án A' }));
  check('D5. note gắn agenda item + author', n1.agendaItemId === a1.id && n1.authorUserId === HAI);
  eqc('D6. listNotes', (await h.as(ORG, FROM, (ctx) => listNotes(ctx, m.id))).length, 1);

  summary('SMOKE PREP');
}
main().catch((e) => { console.error(e); process.exit(1); });
