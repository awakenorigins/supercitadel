/**
 * MODULE KHO — stock.service
 * Port logic Medusa Inventory Module (MIT):
 *   - InventoryLevel: stocked / reserved / incoming theo (item × location)
 *   - availability = stocked - reserved (tính phía SQL, không cast Number)
 *   - Mọi biến động ghi vào kho_movements (ledger bất biến — Mẫu 01-VT/02-VT)
 * Mọi thao tác chạy trong transaction của ctx.db (host đã SET LOCAL org).
 */
import { and, eq, ilike, lte, or, sql } from 'drizzle-orm';
import { khoItems, khoLocations, khoMovements, khoStockLevels } from '../db/schema.js';
import type { KhoCtx } from '../types.js';
import { KhoError } from '../types.js';
import { getItemBySku, resolveLocation } from './catalog.service.js';
import { resolveOrCreateLot, findLot } from './lot.service.js';
import { toBaseQty } from './uom.service.js';
import { nextDocNo } from './docnumber.service.js';
import type { z } from 'zod';
import type {
  receiveStockSchema, issueStockSchema, transferStockSchema,
  queryStockSchema, lowAlertsSchema,
} from '../validation/schemas.js';

/** Điều kiện lot: NULL-safe (level không lot vs level theo lot) */
function lotCond(lotId?: string | null) {
  return lotId
    ? eq(khoStockLevels.lotId, lotId)
    : sql`${khoStockLevels.lotId} IS NULL`;
}

/** Đảm bảo tồn tại dòng stock_level (item × location × lot?) — atomic upsert */
async function ensureLevel(ctx: KhoCtx, itemId: string, locationId: string, lotId?: string | null) {
  // Partial unique index không dùng được với onConflictDoNothing target thường,
  // nên kiểm tra rồi insert — an toàn trong transaction của request.
  const [existing] = await ctx.db.select({ id: khoStockLevels.id })
    .from(khoStockLevels)
    .where(and(
      eq(khoStockLevels.orgId, ctx.orgId),
      eq(khoStockLevels.itemId, itemId),
      eq(khoStockLevels.locationId, locationId),
      lotCond(lotId),
    )).limit(1);
  if (!existing) {
    await ctx.db.insert(khoStockLevels)
      .values({ orgId: ctx.orgId, itemId, locationId, lotId: lotId ?? null })
      .onConflictDoNothing();
  }
}

async function getLevel(ctx: KhoCtx, itemId: string, locationId: string, lotId?: string | null) {
  const [lv] = await ctx.db.select().from(khoStockLevels).where(and(
    eq(khoStockLevels.orgId, ctx.orgId),
    eq(khoStockLevels.itemId, itemId),
    eq(khoStockLevels.locationId, locationId),
    lotCond(lotId),
  )).limit(1);
  return lv;
}

