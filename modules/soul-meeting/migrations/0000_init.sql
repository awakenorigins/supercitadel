-- ============================================================================
-- SOUL-MEETING 1A — 0000_init.sql
-- 20 bảng: 19 nghiệp vụ (mapping v1.1) + smeet_audit. Chuẩn SuperCitadel:
--   · org_id uuid NOT NULL trên MỌI bảng (multi-tenant, org-scope)
--   · created_by varchar(128) — KHÔNG uuid (bài học Kế Toán)
--   · tiền: numeric(18,0) VND · % / trọng số vốn: numeric(9,4)
--   · không DELETE nghiệp vụ đã phát hành (biên bản published = immutable,
--     hủy họp = status cancelled, không xóa)
-- ============================================================================

-- ── 1. Cấu hình org ─────────────────────────────────────────────────────────
CREATE TABLE smeet_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE,
  hourly_cost numeric(18,0) NOT NULL DEFAULT 0,      -- đơn giá giờ họp bình quân/người (VND)
  cost_enabled boolean NOT NULL DEFAULT true,
  hygiene_require_agenda boolean NOT NULL DEFAULT false, -- true: chưa publish agenda → không cho start
  remind_hours_1 smallint NOT NULL DEFAULT 24,
  remind_hours_2 smallint NOT NULL DEFAULT 1,
  audio_retention_days integer NOT NULL DEFAULT 90,
  asr_engine text NOT NULL DEFAULT 'phowhisper-small',
  created_by varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Loại họp + template ──────────────────────────────────────────────────
CREATE TABLE smeet_meeting_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  -- template jsonb: { agenda:[{title,timebox_minutes}], checklist:[string],
  --   quorum_mode:'none'|'headcount'|'capital_pct', quorum_threshold, pass_threshold,
  --   pass_basis:'attending'|'total', requires_minutes_approval:bool }
  template jsonb NOT NULL DEFAULT '{}',
  is_system boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_by varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

-- ── 3. Series họp định kỳ ───────────────────────────────────────────────────
CREATE TABLE smeet_meeting_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  type_id uuid REFERENCES smeet_meeting_types(id),
  title text NOT NULL,
  freq text NOT NULL CHECK (freq IN ('daily','weekly','monthly')),
  "interval" smallint NOT NULL DEFAULT 1 CHECK ("interval" >= 1 AND "interval" <= 12),
  by_days text,                       -- weekly: 'MO,WE,FR'
  by_monthday smallint,               -- monthly: 1..28
  anchor_start timestamptz NOT NULL,  -- mốc giờ bắt đầu (giờ họp lấy theo mốc này)
  duration_minutes smallint NOT NULL DEFAULT 60,
  until_date date,
  max_count smallint,
  location text,
  online_link text,
  -- snapshot template lúc tạo series: { agenda:[...], participant_user_ids:[...], chair_user_id, secretary_user_id }
  template_snapshot jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','ended')),
  generated_until timestamptz,
  created_by varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── 4. Cuộc họp ─────────────────────────────────────────────────────────────
CREATE TABLE smeet_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  series_id uuid REFERENCES smeet_meeting_series(id),
  type_id uuid REFERENCES smeet_meeting_types(id),
  title text NOT NULL,
  goal text,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('draft','scheduled','in_progress','completed','cancelled')),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  location text,
  online_link text,
  chair_user_id varchar(128),
  secretary_user_id varchar(128),
  agenda_published boolean NOT NULL DEFAULT false,
  cost_rate numeric(18,0),            -- snapshot đơn giá giờ lúc tạo (null = lấy settings)
  cancelled_reason text,
  reminded_1 boolean NOT NULL DEFAULT false,  -- đã nhắc mốc T-remind_hours_1
  reminded_2 boolean NOT NULL DEFAULT false,  -- đã nhắc mốc T-remind_hours_2
  created_by varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);
CREATE INDEX idx_smeet_meetings_org_start ON smeet_meetings (org_id, start_at);
CREATE INDEX idx_smeet_meetings_series ON smeet_meetings (series_id) WHERE series_id IS NOT NULL;

