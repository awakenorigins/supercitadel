-- Accounting v1 (fork domain model ERPNext Accounts: Account, GL Entry, Journal/Payment/Invoice)
CREATE TABLE IF NOT EXISTS acc_accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL,
  number      varchar(10) NOT NULL,             -- 111, 112, 131, 331, 511...
  name        varchar(120) NOT NULL,
  root_type   varchar(12) NOT NULL,             -- asset|liability|equity|income|expense
  is_group    boolean NOT NULL DEFAULT false,
  parent_id   uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, number)
);
CREATE INDEX IF NOT EXISTS acc_acct_org_idx ON acc_accounts(org_id, root_type);

CREATE TABLE IF NOT EXISTS acc_vouchers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL,
  voucher_type varchar(16) NOT NULL,            -- journal|invoice|payment
  voucher_no   varchar(24) NOT NULL,            -- JV-0001, INV-0001, PAY-0001
  posting_date date NOT NULL,
  remarks      text,
  total        numeric(16,0) NOT NULL DEFAULT 0,  -- VND nguyên
  status       varchar(12) NOT NULL DEFAULT 'posted',  -- posted|cancelled
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, voucher_no)
);

CREATE TABLE IF NOT EXISTS acc_gl_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL,
  posting_date date NOT NULL,
  account_id   uuid NOT NULL REFERENCES acc_accounts(id),
  debit        numeric(16,0) NOT NULL DEFAULT 0,
  credit       numeric(16,0) NOT NULL DEFAULT 0,
  party_type   varchar(12),                     -- customer|supplier|NULL
  party_name   varchar(120),
  voucher_id   uuid NOT NULL REFERENCES acc_vouchers(id),
  remarks      text,
  is_cancel    boolean NOT NULL DEFAULT false,  -- true = dòng bút toán đảo
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (debit >= 0 AND credit >= 0),
  CHECK (NOT (debit > 0 AND credit > 0))        -- mỗi dòng chỉ Nợ HOẶC Có
);
CREATE INDEX IF NOT EXISTS acc_gl_org_acct_idx ON acc_gl_entries(org_id, account_id, posting_date);
CREATE INDEX IF NOT EXISTS acc_gl_voucher_idx ON acc_gl_entries(voucher_id);

CREATE TABLE IF NOT EXISTS acc_invoices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL,
  invoice_type varchar(10) NOT NULL,            -- sales|purchase
  party_name   varchar(120) NOT NULL,
  posting_date date NOT NULL,
  due_date     date,
  lines        jsonb NOT NULL DEFAULT '[]',     -- [{description, qty, rate, amount}]
  grand_total  numeric(16,0) NOT NULL,
  outstanding  numeric(16,0) NOT NULL,
  status       varchar(14) NOT NULL DEFAULT 'unpaid',  -- unpaid|partly_paid|paid|cancelled
  voucher_id   uuid REFERENCES acc_vouchers(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS acc_inv_org_idx ON acc_invoices(org_id, invoice_type, status);

CREATE TABLE IF NOT EXISTS acc_payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  payment_type  varchar(8) NOT NULL,             -- receive|pay
  party_name    varchar(120) NOT NULL,
  amount        numeric(16,0) NOT NULL,
  cash_account_id uuid NOT NULL REFERENCES acc_accounts(id),  -- 111/112
  invoice_id    uuid REFERENCES acc_invoices(id),
  posting_date  date NOT NULL,
  remarks       text,
  voucher_id    uuid REFERENCES acc_vouchers(id),
  status        varchar(12) NOT NULL DEFAULT 'posted',
  created_at    timestamptz NOT NULL DEFAULT now()
);
