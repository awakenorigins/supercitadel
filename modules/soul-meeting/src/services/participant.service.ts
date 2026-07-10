/**
 * SOUL-MEETING 1A — participant.service
 * Người tham dự nội bộ + khách ngoài (free-text, ref mềm Soul-Sale qua caps.contacts).
 * RSVP · check-in đúng giờ/muộn (tính theo LỊCH start_at + grace) · attendance override.
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';
import type { SmCtx } from '../types.js';
import { SmError, nowOf } from '../types.js';
import { smParticipants } from '../db/schema.js';
import { writeAudit, getMeeting, getParticipant } from './common.js';
import type {
  participantAddSchema, participantBulkSchema, participantUpdateSchema, rsvpSchema,
  checkinSchema, attendanceSchema, suggestExternalSchema,
} from '../validation/schemas.js';

const OPEN_STATUSES = ['draft', 'scheduled', 'in_progress'];

export async function addParticipant(ctx: SmCtx, input: z.infer<typeof participantAddSchema>) {
  const m = await getMeeting(ctx, input.meeting_id);
  if (!OPEN_STATUSES.includes(m.status)) {
    throw new SmError('MEETING_STATUS_INVALID', `Họp đang ${m.status} — không thêm người được`);
  }
  if (input.user_id) {
    const [dup] = await ctx.db.select().from(smParticipants)
      .where(and(eq(smParticipants.orgId, ctx.orgId), eq(smParticipants.meetingId, input.meeting_id), eq(smParticipants.userId, input.user_id))).limit(1);
    if (dup) throw new SmError('PARTICIPANT_DUPLICATE', 'Người này đã có trong cuộc họp');
  }
  const rows = await ctx.db.insert(smParticipants).values({
    orgId: ctx.orgId, meetingId: input.meeting_id,
    userId: input.user_id, externalName: input.external_name,
    externalEmail: input.external_email, externalRef: input.external_ref,
    role: input.role, required: input.required,
    voteWeight: String(input.vote_weight ?? 0),
    createdBy: ctx.userId,
  }).returning();
  await writeAudit(ctx, { action: 'sm.participant.add', entity: 'smeet_participants', entityId: rows[0]!.id, after: input });
  return rows[0]!;
}

export async function bulkAddParticipants(ctx: SmCtx, input: z.infer<typeof participantBulkSchema>) {
  const m = await getMeeting(ctx, input.meeting_id);
  if (!OPEN_STATUSES.includes(m.status)) {
    throw new SmError('MEETING_STATUS_INVALID', `Họp đang ${m.status} — không thêm người được`);
  }
  const existing = await ctx.db.select({ userId: smParticipants.userId }).from(smParticipants)
    .where(and(
      eq(smParticipants.orgId, ctx.orgId), eq(smParticipants.meetingId, input.meeting_id),
      inArray(smParticipants.userId, input.user_ids),
    ));
  const have = new Set(existing.map((r) => r.userId));
  let added = 0;
  for (const uid of input.user_ids) {
    if (have.has(uid)) continue;
    await ctx.db.insert(smParticipants).values({
      orgId: ctx.orgId, meetingId: input.meeting_id, userId: uid, role: input.role, createdBy: ctx.userId,
    }).onConflictDoNothing();
    added++;
  }
  await writeAudit(ctx, { action: 'sm.participant.bulk_add', entity: 'smeet_meetings', entityId: input.meeting_id, after: { added, requested: input.user_ids.length } });
  return { added, skipped: input.user_ids.length - added };
}

/** Chỉnh vote_weight/required/note SAU khi add — bắt buộc cho họp HĐTV
 *  (chair/secretary/creator được auto-add với weight 0). Phát hiện khi viết
 *  smoke-live Beat 3 — ghi nhận trong AUDIT_REPORT. */
