import { relations } from "drizzle-orm";
import {
  date,
  index,
  numeric,
  pgEnum,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  actorColumns,
  docStatusEnum,
  ketoan10a,
  tenantColumns,
  timestampColumns,
} from "./_shared.js";

/**
 * Loại khoản ứng trước:
 *  - CUSTOMER_DEPOSIT: khách đặt cọc/trả tiền trước (Nợ tiền / Có 131).
 *  - SUPPLIER_ADVANCE: ứng trước cho nhà cung cấp (Nợ 331 / Có tiền).
 *  - EMPLOYEE_ADVANCE: tạm ứng cho nhân viên (Nợ 141 / Có tiền).
 */
export const advanceTypeEnum = ketoan10a.enum("advance_type", [
  "CUSTOMER_DEPOSIT",
  "SUPPLIER_ADVANCE",
  "EMPLOYEE_ADVANCE",
]);

/**
 * Khoản ứng trước / đặt cọc. Theo dõi số đã ứng và số đã áp (applied) vào
 * hóa đơn/quyết toán. Còn lại = amount − appliedAmount.
 */
export const advances = ketoan10a.table(
  "advances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,

    docNo: varchar("doc_no", { length: 40 }).notNull(),
    docDate: date("doc_date").notNull(),
    type: advanceTypeEnum("type").notNull(),

    /** Đối tác (khách/NCC) hoặc nhân viên (lưu tên ở description nếu không có contact). */
    contactId: uuid("contact_id"),
    partyName: varchar("party_name", { length: 255 }),

    /** TK tiền (111/112) và TK đối ứng (131/331/141). */
    cashAccountId: uuid("cash_account_id").notNull(),
    partyAccountId: uuid("party_account_id").notNull(),

    amount: numeric("amount", { precision: 20, scale: 2 }).notNull(),
    appliedAmount: numeric("applied_amount", { precision: 20, scale: 2 })
      .notNull()
      .default("0"),

    description: varchar("description", { length: 512 }),
    status: docStatusEnum("status").notNull().default("DRAFT"),
    journalEntryId: uuid("journal_entry_id"),

    ...actorColumns,
    ...timestampColumns,
  },
  (t) => ({
    orgDocNoUnique: index("advances_org_docno_idx").on(t.orgId, t.docNo),
    orgContactIdx: index("advances_org_contact_idx").on(t.orgId, t.contactId),
    orgTypeIdx: index("advances_org_type_idx").on(t.orgId, t.type),
  }),
);

export const advancesRelations = relations(advances, () => ({}));

export type Advance = typeof advances.$inferSelect;
export type NewAdvance = typeof advances.$inferInsert;
