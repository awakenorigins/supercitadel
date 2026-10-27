/**
 * SOUL-MEETING 1A — SMOKE RECORDING (Beat 5)
 * ASR capability contract: thiếu caps → ASR_UNAVAILABLE (không đổi trạng thái) ·
 * mock thành công → done + segments + events · mock lỗi → failed + error,
 * retry từ failed OK · sửa segment · rename speaker bulk · harvest transcript
 * (bullet-hóa speaker) bắt việc + quyết định + dedup, KHÔNG ghi DB.
 */
import { randomUUID } from 'node:crypto';
import { setup, check, eq as eqc, expectErr, events, resetEvents, summary } from './harness.js';
import { seedDefaultTypes, updateSettings } from '../src/services/catalog.service.js';
import { createMeeting, startMeeting, finishMeeting } from '../src/services/meeting.service.js';
import { createActionItem, listActionItems } from '../src/services/action.service.js';
import {
  registerRecording, requestTranscription, listRecordings, getTranscript,
  updateSegment, renameSpeaker, harvestFromTranscript,
} from '../src/services/recording.service.js';
import type { AsrSegment } from '../src/types.js';

const ORG = randomUUID();
const A = 'user-an'; const E = 'thuky-e';

const GOOD_SEGMENTS: AsrSegment[] = [
  { startMs: 0, endMs: 4200, text: 'Chào cả nhà, bắt đầu họp nhé.', speakerLabel: 'Người nói 1', confidence: 0.93 },
  { startMs: 4200, endMs: 11000, text: 'Giao anh Bình soạn hợp đồng thuê kho trước ngày 25/07.', speakerLabel: 'Người nói 1', confidence: 0.9 },
  { startMs: 11000, endMs: 16000, text: 'Chốt: tăng ngân sách marketing tháng 8 lên 150 triệu.', speakerLabel: 'Người nói 2', confidence: 0.88 },
];

