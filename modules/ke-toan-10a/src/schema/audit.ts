import { index, integer, jsonb, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import {
  ketoan10a,
  tenantColumns,
  timestampColumns,
} from "./_shared.js";

/**
 * Sổ nhật ký kiểm toán (Audit Log).
 * Ghi lại MỌI hành động thay đổi dữ liệu tài chính: ai, làm gì, khi nào, dữ liệu gì.
 * Bất biến — chỉ insert, không update/delete.
 */
export const auditLog = ketoan10a.table(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,

    /** Hành động: "receipt.post", "account.create", "journal.reverse"... */
    action: varchar("action", { length: 80 }).notNull(),
    /** Loại thực thể: "receipt", "payment", "invoice", "account"... */
    entityType: varchar("entity_type", { length: 40 }).notNull(),
    entityId: uuid("entity_id"),

    /** Ai thực hiện — user id hoặc "tieu-tam" nếu do AI. */
    actor: varchar("actor", { length: 128 }).notNull(),
    /** Nguồn: "web", "api", "tieu-tam". */
    source: varchar("source", { length: 40 }).notNull().default("api"),

    /** Payload chi tiết (before/after, số tiền...). */
    detail: jsonb("detail"),

    ...timestampColumns,
  },
  (t) => ({
    orgCreatedIdx: index("audit_org_created_idx").on(t.orgId, t.createdAt),
    entityIdx: index("audit_entity_idx").on(t.entityType, t.entityId),
    actorIdx: index("audit_actor_idx").on(t.actor),
  }),
);

/**
 * Bộ đếm số chứng từ theo org + loại + năm.
 * Đảm bảo số phiếu/bút toán tăng liên tục, không trùng, không nhảy cóc.
 */
export const docCounters = ketoan10a.table(
  "doc_counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,

    /** Loại: "RECEIPT", "PAYMENT", "INVOICE", "BILL", "JOURNAL". */
    docType: varchar("doc_type", { length: 20 }).notNull(),
    /** Năm tài chính. */
    year: integer("year").notNull(),
    /** Giá trị đếm hiện tại. */
    counter: integer("counter").notNull().default(0),

    ...timestampColumns,
  },
  (t) => ({
    orgTypeYearUnique: uniqueIndex("counters_org_type_year_uq").on(
      t.orgId,
      t.docType,
      t.year,
    ),
  }),
);

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
export type DocCounter = typeof docCounters.$inferSelect;
