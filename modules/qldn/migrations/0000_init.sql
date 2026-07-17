-- ============================================================
-- QLDN V1A — Migration khởi tạo (0000_init)
-- Schema riêng `qldn`, enums, 17 bảng. Khớp 1-1 với server/schema.ts.
-- An toàn chạy lại: IF NOT EXISTS ở mọi nơi có thể.
-- Gỡ module = DROP SCHEMA qldn CASCADE.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS qldn;

-- ---------- ENUMS ----------
DO $$ BEGIN
  CREATE TYPE qldn.contract_type AS ENUM ('HDLD','HDTV','CTV');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE qldn.employee_status AS ENUM ('active','inactive','terminated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE qldn.payroll_scheme AS ENUM ('OFFICIAL','INTERNAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE qldn.payroll_status AS ENUM ('draft','calculated','approved','paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE qldn.timesheet_source AS ENUM ('manual','machine','import');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE qldn.contractor_kind AS ENUM ('ctv','gia_cong','cong_tac');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE qldn.forecast_doc_type AS ENUM ('OPN','AR','AP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE qldn.forecast_status AS ENUM ('open','settled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE qldn.period_status AS ENUM ('open','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Domain D: CẤU HÌNH ----------
CREATE TABLE IF NOT EXISTS qldn.periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  code VARCHAR(10) NOT NULL,
  name VARCHAR(40) NOT NULL,
  standard_days NUMERIC(6,2) NOT NULL DEFAULT 26,
  status qldn.period_status NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS qldn_periods_org_code_uq ON qldn.periods (org_id, code);

CREATE TABLE IF NOT EXISTS qldn.policy_params (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  effective_from DATE NOT NULL,
  ins_company_bp INTEGER NOT NULL DEFAULT 2150,
  kpcd_bp INTEGER NOT NULL DEFAULT 200,
  ins_employee_bp INTEGER NOT NULL DEFAULT 1050,
  union_fee_bp INTEGER NOT NULL DEFAULT 50,
  deduction_personal NUMERIC(20,2) NOT NULL DEFAULT 15500000,
  deduction_dependent NUMERIC(20,2) NOT NULL DEFAULT 6200000,
  uniform_cap_year NUMERIC(20,2) NOT NULL DEFAULT 5000000,
  meal_exempt_cap_monthly NUMERIC(20,2),
  apply_union_fee BOOLEAN NOT NULL DEFAULT false,
  insurance_min_days NUMERIC(6,2) NOT NULL DEFAULT 14,
  hdtv_factor_bp INTEGER NOT NULL DEFAULT 8500,
  ctv_pit_bp INTEGER NOT NULL DEFAULT 1000,
  ot_rates JSONB NOT NULL DEFAULT '{"ot150":1.5,"ot170":1.7,"ot200":2.0}',
  pit_brackets JSONB NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qldn_policy_org_eff_idx ON qldn.policy_params (org_id, effective_from);

CREATE TABLE IF NOT EXISTS qldn.import_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  kind VARCHAR(30) NOT NULL,
  name VARCHAR(120) NOT NULL,
  mapping JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qldn_import_maps_org_kind_idx ON qldn.import_maps (org_id, kind);

-- ---------- Domain A: HR-PAYROLL ----------
CREATE TABLE IF NOT EXISTS qldn.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  code_official VARCHAR(20),
  code_internal VARCHAR(20),
  full_name VARCHAR(120) NOT NULL,
  contract_type qldn.contract_type NOT NULL DEFAULT 'HDLD',
  position VARCHAR(80),
  department VARCHAR(80),
  unit VARCHAR(80),
  dependents_count INTEGER NOT NULL DEFAULT 0,
  bhxh_enrolled BOOLEAN NOT NULL DEFAULT false,
  bank_account VARCHAR(40),
  bank_name VARCHAR(120),
  tax_code VARCHAR(20),
  id_number VARCHAR(20),
  joined_date DATE,
  status qldn.employee_status NOT NULL DEFAULT 'active',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qldn_emp_org_status_idx ON qldn.employees (org_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS qldn_emp_org_code_off_uq ON qldn.employees (org_id, code_official);

CREATE TABLE IF NOT EXISTS qldn.salary_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  effective_from DATE NOT NULL,
  bhxh_salary NUMERIC(20,2) NOT NULL DEFAULT 0,
  base_salary NUMERIC(20,2) NOT NULL DEFAULT 0,
  base_salary_internal NUMERIC(20,2) NOT NULL DEFAULT 0,
  allow_responsibility NUMERIC(20,2) NOT NULL DEFAULT 0,
  allow_meal NUMERIC(20,2) NOT NULL DEFAULT 0,
  allow_fuel NUMERIC(20,2) NOT NULL DEFAULT 0,
  allow_phone NUMERIC(20,2) NOT NULL DEFAULT 0,
  allow_uniform NUMERIC(20,2) NOT NULL DEFAULT 0,
  allow_creative NUMERIC(20,2) NOT NULL DEFAULT 0,
  allow_skill NUMERIC(20,2) NOT NULL DEFAULT 0,
  allow_position NUMERIC(20,2) NOT NULL DEFAULT 0,
  allow_other NUMERIC(20,2) NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qldn_salprof_org_emp_eff_idx ON qldn.salary_profiles (org_id, employee_id, effective_from);

CREATE TABLE IF NOT EXISTS qldn.timesheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  period_id UUID NOT NULL,
  work_days NUMERIC(6,2) NOT NULL DEFAULT 0,
  paid_leave_days NUMERIC(6,2) NOT NULL DEFAULT 0,
  unpaid_days NUMERIC(6,2) NOT NULL DEFAULT 0,
  ot150_hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  ot170_hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  ot200_hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  late_count INTEGER NOT NULL DEFAULT 0,
  late_minutes INTEGER NOT NULL DEFAULT 0,
  total_hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  source qldn.timesheet_source NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS qldn_ts_org_emp_period_uq ON qldn.timesheets (org_id, employee_id, period_id);
CREATE INDEX IF NOT EXISTS qldn_ts_org_period_idx ON qldn.timesheets (org_id, period_id);

CREATE TABLE IF NOT EXISTS qldn.timesheet_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  timesheet_id UUID NOT NULL,
  day DATE NOT NULL,
  symbol VARCHAR(8),
  hours_in_out JSONB,
  work_hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  ot_hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  note TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS qldn_tsd_org_ts_day_uq ON qldn.timesheet_days (org_id, timesheet_id, day);

CREATE TABLE IF NOT EXISTS qldn.payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  period_id UUID NOT NULL,
  scheme qldn.payroll_scheme NOT NULL,
  status qldn.payroll_status NOT NULL DEFAULT 'draft',
  standard_days NUMERIC(6,2) NOT NULL DEFAULT 26,
  policy_params_id UUID,
  calculated_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS qldn_pr_org_period_scheme_uq ON qldn.payroll_runs (org_id, period_id, scheme);

CREATE TABLE IF NOT EXISTS qldn.payroll_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  run_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  work_pay NUMERIC(20,2) NOT NULL DEFAULT 0,
  allowance_pay NUMERIC(20,2) NOT NULL DEFAULT 0,
  ot_pay NUMERIC(20,2) NOT NULL DEFAULT 0,
  leave_pay NUMERIC(20,2) NOT NULL DEFAULT 0,
  bonus NUMERIC(20,2) NOT NULL DEFAULT 0,
  commission NUMERIC(20,2) NOT NULL DEFAULT 0,
  gross NUMERIC(20,2) NOT NULL DEFAULT 0,
  tax_exempt_total NUMERIC(20,2) NOT NULL DEFAULT 0,
  insurance_company NUMERIC(20,2) NOT NULL DEFAULT 0,
  insurance_employee NUMERIC(20,2) NOT NULL DEFAULT 0,
  union_fee NUMERIC(20,2) NOT NULL DEFAULT 0,
  deduction_personal NUMERIC(20,2) NOT NULL DEFAULT 0,
  deduction_dependents NUMERIC(20,2) NOT NULL DEFAULT 0,
  taxable_income NUMERIC(20,2) NOT NULL DEFAULT 0,
  pit NUMERIC(20,2) NOT NULL DEFAULT 0,
  advance_deduct NUMERIC(20,2) NOT NULL DEFAULT 0,
  other_deduct NUMERIC(20,2) NOT NULL DEFAULT 0,
  net_pay NUMERIC(20,2) NOT NULL DEFAULT 0,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS qldn_pl_org_run_emp_uq ON qldn.payroll_lines (org_id, run_id, employee_id);
CREATE INDEX IF NOT EXISTS qldn_pl_org_run_idx ON qldn.payroll_lines (org_id, run_id);

CREATE TABLE IF NOT EXISTS qldn.commission_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  role_key VARCHAR(60) NOT NULL,
  rate_bp INTEGER NOT NULL DEFAULT 0,
  threshold_amount NUMERIC(20,2),
  over_rate_bp INTEGER,
  effective_from DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qldn_cr_org_role_eff_idx ON qldn.commission_rules (org_id, role_key, effective_from);

CREATE TABLE IF NOT EXISTS qldn.sales_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  order_code VARCHAR(30) NOT NULL,
  customer VARCHAR(160),
  contract_no VARCHAR(60),
  revenue NUMERIC(20,2) NOT NULL DEFAULT 0,
  entry_date DATE NOT NULL,
  owner_employee_id UUID,
  period_id UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qldn_se_org_order_idx ON qldn.sales_entries (org_id, order_code);
CREATE INDEX IF NOT EXISTS qldn_se_org_period_idx ON qldn.sales_entries (org_id, period_id);

CREATE TABLE IF NOT EXISTS qldn.contractor_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  period_id UUID,
  contractor_name VARCHAR(160) NOT NULL,
  tax_code VARCHAR(20),
  id_number VARCHAR(20),
  kind qldn.contractor_kind NOT NULL DEFAULT 'ctv',
  qty NUMERIC(12,2),
  unit_price NUMERIC(20,2),
  gross_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  pit_withheld NUMERIC(20,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  paid_at DATE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qldn_ctr_org_period_idx ON qldn.contractor_payments (org_id, period_id);

CREATE TABLE IF NOT EXISTS qldn.payout_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  run_id UUID NOT NULL,
  bank_file_ref VARCHAR(200),
  lines JSONB NOT NULL DEFAULT '[]',
  total_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'draft',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qldn_pb_org_run_idx ON qldn.payout_batches (org_id, run_id);

CREATE TABLE IF NOT EXISTS qldn.payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  run_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  period_code VARCHAR(10) NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS qldn_ps_org_run_emp_uq ON qldn.payslips (org_id, run_id, employee_id);

-- ---------- Domain C: FORECAST ----------
CREATE TABLE IF NOT EXISTS qldn.forecast_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  doc_no VARCHAR(60),
  doc_type qldn.forecast_doc_type NOT NULL,
  due_date DATE NOT NULL,
  description TEXT,
  inflow NUMERIC(20,2) NOT NULL DEFAULT 0,
  outflow NUMERIC(20,2) NOT NULL DEFAULT 0,
  source_ref VARCHAR(80),
  status qldn.forecast_status NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qldn_fl_org_due_idx ON qldn.forecast_lines (org_id, due_date);
CREATE INDEX IF NOT EXISTS qldn_fl_org_status_idx ON qldn.forecast_lines (org_id, status);

CREATE TABLE IF NOT EXISTS qldn.ar_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  order_code VARCHAR(30) NOT NULL,
  customer VARCHAR(160),
  installment_no INTEGER NOT NULL DEFAULT 1,
  amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  due_date DATE,
  received_at DATE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qldn_ar_org_order_idx ON qldn.ar_schedule (org_id, order_code);

CREATE TABLE IF NOT EXISTS qldn.ap_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  vendor VARCHAR(160) NOT NULL,
  doc_no VARCHAR(60),
  amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  due_date DATE,
  paid_at DATE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qldn_ap_org_vendor_idx ON qldn.ap_schedule (org_id, vendor);
