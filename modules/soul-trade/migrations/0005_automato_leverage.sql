-- SOUL-TRADE AUTOMATO — Đòn bẩy (Leverage) v1.2
-- Thêm option đòn bẩy: cố định + auto-leverage theo ATR, isolated/cross, mô hình rủi ro.
ALTER TABLE st_automato_configs ADD COLUMN IF NOT EXISTS leverage int NOT NULL DEFAULT 1;
ALTER TABLE st_automato_configs ADD COLUMN IF NOT EXISTS margin_mode varchar(10) NOT NULL DEFAULT 'isolated';
ALTER TABLE st_automato_configs ADD COLUMN IF NOT EXISTS auto_leverage boolean NOT NULL DEFAULT false;
ALTER TABLE st_automato_configs ADD COLUMN IF NOT EXISTS lev_min int NOT NULL DEFAULT 2;
ALTER TABLE st_automato_configs ADD COLUMN IF NOT EXISTS lev_max int NOT NULL DEFAULT 20;
-- Mô hình rủi ro: 'A' = giữ risk%/lệnh (đòn bẩy chỉ giảm ký quỹ, an toàn) · 'B' = đòn bẩy khuếch đại size
ALTER TABLE st_automato_configs ADD COLUMN IF NOT EXISTS lev_risk_model varchar(1) NOT NULL DEFAULT 'A';

ALTER TABLE st_automato_configs DROP CONSTRAINT IF EXISTS st_automato_configs_margin_mode_check;
ALTER TABLE st_automato_configs ADD CONSTRAINT st_automato_configs_margin_mode_check CHECK (margin_mode IN ('isolated','cross'));
ALTER TABLE st_automato_configs DROP CONSTRAINT IF EXISTS st_automato_configs_lev_risk_model_check;
ALTER TABLE st_automato_configs ADD CONSTRAINT st_automato_configs_lev_risk_model_check CHECK (lev_risk_model IN ('A','B'));
ALTER TABLE st_automato_configs DROP CONSTRAINT IF EXISTS st_automato_configs_leverage_check;
ALTER TABLE st_automato_configs ADD CONSTRAINT st_automato_configs_leverage_check CHECK (leverage BETWEEN 1 AND 125);
