-- HR v2 (port domain model từ frappe/hrms — Employee, Attendance, Leave*)
CREATE TABLE IF NOT EXISTS hr_employees (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  user_id       uuid,                              -- link tài khoản Citadel (nullable)
  full_name     varchar(120) NOT NULL,
  role_title    varchar(80) NOT NULL DEFAULT 'Nhân viên',
  phone         varchar(20),
  joined_date   date,
  status        varchar(16) NOT NULL DEFAULT 'active',   -- active | inactive
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hr_emp_org_idx ON hr_employees(org_id, status);

CREATE TABLE IF NOT EXISTS hr_attendance (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  employee_id   uuid NOT NULL REFERENCES hr_employees(id),
  att_date      date NOT NULL,
  check_in      timestamptz,
  check_out     timestamptz,
  working_hours numeric(5,2) NOT NULL DEFAULT 0,
  status        varchar(16) NOT NULL DEFAULT 'present',  -- present | absent | on_leave | half_day
  late_entry    boolean NOT NULL DEFAULT false,
  shift_id      uuid,                                    -- link hr_shifts (nullable)
  note          text,
  UNIQUE (org_id, employee_id, att_date)
);
CREATE INDEX IF NOT EXISTS hr_att_org_date_idx ON hr_attendance(org_id, att_date);

CREATE TABLE IF NOT EXISTS hr_leave_types (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  name          varchar(80) NOT NULL,
  days_per_year numeric(5,1) NOT NULL DEFAULT 12,
  is_paid       boolean NOT NULL DEFAULT true,           -- đảo của is_lwp (hrms)
  carry_forward boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE TABLE IF NOT EXISTS hr_leave_allocations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL,
  employee_id    uuid NOT NULL REFERENCES hr_employees(id),
  leave_type_id  uuid NOT NULL REFERENCES hr_leave_types(id),
  year           integer NOT NULL,
  allocated_days numeric(5,1) NOT NULL,
  used_days      numeric(5,1) NOT NULL DEFAULT 0,
  UNIQUE (org_id, employee_id, leave_type_id, year)
);

CREATE TABLE IF NOT EXISTS hr_leave_applications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL,
  employee_id    uuid NOT NULL REFERENCES hr_employees(id),
  leave_type_id  uuid NOT NULL REFERENCES hr_leave_types(id),
  from_date      date NOT NULL,
  to_date        date NOT NULL,
  half_day       boolean NOT NULL DEFAULT false,
  total_days     numeric(5,1) NOT NULL,
  reason         text,
  status         varchar(16) NOT NULL DEFAULT 'open',    -- open | approved | rejected | cancelled
  approver_user_id uuid,
  decided_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hr_lap_org_status_idx ON hr_leave_applications(org_id, status);
