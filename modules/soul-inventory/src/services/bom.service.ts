/**
 * SOUL-INVENTORY v2.0 — bom.service
 * BOM (định mức nguyên liệu) + lệnh lắp ráp/tháo dỡ, port logic ERPNext
 * Work Order + Odoo mrp đơn giản hóa cho SME:
 *   - assemble: kiểm đủ MỌI nguyên liệu (kèm scrap_pct) → trừ NL (assembly_out)
 *     + cộng thành phẩm (assembly_in) — MỘT transaction, guard SQL từng dòng
 *   - disassemble: ngược lại — trừ thành phẩm, hoàn nguyên liệu theo BOM
 *   - Giá vốn thành phẩm = Σ(qty NL × avg_cost NL) / output — cập nhật avg_cost
 * Backflush: nguyên liệu trừ tự động theo định mức, không cần khai tay.
 */
import { and, eq, sql } from 'drizzle-orm';
import {
  khoBomLines, khoBoms, khoItems, khoMovements, khoStockLevels,
} from '../db/schema.js';
import type { KhoCtx } from '../types.js';
import { KhoError } from '../types.js';
import { getItemBySku, resolveLocation } from './catalog.service.js';
import { nextDocNo } from './docnumber.service.js';

export interface BomLineInput { component_sku: string; qty_per: string; scrap_pct?: string }

/** Tạo/cập nhật BOM cho một thành phẩm (thay toàn bộ lines) */
export async function upsertBom(ctx: KhoCtx, input: {
  sku: string; name?: string; output_qty?: string; lines: BomLineInput[]; note?: string;
}) {
  const item = await getItemBySku(ctx, input.sku);
  if (input.lines.length === 0) {
    throw new KhoError('BOM_EMPTY', 'BOM phải có ít nhất một dòng nguyên liệu');
  }

  // Một thành phẩm một BOM active (SME-simple): tắt BOM cũ, tạo mới
  await ctx.db.update(khoBoms)
    .set({ isActive: false, updatedAt: sql`now()` })
    .where(and(eq(khoBoms.orgId, ctx.orgId), eq(khoBoms.itemId, item.id)));

  const [bom] = await ctx.db.insert(khoBoms).values({
    orgId: ctx.orgId, itemId: item.id,
    name: input.name ?? 'Định mức chuẩn',
    outputQty: input.output_qty ?? '1',
    note: input.note,
  }).returning();

  const lines = [];
  for (const l of input.lines) {
    const comp = await getItemBySku(ctx, l.component_sku);
    if (comp.id === item.id) {
      throw new KhoError('INVALID_INPUT', 'Nguyên liệu không thể là chính thành phẩm', { sku: l.component_sku });
    }
    const [line] = await ctx.db.insert(khoBomLines).values({
      orgId: ctx.orgId, bomId: bom.id, componentId: comp.id,
      qtyPer: l.qty_per, scrapPct: l.scrap_pct ?? '0',
    }).returning();
    lines.push({ ...line, component_sku: comp.sku, component_name: comp.name, unit: comp.unit });
  }

  await ctx.bus.emit('kho.bom.upserted', {
    org_id: ctx.orgId, bom_id: bom.id, item_id: item.id, sku: item.sku, lines: lines.length,
  });
  return { bom_id: bom.id, sku: item.sku, name: bom.name, output_qty: bom.outputQty, lines };
}

async function getActiveBom(ctx: KhoCtx, itemId: string) {
  const [bom] = await ctx.db.select().from(khoBoms).where(and(
    eq(khoBoms.orgId, ctx.orgId), eq(khoBoms.itemId, itemId), eq(khoBoms.isActive, true),
  )).limit(1);
  if (!bom) throw new KhoError('BOM_NOT_FOUND', 'Thành phẩm chưa có định mức (BOM) — tạo bằng kho.bom.upsert');
  const lines = await ctx.db.select({
    componentId: khoBomLines.componentId,
    qtyPer: khoBomLines.qtyPer,
    scrapPct: khoBomLines.scrapPct,
    sku: khoItems.sku,
    name: khoItems.name,
    unit: khoItems.unit,
    avgCost: khoItems.avgCost,
  }).from(khoBomLines)
    .innerJoin(khoItems, eq(khoBomLines.componentId, khoItems.id))
    .where(and(eq(khoBomLines.orgId, ctx.orgId), eq(khoBomLines.bomId, bom.id)));
  if (lines.length === 0) throw new KhoError('BOM_EMPTY', 'BOM không có dòng nguyên liệu');
  return { bom, lines };
}

