/**
 * SOUL-RESTAURANT — kiểu dữ liệu chung
 * Mặt cắt ⑤: giao tiếp CHỈ qua event bus, payload LUÔN mang org_id.
 * Module không import thẳng module khác — host tiêm (inject) bus + db.
 * Tích hợp Kho (trừ nguyên liệu theo recipe) đi qua event
 * `resto.stock.deduct_requested` — soft-dependency: không có Kho vẫn chạy.
 */
import type { PgDatabase } from 'drizzle-orm/pg-core';

/** Database instance do host tiêm vào (node-postgres / pglite / driver pg bất kỳ của Drizzle) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RestoDb = PgDatabase<any, any, any>;

/** Payload event bắt buộc mang org_id (mặt cắt ⑤) */
export interface RestoEventPayload {
  org_id: string;
  [key: string]: unknown;
}

/** Event bus trung lập — host (Citadel core) cung cấp implementation thật */
export interface EventBus {
  emit(name: `resto.${string}`, payload: RestoEventPayload): void | Promise<void>;
}

/** Ngữ cảnh tenant cho MỌI lời gọi service/tool.
 *  Trong Citadel thật: middleware tenant-rls đã SET LOCAL app.current_org_id
 *  trước khi handler chạy; ctx này mang danh tính để ghi audit/event. */
export interface RestoCtx {
  db: RestoDb;
  orgId: string;
  userId?: string;
  bus: EventBus;
}

/** Lỗi nghiệp vụ có mã — Tiểu Tâm đọc code để phản hồi người dùng chính xác */
export class RestoError extends Error {
  constructor(
    public code:
      | 'AREA_NOT_FOUND' | 'TABLE_NOT_FOUND' | 'TABLE_BUSY' | 'TABLE_INACTIVE'
      | 'STATION_NOT_FOUND' | 'CATEGORY_NOT_FOUND'
      | 'MENU_ITEM_NOT_FOUND' | 'MENU_ITEM_AMBIGUOUS' | 'MENU_ITEM_SOLD_OUT'
      | 'MENU_ITEM_INACTIVE' | 'COMBO_INVALID' | 'OPTION_INVALID'
      | 'ORDER_NOT_FOUND' | 'ORDER_NOT_OPEN' | 'ORDER_EMPTY'
      | 'ORDER_ITEM_NOT_FOUND' | 'ITEM_NOT_CANCELLABLE' | 'ITEM_NOT_SERVABLE'
      | 'NOTHING_TO_SEND' | 'KOT_NOT_FOUND' | 'INVALID_STATUS_FLOW'
      | 'NOTHING_TO_BILL' | 'ITEMS_ALREADY_BILLED' | 'BILL_NOT_FOUND'
      | 'BILL_ALREADY_PAID' | 'BILL_NOT_UNPAID' | 'PAYMENT_INVALID'
      | 'ORDER_HAS_PAID_BILL'
      | 'RESERVATION_NOT_FOUND' | 'RESERVATION_CONFLICT'
      | 'RECIPE_EMPTY' | 'DISCOUNT_INVALID' | 'INVALID_INPUT'
      // v1.1 — khuyến mãi & khách hàng thân thiết
      | 'PROMO_NOT_FOUND' | 'PROMO_INACTIVE' | 'PROMO_NOT_APPLICABLE'
      | 'PROMO_LIMIT_REACHED' | 'PROMO_INVALID'
      | 'CUSTOMER_NOT_FOUND' | 'CUSTOMER_INVALID'
      | 'LOYALTY_DISABLED' | 'LOYALTY_NO_CUSTOMER'
      | 'LOYALTY_BELOW_MIN' | 'LOYALTY_INSUFFICIENT',
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'RestoError';
  }
}

/** Bus no-op cho môi trường standalone/test khi host chưa nối event bus */
export const noopBus: EventBus = { emit: () => {} };
