/**
 * SOUL-RESTAURANT — Zod schemas (mặt cắt ⑦: validate tại biên, không tin input).
 * Tiền: chuỗi tối đa 2 thập phân · Lượng: tối đa 3 thập phân, > 0.
 * Mọi tool/action parse qua đây trước khi chạm service.
 */
import { z } from 'zod';

export const moneyStr = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, 'Số tiền dạng "45000" hoặc "45000.50"');
export const qtyStr = z.string()
  .regex(/^\d{1,9}(\.\d{1,3})?$/, 'Số lượng dạng "2" hoặc "0.5" (tối đa 3 thập phân)')
  .refine((v) => Number.parseFloat(v) > 0, 'Số lượng phải > 0');
export const pctStr = z.string().regex(/^\d{1,3}(\.\d{1,2})?$/, 'Phần trăm dạng "5" hoặc "8.5"');
const trimmed = (max = 200) => z.string().trim().min(1).max(max);

/** order được trỏ bằng mã đơn HOẶC tên bàn — ít nhất một */
const orderRef = { order_code: trimmed(40).optional(), table: trimmed(80).optional() };
const needOrderRef = (d: { order_code?: string; table?: string }) => Boolean(d.order_code || d.table);
const ORDER_REF_MSG = 'Cần order_code hoặc table để xác định đơn';

// ───────────────────────── READ TOOLS ─────────────────────────
export const tableMapSchema = z.object({
  area: trimmed(80).optional(),
});

export const menuSearchSchema = z.object({
  query: z.string().trim().max(120).optional(),
  category: trimmed(80).optional(),
  include_soldout: z.boolean().optional().default(true),
  limit: z.number().int().min(1).max(100).optional().default(30),
});

export const itemInfoSchema = z.object({
  name: trimmed(120).optional(),
  sku: trimmed(60).optional(),
}).refine((d) => d.name || d.sku, 'Cần name hoặc sku');

export const orderViewSchema = z.object({ ...orderRef })
  .refine(needOrderRef, ORDER_REF_MSG);

export const openOrdersSchema = z.object({
  type: z.enum(['dine_in', 'takeaway', 'delivery']).optional(),
});

export const kdsQueueSchema = z.object({
  station: trimmed(80).optional(),
  status: z.enum(['queued', 'preparing', 'ready', 'active']).optional().default('active'),
  limit: z.number().int().min(1).max(100).optional().default(50),
});

export const billViewSchema = z.object({
  bill_code: trimmed(40).optional(),
  ...orderRef,
}).refine((d) => d.bill_code || d.order_code || d.table, 'Cần bill_code, order_code hoặc table');

export const reservationListSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  days: z.number().int().min(1).max(60).optional().default(7),
  include_done: z.boolean().optional().default(false),
});

export const salesReportSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const topItemsSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

export const recipeCoverageSchema = z.object({});
export const settingsViewSchema = z.object({});

// ──────────────────────── WRITE ACTIONS ───────────────────────
export const tableUpsertSchema = z.object({
  name: trimmed(80),
  area: trimmed(80).optional(),
  capacity: z.number().int().min(1).max(500).optional(),
  min_guests: z.number().int().min(1).max(500).optional(),
  shape: z.enum(['square', 'round', 'rect', 'bar']).optional(),
  active: z.boolean().optional(),
});

export const tableOpenSchema = z.object({
  table: trimmed(80).optional(),
  type: z.enum(['dine_in', 'takeaway', 'delivery']).optional().default('dine_in'),
  guests: z.number().int().min(0).max(500).optional(),
  customer_name: trimmed(120).optional(),
  customer_phone: trimmed(30).optional(),
  note: z.string().trim().max(500).optional(),
}).refine((d) => d.type !== 'dine_in' || Boolean(d.table), 'Đơn tại bàn (dine_in) cần chỉ định bàn');

export const addItemsSchema = z.object({
  ...orderRef,
  items: z.array(z.object({
    name: trimmed(120).optional(),
    sku: trimmed(60).optional(),
    qty: qtyStr.optional().default('1'),
    options: z.array(trimmed(120)).max(20).optional(),
    note: z.string().trim().max(300).optional(),
    course: z.number().int().min(1).max(20).optional(),
  }).refine((i) => i.name || i.sku, 'Mỗi món cần name hoặc sku')).min(1).max(50),
}).refine(needOrderRef, ORDER_REF_MSG);

