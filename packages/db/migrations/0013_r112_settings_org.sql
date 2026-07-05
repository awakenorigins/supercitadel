ALTER TABLE tt_soul_state ADD COLUMN IF NOT EXISTS persona_mode varchar(24) NOT NULL DEFAULT 'friendly';
ALTER TABLE tt_soul_state ADD COLUMN IF NOT EXISTS proactive boolean NOT NULL DEFAULT true;