-- ── 5. Người tham dự ────────────────────────────────────────────────────────
CREATE TABLE smeet_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  meeting_id uuid NOT NULL REFERENCES smeet_meetings(id),
  user_id varchar(128),               -- user nội bộ (null nếu khách ngoài)
  external_name text,
  external_email text,
  external_ref text,                  -- ref mềm sang Soul-Sale contact (string, KHÔNG FK cross-module)
  role text NOT NULL DEFAULT 'attendee'
    CHECK (role IN ('chair','secretary','presenter','attendee','informed')),
  required boolean NOT NULL DEFAULT true,
  vote_weight numeric(9,4) NOT NULL DEFAULT 0,   -- % vốn góp (họp HĐTV) hoặc 1 phiếu (headcount)
  rsvp text NOT NULL DEFAULT 'pending' CHECK (rsvp IN ('pending','accepted','declined','tentative')),
  attendance text NOT NULL DEFAULT 'none'
    CHECK (attendance IN ('none','present','late','absent_excused','absent')),
  checkin_at timestamptz,
  note text,
  created_by varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR external_name IS NOT NULL)
);
CREATE UNIQUE INDEX uq_smeet_participants_user ON smeet_participants (meeting_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_smeet_participants_meeting ON smeet_participants (meeting_id);

-- ── 6. Agenda ───────────────────────────────────────────────────────────────
CREATE TABLE smeet_agenda_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  meeting_id uuid NOT NULL REFERENCES smeet_meetings(id),
  sort_order integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  detail text,
  presenter_participant_id uuid REFERENCES smeet_participants(id),
  timebox_minutes smallint,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','done','skipped')),
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('template','manual','carryover','parking_lot')),
  carried_from_item_id uuid,
  created_by varchar(128),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_smeet_agenda_meeting ON smeet_agenda_items (meeting_id, sort_order);

-- ── 7. Ghi chú ──────────────────────────────────────────────────────────────
CREATE TABLE smeet_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  meeting_id uuid NOT NULL REFERENCES smeet_meetings(id),
  agenda_item_id uuid REFERENCES smeet_agenda_items(id),
  author_user_id varchar(128) NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_smeet_notes_meeting ON smeet_notes (meeting_id);

-- ── 8. Tài liệu ─────────────────────────────────────────────────────────────
CREATE TABLE smeet_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  meeting_id uuid NOT NULL REFERENCES smeet_meetings(id),
  agenda_item_id uuid REFERENCES smeet_agenda_items(id),
  kind text NOT NULL DEFAULT 'pre_read' CHECK (kind IN ('pre_read','handout','minutes_attachment')),
  name text NOT NULL,
  file_ref text NOT NULL,             -- ref mềm sang files.store của host
  mime text,
  size_bytes bigint,
  requires_read boolean NOT NULL DEFAULT false,
  uploaded_by varchar(128),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_smeet_documents_meeting ON smeet_documents (meeting_id);

-- ── 9. Read-receipt tài liệu ────────────────────────────────────────────────
CREATE TABLE smeet_document_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  document_id uuid NOT NULL REFERENCES smeet_documents(id),
  user_id varchar(128) NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, user_id)
);

-- ── 10. Checklist chuẩn bị ──────────────────────────────────────────────────
CREATE TABLE smeet_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  meeting_id uuid NOT NULL REFERENCES smeet_meetings(id),
  sort_order integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  assignee_user_id varchar(128),
  done_at timestamptz,
  done_by varchar(128),
  created_by varchar(128),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_smeet_checklist_meeting ON smeet_checklist_items (meeting_id);

-- ── 11. Quyết định ──────────────────────────────────────────────────────────
CREATE TABLE smeet_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  meeting_id uuid NOT NULL REFERENCES smeet_meetings(id),
  agenda_item_id uuid REFERENCES smeet_agenda_items(id),
  content text NOT NULL,
  method text NOT NULL DEFAULT 'consensus' CHECK (method IN ('consensus','vote')),
  vote_id uuid,
  decided_at timestamptz NOT NULL DEFAULT now(),
  created_by varchar(128),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_smeet_decisions_meeting ON smeet_decisions (meeting_id);

-- ── 12. Biểu quyết ──────────────────────────────────────────────────────────
CREATE TABLE smeet_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  meeting_id uuid NOT NULL REFERENCES smeet_meetings(id),
  agenda_item_id uuid REFERENCES smeet_agenda_items(id),
  question text NOT NULL,
  options jsonb NOT NULL DEFAULT '["Tán thành","Không tán thành","Không có ý kiến"]',
  quorum_mode text NOT NULL DEFAULT 'headcount' CHECK (quorum_mode IN ('none','headcount','capital_pct')),
  quorum_threshold numeric(5,2) NOT NULL DEFAULT 50,   -- % (đầu người hoặc % vốn)
  pass_threshold numeric(5,2) NOT NULL DEFAULT 50,     -- % để phương án pass_option thắng
  pass_basis text NOT NULL DEFAULT 'attending' CHECK (pass_basis IN ('attending','total')),
  pass_option text NOT NULL DEFAULT 'Tán thành',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  result jsonb,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_by varchar(128),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_smeet_votes_meeting ON smeet_votes (meeting_id);