export const sendKitchenSchema = z.object({
  ...orderRef,
  note: z.string().trim().max(300).optional(),
}).refine(needOrderRef, ORDER_REF_MSG);

export const kdsUpdateSchema = z.object({
  kot_code: trimmed(40),
  status: z.enum(['preparing', 'ready', 'completed']),
});

export const serveSchema = z.object({
  ...orderRef,
  items: z.array(trimmed(120)).max(50).optional(),
}).refine(needOrderRef, ORDER_REF_MSG);

export const cancelItemSchema = z.object({
  ...orderRef,
  item: trimmed(120),
  reason: trimmed(300),
}).refine(needOrderRef, ORDER_REF_MSG);

export const moveTableSchema = z.object({
  ...orderRef,
  to_table: trimmed(80),
}).refine(needOrderRef, ORDER_REF_MSG);

export const mergeOrdersSchema = z.object({
  from_table: trimmed(80),
  to_table: trimmed(80),
});

export const discountSchema = z.object({
  ...orderRef,
  discount_type: z.enum(['amount', 'percent']),
  value: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, 'Giá trị dạng "50000" hoặc "10"'),
  reason: z.string().trim().max(300).optional(),
}).refine(needOrderRef, ORDER_REF_MSG)
  .refine((d) => d.discount_type !== 'percent' || Number.parseFloat(d.value) <= 100, 'Phần trăm giảm tối đa 100');

export const billCreateSchema = z.object({
  ...orderRef,
  item_names: z.array(trimmed(120)).max(50).optional(),
  item_ids: z.array(z.string().uuid()).max(50).optional(),
}).refine(needOrderRef, ORDER_REF_MSG);

export const payBillSchema = z.object({
  bill_code: trimmed(40).optional(),
  ...orderRef,
  method: z.enum(['cash', 'bank', 'card', 'momo', 'zalopay', 'vnpay', 'points', 'other']),
  amount: moneyStr.optional(),
  ref: z.string().trim().max(120).optional(),
  customer_phone: trimmed(24).optional(),
}).refine((d) => d.bill_code || d.order_code || d.table, 'Cần bill_code, order_code hoặc table');

export const voidBillSchema = z.object({
  bill_code: trimmed(40),
  reason: trimmed(300),
});

export const cancelOrderSchema = z.object({
  ...orderRef,
  reason: trimmed(300),
}).refine(needOrderRef, ORDER_REF_MSG);

export const reservationManageSchema = z.object({
  op: z.enum(['create', 'confirm', 'seat', 'cancel', 'no_show']),
  code: trimmed(40).optional(),
  customer_name: trimmed(120).optional(),
  phone: trimmed(30).optional(),
  party_size: z.number().int().min(1).max(500).optional(),
  table: trimmed(80).optional(),
  area: trimmed(80).optional(),
  at: z.string().trim().min(10).max(40).optional(), // ISO 8601
  duration_min: z.number().int().min(15).max(720).optional(),
  note: z.string().trim().max(500).optional(),
}).refine((d) => d.op !== 'create' || (d.customer_name && d.at), 'op=create cần customer_name và at (ISO 8601)')
  .refine((d) => d.op === 'create' || Boolean(d.code), 'op này cần code đặt bàn');

export const menuUpsertSchema = z.object({
  name: trimmed(120),
  sku: trimmed(60).optional(),
  price: moneyStr.optional(),
  cost: moneyStr.optional(),
  category: trimmed(80).optional(),
  station: trimmed(80).optional(),
  kind: z.enum(['single', 'combo']).optional(),
  unit: trimmed(30).optional(),
  description: z.string().trim().max(1000).optional(),
  tax_rate: pctStr.optional(),
  sold_out: z.boolean().optional(),
  active: z.boolean().optional(),
  options: z.array(z.object({
    group: trimmed(80),
    min: z.number().int().min(0).max(20).optional(),
    max: z.number().int().min(1).max(20).optional(),
    required: z.boolean().optional(),
    choices: z.array(z.object({
      name: trimmed(120),
      price_delta: moneyStr.optional(),
    })).min(1).max(30),
  })).max(10).optional(),
  combo_items: z.array(z.object({
    name: trimmed(120),
    qty: qtyStr.optional().default('1'),
  })).max(20).optional(),
});

