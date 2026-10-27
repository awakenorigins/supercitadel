/**
 * SOUL-INVENTORY v2.1 — automation.service
 * Automation Layer NHẸ, an toàn: chỉ tính toán + đề xuất, KHÔNG tự tạo PO,
 * KHÔNG spawn cron (host gọi runScheduledTasks định kỳ).
 *
 * Công thức (thống kê cổ điển, không ML):
 *   avg_daily     = total_issued / window_days
 *   stddev_daily  = độ lệch chuẩn nhu cầu theo ngày
 *   cv            = stddev_daily / avg_daily            (trục XYZ)
 *   safety_stock  = z(service_level) × stddev_daily × sqrt(lead_time)
 *   reorder_point = avg_daily × lead_time + safety_stock
 *   EOQ           = sqrt(2 × annual_demand × order_cost / (avg_cost × holding_pct))
 *   forecast MA   = trung bình nhu cầu N ngày gần nhất × horizon
 *   forecast SES  = san mũ: Fₜ = α·Dₜ₋₁ + (1−α)·Fₜ₋₁
 *
 * Mọi phép tính nặng đẩy phía SQL để giữ numeric chính xác.
 */
import { and, eq, sql } from 'drizzle-orm';
import {
  khoAutomationRuns, khoDemandStats, khoForecasts,
  khoItems, khoReplenishParams,
} from '../db/schema.js';
import type { KhoCtx } from '../types.js';
import { KhoError } from '../types.js';
import { getItemBySku, resolveLocation } from './catalog.service.js';

/** Bảng tra z-score theo service level (one-tailed) — giá trị chuẩn thống kê */
function zScore(serviceLevel: number): number {
  // các mốc phổ biến; nội suy tuyến tính giữa các mốc cho giá trị lạ
  const table: Array<[number, number]> = [
    [0.50, 0.00], [0.80, 0.84], [0.85, 1.04], [0.90, 1.28],
    [0.95, 1.645], [0.97, 1.88], [0.98, 2.05], [0.99, 2.33], [0.999, 3.09],
  ];
  if (serviceLevel <= table[0]![0]) return table[0]![1];
  if (serviceLevel >= table[table.length - 1]![0]) return table[table.length - 1]![1];
  for (let i = 0; i < table.length - 1; i++) {
    const [s1, z1] = table[i]!;
    const [s2, z2] = table[i + 1]!;
    if (serviceLevel >= s1 && serviceLevel <= s2) {
      return z1 + (z2 - z1) * (serviceLevel - s1) / (s2 - s1);
    }
  }
  return 1.645;
}

/**
 * 1) TÁI TÍNH DEMAND STATS cho toàn org (hoặc một item).
 * Quét kho_movements xuất trong window_days, tính theo NGÀY để ra
 * avg/stddev/cv. Upsert vào kho_demand_stats.
 */
export async function computeDemandStats(ctx: KhoCtx, windowDays = 90): Promise<number> {
  const res = await ctx.db.execute<{ n: string }>(sql`
    WITH daily AS (
      SELECT m.item_id, date_trunc('day', m.created_at) AS d,
             sum(abs(m.delta)) AS qty
      FROM kho_movements m
      WHERE m.org_id = ${ctx.orgId}
        AND m.type IN ('issue', 'reserve_fulfill', 'assembly_out')
        AND m.created_at >= now() - (${windowDays}::int || ' days')::interval
      GROUP BY m.item_id, date_trunc('day', m.created_at)
    ),
    agg AS (
      SELECT item_id,
             sum(qty) AS total_issued,
             count(*) AS active_days,
             -- avg theo TOÀN cửa sổ (gồm ngày = 0): tổng / số ngày cửa sổ
             sum(qty) / ${windowDays}::numeric AS avg_daily,
             -- stddev mẫu theo ngày có phát sinh (population trên active days)
             COALESCE(stddev_samp(qty), 0) AS stddev_active
      FROM daily GROUP BY item_id
    ),
    upserted AS (
      INSERT INTO kho_demand_stats
        (org_id, item_id, window_days, avg_daily, stddev_daily, cv, total_issued, active_days, computed_at)
      SELECT ${ctx.orgId}, a.item_id, ${windowDays},
             round(a.avg_daily, 4),
             round(a.stddev_active, 4),
             CASE WHEN a.avg_daily > 0 THEN round(a.stddev_active / a.avg_daily, 4) ELSE 0 END,
             round(a.total_issued, 3), a.active_days, now()
      FROM agg a
      ON CONFLICT (org_id, item_id) DO UPDATE SET
        window_days = EXCLUDED.window_days,
        avg_daily = EXCLUDED.avg_daily,
        stddev_daily = EXCLUDED.stddev_daily,
        cv = EXCLUDED.cv,
        total_issued = EXCLUDED.total_issued,
        active_days = EXCLUDED.active_days,
        computed_at = now()
      RETURNING 1
    )
    SELECT count(*)::text AS n FROM upserted
  `);
  const rows = ('rows' in res ? (res as unknown as { rows: Array<{ n: string }> }).rows : res) as Array<{ n: string }>;
  return Number.parseInt(rows[0]?.n ?? '0', 10);
}

