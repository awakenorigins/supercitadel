-- ============================================================
-- SOUL-RESTAURANT v1.1 — Migration 0003: FORCE RLS cho 4 bảng mới
-- Fail-closed: org_id = current_setting('app.current_org_id')::uuid
-- KHÔNG coalesce. App kết nối role KHÔNG superuser.
-- ============================================================

-- resto_customers
ALTER TABLE resto_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE resto_customers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON resto_customers;
CREATE POLICY tenant_isolation ON resto_customers
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- resto_promotions
ALTER TABLE resto_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE resto_promotions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON resto_promotions;
CREATE POLICY tenant_isolation ON resto_promotions
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- resto_promo_redemptions
ALTER TABLE resto_promo_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE resto_promo_redemptions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON resto_promo_redemptions;
CREATE POLICY tenant_isolation ON resto_promo_redemptions
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- resto_loyalty_ledger
ALTER TABLE resto_loyalty_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE resto_loyalty_ledger FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON resto_loyalty_ledger;
CREATE POLICY tenant_isolation ON resto_loyalty_ledger
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
