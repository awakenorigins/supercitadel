// Error helpers — consistent ApiError construction across services.
import { ErrorCode, type ApiError } from './index.js';

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public status: number,
    public field?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
  toJSON(requestId?: string): ApiError {
    return { error: { code: this.code, message: this.message, field: this.field, requestId } };
  }
}

export const Errors = {
  unauthorized: (m = 'Chưa xác thực') => new AppError(ErrorCode.UNAUTHORIZED, m, 401),
  forbidden: (m = 'Không có quyền') => new AppError(ErrorCode.FORBIDDEN, m, 403),
  notFound: (m = 'Không tìm thấy') => new AppError(ErrorCode.NOT_FOUND, m, 404),
  validation: (m: string, field?: string) => new AppError(ErrorCode.VALIDATION, m, 400, field),
  conflict: (m: string) => new AppError(ErrorCode.CONFLICT, m, 409),
  internal: (m = 'Lỗi hệ thống') => new AppError(ErrorCode.INTERNAL, m, 500),
};
