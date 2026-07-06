-- ============================================================
-- SOUL-INVENTORY v2.0 — Migration 0004: FORCE RLS cho bảng mới
-- Fail-closed tuyệt đối: org_id = current_setting('app.current_org_id')::uuid
-- KHÔNG coalesce fallback. App kết nối role KHÔNG superuser.
-- ============================================================

-- kho_item_uoms
ALTER TABLE kho_item_uoms ENABLE ROW LEVEL SECURITY;
ALTER TABLE kho_item_uoms FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON kho_item_uoms;
CREATE POLICY tenant_isolation ON kho_item_uoms
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- kho_boms
ALTER TABLE kho_boms ENABLE ROW LEVEL SECURITY;
ALTER TABLE kho_boms FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON kho_boms;
CREATE POLICY tenant_isolation ON kho_boms
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- kho_bom_lines
ALTER TABLE kho_bom_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE kho_bom_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON kho_bom_lines;
CREATE POLICY tenant_isolation ON kho_bom_lines
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- kho_assembly_orders
ALTER TABLE kho_assembly_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE kho_assembly_orders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON kho_assembly_orders;
CREATE POLICY tenant_isolation ON kho_assembly_orders
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- kho_reorder_rules
ALTER TABLE kho_reorder_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE kho_reorder_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON kho_reorder_rules;
CREATE POLICY tenant_isolation ON kho_reorder_rules
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- kho_landed_costs
ALTER TABLE kho_landed_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kho_landed_costs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON kho_landed_costs;
CREATE POLICY tenant_isolation ON kho_landed_costs
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- kho_landed_cost_lines
ALTER TABLE kho_landed_cost_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE kho_landed_cost_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON kho_landed_cost_lines;
CREATE POLICY tenant_isolation ON kho_landed_cost_lines
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- kho_cost_layers
ALTER TABLE kho_cost_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE kho_cost_layers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON kho_cost_layers;
CREATE POLICY tenant_isolation ON kho_cost_layers
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- kho_doc_counters: bảng đặc biệt (PK là org_id + doc_type, không có id/timestamps
-- vì là counter thuần) — vẫn RLS đầy đủ
ALTER TABLE kho_doc_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE kho_doc_counters FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON kho_doc_counters;
CREATE POLICY tenant_isolation ON kho_doc_counters
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
