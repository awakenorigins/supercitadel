import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { ketoan10a, tenantColumns, timestampColumns } from "./_shared.js";

/** Loại chứng từ sinh ra định kỳ. */
export const recurringKindEnum = ketoan10a.enum("recurring_kind", [
  "RECEIPT",
  "PAYMENT",
  "JOURNAL",
]);

/** Tần suất lặp. */
export const recurringFreqEnum = ketoan10a.enum("recurring_freq", [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "YEARLY",
]);

/**
 * Mẫu giao dịch định kỳ (tiền thuê, lương, phí cố định...). Khi tới hạn
 * (nextRunDate ≤ hôm nay), sinh chứng từ tương ứng từ `payload` và dời hạn.
 */
export const recurringTemplates = ketoan10a.table(
  "recurring_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,

    name: varchar("name", { length: 255 }).notNull(),
    kind: recurringKindEnum("kind").notNull(),
    frequency: recurringFreqEnum("frequency").notNull(),
    /** Bội số tần suất (mỗi N kỳ), mặc định 1. */
    interval: integer("interval").notNull().default(1),

    /** Tham số dựng chứng từ (giống input của service tương ứng). */
    payload: jsonb("payload").notNull(),

    nextRunDate: date("next_run_date").notNull(),
    lastRunDate: date("last_run_date"),
    /** Số lần đã sinh. */
    runCount: integer("run_count").notNull().default(0),
    /** Dừng sau ngày này (tùy chọn). */
    endDate: date("end_date"),

    isActive: boolean("is_active").notNull().default(true),

    ...timestampColumns,
  },
  (t) => ({
    orgActiveIdx: index("recurring_org_active_idx").on(t.orgId, t.isActive),
    orgNextIdx: index("recurring_org_next_idx").on(t.orgId, t.nextRunDate),
  }),
);

export const recurringTemplatesRelations = relations(recurringTemplates, () => ({}));

export type RecurringTemplate = typeof recurringTemplates.$inferSelect;
export type NewRecurringTemplate = typeof recurringTemplates.$inferInsert;
