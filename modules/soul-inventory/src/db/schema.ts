/**
 * MODULE KHO — Drizzle schema (mirror của migrations/0000_init.sql)
 * Hợp đồng Citadel mặt cắt ④: mọi bảng có id, org_id (+index), timestamps.
 * Hiến pháp #5: số lượng/tiền dùng numeric — Drizzle trả về string,
 * KHÔNG BAO GIỜ cast Number() cho nghiệp vụ; mọi phép so sánh/cộng trừ
 * quyết định nghiệp vụ thực hiện phía SQL.
 */
import {
  pgTable, uuid, text, numeric, jsonb, boolean, timestamp,
  index, uniqueIndex, integer, date, bigint, primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const khoItems = pgTable('kho_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  sku: text('sku').notNull(),
  name: text('name').notNull(),
  unit: text('unit').notNull().default('cái'),
  description: text('description'),
  barcode: text('barcode'),
  minStock: numeric('min_stock', { precision: 18, scale: 3 }).notNull().default('0'),
  trackLot: boolean('track_lot').notNull().default(false),
  trackSerial: boolean('track_serial').notNull().default(false),
  shelfLifeDays: integer('shelf_life_days'),
  avgCost: numeric('avg_cost', { precision: 18, scale: 2 }).notNull().default('0'),
  metadata: jsonb('metadata').notNull().default({}),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('kho_items_org_sku_uq').on(t.orgId, t.sku),
  index('kho_items_org_idx').on(t.orgId),
]);

export const khoLocations = pgTable('kho_locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  address: text('address'),
  isDefault: boolean('is_default').notNull().default(false),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('kho_locations_org_code_uq').on(t.orgId, t.code),
  index('kho_locations_org_idx').on(t.orgId),
]);

