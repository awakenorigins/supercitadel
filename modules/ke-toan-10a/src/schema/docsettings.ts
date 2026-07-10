import { integer, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { ketoan10a, tenantColumns, timestampColumns } from "./_shared.js";

/**
 * V12 ⑤ — Cấu hình số chứng từ TÙY CHỈNH per-org + per-loại (Q4 anh Nắng chốt: CẢ HAI
 * format tùy chỉnh + sửa tay có check trùng).
 *
 * format hỗ trợ placeholder: {prefix} {year} {yy} {month} {seq}
 * Ví dụ: "{prefix}-{year}-{seq}" → PT-2026-000123 (mặc định, khớp Misa PT/PC/BH/MH)
 *         "{prefix}{yy}{month}/{seq}" → PT2607/000123
 */
export const docNumberSettings = ketoan10a.table(
  "doc_number_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,

    /** Loại: "RECEIPT" | "PAYMENT" | "INVOICE" | "BILL" | "JOURNAL" | "ADV". */
    docType: varchar("doc_type", { length: 20 }).notNull(),
    /** Tiền tố, ví dụ "PT", "PC", "HD". */
    prefix: varchar("prefix", { length: 12 }).notNull(),
    /** Số chữ số phần sequence (zero-pad), 1..10. */
    pad: integer("pad").notNull().default(6),
    /** Chuỗi format với placeholder. */
    format: varchar("format", { length: 60 }).notNull().default("{prefix}-{year}-{seq}"),

    ...timestampColumns,
  },
  (t) => ({
    orgTypeUnique: uniqueIndex("docnum_settings_org_type_uq").on(t.orgId, t.docType),
  }),
);

export type DocNumberSetting = typeof docNumberSettings.$inferSelect;
