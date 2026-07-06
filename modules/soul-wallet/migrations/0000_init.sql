-- ============================================================================
-- SOUL-WALLET 1A — 0000_init.sql
-- 25 bảng: 21 nghiệp vụ + 4 summary. Chuẩn SuperCitadel:
--   · org_id uuid NOT NULL trên MỌI bảng (multi-tenant)
--   · owner_user_id varchar(128) NOT NULL — ví CÁ NHÂN per-user trong org
--   · tiền: numeric(18,0) VND + currency char(3) DEFAULT 'VND' (mở đường v2)
--   · created_by varchar(128) — KHÔNG uuid (bài học Kế Toán)
--   · không FLOAT, không DELETE nghiệp vụ (hủy = bút toán đảo)
-- ============================================================================

-- ── 1. Tài khoản / Ví ───────────────────────────────────────────────────────
CREATE TABLE sw_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  owner_user_id varchar(128) NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('cash','bank','ewallet','credit_card','savings','loan','investment','asset')),
  currency char(3) NOT NULL DEFAULT 'VND',
  -- thẻ tín dụng
  statement_day smallint,           -- ngày chốt sao kê (1..28)
  due_day smallint,                 -- ngày hạn thanh toán (1..28)
  credit_limit numeric(18,0),
  -- sổ tiết kiệm
  term_months smallint,
  interest_rate numeric(9,4),       -- %/năm
  maturity_date date,
  opening_balance numeric(18,0) NOT NULL DEFAULT 0,
  icon text,
  note text,
  is_archived boolean NOT NULL DEFAULT false,
  created_by varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sw_accounts_scope_idx ON sw_accounts (org_id, owner_user_id);

-- ── 2. Danh bạ đối tác cá nhân (payee/khách/chủ nợ/nhà cung cấp) ───────────
CREATE TABLE sw_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  owner_user_id varchar(128) NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'other' CHECK (kind IN ('customer','lender','borrower','vendor','other')),
  phone text,
  note text,
  created_by varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sw_contacts_scope_idx ON sw_contacts (org_id, owner_user_id, name);

-- ── 3. Danh mục 2 cấp ───────────────────────────────────────────────────────
CREATE TABLE sw_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  owner_user_id varchar(128) NOT NULL,
  parent_id uuid REFERENCES sw_categories(id),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('income','expense')),
  icon text,
  is_system boolean NOT NULL DEFAULT false,   -- seed mặc định, không cho xóa
  created_by varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sw_categories_scope_idx ON sw_categories (org_id, owner_user_id, kind);

-- ── 4. Tags + n-n với giao dịch ─────────────────────────────────────────────
CREATE TABLE sw_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  owner_user_id varchar(128) NOT NULL,
  name text NOT NULL,
  created_by varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sw_tags_uniq ON sw_tags (org_id, owner_user_id, name);

-- ── 5. Giao dịch (sổ tiền) ─────────────────────────────────────────────────
CREATE TABLE sw_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  owner_user_id varchar(128) NOT NULL,
  doc_no text NOT NULL,                       -- SW-TX-2026-000001
  kind text NOT NULL CHECK (kind IN ('income','expense','transfer','refund','fee','adjust')),
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','draft','reversed')),
  occurred_at timestamptz NOT NULL,
  account_id uuid NOT NULL REFERENCES sw_accounts(id),
  counter_account_id uuid REFERENCES sw_accounts(id),  -- transfer đích
  contact_id uuid REFERENCES sw_contacts(id),
  category_id uuid REFERENCES sw_categories(id),
  amount numeric(18,0) NOT NULL CHECK (amount >= 0),
  currency char(3) NOT NULL DEFAULT 'VND',
  memo text,
  ref_no text,
  reversal_of uuid REFERENCES sw_transactions(id),
  import_row_id uuid,
  meta jsonb,
  created_by varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sw_tx_scope_time_idx ON sw_transactions (org_id, owner_user_id, occurred_at DESC);
