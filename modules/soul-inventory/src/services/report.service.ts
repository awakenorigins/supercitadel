/**
 * SOUL-INVENTORY — report.service
 * Port từ R9: stockCard (thẻ kho) + inventorySummary (tổng quan kho).
 * Viết lại chuẩn Soul-Inventory: numeric string, org filter kép, SQL-side math.
 */
import { and, eq, sql } from 'drizzle-orm';
import { khoItems, khoLocations, khoMovements } from '../db/schema.js';
import type { KhoCtx } from '../types.js';
import { getItemBySku } from './catalog.service.js';

/** THẺ KHO (Mẫu S10-DN): số dư đầu — phát sinh nhập/xuất — số dư cuối theo SKU */
export async function stockCard(ctx: KhoCtx, sku: string, limit = 50) {
  const item = await getItemBySku(ctx, sku);

  const moves = await ctx.db.select({
    type: khoMovements.type,
    delta: khoMovements.delta,
    unitCost: khoMovements.unitCost,
    refType: khoMovements.refType,
    refId: khoMovements.refId,
    note: khoMovements.note,
    createdAt: khoMovements.createdAt,
    locationCode: khoLocations.code,
  })
    .from(khoMovements)
    .innerJoin(khoLocations, eq(khoMovements.locationId, khoLocations.id))
    .where(and(eq(khoMovements.orgId, ctx.orgId), eq(khoMovements.itemId, item.id)))
    .orderBy(sql`${khoMovements.createdAt} ASC`)
    .limit(limit);

  // Tổng hợp phía SQL — không cast Number cho nghiệp vụ
  const totals = await ctx.db.execute<{
    total_in: string; total_out: string; balance: string;
  }>(sql`
    SELECT
      COALESCE(sum(delta) FILTER (WHERE delta > 0), 0)::text AS total_in,
      COALESCE(abs(sum(delta) FILTER (WHERE delta < 0)), 0)::text AS total_out,
      COALESCE(sum(delta), 0)::text AS balance
    FROM kho_movements
    WHERE org_id = ${ctx.orgId} AND item_id = ${item.id}
  `);
  const t = (('rows' in totals ? (totals as unknown as { rows: unknown[] }).rows : totals) as Array<Record<string, string>>)[0];

  return {
    item: { sku: item.sku, name: item.name, unit: item.unit, avg_cost: item.avgCost },
    card: moves.map(m => ({
      date: m.createdAt, type: m.type, delta: m.delta,
      unit_cost: m.unitCost, location: m.locationCode,
      ref: m.refType ? `${m.refType}${m.refId ? `/${m.refId}` : ''}` : null,
      note: m.note,
    })),
    totals: { total_in: t?.total_in ?? '0', total_out: t?.total_out ?? '0', balance: t?.balance ?? '0' },
  };
}

/** TỔNG QUAN KHO: đếm mặt hàng/kho/lô, tổng giá trị tồn ước tính (avg_cost × tồn) */
export async function inventorySummary(ctx: KhoCtx) {
  const res = await ctx.db.execute<{
    items: string; locations: string; active_lots: string;
    total_available: string; low_count: string; est_value: string;
  }>(sql`
    SELECT
      (SELECT count(*) FROM kho_items WHERE org_id = ${ctx.orgId} AND active = true)::text AS items,
      (SELECT count(*) FROM kho_locations WHERE org_id = ${ctx.orgId} AND active = true)::text AS locations,
      (SELECT count(*) FROM kho_lots WHERE org_id = ${ctx.orgId} AND status = 'active')::text AS active_lots,
      COALESCE((SELECT sum(stocked - reserved) FROM kho_stock_levels WHERE org_id = ${ctx.orgId}), 0)::text AS total_available,
      (SELECT count(*) FROM (
        SELECT i.id FROM kho_items i
        LEFT JOIN kho_stock_levels s ON s.item_id = i.id AND s.org_id = ${ctx.orgId}
        WHERE i.org_id = ${ctx.orgId} AND i.active = true
        GROUP BY i.id, i.min_stock
        HAVING COALESCE(sum(s.stocked - s.reserved), 0) <= i.min_stock
      ) x)::text AS low_count,
      COALESCE((
        SELECT round(sum(s.stocked * i.avg_cost), 2)
        FROM kho_stock_levels s
        JOIN kho_items i ON i.id = s.item_id AND i.org_id = ${ctx.orgId}
        WHERE s.org_id = ${ctx.orgId}
      ), 0)::text AS est_value
  `);
  const row = (('rows' in res ? (res as unknown as { rows: unknown[] }).rows : res) as Array<Record<string, string>>)[0];
  return {
    items: row?.items ?? '0',
    locations: row?.locations ?? '0',
    active_lots: row?.active_lots ?? '0',
    total_available: row?.total_available ?? '0',
    low_stock_items: row?.low_count ?? '0',
    estimated_value: row?.est_value ?? '0',
  };
}