/**
 * 2) FORECAST nhu cầu kỳ tới. MA = avg_daily×horizon (từ demand_stats).
 * SES = san mũ trên chuỗi ngày; α mặc định 0.3. Cả hai upsert kho_forecasts.
 * Trả số item đã dự báo.
 */
export async function computeForecasts(
  ctx: KhoCtx, method: 'moving_avg' | 'ses' = 'moving_avg',
  horizonDays = 30, alpha = 0.3,
): Promise<number> {
  if (method === 'moving_avg') {
    const res = await ctx.db.execute<{ n: string }>(sql`
      WITH up AS (
        INSERT INTO kho_forecasts (org_id, item_id, method, horizon_days, forecast_qty, daily_rate, computed_at)
        SELECT ${ctx.orgId}, ds.item_id, 'moving_avg', ${horizonDays},
               round(ds.avg_daily * ${horizonDays}::numeric, 3),
               ds.avg_daily, now()
        FROM kho_demand_stats ds
        WHERE ds.org_id = ${ctx.orgId}
        ON CONFLICT (org_id, item_id) DO UPDATE SET
          method = 'moving_avg', horizon_days = EXCLUDED.horizon_days,
          forecast_qty = EXCLUDED.forecast_qty, daily_rate = EXCLUDED.daily_rate,
          computed_at = now()
        RETURNING 1
      ) SELECT count(*)::text AS n FROM up
    `);
    const rows = ('rows' in res ? (res as unknown as { rows: Array<{ n: string }> }).rows : res) as Array<{ n: string }>;
    return Number.parseInt(rows[0]?.n ?? '0', 10);
  }

  // SES: san mũ trên chuỗi daily demand — làm phía SQL với recursive
  // LƯU Ý: Postgres bắt buộc WITH RECURSIVE khi có CTE tự tham chiếu (ses)
  const res = await ctx.db.execute<{ n: string }>(sql`
    WITH RECURSIVE daily AS (
      SELECT m.item_id, date_trunc('day', m.created_at)::date AS d, sum(abs(m.delta)) AS qty
      FROM kho_movements m
      WHERE m.org_id = ${ctx.orgId}
        AND m.type IN ('issue', 'reserve_fulfill', 'assembly_out')
        AND m.created_at >= now() - interval '90 days'
      GROUP BY m.item_id, date_trunc('day', m.created_at)::date
    ),
    ordered AS (
      SELECT item_id, d, qty,
             row_number() OVER (PARTITION BY item_id ORDER BY d) AS rn
      FROM daily
    ),
    -- SES đệ quy: F(1)=D(1); F(t)=α·D(t-1)+(1-α)·F(t-1)
    ses AS (
      SELECT item_id, rn, qty, qty::numeric AS level
      FROM ordered WHERE rn = 1
      UNION ALL
      SELECT o.item_id, o.rn, o.qty,
             round(${alpha}::numeric * o.qty + (1 - ${alpha}::numeric) * s.level, 4)
      FROM ordered o JOIN ses s ON s.item_id = o.item_id AND o.rn = s.rn + 1
    ),
    final_level AS (
      SELECT DISTINCT ON (item_id) item_id, level
      FROM ses ORDER BY item_id, rn DESC
    ),
    up AS (
      INSERT INTO kho_forecasts (org_id, item_id, method, horizon_days, forecast_qty, daily_rate, computed_at)
      SELECT ${ctx.orgId}, f.item_id, 'ses', ${horizonDays},
             round(f.level * ${horizonDays}::numeric, 3), round(f.level, 4), now()
      FROM final_level f
      ON CONFLICT (org_id, item_id) DO UPDATE SET
        method = 'ses', horizon_days = EXCLUDED.horizon_days,
        forecast_qty = EXCLUDED.forecast_qty, daily_rate = EXCLUDED.daily_rate, computed_at = now()
      RETURNING 1
    ) SELECT count(*)::text AS n FROM up
  `);
  const rows = ('rows' in res ? (res as unknown as { rows: Array<{ n: string }> }).rows : res) as Array<{ n: string }>;
  return Number.parseInt(rows[0]?.n ?? '0', 10);
}

