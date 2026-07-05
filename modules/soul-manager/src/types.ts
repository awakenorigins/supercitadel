/**
 * SOUL-MANAGER — kiểu dữ liệu chung
 * Mặt cắt ⑤: giao tiếp CHỈ qua event bus, payload LUÔN mang org_id.
 * Module không import thẳng module khác — host tiêm (inject) bus + db.
 */
import type { PgDatabase } from 'drizzle-orm/pg-core';

/** Database instance do host tiêm vào (node-postgres / pglite / driver pg bất kỳ của Drizzle) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HrDb = PgDatabase<any, any, any>;

/** Payload event bắt buộc mang org_id (mặt cắt ⑤) */
export interface HrEventPayload {
  org_id: string;
  [key: string]: unknown;
}

/** Event bus trung lập — host (Citadel core) cung cấp implementation thật */
export interface EventBus {
  emit(name: `hr.${string}`, payload: HrEventPayload): void | Promise<void>;
}

/** Ngữ cảnh tenant cho MỌI lời gọi service/tool.
 *  Trong Citadel thật: middleware tenant-rls đã SET LOCAL app.current_org_id
 *  trước khi handler chạy; ctx này chỉ mang danh tính để ghi audit/event. */
export interface HrCtx {
  db: HrDb;
  orgId: string;
  userId?: string;
  bus: EventBus;
}

/** Mã lỗi nghiệp vụ — Tiểu Tâm đọc code để phản hồi người dùng chính xác */
export type HrErrorCode =
  | 'EMPLOYEE_NOT_FOUND'
  | 'EMPLOYEE_CODE_TAKEN'
  | 'EMPLOYEE_NOT_ACTIVE'
  | 'DEPARTMENT_NOT_FOUND'
  | 'SHIFT_NOT_FOUND'
  | 'ATTENDANCE_DUPLICATE'
  | 'INVALID_TIME_RANGE'
  | 'LEAVE_TYPE_NOT_FOUND'
  | 'LEAVE_REQUEST_NOT_FOUND'
  | 'LEAVE_NOT_PENDING'
  | 'LEAVE_INSUFFICIENT_BALANCE'
  | 'LEAVE_SPANS_MONTHS'
  | 'PERIOD_LOCKED'
  | 'PERIOD_NOT_FOUND'
  | 'PERIOD_NOT_CALCULATED'
  | 'PAYSLIP_NOT_FOUND'
  | 'OPENING_NOT_FOUND'
  | 'CANDIDATE_NOT_FOUND'
  | 'COURSE_NOT_FOUND'
  | 'ENROLLMENT_NOT_FOUND'
  | 'INVALID_INPUT';

/** Lỗi nghiệp vụ có mã máy đọc + details (KhoError-style) */
export class HrError extends Error {
  constructor(
    public code: HrErrorCode,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'HrError';
  }
}

/** Bus no-op cho môi trường standalone/test khi host chưa nối event bus */
export const noopBus: EventBus = { emit: () => {} };
