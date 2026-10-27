-- V12 ⑦ — TSCĐ phân bổ khấu hao multi-TK (627/641/642 theo tỷ lệ).
ALTER TABLE ketoan10a.fixed_assets ADD COLUMN IF NOT EXISTS allocations jsonb;