/** NHẬP KHO (receive) — Mẫu 01-VT. Hỗ trợ lot/serial/expiry + weighted avg cost */
export async function receiveStock(ctx: KhoCtx, input: z.infer<typeof receiveStockSchema>) {
  const item = await getItemBySku(ctx, input.sku);
  const loc = await resolveLocation(ctx, input.location_code);

  // v2.0: quy đổi UoM về đơn vị gốc (2 thùng → 48 lon); đơn giá cũng quy về gốc
  const conv = await toBaseQty(ctx, item, input.quantity, input.uom);
  const qty = conv.baseQty;
  let unitCost = input.unit_cost;
  if (unitCost && conv.factor !== '1') {
    const r = await ctx.db.execute<{ c: string }>(sql`
      SELECT round(${unitCost}::numeric / ${conv.factor}::numeric, 2)::text AS c`);
    const rows = ('rows' in r ? (r as unknown as { rows: Array<{ c: string }> }).rows : r) as Array<{ c: string }>;
    unitCost = rows[0]!.c;
  }
  const uomNote = conv.factor !== '1'
    ? `${input.quantity} ${conv.uomLabel} = ${qty} ${item.unit}` : undefined;

  const lot = await resolveOrCreateLot(ctx, item, {
    lot_no: input.lot_no, serial_no: input.serial_no, expiry_date: input.expiry_date,
  });
  await ensureLevel(ctx, item.id, loc.id, lot?.id);

  const [level] = await ctx.db.update(khoStockLevels)
    .set({
      stocked: sql`${khoStockLevels.stocked} + ${qty}::numeric`,
      updatedAt: sql`now()`,
    })
    .where(and(
      eq(khoStockLevels.orgId, ctx.orgId),
      eq(khoStockLevels.itemId, item.id),
      eq(khoStockLevels.locationId, loc.id),
      lotCond(lot?.id),
    )).returning();

  const docNo = await nextDocNo(ctx, 'PNK');
  await ctx.db.insert(khoMovements).values({
    orgId: ctx.orgId, itemId: item.id, locationId: loc.id, lotId: lot?.id,
    type: 'receive', delta: qty, unitCost, docNo,
    refType: input.ref_type, refId: input.ref_id,
    note: [input.note, uomNote].filter(Boolean).join(' · ') || undefined,
    actorUserId: ctx.userId,
  });

  // Weighted average cost (port từ R9, tính phía SQL giữ độ chính xác):
  // avg mới = (tồn_cũ×avg_cũ + q×giá_nhập) / (tồn_cũ + q) — trên tổng toàn org của item
  // v2.0: dùng qty + unitCost ĐÃ QUY ĐỔI về đơn vị gốc
  if (unitCost) {
    await ctx.db.execute(sql`
      UPDATE kho_items SET avg_cost = sub.new_avg, updated_at = now()
      FROM (
        SELECT CASE WHEN COALESCE(sum(s.stocked), 0) <= 0 THEN ${unitCost}::numeric
               ELSE round(
                 ( (COALESCE(sum(s.stocked), 0) - ${qty}::numeric) * ${item.avgCost}::numeric
                   + ${qty}::numeric * ${unitCost}::numeric )
                 / COALESCE(sum(s.stocked), 1), 2)
               END AS new_avg
        FROM kho_stock_levels s
        WHERE s.org_id = ${ctx.orgId} AND s.item_id = ${item.id}
      ) sub
      WHERE kho_items.id = ${item.id} AND kho_items.org_id = ${ctx.orgId}
    `);
  }

  await ctx.bus.emit('kho.stock.received', {
    org_id: ctx.orgId, item_id: item.id, sku: item.sku,
    location_id: loc.id, location_code: loc.code,
    lot_id: lot?.id ?? null, lot_no: input.lot_no ?? null,
    quantity: qty, stocked: level.stocked, doc_no: docNo,
  });

  return {
    ...summarizeLevel(item, loc, level),
    lot_no: input.lot_no, serial_no: input.serial_no,
    doc_no: docNo, quantity_base: qty,
  };
}

/** XUẤT KHO (issue) — Mẫu 02-VT. Guard: availability >= quantity (SQL-side). Hỗ trợ lot/serial */
export async function issueStock(ctx: KhoCtx, input: z.infer<typeof issueStockSchema>) {
  const item = await getItemBySku(ctx, input.sku);
  const loc = await resolveLocation(ctx, input.location_code);
  const lot = (input.lot_no || input.serial_no)
    ? await findLot(ctx, item.id, { lot_no: input.lot_no, serial_no: input.serial_no })
    : (item.trackLot || item.trackSerial)
      ? (() => { throw new KhoError('LOT_REQUIRED',
          `Mặt hàng "${item.sku}" theo dõi ${item.trackSerial ? 'serial' : 'lô'} — cần ${item.trackSerial ? 'serial_no' : 'lot_no'} khi xuất`,
          { sku: item.sku }); })()
      : null;

  // v2.0: quy đổi UoM về đơn vị gốc (xuất 1 thùng = 24 lon)
  const conv = await toBaseQty(ctx, item, input.quantity, input.uom);
  const qty = conv.baseQty;
  const uomNote = conv.factor !== '1'
    ? `${input.quantity} ${conv.uomLabel} = ${qty} ${item.unit}` : undefined;

  // UPDATE có điều kiện availability — atomic, không race
  const [level] = await ctx.db.update(khoStockLevels)
    .set({
      stocked: sql`${khoStockLevels.stocked} - ${qty}::numeric`,
      updatedAt: sql`now()`,
    })
    .where(and(
      eq(khoStockLevels.orgId, ctx.orgId),
      eq(khoStockLevels.itemId, item.id),
      eq(khoStockLevels.locationId, loc.id),
      lotCond(lot?.id),
      sql`${khoStockLevels.stocked} - ${khoStockLevels.reserved} >= ${qty}::numeric`,
    )).returning();

  if (!level) {
    const cur = await getLevel(ctx, item.id, loc.id, lot?.id);
    throw new KhoError('INSUFFICIENT_STOCK',
      `Không đủ tồn khả dụng để xuất ${qty} ${item.unit} "${item.name}" tại ${loc.code}`,
      {
        sku: item.sku, location_code: loc.code, requested: qty,
        stocked: cur?.stocked ?? '0', reserved: cur?.reserved ?? '0',
        available: cur ? String(sqlNum(cur.stocked) - sqlNum(cur.reserved)) : '0',
      });
  }

  const docNo = await nextDocNo(ctx, 'PXK');
  await ctx.db.insert(khoMovements).values({
    orgId: ctx.orgId, itemId: item.id, locationId: loc.id, lotId: lot?.id,
    type: 'issue', delta: `-${qty}`, unitCost: input.unit_cost, docNo,
    refType: input.ref_type, refId: input.ref_id,
    note: [input.note, uomNote].filter(Boolean).join(' · ') || undefined,
    actorUserId: ctx.userId,
  });

  await ctx.bus.emit('kho.stock.issued', {
    org_id: ctx.orgId, item_id: item.id, sku: item.sku,
    location_id: loc.id, location_code: loc.code,
    lot_id: lot?.id ?? null,
    quantity: qty, stocked: level.stocked, doc_no: docNo,
  });

  const summary = summarizeLevel(item, loc, level);

  // Cảnh báo tồn thấp ngay trong kết quả + event
  if (sqlNum(summary.available) <= sqlNum(item.minStock)) {
    summary.warning = `Tồn khả dụng (${summary.available}) đã chạm/dưới định mức tối thiểu (${item.minStock})`;
    await ctx.bus.emit('kho.stock.low', {
      org_id: ctx.orgId, item_id: item.id, sku: item.sku,
      location_id: loc.id, available: summary.available, min_stock: item.minStock,
    });
  }
  return summary;
}

