/**
 * SOUL-MEETING 1A — Zod schemas (biên ⑦: routes/actions parse tại biên,
 * services nhận input đã sạch qua z.infer — giữ đúng pattern Soul-Wallet).
 */
import { z } from 'zod';

const uuid = z.string().uuid();
const userId = z.string().min(1).max(128);
const isoDateTime = z.string().datetime({ offset: true }).or(z.string().datetime());
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ── Beat 1: settings / types / meetings / series / participants ─────────────
export const settingsUpsertSchema = z.object({
  hourly_cost: z.number().int().min(0).optional(),
  cost_enabled: z.boolean().optional(),
  hygiene_require_agenda: z.boolean().optional(),
  remind_hours_1: z.number().int().min(1).max(168).optional(),
  remind_hours_2: z.number().int().min(0).max(48).optional(),
  audio_retention_days: z.number().int().min(1).max(3650).optional(),
  asr_engine: z.string().min(1).max(64).optional(),
});

export const typeTemplateSchema = z.object({
  agenda: z.array(z.object({ title: z.string().min(1), timebox_minutes: z.number().int().min(1).max(480).optional() })).default([]),
  checklist: z.array(z.string().min(1)).default([]),
  quorum_mode: z.enum(['none', 'headcount', 'capital_pct']).default('none'),
  quorum_threshold: z.number().min(0).max(100).default(50),
  pass_threshold: z.number().min(0).max(100).default(50),
  pass_basis: z.enum(['attending', 'total']).default('attending'),
  requires_minutes_approval: z.boolean().default(false),
});
export const typeUpsertSchema = z.object({
  id: uuid.optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  template: typeTemplateSchema.optional(),
  is_archived: z.boolean().optional(),
});

