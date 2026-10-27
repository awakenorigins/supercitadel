-- QLDN Finance Flow: workflow layer only. Accounting core is reused via soft refs to ketoan10a.*.
CREATE TABLE qfi_payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  request_no varchar(40) NOT NULL,
  request_type varchar(40) NOT NULL,
  requester_id uuid NOT NULL,
  amount numeric(20,2) NOT NULL,
  purpose text,
  document_status varchar(30) NOT NULL DEFAULT 'pending',
  payment_method varchar(30),
  status varchar(30) NOT NULL DEFAULT 'draft',
  workflow_instance_id uuid,
  submitted_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX qfi_payment_requests_org_0_idx ON qfi_payment_requests (org_id, request_no);
CREATE INDEX qfi_payment_requests_org_1_idx ON qfi_payment_requests (org_id, status);
CREATE TABLE qfi_payment_request_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  payment_request_id uuid NOT NULL REFERENCES qfi_payment_requests(id) ON DELETE CASCADE,
  document_type varchar(80) NOT NULL,
  file_id uuid,
  is_required boolean NOT NULL DEFAULT false,
  validation_status varchar(30) NOT NULL DEFAULT 'pending',
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX qfi_payment_request_documents_org_0_idx ON qfi_payment_request_documents (org_id, payment_request_id);
CREATE TABLE qfi_payment_disbursements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  payment_request_id uuid NOT NULL REFERENCES qfi_payment_requests(id) ON DELETE CASCADE,
  method varchar(30) NOT NULL,
  amount numeric(20,2) NOT NULL,
  scheduled_date date,
  paid_at timestamp with time zone,
  recipient_id uuid,
  bank_account_id uuid,
  ketoan10a_payment_id uuid,
  ketoan10a_receipt_id uuid,
  ketoan10a_advance_id uuid,
  status varchar(30) NOT NULL DEFAULT 'scheduled'
);
CREATE INDEX qfi_payment_disbursements_org_0_idx ON qfi_payment_disbursements (org_id, payment_request_id);
CREATE INDEX qfi_payment_disbursements_org_1_idx ON qfi_payment_disbursements (org_id, status);
CREATE TABLE qfi_cash_receipt_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  request_no varchar(40) NOT NULL,
  payer_id uuid,
  amount numeric(20,2) NOT NULL,
  reason text,
  status varchar(30) NOT NULL DEFAULT 'draft',
  submitted_at timestamp with time zone,
  ketoan10a_receipt_id uuid,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX qfi_cash_receipt_requests_org_0_idx ON qfi_cash_receipt_requests (org_id, request_no);
CREATE INDEX qfi_cash_receipt_requests_org_1_idx ON qfi_cash_receipt_requests (org_id, status);
CREATE TABLE qfi_material_receipt_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  report_no varchar(40) NOT NULL,
  site_id uuid,
  commander_id uuid,
  supplier_id uuid,
  period_from date,
  period_to date,
  status varchar(30) NOT NULL DEFAULT 'draft',
  submitted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX qfi_material_receipt_reports_org_0_idx ON qfi_material_receipt_reports (org_id, report_no);
CREATE INDEX qfi_material_receipt_reports_org_1_idx ON qfi_material_receipt_reports (org_id, status);
CREATE TABLE qfi_material_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  material_receipt_report_id uuid NOT NULL REFERENCES qfi_material_receipt_reports(id) ON DELETE CASCADE,
  item_id uuid,
  description text,
  quantity numeric(20,4) NOT NULL DEFAULT 0,
  unit varchar(30),
  accepted_status varchar(30) NOT NULL DEFAULT 'pending',
  amount numeric(20,2) NOT NULL DEFAULT 0,
  note text
);
CREATE INDEX qfi_material_receipt_lines_org_0_idx ON qfi_material_receipt_lines (org_id, material_receipt_report_id);
CREATE TABLE qfi_supplier_debt_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  report_no varchar(40) NOT NULL,
  supplier_id uuid,
  report_type varchar(30) NOT NULL DEFAULT 'summary',
  period_from date,
  period_to date,
  total_amount numeric(20,2) NOT NULL DEFAULT 0,
  status varchar(30) NOT NULL DEFAULT 'draft',
  accounting_owner_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX qfi_supplier_debt_reports_org_0_idx ON qfi_supplier_debt_reports (org_id, supplier_id);
