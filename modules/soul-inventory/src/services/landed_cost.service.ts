/**
 * SOUL-INVENTORY v2.0 — landed_cost.service
 * Landed cost theo pattern Odoo/ERPNext đơn giản hóa: phân bổ một khoản
 * chi phí (vận chuyển, thuế nhập khẩu, bốc xếp...) vào các dòng NHẬP KHO
 * đã có (movements type='receive'), theo:
 *   - by_value: tỷ lệ theo giá trị dòng (delta × unit_cost) — mặc định
 *   - by_qty:   tỷ lệ theo số lượng
 * Hệ quả: avg_cost của từng item được cập nhật lại (tăng thêm phần phân bổ
 * chia cho tổng tồn hiện tại của item) — tính toàn bộ phía SQL.
 * Không sửa unit_cost gốc trên movement (ledger bất biến) — ghi bảng
 * kho_landed_cost_lines để truy nguyên.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { khoItems, khoLandedCostLines, khoLandedCosts, khoMovements } from '../db/schema.js';
import type { KhoCtx } from '../types.js';
import { KhoError } from '../types.js';
import { nextDocNo } from './docnumber.service.js';

export async function applyLandedCost(ctx: KhoCtx, input: {
  movement_doc_nos?: string[];      // các phiếu PNK- cần phân bổ
  movement_ids?: string[];          // hoặc id trực tiếp
  total_cost: string;
  method?: 'by_value' | 'by_qty';
  note?: string;
}) {
  const method = input.method ?? 'by_value';

  // Tìm movements receive mục tiêu
  const conds = [
    eq(khoMovements.orgId, ctx.orgId),
    eq(khoMovements.type, 'receive'),
  ];
  if (input.movement_ids?.length) {
    conds.push(inArray(khoMovements.id, input.movement_ids));
  } else if (input.movement_doc_nos?.length) {
    conds.push(inArray(khoMovements.docNo, input.movement_doc_nos));
  } else {
    throw new KhoError('LANDED_COST_INVALID',
      'Cần chỉ định phiếu nhập (movement_doc_nos hoặc movement_ids) để phân bổ chi phí');
  }
  const moves = await ctx.db.select().from(khoMovements).where(and(...conds));
  if (moves.length === 0) {
    throw new KhoError('MOVEMENT_NOT_FOUND', 'Không tìm thấy phiếu nhập nào khớp để phân bổ');
  }

  const docNo = await nextDocNo(ctx, 'LC');
  const [lc] = await ctx.db.insert(khoLandedCosts).values({
    orgId: ctx.orgId, docNo, method,
    totalCost: input.total_cost, note: input.note, actorUserId: ctx.userId,
  }).returning();

  // Trọng số từng dòng — tính phía SQL, làm tròn 2, dòng cuối nhận phần dư
  const weights: Array<{ id: string; itemId: string; w: string }> = [];
  for (const m of moves) {
    const wRes = await ctx.db.execute<{ w: string }>(sql`
      SELECT CASE WHEN ${method} = 'by_value'
        THEN (${m.delta}::numeric * COALESCE(${m.unitCost}::numeric, 0))
        ELSE ${m.delta}::numeric END::text AS w
    `);
    const rows = ('rows' in wRes ? (wRes as unknown as { rows: Array<{ w: string }> }).rows : wRes) as Array<{ w: string }>;
    weights.push({ id: m.id, itemId: m.itemId, w: rows[0]!.w });
  }
  const totalW = weights.reduce((s, x) => s + Number.parseFloat(x.w), 0);
  if (totalW <= 0) {
    throw new KhoError('LANDED_COST_INVALID',
      method === 'by_value'
        ? 'Các phiếu nhập không có đơn giá — dùng method by_qty'
        : 'Tổng trọng số bằng 0');
  }

  const lines = [];
  let allocatedSum = 0;
  for (let i = 0; i < weights.length; i++) {
    const wobj = weights[i]!;
    let allocated: number;
    if (i === weights.length - 1) {
      allocated = Number((Number.parseFloat(input.total_cost) - allocatedSum).toFixed(2));
    } else {
      allocated = Number(
        (Number.parseFloat(input.total_cost) * Number.parseFloat(wobj.w) / totalW).toFixed(2));
      allocatedSum = Number((allocatedSum + allocated).toFixed(2));
    }
    await ctx.db.insert(khoLandedCostLines).values({
      orgId: ctx.orgId, landedCostId: lc.id,
      movementId: wobj.id, allocated: String(allocated),
    });

    // Cập nhật avg_cost item: cộng thêm allocated / tổng tồn hiện tại
    await ctx.db.execute(sql`
      UPDATE kho_items SET avg_cost = sub.new_avg, updated_at = now()
      FROM (
        SELECT CASE WHEN COALESCE(sum(s.stocked), 0) <= 0
               THEN kho_items_inner.avg_cost
               ELSE round(kho_items_inner.avg_cost
                 + ${String(allocated)}::numeric / sum(s.stocked), 2)
               END AS new_avg
        FROM kho_items kho_items_inner
        LEFT JOIN kho_stock_levels s
          ON s.item_id = kho_items_inner.id AND s.org_id = ${ctx.orgId}
        WHERE kho_items_inner.id = ${wobj.itemId} AND kho_items_inner.org_id = ${ctx.orgId}
        GROUP BY kho_items_inner.avg_cost
      ) sub
      WHERE kho_items.id = ${wobj.itemId} AND kho_items.org_id = ${ctx.orgId}
    `);

    const [it] = await ctx.db.select({ sku: khoItems.sku, name: khoItems.name, avgCost: khoItems.avgCost })
      .from(khoItems).where(and(eq(khoItems.orgId, ctx.orgId), eq(khoItems.id, wobj.itemId))).limit(1);
    lines.push({ movement_id: wobj.id, sku: it?.sku, allocated: String(allocated), new_avg_cost: it?.avgCost });
  }

  await ctx.bus.emit('kho.landed_cost.applied', {
    org_id: ctx.orgId, doc_no: docNo, total_cost: input.total_cost,
    method, lines: lines.length,
  });

  return { doc_no: docNo, method, total_cost: input.total_cost, lines };
}
