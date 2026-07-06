-- R7.6: Tiểu Tâm chat persistence — hội thoại thật, mở lại còn nguyên, multi-turn context
CREATE TABLE IF NOT EXISTS tt_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role varchar(12) NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tt_chat_org_user_idx ON tt_chat_messages (org_id, user_id, created_at DESC);
