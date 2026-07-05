/** Kiểu dữ liệu dùng chung cho Kế Toán 10A. */

export type AccountType =
  | "ASSET"
  | "LIABILITY"
  | "EQUITY"
  | "INCOME"
  | "EXPENSE";

export type NormalBalance = "DEBIT" | "CREDIT";

export type DocStatus = "DRAFT" | "POSTED" | "VOIDED";

export type SourceType =
  | "RECEIPT"
  | "PAYMENT"
  | "INVOICE"
  | "BILL"
  | "MANUAL"
  | "OPENING";

export type ContactType = "CUSTOMER" | "VENDOR" | "BOTH";

/** Kết quả chuẩn khi Tiểu Tâm gọi action. */
export interface ActionResult<T = unknown> {
  ok: boolean;
  /** Câu trả lời tiếng Việt tự nhiên cho Tiểu Tâm đọc lại cho người dùng. */
  message: string;
  data?: T;
  error?: string;
}

/** Một dòng hàng trong hoá đơn nhiều dòng. */
export interface InvoiceLine {
  description: string;
  qty: number;
  rate: string; // đơn giá, chuỗi tiền
  amount: string; // = qty * rate
}
