/**
 * MODULE KHO — reservation.service
 * Port Medusa ReservationItem: đặt giữ hàng trước khi xuất thật.
 *   create : reserved += q (guard availability phía SQL)
 *   release: trả lại khả dụng (reserved -= q)
 *   fulfill: xuất thật phần đã giữ (stocked -= q, reserved -= q) + movement
 */
import { and, eq, sql } from 'drizzle-orm';
import { khoMovements, khoReservations, khoStockLevels } from '../db/schema.js';
import type { KhoCtx } from '../types.js';
import { KhoError } from '../types.js';
import { getItemBySku, resolveLocation } from './catalog.service.js';
import type { z } from 'zod';
import type { reservationManageSchema } from '../validation/schemas.js';

type Input = z.infer<typeof reservationManageSchema>;

export async function manageReservation(ctx: KhoCtx, input: Input) {
  switch (input.action) {
    case 'create': return createReservation(ctx, input);
    case 'release': return releaseReservation(ctx, input.reservation_id);
    case 'fulfill': return fulfillReservation(ctx, input.reservation_id);
    case 'list': return listReservations(ctx, input.status, input.limit);
  }
}

async function createReservation(ctx: KhoCtx, input: Extract<Input, { action: 'create' }>) {
  const item = await getItemBySku(ctx, input.sku);
  const loc = await resolveLocation(ctx, input.location_code);

  // Guard availability + tăng reserved — một câu UPDATE atomic
  const [level] = await ctx.db.update(khoStockLevels)
    .set({
      reserved: sql`${khoStockLevels.reserved} + ${input.quantity}::numeric`,
      updatedAt: sql`now()`,
    })
    .where(and(
      eq(khoStockLevels.orgId, ctx.orgId),
      eq(khoStockLevels.itemId, item.id),
      eq(khoStockLevels.locationId, loc.id),
      sql`${khoStockLevels.stocked} - ${khoStockLevels.reserved} >= ${input.quantity}::numeric`,
    )).returning();

  if (!level) {
    throw new KhoError('INSUFFICIENT_STOCK',
      `Không đủ tồn khả dụng để giữ ${input.quantity} ${item.unit} "${item.name}" tại ${loc.code}`,
      { sku: item.sku, location_code: loc.code, requested: input.quantity });
  }

  const [rsv] = await ctx.db.insert(khoReservations).values({
    orgId: ctx.orgId, itemId: item.id, locationId: loc.id,
    quantity: input.quantity, refType: input.ref_type, refId: input.ref_id,
    note: input.note,
    expiresAt: input.expires_at ? new Date(input.expires_at) : undefined,
  }).returning();

  await ctx.bus.emit('kho.reservation.created', {
    org_id: ctx.orgId, reservation_id: rsv.id, item_id: item.id,
    sku: item.sku, location_code: loc.code, quantity: input.quantity,
  });

  return {
    reservation_id: rsv.id, sku: item.sku, name: item.name,
    location: loc.code, quantity: rsv.quantity, status: rsv.status,
    available_after: String(
      Number.parseFloat(level.stocked) - Number.parseFloat(level.reserved)),
  };
}

async function loadActive(ctx: KhoCtx, id: string) {
  const [rsv] = await ctx.db.select().from(khoReservations)
    .where(and(eq(khoReservations.orgId, ctx.orgId), eq(khoReservations.id, id)))
    .limit(1);
  if (!rsv) throw new KhoError('RESERVATION_NOT_FOUND', `Không tìm thấy phiếu giữ hàng ${id}`);
  if (rsv.status !== 'active') {
    throw new KhoError('RESERVATION_NOT_ACTIVE',
      `Phiếu giữ hàng đang ở trạng thái "${rsv.status}", không thể thao tác`, { status: rsv.status });
  }
  return rsv;
}

async function releaseReservation(ctx: KhoCtx, id: string) {
  const rsv = await loadActive(ctx, id);

  await ctx.db.update(khoStockLevels)
    .set({
      reserved: sql`greatest(${khoStockLevels.reserved} - ${rsv.quantity}::numeric, 0)`,
      updatedAt: sql`now()`,
    })
    .where(and(
      eq(khoStockLevels.orgId, ctx.orgId),
      eq(khoStockLevels.itemId, rsv.itemId),
      eq(khoStockLevels.locationId, rsv.locationId),
    ));

  const [updated] = await ctx.db.update(khoReservations)
    .set({ status: 'released', updatedAt: sql`now()` })
    .where(and(eq(khoReservations.orgId, ctx.orgId), eq(khoReservations.id, id)))
    .returning();

  await ctx.bus.emit('kho.reservation.released', {
    org_id: ctx.orgId, reservation_id: id, item_id: rsv.itemId, quantity: rsv.quantity,
  });
  return { reservation_id: id, status: updated.status, quantity: rsv.quantity };
}

async function fulfillReservation(ctx: KhoCtx, id: string) {
  const rsv = await loadActive(ctx, id);

  const [level] = await ctx.db.update(khoStockLevels)
    .set({
      stocked: sql`${khoStockLevels.stocked} - ${rsv.quantity}::numeric`,
      reserved: sql`greatest(${khoStockLevels.reserved} - ${rsv.quantity}::numeric, 0)`,
      updatedAt: sql`now()`,
    })
    .where(and(
      eq(khoStockLevels.orgId, ctx.orgId),
      eq(khoStockLevels.itemId, rsv.itemId),
      eq(khoStockLevels.locationId, rsv.locationId),
      sql`${khoStockLevels.stocked} >= ${rsv.quantity}::numeric`,
    )).returning();

  if (!level) {
    throw new KhoError('INSUFFICIENT_STOCK',
      'Tồn thực tế không đủ để hoàn tất phiếu giữ hàng (dữ liệu có thể đã bị điều chỉnh)',
      { reservation_id: id });
  }

  await ctx.db.insert(khoMovements).values({
    orgId: ctx.orgId, itemId: rsv.itemId, locationId: rsv.locationId,
    type: 'reserve_fulfill', delta: `-${rsv.quantity}`,
    refType: rsv.refType ?? 'reservation', refId: rsv.refId ?? id,
    note: rsv.note, actorUserId: ctx.userId,
  });

  const [updated] = await ctx.db.update(khoReservations)
    .set({ status: 'fulfilled', updatedAt: sql`now()` })
    .where(and(eq(khoReservations.orgId, ctx.orgId), eq(khoReservations.id, id)))
    .returning();

  await ctx.bus.emit('kho.reservation.fulfilled', {
    org_id: ctx.orgId, reservation_id: id, item_id: rsv.itemId, quantity: rsv.quantity,
  });
  return {
    reservation_id: id, status: updated.status,
    quantity: rsv.quantity, stocked_after: level.stocked,
  };
}

async function listReservations(ctx: KhoCtx, status: 'active' | 'fulfilled' | 'released', limit: number) {
  return ctx.db.select({
    id: khoReservations.id,
    itemId: khoReservations.itemId,
    quantity: khoReservations.quantity,
    status: khoReservations.status,
    refType: khoReservations.refType,
    refId: khoReservations.refId,
    note: khoReservations.note,
    createdAt: khoReservations.createdAt,
  }).from(khoReservations)
    .where(and(eq(khoReservations.orgId, ctx.orgId), eq(khoReservations.status, status)))
    .orderBy(sql`${khoReservations.createdAt} DESC`)
    .limit(limit);
}
