/**
 * SOUL-RESTAURANT — promotion.service (v1.1)
 * Khuyến mãi: voucher (mã) · happy_hour (khung giờ +07:00) · auto.
 * Áp mã = gắn promo vào đơn → totals tự tính lại phần giảm (nguồn duy nhất
 * computeAndStoreTotals). Giảm KM gộp vào discount_total nên tách bill vẫn
 * phân bổ đúng, không cần logic riêng.
 */
import { and, count, eq, sql } from 'drizzle-orm';
import type { RestoCtx } from '../types.js';
import { RestoError } from '../types.js';
import { restoPromotions, restoPromoRedemptions, restoOrders } from '../db/schema.js';
import { resolveOrder, computeAndStoreTotals, type OrderRef } from './order.service.js';
import { d2, fmtVnd } from '../lib/money.js';

/** Giờ địa phương +07:00: phút-trong-ngày [0..1439] + thứ (0=CN..6=T7). */
function localNow(): { minuteOfDay: number; dayBit: number } {
  const local = new Date(Date.now() + 7 * 3600 * 1000);
  const minuteOfDay = local.getUTCHours() * 60 + local.getUTCMinutes();
  return { minuteOfDay, dayBit: 1 << local.getUTCDay() };
}

export interface PromoUpsertInput {
  id?: string; code?: string; name: string;
  kind?: 'voucher' | 'happy_hour' | 'auto';
  discount_type: 'percent' | 'amount'; value: string;
  min_subtotal?: string; max_discount?: string;
  starts_at?: string; ends_at?: string;
  hh_start_min?: number; hh_end_min?: number; days_mask?: number;
  usage_limit?: number; per_customer_limit?: number; active?: boolean;
}

export async function upsertPromo(ctx: RestoCtx, input: PromoUpsertInput): Promise<{
  promo_id: string; code: string | null; name: string; kind: string;
  discount_type: string; value: string; created: boolean;
}> {
  const kind = input.kind ?? 'voucher';
  if (kind === 'voucher' && !input.code?.trim()) throw new RestoError('PROMO_INVALID', 'Voucher cần có mã (code)');
  if (kind === 'happy_hour' && (input.hh_start_min == null || input.hh_end_min == null)) {
    throw new RestoError('PROMO_INVALID', 'Happy hour cần khung giờ (hh_start_min, hh_end_min)');
  }
  if (input.discount_type === 'percent' && d2(input.value) > d2('100')) {
    throw new RestoError('PROMO_INVALID', 'Giảm phần trăm không vượt 100%');
  }

  const set = {
    code: input.code?.trim() ?? null,
    name: input.name.trim(),
    kind,
    discountType: input.discount_type,
    value: input.value,
    minSubtotal: input.min_subtotal ?? '0',
    maxDiscount: input.max_discount ?? null,
    startsAt: input.starts_at ? new Date(input.starts_at) : null,
    endsAt: input.ends_at ? new Date(input.ends_at) : null,
    hhStartMin: input.hh_start_min ?? null,
    hhEndMin: input.hh_end_min ?? null,
    daysMask: input.days_mask ?? 127,
    perCustomerLimit: input.per_customer_limit ?? null,
    usageLimit: input.usage_limit ?? null,
    active: input.active ?? true,
    updatedAt: new Date(),
  };

  // Tìm bản ghi cũ: theo id → theo code
  let existing: { id: string } | undefined;
  if (input.id) {
    const r = await ctx.db.select({ id: restoPromotions.id }).from(restoPromotions)
      .where(and(eq(restoPromotions.orgId, ctx.orgId), eq(restoPromotions.id, input.id))).limit(1);
    existing = r[0];
    if (!existing) throw new RestoError('PROMO_NOT_FOUND', 'Không tìm thấy khuyến mãi để sửa');
  } else if (set.code) {
    const r = await ctx.db.select({ id: restoPromotions.id }).from(restoPromotions)
      .where(and(eq(restoPromotions.orgId, ctx.orgId),
        sql`lower(${restoPromotions.code}) = ${set.code.toLowerCase()}`)).limit(1);
    existing = r[0];
  }

  let promoId: string; let created: boolean;
  if (existing) {
    await ctx.db.update(restoPromotions).set(set)
      .where(and(eq(restoPromotions.orgId, ctx.orgId), eq(restoPromotions.id, existing.id)));
    promoId = existing.id; created = false;
  } else {
    const ins = await ctx.db.insert(restoPromotions)
      .values({ orgId: ctx.orgId, ...set }).returning({ id: restoPromotions.id });
    promoId = ins[0]!.id; created = true;
  }
  await ctx.bus.emit('resto.promo.upserted', {
    org_id: ctx.orgId, promo_id: promoId, code: set.code, kind, created,
  });
  return {
    promo_id: promoId, code: set.code, name: set.name, kind,
    discount_type: input.discount_type, value: input.value, created,
  };
}

