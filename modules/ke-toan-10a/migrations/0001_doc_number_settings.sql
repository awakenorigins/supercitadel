-- V12 ⑤ — Cấu hình số chứng từ tùy chỉnh per-org (format/prefix/pad).
CREATE TABLE IF NOT EXISTS ketoan10a.doc_number_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  doc_type varchar(20) NOT NULL,
  prefix varchar(12) NOT NULL,
  pad integer NOT NULL DEFAULT 6,
  format varchar(60) NOT NULL DEFAULT '{prefix}-{year}-{seq}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS docnum_settings_org_type_uq
  ON ketoan10a.doc_number_settings (org_id, doc_type);