/**
 * Nhu cầu nguyên liệu cho qty thành phẩm — tính phía SQL:
 * need = qty / output_qty × qty_per × (1 + scrap_pct/100)
 */
async function componentNeeds(
  ctx: KhoCtx, bom: { outputQty: string },
  lines: Array<{ componentId: string; qtyPer: string; scrapPct: string; sku: string; name: string; unit: string; avgCost: string }>,
  qty: string,
) {
  const needs = [];
  for (const l of lines) {
    const res = await ctx.db.execute<{ need: string }>(sql`
      SELECT round(
        ${qty}::numeric / ${bom.outputQty}::numeric * ${l.qtyPer}::numeric
        * (1 + ${l.scrapPct}::numeric / 100), 3)::text AS need
    `);
    const rows = ('rows' in res ? (res as unknown as { rows: Array<{ need: string }> }).rows : res) as Array<{ need: string }>;
    needs.push({ ...l, need: rows[0]!.need });
  }
  return needs;
}

/** LẮP RÁP: trừ nguyên liệu (backflush) + cộng thành phẩm — atomic */
export async function assemble(ctx: KhoCtx, input: {
  sku: string; qty: string; location_code?: string; note?: string;
}) {
  const item = await getItemBySku(ctx, input.sku);
  const loc = await resolveLocation(ctx, input.location_code);
  const { bom, lines } = await getActiveBom(ctx, item.id);
  const needs = await componentNeeds(ctx, bom, lines, input.qty);
  const docNo = await nextDocNo(ctx, 'LSX');

  // 1) Trừ từng nguyên liệu — guard availability atomic; thiếu là ném lỗi kèm chi tiết
  for (const n of needs) {
    const [updated] = await ctx.db.update(khoStockLevels)
      .set({
        stocked: sql`${khoStockLevels.stocked} - ${n.need}::numeric`,
        updatedAt: sql`now()`,
      })
      .where(and(
        eq(khoStockLevels.orgId, ctx.orgId),
        eq(khoStockLevels.itemId, n.componentId),
        eq(khoStockLevels.locationId, loc.id),
        sql`${khoStockLevels.lotId} IS NULL`,
        sql`${khoStockLevels.stocked} - ${khoStockLevels.reserved} >= ${n.need}::numeric`,
      )).returning();
    if (!updated) {
      throw new KhoError('INSUFFICIENT_COMPONENT',
        `Không đủ nguyên liệu "${n.name}" (cần ${n.need} ${n.unit}) tại ${loc.code} để lắp ${input.qty} ${item.unit} "${item.name}"`,
        { component_sku: n.sku, need: n.need, location_code: loc.code });
    }
    await ctx.db.insert(khoMovements).values({
      orgId: ctx.orgId, itemId: n.componentId, locationId: loc.id,
      type: 'assembly_out', delta: `-${n.need}`, docNo,
      refType: 'assembly', refId: docNo,
      note: input.note ?? `Backflush lắp ${input.qty} ${item.sku}`,
      actorUserId: ctx.userId,
    });
  }

  // 2) Cộng thành phẩm + giá vốn = Σ(need × avg_cost NL) / qty
  const costRes = await ctx.db.execute<{ unit_cost: string }>(sql`
    SELECT round((${needs.map(n => sql`${n.need}::numeric * ${n.avgCost}::numeric`)
      .reduce((a, b) => sql`${a} + ${b}`)}) / ${input.qty}::numeric, 2)::text AS unit_cost
  `);
  const costRows = ('rows' in costRes ? (costRes as unknown as { rows: Array<{ unit_cost: string }> }).rows : costRes) as Array<{ unit_cost: string }>;
  const unitCost = costRows[0]!.unit_cost;

  await ctx.db.insert(khoStockLevels)
    .values({ orgId: ctx.orgId, itemId: item.id, locationId: loc.id })
    .onConflictDoNothing();
  const [level] = await ctx.db.update(khoStockLevels)
    .set({ stocked: sql`${khoStockLevels.stocked} + ${input.qty}::numeric`, updatedAt: sql`now()` })
    .where(and(
      eq(khoStockLevels.orgId, ctx.orgId),
      eq(khoStockLevels.itemId, item.id),
      eq(khoStockLevels.locationId, loc.id),
      sql`${khoStockLevels.lotId} IS NULL`,
    )).returning();

  await ctx.db.insert(khoMovements).values({
    orgId: ctx.orgId, itemId: item.id, locationId: loc.id,
    type: 'assembly_in', delta: input.qty, unitCost, docNo,
    refType: 'assembly', refId: docNo, note: input.note, actorUserId: ctx.userId,
  });

  // avg_cost thành phẩm — bình quân gia quyền như receive
  await ctx.db.execute(sql`
    UPDATE kho_items SET avg_cost = sub.new_avg, updated_at = now()
    FROM (
      SELECT CASE WHEN COALESCE(sum(s.stocked), 0) <= 0 THEN ${unitCost}::numeric
             ELSE round(
               ( (COALESCE(sum(s.stocked), 0) - ${input.qty}::numeric) * ${item.avgCost}::numeric
                 + ${input.qty}::numeric * ${unitCost}::numeric )
               / COALESCE(sum(s.stocked), 1), 2)
             END AS new_avg
      FROM kho_stock_levels s
      WHERE s.org_id = ${ctx.orgId} AND s.item_id = ${item.id}
    ) sub
    WHERE kho_items.id = ${item.id} AND kho_items.org_id = ${ctx.orgId}
  `);

  const [order] = await ctx.db.insert(khoAssemblyOrdersRef()).values({
    orgId: ctx.orgId, docNo, kind: 'assemble', bomId: bom.id,
    itemId: item.id, qty: input.qty, locationId: loc.id,
    note: input.note, actorUserId: ctx.userId,
  }).returning();

  await ctx.bus.emit('kho.assembly.done', {
    org_id: ctx.orgId, doc_no: docNo, kind: 'assemble',
    item_id: item.id, sku: item.sku, qty: input.qty, unit_cost: unitCost,
  });

  return {
    doc_no: docNo, kind: 'assemble', sku: item.sku, name: item.name,
    qty: input.qty, unit: item.unit, location: loc.code,
    unit_cost: unitCost, stocked_after: level.stocked,
    components_used: needs.map(n => ({ sku: n.sku, name: n.name, qty: n.need, unit: n.unit })),
    order_id: order.id,
  };
}

