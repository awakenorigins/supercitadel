/**
 * SOUL-RESTAURANT — report.service
 * Doanh thu tính theo BILL ĐÃ THANH TOÁN (paid_at trong khoảng) — chuẩn thu ngân.
 * By-method lấy từ payments (số áp vào, không dính tiền thối).
 * Top món lấy từ bill_items × order_items của các bill paid.
 */
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import type { RestoCtx } from '../types.js';
import { RestoError } from '../types.js';
import { restoBills, restoBillItems, restoOrderItems, restoOrders, restoPayments } from '../db/schema.js';
import { d2, d3, f2, f3, fmtVnd, fmtQty, roundDivNonNeg } from '../lib/money.js';

function parseRange(from?: string, to?: string): { start: Date; end: Date; fromStr: string; toStr: string } {
  const today = new Date().toISOString().slice(0, 10);
  const fromStr = from ?? today;
  const toStr = to ?? fromStr;
  const start = new Date(`${fromStr}T00:00:00`);
  const endDay = new Date(`${toStr}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(endDay.getTime())) {
    throw new RestoError('INVALID_INPUT', 'Khoảng ngày không hợp lệ (YYYY-MM-DD)');
  }
  if (endDay < start) throw new RestoError('INVALID_INPUT', '"to" phải ≥ "from"');
  const end = new Date(endDay.getTime() + 86400000);
  return { start, end, fromStr, toStr };
}

/** Tổng quan doanh thu: tổng, số bill/đơn, trung bình đơn, theo phương thức, theo loại đơn. */
export async function salesSummary(ctx: RestoCtx, input: { from?: string; to?: string }): Promise<{
  from: string; to: string;
  revenue: string; revenue_fmt: string;
  bills: number; orders: number;
  avg_per_order: string; avg_per_order_fmt: string;
  discount_total: string; service_charge_total: string; tax_total: string;
  by_method: Array<{ method: string; amount: string; amount_fmt: string; count: number }>;
  by_type: Array<{ type: string; amount: string; amount_fmt: string; orders: number }>;
}> {
  const { start, end, fromStr, toStr } = parseRange(input.from, input.to);

  const bills = await ctx.db.select().from(restoBills)
    .where(and(eq(restoBills.orgId, ctx.orgId), eq(restoBills.status, 'paid'),
      gte(restoBills.paidAt, start), lt(restoBills.paidAt, end)));

  let revenue = 0n; let disc = 0n; let svc = 0n; let tax = 0n;
  const orderIds = new Set<string>();
  for (const b of bills) {
    revenue += d2(b.grandTotal);
    disc += d2(b.discountTotal);
    svc += d2(b.serviceCharge);
    tax += d2(b.taxTotal);
    orderIds.add(b.orderId);
  }
  const nOrders = orderIds.size;
  const avg = nOrders > 0 ? roundDivNonNeg(revenue, BigInt(nOrders)) : 0n;

  // Theo phương thức (payments của các bill paid trong khoảng)
  const billIds = bills.map((b) => b.id);
  const pays = billIds.length
    ? await ctx.db.select().from(restoPayments)
        .where(and(eq(restoPayments.orgId, ctx.orgId), inArray(restoPayments.billId, billIds)))
    : [];
  const byMethod = new Map<string, { amount: bigint; count: number }>();
  for (const p of pays) {
    const cur = byMethod.get(p.method) ?? { amount: 0n, count: 0 };
    cur.amount += d2(p.amount);
    cur.count += 1;
    byMethod.set(p.method, cur);
  }

  // Theo loại đơn
  const orders = orderIds.size
    ? await ctx.db.select().from(restoOrders)
        .where(and(eq(restoOrders.orgId, ctx.orgId), inArray(restoOrders.id, [...orderIds])))
    : [];
  const typeByOrder = new Map(orders.map((o) => [o.id, o.type]));
  const byType = new Map<string, { amount: bigint; orders: Set<string> }>();
  for (const b of bills) {
    const t = typeByOrder.get(b.orderId) ?? 'dine_in';
    const cur = byType.get(t) ?? { amount: 0n, orders: new Set<string>() };
    cur.amount += d2(b.grandTotal);
    cur.orders.add(b.orderId);
    byType.set(t, cur);
  }

  return {
    from: fromStr, to: toStr,
    revenue: f2(revenue), revenue_fmt: fmtVnd(revenue),
    bills: bills.length, orders: nOrders,
    avg_per_order: f2(avg), avg_per_order_fmt: fmtVnd(avg),
    discount_total: f2(disc), service_charge_total: f2(svc), tax_total: f2(tax),
    by_method: [...byMethod.entries()]
      .sort((a, b) => (b[1].amount > a[1].amount ? 1 : -1))
      .map(([method, v]) => ({ method, amount: f2(v.amount), amount_fmt: fmtVnd(v.amount), count: v.count })),
    by_type: [...byType.entries()]
      .map(([type, v]) => ({ type, amount: f2(v.amount), amount_fmt: fmtVnd(v.amount), orders: v.orders.size })),
  };
}

/** Món bán chạy (theo doanh thu đã thanh toán). */
export async function topItems(ctx: RestoCtx, input: { from?: string; to?: string; limit: number }): Promise<{
  from: string; to: string;
  items: Array<{ name: string; qty: string; amount: string; amount_fmt: string }>;
}> {
  const { start, end, fromStr, toStr } = parseRange(input.from, input.to);

  const bills = await ctx.db.select({ id: restoBills.id }).from(restoBills)
    .where(and(eq(restoBills.orgId, ctx.orgId), eq(restoBills.status, 'paid'),
      gte(restoBills.paidAt, start), lt(restoBills.paidAt, end)));
  if (!bills.length) return { from: fromStr, to: toStr, items: [] };

  const rows = await ctx.db
    .select({
      name: restoOrderItems.name,
      qty: restoOrderItems.qty,
      amount: restoBillItems.amount,
    })
    .from(restoBillItems)
    .innerJoin(restoOrderItems, and(
      eq(restoOrderItems.orgId, ctx.orgId),
      eq(restoOrderItems.id, restoBillItems.orderItemId)))
    .where(and(eq(restoBillItems.orgId, ctx.orgId),
      inArray(restoBillItems.billId, bills.map((b) => b.id))));

  const agg = new Map<string, { qty: bigint; amount: bigint }>();
  for (const r of rows) {
    const cur = agg.get(r.name) ?? { qty: 0n, amount: 0n };
    cur.qty += d3(r.qty);
    cur.amount += d2(r.amount);
    agg.set(r.name, cur);
  }

  const items = [...agg.entries()]
    .sort((a, b) => (b[1].amount > a[1].amount ? 1 : b[1].amount < a[1].amount ? -1 : 0))
    .slice(0, input.limit)
    .map(([name, v]) => ({
      name, qty: fmtQty(f3(v.qty)),
      amount: f2(v.amount), amount_fmt: fmtVnd(v.amount),
    }));
  return { from: fromStr, to: toStr, items };
}
