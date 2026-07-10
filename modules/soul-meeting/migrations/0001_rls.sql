-- ============================================================================
-- SOUL-MEETING 1A — 0001_rls.sql
-- RLS fail-closed trên TOÀN BỘ 20 bảng — giáp lớp 2 (defense-in-depth).
-- policy: org_id = current_setting('app.current_org_id')::uuid
-- Hàng rào CHÍNH vẫn là app-level (mọi service lọc ctx.orgId từ JWT);
-- role host hiện BYPASSRLS nên lớp này bảo vệ khi kết nối bằng role app thường.
-- ============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'smeet_settings','smeet_meeting_types','smeet_meeting_series','smeet_meetings',
    'smeet_participants','smeet_agenda_items','smeet_notes','smeet_documents',
    'smeet_document_reads','smeet_checklist_items','smeet_decisions','smeet_votes',
    'smeet_vote_ballots','smeet_action_items','smeet_action_updates','smeet_minutes',
    'smeet_feedback','smeet_recordings','smeet_transcript_segments','smeet_audit'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (org_id = current_setting(''app.current_org_id'')::uuid) '
      || 'WITH CHECK (org_id = current_setting(''app.current_org_id'')::uuid)',
      t || '_org_isolation', t
    );
  END LOOP;
END $$;
