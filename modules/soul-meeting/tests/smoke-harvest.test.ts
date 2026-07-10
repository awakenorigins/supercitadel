/**
 * SOUL-MEETING 1A — SMOKE HARVEST (Beat 4)
 * Actions: batch dedup Jaccard · lịch sử · complete · overdue.
 * Carry-over sang kỳ mới + agenda "Rà soát việc kỳ trước".
 * Biên bản HĐTV: generate render đủ trường Điều 60 → draft→submit→approve(chair-only)
 * →publish immutable → version 2. Loại thường publish thẳng từ draft.
 * Feedback unique. Harvest-from-text deterministic, KHÔNG ghi DB.
 */
import { randomUUID } from 'node:crypto';
import { setup, check, eq as eqc, expectErr, events, resetEvents, summary } from './harness.js';
import { seedDefaultTypes, listTypes, updateSettings } from '../src/services/catalog.service.js';
import { createMeeting, startMeeting, finishMeeting } from '../src/services/meeting.service.js';
import { addParticipant, updateParticipant, checkin, listParticipants } from '../src/services/participant.service.js';
import { createVote, castBallot, closeVote, addDecision } from '../src/services/vote.service.js';
import {
  similarity, createActionItem, createActionItemsBatch, updateActionItem,
  completeActionItem, listActionItems, actionHistory, carryoverOpenItems,
} from '../src/services/action.service.js';
import {
  generateDraft, updateDraft, submitMinutes, approveMinutes, rejectMinutes,
  publishMinutes, listMinutes, submitFeedback, feedbackSummary,
} from '../src/services/minutes.service.js';
import { harvestFromText } from '../src/services/harvest.service.js';
import { listAgenda } from '../src/services/agenda.service.js';

const ORG = randomUUID();
const A = 'tv-an'; const B = 'tv-binh'; const E = 'thuky-e';

