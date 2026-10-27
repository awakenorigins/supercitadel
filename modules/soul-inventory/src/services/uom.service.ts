/**
 * SOUL-INVENTORY v2.0 — uom.service
 * Multi-UoM theo pattern ERPNext: mỗi item có đơn vị GỐC (kho_items.unit,
 * là đơn vị lưu tồn), các đơn vị quy đổi khai trong kho_item_uoms với
 * factor: 1 <uom_name> = factor × <đơn vị gốc>.
 *   VD: item "Bia 333" unit="lon" → uom "thùng" factor=24, uom "lốc" factor=6.
 * Mọi nghiệp vụ nhập/xuất nhận (quantity, uom?) → convert về đơn vị gốc
 * TRƯỚC KHI chạm stock level. Tính toán phía SQL giữ numeric chính xác.
 */
import { and, eq, sql } from 'drizzle-orm';
import { khoItemUoms, khoItems } from '../db/schema.js';
import type { KhoCtx } from '../types.js';
import { KhoError } from '../types.js';

export interface UomInput {
  uom_name: string;
  factor: string;          // string decimal
  is_purchase?: boolean;
  is_sales?: boolean;
  barcode?: string;
}

/** Khai/cập nhật đơn vị quy đổi cho item */
export async function upsertUom(ctx: KhoCtx, itemId: string, input: UomInput) {
  const [row] = await ctx.db.insert(khoItemUoms).values({
    orgId: ctx.orgId,
    itemId,
    uomName: input.uom_name,
    factor: input.factor,
    isPurchase: input.is_purchase ?? false,
    isSales: input.is_sales ?? false,
    barcode: input.barcode,
  }).onConflictDoUpdate({
    target: [khoItemUoms.orgId, khoItemUoms.itemId, khoItemUoms.uomName],
    set: {
      factor: input.factor,
      isPurchase: input.is_purchase ?? false,
      isSales: input.is_sales ?? false,
      barcode: input.barcode ?? sql`${khoItemUoms.barcode}`,
      updatedAt: sql`now()`,
    },
  }).returning();
  await ctx.bus.emit('kho.uom.upserted', {
    org_id: ctx.orgId, item_id: itemId, uom_name: row.uomName, factor: row.factor,
  });
  return row;
}

export async function listUoms(ctx: KhoCtx, itemId: string) {
  return ctx.db.select().from(khoItemUoms)
    .where(and(eq(khoItemUoms.orgId, ctx.orgId), eq(khoItemUoms.itemId, itemId)));
}

/**
 * Quy đổi quantity từ uom (nếu có) về ĐƠN VỊ GỐC — phía SQL.
 * uomName trống/trùng đơn vị gốc → giữ nguyên.
 * Trả về { baseQty (string), factor (string), uomLabel } để ghi note chứng từ.
 */
export async function toBaseQty(
  ctx: KhoCtx,
  item: { id: string; unit: string },
  quantity: string,
  uomName?: string,
): Promise<{ baseQty: string; factor: string; uomLabel: string }> {
  if (!uomName || uomName === item.unit) {
    return { baseQty: quantity, factor: '1', uomLabel: item.unit };
  }
  const [uom] = await ctx.db.select().from(khoItemUoms).where(and(
    eq(khoItemUoms.orgId, ctx.orgId),
    eq(khoItemUoms.itemId, item.id),
    eq(khoItemUoms.uomName, uomName),
  )).limit(1);
  if (!uom) {
    throw new KhoError('UOM_NOT_FOUND',
      `Mặt hàng chưa khai đơn vị "${uomName}" — các đơn vị hợp lệ xem bằng kho.stock.query`,
      { uom_name: uomName });
  }
  const res = await ctx.db.execute<{ base: string }>(sql`
    SELECT (${quantity}::numeric * ${uom.factor}::numeric)::text AS base
  `);
  const rows = ('rows' in res ? (res as unknown as { rows: Array<{ base: string }> }).rows : res) as Array<{ base: string }>;
  return { baseQty: rows[0]!.base, factor: uom.factor, uomLabel: uomName };
}

/**
 * Tra item theo barcode: khớp barcode chính của item HOẶC barcode của một
 * quy cách (uom). Trả kèm uom nếu khớp barcode quy cách — dùng cho workflow
 * quét mã: quét thùng → tự hiểu 1 thùng = 24 lon.
 */
export async function findByBarcode(ctx: KhoCtx, barcode: string) {
  const [item] = await ctx.db.select().from(khoItems).where(and(
    eq(khoItems.orgId, ctx.orgId), eq(khoItems.barcode, barcode),
  )).limit(1);
  if (item) return { item, uom: null as null | { uomName: string; factor: string } };

  const [uomHit] = await ctx.db.select({
    uomName: khoItemUoms.uomName,
    factor: khoItemUoms.factor,
    itemId: khoItemUoms.itemId,
  }).from(khoItemUoms).where(and(
    eq(khoItemUoms.orgId, ctx.orgId), eq(khoItemUoms.barcode, barcode),
  )).limit(1);
  if (!uomHit) {
    throw new KhoError('BARCODE_NOT_FOUND',
      `Không tìm thấy mã vạch "${barcode}" trong danh mục`, { barcode });
  }
  const [it] = await ctx.db.select().from(khoItems).where(and(
    eq(khoItems.orgId, ctx.orgId), eq(khoItems.id, uomHit.itemId),
  )).limit(1);
  return { item: it!, uom: { uomName: uomHit.uomName, factor: uomHit.factor } };
}
