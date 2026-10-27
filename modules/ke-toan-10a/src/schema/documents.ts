import {
  date,
  index,
  jsonb,
  numeric,
  uniqueIndex,
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
 * Phiếu thu (Receipt Voucher) — chứng từ ghi nhận tiền vào.
 * Khi POSTED sinh bút toán: Nợ TK tiền (111/112) / Có TK đối ứng (131/511...).
 */
export const receipts = ketoan10a.table(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,

    docNo: varchar("doc_no", { length: 40 }).notNull(),
    docDate: date("doc_date").notNull(),

    /** TK tiền nhận vào (thường 111 - tiền mặt hoặc 112 - ngân hàng). */
    cashAccountId: uuid("cash_account_id").notNull(),
    /** TK đối ứng (thu của ai/khoản gì): 131, 511, 711... */
    counterAccountId: uuid("counter_account_id").notNull(),

    contactId: uuid("contact_id"),

    amount: numeric("amount", { precision: 20, scale: 2 }).notNull(),

    /** Lý do thu. */
    reason: varchar("reason", { length: 512 }),
    /** Người nộp tiền. */
    payerName: varchar("payer_name", { length: 255 }),

    status: docStatusEnum("status").notNull().default("DRAFT"),
    /** Bút toán sinh ra khi ghi sổ. */
    journalEntryId: uuid("journal_entry_id"),

    ...actorColumns,
    ...timestampColumns,
  },
  (t) => ({
    orgDocNoUnique: uniqueIndex("receipts_org_docno_uq").on(t.orgId, t.docNo),
    orgDateIdx: index("receipts_org_date_idx").on(t.orgId, t.docDate),
  }),
);

/**
 * Phiếu chi (Payment Voucher) — chứng từ ghi nhận tiền ra.
 * Khi POSTED sinh bút toán: Nợ TK đối ứng (331/642...) / Có TK tiền (111/112).
 */
export const payments = ketoan10a.table(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,

    docNo: varchar("doc_no", { length: 40 }).notNull(),
    docDate: date("doc_date").notNull(),

    /** TK tiền chi ra (111/112). */
    cashAccountId: uuid("cash_account_id").notNull(),
    /** TK đối ứng (chi cho khoản gì): 331, 642, 641... */
    counterAccountId: uuid("counter_account_id").notNull(),

    contactId: uuid("contact_id"),

    amount: numeric("amount", { precision: 20, scale: 2 }).notNull(),

    reason: varchar("reason", { length: 512 }),
    /** Người nhận tiền. */
    payeeName: varchar("payee_name", { length: 255 }),

    status: docStatusEnum("status").notNull().default("DRAFT"),
    journalEntryId: uuid("journal_entry_id"),

    ...actorColumns,
    ...timestampColumns,
  },
  (t) => ({
    orgDocNoUnique: uniqueIndex("payments_org_docno_uq").on(t.orgId, t.docNo),
    orgDateIdx: index("payments_org_date_idx").on(t.orgId, t.docDate),
  }),
);

/**
 * Hoá đơn bán hàng (Sales Invoice) — công nợ phải thu.
 * Khi POSTED: Nợ 131 (phải thu) / Có 511 (doanh thu) + Có 3331 (thuế GTGT nếu có).
 */
export const invoices = ketoan10a.table(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,

    docNo: varchar("doc_no", { length: 40 }).notNull(),
    docDate: date("doc_date").notNull(),
    dueDate: date("due_date"),

    contactId: uuid("contact_id").notNull(),

    /** TK phải thu (mặc định 131). */
    receivableAccountId: uuid("receivable_account_id").notNull(),
    /** TK doanh thu (mặc định 511). */
    revenueAccountId: uuid("revenue_account_id").notNull(),
    /** TK thuế GTGT đầu ra (mặc định 3331). */
    taxAccountId: uuid("tax_account_id"),

    /** Tiền hàng trước thuế. */
    subtotal: numeric("subtotal", { precision: 20, scale: 2 }).notNull(),
    /** Thuế suất GTGT (%), ví dụ 8, 10. */
    taxRate: numeric("tax_rate", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    /** Tiền thuế. */
    taxAmount: numeric("tax_amount", { precision: 20, scale: 2 })
      .notNull()
      .default("0"),
    /** Tổng thanh toán = subtotal + taxAmount. */
    total: numeric("total", { precision: 20, scale: 2 }).notNull(),
    /** Số đã thu. */
    amountPaid: numeric("amount_paid", { precision: 20, scale: 2 })
      .notNull()
      .default("0"),

    description: varchar("description", { length: 512 }),
    /** Dòng hàng chi tiết (multi-line): [{description, qty, rate, amount}]. */
    lines: jsonb("lines").notNull().default([]),

    status: docStatusEnum("status").notNull().default("DRAFT"),
    journalEntryId: uuid("journal_entry_id"),

    ...actorColumns,
    ...timestampColumns,
  },
  (t) => ({
    orgDocNoUnique: uniqueIndex("invoices_org_docno_uq").on(t.orgId, t.docNo),
    orgDateIdx: index("invoices_org_date_idx").on(t.orgId, t.docDate),
    contactIdx: index("invoices_contact_idx").on(t.contactId),
  }),
);

/**
 * Hoá đơn mua hàng (Purchase Bill) — công nợ phải trả.
 * Khi POSTED: Nợ 156/642 (hàng/chi phí) + Nợ 1331 (thuế GTGT vào) / Có 331 (phải trả).
 */
export const bills = ketoan10a.table(
  "bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,

    docNo: varchar("doc_no", { length: 40 }).notNull(),
    docDate: date("doc_date").notNull(),
    dueDate: date("due_date"),

    contactId: uuid("contact_id").notNull(),

    /** TK phải trả (mặc định 331). */
    payableAccountId: uuid("payable_account_id").notNull(),
    /** TK chi phí/hàng hoá (156, 642...). */
    expenseAccountId: uuid("expense_account_id").notNull(),
    /** TK thuế GTGT đầu vào (mặc định 1331). */
    taxAccountId: uuid("tax_account_id"),

    subtotal: numeric("subtotal", { precision: 20, scale: 2 }).notNull(),
    taxRate: numeric("tax_rate", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    taxAmount: numeric("tax_amount", { precision: 20, scale: 2 })
      .notNull()
      .default("0"),
    total: numeric("total", { precision: 20, scale: 2 }).notNull(),
    amountPaid: numeric("amount_paid", { precision: 20, scale: 2 })
      .notNull()
      .default("0"),

    description: varchar("description", { length: 512 }),
    /** Dòng hàng chi tiết (multi-line). */
    lines: jsonb("lines").notNull().default([]),

    status: docStatusEnum("status").notNull().default("DRAFT"),
    journalEntryId: uuid("journal_entry_id"),

    ...actorColumns,
    ...timestampColumns,
  },
  (t) => ({
    orgDocNoUnique: uniqueIndex("bills_org_docno_uq").on(t.orgId, t.docNo),
    orgDateIdx: index("bills_org_date_idx").on(t.orgId, t.docDate),
    contactIdx: index("bills_contact_idx").on(t.contactId),
  }),
);

export type Receipt = typeof receipts.$inferSelect;
export type NewReceipt = typeof receipts.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type Bill = typeof bills.$inferSelect;
export type NewBill = typeof bills.$inferInsert;