async function main() {
  console.log('— SOUL-MEETING SMOKE RECORDING (Beat 5) —');
  const h = await setup();
  await h.as(ORG, A, (ctx) => seedDefaultTypes(ctx));

  const m = await h.as(ORG, A, (ctx) => createMeeting(ctx, {
    title: 'Họp có ghi âm', start_at: '2026-07-16T02:00:00Z', end_at: '2026-07-16T03:00:00Z',
    chair_user_id: A, secretary_user_id: E, apply_template: false, status: 'scheduled',
  }));
  await h.as(ORG, A, (ctx) => startMeeting(ctx, m.id));
  await h.as(ORG, A, (ctx) => finishMeeting(ctx, m.id));

  // ── A. ĐĂNG KÝ + ASR VẮNG ─────────────────────────────────────
  console.log('\n— A. ASR CAPABILITY —');
  const r1 = await h.as(ORG, E, (ctx) => registerRecording(ctx, {
    meeting_id: m.id, file_ref: 'files://rec-001.m4a', file_name: 'rec-001.m4a',
    mime: 'audio/mp4', size_bytes: 4_500_000, duration_sec: 960, lang: 'vi',
  }));
  eqc('A1. register → uploaded', r1.status, 'uploaded');
  await expectErr('A2. thiếu caps.asr → ASR_UNAVAILABLE', 'ASR_UNAVAILABLE',
    () => h.as(ORG, E, (ctx) => requestTranscription(ctx, r1.id)));
  const r1b = (await h.as(ORG, E, (ctx) => listRecordings(ctx, m.id)))[0]!;
  eqc('A3. trạng thái GIỮ NGUYÊN uploaded (degrade sạch)', r1b.status, 'uploaded');

  // ── B. MOCK THÀNH CÔNG ────────────────────────────────────────
  console.log('\n— B. TRANSCRIBE OK —');
  resetEvents();
  const seen: { v?: { fileRef: string; lang: string; engine?: string } } = {};
  const okAsr = { transcribe: async (inp: { fileRef: string; lang: string; engine?: string }) => { seen.v = inp; return GOOD_SEGMENTS; } };
  const done = await h.as(ORG, E, (ctx) => requestTranscription(ctx, r1.id), { caps: { asr: okAsr }, now: () => new Date('2026-07-16T04:00:00Z') });
  check('B1. status done + transcribedAt', done.status === 'done' && !!done.transcribedAt);
  check('B2. worker nhận đúng fileRef + lang + engine từ settings',
    seen.v?.fileRef === 'files://rec-001.m4a' && seen.v?.lang === 'vi' && seen.v?.engine === 'phowhisper-small');
  const segs = await h.as(ORG, E, (ctx) => getTranscript(ctx, r1.id));
  check('B3. 3 segments đúng idx 0,1,2', segs.length === 3 && segs[0]!.idx === 0 && segs[2]!.idx === 2);
  check('B4. events queued + transcribed (mang org_id)',
    events.some((e) => e.name === 'sm.recording.queued') && events.some((e) => e.name === 'sm.recording.transcribed' && e.payload.org_id === ORG));
  await expectErr('B5. transcribe lại khi done bị chặn', 'RECORDING_STATUS_INVALID',
    () => h.as(ORG, E, (ctx) => requestTranscription(ctx, r1.id), { caps: { asr: okAsr } }));

  // ── C. MOCK LỖI + RETRY ───────────────────────────────────────
  console.log('\n— C. FAIL + RETRY —');
  const r2 = await h.as(ORG, E, (ctx) => registerRecording(ctx, {
    meeting_id: m.id, file_ref: 'files://rec-002.m4a', lang: 'vi',
  }));
  const badAsr = { transcribe: async () => { throw new Error('CUDA OOM trên worker'); } };
  const failed = await h.as(ORG, E, (ctx) => requestTranscription(ctx, r2.id), { caps: { asr: badAsr } });
  check('C1. worker ném lỗi → failed + error lưu lại', failed.status === 'failed' && (failed.error ?? '').includes('CUDA'));
  const retried = await h.as(ORG, E, (ctx) => requestTranscription(ctx, r2.id), { caps: { asr: okAsr } });
  check('C2. retry từ failed → done', retried.status === 'done');
  eqc('C3. segments ghi đè sạch (3, không nhân đôi)', (await h.as(ORG, E, (ctx) => getTranscript(ctx, r2.id))).length, 3);

  // ── D. SỬA SEGMENT + RENAME SPEAKER ───────────────────────────
  console.log('\n— D. EDIT TRANSCRIPT —');
  const s0 = segs[0]!;
  const edited = await h.as(ORG, E, (ctx) => updateSegment(ctx, { id: s0.id, text: 'Chào cả nhà, 8h00 bắt đầu họp.' }));
  check('D1. sửa text + editedBy', edited.text.includes('8h00') && edited.editedBy === E);
  const rn = await h.as(ORG, E, (ctx) => renameSpeaker(ctx, { recording_id: r1.id, from_label: 'Người nói 1', to_label: 'Anh An' }));
  eqc('D2. rename bulk 2 segment', rn.renamed, 2);
  const segsAfter = await h.as(ORG, E, (ctx) => getTranscript(ctx, r1.id));
  check('D3. label mới áp cả 2 dòng, dòng speaker 2 giữ nguyên',
    segsAfter.filter((s) => s.speakerLabel === 'Anh An').length === 2 && segsAfter[2]!.speakerLabel === 'Người nói 2');
  await expectErr('D4. sửa segment id lạ → SEGMENT_NOT_FOUND', 'SEGMENT_NOT_FOUND',
    () => h.as(ORG, E, (ctx) => updateSegment(ctx, { id: randomUUID(), text: 'x' })));

  // ── E. HARVEST TỪ TRANSCRIPT ──────────────────────────────────
  console.log('\n— E. HARVEST TRANSCRIPT —');
  await h.as(ORG, A, (ctx) => createActionItem(ctx, { meeting_id: m.id, title: 'Soạn hợp đồng thuê kho', priority: 'normal' }));
  const countBefore = (await h.as(ORG, A, (ctx) => listActionItems(ctx, { limit: 200, overdue_only: false }))).length;
  const hv = await h.as(ORG, E, (ctx) => harvestFromTranscript(ctx, r1.id), { now: () => new Date('2026-07-16T05:00:00Z') });
  check('E1. bắt 1 việc từ lời nói (dòng giao việc)', hv.proposed_actions.length === 1 && hv.proposed_actions[0]!.title.includes('hợp đồng'), JSON.stringify(hv.proposed_actions));
  check('E2. việc trùng gắn duplicate_of + due 2026-07-25',
    !!hv.proposed_actions[0]!.duplicate_of && hv.proposed_actions[0]!.due_hint === '2026-07-25');
  check('E3. bắt 1 quyết định ("Chốt:") xuyên prefix speaker', hv.proposed_decisions.length === 1 && hv.proposed_decisions[0]!.includes('150'));
  eqc('E4. KHÔNG ghi DB', (await h.as(ORG, A, (ctx) => listActionItems(ctx, { limit: 200, overdue_only: false }))).length, countBefore);
  await expectErr('E5. harvest khi chưa done bị chặn', 'RECORDING_STATUS_INVALID',
    () => h.as(ORG, E, async (ctx) => {
      const r3 = await registerRecording(ctx, { meeting_id: m.id, file_ref: 'files://rec-003.m4a', lang: 'vi' });
      return harvestFromTranscript(ctx, r3.id);
    }));

  summary('SMOKE RECORDING');
}
main().catch((e) => { console.error(e); process.exit(1); });
