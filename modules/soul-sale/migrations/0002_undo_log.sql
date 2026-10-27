-- 0002_undo_log.sql — bảng nhật ký hoàn tác (Ctrl+Z) cho write actions
CREATE TABLE IF NOT EXISTS "soulsale"."ss_undo_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "actor_user_id" varchar(128) NOT NULL,
  "action" varchar(64) NOT NULL,
  "input" jsonb,
  "result" jsonb,
  "snapshot" jsonb,
  "summary" text,
  "undone" boolean DEFAULT false NOT NULL,
  "undone_at" timestamp with time zone,
  "undone_by" varchar(128),
  "undone_result" jsonb,
  "at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "ss_ul_org_idx" ON "soulsale"."ss_undo_log" ("org_id");
CREATE INDEX IF NOT EXISTS "ss_ul_at_idx" ON "soulsale"."ss_undo_log" ("org_id","at");
ALTER TABLE "soulsale"."ss_undo_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "soulsale"."ss_undo_log" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ss_undo_log_org_isolation" ON "soulsale"."ss_undo_log";
CREATE POLICY "ss_undo_log_org_isolation" ON "soulsale"."ss_undo_log" USING (org_id::text = current_setting('app.current_org_id', true)) WITH CHECK (org_id::text = current_setting('app.current_org_id', true));
