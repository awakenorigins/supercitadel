-- R3: thuê module có thời hạn — rented_until NULL = chưa thuê.
ALTER TABLE org_modules ADD COLUMN IF NOT EXISTS rented_until timestamptz NULL;