CREATE INDEX qfi_supplier_debt_reports_org_1_idx ON qfi_supplier_debt_reports (org_id, status);
CREATE TABLE qfi_supplier_debt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  supplier_debt_report_id uuid NOT NULL REFERENCES qfi_supplier_debt_reports(id) ON DELETE CASCADE,
  invoice_no varchar(80),
  document_ref varchar(160),
  amount numeric(20,2) NOT NULL DEFAULT 0,
  due_date date,
  reconciled_status varchar(30) NOT NULL DEFAULT 'pending',
  ketoan10a_bill_id uuid,
  note text
);
CREATE INDEX qfi_supplier_debt_lines_org_0_idx ON qfi_supplier_debt_lines (org_id, supplier_debt_report_id);
CREATE TABLE qfi_supplier_payment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  plan_no varchar(40) NOT NULL,
  supplier_id uuid,
  debt_report_id uuid REFERENCES qfi_supplier_debt_reports(id),
  payment_type varchar(40) NOT NULL,
  planned_amount numeric(20,2) NOT NULL,
  planned_date date,
  status varchar(30) NOT NULL DEFAULT 'draft',
  director_id uuid,
  approved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX qfi_supplier_payment_plans_org_0_idx ON qfi_supplier_payment_plans (org_id, supplier_id);
CREATE INDEX qfi_supplier_payment_plans_org_1_idx ON qfi_supplier_payment_plans (org_id, status);
CREATE TABLE qfi_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  payment_request_id uuid REFERENCES qfi_payment_requests(id),
  employee_id uuid,
  advance_amount numeric(20,2) NOT NULL,
  advance_date date,
  settlement_status varchar(30) NOT NULL DEFAULT 'open',
  status varchar(30) NOT NULL DEFAULT 'draft',
  ketoan10a_advance_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX qfi_advances_org_0_idx ON qfi_advances (org_id, employee_id);
CREATE INDEX qfi_advances_org_1_idx ON qfi_advances (org_id, status);
CREATE TABLE qfi_travel_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  business_trip_request_id uuid,
  advance_id uuid REFERENCES qfi_advances(id),
  employee_id uuid NOT NULL,
  advance_amount numeric(20,2) NOT NULL,
  advanced_at timestamp with time zone,
  status varchar(30) NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX qfi_travel_advances_org_0_idx ON qfi_travel_advances (org_id, business_trip_request_id);
CREATE INDEX qfi_travel_advances_org_1_idx ON qfi_travel_advances (org_id, employee_id);
CREATE TABLE qfi_travel_expense_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  claim_no varchar(40) NOT NULL,
  business_trip_request_id uuid,
  employee_id uuid NOT NULL,
  claimed_amount numeric(20,2) NOT NULL DEFAULT 0,
  advance_amount numeric(20,2) NOT NULL DEFAULT 0,
  settlement_amount numeric(20,2) NOT NULL DEFAULT 0,
  settlement_type varchar(30) NOT NULL DEFAULT 'even',
  status varchar(30) NOT NULL DEFAULT 'submitted',
  accountant_id uuid,
  settled_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX qfi_travel_expense_claims_org_0_idx ON qfi_travel_expense_claims (org_id, employee_id);
CREATE INDEX qfi_travel_expense_claims_org_1_idx ON qfi_travel_expense_claims (org_id, status);
CREATE TABLE qfi_travel_expense_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  travel_expense_claim_id uuid NOT NULL REFERENCES qfi_travel_expense_claims(id) ON DELETE CASCADE,
  document_type varchar(80) NOT NULL,
  file_id uuid,
  amount numeric(20,2) NOT NULL DEFAULT 0,
  validation_status varchar(30) NOT NULL DEFAULT 'pending',
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX qfi_travel_expense_documents_org_0_idx ON qfi_travel_expense_documents (org_id, travel_expense_claim_id);
CREATE TABLE qfi_payroll_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  travel_expense_claim_id uuid REFERENCES qfi_travel_expense_claims(id),
  deduction_month varchar(7) NOT NULL,
  amount numeric(20,2) NOT NULL,
  reason text,
  status varchar(30) NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX qfi_payroll_deductions_org_0_idx ON qfi_payroll_deductions (org_id, employee_id);
CREATE INDEX qfi_payroll_deductions_org_1_idx ON qfi_payroll_deductions (org_id, deduction_month);
CREATE TABLE qfi_customer_debt_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  statement_no varchar(40) NOT NULL,
  customer_id uuid,
  period_from date,
  period_to date,
  total_amount numeric(20,2) NOT NULL DEFAULT 0,
  confirmed_amount numeric(20,2) NOT NULL DEFAULT 0,
  status varchar(30) NOT NULL DEFAULT 'draft',
  due_date date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX qfi_customer_debt_statements_org_0_idx ON qfi_customer_debt_statements (org_id, customer_id);
