/**
 * SOUL-RESTAURANT — loyalty.service (v1.1)
 * Điểm thưởng: 1 điểm = 1đ. Tích khi đơn đóng (% chi tiêu ròng), đổi làm
 * phương thức thanh toán 'points', điều chỉnh tay (comp/sửa). Mọi biến động
 * ghi sổ resto_loyalty_ledger (audit + tra cứu).
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import type { RestoCtx } from '../types.js';
import { RestoError } from '../types.js';
import { restoCustomers, restoLoyaltyLedger, restoOrders } from '../db/schema.js';
import { getSettings } from './settings.service.js';
import { getCustomerByPhone } from './customer.service.js';
import { d2, f2, p2, pctOf, minBig, fmtVnd } from '../lib/money.js';

const d2signed = (v: string): bigint => (v.trim().startsWith('-') ? -d2(v.trim().slice(1)) : d2(v.trim()));

/** Tổng điểm (đ) đã đổi cho một đơn — để loại khỏi cơ sở tích điểm. */
async function redeemedDongForOrder(ctx: RestoCtx, orderId: string): Promise<bigint> {
  const rows = await ctx.db.select().from(restoLoyaltyLedger)
    .where(and(eq(restoLoyaltyLedger.orgId, ctx.orgId), eq(restoLoyaltyLedger.orderId, orderId),
      eq(restoLoyaltyLedger.type, 'redeem')));
  let sum = 0n;
  for (const r of rows) sum += -d2(r.points); // points redeem là số âm
  return sum;
}

/** Tích điểm khi đơn đóng. Gọi từ maybeCloseOrder. An toàn khi không có khách/tắt loyalty. */
export async function earnOnOrderClose(ctx: RestoCtx, orderId: string): Promise<{
  earned: string; balance_after?: string; customer_id?: string;
}> {
  const orders = await ctx.db.select().from(restoOrders)
    .where(and(eq(restoOrders.orgId, ctx.orgId), eq(restoOrders.id, orderId))).limit(1);
  const order = orders[0];
  if (!order || !order.customerId) return { earned: '0.00' };
  const s = await getSettings(ctx);
  if (!s.loyalty_enabled) return { earned: '0.00' };

  const custs = await ctx.db.select().from(restoCustomers)
    .where(and(eq(restoCustomers.orgId, ctx.orgId), eq(restoCustomers.id, order.customerId))).limit(1);
  const c = custs[0];
  if (!c) return { earned: '0.00' };

  const redeemed = await redeemedDongForOrder(ctx, orderId);
  let earnBase = d2(order.grandTotal) - redeemed;
  if (earnBase < 0n) earnBase = 0n;
  const earned = pctOf(earnBase, p2(s.loyalty_earn_pct));

  const now = new Date();
  const newBal = d2(c.pointsBalance) + earned;
  await ctx.db.update(restoCustomers).set({
    pointsBalance: f2(newBal),
    totalSpent: f2(d2(c.totalSpent) + earnBase),
    visits: c.visits + 1,
    firstVisitAt: c.firstVisitAt ?? now,
    lastVisitAt: now,
    updatedAt: now,
  }).where(and(eq(restoCustomers.orgId, ctx.orgId), eq(restoCustomers.id, c.id)));

  if (earned > 0n) {
    await ctx.db.insert(restoLoyaltyLedger).values({
      orgId: ctx.orgId, customerId: c.id, orderId, type: 'earn',
      points: f2(earned), balanceAfter: f2(newBal), reason: `Tích điểm đơn ${order.code}`,
    });
    await ctx.bus.emit('resto.loyalty.earned', {
      org_id: ctx.orgId, customer_id: c.id, order_code: order.code,
      points: f2(earned), balance_after: f2(newBal),
    });
  }
  return { earned: f2(earned), balance_after: f2(newBal), customer_id: c.id };
}

/** Đổi điểm làm thanh toán. Gọi từ payBill khi method='points'. Ghi sổ + trừ số dư.
 *  Trả về số đồng ÁP VÀO (1 điểm = 1đ). Không đổi được → ném lỗi rõ ràng. */
