# Soul-Wallet — API Reference

Base: `/api/v1/soul-wallet` · Auth: Bearer JWT (org_id + sub = chủ ví lấy từ token, client KHÔNG khai) · Gate: module `soul-wallet` active. Response chuẩn `{data}` hoặc `{error:{code,message,details?}}` — Zod fail → 400 `INVALID_INPUT`, lỗi nghiệp vụ → 422 kèm `SwError.code`, thiếu quyền/module → theo host.

Bảng endpoint đầy đủ + quyền: xem docs/GUIDE.md §Chức năng (49 endpoint). Dưới đây là contract body các endpoint chính:

## Transactions
`POST /transactions` — `{kind: income|expense|transfer|refund|fee|adjust, occurred_at: ISO, account_id, amount, counter_account_id?(transfer), category_id?, contact_id?, memo?, ref_no?, status?: posted|draft, splits?: [{category_id?, amount, note?}], tag_ids?, attachments?: [{file_name, mime?, size_bytes?, storage_key?}], meta?}` → tx. Splits: Σ = amount. `adjust` dùng `meta.sign: 1|-1`.
`POST /transactions/search` — `{from?, to?, kind?, account_id?, category_id?, contact_id?, memo_contains?, min_amount?, max_amount?, status?, limit≤500}`.
`POST /transactions/reverse` — `{id, reason?}` → tx đảo (`reversal_of`).
`POST /transactions/post-draft` — `{id}` → draft thành posted + ghi ledger.
`POST /transfer` — `{occurred_at, from_account_id, to_account_id, amount, memo?}`.

## Accounts
`POST /accounts` — `{name, type, opening_balance?, statement_day?, due_day?, credit_limit?, term_months?, interest_rate?, maturity_date?, icon?, note?}`.
`POST /accounts/close` — `{id, force?}` (còn dư & !force → 422 ACCOUNT_HAS_BALANCE).
`GET /accounts?include_archived=true|false` → `[{id, name, type, balance, is_archived}]` (balance derive).
`GET /accounts/:id/balance` → `{balance}`.

## Budget & Goals
`POST /budgets` — `{id?, name, amount, category_id?, jar_code?, rollover?, period?}`.
`POST /budgets/six-jars` — `{monthly_income, period?}` → 6 hũ NEC/FFA/EDU/LTS/PLAY/GIVE.
`GET /budgets/status?period=` → `{period, budgets:[{name, jar_code, limit=planned+carried, spent, remaining, pct_used, projected_end, at_risk, exceeded}]}` (vượt → emit `sw.budget.exceeded`).
`POST /goals` `{name, target, deadline?, account_id?}` · `POST /goals/contribute` `{goal_id, amount, from_account_id?, occurred_at?}` (đạt đích → emit `sw.goal.reached`) · `GET /goals`.

## Debts
`POST /debts` — `{direction: receivable|payable, principal, interest_rate?(%/năm lãi đơn), start_date, due_date?, contact_id? | contact_name?(tự tạo), account_id?(sinh tx dòng tiền), note?}`.
`POST /debts/pay` — `{debt_id, amount, paid_at, account_id?, note?}` (vượt còn lại → 422; hết → status settled).
`GET /debts?direction&status&as_of` → mỗi khoản kèm `paid, remaining, interest_accrued, overdue_days`.
`GET /debts/aging?as_of` → `{receivable:{not_due,0-7,8-30,31-60,61-90,90+}, payable:{...}}`.

## Recurring & Rules
`POST /recurring` — `{name, kind: subscription|bill|income, account_id, amount, freq: daily|weekly|monthly|yearly, interval_n?, next_run_at, auto_post?, category_id?, contact_id?, active?}`.
`GET /recurring/upcoming?days=` — kèm `price_hiked`.
`POST /recurring/run` — `{now?}` catch-up mọi kỳ đến hạn (guard 120 kỳ); auto_post=false sinh draft; emit `sw.recurring.posted`.
`POST /rules` — `{name, priority, match:{memo_contains?, payee_contains?, min_amount?, max_amount?, account_id?, kind?}, set_fields:{category_id?, contact_id?, tag_ids?}, active}` · `GET /rules` · `POST /rules/test {limit}` → gợi ý phân loại lại.

## Import / Export / Reconcile
`POST /import` — `{file_name, preset: vcb|tcb|mb|acb|bidv|generic, account_id, content_base64}` → `{job_id, total, ready, duplicates, errors}`.
`POST /import/preview` — `{job_id}` → rows kèm parsed/suggestion/dup/error.
`POST /import/commit` — `{job_id, skip_duplicates=true}` → `{imported, skipped}`; emit `sw.import.completed`.
`GET /export/ledger-csv?from&to` → `{file_name, mime, content}` · `GET /export/report-xlsx?month` → `{file_name, mime, content_base64}` (3 sheet).
`POST /reconcile` — `{account_id, actual_balance, note?, occurred_at?}` → adjust tx đúng dấu; sổ khớp → 422 RECONCILE_NO_DIFF.

## Charts / Insights / Reports
`GET /charts/donut?month&kind` · `/charts/candles?account_id?&from&to` (bỏ account_id = nến portfolio gộp) · `/charts/waterfall?month` · `/charts/heatmap?month` · `/charts/trend?from&to`.
`GET /insights/anomalies?lookback_days` (5 loại; emit `sw.anomaly.detected`) · `GET /insights/runway?horizon_days`.
`GET /reports/{executive|cashflow|expense|income|budget|debt|networth|recurring|narrate}?month`.

## Vận hành
`POST /maintenance/rebuild-snapshots` · `POST /scheduled/run {now?}` (recurring + nhắc nợ + rebuild + networth + anomaly) · `GET /audit?limit≤200`.

## Events (outbox topics)
`sw.transaction.created` · `sw.transaction.reversed` · `sw.budget.exceeded` · `sw.debt.due` · `sw.goal.reached` · `sw.import.completed` · `sw.anomaly.detected` · `sw.recurring.posted` — payload luôn kèm `org_id` + `owner_user_id`. Subscribes: không (module độc lập).
