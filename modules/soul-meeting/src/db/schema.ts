/**
 * SOUL-MEETING 1A — Drizzle schema (mirror 0000_init.sql, 20 bảng)
 * Quy ước Citadel: org_id uuid NOT NULL mọi bảng · created_by varchar(128).
 */
import {
  pgTable, uuid, text, varchar, boolean, timestamp, integer, smallint,
  numeric, jsonb, bigint, date, uniqueIndex, index,
} from 'drizzle-orm/pg-core';

export const smSettings = pgTable('smeet_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().unique(),
  hourlyCost: numeric('hourly_cost', { precision: 18, scale: 0 }).notNull().default('0'),
  costEnabled: boolean('cost_enabled').notNull().default(true),
  hygieneRequireAgenda: boolean('hygiene_require_agenda').notNull().default(false),
  remindHours1: smallint('remind_hours_1').notNull().default(24),
  remindHours2: smallint('remind_hours_2').notNull().default(1),
  audioRetentionDays: integer('audio_retention_days').notNull().default(90),
  asrEngine: text('asr_engine').notNull().default('phowhisper-small'),
  createdBy: varchar('created_by', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smMeetingTypes = pgTable('smeet_meeting_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  template: jsonb('template').notNull().default({}),
  isSystem: boolean('is_system').notNull().default(false),
  isArchived: boolean('is_archived').notNull().default(false),
  createdBy: varchar('created_by', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ uqName: uniqueIndex('uq_smeet_types_org_name').on(t.orgId, t.name) }));

export const smMeetingSeries = pgTable('smeet_meeting_series', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  typeId: uuid('type_id'),
  title: text('title').notNull(),
  freq: text('freq').notNull(),
  interval: smallint('interval').notNull().default(1),
  byDays: text('by_days'),
  byMonthday: smallint('by_monthday'),
  anchorStart: timestamp('anchor_start', { withTimezone: true }).notNull(),
  durationMinutes: smallint('duration_minutes').notNull().default(60),
  untilDate: date('until_date'),
  maxCount: smallint('max_count'),
  location: text('location'),
  onlineLink: text('online_link'),
  templateSnapshot: jsonb('template_snapshot').notNull().default({}),
  status: text('status').notNull().default('active'),
  generatedUntil: timestamp('generated_until', { withTimezone: true }),
  createdBy: varchar('created_by', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smMeetings = pgTable('smeet_meetings', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  seriesId: uuid('series_id'),
  typeId: uuid('type_id'),
  title: text('title').notNull(),
  goal: text('goal'),
  status: text('status').notNull().default('scheduled'),
  startAt: timestamp('start_at', { withTimezone: true }).notNull(),
  endAt: timestamp('end_at', { withTimezone: true }).notNull(),
  actualStartAt: timestamp('actual_start_at', { withTimezone: true }),
  actualEndAt: timestamp('actual_end_at', { withTimezone: true }),
  location: text('location'),
  onlineLink: text('online_link'),
  chairUserId: varchar('chair_user_id', { length: 128 }),
  secretaryUserId: varchar('secretary_user_id', { length: 128 }),
  agendaPublished: boolean('agenda_published').notNull().default(false),
  costRate: numeric('cost_rate', { precision: 18, scale: 0 }),
  cancelledReason: text('cancelled_reason'),
  reminded1: boolean('reminded_1').notNull().default(false),
  reminded2: boolean('reminded_2').notNull().default(false),
  createdBy: varchar('created_by', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxOrgStart: index('idx_smeet_meetings_org_start2').on(t.orgId, t.startAt),
}));

export const smParticipants = pgTable('smeet_participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  meetingId: uuid('meeting_id').notNull(),
  userId: varchar('user_id', { length: 128 }),
  externalName: text('external_name'),
  externalEmail: text('external_email'),
  externalRef: text('external_ref'),
  role: text('role').notNull().default('attendee'),
  required: boolean('required').notNull().default(true),
  voteWeight: numeric('vote_weight', { precision: 9, scale: 4 }).notNull().default('0'),
  rsvp: text('rsvp').notNull().default('pending'),
  attendance: text('attendance').notNull().default('none'),
  checkinAt: timestamp('checkin_at', { withTimezone: true }),
  note: text('note'),
  createdBy: varchar('created_by', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smAgendaItems = pgTable('smeet_agenda_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  meetingId: uuid('meeting_id').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  title: text('title').notNull(),
  detail: text('detail'),
  presenterParticipantId: uuid('presenter_participant_id'),
  timeboxMinutes: smallint('timebox_minutes'),
  status: text('status').notNull().default('pending'),
  actualStartAt: timestamp('actual_start_at', { withTimezone: true }),
  actualEndAt: timestamp('actual_end_at', { withTimezone: true }),
  source: text('source').notNull().default('manual'),
  carriedFromItemId: uuid('carried_from_item_id'),
  createdBy: varchar('created_by', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smNotes = pgTable('smeet_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  meetingId: uuid('meeting_id').notNull(),
  agendaItemId: uuid('agenda_item_id'),
  authorUserId: varchar('author_user_id', { length: 128 }).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smDocuments = pgTable('smeet_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  meetingId: uuid('meeting_id').notNull(),
  agendaItemId: uuid('agenda_item_id'),
  kind: text('kind').notNull().default('pre_read'),
  name: text('name').notNull(),
  fileRef: text('file_ref').notNull(),
  mime: text('mime'),
  sizeBytes: bigint('size_bytes', { mode: 'number' }),
  requiresRead: boolean('requires_read').notNull().default(false),
  uploadedBy: varchar('uploaded_by', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smDocumentReads = pgTable('smeet_document_reads', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  documentId: uuid('document_id').notNull(),
  userId: varchar('user_id', { length: 128 }).notNull(),
  readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ uq: uniqueIndex('uq_smeet_docreads2').on(t.documentId, t.userId) }));

export const smChecklistItems = pgTable('smeet_checklist_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  meetingId: uuid('meeting_id').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  title: text('title').notNull(),
  assigneeUserId: varchar('assignee_user_id', { length: 128 }),
  doneAt: timestamp('done_at', { withTimezone: true }),
  doneBy: varchar('done_by', { length: 128 }),
  createdBy: varchar('created_by', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smDecisions = pgTable('smeet_decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  meetingId: uuid('meeting_id').notNull(),
  agendaItemId: uuid('agenda_item_id'),
  content: text('content').notNull(),
  method: text('method').notNull().default('consensus'),
  voteId: uuid('vote_id'),
  decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: varchar('created_by', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smVotes = pgTable('smeet_votes', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  meetingId: uuid('meeting_id').notNull(),
  agendaItemId: uuid('agenda_item_id'),
  question: text('question').notNull(),
  options: jsonb('options').notNull().default(['Tán thành', 'Không tán thành', 'Không có ý kiến']),
  quorumMode: text('quorum_mode').notNull().default('headcount'),
  quorumThreshold: numeric('quorum_threshold', { precision: 5, scale: 2 }).notNull().default('50'),
  passThreshold: numeric('pass_threshold', { precision: 5, scale: 2 }).notNull().default('50'),
  passBasis: text('pass_basis').notNull().default('attending'),
  passOption: text('pass_option').notNull().default('Tán thành'),
  status: text('status').notNull().default('open'),
  result: jsonb('result'),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  createdBy: varchar('created_by', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smVoteBallots = pgTable('smeet_vote_ballots', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  voteId: uuid('vote_id').notNull(),
  participantId: uuid('participant_id').notNull(),
  choice: text('choice').notNull(),
  weight: numeric('weight', { precision: 9, scale: 4 }).notNull().default('0'),
  isValid: boolean('is_valid').notNull().default(true),
  castAt: timestamp('cast_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ uq: uniqueIndex('uq_smeet_ballots2').on(t.voteId, t.participantId) }));

export const smActionItems = pgTable('smeet_action_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  meetingId: uuid('meeting_id'),
  decisionId: uuid('decision_id'),
  agendaItemId: uuid('agenda_item_id'),
  title: text('title').notNull(),
  description: text('description'),
  ownerUserId: varchar('owner_user_id', { length: 128 }),
  externalOwner: text('external_owner'),
  dueDate: date('due_date'),
  priority: text('priority').notNull().default('normal'),
  status: text('status').notNull().default('open'),
  carriedToMeetingId: uuid('carried_to_meeting_id'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  completedBy: varchar('completed_by', { length: 128 }),
  createdBy: varchar('created_by', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smActionUpdates = pgTable('smeet_action_updates', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  actionItemId: uuid('action_item_id').notNull(),
  authorUserId: varchar('author_user_id', { length: 128 }).notNull(),
  statusFrom: text('status_from'),
  statusTo: text('status_to'),
  comment: text('comment'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smMinutes = pgTable('smeet_minutes', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  meetingId: uuid('meeting_id').notNull(),
  version: integer('version').notNull(),
  content: jsonb('content').notNull().default({}),
  contentMd: text('content_md').notNull().default(''),
  status: text('status').notNull().default('draft'),
  submittedBy: varchar('submitted_by', { length: 128 }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  approvedBy: varchar('approved_by', { length: 128 }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  rejectedReason: text('rejected_reason'),
  createdBy: varchar('created_by', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ uq: uniqueIndex('uq_smeet_minutes_ver2').on(t.meetingId, t.version) }));

export const smFeedback = pgTable('smeet_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  meetingId: uuid('meeting_id').notNull(),
  userId: varchar('user_id', { length: 128 }).notNull(),
  rating: smallint('rating').notNull(),
  wasNecessary: boolean('was_necessary'),
  comment: text('comment'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ uq: uniqueIndex('uq_smeet_feedback2').on(t.meetingId, t.userId) }));

export const smRecordings = pgTable('smeet_recordings', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  meetingId: uuid('meeting_id').notNull(),
  fileRef: text('file_ref').notNull(),
  fileName: text('file_name'),
  mime: text('mime'),
  sizeBytes: bigint('size_bytes', { mode: 'number' }),
  durationSec: integer('duration_sec'),
  lang: text('lang').notNull().default('vi'),
  engine: text('engine'),
  status: text('status').notNull().default('uploaded'),
  error: text('error'),
  requestedBy: varchar('requested_by', { length: 128 }),
  transcribedAt: timestamp('transcribed_at', { withTimezone: true }),
  createdBy: varchar('created_by', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smTranscriptSegments = pgTable('smeet_transcript_segments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  recordingId: uuid('recording_id').notNull(),
  idx: integer('idx').notNull(),
  startMs: integer('start_ms').notNull().default(0),
  endMs: integer('end_ms').notNull().default(0),
  speakerLabel: text('speaker_label').notNull().default('Người nói 1'),
  text: text('text').notNull(),
  confidence: numeric('confidence', { precision: 5, scale: 4 }),
  editedBy: varchar('edited_by', { length: 128 }),
  editedAt: timestamp('edited_at', { withTimezone: true }),
}, (t) => ({ uq: uniqueIndex('uq_smeet_segments2').on(t.recordingId, t.idx) }));

export const smAudit = pgTable('smeet_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  actorUserId: varchar('actor_user_id', { length: 128 }),
  action: text('action').notNull(),
  entity: text('entity'),
  entityId: uuid('entity_id'),
  before: jsonb('before'),
  after: jsonb('after'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
