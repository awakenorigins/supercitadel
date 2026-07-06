/**
 * SOUL-WALLET 1A — Drizzle schema (mirror migrations/0000_init.sql)
 * SQL migration là NGUỒN CHÂN LÝ về DDL; file này phục vụ query typed.
 * Tiền: numeric(18,0) — đọc/ghi dạng string, tính bằng BigInt (src/types.ts#money).
 */
import {
  pgTable, uuid, text, numeric, boolean, timestamp, date,
  smallint, integer, jsonb, bigint, varchar, primaryKey,
} from 'drizzle-orm/pg-core';

const scope = {
  orgId: uuid('org_id').notNull(),
  ownerUserId: varchar('owner_user_id', { length: 128 }).notNull(),
};
const audit = {
  createdBy: varchar('created_by', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};
const vnd = (name: string) => numeric(name, { precision: 18, scale: 0 });

export const swAccounts = pgTable('sw_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...scope,
  name: text('name').notNull(),
  type: text('type').notNull(),
  currency: text('currency').notNull().default('VND'),
  statementDay: smallint('statement_day'),
  dueDay: smallint('due_day'),
  creditLimit: vnd('credit_limit'),
  termMonths: smallint('term_months'),
  interestRate: numeric('interest_rate', { precision: 9, scale: 4 }),
  maturityDate: date('maturity_date'),
  openingBalance: vnd('opening_balance').notNull().default('0'),
  icon: text('icon'),
  note: text('note'),
  isArchived: boolean('is_archived').notNull().default(false),
  ...audit,
});

export const swContacts = pgTable('sw_contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...scope,
  name: text('name').notNull(),
  kind: text('kind').notNull().default('other'),
  phone: text('phone'),
  note: text('note'),
  ...audit,
});

export const swCategories = pgTable('sw_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...scope,
  parentId: uuid('parent_id'),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  icon: text('icon'),
  isSystem: boolean('is_system').notNull().default(false),
  ...audit,
});

export const swTags = pgTable('sw_tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...scope,
  name: text('name').notNull(),
  ...audit,
});

export const swTransactions = pgTable('sw_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...scope,
  docNo: text('doc_no').notNull(),
  kind: text('kind').notNull(),
  status: text('status').notNull().default('posted'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  accountId: uuid('account_id').notNull(),
  counterAccountId: uuid('counter_account_id'),
  contactId: uuid('contact_id'),
  categoryId: uuid('category_id'),
  amount: vnd('amount').notNull(),
  currency: text('currency').notNull().default('VND'),
  memo: text('memo'),
  refNo: text('ref_no'),
  reversalOf: uuid('reversal_of'),
  importRowId: uuid('import_row_id'),
  meta: jsonb('meta'),
  ...audit,
});

