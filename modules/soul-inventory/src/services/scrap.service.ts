/**
 * SOUL-INVENTORY v2.0 — scrap.service
 * Hủy hàng hỏng/hết hạn (pattern Odoo scrap đơn giản hóa):
 *   - Trừ tồn (guard availability như issue), hỗ trợ lot/serial
 *   - Movement type 'scrap' với doc_no SCR-xxxxxx
 *   - Tính giá trị thiệt hại = qty × avg_cost để báo cáo
 *   - Lô hết hạn có thể đánh dấu status 'expired' trước rồi scrap cả lô
 */
import { and, eq, sql } from 'drizzle-orm';
import { khoLots, khoMovements, khoStockLevels } from '../db/schema.js';
import type { KhoCtx } from '../types.js';
import { KhoError } from '../types.js';
import { getItemBySku, resolveLocation } from './catalog.service.js';
import { findLot } from './lot.service.js';
import { nextDocNo } from './docnumber.service.js';

export async function scrapStock(ctx: KhoCtx, input: {
  sku: string; quantity: string; location_code?: string;
  lot_no?: string; serial_no?: string; reason?: string;
}) {
  const item = await getItemBySku(ctx, input.sku);
  const loc = await resolveLocation(ctx, input.location_code);
  const lot = (input.lot_no || input.serial_no)
    ? await findLot(ctx, item.id, { lot_no: input.lot_no, serial_no: input.serial_no })
    : (item.trackLot || item.trackSerial)
      ? (() => {
          throw new KhoError('LOT_REQUIRED',
            `Mặt hàng "${item.sku}" theo dõi ${item.trackSerial ? 'serial' : 'lô'} — cần chỉ rõ khi hủy`,
            { sku: item.sku });
        })()
      : null;

  const lotCond = lot
    ? eq(khoStockLevels.lotId, lot.id)
    : sql`${khoStockLevels.lotId} IS NULL`;

  // Hủy được cả phần đang reserved? KHÔNG — chỉ hủy phần khả dụng (an toàn đơn hàng)
  const [level] = await ctx.db.update(khoStockLevels)
    .set({ stocked: sql`${khoStockLevels.stocked} - ${input.quantity}::numeric`, updatedAt: sql`now()` })
    .where(and(
      eq(khoStockLevels.orgId, ctx.orgId),
      eq(khoStockLevels.itemId, item.id),
      eq(khoStockLevels.locationId, loc.id),
      lotCond,
      sql`${khoStockLevels.stocked} - ${khoStockLevels.reserved} >= ${input.quantity}::numeric`,
    )).returning();
  if (!level) {
    throw new KhoError('INSUFFICIENT_STOCK',
      `Không đủ tồn khả dụng để hủy ${input.quantity} ${item.unit} "${item.name}" tại ${loc.code}`,
      { sku: item.sku, requested: input.quantity });
  }

  const docNo = await nextDocNo(ctx, 'SCR');
  await ctx.db.insert(khoMovements).values({
    orgId: ctx.orgId, itemId: item.id, locationId: loc.id, lotId: lot?.id,
    type: 'scrap', delta: `-${input.quantity}`, docNo,
    unitCost: item.avgCost,
    refType: 'scrap', refId: docNo,
    note: input.reason ?? 'Hủy hàng hỏng', actorUserId: ctx.userId,
  });

  // Giá trị thiệt hại phía SQL
  const lossRes = await ctx.db.execute<{ loss: string }>(sql`
    SELECT round(${input.quantity}::numeric * ${item.avgCost}::numeric, 2)::text AS loss
  `);
  const lossRows = ('rows' in lossRes ? (lossRes as unknown as { rows: Array<{ loss: string }> }).rows : lossRes) as Array<{ loss: string }>;

  // Nếu scrap hết một lô → đánh dấu consumed
  if (lot) {
    await ctx.db.execute(sql`
      UPDATE kho_lots SET status = 'consumed', updated_at = now()
      WHERE id = ${lot.id} AND org_id = ${ctx.orgId}
        AND NOT EXISTS (
          SELECT 1 FROM kho_stock_levels s
          WHERE s.lot_id = ${lot.id} AND s.org_id = ${ctx.orgId} AND s.stocked > 0
        )
    `);
  }

  await ctx.bus.emit('kho.stock.scrapped', {
    org_id: ctx.orgId, doc_no: docNo, item_id: item.id, sku: item.sku,
    location_code: loc.code, lot_id: lot?.id ?? null,
    quantity: input.quantity, loss_value: lossRows[0]!.loss,
  });

  return {
    doc_no: docNo, sku: item.sku, name: item.name, unit: item.unit,
    location: loc.code, lot_no: input.lot_no ?? null, serial_no: input.serial_no ?? null,
    quantity: input.quantity, loss_value: lossRows[0]!.loss,
    stocked_after: level.stocked, reason: input.reason ?? 'Hủy hàng hỏng',
  };
}
