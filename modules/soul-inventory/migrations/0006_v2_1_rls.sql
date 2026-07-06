-- ============================================================
-- SOUL-INVENTORY v2.1 — Migration 0006: FORCE RLS cho bảng automation
-- Fail-closed tuyệt đối: org_id = current_setting('app.current_org_id')::uuid
-- ============================================================

ALTER TABLE kho_demand_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE kho_demand_stats FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON kho_demand_stats;
CREATE POLICY tenant_isolation ON kho_demand_stats
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

ALTER TABLE kho_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE kho_forecasts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON kho_forecasts;
CREATE POLICY tenant_isolation ON kho_forecasts
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

ALTER TABLE kho_replenish_params ENABLE ROW LEVEL SECURITY;
ALTER TABLE kho_replenish_params FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON kho_replenish_params;
CREATE POLICY tenant_isolation ON kho_replenish_params
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

ALTER TABLE kho_automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kho_automation_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON kho_automation_runs;
CREATE POLICY tenant_isolation ON kho_automation_runs
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
