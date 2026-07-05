CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  topic varchar(64) NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz NULL,
  attempts int NOT NULL DEFAULT 0,
  last_error text NULL
);
CREATE INDEX IF NOT EXISTS outbox_events_pending_idx ON outbox_events (dispatched_at, created_at) WHERE dispatched_at IS NULL;
CREATE INDEX IF NOT EXISTS outbox_events_org_idx ON outbox_events (org_id);
