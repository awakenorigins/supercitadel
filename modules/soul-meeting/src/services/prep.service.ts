/**
 * SOUL-MEETING 1A — prep.service
 * Tài liệu (pre-read/handout) + read-receipt "ai chưa đọc" · checklist chuẩn bị · ghi chú.
 * file_ref là ref mềm sang files.store của host — module không đụng bytes.
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';
import type { SmCtx } from '../types.js';
import { SmError } from '../types.js';
import {
  smDocuments, smDocumentReads, smChecklistItems, smNotes, smParticipants,
} from '../db/schema.js';
import { writeAudit, getMeeting, getDocument } from './common.js';
import type {
  documentAddSchema, markReadSchema, checklistAddSchema, checklistToggleSchema, noteAddSchema,
} from '../validation/schemas.js';

const CLOSED = ['completed', 'cancelled'];

// ── DOCUMENTS ────────────────────────────────────────────────────────────────
export async function addDocument(ctx: SmCtx, input: z.infer<typeof documentAddSchema>) {
  const m = await getMeeting(ctx, input.meeting_id);
  if (m.status === 'cancelled') throw new SmError('MEETING_STATUS_INVALID', 'Họp đã hủy');
  const rows = await ctx.db.insert(smDocuments).values({
    orgId: ctx.orgId, meetingId: input.meeting_id, agendaItemId: input.agenda_item_id,
    kind: input.kind, name: input.name, fileRef: input.file_ref,
    mime: input.mime, sizeBytes: input.size_bytes,
    requiresRead: input.requires_read, uploadedBy: ctx.userId,
  }).returning();
  await writeAudit(ctx, { action: 'sm.document.add', entity: 'smeet_documents', entityId: rows[0]!.id, after: { name: input.name, kind: input.kind } });
  return rows[0]!;
}

export async function removeDocument(ctx: SmCtx, id: string) {
  const doc = await getDocument(ctx, id);
  await ctx.db.delete(smDocumentReads).where(and(eq(smDocumentReads.orgId, ctx.orgId), eq(smDocumentReads.documentId, id)));
  await ctx.db.delete(smDocuments).where(and(eq(smDocuments.orgId, ctx.orgId), eq(smDocuments.id, id)));
  await writeAudit(ctx, { action: 'sm.document.remove', entity: 'smeet_documents', entityId: id, before: doc });
  return { removed: true };
}

export async function listDocuments(ctx: SmCtx, meetingId: string) {
  await getMeeting(ctx, meetingId);
  return ctx.db.select().from(smDocuments)
    .where(and(eq(smDocuments.orgId, ctx.orgId), eq(smDocuments.meetingId, meetingId)))
    .orderBy(asc(smDocuments.createdAt));
}

/** Đánh dấu "tôi đã đọc" — idempotent */
export async function markRead(ctx: SmCtx, input: z.infer<typeof markReadSchema>) {
  await getDocument(ctx, input.document_id);
  await ctx.db.insert(smDocumentReads).values({
    orgId: ctx.orgId, documentId: input.document_id, userId: ctx.userId,
  }).onConflictDoNothing();
  const [row] = await ctx.db.select().from(smDocumentReads)
    .where(and(eq(smDocumentReads.orgId, ctx.orgId), eq(smDocumentReads.documentId, input.document_id), eq(smDocumentReads.userId, ctx.userId))).limit(1);
  return row!;
}

