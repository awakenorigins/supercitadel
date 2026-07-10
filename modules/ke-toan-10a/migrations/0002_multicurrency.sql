-- V12 ⑥ — Đa tiền tệ tầng core áp vào K10A (Q5: VND gốc, rate+note per-chứng-từ).
-- Chuẩn Misa: CurrencyID + ExchangeRate + AmountOC. amount/total luôn là VND quy đổi.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['receipts','payments','invoices','bills'] LOOP
    EXECUTE format('ALTER TABLE ketoan10a.%I ADD COLUMN IF NOT EXISTS currency varchar(3) NOT NULL DEFAULT ''VND''', t);
    EXECUTE format('ALTER TABLE ketoan10a.%I ADD COLUMN IF NOT EXISTS exchange_rate numeric(18,6) NOT NULL DEFAULT 1', t);
    EXECUTE format('ALTER TABLE ketoan10a.%I ADD COLUMN IF NOT EXISTS amount_oc numeric(20,2)', t);
    EXECUTE format('ALTER TABLE ketoan10a.%I ADD COLUMN IF NOT EXISTS rate_note varchar(255)', t);
    EXECUTE format('ALTER TABLE ketoan10a.%I ADD COLUMN IF NOT EXISTS rate_date date', t);
  END LOOP;
END $$;
