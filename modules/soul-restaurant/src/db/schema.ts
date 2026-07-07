/**
 * SOUL-RESTAURANT — Drizzle schema (mirror 1:1 của migrations/0000_init.sql).
 * Mặt cắt ④: mọi bảng id + org_id + timestamps; RLS ở migration 0001.
 * numeric → string trong TS (KHÔNG bao giờ cast Number — dùng lib/money.ts).
 */
import {
  pgTable, uuid, text, integer, boolean, numeric, timestamp, jsonb,
  index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const id = () => uuid('id').primaryKey().defaultRandom();
const orgId = () => uuid('org_id').notNull();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const restoAreas = pgTable('resto_areas', {
  id: id(), orgId: orgId(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  index('idx_resto_areas_org').on(t.orgId),
  uniqueIndex('uq_resto_areas_org_name').on(t.orgId, sql`lower(${t.name})`),
]);

export const restoTables = pgTable('resto_tables', {
  id: id(), orgId: orgId(),
  areaId: uuid('area_id'),
  name: text('name').notNull(),
  capacity: integer('capacity').notNull().default(4),
  minGuests: integer('min_guests').notNull().default(1),
  shape: text('shape').notNull().default('square'),
  status: text('status').notNull().default('available'),
  currentOrderId: uuid('current_order_id'),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  index('idx_resto_tables_org').on(t.orgId),
  index('idx_resto_tables_org_area').on(t.orgId, t.areaId),
  uniqueIndex('uq_resto_tables_org_name').on(t.orgId, sql`lower(${t.name})`),
]);

export const restoStations = pgTable('resto_stations', {
  id: id(), orgId: orgId(),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('kitchen'),
  printer: jsonb('printer').notNull().default(sql`'{}'::jsonb`),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  index('idx_resto_stations_org').on(t.orgId),
  uniqueIndex('uq_resto_stations_org_name').on(t.orgId, sql`lower(${t.name})`),
]);

export const restoMenuCategories = pgTable('resto_menu_categories', {
  id: id(), orgId: orgId(),
  name: text('name').notNull(),
  parentId: uuid('parent_id'),
  stationId: uuid('station_id'),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  index('idx_resto_menu_categories_org').on(t.orgId),
  uniqueIndex('uq_resto_menu_categories_org_name').on(t.orgId, sql`lower(${t.name})`),
]);

/** Snapshot 1 lựa chọn đã chọn, lưu vào resto_order_items.options */
export interface OptionSnapshot {
  group: string;
  name: string;
  price_delta: string; // scale 2
}

export const restoMenuItems = pgTable('resto_menu_items', {
  id: id(), orgId: orgId(),
  categoryId: uuid('category_id'),
  stationId: uuid('station_id'),
  sku: text('sku'),
  name: text('name').notNull(),
  description: text('description'),
  kind: text('kind').notNull().default('single'),
  unit: text('unit').notNull().default('phần'),
  price: numeric('price', { precision: 14, scale: 2 }).notNull().default('0'),
  cost: numeric('cost', { precision: 14, scale: 2 }),
  taxRate: numeric('tax_rate', { precision: 5, scale: 2 }),
  imageUrl: text('image_url'),
  soldOut: boolean('sold_out').notNull().default(false),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  index('idx_resto_menu_items_org').on(t.orgId),
  index('idx_resto_menu_items_org_cat').on(t.orgId, t.categoryId),
  uniqueIndex('uq_resto_menu_items_org_name').on(t.orgId, sql`lower(${t.name})`),
]);

export const restoOptionGroups = pgTable('resto_option_groups', {
  id: id(), orgId: orgId(),
  name: text('name').notNull(),
  minSelect: integer('min_select').notNull().default(0),
  maxSelect: integer('max_select').notNull().default(1),
  required: boolean('required').notNull().default(false),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  index('idx_resto_option_groups_org').on(t.orgId),
  uniqueIndex('uq_resto_option_groups_org_name').on(t.orgId, sql`lower(${t.name})`),
]);

export const restoOptions = pgTable('resto_options', {
  id: id(), orgId: orgId(),
  groupId: uuid('group_id').notNull(),
  name: text('name').notNull(),
  priceDelta: numeric('price_delta', { precision: 14, scale: 2 }).notNull().default('0'),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  index('idx_resto_options_org').on(t.orgId),
  index('idx_resto_options_org_group').on(t.orgId, t.groupId),
  uniqueIndex('uq_resto_options_org_group_name').on(t.orgId, t.groupId, sql`lower(${t.name})`),
]);

export const restoItemOptionGroups = pgTable('resto_item_option_groups', {
  id: id(), orgId: orgId(),
  itemId: uuid('item_id').notNull(),
  groupId: uuid('group_id').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  index('idx_resto_item_option_groups_org').on(t.orgId),
  uniqueIndex('uq_resto_item_option_groups').on(t.orgId, t.itemId, t.groupId),
]);

export const restoComboItems = pgTable('resto_combo_items', {
  id: id(), orgId: orgId(),
  comboId: uuid('combo_id').notNull(),
  componentItemId: uuid('component_item_id').notNull(),
  qty: numeric('qty', { precision: 12, scale: 3 }).notNull().default('1'),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  index('idx_resto_combo_items_org').on(t.orgId),
  uniqueIndex('uq_resto_combo_items').on(t.orgId, t.comboId, t.componentItemId),
]);

export const restoRecipes = pgTable('resto_recipes', {
  id: id(), orgId: orgId(),
  menuItemId: uuid('menu_item_id').notNull(),
  khoSku: text('kho_sku').notNull(),
  khoItemName: text('kho_item_name').notNull().default(''),
  qty: numeric('qty', { precision: 14, scale: 3 }).notNull(),
  unit: text('unit').notNull().default(''),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  index('idx_resto_recipes_org').on(t.orgId),
  uniqueIndex('uq_resto_recipes').on(t.orgId, t.menuItemId, t.khoSku),
]);

export const restoOrders = pgTable('resto_orders', {
  id: id(), orgId: orgId(),
  code: text('code').notNull(),
  type: text('type').notNull().default('dine_in'),
  tableId: uuid('table_id'),
  guests: integer('guests').notNull().default(0),
  status: text('status').notNull().default('open'),
  customerName: text('customer_name'),
  customerPhone: text('customer_phone'),
  note: text('note'),
  discountType: text('discount_type'),
  discountValue: numeric('discount_value', { precision: 14, scale: 2 }),
  discountReason: text('discount_reason'),
  subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull().default('0'),
  discountTotal: numeric('discount_total', { precision: 14, scale: 2 }).notNull().default('0'),
  serviceCharge: numeric('service_charge', { precision: 14, scale: 2 }).notNull().default('0'),
  taxTotal: numeric('tax_total', { precision: 14, scale: 2 }).notNull().default('0'),
  grandTotal: numeric('grand_total', { precision: 14, scale: 2 }).notNull().default('0'),
  openedBy: uuid('opened_by'),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  cancelReason: text('cancel_reason'),
  // v1.1 — gắn khách hàng thân thiết + khuyến mãi
  customerId: uuid('customer_id'),
  promoId: uuid('promo_id'),
  promoCode: text('promo_code'),
  promoDiscount: numeric('promo_discount', { precision: 14, scale: 2 }).notNull().default('0'),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  index('idx_resto_orders_org').on(t.orgId),
  index('idx_resto_orders_org_status').on(t.orgId, t.status),
  index('idx_resto_orders_org_opened').on(t.orgId, t.openedAt),
  uniqueIndex('uq_resto_orders_org_code').on(t.orgId, t.code),
]);

export const restoOrderItems = pgTable('resto_order_items', {
  id: id(), orgId: orgId(),
  orderId: uuid('order_id').notNull(),
  menuItemId: uuid('menu_item_id'),
  stationId: uuid('station_id'),
  kotId: uuid('kot_id'),
  name: text('name').notNull(),
  unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull().default('0'),
  qty: numeric('qty', { precision: 12, scale: 3 }).notNull().default('1'),
  options: jsonb('options').$type<OptionSnapshot[]>().notNull().default(sql`'[]'::jsonb`),
  optionsTotal: numeric('options_total', { precision: 14, scale: 2 }).notNull().default('0'),
  lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull().default('0'),
  courseNo: integer('course_no').notNull().default(1),
  status: text('status').notNull().default('pending'),
  cancelReason: text('cancel_reason'),
  note: text('note'),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  index('idx_resto_order_items_org').on(t.orgId),
  index('idx_resto_order_items_org_order').on(t.orgId, t.orderId),
  index('idx_resto_order_items_org_kot').on(t.orgId, t.kotId),
]);

export const restoKots = pgTable('resto_kots', {
  id: id(), orgId: orgId(),
  orderId: uuid('order_id').notNull(),
  stationId: uuid('station_id'),
  code: text('code').notNull(),
  status: text('status').notNull().default('queued'),
  note: text('note'),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  doneAt: timestamp('done_at', { withTimezone: true }),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  index('idx_resto_kots_org').on(t.orgId),
  index('idx_resto_kots_org_station_status').on(t.orgId, t.stationId, t.status),
  uniqueIndex('uq_resto_kots_org_code').on(t.orgId, t.code),
]);

export const restoBills = pgTable('resto_bills', {
  id: id(), orgId: orgId(),
  orderId: uuid('order_id').notNull(),
  code: text('code').notNull(),
  status: text('status').notNull().default('unpaid'),
  subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull().default('0'),
  discountTotal: numeric('discount_total', { precision: 14, scale: 2 }).notNull().default('0'),
  serviceCharge: numeric('service_charge', { precision: 14, scale: 2 }).notNull().default('0'),
  taxTotal: numeric('tax_total', { precision: 14, scale: 2 }).notNull().default('0'),
  grandTotal: numeric('grand_total', { precision: 14, scale: 2 }).notNull().default('0'),
  paidTotal: numeric('paid_total', { precision: 14, scale: 2 }).notNull().default('0'),
  issuedBy: uuid('issued_by'),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  voidReason: text('void_reason'),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  index('idx_resto_bills_org').on(t.orgId),
  index('idx_resto_bills_org_order').on(t.orgId, t.orderId),
  index('idx_resto_bills_org_paid_at').on(t.orgId, t.paidAt),
  uniqueIndex('uq_resto_bills_org_code').on(t.orgId, t.code),
]);

export const restoBillItems = pgTable('resto_bill_items', {
  id: id(), orgId: orgId(),
  billId: uuid('bill_id').notNull(),
  orderItemId: uuid('order_item_id').notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull().default('0'),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  index('idx_resto_bill_items_org').on(t.orgId),
  index('idx_resto_bill_items_org_bill').on(t.orgId, t.billId),
  index('idx_resto_bill_items_org_oi').on(t.orgId, t.orderItemId),
]);

export const restoPayments = pgTable('resto_payments', {
  id: id(), orgId: orgId(),
  billId: uuid('bill_id').notNull(),
  method: text('method').notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  ref: text('ref'),
  receivedBy: uuid('received_by'),
  paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  index('idx_resto_payments_org').on(t.orgId),
  index('idx_resto_payments_org_bill').on(t.orgId, t.billId),
]);

export const restoReservations = pgTable('resto_reservations', {
  id: id(), orgId: orgId(),
  code: text('code').notNull(),
  customerName: text('customer_name').notNull(),
  phone: text('phone'),
  partySize: integer('party_size').notNull().default(2),
  tableId: uuid('table_id'),
  areaId: uuid('area_id'),
  reservedAt: timestamp('reserved_at', { withTimezone: true }).notNull(),
  durationMin: integer('duration_min').notNull().default(90),
  status: text('status').notNull().default('confirmed'),
  orderId: uuid('order_id'),
  note: text('note'),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  index('idx_resto_reservations_org').on(t.orgId),
  index('idx_resto_reservations_org_time').on(t.orgId, t.reservedAt),
  uniqueIndex('uq_resto_reservations_org_code').on(t.orgId, t.code),
]);

export const restoSettings = pgTable('resto_settings', {
  orgId: uuid('org_id').primaryKey(),
  serviceChargePct: numeric('service_charge_pct', { precision: 5, scale: 2 }).notNull().default('0'),
  taxPct: numeric('tax_pct', { precision: 5, scale: 2 }).notNull().default('8'),
  priceIncludesTax: boolean('price_includes_tax').notNull().default(true),
  currency: text('currency').notNull().default('VND'),
  autoDeductStock: boolean('auto_deduct_stock').notNull().default(true),
  deductOn: text('deduct_on').notNull().default('paid'),
  tableAutoClean: boolean('table_auto_clean').notNull().default(false),
  // v1.1 — khách hàng thân thiết
  loyaltyEnabled: boolean('loyalty_enabled').notNull().default(false),
  loyaltyEarnPct: numeric('loyalty_earn_pct', { precision: 5, scale: 2 }).notNull().default('0'),
  loyaltyMinRedeem: numeric('loyalty_min_redeem', { precision: 14, scale: 2 }).notNull().default('0'),
  createdAt: createdAt(), updatedAt: updatedAt(),
});

// ─── v1.1 · Khách hàng thân thiết & Khuyến mãi ─────────────────
export const restoCustomers = pgTable('resto_customers', {
  id: id(), orgId: orgId(),
  phone: text('phone'),
  name: text('name').notNull(),
  pointsBalance: numeric('points_balance', { precision: 14, scale: 2 }).notNull().default('0'),
  totalSpent: numeric('total_spent', { precision: 14, scale: 2 }).notNull().default('0'),
  visits: integer('visits').notNull().default(0),
  tier: text('tier').notNull().default('regular'),
  note: text('note'),
  firstVisitAt: timestamp('first_visit_at', { withTimezone: true }),
  lastVisitAt: timestamp('last_visit_at', { withTimezone: true }),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  index('idx_resto_customers_org').on(t.orgId),
  uniqueIndex('uq_resto_customers_org_phone').on(t.orgId, t.phone),
]);

export const restoPromotions = pgTable('resto_promotions', {
  id: id(), orgId: orgId(),
  code: text('code'),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('voucher'),
  discountType: text('discount_type').notNull(),
  value: numeric('value', { precision: 14, scale: 2 }).notNull(),
  minSubtotal: numeric('min_subtotal', { precision: 14, scale: 2 }).notNull().default('0'),
  maxDiscount: numeric('max_discount', { precision: 14, scale: 2 }),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  hhStartMin: integer('hh_start_min'),
  hhEndMin: integer('hh_end_min'),
  daysMask: integer('days_mask').notNull().default(127),
  usageLimit: integer('usage_limit'),
  perCustomerLimit: integer('per_customer_limit'),
  usedCount: integer('used_count').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  index('idx_resto_promotions_org').on(t.orgId),
  uniqueIndex('uq_resto_promotions_org_code').on(t.orgId, sql`lower(${t.code})`),
]);

export const restoPromoRedemptions = pgTable('resto_promo_redemptions', {
  id: id(), orgId: orgId(),
  promoId: uuid('promo_id').notNull(),
  orderId: uuid('order_id').notNull(),
  customerId: uuid('customer_id'),
  code: text('code'),
  discountAmount: numeric('discount_amount', { precision: 14, scale: 2 }).notNull().default('0'),
  createdAt: createdAt(),
}, (t) => [
  index('idx_resto_promo_redemptions_org').on(t.orgId),
  index('idx_resto_promo_redemptions_promo').on(t.orgId, t.promoId),
  uniqueIndex('uq_resto_promo_redemptions_order').on(t.orgId, t.orderId),
]);

export const restoLoyaltyLedger = pgTable('resto_loyalty_ledger', {
  id: id(), orgId: orgId(),
  customerId: uuid('customer_id').notNull(),
  orderId: uuid('order_id'),
  type: text('type').notNull(),
  points: numeric('points', { precision: 14, scale: 2 }).notNull(),
  balanceAfter: numeric('balance_after', { precision: 14, scale: 2 }).notNull(),
  reason: text('reason'),
  createdAt: createdAt(),
}, (t) => [
  index('idx_resto_loyalty_ledger_org').on(t.orgId),
  index('idx_resto_loyalty_ledger_cust').on(t.orgId, t.customerId),
]);

export const restoSchema = {
  restoAreas, restoTables, restoStations, restoMenuCategories, restoMenuItems,
  restoOptionGroups, restoOptions, restoItemOptionGroups, restoComboItems,
  restoRecipes, restoOrders, restoOrderItems, restoKots, restoBills,
  restoBillItems, restoPayments, restoReservations, restoSettings,
  restoCustomers, restoPromotions, restoPromoRedemptions, restoLoyaltyLedger,
};