/** Trạng thái đọc: mỗi tài liệu requires_read → ai (required, nội bộ) chưa đọc */
export async function readStatus(ctx: SmCtx, meetingId: string) {
  await getMeeting(ctx, meetingId);
  const docs = await ctx.db.select().from(smDocuments)
    .where(and(eq(smDocuments.orgId, ctx.orgId), eq(smDocuments.meetingId, meetingId), eq(smDocuments.requiresRead, true)));
  if (docs.length === 0) return [];
  const parts = await ctx.db.select().from(smParticipants)
    .where(and(eq(smParticipants.orgId, ctx.orgId), eq(smParticipants.meetingId, meetingId), eq(smParticipants.required, true)));
  const mustRead = parts.filter((p) => p.userId).map((p) => p.userId!) ;
  const reads = await ctx.db.select().from(smDocumentReads)
    .where(and(eq(smDocumentReads.orgId, ctx.orgId), inArray(smDocumentReads.documentId, docs.map((d) => d.id))));
  return docs.map((d) => {
    const readBy = new Set(reads.filter((r) => r.documentId === d.id).map((r) => r.userId));
    return {
      document_id: d.id, name: d.name,
      read_count: readBy.size,
      unread_user_ids: mustRead.filter((u) => !readBy.has(u)),
    };
  });
}

// ── CHECKLIST ────────────────────────────────────────────────────────────────
export async function addChecklistItem(ctx: SmCtx, input: z.infer<typeof checklistAddSchema>) {
  const m = await getMeeting(ctx, input.meeting_id);
  if (CLOSED.includes(m.status)) throw new SmError('MEETING_STATUS_INVALID', `Họp đang ${m.status}`);
  const rows = await ctx.db.insert(smChecklistItems).values({
    orgId: ctx.orgId, meetingId: input.meeting_id, title: input.title,
    assigneeUserId: input.assignee_user_id, createdBy: ctx.userId,
  }).returning();
  await writeAudit(ctx, { action: 'sm.checklist.add', entity: 'smeet_checklist_items', entityId: rows[0]!.id, after: input });
  return rows[0]!;
}

export async function toggleChecklistItem(ctx: SmCtx, input: z.infer<typeof checklistToggleSchema>) {
  const [item] = await ctx.db.select().from(smChecklistItems)
    .where(and(eq(smChecklistItems.orgId, ctx.orgId), eq(smChecklistItems.id, input.id))).limit(1);
  if (!item) throw new SmError('CHECKLIST_NOT_FOUND', `Không tìm thấy mục checklist ${input.id}`);
  const rows = await ctx.db.update(smChecklistItems).set(
    input.done ? { doneAt: new Date(), doneBy: ctx.userId } : { doneAt: null, doneBy: null },
  ).where(and(eq(smChecklistItems.orgId, ctx.orgId), eq(smChecklistItems.id, input.id))).returning();
  await writeAudit(ctx, { action: 'sm.checklist.toggle', entity: 'smeet_checklist_items', entityId: input.id, after: input });
  return rows[0]!;
}

export async function listChecklist(ctx: SmCtx, meetingId: string) {
  await getMeeting(ctx, meetingId);
  return ctx.db.select().from(smChecklistItems)
    .where(and(eq(smChecklistItems.orgId, ctx.orgId), eq(smChecklistItems.meetingId, meetingId)))
    .orderBy(asc(smChecklistItems.sortOrder), asc(smChecklistItems.createdAt));
}

// ── NOTES ────────────────────────────────────────────────────────────────────
export async function addNote(ctx: SmCtx, input: z.infer<typeof noteAddSchema>) {
  const m = await getMeeting(ctx, input.meeting_id);
  if (m.status === 'cancelled') throw new SmError('MEETING_STATUS_INVALID', 'Họp đã hủy');
  const rows = await ctx.db.insert(smNotes).values({
    orgId: ctx.orgId, meetingId: input.meeting_id, agendaItemId: input.agenda_item_id,
    authorUserId: ctx.userId, content: input.content,
  }).returning();
  return rows[0]!;
}

export async function listNotes(ctx: SmCtx, meetingId: string) {
  await getMeeting(ctx, meetingId);
  return ctx.db.select().from(smNotes)
    .where(and(eq(smNotes.orgId, ctx.orgId), eq(smNotes.meetingId, meetingId)))
    .orderBy(asc(smNotes.createdAt));
}
