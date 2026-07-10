/**
 * SOUL-MEETING 1A — Hono-like routes (lớp HTTP mỏng)
 * Host mount SAU chuỗi middleware chuẩn Citadel (auth → gate → org-tx).
 * KHÔNG import 'hono' — nhận MinimalRouter (DI); adapter server/host-adapter.ts
 * tạo shim strip prefix '/meeting' và gắn smCtx (kèm caps asr/notify/contacts).
 * Route chỉ parse Zod + gọi service. File nhị phân (ics/xlsx) do adapter phục vụ
 * qua GET riêng — MinimalContext giữ json-only đúng khuôn Soul-Wallet.
 */
import { ZodError, z, type ZodType } from 'zod';
import type { SmCtx } from './types.js';
import { SmError } from './types.js';
import {
  settingsUpsertSchema, typeUpsertSchema,
  meetingCreateSchema, meetingUpdateSchema, meetingRescheduleSchema, meetingCancelSchema, meetingListSchema,
  seriesCreateSchema, seriesGenerateSchema, seriesStatusSchema,
  participantAddSchema, participantBulkSchema, participantUpdateSchema,
  rsvpSchema, checkinSchema, attendanceSchema, suggestExternalSchema,
  agendaAddSchema, agendaUpdateSchema, agendaReorderSchema, agendaRunSchema,
  documentAddSchema, markReadSchema, checklistAddSchema, checklistToggleSchema, noteAddSchema,
  decisionAddSchema, voteCreateSchema, ballotCastSchema, voteCloseSchema,
  actionCreateSchema, actionBatchSchema, actionUpdateSchema, actionListSchema, carryoverSchema,
  minutesGenerateSchema, minutesUpdateSchema, minutesFlowSchema, feedbackSchema,
  recordingRegisterSchema, segmentUpdateSchema, speakerRenameSchema,
  harvestTextSchema, weekViewSchema, kpiRangeSchema, scheduledRunSchema,
} from './validation/schemas.js';
import { getSettings, updateSettings, seedDefaultTypes, listTypes, upsertType } from './services/catalog.service.js';
import {
  createMeeting, updateMeeting, rescheduleMeeting, cancelMeeting, startMeeting, finishMeeting,
  listMeetings, createSeries, generateOccurrences, setSeriesStatus, listSeries,
} from './services/meeting.service.js';
import { getMeeting, getMinutes as getMinutesRow, listAudit } from './services/common.js';
import {
  addParticipant, bulkAddParticipants, updateParticipant, removeParticipant,
  setRsvp, checkin, setAttendance, listParticipants, suggestExternal,
} from './services/participant.service.js';
import {
  addAgendaItem, updateAgendaItem, removeAgendaItem, reorderAgenda, listAgenda,
  publishAgenda, runAgendaItem,
} from './services/agenda.service.js';
import {
  addDocument, removeDocument, listDocuments, markRead, readStatus,
  addChecklistItem, toggleChecklistItem, listChecklist, addNote, listNotes,
} from './services/prep.service.js';
import { addDecision, listDecisions, createVote, castBallot, closeVote, listVotes } from './services/vote.service.js';
import {
  createActionItem, createActionItemsBatch, updateActionItem, completeActionItem,
  listActionItems, actionHistory, carryoverOpenItems,
} from './services/action.service.js';
import {
  generateDraft, updateDraft, submitMinutes, approveMinutes, rejectMinutes,
  publishMinutes, listMinutes, submitFeedback, feedbackSummary,
} from './services/minutes.service.js';
import {
  registerRecording, requestTranscription, listRecordings, getTranscript,
  updateSegment, renameSpeaker, harvestFromTranscript,
} from './services/recording.service.js';
import { harvestFromText } from './services/harvest.service.js';
import { weekView, kpiRange, digest, exportActionsXlsx } from './services/report.service.js';
import { runScheduledTasks } from './services/scheduled.service.js';

export interface MinimalRouter {
  post(path: string, handler: (c: MinimalContext) => Promise<Response>): void;
  get(path: string, handler: (c: MinimalContext) => Promise<Response>): void;
}
export interface MinimalContext {
  req: {
    json(): Promise<unknown>;
    query(key: string): string | undefined;
    param(key: string): string;
  };
  get(key: 'smCtx'): SmCtx;
  json(data: unknown, status?: number): Response;
}

