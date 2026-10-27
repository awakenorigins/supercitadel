-- ============================================================
-- SOUL-RESTAURANT v1.0 — Migration 0001: FORCE RLS cho 18 bảng
-- Fail-closed tuyệt đối: org_id = current_setting('app.current_org_id')::uuid
-- KHÔNG coalesce fallback (bài học R9). App kết nối role KHÔNG superuser.
-- current_setting thiếu biến → query LỖI (chặn), không bao giờ mở.
-- ============================================================

-- resto_areas
ALTER TABLE resto_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE resto_areas FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON resto_areas;
CREATE POLICY tenant_isolation ON resto_areas
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- resto_tables
ALTER TABLE resto_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE resto_tables FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON resto_tables;
CREATE POLICY tenant_isolation ON resto_tables
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- resto_stations
ALTER TABLE resto_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE resto_stations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON resto_stations;
CREATE POLICY tenant_isolation ON resto_stations
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- resto_menu_categories
ALTER TABLE resto_menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE resto_menu_categories FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON resto_menu_categories;
CREATE POLICY tenant_isolation ON resto_menu_categories
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- resto_menu_items
ALTER TABLE resto_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE resto_menu_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON resto_menu_items;
CREATE POLICY tenant_isolation ON resto_menu_items
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- resto_option_groups
ALTER TABLE resto_option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE resto_option_groups FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON resto_option_groups;
CREATE POLICY tenant_isolation ON resto_option_groups
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- resto_options
ALTER TABLE resto_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE resto_options FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON resto_options;
CREATE POLICY tenant_isolation ON resto_options
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- resto_item_option_groups
ALTER TABLE resto_item_option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE resto_item_option_groups FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON resto_item_option_groups;
CREATE POLICY tenant_isolation ON resto_item_option_groups
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- resto_combo_items
ALTER TABLE resto_combo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE resto_combo_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON resto_combo_items;
CREATE POLICY tenant_isolation ON resto_combo_items
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- resto_recipes
ALTER TABLE resto_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE resto_recipes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON resto_recipes;
CREATE POLICY tenant_isolation ON resto_recipes
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- resto_orders
ALTER TABLE resto_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE resto_orders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON resto_orders;
CREATE POLICY tenant_isolation ON resto_orders
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- resto_order_items
ALTER TABLE resto_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE resto_order_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON resto_order_items;
CREATE POLICY tenant_isolation ON resto_order_items
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- resto_kots
ALTER TABLE resto_kots ENABLE ROW LEVEL SECURITY;
ALTER TABLE resto_kots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON resto_kots;
CREATE POLICY tenant_isolation ON resto_kots
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- resto_bills
ALTER TABLE resto_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE resto_bills FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON resto_bills;
CREATE POLICY tenant_isolation ON resto_bills
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- resto_bill_items
ALTER TABLE resto_bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE resto_bill_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON resto_bill_items;
CREATE POLICY tenant_isolation ON resto_bill_items
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- resto_payments
ALTER TABLE resto_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE resto_payments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON resto_payments;
CREATE POLICY tenant_isolation ON resto_payments
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- resto_reservations
ALTER TABLE resto_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE resto_reservations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON resto_reservations;
CREATE POLICY tenant_isolation ON resto_reservations
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- resto_settings
ALTER TABLE resto_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE resto_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON resto_settings;
CREATE POLICY tenant_isolation ON resto_settings
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
