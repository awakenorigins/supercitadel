-- ============================================================
-- MODULE KHO — Migration 0001_rls
-- Cô lập tenant tận tầng database (Hiến pháp #1, §06 Multi-tenant RLS)
-- policy: org_id = current_setting('app.current_org_id')::uuid
-- FORCE RLS: cả owner của bảng cũng bị chặn. Fail closed.
-- LƯU Ý VẬN HÀNH: app phải kết nối bằng role KHÔNG PHẢI superuser
-- (superuser luôn bypass RLS bất kể FORCE).
-- ============================================================

-- kho_items
ALTER TABLE kho_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE kho_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON kho_items;
CREATE POLICY tenant_isolation ON kho_items
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- kho_locations
ALTER TABLE kho_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE kho_locations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON kho_locations;
CREATE POLICY tenant_isolation ON kho_locations
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- kho_stock_levels
ALTER TABLE kho_stock_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE kho_stock_levels FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON kho_stock_levels;
CREATE POLICY tenant_isolation ON kho_stock_levels
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- kho_movements
ALTER TABLE kho_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE kho_movements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON kho_movements;
CREATE POLICY tenant_isolation ON kho_movements
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- kho_reservations
ALTER TABLE kho_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE kho_reservations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON kho_reservations;
CREATE POLICY tenant_isolation ON kho_reservations
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- kho_stocktakes
ALTER TABLE kho_stocktakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE kho_stocktakes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON kho_stocktakes;
CREATE POLICY tenant_isolation ON kho_stocktakes
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- kho_stocktake_lines
ALTER TABLE kho_stocktake_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE kho_stocktake_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON kho_stocktake_lines;
CREATE POLICY tenant_isolation ON kho_stocktake_lines
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- kho_lots (Soul-Inventory v1.1)
ALTER TABLE kho_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE kho_lots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON kho_lots;
CREATE POLICY tenant_isolation ON kho_lots
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