function errorToResponse(c: MinimalContext, err: unknown): Response {
  if (err instanceof SmError) {
    return c.json({ error: { code: err.code, message: err.message, details: err.details } }, 422);
  }
  if (err instanceof ZodError) {
    return c.json({ error: { code: 'INVALID_INPUT', message: 'Dữ liệu không hợp lệ', issues: err.issues } }, 400);
  }
  console.error('[soul-meeting]', err);
  return c.json({ error: { code: 'INTERNAL', message: 'Lỗi nội bộ Soul-Meeting' } }, 500);
}

function q(c: MinimalContext, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = c.req.query(k);
    if (v !== undefined && v !== '') out[k] = v;
  }
  return out;
}

function post<S extends ZodType>(r: MinimalRouter, path: string, schema: S,
  fn: (ctx: SmCtx, input: S['_output'], c: MinimalContext) => Promise<unknown>) {
  r.post(path, async (c) => {
    try {
      const input = schema.parse(await c.req.json().catch(() => ({})));
      return c.json({ data: await fn(c.get('smCtx'), input, c) });
    } catch (e) { return errorToResponse(c, e); }
  });
}
function get<S extends ZodType>(r: MinimalRouter, path: string, schema: S, keys: string[],
  fn: (ctx: SmCtx, input: S['_output'], c: MinimalContext) => Promise<unknown>) {
  r.get(path, async (c) => {
    try {
      const input = schema.parse(q(c, keys));
      return c.json({ data: await fn(c.get('smCtx'), input, c) });
    } catch (e) { return errorToResponse(c, e); }
  });
}
/** GET theo :id — không query schema */
function getById(r: MinimalRouter, path: string, fn: (ctx: SmCtx, id: string, c: MinimalContext) => Promise<unknown>) {
  r.get(path, async (c) => {
    try { return c.json({ data: await fn(c.get('smCtx'), c.req.param('id'), c) }); }
    catch (e) { return errorToResponse(c, e); }
  });
}
/** POST theo :id — body optional schema */
function postById<S extends ZodType>(r: MinimalRouter, path: string, schema: S,
  fn: (ctx: SmCtx, id: string, input: S['_output'], c: MinimalContext) => Promise<unknown>) {
  r.post(path, async (c) => {
    try {
      const input = schema.parse(await c.req.json().catch(() => ({})));
      return c.json({ data: await fn(c.get('smCtx'), c.req.param('id'), input, c) });
    } catch (e) { return errorToResponse(c, e); }
  });
}

const empty = z.object({});

