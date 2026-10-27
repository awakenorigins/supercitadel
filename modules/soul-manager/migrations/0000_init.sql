-- ============================================================
-- SOUL-MANAGER — Migration 0000_init
-- Hợp đồng Citadel mặt cắt ④: MỌI bảng có id, org_id (+index), timestamps.
-- Hiến pháp #5: tiền/lương dùng numeric — không vùng xám.
-- Idempotent: IF NOT EXISTS toàn bộ.
-- ============================================================

-- ── Cấu hình HR theo org (chính sách pháp lý configurable) ──
CREATE TABLE IF NOT EXISTS sm_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  standard_work_days numeric(5,2) NOT NULL DEFAULT 26,
  work_hours_per_day numeric(4,2) NOT NULL DEFAULT 8,
  default_region integer NOT NULL DEFAULT 1,
  policy jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sm_settings_org_uq ON sm_settings (org_id);
CREATE INDEX IF NOT EXISTS sm_settings_org_idx ON sm_settings (org_id);

-- ── Cơ cấu tổ chức ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sm_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  parent_id uuid REFERENCES sm_departments(id),
  manager_id uuid,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sm_departments_org_code_uq ON sm_departments (org_id, code);
CREATE INDEX IF NOT EXISTS sm_departments_org_idx ON sm_departments (org_id);
CREATE INDEX IF NOT EXISTS sm_departments_org_parent_idx ON sm_departments (org_id, parent_id);

CREATE TABLE IF NOT EXISTS sm_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  code text NOT NULL,
  title text NOT NULL,
  level integer,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sm_positions_org_code_uq ON sm_positions (org_id, code);
CREATE INDEX IF NOT EXISTS sm_positions_org_idx ON sm_positions (org_id);

-- ── Hồ sơ nhân viên ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sm_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  code text NOT NULL,
  full_name text NOT NULL,
  dob date,
  gender text CHECK (gender IN ('nam','nu','khac')),
  national_id text,          -- CCCD
  tax_code text,             -- MST cá nhân
  si_number text,            -- mã số BHXH
  address text,
  phone text,
  email text,
  department_id uuid REFERENCES sm_departments(id),
  position_id uuid REFERENCES sm_positions(id),
  manager_id uuid,           -- quản lý trực tiếp (employee id, không FK để tránh vòng)
  hire_date date NOT NULL,
  probation_end date,
  status text NOT NULL DEFAULT 'probation'
    CHECK (status IN ('probation','active','on_leave','terminated')),
  contract_type text NOT NULL DEFAULT 'probation'
    CHECK (contract_type IN ('probation','fixed_term','indefinite','seasonal')),
  base_salary numeric(15,2) NOT NULL DEFAULT 0,
  insurance_salary numeric(15,2),   -- lương làm căn cứ đóng BHXH (null = dùng base_salary)
  work_region integer,              -- vùng lương tối thiểu 1-4 (null = settings.default_region)
  emergency_contact_name text,
  emergency_contact_phone text,
  terminated_at date,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sm_employees_org_code_uq ON sm_employees (org_id, code);
CREATE INDEX IF NOT EXISTS sm_employees_org_idx ON sm_employees (org_id);
CREATE INDEX IF NOT EXISTS sm_employees_org_dept_idx ON sm_employees (org_id, department_id);
CREATE INDEX IF NOT EXISTS sm_employees_org_status_idx ON sm_employees (org_id, status);

CREATE TABLE IF NOT EXISTS sm_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES sm_employees(id),
  contract_no text NOT NULL,
  type text NOT NULL CHECK (type IN ('probation','fixed_term','indefinite','seasonal')),
  start_date date NOT NULL,
  end_date date,
  base_salary numeric(15,2) NOT NULL,
  insurance_salary numeric(15,2),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','terminated')),
  signed_date date,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sm_contracts_org_no_uq ON sm_contracts (org_id, contract_no);
CREATE INDEX IF NOT EXISTS sm_contracts_org_idx ON sm_contracts (org_id);
CREATE INDEX IF NOT EXISTS sm_contracts_org_emp_idx ON sm_contracts (org_id, employee_id);