/** THÁO DỠ: trừ thành phẩm, hoàn nguyên liệu theo BOM (không tính scrap) */
export async function disassemble(ctx: KhoCtx, input: {
  sku: string; qty: string; location_code?: string; note?: string;
}) {
  const item = await getItemBySku(ctx, input.sku);
  const loc = await resolveLocation(ctx, input.location_code);
  const { bom, lines } = await getActiveBom(ctx, item.id);
  const docNo = await nextDocNo(ctx, 'LTD');

  // Trừ thành phẩm — guard
  const [down] = await ctx.db.update(khoStockLevels)
    .set({ stocked: sql`${khoStockLevels.stocked} - ${input.qty}::numeric`, updatedAt: sql`now()` })
    .where(and(
      eq(khoStockLevels.orgId, ctx.orgId),
      eq(khoStockLevels.itemId, item.id),
      eq(khoStockLevels.locationId, loc.id),
      sql`${khoStockLevels.lotId} IS NULL`,
      sql`${khoStockLevels.stocked} - ${khoStockLevels.reserved} >= ${input.qty}::numeric`,
    )).returning();
  if (!down) {
    throw new KhoError('INSUFFICIENT_STOCK',
      `Không đủ "${item.name}" tại ${loc.code} để tháo ${input.qty} ${item.unit}`,
      { sku: item.sku, requested: input.qty });
  }
  await ctx.db.insert(khoMovements).values({
    orgId: ctx.orgId, itemId: item.id, locationId: loc.id,
    type: 'assembly_out', delta: `-${input.qty}`, docNo,
    refType: 'disassembly', refId: docNo, note: input.note, actorUserId: ctx.userId,
  });

  // Hoàn nguyên liệu: qty / output_qty × qty_per (không cộng scrap — hao hụt không hoàn được)
  const returned = [];
  for (const l of lines) {
    const res = await ctx.db.execute<{ back: string }>(sql`
      SELECT round(${input.qty}::numeric / ${bom.outputQty}::numeric * ${l.qtyPer}::numeric, 3)::text AS back
    `);
    const rows = ('rows' in res ? (res as unknown as { rows: Array<{ back: string }> }).rows : res) as Array<{ back: string }>;
    const back = rows[0]!.back;
    await ctx.db.insert(khoStockLevels)
      .values({ orgId: ctx.orgId, itemId: l.componentId, locationId: loc.id })
      .onConflictDoNothing();
    await ctx.db.update(khoStockLevels)
      .set({ stocked: sql`${khoStockLevels.stocked} + ${back}::numeric`, updatedAt: sql`now()` })
      .where(and(
        eq(khoStockLevels.orgId, ctx.orgId),
        eq(khoStockLevels.itemId, l.componentId),
        eq(khoStockLevels.locationId, loc.id),
        sql`${khoStockLevels.lotId} IS NULL`,
      ));
    await ctx.db.insert(khoMovements).values({
      orgId: ctx.orgId, itemId: l.componentId, locationId: loc.id,
      type: 'assembly_in', delta: back, docNo,
      refType: 'disassembly', refId: docNo,
      note: `Hoàn NL từ tháo ${input.qty} ${item.sku}`, actorUserId: ctx.userId,
    });
    returned.push({ sku: l.sku, name: l.name, qty: back, unit: l.unit });
  }

  await ctx.db.insert(khoAssemblyOrdersRef()).values({
    orgId: ctx.orgId, docNo, kind: 'disassemble', bomId: bom.id,
    itemId: item.id, qty: input.qty, locationId: loc.id,
    note: input.note, actorUserId: ctx.userId,
  });

  await ctx.bus.emit('kho.assembly.done', {
    org_id: ctx.orgId, doc_no: docNo, kind: 'disassemble',
    item_id: item.id, sku: item.sku, qty: input.qty,
  });

  return {
    doc_no: docNo, kind: 'disassemble', sku: item.sku, qty: input.qty,
    location: loc.code, components_returned: returned,
  };
}