export async function listPromos(ctx: RestoCtx, input: { active_only?: boolean }): Promise<{
  total: number;
  promos: Array<{
    promo_id: string; code: string | null; name: string; kind: string;
    discount_type: string; value: string; min_subtotal: string;
    used_count: number; usage_limit: number | null; active: boolean;
  }>;
}> {
  const where = input.active_only
    ? and(eq(restoPromotions.orgId, ctx.orgId), eq(restoPromotions.active, true))
    : eq(restoPromotions.orgId, ctx.orgId);
  const rows = await ctx.db.select().from(restoPromotions).where(where);
  return {
    total: rows.length,
    promos: rows.map((p) => ({
      promo_id: p.id, code: p.code, name: p.name, kind: p.kind,
      discount_type: p.discountType, value: p.value, min_subtotal: p.minSubtotal,
      used_count: p.usedCount, usage_limit: p.usageLimit, active: p.active,
    })),
  };
}

/** Đếm lượt đã áp của promo (nguồn sự thật cho giới hạn) + đồng bộ used_count. */
async function syncUsedCount(ctx: RestoCtx, promoId: string): Promise<number> {
  const r = await ctx.db.select({ n: count() }).from(restoPromoRedemptions)
    .where(and(eq(restoPromoRedemptions.orgId, ctx.orgId), eq(restoPromoRedemptions.promoId, promoId)));
  const n = Number(r[0]?.n ?? 0);
  await ctx.db.update(restoPromotions).set({ usedCount: n, updatedAt: new Date() })
    .where(and(eq(restoPromotions.orgId, ctx.orgId), eq(restoPromotions.id, promoId)));
  return n;
}

export interface PromoApplyInput extends OrderRef { code?: string; remove?: boolean }

