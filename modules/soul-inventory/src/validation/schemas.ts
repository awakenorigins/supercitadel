/**
 * MODULE KHO — Zod schemas (mặt cắt ⑦: biên giới canh gác)
 * Mọi đầu vào (route hay tool) validate bằng schema NGAY TẠI BIÊN.
 * Không tin dữ liệu thô. Số lượng nhận dạng string|number nhưng
 * chuẩn hóa về string decimal để giữ Hiến pháp #5.
 */
import { z } from 'zod';

/** Số lượng decimal dương, chuẩn hóa về string (tối đa 3 chữ số lẻ) */
export const zQty = z.union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d+(\.\d{1,3})?$/.test(v), 'Số lượng phải là số dương, tối đa 3 chữ số thập phân')
  .refine((v) => Number.parseFloat(v) > 0, 'Số lượng phải lớn hơn 0');

/** Số lượng decimal >= 0 (dùng cho kiểm kê: đếm được 0) */
export const zQtyZero = z.union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d+(\.\d{1,3})?$/.test(v), 'Số lượng phải là số >= 0, tối đa 3 chữ số thập phân');

/** Đơn giá VND (>= 0, 2 chữ số lẻ) — tùy chọn */
export const zUnitCost = z.union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), 'Đơn giá không hợp lệ')
  .optional();

export const zSku = z.string().trim().min(1).max(64);
export const zLocationCode = z.string().trim().min(1).max(32);

export const itemUpsertSchema = z.object({
  sku: zSku,
  name: z.string().trim().min(1).max(255),
  unit: z.string().trim().min(1).max(32).default('cái'),
  description: z.string().max(2000).optional(),
  barcode: z.string().max(64).optional(),
  min_stock: zQtyZero.default('0'),
  track_lot: z.boolean().default(false),      // bật theo dõi theo lô
  track_serial: z.boolean().default(false),   // bật theo dõi theo serial
  shelf_life_days: z.number().int().min(1).max(36500).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const receiveStockSchema = z.object({
  sku: zSku,
  location_code: zLocationCode.optional(),   // bỏ trống = kho mặc định
  quantity: zQty,
  uom: z.string().trim().min(1).max(32).optional(),  // đơn vị quy đổi (thùng/bao...) — trống = đơn vị gốc
  unit_cost: zUnitCost,
  lot_no: z.string().trim().min(1).max(80).optional(),     // số lô (vd LOT-2026-07)
  serial_no: z.string().trim().min(1).max(80).optional(),  // số serial (mỗi serial = 1 đơn vị)
  expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expiry_date dạng YYYY-MM-DD').optional(),
  ref_type: z.string().max(64).optional(),
  ref_id: z.string().max(128).optional(),
  note: z.string().max(1000).optional(),
});

export const issueStockSchema = receiveStockSchema;

export const transferStockSchema = z.object({
  sku: zSku,
  from_location_code: zLocationCode,
  to_location_code: zLocationCode,
  quantity: zQty,
  note: z.string().max(1000).optional(),
}).refine((v) => v.from_location_code !== v.to_location_code,
  'Kho nguồn và kho đích phải khác nhau');

export const queryStockSchema = z.object({
  sku: zSku.optional(),
  keyword: z.string().trim().max(255).optional(),
  location_code: zLocationCode.optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

export const lowAlertsSchema = z.object({
  location_code: zLocationCode.optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

export const reservationManageSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    sku: zSku,
    location_code: zLocationCode.optional(),
    quantity: zQty,
    ref_type: z.string().max(64).optional(),
    ref_id: z.string().max(128).optional(),
    note: z.string().max(1000).optional(),
    expires_at: z.string().datetime({ offset: true }).optional(),
  }),
  z.object({ action: z.literal('release'), reservation_id: z.string().uuid() }),
  z.object({ action: z.literal('fulfill'), reservation_id: z.string().uuid() }),
  z.object({
    action: z.literal('list'),
    status: z.enum(['active', 'fulfilled', 'released']).default('active'),
    limit: z.number().int().min(1).max(200).default(50),
  }),
]);

export const stocktakeExecuteSchema = z.object({
  location_code: zLocationCode.optional(),
  counts: z.array(z.object({ sku: zSku, counted: zQtyZero })).min(1).max(500),
  note: z.string().max(1000).optional(),
  /** true = chốt ngay và tự động điều chỉnh lệch; false = chỉ lưu nháp so sánh */
  finalize: z.boolean().default(true),
});

export const locationUpsertSchema = z.object({
  code: zLocationCode,
  name: z.string().trim().min(1).max(255),
  address: z.string().max(500).optional(),
  is_default: z.boolean().default(false),
});

export const stockCardSchema = z.object({
  sku: zSku,
  limit: z.number().int().min(1).max(200).default(50),
});

export const expiryAlertsSchema = z.object({
  within_days: z.number().int().min(1).max(3650).default(30),
  limit: z.number().int().min(1).max(200).default(50),
});

export const summarySchema = z.object({});

// ============================================================
// SOUL-INVENTORY v2.0 — schemas mới
// ============================================================

export const uomUpsertSchema = z.object({
  sku: zSku,
  uom_name: z.string().trim().min(1).max(32),
  factor: z.union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => /^\d+(\.\d{1,6})?$/.test(v) && Number.parseFloat(v) > 0,
      'factor phải là số dương (1 đơn vị này = factor × đơn vị gốc)'),
  is_purchase: z.boolean().default(false),
  is_sales: z.boolean().default(false),
  barcode: z.string().trim().max(64).optional(),
});

export const bomUpsertSchema = z.object({
  sku: zSku,
  name: z.string().trim().max(255).optional(),
  output_qty: zQty.default('1'),
  lines: z.array(z.object({
    component_sku: zSku,
    qty_per: z.union([z.string(), z.number()])
      .transform((v) => String(v).trim())
      .refine((v) => /^\d+(\.\d{1,6})?$/.test(v) && Number.parseFloat(v) > 0, 'qty_per > 0'),
    scrap_pct: z.union([z.string(), z.number()])
      .transform((v) => String(v).trim())
      .refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number.parseFloat(v) < 100, '0 ≤ scrap_pct < 100')
      .default('0'),
  })).min(1).max(100),
  note: z.string().max(1000).optional(),
});

