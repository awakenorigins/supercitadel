-- R3: thuê module có thời hạn — rented_until NULL = chưa thuê.
ALTER TABLE org_modules ADD COLUMN IF NOT EXISTS rented_until timestamptz NULL;

ALTER TABLE tt_soul_state ADD COLUMN IF NOT EXISTS persona_mode varchar(24) NOT NULL DEFAULT 'friendly';
ALTER TABLE tt_soul_state ADD COLUMN IF NOT EXISTS proactive boolean NOT NULL DEFAULT true;