async function main() {
  console.log('— SOUL-MEETING SMOKE HARVEST (Beat 4) —');
  const h = await setup();
  const types = await h.as(ORG, A, (ctx) => seedDefaultTypes(ctx));
  await h.as(ORG, A, (ctx) => updateSettings(ctx, { hourly_cost: 120000 }));
  const hdtvType = types.find((t) => t.name === 'Họp HĐTV/HĐQT')!;

  // ── dựng cuộc họp HĐTV hoàn chỉnh (Beat 3 flow rút gọn) ────────
  const m = await h.as(ORG, A, (ctx) => createMeeting(ctx, {
    title: 'Họp HĐTV quý 3/2026', goal: 'Thông qua mở kho Cần Thơ',
    type_id: hdtvType.id, location: 'VP Cần Thơ',
    start_at: '2026-07-15T02:00:00Z', end_at: '2026-07-15T04:00:00Z',
    chair_user_id: A, secretary_user_id: E, apply_template: true, status: 'scheduled',
  }));
  await h.as(ORG, A, (ctx) => addParticipant(ctx, { meeting_id: m.id, user_id: B, role: 'attendee', required: true, vote_weight: 35 }));
  const parts = await h.as(ORG, A, (ctx) => listParticipants(ctx, m.id));
  const pA = parts.find((p) => p.userId === A)!; const pB0 = parts.find((p) => p.userId === B);
  const pB = pB0 ?? (await h.as(ORG, A, (ctx) => listParticipants(ctx, m.id))).find((p) => p.userId === B)!;
  await h.as(ORG, A, (ctx) => updateParticipant(ctx, { participant_id: pA.id, vote_weight: 65 }));
  await h.as(ORG, A, (ctx) => startMeeting(ctx, m.id), { now: () => new Date('2026-07-15T02:00:00Z') });
  await h.as(ORG, A, (ctx) => checkin(ctx, { participant_id: pA.id, late_grace_minutes: 5 }), { now: () => new Date('2026-07-15T02:01:00Z') });
  await h.as(ORG, B, (ctx) => checkin(ctx, { participant_id: pB.id, late_grace_minutes: 5 }), { now: () => new Date('2026-07-15T02:02:00Z') });
  const v = await h.as(ORG, A, (ctx) => createVote(ctx, {
    meeting_id: m.id, question: 'Thông qua phương án mở kho Cần Thơ',
    quorum_mode: 'capital_pct', quorum_threshold: 65, pass_threshold: 65, pass_basis: 'attending',
  }));
  await h.as(ORG, A, (ctx) => castBallot(ctx, { vote_id: v.id, participant_id: pA.id, choice: 'Tán thành' }));
  await h.as(ORG, B, (ctx) => castBallot(ctx, { vote_id: v.id, participant_id: pB.id, choice: 'Không tán thành' }));
  await h.as(ORG, A, (ctx) => closeVote(ctx, { vote_id: v.id }));
  await h.as(ORG, E, (ctx) => addDecision(ctx, { meeting_id: m.id, content: 'Thông qua mở kho Cần Thơ', method: 'vote', vote_id: v.id }));

  // ── A. ACTION ITEMS ────────────────────────────────────────────
  console.log('\n— A. ACTION ITEMS —');
  check('A1. similarity: "Khảo sát mặt bằng kho Cần Thơ" ~ "khao sat mat bang kho can tho" ≥0.9',
    similarity('Khảo sát mặt bằng kho Cần Thơ', 'khao sat mat bang kho can tho') >= 0.9);
  const a1 = await h.as(ORG, E, (ctx) => createActionItem(ctx, {
    meeting_id: m.id, title: 'Khảo sát mặt bằng kho Cần Thơ', owner_user_id: B, due_date: '2026-07-20', priority: 'high',
  }));
  resetEvents();
  const batch = await h.as(ORG, E, (ctx) => createActionItemsBatch(ctx, {
    meeting_id: m.id, skip_duplicates: true,
    items: [
      { title: 'Khảo sát mặt bằng kho tại Cần Thơ', priority: 'normal' },        // trùng a1
      { title: 'Soạn hợp đồng thuê kho', owner_user_id: A, due_date: '2026-07-25', priority: 'normal' },
      { title: 'Xin giấy phép PCCC', priority: 'urgent' },
    ],
  } as never));
  check('A2. batch dedup: 2 tạo, 1 skip có similar_to', batch.created.length === 2 && batch.skipped.length === 1 && batch.skipped[0]!.similar_to.id === a1.id,
    JSON.stringify({ c: batch.created.length, s: batch.skipped.length }));
  check('A3. event sm.actionitem.created ×2', events.filter((e) => e.name === 'sm.actionitem.created').length === 2);
  const upd = await h.as(ORG, B, (ctx) => updateActionItem(ctx, { id: a1.id, status: 'in_progress', comment: 'Đã hẹn chủ đất' }));
  eqc('A4. update → in_progress', upd.status, 'in_progress');
  const done = await h.as(ORG, B, (ctx) => completeActionItem(ctx, a1.id, 'Xong, có ảnh hiện trạng'));
  check('A5. complete ghi completed_by/at', done.status === 'done' && done.completedBy === B && !!done.completedAt);
  const hist = await h.as(ORG, A, (ctx) => actionHistory(ctx, a1.id));
  check('A6. lịch sử: open → in_progress → done (3 dòng)', hist.length === 3 && hist[2]!.statusTo === 'done');
  const over = await h.as(ORG, A, (ctx) => listActionItems(ctx, { overdue_only: true, limit: 50 }), { now: () => new Date('2026-07-26T00:00:00Z') });
  check('A7. overdue 26/07: chỉ "Soạn hợp đồng" (hạn 25/07) — PCCC không hạn ko tính',
    over.length === 1 && over[0]!.title === 'Soạn hợp đồng thuê kho', JSON.stringify(over.map((x) => x.title)));

  // ── B. CARRY-OVER ──────────────────────────────────────────────
  console.log('\n— B. CARRY-OVER —');
  await h.as(ORG, A, (ctx) => finishMeeting(ctx, m.id), { now: () => new Date('2026-07-15T03:30:00Z') });
  const m2 = await h.as(ORG, A, (ctx) => createMeeting(ctx, {
    title: 'Họp HĐTV quý 4/2026', type_id: hdtvType.id,
    start_at: '2026-10-15T02:00:00Z', end_at: '2026-10-15T04:00:00Z',
    chair_user_id: A, secretary_user_id: E, apply_template: true, status: 'scheduled',
  }));
  const co = await h.as(ORG, E, (ctx) => carryoverOpenItems(ctx, { from_meeting_id: m.id, to_meeting_id: m2.id }));
  eqc('B1. carry 2 việc chưa xong (hợp đồng + PCCC)', co.carried, 2);
  const ag2 = await h.as(ORG, A, (ctx) => listAgenda(ctx, m2.id));
  const review = ag2.find((x) => x.source === 'carryover');
  check('B2. agenda "Rà soát việc kỳ trước" đứng đầu + detail 2 dòng',
    !!review && review.sortOrder === -1 && (review.detail ?? '').split('\n').length === 2);
  const oldItems = await h.as(ORG, A, (ctx) => listActionItems(ctx, { meeting_id: m.id, limit: 50, overdue_only: false }));
  check('B3. việc cũ → carried_over + trỏ kỳ mới',
    oldItems.filter((x) => x.status === 'carried_over' && x.carriedToMeetingId === m2.id).length === 2);
  const newItems = await h.as(ORG, A, (ctx) => listActionItems(ctx, { meeting_id: m2.id, limit: 50, overdue_only: false }));
  check('B4. kỳ mới có 2 bản sao open gắn agenda rà soát',
    newItems.length === 2 && newItems.every((x) => x.status === 'open' && x.agendaItemId === review!.id));
  await expectErr('B5. update việc đã carried_over bị chặn', 'ACTION_STATUS_INVALID',
    () => h.as(ORG, B, (ctx) => updateActionItem(ctx, { id: oldItems.find((x) => x.status === 'carried_over')!.id, status: 'in_progress' })));
  const co2 = await h.as(ORG, E, (ctx) => carryoverOpenItems(ctx, { from_meeting_id: m.id, to_meeting_id: m2.id }));
  eqc('B6. carry lần 2 → 0 (idempotent theo trạng thái)', co2.carried, 0);

  // ── C. BIÊN BẢN HĐTV ───────────────────────────────────────────
  console.log('\n— C. BIÊN BẢN —');
  const mn1 = await h.as(ORG, E, (ctx) => generateDraft(ctx, { meeting_id: m.id }));
  check('C1. draft v1', mn1.version === 1 && mn1.status === 'draft');
  const md = mn1.contentMd;
  check('C2. render Điều 60: tiêu đề HĐTV + tỷ lệ vốn', md.includes('HỘI ĐỒNG THÀNH VIÊN') && md.includes('tỷ lệ vốn 65%') && md.includes('Tổng tỷ lệ vốn dự họp: 100%'));
  check('C3. render biểu quyết: hợp lệ/tỷ lệ/THÔNG QUA', md.includes('Số phiếu hợp lệ: 2') && md.includes('65%') && md.includes('**THÔNG QUA**'));
  check('C4. render quyết định + phân công + chi phí + chữ ký',
    md.includes('CÁC QUYẾT ĐỊNH') && md.includes('PHÂN CÔNG') && md.includes('Chi phí họp ước tính') && md.includes('| THƯ KÝ | CHỦ TỌA |'));
  const edited = await h.as(ORG, E, (ctx) => updateDraft(ctx, { id: mn1.id, content_md: md + '\n\n(Thư ký bổ sung: đính kèm ảnh hiện trạng)' }));
  check('C5. thư ký sửa draft OK', edited.contentMd.includes('bổ sung'));
  await expectErr('C6. publish khi chưa duyệt (loại yêu cầu duyệt) bị chặn', 'MINUTES_STATUS_INVALID',
    () => h.as(ORG, E, (ctx) => publishMinutes(ctx, { id: mn1.id })));
  await h.as(ORG, E, (ctx) => submitMinutes(ctx, { id: mn1.id }));
  await expectErr('C7. sửa khi pending_approval bị chặn', 'MINUTES_STATUS_INVALID',
    () => h.as(ORG, E, (ctx) => updateDraft(ctx, { id: mn1.id, content_md: 'x' })));
  await expectErr('C8. người KHÔNG phải chủ tọa duyệt bị chặn', 'PERMISSION_DENIED',
    () => h.as(ORG, B, (ctx) => approveMinutes(ctx, { id: mn1.id })));
  const rej = await h.as(ORG, A, (ctx) => rejectMinutes(ctx, { id: mn1.id, reason: 'Thiếu số liệu chi phí thuê' }));
  check('C9. chủ tọa reject + lý do', rej.status === 'rejected' && Boolean(rej.rejectedReason?.includes('chi phí')));
  await h.as(ORG, E, (ctx) => updateDraft(ctx, { id: mn1.id, content_md: edited.contentMd + '\n(Bổ sung chi phí thuê 32tr/tháng)' }));
  await h.as(ORG, E, (ctx) => submitMinutes(ctx, { id: mn1.id }));
  await h.as(ORG, A, (ctx) => approveMinutes(ctx, { id: mn1.id }));
  resetEvents();
  const pub = await h.as(ORG, E, (ctx) => publishMinutes(ctx, { id: mn1.id }));
  check('C10. publish sau duyệt OK + event', pub.status === 'published' && events.some((e) => e.name === 'sm.minutes.published'));
  await expectErr('C11. sửa biên bản đã phát hành → IMMUTABLE', 'MINUTES_IMMUTABLE',
    () => h.as(ORG, E, (ctx) => updateDraft(ctx, { id: mn1.id, content_md: 'hack' })));
  const mn2 = await h.as(ORG, E, (ctx) => generateDraft(ctx, { meeting_id: m.id }));
  check('C12. sửa sau phát hành = version mới (v2 draft)', mn2.version === 2 && mn2.status === 'draft');
  eqc('C13. listMinutes 2 bản', (await h.as(ORG, A, (ctx) => listMinutes(ctx, m.id))).length, 2);
  // loại thường: publish thẳng từ draft
  const mq = await h.as(ORG, A, (ctx) => createMeeting(ctx, {
    title: 'Họp nhanh', start_at: '2026-07-16T02:00:00Z', end_at: '2026-07-16T02:30:00Z', apply_template: false, status: 'scheduled',
  }));
  await h.as(ORG, A, (ctx) => startMeeting(ctx, mq.id));
  await h.as(ORG, A, (ctx) => finishMeeting(ctx, mq.id));
  const mnq = await h.as(ORG, A, (ctx) => generateDraft(ctx, { meeting_id: mq.id }));
  const pubq = await h.as(ORG, A, (ctx) => publishMinutes(ctx, { id: mnq.id }));
  check('C14. loại không cần duyệt: publish thẳng từ draft', pubq.status === 'published');

  // ── D. FEEDBACK ────────────────────────────────────────────────
  console.log('\n— D. FEEDBACK —');
  await h.as(ORG, B, (ctx) => submitFeedback(ctx, { meeting_id: m.id, rating: 4, was_necessary: true }));
  await h.as(ORG, E, (ctx) => submitFeedback(ctx, { meeting_id: m.id, rating: 5, was_necessary: true, comment: 'Gọn' }));
  await expectErr('D1. feedback lần 2 cùng user bị chặn', 'FEEDBACK_DUPLICATE',
    () => h.as(ORG, B, (ctx) => submitFeedback(ctx, { meeting_id: m.id, rating: 1 })));
  const fs = await h.as(ORG, A, (ctx) => feedbackSummary(ctx, m.id));
  check('D2. summary avg 4.5, necessary 100%', fs.count === 2 && fs.avg_rating === 4.5 && fs.necessary_pct === 100);

  // ── E. HARVEST TEXT ────────────────────────────────────────────
  console.log('\n— E. HARVEST TEXT —');
  const before = await h.as(ORG, A, (ctx) => listActionItems(ctx, { limit: 200, overdue_only: false }));
  const hv = await h.as(ORG, E, (ctx) => harvestFromText(ctx, {
    meeting_id: m2.id,
    text: [
      'Ghi chú họp:',
      'Quyết định: chốt ngân sách marketing Q4 là 150tr',
      '- [ ] Soạn hợp đồng thuê kho trước ngày 25/07',          // trùng việc đang mở
      '- Giao anh Bình khảo sát tuyến giao hàng Cần Thơ, deadline 2026-08-01',
      '- @thuky-e đặt phòng họp quý 4 trước 30/09/2026',
      'Trời hôm nay đẹp.',                                        // nhiễu — không bắt
      'Chốt: giữ nguyên giá bán gạo ST25 tháng 8',
    ].join('\n'),
  }), { now: () => new Date('2026-07-16T00:00:00Z') });
  eqc('E1. bắt đúng 3 việc đề xuất', hv.proposed_actions.length, 3);
  eqc('E2. bắt đúng 2 quyết định', hv.proposed_decisions.length, 2);
  const dupA = hv.proposed_actions.find((x) => x.title.includes('hợp đồng'));
  check('E3. dòng trùng việc đang mở gắn duplicate_of', !!dupA?.duplicate_of && dupA.duplicate_of.title === 'Soạn hợp đồng thuê kho');
  const binh = hv.proposed_actions.find((x) => x.title.includes('tuyến giao hàng'));
  check('E4. owner_hint="Bình…" + due 2026-08-01', !!binh && binh.due_hint === '2026-08-01' && (binh.owner_hint ?? '').length > 0);
  const datVn = hv.proposed_actions.find((x) => x.title.includes('đặt phòng'));
  check('E5. @owner + ngày VN 30/09/2026 → ISO', datVn?.owner_hint === 'thuky-e' && datVn?.due_hint === '2026-09-30');
  const after = await h.as(ORG, A, (ctx) => listActionItems(ctx, { limit: 200, overdue_only: false }));
  eqc('E6. harvest KHÔNG ghi DB (đếm việc không đổi)', after.length, before.length);

  summary('SMOKE HARVEST');
}
main().catch((e) => { console.error(e); process.exit(1); });
