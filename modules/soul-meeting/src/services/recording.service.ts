/**
 * SOUL-MEETING 1A — recording.service
 * Ghi âm + bóc băng qua OPTIONAL CAPABILITY ctx.caps.asr (host nối sidecar
 * services/asr-worker — faster-whisper/PhoWhisper). Thiếu caps → ASR_UNAVAILABLE,
 * mọi tính năng khác vẫn chạy (kiến trúc sidecar, đúng quyết định gộp ASR vào 1A
 * mà không phá plug-and-play). Máy trạng thái: uploaded → queued → transcribing
 * → done|failed (failed re-request được).
 */
import { and, asc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { SmCtx } from '../types.js';
import { SmError, nowOf } from '../types.js';
import { smRecordings, smTranscriptSegments } from '../db/schema.js';
import { writeAudit, getMeeting, getRecording } from './common.js';
import { getSettings } from './catalog.service.js';
import { harvestFromText, type HarvestResult } from './harvest.service.js';
import type {
  recordingRegisterSchema, segmentUpdateSchema, speakerRenameSchema,
} from '../validation/schemas.js';

export async function registerRecording(ctx: SmCtx, input: z.infer<typeof recordingRegisterSchema>) {
  const m = await getMeeting(ctx, input.meeting_id);
  if (m.status === 'cancelled') throw new SmError('MEETING_STATUS_INVALID', 'Họp đã hủy');
  const rows = await ctx.db.insert(smRecordings).values({
    orgId: ctx.orgId, meetingId: input.meeting_id, fileRef: input.file_ref,
    fileName: input.file_name, mime: input.mime, sizeBytes: input.size_bytes,
    durationSec: input.duration_sec, lang: input.lang, createdBy: ctx.userId,
  }).returning();
  await writeAudit(ctx, { action: 'sm.recording.register', entity: 'smeet_recordings', entityId: rows[0]!.id, after: { file_ref: input.file_ref } });
  return rows[0]!;
}

/** Yêu cầu bóc băng. caps.asr thiếu → ném ASR_UNAVAILABLE (trạng thái GIỮ NGUYÊN). */
export async function requestTranscription(ctx: SmCtx, recordingId: string) {
  const rec = await getRecording(ctx, recordingId);
  if (rec.status !== 'uploaded' && rec.status !== 'failed') {
    throw new SmError('RECORDING_STATUS_INVALID', `Ghi âm đang ${rec.status}`);
  }
  if (!ctx.caps?.asr) {
    throw new SmError('ASR_UNAVAILABLE', 'Chưa nối ASR worker — bật sidecar services/asr-worker rồi thử lại (các tính năng khác không ảnh hưởng)');
  }
  const settings = await getSettings(ctx);
  const engine = rec.engine ?? settings.asrEngine;
  await ctx.db.update(smRecordings).set({ status: 'queued', error: null, requestedBy: ctx.userId, engine })
    .where(and(eq(smRecordings.orgId, ctx.orgId), eq(smRecordings.id, recordingId)));
  await ctx.bus.emit('sm.recording.queued', { org_id: ctx.orgId, recording_id: recordingId, engine });

  await ctx.db.update(smRecordings).set({ status: 'transcribing' })
    .where(and(eq(smRecordings.orgId, ctx.orgId), eq(smRecordings.id, recordingId)));
  try {
    const segments = await ctx.caps.asr.transcribe({ fileRef: rec.fileRef, lang: rec.lang, engine });
    // ghi đè segments cũ (retry sau failed)
    await ctx.db.delete(smTranscriptSegments)
      .where(and(eq(smTranscriptSegments.orgId, ctx.orgId), eq(smTranscriptSegments.recordingId, recordingId)));
    let idx = 0;
    for (const s of segments) {
      await ctx.db.insert(smTranscriptSegments).values({
        orgId: ctx.orgId, recordingId, idx: idx++,
        startMs: s.startMs, endMs: s.endMs,
        speakerLabel: s.speakerLabel ?? 'Người nói 1', text: s.text,
        confidence: s.confidence !== undefined ? String(s.confidence) : undefined,
      });
    }
    const rows = await ctx.db.update(smRecordings).set({ status: 'done', transcribedAt: nowOf(ctx) })
      .where(and(eq(smRecordings.orgId, ctx.orgId), eq(smRecordings.id, recordingId))).returning();
    await writeAudit(ctx, { action: 'sm.recording.transcribe', entity: 'smeet_recordings', entityId: recordingId, after: { segments: idx } });
    await ctx.bus.emit('sm.recording.transcribed', { org_id: ctx.orgId, recording_id: recordingId, segments: idx });
    return rows[0]!;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const rows = await ctx.db.update(smRecordings).set({ status: 'failed', error: msg })
      .where(and(eq(smRecordings.orgId, ctx.orgId), eq(smRecordings.id, recordingId))).returning();
    await writeAudit(ctx, { action: 'sm.recording.failed', entity: 'smeet_recordings', entityId: recordingId, after: { error: msg } });
    return rows[0]!;
  }
}

export async function listRecordings(ctx: SmCtx, meetingId: string) {
  await getMeeting(ctx, meetingId);
  return ctx.db.select().from(smRecordings)
    .where(and(eq(smRecordings.orgId, ctx.orgId), eq(smRecordings.meetingId, meetingId)))
    .orderBy(asc(smRecordings.createdAt));
}

export async function getTranscript(ctx: SmCtx, recordingId: string) {
  await getRecording(ctx, recordingId);
  return ctx.db.select().from(smTranscriptSegments)
    .where(and(eq(smTranscriptSegments.orgId, ctx.orgId), eq(smTranscriptSegments.recordingId, recordingId)))
    .orderBy(asc(smTranscriptSegments.idx));
}

export async function updateSegment(ctx: SmCtx, input: z.infer<typeof segmentUpdateSchema>) {
  const [seg] = await ctx.db.select().from(smTranscriptSegments)
    .where(and(eq(smTranscriptSegments.orgId, ctx.orgId), eq(smTranscriptSegments.id, input.id))).limit(1);
  if (!seg) throw new SmError('SEGMENT_NOT_FOUND', `Không tìm thấy segment ${input.id}`);
  const rows = await ctx.db.update(smTranscriptSegments).set({
    text: input.text ?? seg.text,
    speakerLabel: input.speaker_label ?? seg.speakerLabel,
    editedBy: ctx.userId, editedAt: nowOf(ctx),
  }).where(and(eq(smTranscriptSegments.orgId, ctx.orgId), eq(smTranscriptSegments.id, input.id))).returning();
  return rows[0]!;
}

/** Đổi tên người nói hàng loạt: "Người nói 1" → "Anh An" */
export async function renameSpeaker(ctx: SmCtx, input: z.infer<typeof speakerRenameSchema>) {
  await getRecording(ctx, input.recording_id);
  const rows = await ctx.db.update(smTranscriptSegments).set({
    speakerLabel: input.to_label, editedBy: ctx.userId, editedAt: nowOf(ctx),
  }).where(and(
    eq(smTranscriptSegments.orgId, ctx.orgId),
    eq(smTranscriptSegments.recordingId, input.recording_id),
    eq(smTranscriptSegments.speakerLabel, input.from_label),
  )).returning();
  await writeAudit(ctx, { action: 'sm.recording.rename_speaker', entity: 'smeet_recordings', entityId: input.recording_id, after: input });
  return { renamed: rows.length };
}

/** Bóc VIỆC/QUYẾT ĐỊNH từ transcript: ghép segments thành bullet có speaker rồi
 *  chạy harvestFromText (dedup fuzzy đi kèm). KHÔNG ghi DB. */
export async function harvestFromTranscript(ctx: SmCtx, recordingId: string): Promise<HarvestResult & { recording_id: string }> {
  const rec = await getRecording(ctx, recordingId);
  if (rec.status !== 'done') throw new SmError('RECORDING_STATUS_INVALID', 'Chưa có transcript — bóc băng xong mới harvest được');
  const segs = await getTranscript(ctx, recordingId);
  const text = segs.map((s) => `- [${s.speakerLabel}] ${s.text}`).join('\n');
  const result = await harvestFromText(ctx, { meeting_id: rec.meetingId, text });
  return { ...result, recording_id: recordingId };
}