/**
 * 3) THIẾT LẬP THAM SỐ BỔ HÀNG cho một item (service level, lead time, chi phí).
 * Tính ngay safety_stock / reorder_point / EOQ từ demand_stats hiện có.
 */
export async function setReplenishParams(ctx: KhoCtx, input: {
  sku: string; location_code?: string;
  service_level?: string; lead_time_days?: number;
  order_cost?: string; holding_cost_pct?: string;
}) {
  const item = await getItemBySku(ctx, input.sku);
  const loc = input.location_code ? await resolveLocation(ctx, input.location_code) : null;
  const serviceLevel = input.service_level ? Number.parseFloat(input.service_level) : 0.95;
  const leadTime = input.lead_time_days ?? 7;
  const z = zScore(serviceLevel);

  // Lấy demand stats; nếu chưa có → tính riêng item bằng cách chạy toàn org (rẻ với SME)
  let [ds] = await ctx.db.select().from(khoDemandStats).where(and(
    eq(khoDemandStats.orgId, ctx.orgId), eq(khoDemandStats.itemId, item.id),
  )).limit(1);
  if (!ds) {
    await computeDemandStats(ctx);
    [ds] = await ctx.db.select().from(khoDemandStats).where(and(
      eq(khoDemandStats.orgId, ctx.orgId), eq(khoDemandStats.itemId, item.id),
    )).limit(1);
  }
  const avgDaily = ds ? Number.parseFloat(ds.avgDaily) : 0;
  const stddevDaily = ds ? Number.parseFloat(ds.stddevDaily) : 0;

  // Tính phía SQL để tròn số chuẩn
  const calc = await ctx.db.execute<{ ss: string; rop: string; eoq: string }>(sql`
    SELECT
      round(${z}::numeric * ${stddevDaily}::numeric * sqrt(${leadTime}::numeric), 3) AS ss,
      round(${avgDaily}::numeric * ${leadTime}::numeric
        + ${z}::numeric * ${stddevDaily}::numeric * sqrt(${leadTime}::numeric), 3) AS rop,
      CASE WHEN ${item.avgCost}::numeric > 0 AND ${input.holding_cost_pct ?? '0.20'}::numeric > 0
             AND ${input.order_cost ?? '0'}::numeric > 0 AND ${avgDaily}::numeric > 0
        THEN round(sqrt(
          2 * (${avgDaily}::numeric * 365) * ${input.order_cost ?? '0'}::numeric
          / (${item.avgCost}::numeric * ${input.holding_cost_pct ?? '0.20'}::numeric)), 3)
        ELSE 0 END AS eoq
  `);
  const cRows = ('rows' in calc ? (calc as unknown as { rows: Array<{ ss: string; rop: string; eoq: string }> }).rows : calc) as Array<{ ss: string; rop: string; eoq: string }>;
  const { ss, rop, eoq } = cRows[0]!;

  // Upsert (delete+insert theo partial key location NULL)
  await ctx.db.delete(khoReplenishParams).where(and(
    eq(khoReplenishParams.orgId, ctx.orgId),
    eq(khoReplenishParams.itemId, item.id),
    loc ? eq(khoReplenishParams.locationId, loc.id) : sql`${khoReplenishParams.locationId} IS NULL`,
  ));
  const [row] = await ctx.db.insert(khoReplenishParams).values({
    orgId: ctx.orgId, itemId: item.id, locationId: loc?.id ?? null,
    serviceLevel: String(serviceLevel), leadTimeDays: leadTime,
    orderCost: input.order_cost ?? '0', holdingCostPct: input.holding_cost_pct ?? '0.20',
    safetyStock: ss, reorderPoint: rop, eoq,
    computedAt: sql`now()`,
  }).returning();

  await ctx.bus.emit('kho.replenish.params_set', {
    org_id: ctx.orgId, item_id: item.id, sku: item.sku,
    reorder_point: rop, safety_stock: ss, eoq,
  });

  return {
    sku: item.sku, name: item.name, location: loc?.code ?? '(toàn bộ)',
    service_level: serviceLevel, lead_time_days: leadTime,
    avg_daily_demand: String(avgDaily), stddev_daily: String(stddevDaily),
    safety_stock: row.safetyStock, reorder_point: row.reorderPoint,
    eoq: row.eoq,
    note: Number.parseFloat(eoq) === 0
      ? 'EOQ chưa tính được — cần order_cost, holding_cost_pct và giá vốn > 0'
      : undefined,
  };
}

