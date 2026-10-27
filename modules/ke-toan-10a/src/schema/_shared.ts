import { pgSchema, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

/**
 * Namespace schema Postgres riêng cho Kế Toán 10A.
 * Mọi bảng nằm trong schema `ketoan10a` → cách ly hoàn toàn với core SuperCitadel
 * và các module khác. Đây là chìa khoá plug-and-play: gỡ module = drop schema.
 */
export const ketoan10a = pgSchema("ketoan10a");

/* ------------------------------------------------------------------ */
/* ENUMS                                                               */
/* ------------------------------------------------------------------ */

/** 5 loại tài khoản gốc trong kế toán kép. */
export const accountTypeEnum = ketoan10a.enum("account_type", [
  "ASSET", // Tài sản
  "LIABILITY", // Nợ phải trả
  "EQUITY", // Vốn chủ sở hữu
  "INCOME", // Doanh thu / Thu nhập
  "EXPENSE", // Chi phí
]);

/** Số dư bình thường của tài khoản (Nợ hay Có). */
export const normalBalanceEnum = ketoan10a.enum("normal_balance", [
  "DEBIT", // Nợ (Assets, Expenses)
  "CREDIT", // Có (Liabilities, Equity, Income)
]);

/** Trạng thái bút toán / chứng từ. */
export const docStatusEnum = ketoan10a.enum("doc_status", [
  "DRAFT", // Nháp — chưa ghi sổ, có thể sửa/xoá
  "POSTED", // Đã ghi sổ — bất biến, chỉ đảo được bằng bút toán ngược
  "VOIDED", // Đã huỷ (bằng bút toán đảo)
]);

/** Loại chứng từ gốc sinh ra bút toán. */
export const sourceTypeEnum = ketoan10a.enum("source_type", [
  "RECEIPT", // Phiếu thu
  "PAYMENT", // Phiếu chi
  "INVOICE", // Hoá đơn bán hàng
  "BILL", // Hoá đơn mua hàng (phải trả)
  "MANUAL", // Bút toán thủ công
  "OPENING", // Số dư đầu kỳ
]);

/** Loại đối tác. */
export const contactTypeEnum = ketoan10a.enum("contact_type", [
  "CUSTOMER", // Khách hàng
  "VENDOR", // Nhà cung cấp
  "BOTH", // Vừa khách vừa NCC
]);

/* ------------------------------------------------------------------ */
/* CỘT DÙNG CHUNG                                                      */
/* ------------------------------------------------------------------ */

/**
 * Cột tenant isolation. BẮT BUỘC có ở mọi bảng nghiệp vụ.
 * `orgId` khớp với `org_id` trong JWT của SuperCitadel.
 * Mọi truy vấn PHẢI filter theo cột này (enforce ở service layer).
 */
export const tenantColumns = {
  orgId: uuid("org_id").notNull(),
};

/** Cột audit thời gian dùng chung. */
export const timestampColumns = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

/** Cột lưu ai tạo (user id từ JWT, có thể null nếu do Tiểu Tâm tạo). */
export const actorColumns = {
  createdBy: varchar("created_by", { length: 128 }),
};