export const khoLots = pgTable('kho_lots', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  itemId: uuid('item_id').notNull().references(() => khoItems.id),
  lotNo: text('lot_no'),
  serialNo: text('serial_no'),
  expiryDate: date('expiry_date'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  status: text('status', { enum: ['active', 'expired', 'consumed', 'blocked'] })
    .notNull().default('active'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('kho_lots_org_idx').on(t.orgId),
  index('kho_lots_org_item_idx').on(t.orgId, t.itemId),
  index('kho_lots_org_expiry_idx').on(t.orgId, t.expiryDate),
  uniqueIndex('kho_lots_org_item_lot_uq').on(t.orgId, t.itemId, t.lotNo)
    .where(sql`lot_no IS NOT NULL AND serial_no IS NULL`),
  uniqueIndex('kho_lots_org_item_serial_uq').on(t.orgId, t.itemId, t.serialNo)
    .where(sql`serial_no IS NOT NULL`),
]);

export const khoStockLevels = pgTable('kho_stock_levels', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  itemId: uuid('item_id').notNull().references(() => khoItems.id),
  locationId: uuid('location_id').notNull().references(() => khoLocations.id),
  lotId: uuid('lot_id').references(() => khoLots.id),
  stocked: numeric('stocked', { precision: 18, scale: 3 }).notNull().default('0'),
  reserved: numeric('reserved', { precision: 18, scale: 3 }).notNull().default('0'),
  incoming: numeric('incoming', { precision: 18, scale: 3 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('kho_levels_org_item_loc_nolot_uq').on(t.orgId, t.itemId, t.locationId)
    .where(sql`lot_id IS NULL`),
  uniqueIndex('kho_levels_org_item_loc_lot_uq').on(t.orgId, t.itemId, t.locationId, t.lotId)
    .where(sql`lot_id IS NOT NULL`),
  index('kho_stock_levels_org_idx').on(t.orgId),
]);

export const khoMovements = pgTable('kho_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  itemId: uuid('item_id').notNull().references(() => khoItems.id),
  locationId: uuid('location_id').notNull().references(() => khoLocations.id),
  lotId: uuid('lot_id').references(() => khoLots.id),
  type: text('type', {
    enum: ['receive', 'issue', 'transfer_in', 'transfer_out', 'adjust', 'reserve_fulfill',
      'scrap', 'assembly_in', 'assembly_out'],
  }).notNull(),
  docNo: text('doc_no'),
  delta: numeric('delta', { precision: 18, scale: 3 }).notNull(),
  unitCost: numeric('unit_cost', { precision: 18, scale: 2 }),
  refType: text('ref_type'),
  refId: text('ref_id'),
  note: text('note'),
  actorUserId: uuid('actor_user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('kho_movements_org_idx').on(t.orgId),
  index('kho_movements_org_item_time_idx').on(t.orgId, t.itemId, t.createdAt),
]);

export const khoReservations = pgTable('kho_reservations', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  itemId: uuid('item_id').notNull().references(() => khoItems.id),
  locationId: uuid('location_id').notNull().references(() => khoLocations.id),
  lotId: uuid('lot_id').references(() => khoLots.id),
  quantity: numeric('quantity', { precision: 18, scale: 3 }).notNull(),
  status: text('status', { enum: ['active', 'fulfilled', 'released'] })
    .notNull().default('active'),
  refType: text('ref_type'),
  refId: text('ref_id'),
  note: text('note'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('kho_reservations_org_idx').on(t.orgId),
  index('kho_reservations_org_status_idx').on(t.orgId, t.status),
]);

export const khoStocktakes = pgTable('kho_stocktakes', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  locationId: uuid('location_id').notNull().references(() => khoLocations.id),
  docNo: text('doc_no'),
  status: text('status', { enum: ['draft', 'finalized'] }).notNull().default('draft'),
  note: text('note'),
  startedBy: uuid('started_by'),
  finalizedAt: timestamp('finalized_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('kho_stocktakes_org_idx').on(t.orgId),
]);

export const khoStocktakeLines = pgTable('kho_stocktake_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  stocktakeId: uuid('stocktake_id').notNull().references(() => khoStocktakes.id),
  itemId: uuid('item_id').notNull().references(() => khoItems.id),
  expected: numeric('expected', { precision: 18, scale: 3 }).notNull(),
  counted: numeric('counted', { precision: 18, scale: 3 }).notNull(),
  variance: numeric('variance', { precision: 18, scale: 3 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('kho_stocktake_lines_org_idx').on(t.orgId),
]);

export const khoSchema = {
  khoItems, khoLocations, khoLots, khoStockLevels,
  khoMovements, khoReservations, khoStocktakes, khoStocktakeLines,
};

// ============================================================
// SOUL-INVENTORY v2.0 FINAL — schema mở rộng
// Multi-UoM · BOM/Assembly · Reorder · Landed cost · Cost layers · Doc counters
// ============================================================

export const khoItemUoms = pgTable('kho_item_uoms', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  itemId: uuid('item_id').notNull().references(() => khoItems.id),
  uomName: text('uom_name').notNull(),
  factor: numeric('factor', { precision: 18, scale: 6 }).notNull(),
  isPurchase: boolean('is_purchase').notNull().default(false),
  isSales: boolean('is_sales').notNull().default(false),
  barcode: text('barcode'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('kho_item_uoms_org_item_name_uq').on(t.orgId, t.itemId, t.uomName),
  index('kho_item_uoms_org_idx').on(t.orgId),
  index('kho_item_uoms_org_barcode_idx').on(t.orgId, t.barcode),
]);

export const khoBoms = pgTable('kho_boms', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  itemId: uuid('item_id').notNull().references(() => khoItems.id),
  name: text('name').notNull().default('Định mức chuẩn'),
  outputQty: numeric('output_qty', { precision: 18, scale: 3 }).notNull().default('1'),
  isActive: boolean('is_active').notNull().default(true),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('kho_boms_org_idx').on(t.orgId),
  index('kho_boms_org_item_idx').on(t.orgId, t.itemId),
]);

export const khoBomLines = pgTable('kho_bom_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  bomId: uuid('bom_id').notNull().references(() => khoBoms.id),
  componentId: uuid('component_id').notNull().references(() => khoItems.id),
  qtyPer: numeric('qty_per', { precision: 18, scale: 6 }).notNull(),
  scrapPct: numeric('scrap_pct', { precision: 5, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('kho_bom_lines_org_idx').on(t.orgId),
  index('kho_bom_lines_bom_idx').on(t.orgId, t.bomId),
]);

export const khoAssemblyOrders = pgTable('kho_assembly_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  docNo: text('doc_no').notNull(),
  kind: text('kind', { enum: ['assemble', 'disassemble'] }).notNull(),
  bomId: uuid('bom_id').references(() => khoBoms.id),
  itemId: uuid('item_id').notNull().references(() => khoItems.id),
  qty: numeric('qty', { precision: 18, scale: 3 }).notNull(),
  locationId: uuid('location_id').notNull().references(() => khoLocations.id),
  status: text('status', { enum: ['done', 'cancelled'] }).notNull().default('done'),
  note: text('note'),
  actorUserId: uuid('actor_user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('kho_assembly_org_doc_uq').on(t.orgId, t.docNo),
  index('kho_assembly_org_idx').on(t.orgId),
]);

export const khoReorderRules = pgTable('kho_reorder_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  itemId: uuid('item_id').notNull().references(() => khoItems.id),
  locationId: uuid('location_id').references(() => khoLocations.id),
  minQty: numeric('min_qty', { precision: 18, scale: 3 }).notNull(),
  maxQty: numeric('max_qty', { precision: 18, scale: 3 }).notNull(),
  supplierName: text('supplier_name'),
  leadTimeDays: integer('lead_time_days').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('kho_reorder_rules_org_idx').on(t.orgId),
]);

export const khoLandedCosts = pgTable('kho_landed_costs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  docNo: text('doc_no').notNull(),
  method: text('method', { enum: ['by_value', 'by_qty'] }).notNull().default('by_value'),
  totalCost: numeric('total_cost', { precision: 18, scale: 2 }).notNull(),
  note: text('note'),
  actorUserId: uuid('actor_user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('kho_landed_org_doc_uq').on(t.orgId, t.docNo),
  index('kho_landed_costs_org_idx').on(t.orgId),
]);

export const khoLandedCostLines = pgTable('kho_landed_cost_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  landedCostId: uuid('landed_cost_id').notNull().references(() => khoLandedCosts.id),
  movementId: uuid('movement_id').notNull().references(() => khoMovements.id),
  allocated: numeric('allocated', { precision: 18, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('kho_landed_cost_lines_org_idx').on(t.orgId),
]);

export const khoCostLayers = pgTable('kho_cost_layers', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  itemId: uuid('item_id').notNull().references(() => khoItems.id),
  locationId: uuid('location_id').notNull().references(() => khoLocations.id),
  lotId: uuid('lot_id').references(() => khoLots.id),
  qtyRemain: numeric('qty_remain', { precision: 18, scale: 3 }).notNull(),
  unitCost: numeric('unit_cost', { precision: 18, scale: 2 }).notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  movementId: uuid('movement_id').references(() => khoMovements.id),
}, (t) => [
  index('kho_cost_layers_org_idx').on(t.orgId),
  index('kho_cost_layers_fifo_idx').on(t.orgId, t.itemId, t.locationId, t.receivedAt),
]);

export const khoDocCounters = pgTable('kho_doc_counters', {
  orgId: uuid('org_id').notNull(),
  docType: text('doc_type').notNull(),
  lastNo: bigint('last_no', { mode: 'bigint' }).notNull().default(0n),
}, (t) => [
  primaryKey({ columns: [t.orgId, t.docType] }),
]);

export const khoSchemaV2 = {
  ...khoSchema,
  khoItemUoms, khoBoms, khoBomLines, khoAssemblyOrders,
  khoReorderRules, khoLandedCosts, khoLandedCostLines,
  khoCostLayers, khoDocCounters,
};

// ============================================================
// SOUL-INVENTORY v2.1 — AUTOMATION LAYER schema
// demand_stats · forecasts · replenish_params · automation_runs
// ============================================================

export const khoDemandStats = pgTable('kho_demand_stats', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  itemId: uuid('item_id').notNull().references(() => khoItems.id),
  windowDays: integer('window_days').notNull().default(90),
  avgDaily: numeric('avg_daily', { precision: 18, scale: 4 }).notNull().default('0'),
  stddevDaily: numeric('stddev_daily', { precision: 18, scale: 4 }).notNull().default('0'),
  cv: numeric('cv', { precision: 9, scale: 4 }).notNull().default('0'),
  totalIssued: numeric('total_issued', { precision: 18, scale: 3 }).notNull().default('0'),
  activeDays: integer('active_days').notNull().default(0),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('kho_demand_stats_org_item_uq').on(t.orgId, t.itemId),
  index('kho_demand_stats_org_idx').on(t.orgId),
]);

export const khoForecasts = pgTable('kho_forecasts', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  itemId: uuid('item_id').notNull().references(() => khoItems.id),
  method: text('method', { enum: ['moving_avg', 'ses'] }).notNull(),
  horizonDays: integer('horizon_days').notNull().default(30),
  forecastQty: numeric('forecast_qty', { precision: 18, scale: 3 }).notNull(),
  dailyRate: numeric('daily_rate', { precision: 18, scale: 4 }).notNull(),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('kho_forecasts_org_item_uq').on(t.orgId, t.itemId),
  index('kho_forecasts_org_idx').on(t.orgId),
]);