/**
 * 4) GỢI Ý BỔ HÀNG THÔNG MINH (dùng reorder_point động thay min cố định).
 * available + incoming <= reorder_point → cần đặt. Số đặt = max(EOQ, thiếu hụt
 * để về reorder_point + safety). CHỈ đề xuất, KHÔNG tạo PO.
 */
export async function smartReplenishSuggestions(ctx: KhoCtx, limit = 100) {
  const res = await ctx.db.execute<{
    sku: string; name: string; unit: string; location_code: string | null;
    available: string; incoming: string; reorder_point: string;
    safety_stock: string; eoq: string; suggest: string;
    avg_daily: string; lead_time_days: number; days_cover: string;
  }>(sql`
    WITH avail AS (
      SELECT p.id AS pid,
             COALESCE(sum(s.stocked - s.reserved), 0) AS available,
             COALESCE(sum(s.incoming), 0) AS incoming
      FROM kho_replenish_params p
      LEFT JOIN kho_stock_levels s
        ON s.org_id = p.org_id AND s.item_id = p.item_id
        AND (p.location_id IS NULL OR s.location_id = p.location_id)
      WHERE p.org_id = ${ctx.orgId}
      GROUP BY p.id
    )
    SELECT i.sku, i.name, i.unit, l.code AS location_code,
           a.available::text, a.incoming::text,
           p.reorder_point::text, p.safety_stock::text, p.eoq::text,
           greatest(
             CASE WHEN p.eoq > 0 THEN p.eoq
                  ELSE p.reorder_point + p.safety_stock - a.available - a.incoming END,
             p.reorder_point + p.safety_stock - a.available - a.incoming, 0
           )::text AS suggest,
           COALESCE(ds.avg_daily, 0)::text AS avg_daily,
           p.lead_time_days,
           CASE WHEN COALESCE(ds.avg_daily,0) > 0
             THEN round(a.available / ds.avg_daily, 1) ELSE 9999 END::text AS days_cover
    FROM kho_replenish_params p
    JOIN avail a ON a.pid = p.id
    JOIN kho_items i ON i.id = p.item_id AND i.org_id = ${ctx.orgId}
    LEFT JOIN kho_locations l ON l.id = p.location_id AND l.org_id = ${ctx.orgId}
    LEFT JOIN kho_demand_stats ds ON ds.org_id = p.org_id AND ds.item_id = p.item_id
    WHERE p.org_id = ${ctx.orgId}
      AND a.available + a.incoming <= p.reorder_point
    ORDER BY (p.reorder_point - a.available - a.incoming) DESC
    LIMIT ${limit}
  `);
  const rows = ('rows' in res ? (res as unknown as { rows: unknown[] }).rows : res) as Array<Record<string, unknown>>;
  return rows.map(r => ({
    sku: r.sku, name: r.name, unit: r.unit,
    location: r.location_code ?? '(toàn bộ)',
    available: r.available, incoming: r.incoming,
    reorder_point: r.reorder_point, safety_stock: r.safety_stock,
    suggest_order: r.suggest, order_basis: Number.parseFloat(String(r.eoq)) > 0 ? 'EOQ' : 'về điểm đặt',
    avg_daily_demand: r.avg_daily, lead_time_days: r.lead_time_days,
    days_of_cover: r.days_cover,
  }));
}