export const assemblySchema = z.object({
  sku: zSku,
  qty: zQty,
  kind: z.enum(['assemble', 'disassemble']).default('assemble'),
  location_code: zLocationCode.optional(),
  note: z.string().max(1000).optional(),
});

export const bomInfoSchema = z.object({ sku: zSku });

export const reorderRuleSchema = z.object({
  sku: zSku,
  min_qty: zQtyZero,
  max_qty: zQty,
  location_code: zLocationCode.optional(),
  supplier_name: z.string().trim().max(255).optional(),
  lead_time_days: z.number().int().min(0).max(365).default(0),
}).refine((v) => Number.parseFloat(v.max_qty) >= Number.parseFloat(v.min_qty),
  'max_qty phải >= min_qty');

export const reorderSuggestSchema = z.object({
  limit: z.number().int().min(1).max(200).default(100),
});

export const pickingSuggestSchema = z.object({
  sku: zSku,
  quantity: zQty,
  location_code: zLocationCode.optional(),
  strategy: z.enum(['fefo', 'fifo']).optional(),
});

export const landedCostSchema = z.object({
  movement_doc_nos: z.array(z.string().trim().min(1)).max(100).optional(),
  movement_ids: z.array(z.string().uuid()).max(100).optional(),
  total_cost: z.union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number.parseFloat(v) > 0, 'total_cost > 0'),
  method: z.enum(['by_value', 'by_qty']).default('by_value'),
  note: z.string().max(1000).optional(),
}).refine((v) => (v.movement_doc_nos?.length ?? 0) > 0 || (v.movement_ids?.length ?? 0) > 0,
  'Cần chỉ định phiếu nhập để phân bổ (movement_doc_nos hoặc movement_ids)');

export const scrapSchema = z.object({
  sku: zSku,
  quantity: zQty,
  location_code: zLocationCode.optional(),
  lot_no: z.string().trim().min(1).max(80).optional(),
  serial_no: z.string().trim().min(1).max(80).optional(),
  reason: z.string().max(500).optional(),
});

export const abcAnalysisSchema = z.object({
  lookback_days: z.number().int().min(7).max(730).default(90),
});

export const stockAgingSchema = z.object({
  limit: z.number().int().min(1).max(500).default(100),
});

export const cycleCountSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
});

export const barcodeSchema = z.object({
  barcode: z.string().trim().min(1).max(64),
});

// ============================================================
// SOUL-INVENTORY v2.1 — schemas AUTOMATION
// ============================================================

export const replenishParamsSchema = z.object({
  sku: zSku,
  location_code: zLocationCode.optional(),
  service_level: z.union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => { const n = Number.parseFloat(v); return n > 0 && n < 1; },
      'service_level trong khoảng (0,1) — vd 0.95')
    .optional(),
  lead_time_days: z.number().int().min(0).max(365).optional(),
  order_cost: z.union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), 'order_cost >= 0').optional(),
  holding_cost_pct: z.union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => { const n = Number.parseFloat(v); return n >= 0 && n <= 5; },
      'holding_cost_pct là tỷ lệ/năm, vd 0.20 = 20%').optional(),
});

export const smartReplenishSchema = z.object({
  limit: z.number().int().min(1).max(500).default(100),
});

export const projectedInventorySchema = z.object({
  horizon_days: z.number().int().min(1).max(365).default(30),
  limit: z.number().int().min(1).max(500).default(100),
});

export const forecastRunSchema = z.object({
  method: z.enum(['moving_avg', 'ses']).default('moving_avg'),
  horizon_days: z.number().int().min(1).max(365).default(30),
  window_days: z.number().int().min(7).max(730).default(90),
});

export const deadStockSchema = z.object({
  idle_days: z.number().int().min(1).max(3650).default(90),
  limit: z.number().int().min(1).max(500).default(100),
});

export const xyzRunSchema = z.object({
  window_days: z.number().int().min(7).max(730).default(90),
});

export const scheduledTasksSchema = z.object({
  window_days: z.number().int().min(7).max(730).default(90),
  forecast_method: z.enum(['moving_avg', 'ses']).default('moving_avg'),
  horizon_days: z.number().int().min(1).max(365).default(30),
});
