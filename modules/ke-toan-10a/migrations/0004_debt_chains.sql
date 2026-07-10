-- V12 ⑨ — Chuỗi công nợ tự động hạch toán (Q1: xác thực trả tiền → cấn trừ cả chuỗi FIFO).
CREATE TABLE IF NOT EXISTS ketoan10a.debt_chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  chain_type varchar(10) NOT NULL,
  contact_id uuid NOT NULL,
  doc_date date NOT NULL,
  total_amount numeric(20,2) NOT NULL,
  unallocated numeric(20,2) NOT NULL DEFAULT 0,
  currency varchar(3) NOT NULL DEFAULT 'VND',
  exchange_rate numeric(18,6) NOT NULL DEFAULT 1,
  amount_oc numeric(20,2),
  rate_note varchar(255),
  cash_account_id uuid NOT NULL,
  journal_entry_id uuid,
  memo varchar(512),
  links jsonb NOT NULL DEFAULT '[]',
  link_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS debt_chains_org_contact_idx ON ketoan10a.debt_chains (org_id, contact_id);
CREATE INDEX IF NOT EXISTS debt_chains_org_date_idx ON ketoan10a.debt_chains (org_id, doc_date);