export const swTransactionSplits = pgTable('sw_transaction_splits', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...scope,
  txId: uuid('tx_id').notNull(),
  categoryId: uuid('category_id'),
  amount: vnd('amount').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const swTransactionTags = pgTable('sw_transaction_tags', {
  txId: uuid('tx_id').notNull(),
  tagId: uuid('tag_id').notNull(),
  ...scope,
}, (t) => ({ pk: primaryKey({ columns: [t.txId, t.tagId] }) }));

export const swLedgerEntries = pgTable('sw_ledger_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...scope,
  txId: uuid('tx_id').notNull(),
  accountId: uuid('account_id').notNull(),
  delta: vnd('delta').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const swAttachments = pgTable('sw_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...scope,
  txId: uuid('tx_id').notNull(),
  fileName: text('file_name').notNull(),
  mime: text('mime'),
  sizeBytes: bigint('size_bytes', { mode: 'number' }),
  storageKey: text('storage_key'),
  createdBy: varchar('created_by', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const swAuditEntries = pgTable('sw_audit_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...scope,
  actor: varchar('actor', { length: 128 }).notNull(),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  before: jsonb('before'),
  after: jsonb('after'),
  isDryrun: boolean('is_dryrun').notNull().default(false),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});

export const swBudgets = pgTable('sw_budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...scope,
  name: text('name').notNull(),
  categoryId: uuid('category_id'),
  jarCode: text('jar_code'),
  amount: vnd('amount').notNull(),
  currency: text('currency').notNull().default('VND'),
  rollover: boolean('rollover').notNull().default(false),
  active: boolean('active').notNull().default(true),
  ...audit,
});

export const swBudgetPeriods = pgTable('sw_budget_periods', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...scope,
  budgetId: uuid('budget_id').notNull(),
  period: date('period').notNull(),
  planned: vnd('planned').notNull().default('0'),
  carried: vnd('carried').notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const swGoals = pgTable('sw_goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...scope,
  name: text('name').notNull(),
  target: vnd('target').notNull(),
  saved: vnd('saved').notNull().default('0'),
  currency: text('currency').notNull().default('VND'),
  deadline: date('deadline'),
  accountId: uuid('account_id'),
  reachedAt: timestamp('reached_at', { withTimezone: true }),
  ...audit,
});

export const swGoalContributions = pgTable('sw_goal_contributions', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...scope,
  goalId: uuid('goal_id').notNull(),
  amount: vnd('amount').notNull(),
  txId: uuid('tx_id'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});

export const swDebts = pgTable('sw_debts', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...scope,
  contactId: uuid('contact_id').notNull(),
  direction: text('direction').notNull(),
  principal: vnd('principal').notNull(),
  interestRate: numeric('interest_rate', { precision: 9, scale: 4 }).notNull().default('0'),
  currency: text('currency').notNull().default('VND'),
  startDate: date('start_date').notNull(),
  dueDate: date('due_date'),
  status: text('status').notNull().default('open'),
  note: text('note'),
  ...audit,
});

export const swDebtPayments = pgTable('sw_debt_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...scope,
  debtId: uuid('debt_id').notNull(),
  amount: vnd('amount').notNull(),
  paidAt: date('paid_at').notNull(),
  txId: uuid('tx_id'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const swRecurringRules = pgTable('sw_recurring_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...scope,
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  accountId: uuid('account_id').notNull(),
  categoryId: uuid('category_id'),
  contactId: uuid('contact_id'),
  amount: vnd('amount').notNull(),
  currency: text('currency').notNull().default('VND'),
  freq: text('freq').notNull(),
  intervalN: smallint('interval_n').notNull().default(1),
  nextRunAt: date('next_run_at').notNull(),
  autoPost: boolean('auto_post').notNull().default(false),
  lastAmount: vnd('last_amount'),
  active: boolean('active').notNull().default(true),
  ...audit,
});

export const swRules = pgTable('sw_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...scope,
  name: text('name').notNull(),
  priority: integer('priority').notNull().default(100),
  match: jsonb('match').notNull(),
  setFields: jsonb('set_fields').notNull(),
  active: boolean('active').notNull().default(true),
  ...audit,
});

export const swImportJobs = pgTable('sw_import_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...scope,
  fileName: text('file_name').notNull(),
  preset: text('preset').notNull(),
  accountId: uuid('account_id').notNull(),
  status: text('status').notNull().default('preview'),
  stats: jsonb('stats'),
  ...audit,
});

export const swImportRows = pgTable('sw_import_rows', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...scope,
  jobId: uuid('job_id').notNull(),
  rowNo: integer('row_no').notNull(),
  raw: jsonb('raw').notNull(),
  parsed: jsonb('parsed'),
  dupHash: text('dup_hash'),
  dupOfTx: uuid('dup_of_tx'),
  suggestion: jsonb('suggestion'),
  status: text('status').notNull().default('pending'),
  error: text('error'),
  txId: uuid('tx_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const swDocCounters = pgTable('sw_doc_counters', {
  ...scope,
  key: text('key').notNull(),
  year: integer('year').notNull(),
  seq: integer('seq').notNull().default(0),
}, (t) => ({ pk: primaryKey({ columns: [t.orgId, t.ownerUserId, t.key, t.year] }) }));

export const swSnapshotsDaily = pgTable('sw_snapshots_daily', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...scope,
  accountId: uuid('account_id').notNull(),
  day: date('day').notNull(),
  open: vnd('open').notNull().default('0'),
  high: vnd('high').notNull().default('0'),
  low: vnd('low').notNull().default('0'),
  close: vnd('close').notNull().default('0'),
  cashIn: vnd('cash_in').notNull().default('0'),
  cashOut: vnd('cash_out').notNull().default('0'),
});

export const swMonthlySummary = pgTable('sw_monthly_summary', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...scope,
  month: date('month').notNull(),
  income: vnd('income').notNull().default('0'),
  expense: vnd('expense').notNull().default('0'),
});

export const swCategoryMonthSummary = pgTable('sw_category_month_summary', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...scope,
  month: date('month').notNull(),
  categoryId: uuid('category_id'),
  kind: text('kind').notNull(),
  amount: vnd('amount').notNull().default('0'),
});

export const swNetworthSnapshots = pgTable('sw_networth_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...scope,
  month: date('month').notNull(),
  assets: vnd('assets').notNull().default('0'),
  liabilities: vnd('liabilities').notNull().default('0'),
});
