DO $$ BEGIN CREATE TYPE deal_stage AS ENUM ('lead','quote','negotiation','won','lost');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS crm_contacts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL,
  name       varchar(120) NOT NULL,
  phone      varchar(32),
  email      varchar(160),
  tag        varchar(40),
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_contacts_org_idx ON crm_contacts(org_id);

CREATE TABLE IF NOT EXISTS crm_deals (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL,
  contact_id uuid REFERENCES crm_contacts(id) ON DELETE SET NULL,
  title      varchar(160) NOT NULL,
  value_vnd  bigint NOT NULL DEFAULT 0,
  stage      deal_stage NOT NULL DEFAULT 'lead',
  owner_id   uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_deals_org_idx ON crm_deals(org_id);
CREATE INDEX IF NOT EXISTS crm_deals_stage_idx ON crm_deals(org_id, stage);
