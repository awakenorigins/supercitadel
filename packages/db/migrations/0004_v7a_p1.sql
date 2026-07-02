-- V7A P1 — Nền móng hardening:
-- 1) Chuẩn hóa audit_logs theo spec G8 (user_id/resource/resource_id/detail/ip)
-- 2) Progressive security lớp 2 (G5): users.email/phone/security_level

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='actor_id') THEN
    ALTER TABLE audit_logs RENAME COLUMN actor_id TO user_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='target') THEN
    ALTER TABLE audit_logs RENAME COLUMN target TO resource;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='meta') THEN
    ALTER TABLE audit_logs RENAME COLUMN meta TO detail;
  END IF;
END $$;

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS resource_id varchar(80);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip varchar(64);
CREATE INDEX IF NOT EXISTS audit_org_created_idx ON audit_logs(org_id, created_at DESC);

-- Progressive security lớp 2: gắn email/SĐT nâng security_level 1 → 2
ALTER TABLE users ADD COLUMN IF NOT EXISTS email varchar(160);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone varchar(24);
ALTER TABLE users ADD COLUMN IF NOT EXISTS security_level int NOT NULL DEFAULT 1;