CREATE INDEX qfi_customer_debt_statements_org_1_idx ON qfi_customer_debt_statements (org_id, status);
CREATE TABLE qfi_customer_debt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  customer_debt_statement_id uuid NOT NULL REFERENCES qfi_customer_debt_statements(id) ON DELETE CASCADE,
  invoice_no varchar(80),
  document_ref varchar(160),
  amount numeric(20,2) NOT NULL DEFAULT 0,
  due_date date,
  reconciled_status varchar(30) NOT NULL DEFAULT 'pending',
  ketoan10a_invoice_id uuid,
  note text
);
CREATE INDEX qfi_customer_debt_lines_org_0_idx ON qfi_customer_debt_lines (org_id, customer_debt_statement_id);
CREATE TABLE qfi_debt_collection_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  customer_debt_statement_id uuid NOT NULL REFERENCES qfi_customer_debt_statements(id) ON DELETE CASCADE,
  action_type varchar(40) NOT NULL,
  reminder_level integer NOT NULL DEFAULT 0,
  action_date date,
  actor_id uuid,
  status varchar(30) NOT NULL DEFAULT 'planned',
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX qfi_debt_collection_actions_org_0_idx ON qfi_debt_collection_actions (org_id, customer_debt_statement_id);
CREATE INDEX qfi_debt_collection_actions_org_1_idx ON qfi_debt_collection_actions (org_id, status);
CREATE TABLE qfi_debt_writeoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  customer_debt_statement_id uuid NOT NULL REFERENCES qfi_customer_debt_statements(id),
  amount numeric(20,2) NOT NULL,
  reason text,
  status varchar(30) NOT NULL DEFAULT 'draft',
  director_id uuid,
  approved_at timestamp with time zone,
  ketoan10a_journal_entry_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX qfi_debt_writeoffs_org_0_idx ON qfi_debt_writeoffs (org_id, customer_debt_statement_id);
CREATE INDEX qfi_debt_writeoffs_org_1_idx ON qfi_debt_writeoffs (org_id, status);
CREATE TABLE qfi_payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  run_no varchar(40) NOT NULL,
  period_code varchar(10) NOT NULL,
  source_module varchar(40) NOT NULL DEFAULT 'generic',
  gross_total numeric(20,2) NOT NULL DEFAULT 0,
  net_total numeric(20,2) NOT NULL DEFAULT 0,
  status varchar(30) NOT NULL DEFAULT 'draft',
  workflow_instance_id uuid,
  created_by uuid,
  approved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX qfi_payroll_runs_org_0_idx ON qfi_payroll_runs (org_id, period_code);
CREATE INDEX qfi_payroll_runs_org_1_idx ON qfi_payroll_runs (org_id, status);
CREATE TABLE qfi_payroll_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  payroll_run_id uuid NOT NULL REFERENCES qfi_payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  gross_amount numeric(20,2) NOT NULL DEFAULT 0,
  deduction_amount numeric(20,2) NOT NULL DEFAULT 0,
  net_amount numeric(20,2) NOT NULL DEFAULT 0,
  status varchar(30) NOT NULL DEFAULT 'draft',
  note text
);
CREATE INDEX qfi_payroll_lines_org_0_idx ON qfi_payroll_lines (org_id, payroll_run_id);
CREATE INDEX qfi_payroll_lines_org_1_idx ON qfi_payroll_lines (org_id, employee_id);
CREATE TABLE qfi_salary_payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  order_no varchar(40) NOT NULL,
  payroll_run_id uuid NOT NULL REFERENCES qfi_payroll_runs(id),
  amount numeric(20,2) NOT NULL,
  payment_method varchar(30) NOT NULL DEFAULT 'bank_transfer',
  status varchar(30) NOT NULL DEFAULT 'draft',
  ketoan10a_payment_id uuid,
  paid_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX qfi_salary_payment_orders_org_0_idx ON qfi_salary_payment_orders (org_id, payroll_run_id);
CREATE INDEX qfi_salary_payment_orders_org_1_idx ON qfi_salary_payment_orders (org_id, status);
CREATE TABLE qfi_payslip_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  payroll_line_id uuid NOT NULL REFERENCES qfi_payroll_lines(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  delivery_status varchar(30) NOT NULL DEFAULT 'pending',
  acknowledged_at timestamp with time zone,
  locked_at timestamp with time zone,
  file_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX qfi_payslip_flows_org_0_idx ON qfi_payslip_flows (org_id, employee_id);
CREATE INDEX qfi_payslip_flows_org_1_idx ON qfi_payslip_flows (org_id, delivery_status);
CREATE TABLE qfi_payroll_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  payroll_line_id uuid NOT NULL REFERENCES qfi_payroll_lines(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  feedback_type varchar(40) NOT NULL DEFAULT 'question',
  content text NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'open',
  resolved_by uuid,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX qfi_payroll_feedback_org_0_idx ON qfi_payroll_feedback (org_id, employee_id);
CREATE INDEX qfi_payroll_feedback_org_1_idx ON qfi_payroll_feedback (org_id, status);
