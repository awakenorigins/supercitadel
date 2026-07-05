import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  numeric,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  actorColumns,
  contactTypeEnum,
  ketoan10a,
  tenantColumns,
  timestampColumns,
} from "./_shared.js";

/**
 * Đối tác: khách hàng và nhà cung cấp.
 * Dùng cho công nợ phải thu (131) và phải trả (331).
 */
export const contacts = ketoan10a.table(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,

    /** Mã đối tác nội bộ, ví dụ "KH001", "NCC001". */
    code: varchar("code", { length: 40 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    type: contactTypeEnum("type").notNull().default("CUSTOMER"),

    taxCode: varchar("tax_code", { length: 40 }),
    phone: varchar("phone", { length: 40 }),
    email: varchar("email", { length: 255 }),
    address: varchar("address", { length: 512 }),

    isActive: boolean("is_active").notNull().default(true),

    /** Hạn mức công nợ (0 = không giới hạn). Cảnh báo khi vượt. */
    creditLimit: numeric("credit_limit", { precision: 20, scale: 2 })
      .notNull()
      .default("0"),
    /** Điều khoản thanh toán mặc định (số ngày, ví dụ 30). 0 = không đặt. */
    paymentTermDays: integer("payment_term_days").notNull().default(0),

    ...actorColumns,
    ...timestampColumns,
  },
  (t) => ({
    orgCodeUnique: uniqueIndex("contacts_org_code_uq").on(t.orgId, t.code),
    orgTypeIdx: index("contacts_org_type_idx").on(t.orgId, t.type),
    orgNameIdx: index("contacts_org_name_idx").on(t.orgId, t.name),
  }),
);

export const contactsRelations = relations(contacts, () => ({}));

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
