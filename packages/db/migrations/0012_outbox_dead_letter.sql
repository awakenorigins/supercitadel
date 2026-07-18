ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS failed_at timestamptz;
CREATE INDEX IF NOT EXISTS outbox_events_dispatch_idx ON outbox_events (status, next_attempt_at, created_at) WHERE dispatched_at IS NULL AND status IN ('pending','processing');
CREATE INDEX IF NOT EXISTS outbox_events_failed_owner_idx ON outbox_events (org_id, failed_at) WHERE status = 'failed';
