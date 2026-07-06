/**
 * MODULE KHO — kiểu dữ liệu chung
 * Mặt cắt ⑤: giao tiếp CHỈ qua event bus, payload LUÔN mang org_id.
 * Module không import thẳng module khác — host tiêm (inject) bus + db.
 */
import type { PgDatabase } from 'drizzle-orm/pg-core';

/** Database instance do host tiêm vào (node-postgres / pglite / bất kỳ driver pg nào của Drizzle) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type KhoDb = PgDatabase<any, any, any>;

/** Payload event bắt buộc mang org_id (mặt cắt ⑤) */
export interface KhoEventPayload {
  org_id: string;
  [key: string]: unknown;
}

/** Event bus trung lập — host (Citadel core) cung cấp implementation thật */
export interface EventBus {
  emit(name: `kho.${string}`, payload: KhoEventPayload): void | Promise<void>;
}

/** Ngữ cảnh tenant cho MỌI lời gọi service/tool.
 *  Trong Citadel thật: middleware tenant-rls đã SET LOCAL app.current_org_id
 *  trước khi handler chạy; ctx này chỉ mang danh tính để ghi audit/event. */
export interface KhoCtx {
  db: KhoDb;
  orgId: string;
  userId?: string;
  bus: EventBus;
}

/** Lỗi nghiệp vụ có mã — Tiểu Tâm đọc code để phản hồi người dùng chính xác */
export class KhoError extends Error {
  constructor(
    public code:
      | 'ITEM_NOT_FOUND' | 'LOCATION_NOT_FOUND' | 'INSUFFICIENT_STOCK'
      | 'RESERVATION_NOT_FOUND' | 'RESERVATION_NOT_ACTIVE'
      | 'STOCKTAKE_NOT_FOUND' | 'STOCKTAKE_ALREADY_FINAL' | 'INVALID_INPUT'
      | 'LOT_REQUIRED' | 'LOT_NOT_FOUND'
      | 'UOM_NOT_FOUND' | 'BARCODE_NOT_FOUND'
      | 'BOM_NOT_FOUND' | 'BOM_EMPTY' | 'INSUFFICIENT_COMPONENT'
      | 'REORDER_RULE_NOT_FOUND' | 'MOVEMENT_NOT_FOUND' | 'LANDED_COST_INVALID'
      | 'REPLENISH_PARAMS_NOT_FOUND' | 'DEMAND_STATS_MISSING',
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'KhoError';
  }
}

/** Bus no-op cho môi trường standalone/test khi host chưa nối event bus */
export const noopBus: EventBus = { emit: () => {} };