/**
 * 5) PROJECTED INVENTORY: chiếu tồn tương lai theo forecast (outgoing) +
 * incoming hiện có, phát hiện NGÀY dự kiến âm kho (stockout date).
 * Đơn giản hóa: giả định incoming về đều trong lead_time, outgoing theo daily_rate.
 */
export async function projectedInventory(ctx: KhoCtx, horizonDays = 30, limit = 100) {
  const res = await ctx.db.execute<{
    sku: string; name: string; unit: string; available: string;
    incoming: string; daily_rate: string; reorder_point: string;
    days_to_stockout: string; projected_end: string; risk: string;
  }>(sql`
    SELECT i.sku, i.name, i.unit,
           COALESCE(sum(s.stocked - s.reserved), 0)::text AS available,
           COALESCE(sum(s.incoming), 0)::text AS incoming,
           COALESCE(f.daily_rate, ds.avg_daily, 0)::text AS daily_rate,
           COALESCE(p.reorder_point, 0)::text AS reorder_point,
           CASE WHEN COALESCE(f.daily_rate, ds.avg_daily, 0) > 0
             THEN floor(COALESCE(sum(s.stocked - s.reserved),0) / COALESCE(f.daily_rate, ds.avg_daily))::text
             ELSE '9999' END AS days_to_stockout,
           round(COALESCE(sum(s.stocked - s.reserved),0) + COALESCE(sum(s.incoming),0)
             - COALESCE(f.daily_rate, ds.avg_daily, 0) * ${horizonDays}::numeric, 3)::text AS projected_end,
           CASE
             WHEN COALESCE(f.daily_rate, ds.avg_daily, 0) <= 0 THEN 'none'
             WHEN COALESCE(sum(s.stocked - s.reserved),0) / COALESCE(f.daily_rate, ds.avg_daily)
                  <= COALESCE(p.lead_time_days, 7) THEN 'high'
             WHEN COALESCE(sum(s.stocked - s.reserved),0) / COALESCE(f.daily_rate, ds.avg_daily)
                  <= ${horizonDays} THEN 'medium'
             ELSE 'low' END AS risk
    FROM kho_items i
    LEFT JOIN kho_stock_levels s ON s.org_id = i.org_id AND s.item_id = i.id
    LEFT JOIN kho_forecasts f ON f.org_id = i.org_id AND f.item_id = i.id
    LEFT JOIN kho_demand_stats ds ON ds.org_id = i.org_id AND ds.item_id = i.id
    LEFT JOIN kho_replenish_params p ON p.org_id = i.org_id AND p.item_id = i.id
    WHERE i.org_id = ${ctx.orgId} AND i.active = true
    GROUP BY i.sku, i.name, i.unit, f.daily_rate, ds.avg_daily, p.reorder_point, p.lead_time_days
    HAVING COALESCE(f.daily_rate, ds.avg_daily, 0) > 0
    ORDER BY CASE WHEN COALESCE(f.daily_rate, ds.avg_daily, 0) > 0
      THEN floor(COALESCE(sum(s.stocked - s.reserved),0) / COALESCE(f.daily_rate, ds.avg_daily))
      ELSE 9999 END ASC
    LIMIT ${limit}
  `);
  const rows = ('rows' in res ? (res as unknown as { rows: unknown[] }).rows : res) as Array<Record<string, unknown>>;
  return rows;
}

/**
 * 6) ABC-XYZ: kết hợp ABC (giá trị, đã có abc_class) với XYZ (biến động cv).
 * X = ổn định (cv ≤ 0.5), Y = dao động vừa (0.5 < cv ≤ 1), Z = thất thường (cv > 1).
 * Ghi xyz_class vào item. Cần demand_stats đã tính.
 */
