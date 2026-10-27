CREATE TABLE IF NOT EXISTS company_module_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  payload jsonb NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'received' CHECK (status IN ('received','reviewing','building','delivered')),
  terms_accepted_at timestamptz NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_module_requests_org_idx ON company_module_requests(org_id);
