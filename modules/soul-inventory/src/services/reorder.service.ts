/**
 * SOUL-INVENTORY v2.0 — reorder.service
 * Reordering rules min-max theo pattern Odoo (đơn giản hóa SME):
 *   - Rule theo item (+ location tùy chọn, NULL = toàn org)
 *   - Trigger: available (stocked - reserved + incoming) <= min_qty
 *   - Gợi ý đặt: max_qty - available (đưa tồn về max), kèm supplier + lead time
 * Đây là nâng cấp của low_stock_alerts: có rule riêng thay vì chỉ min_stock,
 * và gợi ý CÓ CƠ SỞ (về max) thay vì heuristic min×2.
 */
import { and, eq, sql } from 'drizzle-orm';
import { khoItems, khoReorderRules } from '../db/schema.js';
import type { KhoCtx } from '../types.js';
import { KhoError } from '../types.js';
import { getItemBySku, resolveLocation } from './catalog.service.js';

export async function upsertReorderRule(ctx: KhoCtx, input: {
  sku: string; min_qty: string; max_qty: string;
  location_code?: string; supplier_name?: string; lead_time_days?: number;
}) {
  const item = await getItemBySku(ctx, input.sku);
  const loc = input.location_code ? await resolveLocation(ctx, input.location_code) : null;

  // upsert theo (org, item, location?) — dùng delete+insert cho đơn giản với partial key
  await ctx.db.delete(khoReorderRules).where(and(
    eq(khoReorderRules.orgId, ctx.orgId),
    eq(khoReorderRules.itemId, item.id),
    loc ? eq(khoReorderRules.locationId, loc.id) : sql`${khoReorderRules.locationId} IS NULL`,
  ));
  const [rule] = await ctx.db.insert(khoReorderRules).values({
    orgId: ctx.orgId, itemId: item.id, locationId: loc?.id ?? null,
    minQty: input.min_qty, maxQty: input.max_qty,
    supplierName: input.supplier_name, leadTimeDays: input.lead_time_days ?? 0,
  }).returning();

  await ctx.bus.emit('kho.reorder.rule_upserted', {
    org_id: ctx.orgId, item_id: item.id, sku: item.sku,
    min_qty: rule.minQty, max_qty: rule.maxQty,
  });
  return {
    sku: item.sku, name: item.name, location: loc?.code ?? '(toàn bộ)',
    min_qty: rule.minQty, max_qty: rule.maxQty,
    supplier: rule.supplierName, lead_time_days: rule.leadTimeDays,
  };
}

/**
 * Gợi ý đặt hàng: quét mọi rule active, tính available theo phạm vi rule,
 * trả danh sách cần đặt kèm số lượng đề xuất + NCC + lead time.
 */
export async function reorderSuggestions(ctx: KhoCtx, limit = 100) {
  const res = await ctx.db.execute<{
    sku: string; name: string; unit: string; location_code: string | null;
    available: string; incoming: string; min_qty: string; max_qty: string;
    suggest: string; supplier_name: string | null; lead_time_days: number;
  }>(sql`
    WITH avail AS (
      SELECT r.id AS rule_id,
             COALESCE(sum(s.stocked - s.reserved), 0) AS available,
             COALESCE(sum(s.incoming), 0) AS incoming
      FROM kho_reorder_rules r
      LEFT JOIN kho_stock_levels s
        ON s.org_id = r.org_id AND s.item_id = r.item_id
        AND (r.location_id IS NULL OR s.location_id = r.location_id)
      WHERE r.org_id = ${ctx.orgId} AND r.is_active = true
      GROUP BY r.id
    )
    SELECT i.sku, i.name, i.unit, l.code AS location_code,
           a.available::text, a.incoming::text,
           r.min_qty::text, r.max_qty::text,
           greatest(r.max_qty - a.available - a.incoming, 0)::text AS suggest,
           r.supplier_name, r.lead_time_days
    FROM kho_reorder_rules r
    JOIN avail a ON a.rule_id = r.id
    JOIN kho_items i ON i.id = r.item_id AND i.org_id = ${ctx.orgId}
    LEFT JOIN kho_locations l ON l.id = r.location_id AND l.org_id = ${ctx.orgId}
    WHERE r.org_id = ${ctx.orgId}
      AND a.available + a.incoming <= r.min_qty
    ORDER BY (r.min_qty - a.available) DESC
    LIMIT ${limit}
  `);
  const rows = ('rows' in res ? (res as unknown as { rows: unknown[] }).rows : res) as Array<Record<string, unknown>>;
  return rows.map(r => ({
    sku: r.sku, name: r.name, unit: r.unit,
    location: r.location_code ?? '(toàn bộ)',
    available: r.available, incoming: r.incoming,
    min_qty: r.min_qty, max_qty: r.max_qty,
    suggest_order: r.suggest,
    supplier: r.supplier_name ?? '(chưa khai NCC)',
    lead_time_days: r.lead_time_days,
  }));
}
