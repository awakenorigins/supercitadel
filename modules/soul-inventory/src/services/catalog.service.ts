/**
 * MODULE KHO — catalog.service
 * Quản lý vật tư (kho_items) + địa điểm (kho_locations).
 * Nguyên tắc phòng thủ kép: RLS đã chặn ở tầng DB, nhưng code VẪN
 * filter org_id tường minh (defense in depth — Hiến pháp #1).
 */
import { and, eq, sql } from 'drizzle-orm';
import { khoItems, khoLocations } from '../db/schema.js';
import type { KhoCtx } from '../types.js';
import { KhoError } from '../types.js';
import type { z } from 'zod';
import type { itemUpsertSchema, locationUpsertSchema } from '../validation/schemas.js';

export const DEFAULT_LOCATION = { code: 'KHO-CHINH', name: 'Kho chính' };

/** Tạo/cập nhật vật tư theo (org_id, sku) — idempotent */
export async function upsertItem(ctx: KhoCtx, input: z.infer<typeof itemUpsertSchema>) {
  const [row] = await ctx.db.insert(khoItems).values({
    orgId: ctx.orgId,
    sku: input.sku,
    name: input.name,
    unit: input.unit,
    description: input.description,
    barcode: input.barcode,
    minStock: input.min_stock,
    trackLot: input.track_lot,
    trackSerial: input.track_serial,
    shelfLifeDays: input.shelf_life_days,
    metadata: input.metadata,
  }).onConflictDoUpdate({
    target: [khoItems.orgId, khoItems.sku],
    set: {
      name: input.name,
      unit: input.unit,
      description: input.description ?? sql`${khoItems.description}`,
      barcode: input.barcode ?? sql`${khoItems.barcode}`,
      minStock: input.min_stock,
      trackLot: input.track_lot,
      trackSerial: input.track_serial,
      shelfLifeDays: input.shelf_life_days ?? sql`${khoItems.shelfLifeDays}`,
      updatedAt: sql`now()`,
    },
  }).returning();

  await ctx.bus.emit('kho.item.upserted', {
    org_id: ctx.orgId, item_id: row.id, sku: row.sku, name: row.name,
  });
  return row;
}

export async function getItemBySku(ctx: KhoCtx, sku: string) {
  const [row] = await ctx.db.select().from(khoItems)
    .where(and(eq(khoItems.orgId, ctx.orgId), eq(khoItems.sku, sku)))
    .limit(1);
  if (!row) {
    throw new KhoError('ITEM_NOT_FOUND', `Không tìm thấy vật tư SKU "${sku}"`, { sku });
  }
  return row;
}

/** Tạo/cập nhật địa điểm kho theo (org_id, code) */
export async function upsertLocation(ctx: KhoCtx, input: z.infer<typeof locationUpsertSchema>) {
  const [row] = await ctx.db.insert(khoLocations).values({
    orgId: ctx.orgId,
    code: input.code,
    name: input.name,
    address: input.address,
    isDefault: input.is_default,
  }).onConflictDoUpdate({
    target: [khoLocations.orgId, khoLocations.code],
    set: {
      name: input.name,
      address: input.address ?? sql`${khoLocations.address}`,
      isDefault: input.is_default,
      updatedAt: sql`now()`,
    },
  }).returning();

  await ctx.bus.emit('kho.location.upserted', {
    org_id: ctx.orgId, location_id: row.id, code: row.code,
  });
  return row;
}

/** Lấy địa điểm theo code; code trống → kho mặc định (tự tạo lần đầu — lazy seed) */
export async function resolveLocation(ctx: KhoCtx, code?: string) {
  if (code) {
    const [row] = await ctx.db.select().from(khoLocations)
      .where(and(eq(khoLocations.orgId, ctx.orgId), eq(khoLocations.code, code)))
      .limit(1);
    if (!row) {
      throw new KhoError('LOCATION_NOT_FOUND', `Không tìm thấy kho "${code}"`, { code });
    }
    return row;
  }
  // kho mặc định
  const [def] = await ctx.db.select().from(khoLocations)
    .where(and(eq(khoLocations.orgId, ctx.orgId), eq(khoLocations.isDefault, true)))
    .limit(1);
  if (def) return def;
  // lần đầu của org: seed kho chính
  return upsertLocation(ctx, {
    code: DEFAULT_LOCATION.code, name: DEFAULT_LOCATION.name, is_default: true,
  });
}
