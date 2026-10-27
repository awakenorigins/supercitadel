/**
 * SOUL-INVENTORY v2.0 — analytics.service
 * Ba công cụ phân tích port từ pattern ERPNext/Odoo, tính toàn bộ phía SQL:
 *   1. ABC analysis: phân loại A/B/C theo giá trị XUẤT 90 ngày gần nhất
 *      (A = top 80% giá trị, B = 15% kế, C = 5% còn lại — Pareto chuẩn)
 *      → ghi ngược vào kho_items.abc_class
 *   2. Stock aging: tồn hiện tại nằm kho bao lâu (theo lần nhập gần nhất)
 *      bucket 0-30 / 31-60 / 61-90 / >90 ngày
 *   3. Cycle count suggestion: gợi ý kiểm kê luân phiên — lớp A kiểm
 *      thường xuyên nhất, C thưa nhất; ưu tiên item lâu chưa kiểm
 */
import { sql } from 'drizzle-orm';
import type { KhoCtx } from '../types.js';

/** Chạy ABC analysis và cập nhật abc_class cho toàn bộ item của org */
export async function runAbcAnalysis(ctx: KhoCtx, lookbackDays = 90) {
  const res = await ctx.db.execute<{
    sku: string; name: string; issue_value: string; cum_pct: string; abc: string;
  }>(sql`
    WITH issue_val AS (
      SELECT m.item_id,
             COALESCE(sum(abs(m.delta) * COALESCE(m.unit_cost, i.avg_cost, 0)), 0) AS val
      FROM kho_movements m
      JOIN kho_items i ON i.id = m.item_id AND i.org_id = ${ctx.orgId}
      WHERE m.org_id = ${ctx.orgId}
        AND m.type IN ('issue', 'reserve_fulfill')
        AND m.created_at >= now() - (${lookbackDays}::int || ' days')::interval
      GROUP BY m.item_id
    ),
    ranked AS (
      SELECT i.id, i.sku, i.name,
             COALESCE(v.val, 0) AS val,
             sum(COALESCE(v.val, 0)) OVER (ORDER BY COALESCE(v.val, 0) DESC
               ROWS UNBOUNDED PRECEDING) AS cum,
             sum(COALESCE(v.val, 0)) OVER () AS total
      FROM kho_items i
      LEFT JOIN issue_val v ON v.item_id = i.id
      WHERE i.org_id = ${ctx.orgId} AND i.active = true
    ),
    classed AS (
      SELECT id, sku, name, val,
             CASE WHEN total <= 0 THEN 'C'
                  WHEN val <= 0 THEN 'C'
                  WHEN (cum - val) < total * 0.80 THEN 'A'
                  WHEN (cum - val) < total * 0.95 THEN 'B'
                  ELSE 'C' END AS abc,
             CASE WHEN total > 0 THEN round(cum / total * 100, 1) ELSE 0 END AS cum_pct
      FROM ranked
    ),
    updated AS (
      UPDATE kho_items i SET abc_class = c.abc, updated_at = now()
      FROM classed c
      WHERE i.id = c.id AND i.org_id = ${ctx.orgId}
      RETURNING i.id
    )
    SELECT c.sku, c.name, c.val::text AS issue_value, c.cum_pct::text, c.abc
    FROM classed c ORDER BY c.val DESC
  `);
  const rows = ('rows' in res ? (res as unknown as { rows: unknown[] }).rows : res) as Array<Record<string, string>>;

  const counts = { A: 0, B: 0, C: 0 } as Record<string, number>;
  for (const r of rows) counts[r.abc!] = (counts[r.abc!] ?? 0) + 1;

  await ctx.bus.emit('kho.abc.analyzed', {
    org_id: ctx.orgId, lookback_days: lookbackDays,
    class_a: counts.A, class_b: counts.B, class_c: counts.C,
  });

  return {
    lookback_days: lookbackDays,
    summary: counts,
    items: rows.map(r => ({
      sku: r.sku, name: r.name, abc_class: r.abc,
      issue_value_90d: r.issue_value, cumulative_pct: r.cum_pct,
    })),
  };
}