export async function runXyzAnalysis(ctx: KhoCtx) {
  const res = await ctx.db.execute<{
    sku: string; name: string; abc: string; xyz: string; cv: string;
  }>(sql`
    WITH classed AS (
      SELECT i.id, i.sku, i.name, COALESCE(i.abc_class, 'C') AS abc,
             CASE WHEN COALESCE(ds.cv, 999) <= 0.5 THEN 'X'
                  WHEN COALESCE(ds.cv, 999) <= 1.0 THEN 'Y'
                  ELSE 'Z' END AS xyz,
             COALESCE(ds.cv, 0) AS cv
      FROM kho_items i
      LEFT JOIN kho_demand_stats ds ON ds.org_id = i.org_id AND ds.item_id = i.id
      WHERE i.org_id = ${ctx.orgId} AND i.active = true
    ),
    upd AS (
      UPDATE kho_items i SET xyz_class = c.xyz, updated_at = now()
      FROM classed c WHERE i.id = c.id AND i.org_id = ${ctx.orgId}
      RETURNING 1
    )
    SELECT c.sku, c.name, c.abc, c.xyz, c.cv::text FROM classed c
    ORDER BY c.abc, c.xyz
  `);
  const rows = ('rows' in res ? (res as unknown as { rows: unknown[] }).rows : res) as Array<Record<string, string>>;

  // Ma trận 9 ô: đếm số item mỗi tổ hợp
  const matrix: Record<string, number> = {};
  for (const r of rows) {
    const key = `${r.abc}${r.xyz}`;
    matrix[key] = (matrix[key] ?? 0) + 1;
  }
  return {
    matrix,
    items: rows.map(r => ({
      sku: r.sku, name: r.name,
      abc_class: r.abc, xyz_class: r.xyz, cv: r.cv,
      strategy: strategyFor(`${r.abc}${r.xyz}`),
    })),
  };
}

/** Gợi ý chiến lược quản lý theo ô ABC-XYZ */
function strategyFor(cell: string): string {
  const map: Record<string, string> = {
    AX: 'Giá trị cao + ổn định → tồn an toàn thấp, đặt đều, tự động hóa mạnh',
    AY: 'Giá trị cao + dao động → theo dõi sát, safety stock vừa',
    AZ: 'Giá trị cao + thất thường → xem xét đặt theo đơn (MTO), tránh tồn nhiều',
    BX: 'Giá trị vừa + ổn định → auto-reorder tiêu chuẩn',
    BY: 'Giá trị vừa + dao động → min-max thông thường',
    BZ: 'Giá trị vừa + thất thường → tồn thấp, mua khi cần',
    CX: 'Giá trị thấp + ổn định → đặt lô lớn thưa, ít tốn công',
    CY: 'Giá trị thấp + dao động → gộp đơn định kỳ',
    CZ: 'Giá trị thấp + thất thường → cân nhắc bỏ SKU hoặc mua lẻ',
  };
  return map[cell] ?? 'Chưa phân loại';
}

/**
 * 7) DEAD STOCK DETECTION: hàng còn tồn nhưng không xuất trong N ngày.
 * Đề xuất markdown/thanh lý. CHỈ phát hiện, KHÔNG tự hành động.
 */
export async function deadStockDetection(ctx: KhoCtx, idleDays = 90, limit = 100) {
  const res = await ctx.db.execute<{
    sku: string; name: string; unit: string; available: string;
    last_issue: string | null; idle_days: string; tied_value: string;
  }>(sql`
    WITH last_issue AS (
      SELECT m.item_id, max(m.created_at) AS last_issue
      FROM kho_movements m
      WHERE m.org_id = ${ctx.orgId} AND m.type IN ('issue','reserve_fulfill','assembly_out')
      GROUP BY m.item_id
    )
    SELECT i.sku, i.name, i.unit,
           COALESCE(sum(s.stocked - s.reserved), 0)::text AS available,
           li.last_issue::text,
           COALESCE(extract(day from now() - li.last_issue), 99999)::int::text AS idle_days,
           round(COALESCE(sum(s.stocked), 0) * i.avg_cost, 2)::text AS tied_value
    FROM kho_items i
    JOIN kho_stock_levels s ON s.org_id = i.org_id AND s.item_id = i.id
    LEFT JOIN last_issue li ON li.item_id = i.id
    WHERE i.org_id = ${ctx.orgId} AND i.active = true
    GROUP BY i.sku, i.name, i.unit, i.avg_cost, li.last_issue
    HAVING COALESCE(sum(s.stocked - s.reserved), 0) > 0
      AND COALESCE(extract(day from now() - li.last_issue), 99999) >= ${idleDays}
    ORDER BY round(COALESCE(sum(s.stocked), 0) * i.avg_cost, 2) DESC
    LIMIT ${limit}
  `);
  const rows = ('rows' in res ? (res as unknown as { rows: unknown[] }).rows : res) as Array<Record<string, unknown>>;
  return rows.map(r => ({
    sku: r.sku, name: r.name, unit: r.unit,
    available: r.available,
    last_issue: r.last_issue ?? 'chưa từng xuất',
    idle_days: r.idle_days,
    tied_value: r.tied_value,
    suggestion: 'Cân nhắc giảm giá/thanh lý để giải phóng vốn đọng',
  }));
}

