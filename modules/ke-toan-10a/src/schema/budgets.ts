import { relations } from "drizzle-orm";
import { index, integer, numeric, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { ketoan10a, tenantColumns, timestampColumns } from "./_shared.js";

/**
 * Dự toán ngân sách theo tài khoản (và bộ phận/dự án tùy chọn) cho một năm.
 * So sánh với thực tế lấy từ sổ cái để tính chênh lệch và % đã dùng.
 */
export const budgets = ketoan10a.table(
  "budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,

    fiscalYear: varchar("fiscal_year", { length: 16 }).notNull(),
    accountId: uuid("account_id").notNull(),
    costCenterId: uuid("cost_center_id"),
    /** Ngân sách cả năm. */
    amount: numeric("amount", { precision: 20, scale: 2 }).notNull(),

    ...timestampColumns,
  },
  (t) => ({
    orgYearUnique: uniqueIndex("bg_org_year_acc_cc_uq").on(
      t.orgId,
      t.fiscalYear,
      t.accountId,
      t.costCenterId,
    ),
    orgYearIdx: index("bg_org_year_idx").on(t.orgId, t.fiscalYear),
  }),
);

export const budgetsRelations = relations(budgets, () => ({}));

export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;