export async function updateParticipant(ctx: SmCtx, input: z.infer<typeof participantUpdateSchema>) {
  const before = await getParticipant(ctx, input.participant_id);
  const rows = await ctx.db.update(smParticipants).set({
    voteWeight: input.vote_weight !== undefined ? String(input.vote_weight) : before.voteWeight,
    required: input.required ?? before.required,
    note: input.note ?? before.note,
  }).where(and(eq(smParticipants.orgId, ctx.orgId), eq(smParticipants.id, input.participant_id))).returning();
  await writeAudit(ctx, { action: 'sm.participant.update', entity: 'smeet_participants', entityId: input.participant_id, before: { vote_weight: before.voteWeight }, after: input });
  return rows[0]!;
}

export async function removeParticipant(ctx: SmCtx, id: string) {
  const p = await getParticipant(ctx, id);
  const m = await getMeeting(ctx, p.meetingId);
  if (p.userId && (p.userId === m.chairUserId || p.userId === m.secretaryUserId)) {
    throw new SmError('PARTICIPANT_INVALID', 'Không xóa chủ trì/thư ký — đổi vai trò trên cuộc họp trước');
  }
  await ctx.db.delete(smParticipants)
    .where(and(eq(smParticipants.orgId, ctx.orgId), eq(smParticipants.id, id)));
  await writeAudit(ctx, { action: 'sm.participant.remove', entity: 'smeet_participants', entityId: id, before: p });
  return { removed: true };
}

export async function setRsvp(ctx: SmCtx, input: z.infer<typeof rsvpSchema>) {
  await getParticipant(ctx, input.participant_id);
  const rows = await ctx.db.update(smParticipants).set({ rsvp: input.rsvp })
    .where(and(eq(smParticipants.orgId, ctx.orgId), eq(smParticipants.id, input.participant_id))).returning();
  await writeAudit(ctx, { action: 'sm.participant.rsvp', entity: 'smeet_participants', entityId: input.participant_id, after: input });
  return rows[0]!;
}

/** Check-in: đúng giờ nếu now <= start_at (LỊCH) + grace; muộn nếu sau đó */
export async function checkin(ctx: SmCtx, input: z.infer<typeof checkinSchema>) {
  const p = await getParticipant(ctx, input.participant_id);
  const m = await getMeeting(ctx, p.meetingId);
  if (m.status !== 'in_progress' && m.status !== 'scheduled') {
    throw new SmError('MEETING_STATUS_INVALID', `Họp đang ${m.status} — không check-in được`);
  }
  const now = nowOf(ctx);
  const late = now.getTime() > m.startAt.getTime() + input.late_grace_minutes * 60_000;
  const rows = await ctx.db.update(smParticipants).set({
    attendance: late ? 'late' : 'present', checkinAt: now,
  }).where(and(eq(smParticipants.orgId, ctx.orgId), eq(smParticipants.id, input.participant_id))).returning();
  await writeAudit(ctx, { action: 'sm.participant.checkin', entity: 'smeet_participants', entityId: input.participant_id, after: { late } });
  return rows[0]!;
}

export async function setAttendance(ctx: SmCtx, input: z.infer<typeof attendanceSchema>) {
  await getParticipant(ctx, input.participant_id);
  const rows = await ctx.db.update(smParticipants).set({ attendance: input.attendance })
    .where(and(eq(smParticipants.orgId, ctx.orgId), eq(smParticipants.id, input.participant_id))).returning();
  await writeAudit(ctx, { action: 'sm.participant.attendance', entity: 'smeet_participants', entityId: input.participant_id, after: input });
  return rows[0]!;
}

export async function listParticipants(ctx: SmCtx, meetingId: string) {
  await getMeeting(ctx, meetingId);
  return ctx.db.select().from(smParticipants)
    .where(and(eq(smParticipants.orgId, ctx.orgId), eq(smParticipants.meetingId, meetingId)))
    .orderBy(asc(smParticipants.createdAt));
}

/** Gợi ý khách ngoài từ Soul-Sale (nếu host inject caps.contacts) — thiếu → [] */
export async function suggestExternal(ctx: SmCtx, input: z.infer<typeof suggestExternalSchema>) {
  if (!ctx.caps?.contacts) return { available: false, results: [] as Array<{ ref: string; name: string; email?: string }> };
  const results = await ctx.caps.contacts({ orgId: ctx.orgId, q: input.q, limit: input.limit });
  return { available: true, results };
}
