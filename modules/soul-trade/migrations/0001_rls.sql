-- ============================================================
-- SOUL-TRADE — Migration 0001_rls
-- Tenant isolation at the database layer (Citadel §06 Multi-tenant RLS).
-- FORCE RLS + FAIL CLOSED: no SET org ⇒ error, never leak.
-- App MUST connect as a NON-superuser role (superuser bypasses FORCE RLS).
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['st_settings','st_bots','st_trades','st_decisions','st_backtests'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($f$CREATE POLICY tenant_isolation ON %I
      USING (org_id = current_setting('app.current_org_id')::uuid)
      WITH CHECK (org_id = current_setting('app.current_org_id')::uuid)$f$, t);
  END LOOP;
END $$;
