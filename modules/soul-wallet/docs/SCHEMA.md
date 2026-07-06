# Soul-Wallet — Schema (25 bảng, prefix sw_)

Chuẩn chung mọi bảng: `id uuid pk default gen_random_uuid()` · `org_id uuid NOT NULL` · `owner_user_id varchar(128) NOT NULL` (VÍ CÁ NHÂN — cách ly 2 chiều) · `created_by varchar(128)` · timestamps. Tiền: `numeric(18,0)` VND + `currency char(3) default 'VND'`. RLS ENABLE+FORCE policy `tenant_isolation` theo `app.current_org_id` trên CẢ 25 bảng (migrations/0001_rls.sql).

**Sổ chính**
- `sw_accounts` — ví: type (cash/bank/ewallet/credit_card/savings/loan/investment/asset), opening_balance, statement_day/due_day/credit_limit (thẻ), term_months/interest_rate/maturity_date (tiết kiệm), is_archived.
- `sw_transactions` — doc_no unique(org,owner) dạng `SW-TX-YYYY-NNNNNN`, kind, status(posted/draft/reversed), occurred_at, account_id, counter_account_id, contact_id, category_id, amount≥0, memo, ref_no, `reversal_of`, import_row_id, meta jsonb.
- `sw_transaction_splits` — tách 1 tx nhiều danh mục (Σ = amount, service enforce).
- `sw_transaction_tags` — n-n PK(tx_id, tag_id).
- `sw_ledger_entries` — **nguồn chân lý số dư**: delta có dấu per (tx, account). Số dư = opening + Σdelta.
- `sw_attachments` — metadata đính kèm (file_name/mime/size/storage_key — binary do host lưu).
- `sw_audit_entries` — actor/action/entity/before/after/is_dryrun.
- `sw_doc_counters` — PK(org, owner, key, year), upsert nguyên tử seq.

**Danh mục & đối tác**
- `sw_contacts` — kind: customer/lender/borrower/vendor/other.
- `sw_categories` — 2 cấp (parent_id, cùng kind), is_system cho bộ seed 16 nhóm VN.
- `sw_tags`.

**Kỷ luật**
- `sw_budgets` — envelope: category_id (null = tổng) hoặc jar_code (NEC/FFA/EDU/LTS/PLAY/GIVE), amount, rollover.
- `sw_budget_periods` — unique(budget, period yyyy-mm-01): planned + carried (rollover dư dương kỳ trước).
- `sw_goals` + `sw_goal_contributions` — target/saved/reached_at; contribution có thể link tx.
- `sw_debts` — direction receivable/payable, principal, interest_rate %/năm (lãi đơn: principal×rate×days/365 floor), start/due, status open/settled.
- `sw_debt_payments` — chặn Σ > principal ở service.
- `sw_recurring_rules` — freq+interval_n, next_run_at, auto_post, last_amount (bắt tăng giá).
- `sw_rules` — priority asc, match jsonb, set_fields jsonb (first-match-wins).

**Import**
- `sw_import_jobs` — preset, account_id, status preview/committed/cancelled, stats jsonb.
- `sw_import_rows` — raw/parsed jsonb, `dup_hash` = sha1(account|ngày|±tiền|memo chuẩn hóa 40 ký tự), dup_of_tx, suggestion (rule), status pending/committed/skipped/error, tx_id.

**Summary (rebuild được 100% từ ledger)**
- `sw_snapshots_daily` — unique(account, day): OHLC số dư + cash_in/out → nến, heatmap. Ranged-rebuild từ ngày sớm nhất bị chạm (đúng cả backdate); invariant test khóa `ranged == full`.
- `sw_monthly_summary` — income (kind income), expense (expense + fee − refund).
- `sw_category_month_summary` — per (month, category, kind); splits override category của tx; refund trừ âm vào danh mục.
- `sw_networth_snapshots` — assets = Σ số dư dương cuối tháng, liabilities = Σ|số dư âm|.

Index chính: tx(org,owner,occurred_at desc), ledger(account,occurred_at), import_rows(org,owner,dup_hash), recurring(org,owner,active,next_run_at).