/**
 * 8) ORCHESTRATOR — host gọi định kỳ (cron của host, KHÔNG phải của module).
 * Chạy tuần tự: demand stats → forecast → cập nhật replenish → ghi log.
 * Trả tóm tắt để host/Tiểu Tâm biết đã chạy gì (chống "im lặng").
 */
export async function runScheduledTasks(ctx: KhoCtx, opts?: {
  windowDays?: number; forecastMethod?: 'moving_avg' | 'ses'; horizonDays?: number;
}): Promise<{
  demand_stats_items: number; forecast_items: number;
  replenish_alerts: number; dead_stock_alerts: number; ran_at: string;
}> {
  const windowDays = opts?.windowDays ?? 90;
  const method = opts?.forecastMethod ?? 'moving_avg';
  const horizonDays = opts?.horizonDays ?? 30;

  const dsCount = await computeDemandStats(ctx, windowDays);
  const fcCount = await computeForecasts(ctx, method, horizonDays);

  // Cập nhật lại safety/reorder/eoq cho các item ĐÃ có params (demand đổi → param đổi)
  // z-score nội suy tuyến tính giữa các mốc chuẩn (0.90→1.28, 0.95→1.645, 0.99→2.33)
  // — không match text numeric (mong manh); sqrt(int) trả double nên PHẢI ::numeric trước round
  await ctx.db.execute(sql`
    UPDATE kho_replenish_params p SET
      safety_stock = round(
        (CASE
          WHEN p.service_level <= 0.90 THEN 1.28
          WHEN p.service_level <= 0.95 THEN 1.28 + (1.645 - 1.28) * (p.service_level - 0.90) / 0.05
          WHEN p.service_level <= 0.99 THEN 1.645 + (2.33 - 1.645) * (p.service_level - 0.95) / 0.04
          ELSE 2.33
        END)::numeric
        * ds.stddev_daily * sqrt(p.lead_time_days::numeric), 3),
      reorder_point = round(
        ds.avg_daily * p.lead_time_days +
        (CASE
          WHEN p.service_level <= 0.90 THEN 1.28
          WHEN p.service_level <= 0.95 THEN 1.28 + (1.645 - 1.28) * (p.service_level - 0.90) / 0.05
          WHEN p.service_level <= 0.99 THEN 1.645 + (2.33 - 1.645) * (p.service_level - 0.95) / 0.04
          ELSE 2.33
        END)::numeric
        * ds.stddev_daily * sqrt(p.lead_time_days::numeric), 3),
      computed_at = now(), updated_at = now()
    FROM kho_demand_stats ds
    WHERE p.org_id = ${ctx.orgId} AND ds.org_id = ${ctx.orgId} AND ds.item_id = p.item_id
  `);

  const replenish = await smartReplenishSuggestions(ctx, 500);
  const dead = await deadStockDetection(ctx, 90, 500);

  const findings = {
    demand_stats_items: dsCount, forecast_items: fcCount,
    replenish_alerts: replenish.length, dead_stock_alerts: dead.length,
  };
  await ctx.db.insert(khoAutomationRuns).values({
    orgId: ctx.orgId, task: 'all',
    itemsTouched: dsCount, findings,
  });
  await ctx.bus.emit('kho.automation.ran', { org_id: ctx.orgId, ...findings });

  return { ...findings, ran_at: new Date().toISOString() };
}
