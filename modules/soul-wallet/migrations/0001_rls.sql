-- ============================================================================
-- SOUL-WALLET 1A — 0001_rls.sql
-- RLS fail-closed trên TOÀN BỘ 25 bảng — giáp lớp 2 (defense-in-depth).
-- policy: org_id = current_setting('app.current_org_id')::uuid
--
-- LƯU Ý VẬN HÀNH (đã audit host thật): role kết nối của host hiện BYPASSRLS
-- và host chưa set app.current_org_id → hàng rào CHÍNH là app-level:
-- mọi service của module lọc (org_id, owner_user_id) lấy từ JWT qua ctx.
-- RLS này phát huy khi chạy role thường (như test PGlite role citadel_app)
-- hoặc khi host bật session var trong tương lai — fail-closed, không fail-open.
-- ============================================================================

ALTER TABLE sw_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sw_accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sw_accounts;
CREATE POLICY tenant_isolation ON sw_accounts
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

ALTER TABLE sw_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sw_contacts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sw_contacts;
CREATE POLICY tenant_isolation ON sw_contacts
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

ALTER TABLE sw_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE sw_categories FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sw_categories;
CREATE POLICY tenant_isolation ON sw_categories
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

ALTER TABLE sw_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE sw_tags FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sw_tags;
CREATE POLICY tenant_isolation ON sw_tags
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

ALTER TABLE sw_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sw_transactions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sw_transactions;
CREATE POLICY tenant_isolation ON sw_transactions
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

ALTER TABLE sw_transaction_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE sw_transaction_splits FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sw_transaction_splits;
CREATE POLICY tenant_isolation ON sw_transaction_splits
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

ALTER TABLE sw_transaction_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE sw_transaction_tags FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sw_transaction_tags;
CREATE POLICY tenant_isolation ON sw_transaction_tags
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

ALTER TABLE sw_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE sw_ledger_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sw_ledger_entries;
CREATE POLICY tenant_isolation ON sw_ledger_entries
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

ALTER TABLE sw_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sw_attachments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sw_attachments;
CREATE POLICY tenant_isolation ON sw_attachments
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

ALTER TABLE sw_audit_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE sw_audit_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sw_audit_entries;
CREATE POLICY tenant_isolation ON sw_audit_entries
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

ALTER TABLE sw_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE sw_budgets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sw_budgets;
CREATE POLICY tenant_isolation ON sw_budgets
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

ALTER TABLE sw_budget_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE sw_budget_periods FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sw_budget_periods;
CREATE POLICY tenant_isolation ON sw_budget_periods
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

ALTER TABLE sw_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE sw_goals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sw_goals;
CREATE POLICY tenant_isolation ON sw_goals
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

ALTER TABLE sw_goal_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sw_goal_contributions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sw_goal_contributions;
CREATE POLICY tenant_isolation ON sw_goal_contributions
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

ALTER TABLE sw_debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sw_debts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sw_debts;
CREATE POLICY tenant_isolation ON sw_debts
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

ALTER TABLE sw_debt_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sw_debt_payments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sw_debt_payments;
CREATE POLICY tenant_isolation ON sw_debt_payments
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

ALTER TABLE sw_recurring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE sw_recurring_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sw_recurring_rules;
CREATE POLICY tenant_isolation ON sw_recurring_rules
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

ALTER TABLE sw_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE sw_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sw_rules;
CREATE POLICY tenant_isolation ON sw_rules
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

ALTER TABLE sw_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sw_import_jobs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sw_import_jobs;
CREATE POLICY tenant_isolation ON sw_import_jobs
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

ALTER TABLE sw_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE sw_import_rows FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sw_import_rows;
CREATE POLICY tenant_isolation ON sw_import_rows
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

ALTER TABLE sw_doc_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE sw_doc_counters FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sw_doc_counters;
CREATE POLICY tenant_isolation ON sw_doc_counters
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

ALTER TABLE sw_snapshots_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE sw_snapshots_daily FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sw_snapshots_daily;
CREATE POLICY tenant_isolation ON sw_snapshots_daily
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

ALTER TABLE sw_monthly_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE sw_monthly_summary FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sw_monthly_summary;
CREATE POLICY tenant_isolation ON sw_monthly_summary
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

ALTER TABLE sw_category_month_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE sw_category_month_summary FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sw_category_month_summary;
CREATE POLICY tenant_isolation ON sw_category_month_summary
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

ALTER TABLE sw_networth_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE sw_networth_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sw_networth_snapshots;
CREATE POLICY tenant_isolation ON sw_networth_snapshots
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
