import { relations } from "drizzle-orm";
import { boolean, index, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { ketoan10a, tenantColumns, timestampColumns } from "./_shared.js";

/** Loại chiều phân tích. */
export const costCenterTypeEnum = ketoan10a.enum("cost_center_type", [
  "DEPARTMENT",
  "PROJECT",
  "BRANCH",
  "PRODUCT",
  "OTHER",
]);

/**
 * Bộ phận / dự án / chi nhánh — chiều phân tích (accounting dimension). Gắn vào
 * dòng bút toán (journal_lines.cost_center_id) để phân tích lãi lỗ theo chiều.
 */
export const costCenters = ketoan10a.table(
  "cost_centers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,

    code: varchar("code", { length: 40 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    type: costCenterTypeEnum("type").notNull().default("DEPARTMENT"),
    parentId: uuid("parent_id"),
    isActive: boolean("is_active").notNull().default(true),

    ...timestampColumns,
  },
  (t) => ({
    orgCodeUnique: uniqueIndex("cc_org_code_uq").on(t.orgId, t.code),
    orgTypeIdx: index("cc_org_type_idx").on(t.orgId, t.type),
  }),
);

export const costCentersRelations = relations(costCenters, () => ({}));

export type CostCenter = typeof costCenters.$inferSelect;
export type NewCostCenter = typeof costCenters.$inferInsert;
