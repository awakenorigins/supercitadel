/**
 * SOUL-MEETING 1A — SMOKE LIVE (Beat 3)
 * Kịch bản HĐTV thật: 4 thành viên vốn 40/30/20/10, quorum capital 65/65.
 * Phiếu người vắng vô hiệu lúc đóng · re-cast đổi phiếu · headcount mode ·
 * quorum fail → passed=false · informed cấm bỏ phiếu · decision vote-gated.
 */
import { randomUUID } from 'node:crypto';
import { setup, check, eq as eqc, expectErr, events, resetEvents, summary } from './harness.js';
import { seedDefaultTypes } from '../src/services/catalog.service.js';
import { createMeeting, startMeeting } from '../src/services/meeting.service.js';
import { addParticipant, updateParticipant, checkin, setAttendance } from '../src/services/participant.service.js';
import { addDecision, listDecisions, createVote, castBallot, closeVote, type VoteResult } from '../src/services/vote.service.js';

const ORG = randomUUID();
const A = 'tv-an'; const B = 'tv-binh'; const C = 'tv-cuong'; const D = 'tv-dung'; const E = 'thuky-e';

async function main() {
  console.log('— SOUL-MEETING SMOKE LIVE (Beat 3) —');
  const h = await setup();
  await h.as(ORG, A, (ctx) => seedDefaultTypes(ctx));

  const m = await h.as(ORG, A, (ctx) => createMeeting(ctx, {
    title: 'Họp HĐTV Q3', start_at: '2026-07-15T02:00:00Z', end_at: '2026-07-15T04:00:00Z',
    chair_user_id: A, secretary_user_id: E, apply_template: false, status: 'scheduled',
  }));
  // A auto-add (chair, weight 0) → chỉnh 40; E thư ký không góp vốn (0, informed-like nhưng vẫn attendee)
  const pA0 = await h.as(ORG, A, (ctx) => addParticipant(ctx, { meeting_id: m.id, user_id: B, role: 'attendee', required: true, vote_weight: 30 }));
  const pC = await h.as(ORG, A, (ctx) => addParticipant(ctx, { meeting_id: m.id, user_id: C, role: 'attendee', required: true, vote_weight: 20 }));
  const pD = await h.as(ORG, A, (ctx) => addParticipant(ctx, { meeting_id: m.id, user_id: D, role: 'attendee', required: true, vote_weight: 10 }));
  const pObs = await h.as(ORG, A, (ctx) => addParticipant(ctx, { meeting_id: m.id, external_name: 'Luật sư quan sát', role: 'informed', required: false, vote_weight: 0 }));
  // lấy id participant của A (auto-added) rồi chỉnh weight qua API mới
  const parts = await h.as(ORG, A, (ctx) => import('../src/services/participant.service.js').then((s) => s.listParticipants(ctx, m.id)));
  const pA = parts.find((p) => p.userId === A)!;
  const pAw = await h.as(ORG, A, (ctx) => updateParticipant(ctx, { participant_id: pA.id, vote_weight: 40 }));
  check('A1. chỉnh vote_weight chair A = 40 (vá thiết kế)', Number(pAw.voteWeight) === 40, String(pAw.voteWeight));
  const pB = parts.find((p) => p.userId === B) ?? pA0;

  await h.as(ORG, A, (ctx) => startMeeting(ctx, m.id), { now: () => new Date('2026-07-15T02:00:00Z') });
  // điểm danh: A present, B late, D present; C vắng (không check-in)
  await h.as(ORG, A, (ctx) => checkin(ctx, { participant_id: pA.id, late_grace_minutes: 5 }), { now: () => new Date('2026-07-15T02:02:00Z') });
  await h.as(ORG, B, (ctx) => checkin(ctx, { participant_id: pB.id, late_grace_minutes: 5 }), { now: () => new Date('2026-07-15T02:20:00Z') });
  await h.as(ORG, D, (ctx) => checkin(ctx, { participant_id: pD.id, late_grace_minutes: 5 }), { now: () => new Date('2026-07-15T02:03:00Z') });
  await h.as(ORG, A, (ctx) => setAttendance(ctx, { participant_id: pC.id, attendance: 'absent_excused' }));

  // ── A. CAPITAL VOTE — quorum đạt, pass đạt ─────────────────────
  console.log('\n— A. BIỂU QUYẾT %% VỐN —');
  const v1 = await h.as(ORG, A, (ctx) => createVote(ctx, {
    meeting_id: m.id, question: 'Thông qua phương án mở kho Cần Thơ',
    quorum_mode: 'capital_pct', quorum_threshold: 65, pass_threshold: 65, pass_basis: 'attending',
  }));
  await expectErr('A2. informed bỏ phiếu bị chặn', 'PARTICIPANT_INVALID',
    () => h.as(ORG, A, (ctx) => castBallot(ctx, { vote_id: v1.id, participant_id: pObs.id, choice: 'Tán thành' })));
  await expectErr('A3. phương án lạ bị chặn', 'CHOICE_INVALID',
    () => h.as(ORG, A, (ctx) => castBallot(ctx, { vote_id: v1.id, participant_id: pA.id, choice: 'Hoãn' })));
  await h.as(ORG, A, (ctx) => castBallot(ctx, { vote_id: v1.id, participant_id: pA.id, choice: 'Không tán thành' }));
  const recast = await h.as(ORG, A, (ctx) => castBallot(ctx, { vote_id: v1.id, participant_id: pA.id, choice: 'Tán thành' }));
  eqc('A4. re-cast đổi phiếu (A: Không → Tán)', recast.choice, 'Tán thành');
  await h.as(ORG, B, (ctx) => castBallot(ctx, { vote_id: v1.id, participant_id: pB.id, choice: 'Tán thành' }));
  await h.as(ORG, D, (ctx) => castBallot(ctx, { vote_id: v1.id, participant_id: pD.id, choice: 'Không tán thành' }));
  await h.as(ORG, C, (ctx) => castBallot(ctx, { vote_id: v1.id, participant_id: pC.id, choice: 'Tán thành' })); // C vắng → sẽ vô hiệu
  resetEvents();
  const { result: r1 } = await h.as(ORG, A, (ctx) => closeVote(ctx, { vote_id: v1.id })) as { result: VoteResult };
  eqc('A5. present_weight = 80 (A40+B30+D10)', r1.present_weight, 80);
  check('A6. quorum capital 80 ≥ 65 → đạt', r1.quorum_met === true);
  check('A7. phiếu C (vắng) vô hiệu: invalid_count=1', r1.invalid_count === 1);
  check('A8. tally Tán=70 vốn, Không=10 vốn', r1.tallies['Tán thành']!.weight === 70 && r1.tallies['Không tán thành']!.weight === 10);
  eqc('A9. pass_metric = 70/80 = 87.5%', r1.pass_metric, 87.5);
  check('A10. passed = true', r1.passed === true);
  check('A11. event sm.vote.closed passed', events.some((e) => e.name === 'sm.vote.closed' && e.payload.passed === true));
  await expectErr('A12. đóng lần 2 bị chặn', 'VOTE_CLOSED',
    () => h.as(ORG, A, (ctx) => closeVote(ctx, { vote_id: v1.id })));
  await expectErr('A13. bỏ phiếu sau khi đóng bị chặn', 'VOTE_CLOSED',
    () => h.as(ORG, B, (ctx) => castBallot(ctx, { vote_id: v1.id, participant_id: pB.id, choice: 'Tán thành' })));

  // ── B. QUORUM FAIL ─────────────────────────────────────────────
  console.log('\n— B. QUORUM FAIL —');
  const v2 = await h.as(ORG, A, (ctx) => createVote(ctx, {
    meeting_id: m.id, question: 'Ngưỡng cao 90', quorum_mode: 'capital_pct',
    quorum_threshold: 90, pass_threshold: 50, pass_basis: 'attending',
  }));
  await h.as(ORG, A, (ctx) => castBallot(ctx, { vote_id: v2.id, participant_id: pA.id, choice: 'Tán thành' }));
  const { result: r2 } = await h.as(ORG, A, (ctx) => closeVote(ctx, { vote_id: v2.id })) as { result: VoteResult };
  check('B1. present 80 < 90 → quorum fail, passed=false dù phiếu thuận', r2.quorum_met === false && r2.passed === false);

  // ── C. HEADCOUNT MODE ──────────────────────────────────────────
  console.log('\n— C. HEADCOUNT —');
  const v3 = await h.as(ORG, A, (ctx) => createVote(ctx, {
    meeting_id: m.id, question: 'Đổi giờ giao ban sang 8h30',
    options: ['Đồng ý', 'Giữ nguyên'], pass_option: 'Đồng ý',
    quorum_mode: 'headcount', quorum_threshold: 50, pass_threshold: 50, pass_basis: 'attending',
  }));
  await h.as(ORG, A, (ctx) => castBallot(ctx, { vote_id: v3.id, participant_id: pA.id, choice: 'Đồng ý' }));
  await h.as(ORG, B, (ctx) => castBallot(ctx, { vote_id: v3.id, participant_id: pB.id, choice: 'Đồng ý' }));
  await h.as(ORG, D, (ctx) => castBallot(ctx, { vote_id: v3.id, participant_id: pD.id, choice: 'Giữ nguyên' }));
  const { result: r3 } = await h.as(ORG, A, (ctx) => closeVote(ctx, { vote_id: v3.id })) as { result: VoteResult };
  // eligible = 4 thành viên + thư ký E (attendee, weight 0)? E là attendee → eligible headcount = 5, attending = 3 (E chưa checkin) → 60% ≥ 50 quorum
  check('C1. quorum headcount: attending 3 / eligible 5 = 60% ≥ 50', r3.quorum_met === true && r3.attending_count === 3 && r3.eligible_count === 5, JSON.stringify({ a: r3.attending_count, e: r3.eligible_count }));
  eqc('C2. pass metric 2/3 = 66.67', r3.pass_metric, 66.67);
  check('C3. passed', r3.passed === true);

  // ── D. DECISIONS ───────────────────────────────────────────────
  console.log('\n— D. DECISIONS —');
  const v4 = await h.as(ORG, A, (ctx) => createVote(ctx, {
    meeting_id: m.id, question: 'Vote đang mở', quorum_mode: 'none', quorum_threshold: 0, pass_threshold: 50, pass_basis: 'attending',
  }));
  await expectErr('D1. decision gắn vote đang mở bị chặn', 'VOTE_STILL_OPEN',
    () => h.as(ORG, A, (ctx) => addDecision(ctx, { meeting_id: m.id, content: 'x', method: 'vote', vote_id: v4.id })));
  const d1 = await h.as(ORG, E, (ctx) => addDecision(ctx, { meeting_id: m.id, content: 'Duyệt mở kho Cần Thơ theo kết quả biểu quyết', method: 'vote', vote_id: v1.id }));
  check('D2. decision method=vote gắn vote đã đóng OK', d1.voteId === v1.id);
  const d2 = await h.as(ORG, E, (ctx) => addDecision(ctx, { meeting_id: m.id, content: 'Giao anh Bình khảo sát mặt bằng', method: 'consensus' }));
  check('D3. decision consensus OK', d2.method === 'consensus');
  eqc('D4. listDecisions = 2', (await h.as(ORG, A, (ctx) => listDecisions(ctx, m.id))).length, 2);
  check('D5. event sm.decision.recorded', events.some((e) => e.name === 'sm.decision.recorded'));

  summary('SMOKE LIVE');
}
main().catch((e) => { console.error(e); process.exit(1); });