CREATE INDEX sw_tx_account_idx ON sw_transactions (account_id, occurred_at DESC);
CREATE INDEX sw_tx_category_idx ON sw_transactions (org_id, owner_user_id, category_id);
CREATE UNIQUE INDEX sw_tx_docno_uniq ON sw_transactions (org_id, owner_user_id, doc_no);

CREATE TABLE sw_transaction_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  owner_user_id varchar(128) NOT NULL,
  tx_id uuid NOT NULL REFERENCES sw_transactions(id) ON DELETE CASCADE,
  category_id uuid REFERENCES sw_categories(id),
  amount numeric(18,0) NOT NULL CHECK (amount >= 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sw_splits_tx_idx ON sw_transaction_splits (tx_id);

CREATE TABLE sw_transaction_tags (
  tx_id uuid NOT NULL REFERENCES sw_transactions(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES sw_tags(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  owner_user_id varchar(128) NOT NULL,
  PRIMARY KEY (tx_id, tag_id)
);

-- ── 6. Sổ kép mini — nguồn chân lý số dư ───────────────────────────────────
-- Mỗi giao dịch sinh ≥1 bút toán delta có dấu trên TÀI KHOẢN THẬT:
--   income:+ · expense:− · transfer: −nguồn/+đích (tổng = 0) · refund:+ · fee:− · adjust:±
-- Số dư account = opening_balance + SUM(delta). Đảo giao dịch = bút toán delta ngược.
CREATE TABLE sw_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  owner_user_id varchar(128) NOT NULL,
  tx_id uuid NOT NULL REFERENCES sw_transactions(id),
  account_id uuid NOT NULL REFERENCES sw_accounts(id),
  delta numeric(18,0) NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sw_ledger_account_idx ON sw_ledger_entries (account_id, occurred_at);
CREATE INDEX sw_ledger_scope_idx ON sw_ledger_entries (org_id, owner_user_id, occurred_at);
CREATE INDEX sw_ledger_tx_idx ON sw_ledger_entries (tx_id);

-- ── 7. Đính kèm hóa đơn (metadata) ─────────────────────────────────────────
CREATE TABLE sw_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  owner_user_id varchar(128) NOT NULL,
  tx_id uuid NOT NULL REFERENCES sw_transactions(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime text,
  size_bytes bigint,
  storage_key text,
  created_by varchar(128),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sw_attachments_tx_idx ON sw_attachments (tx_id);

-- ── 8. Audit log — camera an ninh trong túi ────────────────────────────────
CREATE TABLE sw_audit_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  owner_user_id varchar(128) NOT NULL,
  actor varchar(128) NOT NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  before jsonb,
  after jsonb,
  is_dryrun boolean NOT NULL DEFAULT false,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sw_audit_scope_idx ON sw_audit_entries (org_id, owner_user_id, at DESC);
CREATE INDEX sw_audit_entity_idx ON sw_audit_entries (entity, entity_id);

-- ── 9. Ngân sách envelope + kỳ ─────────────────────────────────────────────
CREATE TABLE sw_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  owner_user_id varchar(128) NOT NULL,
  name text NOT NULL,
  category_id uuid REFERENCES sw_categories(id),   -- NULL = ngân sách tổng
  jar_code text,                                   -- NEC/FFA/EDU/LTS/PLAY/GIVE nếu theo 6 Hũ
  amount numeric(18,0) NOT NULL CHECK (amount >= 0),
  currency char(3) NOT NULL DEFAULT 'VND',
  rollover boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_by varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sw_budgets_scope_idx ON sw_budgets (org_id, owner_user_id);

CREATE TABLE sw_budget_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  owner_user_id varchar(128) NOT NULL,
  budget_id uuid NOT NULL REFERENCES sw_budgets(id) ON DELETE CASCADE,
  period date NOT NULL,                            -- yyyy-mm-01
  planned numeric(18,0) NOT NULL DEFAULT 0,
  carried numeric(18,0) NOT NULL DEFAULT 0,        -- rollover từ kỳ trước
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (budget_id, period)
);
CREATE INDEX sw_budget_periods_idx ON sw_budget_periods (org_id, owner_user_id, period);

-- ── 10. Hũ mục tiêu tiết kiệm ──────────────────────────────────────────────
CREATE TABLE sw_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  owner_user_id varchar(128) NOT NULL,
  name text NOT NULL,
  target numeric(18,0) NOT NULL CHECK (target > 0),
  saved numeric(18,0) NOT NULL DEFAULT 0,
  currency char(3) NOT NULL DEFAULT 'VND',
  deadline date,
  account_id uuid REFERENCES sw_accounts(id),
  reached_at timestamptz,
  created_by varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sw_goals_scope_idx ON sw_goals (org_id, owner_user_id);

CREATE TABLE sw_goal_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  owner_user_id varchar(128) NOT NULL,
  goal_id uuid NOT NULL REFERENCES sw_goals(id) ON DELETE CASCADE,
  amount numeric(18,0) NOT NULL CHECK (amount > 0),
  tx_id uuid REFERENCES sw_transactions(id),
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sw_goal_contrib_idx ON sw_goal_contributions (goal_id);

-- ── 11. Sổ nợ cá nhân + trả nợ ─────────────────────────────────────────────
CREATE TABLE sw_debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  owner_user_id varchar(128) NOT NULL,
  contact_id uuid NOT NULL REFERENCES sw_contacts(id),
  direction text NOT NULL CHECK (direction IN ('receivable','payable')),
  principal numeric(18,0) NOT NULL CHECK (principal > 0),
  interest_rate numeric(9,4) NOT NULL DEFAULT 0,   -- %/năm, lãi đơn
  currency char(3) NOT NULL DEFAULT 'VND',
  start_date date NOT NULL,
  due_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','settled')),
  note text,
  created_by varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sw_debts_scope_idx ON sw_debts (org_id, owner_user_id, status);

CREATE TABLE sw_debt_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  owner_user_id varchar(128) NOT NULL,
  debt_id uuid NOT NULL REFERENCES sw_debts(id) ON DELETE CASCADE,
  amount numeric(18,0) NOT NULL CHECK (amount > 0),
  paid_at date NOT NULL,
  tx_id uuid REFERENCES sw_transactions(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sw_debt_payments_idx ON sw_debt_payments (debt_id);

-- ── 12. Định kỳ & subscription ─────────────────────────────────────────────
CREATE TABLE sw_recurring_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  owner_user_id varchar(128) NOT NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('subscription','bill','income')),
  account_id uuid NOT NULL REFERENCES sw_accounts(id),
  category_id uuid REFERENCES sw_categories(id),
  contact_id uuid REFERENCES sw_contacts(id),
  amount numeric(18,0) NOT NULL CHECK (amount > 0),
  currency char(3) NOT NULL DEFAULT 'VND',
  freq text NOT NULL CHECK (freq IN ('daily','weekly','monthly','yearly')),
  interval_n smallint NOT NULL DEFAULT 1 CHECK (interval_n >= 1),
  next_run_at date NOT NULL,
  auto_post boolean NOT NULL DEFAULT false,        -- false → sinh draft chờ duyệt
  last_amount numeric(18,0),                       -- bắt tăng giá
  active boolean NOT NULL DEFAULT true,
  created_by varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sw_recurring_scope_idx ON sw_recurring_rules (org_id, owner_user_id, active, next_run_at);

-- ── 13. Rule engine tự phân loại ───────────────────────────────────────────
CREATE TABLE sw_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  owner_user_id varchar(128) NOT NULL,
  name text NOT NULL,
  priority int NOT NULL DEFAULT 100,               -- nhỏ chạy trước
  match jsonb NOT NULL,                            -- {memo_contains?, payee_contains?, min_amount?, max_amount?, account_id?, kind?}
  set_fields jsonb NOT NULL,                       -- {category_id?, contact_id?, tag_ids?}
  active boolean NOT NULL DEFAULT true,
  created_by varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sw_rules_scope_idx ON sw_rules (org_id, owner_user_id, active, priority);

-- ── 14. Import machine ─────────────────────────────────────────────────────
CREATE TABLE sw_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  owner_user_id varchar(128) NOT NULL,
  file_name text NOT NULL,
  preset text NOT NULL,                            -- vcb|tcb|mb|acb|bidv|generic
  account_id uuid NOT NULL REFERENCES sw_accounts(id),
  status text NOT NULL DEFAULT 'preview' CHECK (status IN ('preview','committed','cancelled')),
  stats jsonb,
  created_by varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sw_import_jobs_scope_idx ON sw_import_jobs (org_id, owner_user_id, created_at DESC);

CREATE TABLE sw_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  owner_user_id varchar(128) NOT NULL,
  job_id uuid NOT NULL REFERENCES sw_import_jobs(id) ON DELETE CASCADE,
  row_no int NOT NULL,
  raw jsonb NOT NULL,
  parsed jsonb,                                    -- {occurred_at, amount, kind, memo, ref_no}
  dup_hash text,
  dup_of_tx uuid,
  suggestion jsonb,                                -- kết quả rule chạy thử {category_id?, contact_id?}
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','committed','skipped','error')),
  error text,
  tx_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sw_import_rows_job_idx ON sw_import_rows (job_id, row_no);
CREATE INDEX sw_import_rows_dup_idx ON sw_import_rows (org_id, owner_user_id, dup_hash);

-- ── 15. Bộ đếm số chứng từ ─────────────────────────────────────────────────
CREATE TABLE sw_doc_counters (
  org_id uuid NOT NULL,
  owner_user_id varchar(128) NOT NULL,
  key text NOT NULL,                               -- 'TX'
  year int NOT NULL,
  seq int NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, owner_user_id, key, year)
);

-- ── 16. SUMMARY LAYER — dashboard load nhanh, rebuild được từ ledger ───────
-- OHLC số dư theo ngày/tài khoản → nến cash-range + heatmap + line
CREATE TABLE sw_snapshots_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  owner_user_id varchar(128) NOT NULL,
  account_id uuid NOT NULL REFERENCES sw_accounts(id) ON DELETE CASCADE,
  day date NOT NULL,
  open numeric(18,0) NOT NULL DEFAULT 0,
  high numeric(18,0) NOT NULL DEFAULT 0,
  low numeric(18,0) NOT NULL DEFAULT 0,
  close numeric(18,0) NOT NULL DEFAULT 0,
  cash_in numeric(18,0) NOT NULL DEFAULT 0,
  cash_out numeric(18,0) NOT NULL DEFAULT 0,
  UNIQUE (account_id, day)
);
CREATE INDEX sw_snapshots_scope_idx ON sw_snapshots_daily (org_id, owner_user_id, day);

CREATE TABLE sw_monthly_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  owner_user_id varchar(128) NOT NULL,
  month date NOT NULL,                             -- yyyy-mm-01
  income numeric(18,0) NOT NULL DEFAULT 0,
  expense numeric(18,0) NOT NULL DEFAULT 0,
  UNIQUE (org_id, owner_user_id, month)
);

CREATE TABLE sw_category_month_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  owner_user_id varchar(128) NOT NULL,
  month date NOT NULL,
  category_id uuid,
  kind text NOT NULL CHECK (kind IN ('income','expense')),
  amount numeric(18,0) NOT NULL DEFAULT 0,
  UNIQUE (org_id, owner_user_id, month, category_id, kind)
);

CREATE TABLE sw_networth_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  owner_user_id varchar(128) NOT NULL,
  month date NOT NULL,
  assets numeric(18,0) NOT NULL DEFAULT 0,
  liabilities numeric(18,0) NOT NULL DEFAULT 0,
  UNIQUE (org_id, owner_user_id, month)
);
