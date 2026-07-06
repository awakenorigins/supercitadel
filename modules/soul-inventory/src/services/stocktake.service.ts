/**
 * MODULE KHO — stocktake.service
 * Kiểm kê (Mẫu 05-VT): đối chiếu tồn sổ sách (expected) vs đếm thực tế
 * (counted) → variance. finalize=true: tự động điều chỉnh tồn về số
 * thực tế + ghi movement 'adjust' cho từng dòng lệch (audit trail đầy đủ).
 */
import { and, eq, sql } from 'drizzle-orm';
import {
  khoMovements, khoStockLevels, khoStocktakeLines, khoStocktakes,
} from '../db/schema.js';
import type { KhoCtx } from '../types.js';
import { getItemBySku, resolveLocation } from './catalog.service.js';
import type { z } from 'zod';
import type { stocktakeExecuteSchema } from '../validation/schemas.js';

export async function executeStocktake(ctx: KhoCtx, input: z.infer<typeof stocktakeExecuteSchema>) {
  const loc = await resolveLocation(ctx, input.location_code);

  const [session] = await ctx.db.insert(khoStocktakes).values({
    orgId: ctx.orgId, locationId: loc.id, note: input.note,
    startedBy: ctx.userId,
  }).returning();

  const lines: Array<{
    sku: string; name: string; unit: string;
    expected: string; counted: string; variance: string;
  }> = [];

  for (const c of input.counts) {
    const item = await getItemBySku(ctx, c.sku);

    const [level] = await ctx.db.select().from(khoStockLevels).where(and(
      eq(khoStockLevels.orgId, ctx.orgId),
      eq(khoStockLevels.itemId, item.id),
      eq(khoStockLevels.locationId, loc.id),
    )).limit(1);

    const expected = level?.stocked ?? '0';
    // variance tính phía SQL để giữ độ chính xác numeric
    const [{ variance }] = await ctx.db.execute<{ variance: string }>(
      sql`SELECT (${c.counted}::numeric - ${expected}::numeric)::text AS variance`,
    ).then(r => ('rows' in r ? (r as unknown as { rows: Array<{ variance: string }> }).rows : (r as unknown as Array<{ variance: string }>)));

    await ctx.db.insert(khoStocktakeLines).values({
      orgId: ctx.orgId, stocktakeId: session.id, itemId: item.id,
      expected, counted: c.counted, variance,
    });

    lines.push({
      sku: item.sku, name: item.name, unit: item.unit,
      expected, counted: c.counted, variance,
    });

    // Chốt: điều chỉnh tồn về số đếm thực tế nếu có lệch
    if (input.finalize && Number.parseFloat(variance) !== 0) {
      if (level) {
        await ctx.db.update(khoStockLevels)
          .set({ stocked: c.counted, updatedAt: sql`now()` })
          .where(eq(khoStockLevels.id, level.id));
      } else {
        await ctx.db.insert(khoStockLevels).values({
          orgId: ctx.orgId, itemId: item.id, locationId: loc.id, stocked: c.counted,
        });
      }
      await ctx.db.insert(khoMovements).values({
        orgId: ctx.orgId, itemId: item.id, locationId: loc.id,
        type: 'adjust', delta: variance,
        refType: 'stocktake', refId: session.id,
        note: `Kiểm kê: sổ sách ${expected} → thực tế ${c.counted}`,
        actorUserId: ctx.userId,
      });
    }
  }

  if (input.finalize) {
    await ctx.db.update(khoStocktakes)
      .set({ status: 'finalized', finalizedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(khoStocktakes.orgId, ctx.orgId), eq(khoStocktakes.id, session.id)));

    await ctx.bus.emit('kho.stocktake.finalized', {
      org_id: ctx.orgId, stocktake_id: session.id, location_code: loc.code,
      total_lines: lines.length,
      lines_with_variance: lines.filter(l => Number.parseFloat(l.variance) !== 0).length,
    });
  }

  return {
    stocktake_id: session.id,
    location: loc.code,
    status: input.finalize ? 'finalized' : 'draft',
    lines,
    summary: {
      total: lines.length,
      matched: lines.filter(l => Number.parseFloat(l.variance) === 0).length,
      variance: lines.filter(l => Number.parseFloat(l.variance) !== 0).length,
    },
  };
}
