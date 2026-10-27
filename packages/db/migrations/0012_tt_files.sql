CREATE TABLE IF NOT EXISTS tt_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  filename varchar(180) NOT NULL,
  mime varchar(120),
  kind varchar(16) NOT NULL,
  rows_json jsonb NOT NULL,
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tt_files_org_user_idx ON tt_files(org_id, user_id, created_at);
