-- Module registry: trạng thái module theo org (bật/tắt/mua).
CREATE TABLE IF NOT EXISTS org_modules (
  org_id      uuid NOT NULL,
  module_id   varchar(40) NOT NULL,
  status      varchar(16) NOT NULL DEFAULT 'inactive',  -- active | inactive
  purchased   boolean NOT NULL DEFAULT false,
  activated_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, module_id)
);
