-- 0001_init.sql — Citadel V2 foundation schema
-- Idempotent-ish init. Run order matters (enums → orgs → dependents).

CREATE EXTENSION IF NOT EXISTS vector;

DO $$ BEGIN
  CREATE TYPE role AS ENUM ('owner', 'manager', 'staff');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE avatar_color AS ENUM ('mint', 'violet', 'amber', 'rose', 'sky');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS orgs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        varchar(120) NOT NULL,
  slug        varchar(60)  NOT NULL UNIQUE,
  logo_emoji  varchar(16),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  display_name  varchar(80) NOT NULL,
  role          role NOT NULL DEFAULT 'staff',
  avatar_color  avatar_color NOT NULL DEFAULT 'mint',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_org_idx ON users(org_id);

CREATE TABLE IF NOT EXISTS tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
  token_prefix    char(4) NOT NULL,
  token_hash      text NOT NULL,
  role            role NOT NULL DEFAULT 'staff',
  security_level  varchar(8) NOT NULL DEFAULT '1',
  label           varchar(80),
  revoked_at      timestamptz,
  last_used_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tokens_org_idx ON tokens(org_id);
CREATE INDEX IF NOT EXISTS tokens_prefix_idx ON tokens(token_prefix);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  actor_id    uuid,
  action      varchar(80) NOT NULL,
  target      varchar(120),
  meta        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_org_idx ON audit_logs(org_id);
