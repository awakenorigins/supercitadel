CREATE TABLE IF NOT EXISTS inventory_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  name          varchar(120) NOT NULL,
  unit          varchar(24) NOT NULL DEFAULT 'cái',
  qty           integer NOT NULL DEFAULT 0,
  low_threshold integer NOT NULL DEFAULT 5,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inv_org_idx ON inventory_items(org_id);
