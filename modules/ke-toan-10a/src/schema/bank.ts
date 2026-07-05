import { relations } from "drizzle-orm";
import {
  date,
  index,
  integer,
  numeric,
  pgEnum,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { ketoan10a, tenantColumns, timestampColumns } from "./_shared.js";

/** Trạng thái đối chiếu của 1 dòng sao kê. */
export const bankTxnStatusEnum = ketoan10a.enum("bank_txn_status", [
  "UNMATCHED",
  "MATCHED",
]);

/**
 * Dòng sao kê ngân hàng đã nhập. amount dương = tiền vào, âm = tiền ra.
 * Khi khớp (matched) với 1 bút toán trên TK tiền gửi, lưu matchedEntryId.
 */
export const bankTransactions = ketoan10a.table(
  "bank_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,

    bankAccountId: uuid("bank_account_id").notNull(),
    txnDate: date("txn_date").notNull(),
    description: varchar("description", { length: 512 }).notNull().default(""),
    reference: varchar("reference", { length: 128 }),
    /** Dương = tiền vào, âm = tiền ra. */
    amount: numeric("amount", { precision: 20, scale: 2 }).notNull(),

    status: bankTxnStatusEnum("status").notNull().default("UNMATCHED"),
    matchedEntryId: uuid("matched_entry_id"),
    importBatch: varchar("import_batch", { length: 64 }),

    ...timestampColumns,
  },
  (t) => ({
    orgBankIdx: index("bt_org_bank_idx").on(t.orgId, t.bankAccountId),
    orgStatusIdx: index("bt_org_status_idx").on(t.orgId, t.status),
    orgDateIdx: index("bt_org_date_idx").on(t.orgId, t.txnDate),
  }),
);

/**
 * Quy tắc tự phân loại dòng sao kê chưa khớp: nếu description chứa `matchText`,
 * sinh chứng từ với TK đối ứng `counterAccountId`.
 */
export const bankRules = ketoan10a.table(
  "bank_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,

    matchText: varchar("match_text", { length: 255 }).notNull(),
    counterAccountId: uuid("counter_account_id").notNull(),
    /** Ưu tiên cao chạy trước. */
    priority: integer("priority").notNull().default(0),

    ...timestampColumns,
  },
  (t) => ({
    orgPriorityIdx: index("br_org_priority_idx").on(t.orgId, t.priority),
  }),
);

export const bankTransactionsRelations = relations(bankTransactions, () => ({}));
export const bankRulesRelations = relations(bankRules, () => ({}));

export type BankTransaction = typeof bankTransactions.$inferSelect;
export type NewBankTransaction = typeof bankTransactions.$inferInsert;
export type BankRule = typeof bankRules.$inferSelect;
export type NewBankRule = typeof bankRules.$inferInsert;
