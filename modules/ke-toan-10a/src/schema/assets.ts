import { relations } from "drizzle-orm";
import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { ketoan10a, tenantColumns, timestampColumns } from "./_shared.js";

/** Trạng thái TSCĐ. */
export const assetStatusEnum = ketoan10a.enum("asset_status", [
  "ACTIVE",
  "FULLY_DEPRECIATED",
  "DISPOSED",
]);

/**
 * Tài sản cố định + khấu hao (đường thẳng). Khấu hao tháng =
 * (cost − salvageValue) / usefulLifeMonths. Lũy kế tối đa = cost − salvage.
 */
export const fixedAssets = ketoan10a.table(
  "fixed_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,

    code: varchar("code", { length: 40 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),

    cost: numeric("cost", { precision: 20, scale: 2 }).notNull(),
    salvageValue: numeric("salvage_value", { precision: 20, scale: 2 })
      .notNull()
      .default("0"),
    usefulLifeMonths: integer("useful_life_months").notNull(),
    accumulatedDepreciation: numeric("accumulated_depreciation", { precision: 20, scale: 2 })
      .notNull()
      .default("0"),

    startDate: date("start_date").notNull(),
    /** Kỳ khấu hao gần nhất đã ghi (YYYY-MM-01). */
    lastDepreciationDate: date("last_depreciation_date"),

    /** TK nguyên giá (211), hao mòn (214), chi phí (642/641). */
    assetAccountId: uuid("asset_account_id").notNull(),
    depreciationAccountId: uuid("depreciation_account_id").notNull(),
    expenseAccountId: uuid("expense_account_id").notNull(),
    /**
     * V12 ⑦ — Phân bổ khấu hao NHIỀU TK chi phí (soi Misa: bảng phân bổ nhiều dòng).
     * [{accountId, code, percent}] — tổng percent = 100. Null = dùng expenseAccountId 100%.
     */
    allocations: jsonb("allocations"),

    status: assetStatusEnum("status").notNull().default("ACTIVE"),

    ...timestampColumns,
  },
  (t) => ({
    orgCodeIdx: index("fa_org_code_idx").on(t.orgId, t.code),
    orgStatusIdx: index("fa_org_status_idx").on(t.orgId, t.status),
  }),
);

export const fixedAssetsRelations = relations(fixedAssets, () => ({}));

export type FixedAsset = typeof fixedAssets.$inferSelect;
export type NewFixedAsset = typeof fixedAssets.$inferInsert;
