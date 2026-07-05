-- R6: Sonnet 4.6 default engine for Tiểu Tâm
ALTER TABLE tt_soul_state ALTER COLUMN engine SET DEFAULT 'sonnet-4.6';
UPDATE tt_soul_state SET engine = 'sonnet-4.6' WHERE engine IN ('stub-a','stub-b');

ALTER TABLE tt_soul_state ADD COLUMN IF NOT EXISTS persona_mode varchar(24) NOT NULL DEFAULT 'friendly';
ALTER TABLE tt_soul_state ADD COLUMN IF NOT EXISTS proactive boolean NOT NULL DEFAULT true;