export async function redeemForPayment(
  ctx: RestoCtx,
  args: { customerId: string; orderId: string; orderCode: string; requested?: string; due: bigint },
): Promise<bigint> {
  const s = await getSettings(ctx);
  if (!s.loyalty_enabled) throw new RestoError('LOYALTY_DISABLED', 'Chương trình tích điểm đang tắt');
  const custs = await ctx.db.select().from(restoCustomers)
    .where(and(eq(restoCustomers.orgId, ctx.orgId), eq(restoCustomers.id, args.customerId))).limit(1);
  const c = custs[0];
  if (!c) throw new RestoError('CUSTOMER_NOT_FOUND', 'Không tìm thấy khách để đổi điểm');
  const balance = d2(c.pointsBalance);
  const avail = minBig(balance, args.due);
  if (avail <= 0n) throw new RestoError('LOYALTY_INSUFFICIENT', 'Khách không đủ điểm hoặc bill không còn nợ');

  let want: bigint;
  if (args.requested !== undefined) {
    const req = d2(args.requested);
    if (req > balance) throw new RestoError('LOYALTY_INSUFFICIENT',
      `Khách chỉ có ${fmtVnd(balance)} điểm, không đủ đổi ${fmtVnd(req)}`);
    want = minBig(req, args.due); // không đổi quá số cần thu (điểm không có tiền thối)
  } else {
    want = avail;
  }
  const minR = d2(s.loyalty_min_redeem);
  if (want < minR) throw new RestoError('LOYALTY_BELOW_MIN', `Đổi tối thiểu ${fmtVnd(minR)} điểm mỗi lần`);

  const newBal = balance - want;
  await ctx.db.update(restoCustomers).set({ pointsBalance: f2(newBal), updatedAt: new Date() })
    .where(and(eq(restoCustomers.orgId, ctx.orgId), eq(restoCustomers.id, c.id)));
  await ctx.db.insert(restoLoyaltyLedger).values({
    orgId: ctx.orgId, customerId: c.id, orderId: args.orderId, type: 'redeem',
    points: f2(-want), balanceAfter: f2(newBal), reason: `Đổi điểm thanh toán đơn ${args.orderCode}`,
  });
  await ctx.bus.emit('resto.loyalty.redeemed', {
    org_id: ctx.orgId, customer_id: c.id, order_code: args.orderCode,
    points: f2(want), balance_after: f2(newBal),
  });
  return want;
}

/** Điều chỉnh điểm tay (comp/sửa sai). points có thể âm. */
export async function adjustPoints(ctx: RestoCtx, input: { phone: string; points: string; reason: string }): Promise<{
  customer_id: string; name: string; delta: string; balance_after: string; balance_after_fmt: string;
}> {
  const c = await getCustomerByPhone(ctx, input.phone);
  if (!c) throw new RestoError('CUSTOMER_NOT_FOUND', `Không tìm thấy khách SĐT ${input.phone}`);
  const delta = d2signed(input.points);
  if (delta === 0n) throw new RestoError('LOYALTY_INSUFFICIENT', 'Số điểm điều chỉnh phải khác 0');
  const newBal = d2(c.pointsBalance) + delta;
  if (newBal < 0n) throw new RestoError('LOYALTY_INSUFFICIENT',
    `Không thể trừ ${fmtVnd(-delta)} — khách chỉ có ${fmtVnd(c.pointsBalance)} điểm`);
  await ctx.db.update(restoCustomers).set({ pointsBalance: f2(newBal), updatedAt: new Date() })
    .where(and(eq(restoCustomers.orgId, ctx.orgId), eq(restoCustomers.id, c.id)));
  await ctx.db.insert(restoLoyaltyLedger).values({
    orgId: ctx.orgId, customerId: c.id, orderId: null, type: 'adjust',
    points: f2(delta), balanceAfter: f2(newBal), reason: input.reason,
  });
  await ctx.bus.emit('resto.loyalty.adjusted', {
    org_id: ctx.orgId, customer_id: c.id, points: f2(delta), balance_after: f2(newBal), reason: input.reason,
  });
  return {
    customer_id: c.id, name: c.name, delta: f2(delta),
    balance_after: f2(newBal), balance_after_fmt: fmtVnd(newBal),
  };
}

/** Sổ điểm của một khách. */
export async function loyaltyHistory(ctx: RestoCtx, input: { phone: string; limit?: number }): Promise<{
  found: boolean; name?: string; points_balance?: string; points_balance_fmt?: string;
  entries: Array<{ type: string; points: string; balance_after: string; reason: string | null; at: string }>;
}> {
  const c = await getCustomerByPhone(ctx, input.phone);
  if (!c) return { found: false, entries: [] };
  const rows = await ctx.db.select().from(restoLoyaltyLedger)
    .where(and(eq(restoLoyaltyLedger.orgId, ctx.orgId), eq(restoLoyaltyLedger.customerId, c.id)))
    .orderBy(desc(restoLoyaltyLedger.createdAt)).limit(input.limit ?? 50);
  return {
    found: true, name: c.name, points_balance: c.pointsBalance, points_balance_fmt: fmtVnd(c.pointsBalance),
    entries: rows.map((r) => ({
      type: r.type, points: r.points, balance_after: r.balanceAfter, reason: r.reason,
      at: r.createdAt.toISOString(),
    })),
  };
}
