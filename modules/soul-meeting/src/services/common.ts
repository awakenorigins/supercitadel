/**
 * SOUL-MEETING 1A — helpers dùng chung: audit nội bộ + getter org-scoped fail-closed.
 */
import { and, eq } from 'drizzle-orm';
import type { SmCtx } from '../types.js';
import { SmError } from '../types.js';
import {
  smAudit, smMeetings, smMeetingTypes, smMeetingSeries, smParticipants,
  smAgendaItems, smDocuments, smVotes, smActionItems, smMinutes, smRecordings,
} from '../db/schema.js';

export async function writeAudit(ctx: SmCtx, e: {
  action: string; entity?: string; entityId?: string;
  before?: unknown; after?: unknown;
}): Promise<void> {
  await ctx.db.insert(smAudit).values({
    orgId: ctx.orgId, actorUserId: ctx.userId,
    action: e.action, entity: e.entity, entityId: e.entityId,
    before: e.before ?? null, after: e.after ?? null,
  });
}

export async function listAudit(ctx: SmCtx, limit = 50) {
  return ctx.db.select().from(smAudit).where(eq(smAudit.orgId, ctx.orgId))
    .orderBy(smAudit.createdAt).limit(limit);
}

/** Getter fail-closed: luôn lọc org, không thấy → ném SmError có mã */
export async function getMeeting(ctx: SmCtx, id: string) {
  const [row] = await ctx.db.select().from(smMeetings)
    .where(and(eq(smMeetings.orgId, ctx.orgId), eq(smMeetings.id, id))).limit(1);
  if (!row) throw new SmError('MEETING_NOT_FOUND', `Không tìm thấy cuộc họp ${id}`);
  return row;
}
export async function getType(ctx: SmCtx, id: string) {
  const [row] = await ctx.db.select().from(smMeetingTypes)
    .where(and(eq(smMeetingTypes.orgId, ctx.orgId), eq(smMeetingTypes.id, id))).limit(1);
  if (!row) throw new SmError('TYPE_NOT_FOUND', `Không tìm thấy loại họp ${id}`);
  return row;
}
export async function getSeries(ctx: SmCtx, id: string) {
  const [row] = await ctx.db.select().from(smMeetingSeries)
    .where(and(eq(smMeetingSeries.orgId, ctx.orgId), eq(smMeetingSeries.id, id))).limit(1);
  if (!row) throw new SmError('SERIES_NOT_FOUND', `Không tìm thấy series ${id}`);
  return row;
}
export async function getParticipant(ctx: SmCtx, id: string) {
  const [row] = await ctx.db.select().from(smParticipants)
    .where(and(eq(smParticipants.orgId, ctx.orgId), eq(smParticipants.id, id))).limit(1);
  if (!row) throw new SmError('PARTICIPANT_NOT_FOUND', `Không tìm thấy người tham dự ${id}`);
  return row;
}
export async function getAgendaItem(ctx: SmCtx, id: string) {
  const [row] = await ctx.db.select().from(smAgendaItems)
    .where(and(eq(smAgendaItems.orgId, ctx.orgId), eq(smAgendaItems.id, id))).limit(1);
  if (!row) throw new SmError('AGENDA_ITEM_NOT_FOUND', `Không tìm thấy mục agenda ${id}`);
  return row;
}
export async function getDocument(ctx: SmCtx, id: string) {
  const [row] = await ctx.db.select().from(smDocuments)
    .where(and(eq(smDocuments.orgId, ctx.orgId), eq(smDocuments.id, id))).limit(1);
  if (!row) throw new SmError('DOCUMENT_NOT_FOUND', `Không tìm thấy tài liệu ${id}`);
  return row;
}
export async function getVote(ctx: SmCtx, id: string) {
  const [row] = await ctx.db.select().from(smVotes)
    .where(and(eq(smVotes.orgId, ctx.orgId), eq(smVotes.id, id))).limit(1);
  if (!row) throw new SmError('VOTE_NOT_FOUND', `Không tìm thấy biểu quyết ${id}`);
  return row;
}
export async function getActionItem(ctx: SmCtx, id: string) {
  const [row] = await ctx.db.select().from(smActionItems)
    .where(and(eq(smActionItems.orgId, ctx.orgId), eq(smActionItems.id, id))).limit(1);
  if (!row) throw new SmError('ACTION_NOT_FOUND', `Không tìm thấy việc ${id}`);
  return row;
}
export async function getMinutes(ctx: SmCtx, id: string) {
  const [row] = await ctx.db.select().from(smMinutes)
    .where(and(eq(smMinutes.orgId, ctx.orgId), eq(smMinutes.id, id))).limit(1);
  if (!row) throw new SmError('MINUTES_NOT_FOUND', `Không tìm thấy biên bản ${id}`);
  return row;
}
export async function getRecording(ctx: SmCtx, id: string) {
  const [row] = await ctx.db.select().from(smRecordings)
    .where(and(eq(smRecordings.orgId, ctx.orgId), eq(smRecordings.id, id))).limit(1);
  if (!row) throw new SmError('RECORDING_NOT_FOUND', `Không tìm thấy ghi âm ${id}`);
  return row;
}