/** Xem BOM + khả năng lắp tối đa với tồn hiện tại */
export async function bomInfo(ctx: KhoCtx, sku: string) {
  const item = await getItemBySku(ctx, sku);
  const { bom, lines } = await getActiveBom(ctx, item.id);
  const detail = [];
  let maxBuildable: number | null = null;
  for (const l of lines) {
    const res = await ctx.db.execute<{ avail: string; can: string }>(sql`
      SELECT COALESCE(sum(s.stocked - s.reserved), 0)::text AS avail,
             floor(COALESCE(sum(s.stocked - s.reserved), 0)
               / (${l.qtyPer}::numeric * (1 + ${l.scrapPct}::numeric/100))
               * ${bom.outputQty}::numeric)::text AS can
      FROM kho_stock_levels s
      WHERE s.org_id = ${ctx.orgId} AND s.item_id = ${l.componentId}
    `);
    const rows = ('rows' in res ? (res as unknown as { rows: Array<{ avail: string; can: string }> }).rows : res) as Array<{ avail: string; can: string }>;
    const can = Number.parseFloat(rows[0]!.can);
    maxBuildable = maxBuildable === null ? can : Math.min(maxBuildable, can);
    detail.push({
      sku: l.sku, name: l.name, unit: l.unit,
      qty_per: l.qtyPer, scrap_pct: l.scrapPct, available: rows[0]!.avail,
    });
  }
  return {
    sku: item.sku, name: item.name, bom_name: bom.name,
    output_qty: bom.outputQty, lines: detail,
    max_buildable: String(maxBuildable ?? 0),
  };
}

// tránh circular import — bảng assembly orders import trễ
import { khoAssemblyOrders } from '../db/schema.js';
function khoAssemblyOrdersRef() { return khoAssemblyOrders; }