export async function applyPromo(ctx: RestoCtx, input: PromoApplyInput): Promise<{
  order_code: string; removed: boolean;
  code?: string | null; name?: string; discount_type?: string; value?: string;
  discount_amount?: string; discount_amount_fmt?: string;
  totals: Awaited<ReturnType<typeof computeAndStoreTotals>>;
}> {
  const order = await resolveOrder(ctx, input, { mustOpen: true });

  // Gỡ khuyến mãi
  if (input.remove || !input.code) {
    if (!input.remove) throw new RestoError('PROMO_INVALID', 'Cần code để áp, hoặc remove:true để gỡ');
    const oldPromoId = order.promoId;
    await ctx.db.delete(restoPromoRedemptions)
      .where(and(eq(restoPromoRedemptions.orgId, ctx.orgId), eq(restoPromoRedemptions.orderId, order.id)));
    await ctx.db.update(restoOrders).set({ promoId: null, promoCode: null, updatedAt: new Date() })
      .where(and(eq(restoOrders.orgId, ctx.orgId), eq(restoOrders.id, order.id)));
    if (oldPromoId) await syncUsedCount(ctx, oldPromoId);
    const totals = await computeAndStoreTotals(ctx, order.id);
    await ctx.bus.emit('resto.promo.removed', { org_id: ctx.orgId, order_code: order.code });
    return { order_code: order.code, removed: true, totals };
  }

  // Áp mã
  const rows = await ctx.db.select().from(restoPromotions)
    .where(and(eq(restoPromotions.orgId, ctx.orgId),
      sql`lower(${restoPromotions.code}) = ${input.code.trim().toLowerCase()}`)).limit(1);
  const promo = rows[0];
  if (!promo) throw new RestoError('PROMO_NOT_FOUND', `Không tìm thấy mã "${input.code}"`);
  if (!promo.active) throw new RestoError('PROMO_INACTIVE', `Mã "${promo.code}" đang tắt`);

  const now = new Date();
  if (promo.startsAt && now < promo.startsAt) throw new RestoError('PROMO_NOT_APPLICABLE', `Mã "${promo.code}" chưa tới thời gian áp dụng`);
  if (promo.endsAt && now > promo.endsAt) throw new RestoError('PROMO_NOT_APPLICABLE', `Mã "${promo.code}" đã hết hạn`);
  const { minuteOfDay, dayBit } = localNow();
  if ((promo.daysMask & dayBit) === 0) throw new RestoError('PROMO_NOT_APPLICABLE', `Mã "${promo.code}" không áp dụng hôm nay`);
  if (promo.hhStartMin != null && promo.hhEndMin != null) {
    if (minuteOfDay < promo.hhStartMin || minuteOfDay >= promo.hhEndMin) {
      throw new RestoError('PROMO_NOT_APPLICABLE', `Mã "${promo.code}" chỉ áp trong khung giờ khuyến mãi`);
    }
  }
  if (d2(order.subtotal) < d2(promo.minSubtotal)) {
    throw new RestoError('PROMO_NOT_APPLICABLE', `Đơn tối thiểu ${fmtVnd(promo.minSubtotal)} mới áp được mã này`);
  }

  // Giới hạn lượt (đếm redemption đã cam kết, trừ đơn hiện tại)
  const usedRows = await ctx.db.select().from(restoPromoRedemptions)
    .where(and(eq(restoPromoRedemptions.orgId, ctx.orgId), eq(restoPromoRedemptions.promoId, promo.id)));
  const usedOthers = usedRows.filter((u) => u.orderId !== order.id);
  if (promo.usageLimit != null && usedOthers.length >= promo.usageLimit) {
    throw new RestoError('PROMO_LIMIT_REACHED', `Mã "${promo.code}" đã hết lượt sử dụng`);
  }
  if (promo.perCustomerLimit != null && order.customerId) {
    const perCust = usedOthers.filter((u) => u.customerId === order.customerId).length;
    if (perCust >= promo.perCustomerLimit) {
      throw new RestoError('PROMO_LIMIT_REACHED', `Khách đã dùng hết lượt cho mã "${promo.code}"`);
    }
  }

  // Gắn promo + tính lại totals (computeAndStoreTotals sẽ tính promo_discount)
  const prevPromoId = order.promoId;
  await ctx.db.update(restoOrders).set({ promoId: promo.id, promoCode: promo.code, updatedAt: new Date() })
    .where(and(eq(restoOrders.orgId, ctx.orgId), eq(restoOrders.id, order.id)));
  const totals = await computeAndStoreTotals(ctx, order.id);

  const after = await ctx.db.select({ promoDiscount: restoOrders.promoDiscount }).from(restoOrders)
    .where(and(eq(restoOrders.orgId, ctx.orgId), eq(restoOrders.id, order.id))).limit(1);
  const discountAmount = after[0]?.promoDiscount ?? '0.00';

  // Upsert redemption (unique theo đơn) — nguồn đếm lượt
  await ctx.db.insert(restoPromoRedemptions)
    .values({
      orgId: ctx.orgId, promoId: promo.id, orderId: order.id,
      customerId: order.customerId ?? null, code: promo.code, discountAmount,
    })
    .onConflictDoUpdate({
      target: [restoPromoRedemptions.orgId, restoPromoRedemptions.orderId],
      set: { promoId: promo.id, customerId: order.customerId ?? null, code: promo.code, discountAmount },
    });
  await syncUsedCount(ctx, promo.id);
  if (prevPromoId && prevPromoId !== promo.id) await syncUsedCount(ctx, prevPromoId);

  await ctx.bus.emit('resto.promo.applied', {
    org_id: ctx.orgId, order_code: order.code, code: promo.code, discount_amount: discountAmount,
  });
  return {
    order_code: order.code, removed: false,
    code: promo.code, name: promo.name, discount_type: promo.discountType, value: promo.value,
    discount_amount: discountAmount, discount_amount_fmt: fmtVnd(discountAmount),
    totals,
  };
}

/** Gỡ mọi redemption của một đơn (gọi khi hủy đơn). Đồng bộ used_count. */
export async function clearOrderPromo(ctx: RestoCtx, orderId: string): Promise<void> {
  const rows = await ctx.db.select({ promoId: restoPromoRedemptions.promoId }).from(restoPromoRedemptions)
    .where(and(eq(restoPromoRedemptions.orgId, ctx.orgId), eq(restoPromoRedemptions.orderId, orderId)));
  if (!rows.length) return;
  await ctx.db.delete(restoPromoRedemptions)
    .where(and(eq(restoPromoRedemptions.orgId, ctx.orgId), eq(restoPromoRedemptions.orderId, orderId)));
  for (const r of rows) await syncUsedCount(ctx, r.promoId);
}
