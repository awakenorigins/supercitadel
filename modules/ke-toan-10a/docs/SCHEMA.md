# SCHEMA.md — Database Kế Toán 10A

Schema Postgres riêng **`ketoan10a`** — cách ly hoàn toàn. Gỡ = `DROP SCHEMA ketoan10a CASCADE`.
Mọi bảng có `org_id` (tenant) + `created_at`/`updated_at`. **11 bảng.**

## Enums
`account_type`: ASSET/LIABILITY/EQUITY/INCOME/EXPENSE · `normal_balance`: DEBIT/CREDIT ·
`doc_status`: DRAFT/POSTED/VOIDED · `source_type`: RECEIPT/PAYMENT/INVOICE/BILL/MANUAL/OPENING ·
`contact_type`: CUSTOMER/VENDOR/BOTH.

## Bảng

**accounts** — hệ thống TK: code(uq/org), name, type, normal_balance, parent_id, opening_balance, is_system, is_postable, is_active.

**contacts** — đối tác: code(uq/org), name, type, tax_code, phone, email, address.

**journal_entries** — bút toán đầu: entry_no(uq/org), entry_date, memo, status, source_type, source_id, total_amount, currency, exchange_rate, **reversal_of**.

**journal_lines** — dòng Nợ/Có: entry_id(FK), account_id(FK), debit, credit, memo, contact_id, line_no.
→ **CHECK tầng DB (GEM 1A)**: `debit≥0 AND credit≥0`; `NOT(debit>0 AND credit>0)`.

**receipts** — phiếu thu: doc_no(uq/org PT-), cash_account_id, counter_account_id, contact_id, amount, reason, payer_name, status, journal_entry_id.

**payments** — phiếu chi: giống receipts (PC-), payee_name.

**invoices** — hoá đơn bán: doc_no(HD-), due_date, contact_id, receivable/revenue/tax_account_id, subtotal, tax_rate, tax_amount, total, amount_paid, **lines(jsonb multi-line)**, status, journal_entry_id.

**bills** — hoá đơn mua (GEM, hoàn thiện): doc_no(BILL-), payable/expense/tax_account_id, subtotal, tax_rate, tax_amount, total, amount_paid, **lines(jsonb)**, status, journal_entry_id.

**fiscal_years** — năm tài chính (GEM ACC4A): name(uq/org), start_date, end_date, **is_closed**, closed_at.

**audit_log** — nhật ký bất biến: action, entity_type, entity_id, actor, source, detail(jsonb). Chỉ insert.

**doc_counters** — bộ đếm số CT: doc_type, year, counter — uq(org,doc_type,year), an toàn concurrency.

## 31 tài khoản seed (TT133)
**Tài sản**: 111,112,131,133(1331),138,141,152,153,154,155,156,211 ·
**Nợ phải trả**: 331,333(3331,3334),334,338,341 ·
**Vốn chủ**: 411,421 · **Doanh thu**: 511,515,711 ·
**Chi phí**: 632,635,641,642,811,821.

## Kỹ thuật
- Tiền `numeric(20,2)`, toán BigInt (xu) — không sai float.
- Multi-line: `lines jsonb = [{description,qty,rate,amount}]`.
- Immutable ledger: POSTED không sửa/xóa; đảo = reversal (gốc + đảo đều POSTED, nét 0).
- Khóa kỳ: `assertPeriodOpen` chặn hạch toán vào fiscal year `is_closed`.
