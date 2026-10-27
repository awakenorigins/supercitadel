import { pgTable, uuid, varchar, text, date, timestamp, boolean, numeric, jsonb, index } from 'drizzle-orm/pg-core';

export const accAccounts = pgTable('acc_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  number: varchar('number', { length: 10 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  rootType: varchar('root_type', { length: 12 }).notNull(),
  isGroup: boolean('is_group').notNull().default(false),
  parentId: uuid('parent_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ orgIdx: index('acc_acct_org_idx').on(t.orgId, t.rootType) }));

export const accVouchers = pgTable('acc_vouchers', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  voucherType: varchar('voucher_type', { length: 16 }).notNull(),
  voucherNo: varchar('voucher_no', { length: 24 }).notNull(),
  postingDate: date('posting_date').notNull(),
  remarks: text('remarks'),
  total: numeric('total', { precision: 16, scale: 0 }).notNull().default('0'),
  status: varchar('status', { length: 12 }).notNull().default('posted'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const accGlEntries = pgTable('acc_gl_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  postingDate: date('posting_date').notNull(),
  accountId: uuid('account_id').notNull(),
  debit: numeric('debit', { precision: 16, scale: 0 }).notNull().default('0'),
  credit: numeric('credit', { precision: 16, scale: 0 }).notNull().default('0'),
  partyType: varchar('party_type', { length: 12 }),
  partyName: varchar('party_name', { length: 120 }),
  voucherId: uuid('voucher_id').notNull(),
  remarks: text('remarks'),
  isCancel: boolean('is_cancel').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  orgAcctIdx: index('acc_gl_org_acct_idx').on(t.orgId, t.accountId, t.postingDate),
  voucherIdx: index('acc_gl_voucher_idx').on(t.voucherId),
}));

export const accInvoices = pgTable('acc_invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  invoiceType: varchar('invoice_type', { length: 10 }).notNull(),
  partyName: varchar('party_name', { length: 120 }).notNull(),
  postingDate: date('posting_date').notNull(),
  dueDate: date('due_date'),
  lines: jsonb('lines').notNull().default([]),
  grandTotal: numeric('grand_total', { precision: 16, scale: 0 }).notNull(),
  outstanding: numeric('outstanding', { precision: 16, scale: 0 }).notNull(),
  status: varchar('status', { length: 14 }).notNull().default('unpaid'),
  voucherId: uuid('voucher_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ orgIdx: index('acc_inv_org_idx').on(t.orgId, t.invoiceType, t.status) }));

export const accPayments = pgTable('acc_payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  paymentType: varchar('payment_type', { length: 8 }).notNull(),
  partyName: varchar('party_name', { length: 120 }).notNull(),
  amount: numeric('amount', { precision: 16, scale: 0 }).notNull(),
  cashAccountId: uuid('cash_account_id').notNull(),
  invoiceId: uuid('invoice_id'),
  postingDate: date('posting_date').notNull(),
  remarks: text('remarks'),
  voucherId: uuid('voucher_id'),
  status: varchar('status', { length: 12 }).notNull().default('posted'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
