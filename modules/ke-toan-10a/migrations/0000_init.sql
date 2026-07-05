-- ============================================================
-- Kế Toán 10A — Migration khởi tạo (0000_init)
-- Tạo schema riêng `ketoan10a`, enums, và toàn bộ bảng.
-- Khớp 1-1 với schema Drizzle trong src/schema/*.
-- An toàn chạy lại: dùng IF NOT EXISTS ở mọi nơi có thể.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS ketoan10a;

-- ---------- ENUMS ----------
DO $$ BEGIN
  CREATE TYPE ketoan10a.account_type AS ENUM ('ASSET','LIABILITY','EQUITY','INCOME','EXPENSE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ketoan10a.normal_balance AS ENUM ('DEBIT','CREDIT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ketoan10a.doc_status AS ENUM ('DRAFT','POSTED','VOIDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ketoan10a.source_type AS ENUM ('RECEIPT','PAYMENT','INVOICE','BILL','MANUAL','OPENING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ketoan10a.contact_type AS ENUM ('CUSTOMER','VENDOR','BOTH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- ACCOUNTS ----------
CREATE TABLE IF NOT EXISTS ketoan10a.accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL,
  code            VARCHAR(20) NOT NULL,
  name            VARCHAR(255) NOT NULL,
  type            ketoan10a.account_type NOT NULL,
  normal_balance  ketoan10a.normal_balance NOT NULL,
  parent_id       UUID,
  opening_balance NUMERIC(20,2) NOT NULL DEFAULT 0,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  is_postable     BOOLEAN NOT NULL DEFAULT true,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  description     VARCHAR(512),
  created_by      VARCHAR(128),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_org_code_uq ON ketoan10a.accounts (org_id, code);
CREATE INDEX IF NOT EXISTS accounts_org_type_idx ON ketoan10a.accounts (org_id, type);
CREATE INDEX IF NOT EXISTS accounts_parent_idx ON ketoan10a.accounts (parent_id);

-- ---------- CONTACTS ----------
CREATE TABLE IF NOT EXISTS ketoan10a.contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL,
  code        VARCHAR(40) NOT NULL,
  name        VARCHAR(255) NOT NULL,
  type        ketoan10a.contact_type NOT NULL DEFAULT 'CUSTOMER',
  tax_code    VARCHAR(40),
  phone       VARCHAR(40),
  email       VARCHAR(255),
  address     VARCHAR(512),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  credit_limit       NUMERIC(20,2) NOT NULL DEFAULT 0,
  payment_term_days  INTEGER NOT NULL DEFAULT 0,
  created_by  VARCHAR(128),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS contacts_org_code_uq ON ketoan10a.contacts (org_id, code);
CREATE INDEX IF NOT EXISTS contacts_org_type_idx ON ketoan10a.contacts (org_id, type);
CREATE INDEX IF NOT EXISTS contacts_org_name_idx ON ketoan10a.contacts (org_id, name);

-- ---------- JOURNAL ENTRIES ----------
CREATE TABLE IF NOT EXISTS ketoan10a.journal_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL,
  entry_no      VARCHAR(40) NOT NULL,
  entry_date    DATE NOT NULL,
  memo          VARCHAR(512),
  status        ketoan10a.doc_status NOT NULL DEFAULT 'DRAFT',
  source_type   ketoan10a.source_type NOT NULL DEFAULT 'MANUAL',
  source_id     UUID,
  total_amount  NUMERIC(20,2) NOT NULL DEFAULT 0,
  currency      VARCHAR(8) NOT NULL DEFAULT 'VND',
  exchange_rate NUMERIC(18,6) NOT NULL DEFAULT 1,
  reversal_of   UUID,
  created_by    VARCHAR(128),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS je_org_entryno_uq ON ketoan10a.journal_entries (org_id, entry_no);
CREATE INDEX IF NOT EXISTS je_org_date_idx ON ketoan10a.journal_entries (org_id, entry_date);
CREATE INDEX IF NOT EXISTS je_org_status_idx ON ketoan10a.journal_entries (org_id, status);
CREATE INDEX IF NOT EXISTS je_source_idx ON ketoan10a.journal_entries (source_type, source_id);

-- ---------- JOURNAL LINES ----------
CREATE TABLE IF NOT EXISTS ketoan10a.journal_lines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL,
  entry_id    UUID NOT NULL REFERENCES ketoan10a.journal_entries(id) ON DELETE CASCADE,
  account_id  UUID NOT NULL REFERENCES ketoan10a.accounts(id),
  debit       NUMERIC(20,2) NOT NULL DEFAULT 0,
  credit      NUMERIC(20,2) NOT NULL DEFAULT 0,
  memo        VARCHAR(512),
  contact_id  UUID,
  cost_center_id  UUID,
  line_no     INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Phòng thủ tầng DB (tinh hoa từ 1A): Nợ/Có không âm; mỗi dòng chỉ Nợ HOẶC Có.
  CONSTRAINT jl_nonneg CHECK (debit >= 0 AND credit >= 0),
  CONSTRAINT jl_one_side CHECK (NOT (debit > 0 AND credit > 0))
);
CREATE INDEX IF NOT EXISTS jl_entry_idx ON ketoan10a.journal_lines (entry_id);
CREATE INDEX IF NOT EXISTS jl_org_account_idx ON ketoan10a.journal_lines (org_id, account_id);
CREATE INDEX IF NOT EXISTS jl_contact_idx ON ketoan10a.journal_lines (contact_id);

-- ---------- RECEIPTS ----------
CREATE TABLE IF NOT EXISTS ketoan10a.receipts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL,
  doc_no              VARCHAR(40) NOT NULL,
  doc_date            DATE NOT NULL,
  cash_account_id     UUID NOT NULL,
  counter_account_id  UUID NOT NULL,
  contact_id          UUID,
  amount              NUMERIC(20,2) NOT NULL,
  reason              VARCHAR(512),
  payer_name          VARCHAR(255),
  status              ketoan10a.doc_status NOT NULL DEFAULT 'DRAFT',
  journal_entry_id    UUID,
  created_by          VARCHAR(128),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS receipts_org_docno_uq ON ketoan10a.receipts (org_id, doc_no);
CREATE INDEX IF NOT EXISTS receipts_org_date_idx ON ketoan10a.receipts (org_id, doc_date);

-- ---------- PAYMENTS ----------
CREATE TABLE IF NOT EXISTS ketoan10a.payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL,
  doc_no              VARCHAR(40) NOT NULL,
  doc_date            DATE NOT NULL,
  cash_account_id     UUID NOT NULL,
  counter_account_id  UUID NOT NULL,
  contact_id          UUID,
  amount              NUMERIC(20,2) NOT NULL,
  reason              VARCHAR(512),
  payee_name          VARCHAR(255),
  status              ketoan10a.doc_status NOT NULL DEFAULT 'DRAFT',
  journal_entry_id    UUID,
  created_by          VARCHAR(128),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payments_org_docno_uq ON ketoan10a.payments (org_id, doc_no);
CREATE INDEX IF NOT EXISTS payments_org_date_idx ON ketoan10a.payments (org_id, doc_date);

-- ---------- INVOICES ----------
CREATE TABLE IF NOT EXISTS ketoan10a.invoices (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 UUID NOT NULL,
  doc_no                 VARCHAR(40) NOT NULL,
  doc_date               DATE NOT NULL,
  due_date               DATE,
  contact_id             UUID NOT NULL,
  receivable_account_id  UUID NOT NULL,
  revenue_account_id     UUID NOT NULL,
  tax_account_id         UUID,
  subtotal               NUMERIC(20,2) NOT NULL,
  tax_rate               NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_amount             NUMERIC(20,2) NOT NULL DEFAULT 0,
  total                  NUMERIC(20,2) NOT NULL,
  amount_paid            NUMERIC(20,2) NOT NULL DEFAULT 0,
  description            VARCHAR(512),
  lines                  JSONB NOT NULL DEFAULT '[]',
  status                 ketoan10a.doc_status NOT NULL DEFAULT 'DRAFT',
  journal_entry_id       UUID,
  created_by             VARCHAR(128),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_org_docno_uq ON ketoan10a.invoices (org_id, doc_no);
CREATE INDEX IF NOT EXISTS invoices_org_date_idx ON ketoan10a.invoices (org_id, doc_date);
CREATE INDEX IF NOT EXISTS invoices_contact_idx ON ketoan10a.invoices (contact_id);

-- ---------- BILLS ----------
CREATE TABLE IF NOT EXISTS ketoan10a.bills (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL,
  doc_no              VARCHAR(40) NOT NULL,
  doc_date            DATE NOT NULL,
  due_date            DATE,
  contact_id          UUID NOT NULL,
  payable_account_id  UUID NOT NULL,
  expense_account_id  UUID NOT NULL,
  tax_account_id      UUID,
  subtotal            NUMERIC(20,2) NOT NULL,
  tax_rate            NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_amount          NUMERIC(20,2) NOT NULL DEFAULT 0,
  total               NUMERIC(20,2) NOT NULL,
  amount_paid         NUMERIC(20,2) NOT NULL DEFAULT 0,
  description         VARCHAR(512),
  lines               JSONB NOT NULL DEFAULT '[]',
  status              ketoan10a.doc_status NOT NULL DEFAULT 'DRAFT',
  journal_entry_id    UUID,
  created_by          VARCHAR(128),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bills_org_docno_uq ON ketoan10a.bills (org_id, doc_no);
CREATE INDEX IF NOT EXISTS bills_org_date_idx ON ketoan10a.bills (org_id, doc_date);
CREATE INDEX IF NOT EXISTS bills_contact_idx ON ketoan10a.bills (contact_id);

-- ---------- AUDIT LOG ----------
CREATE TABLE IF NOT EXISTS ketoan10a.audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL,
  action       VARCHAR(80) NOT NULL,
  entity_type  VARCHAR(40) NOT NULL,
  entity_id    UUID,
  actor        VARCHAR(128) NOT NULL,
  source       VARCHAR(40) NOT NULL DEFAULT 'api',
  detail       JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_org_created_idx ON ketoan10a.audit_log (org_id, created_at);
CREATE INDEX IF NOT EXISTS audit_entity_idx ON ketoan10a.audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_actor_idx ON ketoan10a.audit_log (actor);

-- ---------- DOC COUNTERS ----------
CREATE TABLE IF NOT EXISTS ketoan10a.doc_counters (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL,
  doc_type    VARCHAR(20) NOT NULL,
  year        INTEGER NOT NULL,
  counter     INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS counters_org_type_year_uq ON ketoan10a.doc_counters (org_id, doc_type, year);

-- ---------- FISCAL YEARS (năm tài chính + khóa kỳ, tinh hoa từ ACC4A) ----------
CREATE TABLE IF NOT EXISTS ketoan10a.fiscal_years (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL,
  name        VARCHAR(20) NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  is_closed   BOOLEAN NOT NULL DEFAULT false,
  closed_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fy_org_name_uq ON ketoan10a.fiscal_years (org_id, name);
CREATE INDEX IF NOT EXISTS fy_org_start_idx ON ketoan10a.fiscal_years (org_id, start_date);

-- ---------- ADVANCES (tạm ứng / đặt cọc) ----------
DO $$ BEGIN
  CREATE TYPE ketoan10a.advance_type AS ENUM ('CUSTOMER_DEPOSIT','SUPPLIER_ADVANCE','EMPLOYEE_ADVANCE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS ketoan10a.advances (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL,
  doc_no            VARCHAR(40) NOT NULL,
  doc_date          DATE NOT NULL,
  type              ketoan10a.advance_type NOT NULL,
  contact_id        UUID,
  party_name        VARCHAR(255),
  cash_account_id   UUID NOT NULL,
  party_account_id  UUID NOT NULL,
  amount            NUMERIC(20,2) NOT NULL,
  applied_amount    NUMERIC(20,2) NOT NULL DEFAULT 0,
  description        VARCHAR(512),
  status            ketoan10a.doc_status NOT NULL DEFAULT 'DRAFT',
  journal_entry_id  UUID,
  created_by        VARCHAR(128),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS advances_org_docno_idx ON ketoan10a.advances (org_id, doc_no);
CREATE INDEX IF NOT EXISTS advances_org_contact_idx ON ketoan10a.advances (org_id, contact_id);
CREATE INDEX IF NOT EXISTS advances_org_type_idx ON ketoan10a.advances (org_id, type);

-- ---------- RECURRING TEMPLATES (giao dịch định kỳ) ----------
DO $$ BEGIN
  CREATE TYPE ketoan10a.recurring_kind AS ENUM ('RECEIPT','PAYMENT','JOURNAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE ketoan10a.recurring_freq AS ENUM ('DAILY','WEEKLY','MONTHLY','YEARLY');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS ketoan10a.recurring_templates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL,
  name           VARCHAR(255) NOT NULL,
  kind           ketoan10a.recurring_kind NOT NULL,
  frequency      ketoan10a.recurring_freq NOT NULL,
  interval       INTEGER NOT NULL DEFAULT 1,
  payload        JSONB NOT NULL,
  next_run_date  DATE NOT NULL,
  last_run_date  DATE,
  run_count      INTEGER NOT NULL DEFAULT 0,
  end_date       DATE,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recurring_org_active_idx ON ketoan10a.recurring_templates (org_id, is_active);
CREATE INDEX IF NOT EXISTS recurring_org_next_idx ON ketoan10a.recurring_templates (org_id, next_run_date);

-- ========== TẦNG 2: PHÂN TÍCH NÂNG CAO ==========

-- ---------- COST CENTERS (bộ phận/dự án) ----------
DO $$ BEGIN
  CREATE TYPE ketoan10a.cost_center_type AS ENUM ('DEPARTMENT','PROJECT','BRANCH','PRODUCT','OTHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS ketoan10a.cost_centers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL,
  code        VARCHAR(40) NOT NULL,
  name        VARCHAR(255) NOT NULL,
  type        ketoan10a.cost_center_type NOT NULL DEFAULT 'DEPARTMENT',
  parent_id   UUID,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cc_org_code_uq ON ketoan10a.cost_centers (org_id, code);
CREATE INDEX IF NOT EXISTS cc_org_type_idx ON ketoan10a.cost_centers (org_id, type);

-- ---------- BANK RECONCILIATION ----------
DO $$ BEGIN
  CREATE TYPE ketoan10a.bank_txn_status AS ENUM ('UNMATCHED','MATCHED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS ketoan10a.bank_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL,
  bank_account_id   UUID NOT NULL,
  txn_date          DATE NOT NULL,
  description        VARCHAR(512) NOT NULL DEFAULT '',
  reference          VARCHAR(128),
  amount             NUMERIC(20,2) NOT NULL,
  status             ketoan10a.bank_txn_status NOT NULL DEFAULT 'UNMATCHED',
  matched_entry_id   UUID,
  import_batch       VARCHAR(64),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bt_org_bank_idx ON ketoan10a.bank_transactions (org_id, bank_account_id);
CREATE INDEX IF NOT EXISTS bt_org_status_idx ON ketoan10a.bank_transactions (org_id, status);
CREATE INDEX IF NOT EXISTS bt_org_date_idx ON ketoan10a.bank_transactions (org_id, txn_date);

CREATE TABLE IF NOT EXISTS ketoan10a.bank_rules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL,
  match_text          VARCHAR(255) NOT NULL,
  counter_account_id  UUID NOT NULL,
  priority            INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS br_org_priority_idx ON ketoan10a.bank_rules (org_id, priority);

-- ---------- FIXED ASSETS ----------
DO $$ BEGIN
  CREATE TYPE ketoan10a.asset_status AS ENUM ('ACTIVE','FULLY_DEPRECIATED','DISPOSED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS ketoan10a.fixed_assets (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   UUID NOT NULL,
  code                     VARCHAR(40) NOT NULL,
  name                     VARCHAR(255) NOT NULL,
  cost                     NUMERIC(20,2) NOT NULL,
  salvage_value            NUMERIC(20,2) NOT NULL DEFAULT 0,
  useful_life_months       INTEGER NOT NULL,
  accumulated_depreciation NUMERIC(20,2) NOT NULL DEFAULT 0,
  start_date               DATE NOT NULL,
  last_depreciation_date   DATE,
  asset_account_id         UUID NOT NULL,
  depreciation_account_id  UUID NOT NULL,
  expense_account_id       UUID NOT NULL,
  status                   ketoan10a.asset_status NOT NULL DEFAULT 'ACTIVE',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fa_org_code_idx ON ketoan10a.fixed_assets (org_id, code);
CREATE INDEX IF NOT EXISTS fa_org_status_idx ON ketoan10a.fixed_assets (org_id, status);

-- ---------- BUDGETS ----------
CREATE TABLE IF NOT EXISTS ketoan10a.budgets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL,
  fiscal_year    VARCHAR(16) NOT NULL,
  account_id     UUID NOT NULL,
  cost_center_id UUID,
  amount         NUMERIC(20,2) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bg_org_year_acc_cc_uq ON ketoan10a.budgets (org_id, fiscal_year, account_id, cost_center_id);
CREATE INDEX IF NOT EXISTS bg_org_year_idx ON ketoan10a.budgets (org_id, fiscal_year);