-- ── 13. Phiếu bầu ───────────────────────────────────────────────────────────
CREATE TABLE smeet_vote_ballots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  vote_id uuid NOT NULL REFERENCES smeet_votes(id),
  participant_id uuid NOT NULL REFERENCES smeet_participants(id),
  choice text NOT NULL,
  weight numeric(9,4) NOT NULL DEFAULT 0,   -- snapshot vote_weight lúc bỏ phiếu
  is_valid boolean NOT NULL DEFAULT true,
  cast_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vote_id, participant_id)
);

-- ── 14. Action items (việc cần làm) ─────────────────────────────────────────
CREATE TABLE smeet_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  meeting_id uuid REFERENCES smeet_meetings(id),
  decision_id uuid REFERENCES smeet_decisions(id),
  agenda_item_id uuid REFERENCES smeet_agenda_items(id),
  title text NOT NULL,
  description text,
  owner_user_id varchar(128),
  external_owner text,
  due_date date,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','done','cancelled','carried_over')),
  carried_to_meeting_id uuid,
  completed_at timestamptz,
  completed_by varchar(128),
  created_by varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_smeet_action_org_status ON smeet_action_items (org_id, status);
CREATE INDEX idx_smeet_action_owner ON smeet_action_items (org_id, owner_user_id);

-- ── 15. Lịch sử action item ─────────────────────────────────────────────────
CREATE TABLE smeet_action_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  action_item_id uuid NOT NULL REFERENCES smeet_action_items(id),
  author_user_id varchar(128) NOT NULL,
  status_from text,
  status_to text,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── 16. Biên bản (versioned, published = immutable) ─────────────────────────
CREATE TABLE smeet_minutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  meeting_id uuid NOT NULL REFERENCES smeet_meetings(id),
  version integer NOT NULL,
  content jsonb NOT NULL DEFAULT '{}',   -- cấu trúc compile (header/participants/agenda/decisions/votes/actions)
  content_md text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_approval','published','rejected')),
  submitted_by varchar(128),
  submitted_at timestamptz,
  approved_by varchar(128),
  approved_at timestamptz,
  published_at timestamptz,
  rejected_reason text,
  created_by varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, version)
);

-- ── 17. Feedback sau họp ────────────────────────────────────────────────────
CREATE TABLE smeet_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  meeting_id uuid NOT NULL REFERENCES smeet_meetings(id),
  user_id varchar(128) NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  was_necessary boolean,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, user_id)
);

-- ── 18. Ghi âm ──────────────────────────────────────────────────────────────
CREATE TABLE smeet_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  meeting_id uuid NOT NULL REFERENCES smeet_meetings(id),
  file_ref text NOT NULL,
  file_name text,
  mime text,
  size_bytes bigint,
  duration_sec integer,
  lang text NOT NULL DEFAULT 'vi',
  engine text,
  status text NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded','queued','transcribing','done','failed')),
  error text,
  requested_by varchar(128),
  transcribed_at timestamptz,
  created_by varchar(128),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_smeet_recordings_meeting ON smeet_recordings (meeting_id);

-- ── 19. Transcript segments ─────────────────────────────────────────────────
CREATE TABLE smeet_transcript_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  recording_id uuid NOT NULL REFERENCES smeet_recordings(id),
  idx integer NOT NULL,
  start_ms integer NOT NULL DEFAULT 0,
  end_ms integer NOT NULL DEFAULT 0,
  speaker_label text NOT NULL DEFAULT 'Người nói 1',
  text text NOT NULL,
  confidence numeric(5,4),
  edited_by varchar(128),
  edited_at timestamptz,
  UNIQUE (recording_id, idx)
);

-- ── 20. Audit nội bộ module ─────────────────────────────────────────────────
CREATE TABLE smeet_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  actor_user_id varchar(128),
  action text NOT NULL,
  entity text,
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_smeet_audit_org ON smeet_audit (org_id, created_at);
