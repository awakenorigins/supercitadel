/**
 * Lỗi có kiểu cho Kế Toán 10A. Mỗi lỗi mang mã HTTP + mã lỗi nghiệp vụ
 * để Hono trả về đúng status và Tiểu Tâm hiểu được ngữ cảnh.
 */
export class KetoanError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number = 400,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = "KetoanError";
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      detail: this.detail,
    };
  }
}

/** Bút toán không cân (Σ Nợ ≠ Σ Có). */
export class UnbalancedEntryError extends KetoanError {
  constructor(debit: string, credit: string) {
    super(
      "UNBALANCED_ENTRY",
      `Bút toán không cân: tổng Nợ (${debit}) khác tổng Có (${credit})`,
      422,
      { debit, credit },
    );
  }
}

/** Không tìm thấy thực thể. */
export class NotFoundError extends KetoanError {
  constructor(entity: string, id?: string) {
    super("NOT_FOUND", `Không tìm thấy ${entity}${id ? ` (${id})` : ""}`, 404, {
      entity,
      id,
    });
  }
}

/** Thao tác không hợp lệ với trạng thái hiện tại. */
export class InvalidStateError extends KetoanError {
  constructor(message: string, detail?: unknown) {
    super("INVALID_STATE", message, 409, detail);
  }
}

/** Thiếu/sai dữ liệu đầu vào. */
export class ValidationError extends KetoanError {
  constructor(message: string, detail?: unknown) {
    super("VALIDATION_ERROR", message, 400, detail);
  }
}

/** Vi phạm cách ly tenant (org_id không khớp). */
export class TenantViolationError extends KetoanError {
  constructor() {
    super(
      "TENANT_VIOLATION",
      "Truy cập dữ liệu ngoài phạm vi tổ chức của bạn bị chặn",
      403,
    );
  }
}