/** Stock aging: tồn hiện tại đã nằm kho bao lâu (theo lần nhập gần nhất mỗi item×loc) */
export async function stockAging(ctx: KhoCtx, limit = 100) {
  const res = await ctx.db.execute<{
    sku: string; name: string; unit: string; location_code: string;
    available: string; last_receive: string | null; days_in_stock: string;
    bucket: string; est_value: string;
  }>(sql`
    WITH last_in AS (
      SELECT m.item_id, m.location_id, max(m.created_at) AS last_receive
      FROM kho_movements m
      WHERE m.org_id = ${ctx.orgId} AND m.delta > 0
      GROUP BY m.item_id, m.location_id
    )
    SELECT i.sku, i.name, i.unit, loc.code AS location_code,
           sum(s.stocked - s.reserved)::text AS available,
           li.last_receive::text,
           COALESCE(extract(day from now() - li.last_receive), 9999)::int::text AS days_in_stock,
           CASE
             WHEN li.last_receive IS NULL THEN '>90'
             WHEN now() - li.last_receive <= interval '30 days' THEN '0-30'
             WHEN now() - li.last_receive <= interval '60 days' THEN '31-60'
             WHEN now() - li.last_receive <= interval '90 days' THEN '61-90'
             ELSE '>90' END AS bucket,
           round(sum(s.stocked) * i.avg_cost, 2)::text AS est_value
    FROM kho_stock_levels s
    JOIN kho_items i ON i.id = s.item_id AND i.org_id = ${ctx.orgId}
    JOIN kho_locations loc ON loc.id = s.location_id AND loc.org_id = ${ctx.orgId}
    LEFT JOIN last_in li ON li.item_id = s.item_id AND li.location_id = s.location_id
    WHERE s.org_id = ${ctx.orgId} AND s.stocked - s.reserved > 0
    GROUP BY i.sku, i.name, i.unit, i.avg_cost, loc.code, li.last_receive
    ORDER BY days_in_stock DESC
    LIMIT ${limit}
  `);
  const rows = ('rows' in res ? (res as unknown as { rows: unknown[] }).rows : res) as Array<Record<string, unknown>>;
  return rows;
}

/**
 * Cycle count suggestion: lớp A kiểm mỗi 30 ngày, B mỗi 60, C mỗi 120.
 * Ưu tiên item quá hạn kiểm lâu nhất (chưa từng kiểm = ưu tiên cao nhất).
 */
export async function cycleCountSuggestion(ctx: KhoCtx, limit = 20) {
  const res = await ctx.db.execute<{
    sku: string; name: string; abc_class: string; last_counted: string | null;
    days_since: string; due_every: string; overdue_days: string;
  }>(sql`
    WITH last_count AS (
      SELECT sl.item_id, max(st.created_at) AS last_counted
      FROM kho_stocktake_lines sl
      JOIN kho_stocktakes st ON st.id = sl.stocktake_id AND st.org_id = ${ctx.orgId}
      WHERE sl.org_id = ${ctx.orgId} AND st.status = 'finalized'
      GROUP BY sl.item_id
    )
    SELECT i.sku, i.name, COALESCE(i.abc_class, 'C') AS abc_class,
           lc.last_counted::text,
           COALESCE(extract(day from now() - lc.last_counted), 99999)::int::text AS days_since,
           CASE COALESCE(i.abc_class, 'C')
             WHEN 'A' THEN 30 WHEN 'B' THEN 60 ELSE 120 END::text AS due_every,
           (COALESCE(extract(day from now() - lc.last_counted), 99999)::int
             - CASE COALESCE(i.abc_class, 'C')
                 WHEN 'A' THEN 30 WHEN 'B' THEN 60 ELSE 120 END)::text AS overdue_days
    FROM kho_items i
    LEFT JOIN last_count lc ON lc.item_id = i.id
    WHERE i.org_id = ${ctx.orgId} AND i.active = true
      AND (COALESCE(extract(day from now() - lc.last_counted), 99999)::int
        >= CASE COALESCE(i.abc_class, 'C')
             WHEN 'A' THEN 30 WHEN 'B' THEN 60 ELSE 120 END)
    ORDER BY (COALESCE(extract(day from now() - lc.last_counted), 99999)::int
             - CASE COALESCE(i.abc_class, 'C')
                 WHEN 'A' THEN 30 WHEN 'B' THEN 60 ELSE 120 END) DESC
    LIMIT ${limit}
  `);
  const rows = ('rows' in res ? (res as unknown as { rows: unknown[] }).rows : res) as Array<Record<string, unknown>>;
  return rows;
}