export function createSoulMeetingRoutes(r: MinimalRouter): void {
  // ── Settings + Types ─────────────────────────────────────────────────────
  r.get('/meeting/settings', async (c) => {
    try { return c.json({ data: await getSettings(c.get('smCtx')) }); } catch (e) { return errorToResponse(c, e); }
  });
  post(r, '/meeting/settings', settingsUpsertSchema, (ctx, i) => updateSettings(ctx, i));
  post(r, '/meeting/types/seed', empty, (ctx) => seedDefaultTypes(ctx));
  get(r, '/meeting/types', z.object({ include_archived: z.string().optional() }), ['include_archived'],
    (ctx, i) => listTypes(ctx, i.include_archived === 'true'));
  post(r, '/meeting/types', typeUpsertSchema, (ctx, i) => upsertType(ctx, i));

  // ── Meetings ─────────────────────────────────────────────────────────────
  post(r, '/meeting/meetings', meetingCreateSchema, (ctx, i) => createMeeting(ctx, i));
  get(r, '/meeting/meetings', meetingListSchema, ['from', 'to', 'status', 'series_id', 'type_id', 'q', 'limit'],
    (ctx, i) => listMeetings(ctx, i));
  getById(r, '/meeting/meetings/:id', async (ctx, id) => ({
    meeting: await getMeeting(ctx, id),
    participants: await listParticipants(ctx, id),
    agenda: await listAgenda(ctx, id),
    documents: await listDocuments(ctx, id),
    checklist: await listChecklist(ctx, id),
  }));
  post(r, '/meeting/meetings/update', meetingUpdateSchema, (ctx, i) => updateMeeting(ctx, i));
  post(r, '/meeting/meetings/reschedule', meetingRescheduleSchema, (ctx, i) => rescheduleMeeting(ctx, i));
  post(r, '/meeting/meetings/cancel', meetingCancelSchema, (ctx, i) => cancelMeeting(ctx, i));
  postById(r, '/meeting/meetings/:id/start', empty, (ctx, id) => startMeeting(ctx, id));
  postById(r, '/meeting/meetings/:id/finish', empty, (ctx, id) => finishMeeting(ctx, id));

  // ── Series ───────────────────────────────────────────────────────────────
  post(r, '/meeting/series', seriesCreateSchema, async (ctx, i) => {
    const s = await createSeries(ctx, i);
    const gen = await generateOccurrences(ctx, { id: s.id, horizon_days: 35 });
    return { series: s, generated: gen.created };
  });
  r.get('/meeting/series', async (c) => {
    try { return c.json({ data: await listSeries(c.get('smCtx')) }); } catch (e) { return errorToResponse(c, e); }
  });
  post(r, '/meeting/series/generate', seriesGenerateSchema, (ctx, i) => generateOccurrences(ctx, i));
  post(r, '/meeting/series/status', seriesStatusSchema, (ctx, i) => setSeriesStatus(ctx, i));

  // ── Participants ─────────────────────────────────────────────────────────
  getById(r, '/meeting/meetings/:id/participants', (ctx, id) => listParticipants(ctx, id));
  post(r, '/meeting/participants', participantAddSchema, (ctx, i) => addParticipant(ctx, i));
  post(r, '/meeting/participants/bulk', participantBulkSchema, (ctx, i) => bulkAddParticipants(ctx, i));
  post(r, '/meeting/participants/update', participantUpdateSchema, (ctx, i) => updateParticipant(ctx, i));
  postById(r, '/meeting/participants/:id/remove', empty, (ctx, id) => removeParticipant(ctx, id));
  post(r, '/meeting/participants/rsvp', rsvpSchema, (ctx, i) => setRsvp(ctx, i));
  post(r, '/meeting/participants/checkin', checkinSchema, (ctx, i) => checkin(ctx, i));
  post(r, '/meeting/participants/attendance', attendanceSchema, (ctx, i) => setAttendance(ctx, i));
  get(r, '/meeting/participants/suggest', suggestExternalSchema, ['q', 'limit'], (ctx, i) => suggestExternal(ctx, i));

  // ── Agenda ───────────────────────────────────────────────────────────────
  getById(r, '/meeting/meetings/:id/agenda', (ctx, id) => listAgenda(ctx, id));
  post(r, '/meeting/agenda', agendaAddSchema, (ctx, i) => addAgendaItem(ctx, i));
  post(r, '/meeting/agenda/update', agendaUpdateSchema, (ctx, i) => updateAgendaItem(ctx, i));
  postById(r, '/meeting/agenda/:id/remove', empty, (ctx, id) => removeAgendaItem(ctx, id));
  post(r, '/meeting/agenda/reorder', agendaReorderSchema, (ctx, i) => reorderAgenda(ctx, i));
  postById(r, '/meeting/meetings/:id/agenda/publish', empty, (ctx, id) => publishAgenda(ctx, id));
  post(r, '/meeting/agenda/run', agendaRunSchema, (ctx, i) => runAgendaItem(ctx, i));

  // ── Prep: documents / checklist / notes ──────────────────────────────────
  getById(r, '/meeting/meetings/:id/documents', (ctx, id) => listDocuments(ctx, id));
  post(r, '/meeting/documents', documentAddSchema, (ctx, i) => addDocument(ctx, i));
  postById(r, '/meeting/documents/:id/remove', empty, (ctx, id) => removeDocument(ctx, id));
  post(r, '/meeting/documents/read', markReadSchema, (ctx, i) => markRead(ctx, i));
  getById(r, '/meeting/meetings/:id/read-status', (ctx, id) => readStatus(ctx, id));
  getById(r, '/meeting/meetings/:id/checklist', (ctx, id) => listChecklist(ctx, id));
  post(r, '/meeting/checklist', checklistAddSchema, (ctx, i) => addChecklistItem(ctx, i));
  post(r, '/meeting/checklist/toggle', checklistToggleSchema, (ctx, i) => toggleChecklistItem(ctx, i));
  getById(r, '/meeting/meetings/:id/notes', (ctx, id) => listNotes(ctx, id));
  post(r, '/meeting/notes', noteAddSchema, (ctx, i) => addNote(ctx, i));

  // ── Decisions + Votes ────────────────────────────────────────────────────
  getById(r, '/meeting/meetings/:id/decisions', (ctx, id) => listDecisions(ctx, id));
  post(r, '/meeting/decisions', decisionAddSchema, (ctx, i) => addDecision(ctx, i));
  getById(r, '/meeting/meetings/:id/votes', (ctx, id) => listVotes(ctx, id));
  post(r, '/meeting/votes', voteCreateSchema, (ctx, i) => createVote(ctx, i));
  post(r, '/meeting/votes/cast', ballotCastSchema, (ctx, i) => castBallot(ctx, i));
  post(r, '/meeting/votes/close', voteCloseSchema, (ctx, i) => closeVote(ctx, i));

  // ── Action items ─────────────────────────────────────────────────────────
  get(r, '/meeting/actions', actionListSchema, ['status', 'owner_user_id', 'meeting_id', 'overdue_only', 'limit'],
    (ctx, i) => listActionItems(ctx, i));
  post(r, '/meeting/actions', actionCreateSchema, (ctx, i) => createActionItem(ctx, i));
  post(r, '/meeting/actions/batch', actionBatchSchema, (ctx, i) => createActionItemsBatch(ctx, i));
  post(r, '/meeting/actions/update', actionUpdateSchema, (ctx, i) => updateActionItem(ctx, i));
  postById(r, '/meeting/actions/:id/complete', z.object({ comment: z.string().max(2000).optional() }),
    (ctx, id, i) => completeActionItem(ctx, id, i.comment));
  getById(r, '/meeting/actions/:id/history', (ctx, id) => actionHistory(ctx, id));
  post(r, '/meeting/actions/carryover', carryoverSchema, (ctx, i) => carryoverOpenItems(ctx, i));
  get(r, '/meeting/actions/export-xlsx', actionListSchema, ['status', 'owner_user_id', 'meeting_id', 'overdue_only', 'limit'],
    (ctx, i) => exportActionsXlsx(ctx, i));

  // ── Minutes + Feedback ───────────────────────────────────────────────────
  getById(r, '/meeting/meetings/:id/minutes', (ctx, id) => listMinutes(ctx, id));
  getById(r, '/meeting/minutes/:id', (ctx, id) => getMinutesRow(ctx, id));
  post(r, '/meeting/minutes/generate', minutesGenerateSchema, (ctx, i) => generateDraft(ctx, i));
  post(r, '/meeting/minutes/update', minutesUpdateSchema, (ctx, i) => updateDraft(ctx, i));
  post(r, '/meeting/minutes/submit', minutesFlowSchema, (ctx, i) => submitMinutes(ctx, i));
  post(r, '/meeting/minutes/approve', minutesFlowSchema, (ctx, i) => approveMinutes(ctx, i));
  post(r, '/meeting/minutes/reject', minutesFlowSchema, (ctx, i) => rejectMinutes(ctx, i));
  post(r, '/meeting/minutes/publish', minutesFlowSchema, (ctx, i) => publishMinutes(ctx, i));
  post(r, '/meeting/feedback', feedbackSchema, (ctx, i) => submitFeedback(ctx, i));
  getById(r, '/meeting/meetings/:id/feedback-summary', (ctx, id) => feedbackSummary(ctx, id));

  // ── Recordings + Transcript ──────────────────────────────────────────────
  getById(r, '/meeting/meetings/:id/recordings', (ctx, id) => listRecordings(ctx, id));
  post(r, '/meeting/recordings', recordingRegisterSchema, (ctx, i) => registerRecording(ctx, i));
  postById(r, '/meeting/recordings/:id/transcribe', empty, (ctx, id) => requestTranscription(ctx, id));
  getById(r, '/meeting/recordings/:id/transcript', (ctx, id) => getTranscript(ctx, id));
  post(r, '/meeting/segments/update', segmentUpdateSchema, (ctx, i) => updateSegment(ctx, i));
  post(r, '/meeting/recordings/rename-speaker', speakerRenameSchema, (ctx, i) => renameSpeaker(ctx, i));
  postById(r, '/meeting/recordings/:id/harvest', empty, (ctx, id) => harvestFromTranscript(ctx, id));

  // ── Harvest text + Reports + Ops ─────────────────────────────────────────
  post(r, '/meeting/harvest/text', harvestTextSchema, (ctx, i) => harvestFromText(ctx, i));
  get(r, '/meeting/reports/week', weekViewSchema, ['week_of'], (ctx, i) => weekView(ctx, i));
  get(r, '/meeting/reports/kpi', kpiRangeSchema, ['from', 'to'], (ctx, i) => kpiRange(ctx, i));
  get(r, '/meeting/reports/digest', z.object({ user_id: z.string().max(128).optional() }), ['user_id'],
    (ctx, i) => digest(ctx, i.user_id));
  post(r, '/meeting/scheduled/run', scheduledRunSchema, (ctx, i) => runScheduledTasks(ctx, i.horizon_days));
  get(r, '/meeting/audit', z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }), ['limit'],
    (ctx, i) => listAudit(ctx, i.limit));
}
