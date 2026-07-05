import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { ketoan10a, tenantColumns, timestampColumns } from "./_shared.js";

/**
 * Năm tài chính (Fiscal Year) + khóa kỳ.
 * Sau khi quyết toán, khóa kỳ (isClosed=true) để chặn hạch toán/sửa số cũ.
 * (Tinh hoa chắt từ ACC4A.)
 */
export const fiscalYears = ketoan10a.table(
  "fiscal_years",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,

    /** Tên kỳ, ví dụ "2026". */
    name: varchar("name", { length: 20 }).notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),

    /** Đã khóa kỳ chưa. */
    isClosed: boolean("is_closed").notNull().default(false),
    closedAt: timestamp("closed_at", { withTimezone: true }),

    ...timestampColumns,
  },
  (t) => ({
    orgNameUnique: uniqueIndex("fy_org_name_uq").on(t.orgId, t.name),
    orgStartIdx: index("fy_org_start_idx").on(t.orgId, t.startDate),
  }),
);

export const fiscalYearsRelations = relations(fiscalYears, () => ({}));

export type FiscalYear = typeof fiscalYears.$inferSelect;
export type NewFiscalYear = typeof fiscalYears.$inferInsert;
