import { relations } from "drizzle-orm";
import {
  date,
  index,
  integer,
  numeric,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";
import {
  actorColumns,
  docStatusEnum,
  ketoan10a,
  sourceTypeEnum,
  tenantColumns,
  timestampColumns,
} from "./_shared.js";

/**
 * Bút toán (Journal Entry) — phần đầu.
 * Mỗi bút toán gồm nhiều dòng (journalLines) và PHẢI cân: Σ Nợ = Σ Có.
 * Sau khi POSTED thì bất biến; muốn sửa phải tạo bút toán đảo (reversal).
 */
export const journalEntries = ketoan10a.table(
  "journal_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,

    /** Số bút toán tự tăng theo org, ví dụ "BT-2026-000123". */
    entryNo: varchar("entry_no", { length: 40 }).notNull(),

    /** Ngày hạch toán. */
    entryDate: date("entry_date").notNull(),

    /** Diễn giải bút toán. */
    memo: varchar("memo", { length: 512 }),

    status: docStatusEnum("status").notNull().default("DRAFT"),

    /** Chứng từ gốc: loại + id. Cho phép truy vết ngược về phiếu thu/chi/hoá đơn. */
    sourceType: sourceTypeEnum("source_type").notNull().default("MANUAL"),
    sourceId: uuid("source_id"),

    /** Tổng tiền bút toán (= tổng Nợ = tổng Có). Denormalize để query nhanh. */
    totalAmount: numeric("total_amount", { precision: 20, scale: 2 })
      .notNull()
      .default("0"),

    currency: varchar("currency", { length: 8 }).notNull().default("VND"),
    /** Tỷ giá so với VND (1 nếu là VND). */
    exchangeRate: numeric("exchange_rate", { precision: 18, scale: 6 })
      .notNull()
      .default("1"),

    /** Nếu là bút toán đảo, trỏ về bút toán gốc. */
    reversalOf: uuid("reversal_of"),

    ...actorColumns,
    ...timestampColumns,
  },
  (t) => ({
    orgEntryNoUnique: uniqueIndex("je_org_entryno_uq").on(t.orgId, t.entryNo),
    orgDateIdx: index("je_org_date_idx").on(t.orgId, t.entryDate),
    orgStatusIdx: index("je_org_status_idx").on(t.orgId, t.status),
    sourceIdx: index("je_source_idx").on(t.sourceType, t.sourceId),
  }),
);

/**
 * Dòng bút toán (Journal Line) — chi tiết Nợ/Có từng tài khoản.
 * Một dòng chỉ được có Nợ HOẶC Có, không cả hai (enforce ở service).
 */
export const journalLines = ketoan10a.table(
  "journal_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,

    entryId: uuid("entry_id")
      .notNull()
      .references(() => journalEntries.id, { onDelete: "cascade" }),

    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),

    /** Số phát sinh Nợ (>= 0). */
    debit: numeric("debit", { precision: 20, scale: 2 })
      .notNull()
      .default("0"),
    /** Số phát sinh Có (>= 0). */
    credit: numeric("credit", { precision: 20, scale: 2 })
      .notNull()
      .default("0"),

    /** Diễn giải dòng. */
    memo: varchar("memo", { length: 512 }),

    /** Đối tác liên quan (cho công nợ), nếu có. */
    contactId: uuid("contact_id"),

    /** Bộ phận/dự án (dimension) để phân tích lãi lỗ theo chiều, nếu có. */
    costCenterId: uuid("cost_center_id"),

    /** Thứ tự dòng trong bút toán. */
    lineNo: integer("line_no").notNull().default(0),

    ...timestampColumns,
  },
  (t) => ({
    entryIdx: index("jl_entry_idx").on(t.entryId),
    orgAccountIdx: index("jl_org_account_idx").on(t.orgId, t.accountId),
    contactIdx: index("jl_contact_idx").on(t.contactId),
  }),
);

export const journalEntriesRelations = relations(
  journalEntries,
  ({ many, one }) => ({
    lines: many(journalLines),
    reversalTarget: one(journalEntries, {
      fields: [journalEntries.reversalOf],
      references: [journalEntries.id],
      relationName: "je_reversal",
    }),
  }),
);

export const journalLinesRelations = relations(journalLines, ({ one }) => ({
  entry: one(journalEntries, {
    fields: [journalLines.entryId],
    references: [journalEntries.id],
  }),
  account: one(accounts, {
    fields: [journalLines.accountId],
    references: [accounts.id],
  }),
}));

export type JournalEntry = typeof journalEntries.$inferSelect;
export type NewJournalEntry = typeof journalEntries.$inferInsert;
export type JournalLine = typeof journalLines.$inferSelect;
export type NewJournalLine = typeof journalLines.$inferInsert;
