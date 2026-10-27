import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  numeric,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  accountTypeEnum,
  actorColumns,
  ketoan10a,
  normalBalanceEnum,
  tenantColumns,
  timestampColumns,
} from "./_shared.js";
import { journalLines } from "./journals.js";

/**
 * Hệ thống tài khoản (Chart of Accounts).
 * Mã tài khoản theo Thông tư 133/2016/TT-BTC (ví dụ 111 = Tiền mặt).
 * Hỗ trợ tài khoản cha-con (parentId) để lên báo cáo phân cấp.
 */
export const accounts = ketoan10a.table(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,

    /** Mã tài khoản, ví dụ "111", "1111", "131". */
    code: varchar("code", { length: 20 }).notNull(),
    /** Tên tài khoản, ví dụ "Tiền mặt". */
    name: varchar("name", { length: 255 }).notNull(),

    type: accountTypeEnum("type").notNull(),
    normalBalance: normalBalanceEnum("normal_balance").notNull(),

    /** Tài khoản cha (self-reference) — null nếu là tài khoản cấp 1. */
    parentId: uuid("parent_id"),

    /** Số dư đầu kỳ (VND). Dùng khi khởi tạo dữ liệu. */
    openingBalance: numeric("opening_balance", { precision: 20, scale: 2 })
      .notNull()
      .default("0"),

    /** Tài khoản hệ thống (không cho xoá) — vd tài khoản mặc định. */
    isSystem: boolean("is_system").notNull().default(false),
    /** Cho phép ghi bút toán trực tiếp (tài khoản cha thường = false). */
    isPostable: boolean("is_postable").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),

    description: varchar("description", { length: 512 }),

    ...actorColumns,
    ...timestampColumns,
  },
  (t) => ({
    // Mã tài khoản là duy nhất TRONG một org (không phải toàn hệ thống).
    orgCodeUnique: uniqueIndex("accounts_org_code_uq").on(t.orgId, t.code),
    orgTypeIdx: index("accounts_org_type_idx").on(t.orgId, t.type),
    parentIdx: index("accounts_parent_idx").on(t.parentId),
  }),
);

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  parent: one(accounts, {
    fields: [accounts.parentId],
    references: [accounts.id],
    relationName: "account_parent",
  }),
  children: many(accounts, { relationName: "account_parent" }),
  lines: many(journalLines),
}));

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
