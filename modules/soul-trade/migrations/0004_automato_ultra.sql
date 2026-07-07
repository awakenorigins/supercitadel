ALTER TABLE st_automato_configs DROP CONSTRAINT IF EXISTS st_automato_configs_super_mode_check;
ALTER TABLE st_automato_configs ADD CONSTRAINT st_automato_configs_super_mode_check CHECK (super_mode IN ('off','soft','hard','custom','ultra'));