CREATE TABLE IF NOT EXISTS sm_dependents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES sm_employees(id),
  full_name text NOT NULL,
  relationship text NOT NULL,   -- con / vợ / chồng / cha / mẹ ...
  dob date,
  tax_code text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sm_dependents_org_idx ON sm_dependents (org_id);
CREATE INDEX IF NOT EXISTS sm_dependents_org_emp_idx ON sm_dependents (org_id, employee_id);

CREATE TABLE IF NOT EXISTS sm_allowances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES sm_employees(id),
  name text NOT NULL,              -- ăn trưa / xăng xe / trách nhiệm ...
  amount numeric(15,2) NOT NULL,
  taxable boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sm_allowances_org_idx ON sm_allowances (org_id);
CREATE INDEX IF NOT EXISTS sm_allowances_org_emp_idx ON sm_allowances (org_id, employee_id);

-- ── Chấm công ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sm_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  break_minutes integer NOT NULL DEFAULT 60,
  work_hours numeric(4,2) NOT NULL DEFAULT 8,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sm_shifts_org_code_uq ON sm_shifts (org_id, code);
CREATE INDEX IF NOT EXISTS sm_shifts_org_idx ON sm_shifts (org_id);

CREATE TABLE IF NOT EXISTS sm_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES sm_employees(id),
  work_date date NOT NULL,
  shift_id uuid REFERENCES sm_shifts(id),
  check_in timestamptz,
  check_out timestamptz,
  work_days numeric(3,2) NOT NULL DEFAULT 1,    -- 1 công, 0.5 nửa công, 0
  ot_weekday_hours numeric(5,2) NOT NULL DEFAULT 0,
  ot_weekend_hours numeric(5,2) NOT NULL DEFAULT 0,
  ot_holiday_hours numeric(5,2) NOT NULL DEFAULT 0,
  late_minutes integer NOT NULL DEFAULT 0,
  early_minutes integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'present'
    CHECK (status IN ('present','half_day','absent','leave','holiday')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sm_attendance_org_emp_date_uq ON sm_attendance (org_id, employee_id, work_date);
CREATE INDEX IF NOT EXISTS sm_attendance_org_idx ON sm_attendance (org_id);
CREATE INDEX IF NOT EXISTS sm_attendance_org_date_idx ON sm_attendance (org_id, work_date);

-- ── Nghỉ phép ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sm_leave_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  code text NOT NULL,          -- PHEP-NAM / OM / THAI-SAN / KHONG-LUONG
  name text NOT NULL,
  paid boolean NOT NULL DEFAULT true,
  annual_quota numeric(5,2),   -- null = không trừ quota (ốm/thai sản theo BHXH)
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sm_leave_types_org_code_uq ON sm_leave_types (org_id, code);
CREATE INDEX IF NOT EXISTS sm_leave_types_org_idx ON sm_leave_types (org_id);

CREATE TABLE IF NOT EXISTS sm_leave_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES sm_employees(id),
  leave_type_id uuid NOT NULL REFERENCES sm_leave_types(id),
  year integer NOT NULL,
  entitled numeric(5,2) NOT NULL DEFAULT 0,
  used numeric(5,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sm_leave_balances_uq ON sm_leave_balances (org_id, employee_id, leave_type_id, year);
CREATE INDEX IF NOT EXISTS sm_leave_balances_org_idx ON sm_leave_balances (org_id);

CREATE TABLE IF NOT EXISTS sm_leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES sm_employees(id),
  leave_type_id uuid NOT NULL REFERENCES sm_leave_types(id),
  start_date date NOT NULL,
  end_date date NOT NULL,
  days numeric(5,2) NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','cancelled')),
  approver_id uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sm_leave_requests_org_idx ON sm_leave_requests (org_id);
CREATE INDEX IF NOT EXISTS sm_leave_requests_org_emp_idx ON sm_leave_requests (org_id, employee_id);
CREATE INDEX IF NOT EXISTS sm_leave_requests_org_status_idx ON sm_leave_requests (org_id, status);

-- ── Bảng lương ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sm_payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','calculated','approved','paid')),
  standard_work_days numeric(5,2) NOT NULL DEFAULT 26,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sm_payroll_periods_uq ON sm_payroll_periods (org_id, year, month);
CREATE INDEX IF NOT EXISTS sm_payroll_periods_org_idx ON sm_payroll_periods (org_id);

CREATE TABLE IF NOT EXISTS sm_payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  period_id uuid NOT NULL REFERENCES sm_payroll_periods(id),
  employee_id uuid NOT NULL REFERENCES sm_employees(id),
  base_salary numeric(15,2) NOT NULL,
  standard_work_days numeric(5,2) NOT NULL,
  worked_days numeric(5,2) NOT NULL DEFAULT 0,
  paid_leave_days numeric(5,2) NOT NULL DEFAULT 0,
  paid_days numeric(5,2) NOT NULL DEFAULT 0,
  salary_by_days numeric(15,2) NOT NULL DEFAULT 0,
  allowance_taxable numeric(15,2) NOT NULL DEFAULT 0,
  allowance_nontaxable numeric(15,2) NOT NULL DEFAULT 0,
  ot_hours numeric(6,2) NOT NULL DEFAULT 0,
  ot_pay numeric(15,2) NOT NULL DEFAULT 0,
  ot_tax_exempt numeric(15,2) NOT NULL DEFAULT 0,   -- phần phụ trội OT miễn thuế
  gross numeric(15,2) NOT NULL DEFAULT 0,
  insurance_base numeric(15,2) NOT NULL DEFAULT 0,  -- căn cứ BHXH+BHYT (trần 20×tham chiếu)
  ui_base numeric(15,2) NOT NULL DEFAULT 0,         -- căn cứ BHTN (trần 20×LTT vùng)
  si_amount numeric(15,2) NOT NULL DEFAULT 0,
  hi_amount numeric(15,2) NOT NULL DEFAULT 0,
  ui_amount numeric(15,2) NOT NULL DEFAULT 0,
  insurance_total numeric(15,2) NOT NULL DEFAULT 0,
  dependents_count integer NOT NULL DEFAULT 0,
  personal_deduction numeric(15,2) NOT NULL DEFAULT 0,
  dependent_deduction numeric(15,2) NOT NULL DEFAULT 0,
  taxable_income numeric(15,2) NOT NULL DEFAULT 0,      -- thu nhập chịu thuế
  assessable_income numeric(15,2) NOT NULL DEFAULT 0,   -- thu nhập tính thuế
  pit numeric(15,2) NOT NULL DEFAULT 0,
  other_deductions numeric(15,2) NOT NULL DEFAULT 0,
  net numeric(15,2) NOT NULL DEFAULT 0,
  breakdown jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sm_payslips_uq ON sm_payslips (org_id, period_id, employee_id);
CREATE INDEX IF NOT EXISTS sm_payslips_org_idx ON sm_payslips (org_id);

-- ── Tuyển dụng ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sm_job_openings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  title text NOT NULL,
  department_id uuid REFERENCES sm_departments(id),
  headcount integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sm_job_openings_org_idx ON sm_job_openings (org_id);

CREATE TABLE IF NOT EXISTS sm_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  opening_id uuid NOT NULL REFERENCES sm_job_openings(id),
  full_name text NOT NULL,
  email text,
  phone text,
  stage text NOT NULL DEFAULT 'applied'
    CHECK (stage IN ('applied','screening','interview','offer','hired','rejected')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sm_candidates_org_idx ON sm_candidates (org_id);
CREATE INDEX IF NOT EXISTS sm_candidates_org_opening_idx ON sm_candidates (org_id, opening_id);
CREATE INDEX IF NOT EXISTS sm_candidates_org_stage_idx ON sm_candidates (org_id, stage);

-- ── Đào tạo ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sm_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  hours numeric(5,1),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sm_courses_org_code_uq ON sm_courses (org_id, code);
CREATE INDEX IF NOT EXISTS sm_courses_org_idx ON sm_courses (org_id);

CREATE TABLE IF NOT EXISTS sm_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  course_id uuid NOT NULL REFERENCES sm_courses(id),
  employee_id uuid NOT NULL REFERENCES sm_employees(id),
  status text NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled','completed','dropped')),
  score numeric(5,2),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sm_enrollments_uq ON sm_enrollments (org_id, course_id, employee_id);
CREATE INDEX IF NOT EXISTS sm_enrollments_org_idx ON sm_enrollments (org_id);