export const khoReplenishParams = pgTable('kho_replenish_params', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  itemId: uuid('item_id').notNull().references(() => khoItems.id),
  locationId: uuid('location_id').references(() => khoLocations.id),
  serviceLevel: numeric('service_level', { precision: 5, scale: 4 }).notNull().default('0.95'),
  leadTimeDays: integer('lead_time_days').notNull().default(7),
  orderCost: numeric('order_cost', { precision: 18, scale: 2 }).notNull().default('0'),
  holdingCostPct: numeric('holding_cost_pct', { precision: 6, scale: 4 }).notNull().default('0.20'),
  safetyStock: numeric('safety_stock', { precision: 18, scale: 3 }).notNull().default('0'),
  reorderPoint: numeric('reorder_point', { precision: 18, scale: 3 }).notNull().default('0'),
  eoq: numeric('eoq', { precision: 18, scale: 3 }).notNull().default('0'),
  computedAt: timestamp('computed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('kho_replenish_params_org_idx').on(t.orgId),
]);

export const khoAutomationRuns = pgTable('kho_automation_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  task: text('task').notNull(),
  itemsTouched: integer('items_touched').notNull().default(0),
  findings: jsonb('findings'),
  ranAt: timestamp('ran_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('kho_automation_runs_org_idx').on(t.orgId, t.ranAt),
]);

export const khoSchemaV21 = {
  ...khoSchemaV2,
  khoDemandStats, khoForecasts, khoReplenishParams, khoAutomationRuns,
};