export const setAvailabilitySchema = z.object({
  name: trimmed(120).optional(),
  sku: trimmed(60).optional(),
  sold_out: z.boolean(),
}).refine((d) => d.name || d.sku, 'Cần name hoặc sku');

export const recipeSetSchema = z.object({
  item: trimmed(120),
  lines: z.array(z.object({
    sku: trimmed(60),
    name: trimmed(120).optional(),
    qty: qtyStr,
    unit: trimmed(30).optional(),
  })).min(1).max(50),
  replace: z.boolean().optional().default(true),
});

export const settingsUpdateSchema = z.object({
  service_charge_pct: pctStr.optional(),
  tax_pct: pctStr.optional(),
  price_includes_tax: z.boolean().optional(),
  auto_deduct_stock: z.boolean().optional(),
  deduct_on: z.enum(['paid', 'served']).optional(),
  table_auto_clean: z.boolean().optional(),
  loyalty_enabled: z.boolean().optional(),
  loyalty_earn_pct: pctStr.optional(),
  loyalty_min_redeem: moneyStr.optional(),
}).refine((d) => Object.keys(d).length > 0, 'Không có gì để cập nhật');

// ───────────────────────── v1.1 · KHUYẾN MÃI & KHÁCH HÀNG ─────────────────────────
const signedMoneyStr = z.string().regex(/^-?\d{1,12}(\.\d{1,2})?$/, 'Điểm dạng "50000" hoặc "-20000"');

// -- READ --
export const promoListSchema = z.object({ active_only: z.boolean().optional() });
export const customerLookupSchema = z.object({ phone: trimmed(24) });
export const customerListSchema = z.object({
  query: trimmed(80).optional(),
  limit: z.number().int().positive().max(200).optional(),
});
export const loyaltyHistorySchema = z.object({
  phone: trimmed(24),
  limit: z.number().int().positive().max(200).optional(),
});

// -- ACTION --
export const promoUpsertSchema = z.object({
  id: trimmed(40).optional(),
  code: trimmed(40).optional(),
  name: trimmed(120),
  kind: z.enum(['voucher', 'happy_hour', 'auto']).optional(),
  discount_type: z.enum(['percent', 'amount']),
  value: moneyStr,
  min_subtotal: moneyStr.optional(),
  max_discount: moneyStr.optional(),
  starts_at: z.string().datetime({ offset: true }).optional(),
  ends_at: z.string().datetime({ offset: true }).optional(),
  hh_start_min: z.number().int().min(0).max(1439).optional(),
  hh_end_min: z.number().int().min(0).max(1440).optional(),
  days_mask: z.number().int().min(0).max(127).optional(),
  usage_limit: z.number().int().positive().optional(),
  per_customer_limit: z.number().int().positive().optional(),
  active: z.boolean().optional(),
});

export const promoApplySchema = z.object({
  ...orderRef,
  code: trimmed(40).optional(),
  remove: z.boolean().optional(),
}).refine(needOrderRef, ORDER_REF_MSG)
  .refine((d) => d.code || d.remove, 'Cần code để áp mã, hoặc remove:true để gỡ');

export const customerUpsertSchema = z.object({
  phone: trimmed(24),
  name: trimmed(120).optional(),
  note: z.string().trim().max(300).optional(),
  tier: trimmed(24).optional(),
});

export const orderSetCustomerSchema = z.object({
  ...orderRef,
  phone: trimmed(24),
  name: trimmed(120).optional(),
}).refine(needOrderRef, ORDER_REF_MSG);

export const loyaltyAdjustSchema = z.object({
  phone: trimmed(24),
  points: signedMoneyStr,
  reason: trimmed(200),
});

// ───────────────────────── v1.2 · BẾP THEO LƯỢT + BẢNG ĐIỀU KHIỂN ─────────────────────────
export const fireCourseSchema = z.object({
  ...orderRef,
  course: z.number().int().min(1).max(20),
  note: z.string().trim().max(200).optional(),
}).refine(needOrderRef, ORDER_REF_MSG);

export const consoleDashboardSchema = z.object({});
