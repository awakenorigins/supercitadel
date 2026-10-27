-- ============================================================
-- SOUL-MANAGER — Migration 0001_rls
-- Cô lập tenant tận tầng database (Hiến pháp #1, §06 Multi-tenant RLS)
-- policy: org_id = current_setting('app.current_org_id')::uuid
-- FORCE RLS: cả owner của bảng cũng bị chặn. FAIL CLOSED —
-- TUYỆT ĐỐI KHÔNG coalesce fallback: quên SET org ⇒ lỗi, không lộ data.
-- LƯU Ý VẬN HÀNH: app phải kết nối bằng role KHÔNG PHẢI superuser
-- (superuser luôn bypass RLS bất kể FORCE).
-- ============================================================

-- sm_settings
ALTER TABLE sm_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sm_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sm_settings;
CREATE POLICY tenant_isolation ON sm_settings
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- sm_departments
ALTER TABLE sm_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sm_departments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sm_departments;
CREATE POLICY tenant_isolation ON sm_departments
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- sm_positions
ALTER TABLE sm_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sm_positions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sm_positions;
CREATE POLICY tenant_isolation ON sm_positions
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- sm_employees
ALTER TABLE sm_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE sm_employees FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sm_employees;
CREATE POLICY tenant_isolation ON sm_employees
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- sm_contracts
ALTER TABLE sm_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sm_contracts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sm_contracts;
CREATE POLICY tenant_isolation ON sm_contracts
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- sm_dependents
ALTER TABLE sm_dependents ENABLE ROW LEVEL SECURITY;
ALTER TABLE sm_dependents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sm_dependents;
CREATE POLICY tenant_isolation ON sm_dependents
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- sm_allowances
ALTER TABLE sm_allowances ENABLE ROW LEVEL SECURITY;
ALTER TABLE sm_allowances FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sm_allowances;
CREATE POLICY tenant_isolation ON sm_allowances
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- sm_shifts
ALTER TABLE sm_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sm_shifts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sm_shifts;
CREATE POLICY tenant_isolation ON sm_shifts
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- sm_attendance
ALTER TABLE sm_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE sm_attendance FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sm_attendance;
CREATE POLICY tenant_isolation ON sm_attendance
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- sm_leave_types
ALTER TABLE sm_leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE sm_leave_types FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sm_leave_types;
CREATE POLICY tenant_isolation ON sm_leave_types
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- sm_leave_balances
ALTER TABLE sm_leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE sm_leave_balances FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sm_leave_balances;
CREATE POLICY tenant_isolation ON sm_leave_balances
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- sm_leave_requests
ALTER TABLE sm_leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE sm_leave_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sm_leave_requests;
CREATE POLICY tenant_isolation ON sm_leave_requests
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- sm_payroll_periods
ALTER TABLE sm_payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE sm_payroll_periods FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sm_payroll_periods;
CREATE POLICY tenant_isolation ON sm_payroll_periods
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- sm_payslips
ALTER TABLE sm_payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE sm_payslips FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sm_payslips;
CREATE POLICY tenant_isolation ON sm_payslips
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- sm_job_openings
ALTER TABLE sm_job_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sm_job_openings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sm_job_openings;
CREATE POLICY tenant_isolation ON sm_job_openings
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- sm_candidates
ALTER TABLE sm_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sm_candidates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sm_candidates;
CREATE POLICY tenant_isolation ON sm_candidates
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- sm_courses
ALTER TABLE sm_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE sm_courses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sm_courses;
CREATE POLICY tenant_isolation ON sm_courses
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- sm_enrollments
ALTER TABLE sm_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sm_enrollments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sm_enrollments;
CREATE POLICY tenant_isolation ON sm_enrollments
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
