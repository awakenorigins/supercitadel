/**
 * SOUL-RESTAURANT — customer.service (v1.1)
 * Khách hàng thân thiết khóa theo SĐT (duy nhất trong 1 org). Không import
 * module CRM — đây là hồ sơ khách tối thiểu cho loyalty của quán. Có thể đồng
 * bộ CRM sau qua event resto.customer.upserted.
 */
import { and, desc, eq, or, sql } from 'drizzle-orm';
import type { RestoCtx } from '../types.js';
import { RestoError } from '../types.js';
import { restoCustomers, restoOrders } from '../db/schema.js';
import { fmtVnd } from '../lib/money.js';

const normPhone = (p: string) => p.replace(/[^\d+]/g, '');

export interface CustomerRow {
  id: string; phone: string | null; name: string;
  pointsBalance: string; totalSpent: string; visits: number; tier: string;
}

/** Tìm khách theo SĐT (chuẩn hóa). Trả undefined nếu không có. */
export async function getCustomerByPhone(ctx: RestoCtx, phone: string): Promise<CustomerRow | undefined> {
  const ph = normPhone(phone);
  const rows = await ctx.db.select().from(restoCustomers)
    .where(and(eq(restoCustomers.orgId, ctx.orgId), eq(restoCustomers.phone, ph))).limit(1);
  return rows[0];
}

/** Tạo hoặc tìm khách theo SĐT rồi trả về (dùng khi gắn khách vào đơn). */
export async function resolveOrCreateCustomer(ctx: RestoCtx, phone: string, name?: string): Promise<CustomerRow> {
  const existing = await getCustomerByPhone(ctx, phone);
  if (existing) {
    if (name && name.trim() && existing.name !== name.trim()) {
      await ctx.db.update(restoCustomers).set({ name: name.trim(), updatedAt: new Date() })
        .where(and(eq(restoCustomers.orgId, ctx.orgId), eq(restoCustomers.id, existing.id)));
      return { ...existing, name: name.trim() };
    }
    return existing;
  }
  const ph = normPhone(phone);
  const ins = await ctx.db.insert(restoCustomers)
    .values({ orgId: ctx.orgId, phone: ph, name: (name?.trim() || ph) })
    .returning();
  const c = ins[0]!;
  await ctx.bus.emit('resto.customer.upserted', {
    org_id: ctx.orgId, customer_id: c.id, phone: ph, name: c.name, created: true,
  });
  return c;
}

export interface CustomerUpsertInput { phone: string; name?: string; note?: string; tier?: string }

/** Action: tạo/sửa hồ sơ khách. */
export async function upsertCustomer(ctx: RestoCtx, input: CustomerUpsertInput): Promise<{
  customer_id: string; phone: string; name: string; created: boolean;
  points_balance: string; visits: number;
}> {
  const ph = normPhone(input.phone);
  if (ph.length < 6) throw new RestoError('CUSTOMER_INVALID', 'Số điện thoại không hợp lệ');
  const existing = await getCustomerByPhone(ctx, ph);
  if (existing) {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name?.trim()) set.name = input.name.trim();
    if (input.note !== undefined) set.note = input.note;
    if (input.tier) set.tier = input.tier;
    await ctx.db.update(restoCustomers).set(set)
      .where(and(eq(restoCustomers.orgId, ctx.orgId), eq(restoCustomers.id, existing.id)));
    await ctx.bus.emit('resto.customer.upserted', {
      org_id: ctx.orgId, customer_id: existing.id, phone: ph, name: input.name?.trim() ?? existing.name, created: false,
    });
    return {
      customer_id: existing.id, phone: ph, name: input.name?.trim() ?? existing.name,
      created: false, points_balance: existing.pointsBalance, visits: existing.visits,
    };
  }
  const ins = await ctx.db.insert(restoCustomers)
    .values({ orgId: ctx.orgId, phone: ph, name: (input.name?.trim() || ph), note: input.note ?? null, tier: input.tier ?? 'regular' })
    .returning();
  const c = ins[0]!;
  await ctx.bus.emit('resto.customer.upserted', {
    org_id: ctx.orgId, customer_id: c.id, phone: ph, name: c.name, created: true,
  });
  return { customer_id: c.id, phone: ph, name: c.name, created: true, points_balance: c.pointsBalance, visits: c.visits };
}

/** Tra cứu khách theo SĐT: điểm, số lần ghé, chi tiêu, đơn gần đây. */
export async function lookupCustomer(ctx: RestoCtx, input: { phone: string }): Promise<{
  found: boolean;
  customer?: {
    customer_id: string; phone: string; name: string; tier: string;
    points_balance: string; points_balance_fmt: string;
    total_spent: string; total_spent_fmt: string; visits: number;
  };
  recent_orders: Array<{ order_code: string; grand_total: string; grand_total_fmt: string; opened_at: string; status: string }>;
}> {
  const c = await getCustomerByPhone(ctx, input.phone);
  if (!c) return { found: false, recent_orders: [] };
  const orders = await ctx.db.select().from(restoOrders)
    .where(and(eq(restoOrders.orgId, ctx.orgId), eq(restoOrders.customerId, c.id)))
    .orderBy(desc(restoOrders.openedAt)).limit(5);
  return {
    found: true,
    customer: {
      customer_id: c.id, phone: c.phone!, name: c.name, tier: c.tier,
      points_balance: c.pointsBalance, points_balance_fmt: fmtVnd(c.pointsBalance),
      total_spent: c.totalSpent, total_spent_fmt: fmtVnd(c.totalSpent), visits: c.visits,
    },
    recent_orders: orders.map((o) => ({
      order_code: o.code, grand_total: o.grandTotal, grand_total_fmt: fmtVnd(o.grandTotal),
      opened_at: o.openedAt.toISOString(), status: o.status,
    })),
  };
}

/** Danh sách khách (tìm theo tên/SĐT). */
export async function listCustomers(ctx: RestoCtx, input: { query?: string; limit?: number }): Promise<{
  total: number;
  customers: Array<{ customer_id: string; phone: string | null; name: string; tier: string; points_balance: string; visits: number }>;
}> {
  const limit = input.limit ?? 50;
  const where = input.query
    ? and(eq(restoCustomers.orgId, ctx.orgId), or(
        sql`lower(${restoCustomers.name}) LIKE ${'%' + input.query.toLowerCase() + '%'}`,
        sql`${restoCustomers.phone} LIKE ${'%' + normPhone(input.query) + '%'}`,
      ))
    : eq(restoCustomers.orgId, ctx.orgId);
  const rows = await ctx.db.select().from(restoCustomers).where(where)
    .orderBy(desc(restoCustomers.lastVisitAt)).limit(limit);
  return {
    total: rows.length,
    customers: rows.map((c) => ({
      customer_id: c.id, phone: c.phone, name: c.name, tier: c.tier,
      points_balance: c.pointsBalance, visits: c.visits,
    })),
  };
}