/** CHUYỂN KHO — atomic: transfer_out kho nguồn + transfer_in kho đích */
export async function transferStock(ctx: KhoCtx, input: z.infer<typeof transferStockSchema>) {
  const item = await getItemBySku(ctx, input.sku);
  const from = await resolveLocation(ctx, input.from_location_code);
  const to = await resolveLocation(ctx, input.to_location_code);
  await ensureLevel(ctx, item.id, to.id);

  const [outLevel] = await ctx.db.update(khoStockLevels)
    .set({
      stocked: sql`${khoStockLevels.stocked} - ${input.quantity}::numeric`,
      updatedAt: sql`now()`,
    })
    .where(and(
      eq(khoStockLevels.orgId, ctx.orgId),
      eq(khoStockLevels.itemId, item.id),
      eq(khoStockLevels.locationId, from.id),
      sql`${khoStockLevels.stocked} - ${khoStockLevels.reserved} >= ${input.quantity}::numeric`,
    )).returning();

  if (!outLevel) {
    throw new KhoError('INSUFFICIENT_STOCK',
      `Kho ${from.code} không đủ tồn khả dụng để chuyển ${input.quantity} ${item.unit} "${item.name}"`,
      { sku: item.sku, from: from.code, requested: input.quantity });
  }

  const [inLevel] = await ctx.db.update(khoStockLevels)
    .set({
      stocked: sql`${khoStockLevels.stocked} + ${input.quantity}::numeric`,
      updatedAt: sql`now()`,
    })
    .where(and(
      eq(khoStockLevels.orgId, ctx.orgId),
      eq(khoStockLevels.itemId, item.id),
      eq(khoStockLevels.locationId, to.id),
    )).returning();

  await ctx.db.insert(khoMovements).values([
    {
      orgId: ctx.orgId, itemId: item.id, locationId: from.id,
      type: 'transfer_out', delta: `-${input.quantity}`,
      refType: 'transfer', note: input.note, actorUserId: ctx.userId,
    },
    {
      orgId: ctx.orgId, itemId: item.id, locationId: to.id,
      type: 'transfer_in', delta: input.quantity,
      refType: 'transfer', note: input.note, actorUserId: ctx.userId,
    },
  ]);

  await ctx.bus.emit('kho.stock.transferred', {
    org_id: ctx.orgId, item_id: item.id, sku: item.sku,
    from_location: from.code, to_location: to.code, quantity: input.quantity,
  });

  return {
    sku: item.sku, name: item.name, unit: item.unit,
    quantity: input.quantity,
    from: { code: from.code, stocked: outLevel.stocked },
    to: { code: to.code, stocked: inLevel.stocked },
  };
}