export const meetingCreateSchema = z.object({
  title: z.string().min(1).max(300),
  goal: z.string().max(2000).optional(),
  type_id: uuid.optional(),
  start_at: isoDateTime,
  end_at: isoDateTime,
  location: z.string().max(300).optional(),
  online_link: z.string().max(500).optional(),
  chair_user_id: userId.optional(),
  secretary_user_id: userId.optional(),
  apply_template: z.boolean().default(true),   // copy agenda+checklist từ type
  status: z.enum(['draft', 'scheduled']).default('scheduled'),
});
export const meetingUpdateSchema = z.object({
  id: uuid,
  title: z.string().min(1).max(300).optional(),
  goal: z.string().max(2000).optional(),
  location: z.string().max(300).optional(),
  online_link: z.string().max(500).optional(),
  chair_user_id: userId.optional(),
  secretary_user_id: userId.optional(),
});
export const meetingRescheduleSchema = z.object({
  id: uuid, start_at: isoDateTime, end_at: isoDateTime,
});
export const meetingCancelSchema = z.object({ id: uuid, reason: z.string().max(1000).optional() });
export const meetingIdSchema = z.object({ id: uuid });
export const meetingListSchema = z.object({
  from: isoDateTime.optional(), to: isoDateTime.optional(),
  status: z.enum(['draft', 'scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
  series_id: uuid.optional(), type_id: uuid.optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const seriesCreateSchema = z.object({
  title: z.string().min(1).max(300),
  type_id: uuid.optional(),
  freq: z.enum(['daily', 'weekly', 'monthly']),
  interval: z.number().int().min(1).max(12).default(1),
  by_days: z.array(z.enum(['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'])).optional(),
  by_monthday: z.number().int().min(1).max(28).optional(),
  anchor_start: isoDateTime,
  duration_minutes: z.number().int().min(5).max(1440).default(60),
  until_date: isoDate.optional(),
  max_count: z.number().int().min(1).max(200).optional(),
  location: z.string().max(300).optional(),
  online_link: z.string().max(500).optional(),
  participant_user_ids: z.array(userId).default([]),
  chair_user_id: userId.optional(),
  secretary_user_id: userId.optional(),
});
export const seriesGenerateSchema = z.object({
  id: uuid,
  horizon_days: z.number().int().min(1).max(120).default(35),
});
export const seriesStatusSchema = z.object({ id: uuid, status: z.enum(['active', 'paused', 'ended']) });

export const participantAddSchema = z.object({
  meeting_id: uuid,
  user_id: userId.optional(),
  external_name: z.string().max(200).optional(),
  external_email: z.string().email().max(200).optional(),
  external_ref: z.string().max(200).optional(),
  role: z.enum(['chair', 'secretary', 'presenter', 'attendee', 'informed']).default('attendee'),
  required: z.boolean().default(true),
  vote_weight: z.number().min(0).max(100).default(0),
}).refine((v) => v.user_id || v.external_name, { message: 'cần user_id hoặc external_name' });
export const participantBulkSchema = z.object({
  meeting_id: uuid,
  user_ids: z.array(userId).min(1).max(100),
  role: z.enum(['presenter', 'attendee', 'informed']).default('attendee'),
});
export const rsvpSchema = z.object({
  participant_id: uuid, rsvp: z.enum(['accepted', 'declined', 'tentative']),
});
export const checkinSchema = z.object({
  participant_id: uuid,
  late_grace_minutes: z.number().int().min(0).max(120).default(5),
});
export const attendanceSchema = z.object({
  participant_id: uuid,
  attendance: z.enum(['none', 'present', 'late', 'absent_excused', 'absent']),
});
export const participantUpdateSchema = z.object({
  participant_id: uuid,
  vote_weight: z.number().min(0).max(100).optional(),
  required: z.boolean().optional(),
  note: z.string().max(1000).optional(),
});
export const suggestExternalSchema = z.object({ q: z.string().min(1).max(200), limit: z.coerce.number().int().min(1).max(20).default(8) });

// ── Beat 2: agenda / documents / checklist / notes ──────────────────────────
export const agendaAddSchema = z.object({
  meeting_id: uuid,
  title: z.string().min(1).max(300),
  detail: z.string().max(4000).optional(),
  presenter_participant_id: uuid.optional(),
  timebox_minutes: z.number().int().min(1).max(480).optional(),
  source: z.enum(['manual', 'parking_lot']).default('manual'),
});
export const agendaUpdateSchema = z.object({
  id: uuid,
  title: z.string().min(1).max(300).optional(),
  detail: z.string().max(4000).optional(),
  presenter_participant_id: uuid.nullable().optional(),
  timebox_minutes: z.number().int().min(1).max(480).nullable().optional(),
});
export const agendaReorderSchema = z.object({
  meeting_id: uuid, ordered_ids: z.array(uuid).min(1),
});
export const agendaItemIdSchema = z.object({ id: uuid });
export const agendaPublishSchema = z.object({ meeting_id: uuid });

export const documentAddSchema = z.object({
  meeting_id: uuid,
  agenda_item_id: uuid.optional(),
  kind: z.enum(['pre_read', 'handout', 'minutes_attachment']).default('pre_read'),
  name: z.string().min(1).max(300),
  file_ref: z.string().min(1).max(1000),
  mime: z.string().max(200).optional(),
  size_bytes: z.number().int().min(0).optional(),
  requires_read: z.boolean().default(false),
});
export const documentIdSchema = z.object({ id: uuid });
export const markReadSchema = z.object({ document_id: uuid });

export const checklistAddSchema = z.object({
  meeting_id: uuid, title: z.string().min(1).max(300), assignee_user_id: userId.optional(),
});
export const checklistToggleSchema = z.object({ id: uuid, done: z.boolean() });

export const noteAddSchema = z.object({
  meeting_id: uuid, agenda_item_id: uuid.optional(), content: z.string().min(1).max(8000),
});

// ── Beat 3: live / decisions / votes ────────────────────────────────────────
export const agendaRunSchema = z.object({ id: uuid, op: z.enum(['start', 'stop', 'skip']) });
export const decisionAddSchema = z.object({
  meeting_id: uuid, agenda_item_id: uuid.optional(),
  content: z.string().min(1).max(4000),
  method: z.enum(['consensus', 'vote']).default('consensus'),
  vote_id: uuid.optional(),
});
export const voteCreateSchema = z.object({
  meeting_id: uuid, agenda_item_id: uuid.optional(),
  question: z.string().min(1).max(1000),
  options: z.array(z.string().min(1).max(200)).min(2).max(10).optional(),
  quorum_mode: z.enum(['none', 'headcount', 'capital_pct']).default('headcount'),
  quorum_threshold: z.number().min(0).max(100).default(50),
  pass_threshold: z.number().min(0).max(100).default(50),
  pass_basis: z.enum(['attending', 'total']).default('attending'),
  pass_option: z.string().max(200).optional(),
});
export const ballotCastSchema = z.object({
  vote_id: uuid, participant_id: uuid, choice: z.string().min(1).max(200),
});
export const voteCloseSchema = z.object({ vote_id: uuid });

// ── Beat 4: action items / minutes / feedback / harvest ─────────────────────
export const actionCreateSchema = z.object({
  meeting_id: uuid.optional(),
  decision_id: uuid.optional(),
  agenda_item_id: uuid.optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(4000).optional(),
  owner_user_id: userId.optional(),
  external_owner: z.string().max(200).optional(),
  due_date: isoDate.optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
});
export const actionBatchSchema = z.object({
  meeting_id: uuid.optional(),
  items: z.array(actionCreateSchema.omit({ meeting_id: true })).min(1).max(50),
  skip_duplicates: z.boolean().default(true),
});
export const actionUpdateSchema = z.object({
  id: uuid,
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(4000).optional(),
  owner_user_id: userId.nullable().optional(),
  external_owner: z.string().max(200).nullable().optional(),
  due_date: isoDate.nullable().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  status: z.enum(['open', 'in_progress', 'done', 'cancelled']).optional(),
  comment: z.string().max(2000).optional(),
});
export const actionListSchema = z.object({
  status: z.enum(['open', 'in_progress', 'done', 'cancelled', 'carried_over']).optional(),
  owner_user_id: userId.optional(),
  meeting_id: uuid.optional(),
  overdue_only: z.union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')]).default(false),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export const carryoverSchema = z.object({
  from_meeting_id: uuid, to_meeting_id: uuid,
  action_item_ids: z.array(uuid).optional(),   // mặc định: mọi item chưa xong
});

export const minutesGenerateSchema = z.object({ meeting_id: uuid });
export const minutesUpdateSchema = z.object({ id: uuid, content_md: z.string().max(200_000) });
export const minutesFlowSchema = z.object({ id: uuid, reason: z.string().max(1000).optional() });
export const feedbackSchema = z.object({
  meeting_id: uuid, rating: z.number().int().min(1).max(5),
  was_necessary: z.boolean().optional(), comment: z.string().max(2000).optional(),
});
export const harvestTextSchema = z.object({
  meeting_id: uuid, text: z.string().min(1).max(200_000),
});

// ── Beat 5: recordings / transcript ─────────────────────────────────────────
export const recordingRegisterSchema = z.object({
  meeting_id: uuid,
  file_ref: z.string().min(1).max(1000),
  file_name: z.string().max(300).optional(),
  mime: z.string().max(200).optional(),
  size_bytes: z.number().int().min(0).optional(),
  duration_sec: z.number().int().min(0).optional(),
  lang: z.string().max(10).default('vi'),
});
export const recordingIdSchema = z.object({ id: uuid });
export const segmentUpdateSchema = z.object({
  id: uuid, text: z.string().min(1).max(8000).optional(), speaker_label: z.string().min(1).max(100).optional(),
});
export const speakerRenameSchema = z.object({
  recording_id: uuid, from_label: z.string().min(1).max(100), to_label: z.string().min(1).max(100),
});
export const harvestTranscriptSchema = z.object({ recording_id: uuid });

// ── Beat 6: reports ─────────────────────────────────────────────────────────
export const weekViewSchema = z.object({ week_of: isoDate.optional() });
export const kpiRangeSchema = z.object({ from: isoDate, to: isoDate });
export const digestSchema = z.object({ user_id: userId.optional() });

export const scheduledRunSchema = z.object({
  horizon_days: z.coerce.number().int().min(7).max(120).default(35),
});
