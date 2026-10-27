import { date, index, integer, jsonb, numeric, uuid, varchar } from "drizzle-orm/pg-core";
import { ketoan10a, tenantColumns, timestampColumns } from "./_shared.js";

/**
 * V12 ⑨ — CHUỖI CÔNG NỢ TỰ ĐỘNG (Q1 anh Nắng chốt: xác thực trả tiền →
 * TỰ ĐỘNG hạch toán cấn trừ chính xác cả chuỗi, kể cả đa tiền tệ tại ngày
 * thanh toán). Một lần khách/NCC trả tiền = 1 chain, tự phân bổ FIFO vào
 * các hóa đơn còn nợ (cũ nhất trước), sinh 1 bút toán gộp.
 */
export const debtChains = ketoan10a.table(
  "debt_chains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,

    /** "sales" = khách trả (thu, cấn 131) · "purchase" = trả NCC (chi, cấn 331). */
    chainType: varchar("chain_type", { length: 10 }).notNull(),
    contactId: uuid("contact_id").notNull(),
    docDate: date("doc_date").notNull(),

    /** Tổng tiền VND đã phân bổ vào chuỗi. */
    totalAmount: numeric("total_amount", { precision: 20, scale: 2 }).notNull(),
    /** Phần tiền thừa chưa phân bổ hết (nếu trả dư — ghi nhận để xử lý sau). */
    unallocated: numeric("unallocated", { precision: 20, scale: 2 }).notNull().default("0"),

    /** Đa tiền tệ tại ngày thanh toán (chuẩn core V12 ⑥). */
    currency: varchar("currency", { length: 3 }).notNull().default("VND"),
    exchangeRate: numeric("exchange_rate", { precision: 18, scale: 6 }).notNull().default("1"),
    amountOC: numeric("amount_oc", { precision: 20, scale: 2 }),
    rateNote: varchar("rate_note", { length: 255 }),

    /** TK tiền (111/112). */
    cashAccountId: uuid("cash_account_id").notNull(),
    /** Bút toán gộp của cả chuỗi. */
    journalEntryId: uuid("journal_entry_id"),
    /** Số chứng từ liên quan. */
    memo: varchar("memo", { length: 512 }),

    /** Links chi tiết: [{docId, docNo, applied, remainingAfter}] — thứ tự cấn trừ. */
    links: jsonb("links").notNull().default([]),
    linkCount: integer("link_count").notNull().default(0),

    ...timestampColumns,
  },
  (t) => ({
    orgContactIdx: index("debt_chains_org_contact_idx").on(t.orgId, t.contactId),
    orgDateIdx: index("debt_chains_org_date_idx").on(t.orgId, t.docDate),
  }),
);

export type DebtChain = typeof debtChains.$inferSelect;