/** TRA CỨU TỒN — theo sku / keyword / kho; trả về availability từng dòng */
export async function queryStock(ctx: KhoCtx, input: z.infer<typeof queryStockSchema>) {
  const conds = [eq(khoItems.orgId, ctx.orgId)];
  if (input.sku) conds.push(eq(khoItems.sku, input.sku));
  if (input.keyword) {
    conds.push(or(
      ilike(khoItems.name, `%${input.keyword}%`),
      ilike(khoItems.sku, `%${input.keyword}%`),
    )!);
  }

  const locJoin = and(
    eq(khoStockLevels.locationId, khoLocations.id),
    eq(khoLocations.orgId, ctx.orgId),
  );

  const rows = await ctx.db.select({
    sku: khoItems.sku,
    name: khoItems.name,
    unit: khoItems.unit,
    minStock: khoItems.minStock,
    locationCode: khoLocations.code,
    stocked: khoStockLevels.stocked,
    reserved: khoStockLevels.reserved,
    incoming: khoStockLevels.incoming,
    available: sql<string>`(${khoStockLevels.stocked} - ${khoStockLevels.reserved})::text`,
  })
    .from(khoItems)
    .leftJoin(khoStockLevels, and(
      eq(khoStockLevels.itemId, khoItems.id),
      eq(khoStockLevels.orgId, ctx.orgId),
    ))
    .leftJoin(khoLocations, locJoin)
    .where(and(...conds))
    .limit(input.limit);

  const filtered = input.location_code
    ? rows.filter(r => r.locationCode === input.location_code)
    : rows;

  return filtered.map(r => ({
    sku: r.sku, name: r.name, unit: r.unit,
    location: r.locationCode ?? '(chưa có tồn)',
    stocked: r.stocked ?? '0', reserved: r.reserved ?? '0',
    incoming: r.incoming ?? '0', available: r.available ?? '0',
    min_stock: r.minStock,
  }));
}

/** CẢNH BÁO TỒN THẤP — tổng availability toàn org (mọi kho) <= min_stock */
export async function lowStockAlerts(ctx: KhoCtx, input: z.infer<typeof lowAlertsSchema>) {
  const rows = await ctx.db.select({
    sku: khoItems.sku,
    name: khoItems.name,
    unit: khoItems.unit,
    minStock: khoItems.minStock,
    available: sql<string>`coalesce(sum(${khoStockLevels.stocked} - ${khoStockLevels.reserved}), 0)::text`,
  })
    .from(khoItems)
    .leftJoin(khoStockLevels, and(
      eq(khoStockLevels.itemId, khoItems.id),
      eq(khoStockLevels.orgId, ctx.orgId),
      ...(input.location_code ? [] : []),
    ))
    .where(and(eq(khoItems.orgId, ctx.orgId), eq(khoItems.active, true)))
    .groupBy(khoItems.id, khoItems.sku, khoItems.name, khoItems.unit, khoItems.minStock)
    .having(sql`coalesce(sum(${khoStockLevels.stocked} - ${khoStockLevels.reserved}), 0) <= ${khoItems.minStock}`)
    .limit(input.limit);

  return rows.map(r => ({
    sku: r.sku, name: r.name, unit: r.unit,
    available: r.available, min_stock: r.minStock,
    suggest_reorder: String(Math.max(0,
      sqlNum(r.minStock) * 2 - sqlNum(r.available))),
  }));
}

/** LỊCH SỬ N-X-T của một SKU (sổ chi tiết vật tư — Mẫu S10-DN rút gọn) */
export async function movementHistory(ctx: KhoCtx, sku: string, limit = 30) {
  const item = await getItemBySku(ctx, sku);
  const rows = await ctx.db.select({
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
    .orderBy(sql`${khoMovements.createdAt} DESC`)
    .limit(limit);
  return { item: { sku: item.sku, name: item.name, unit: item.unit }, movements: rows };
}

// ---------- helpers ----------
function summarizeLevel(
  item: { sku: string; name: string; unit: string; minStock: string },
  loc: { code: string },
  level: { stocked: string; reserved: string },
): {
  sku: string; name: string; unit: string; location: string;
  stocked: string; reserved: string; available: string; warning?: string;
} {
  return {
    sku: item.sku, name: item.name, unit: item.unit, location: loc.code,
    stocked: level.stocked, reserved: level.reserved,
    available: String(sqlNum(level.stocked) - sqlNum(level.reserved)),
  };
}

/** CHỈ dùng cho hiển thị/so sánh cảnh báo — quyết định nghiệp vụ đã guard phía SQL */
function sqlNum(v: string): number { return Number.parseFloat(v); }
