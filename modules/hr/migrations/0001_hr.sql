CREATE TABLE IF NOT EXISTS hr_shifts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL,
  name        varchar(60) NOT NULL,
  shift_date  date NOT NULL,
  start_time  varchar(8) NOT NULL,
  end_time    varchar(8) NOT NULL,
  staff       text NOT NULL DEFAULT '',
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hr_shifts_org_idx ON hr_shifts(org_id, shift_date);
