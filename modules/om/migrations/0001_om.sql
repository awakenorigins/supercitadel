-- Om economy: ledger + balance per org (balance = SUM of ledger, kept consistent via service).
CREATE TABLE IF NOT EXISTS om_ledger (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL,
  delta       integer NOT NULL,          -- + earn/topup, - spend
  reason      varchar(120) NOT NULL,
  module      varchar(40),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS om_ledger_org_idx ON om_ledger(org_id, created_at);
