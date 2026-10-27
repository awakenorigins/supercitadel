/**
 * SOUL-RESTAURANT — console.service (v1.2)
 * Tổng quan vận hành thời gian thực cho bảng điều khiển + cho Tiểu Tâm
 * ("tình hình quán thế nào"). Chỉ đọc, tổng hợp từ các service sẵn có.
 */
import { and, count, desc, eq } from 'drizzle-orm';
import type { RestoCtx } from '../types.js';
import { restoCustomers } from '../db/schema.js';
import { openOrders } from './order.service.js';
import { kdsQueue } from './kitchen.service.js';
import { salesSummary } from './report.service.js';
import { listPromos } from './promotion.service.js';
import { fmtVnd } from '../lib/money.js';

export async function dashboard(ctx: RestoCtx): Promise<{
  open_orders: { total: number; orders: unknown[] };
  kitchen: { pending_kots: number; oldest_minutes: number; by_station: Array<{ station: string; count: number }> };
  today: { revenue: string; revenue_fmt: string; bills: number; orders: number; avg_per_order: string };
  promotions: { active: number };
  customers: { total: number; top: Array<{ name: string; points: string }> };
  generated_at: string;
}> {
  const [orders, kds, sales, promos, custCount, topCust] = await Promise.all([
    openOrders(ctx, {}),
    kdsQueue(ctx, { status: 'active', limit: 200 }),
    salesSummary(ctx, {}),
    listPromos(ctx, { active_only: true }),
    ctx.db.select({ n: count() }).from(restoCustomers).where(eq(restoCustomers.orgId, ctx.orgId)),
    ctx.db.select().from(restoCustomers).where(eq(restoCustomers.orgId, ctx.orgId))
      .orderBy(desc(restoCustomers.pointsBalance)).limit(5),
  ]);

  const byStation = new Map<string, number>();
  let oldest = 0;
  for (const k of kds.kots as Array<{ station: string; age_minutes: number }>) {
    byStation.set(k.station, (byStation.get(k.station) ?? 0) + 1);
    if (k.age_minutes > oldest) oldest = k.age_minutes;
  }

  return {
    open_orders: { total: orders.total, orders: orders.orders },
    kitchen: {
      pending_kots: kds.total, oldest_minutes: oldest,
      by_station: [...byStation.entries()].map(([station, c]) => ({ station, count: c })),
    },
    today: {
      revenue: sales.revenue, revenue_fmt: fmtVnd(sales.revenue),
      bills: sales.bills, orders: sales.orders, avg_per_order: sales.avg_per_order,
    },
    promotions: { active: promos.total },
    customers: {
      total: Number(custCount[0]?.n ?? 0),
      top: topCust.map((c) => ({ name: c.name, points: c.pointsBalance })),
    },
    generated_at: new Date().toISOString(),
  };
}
