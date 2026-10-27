/**
 * SOUL-RESTAURANT — kitchen.service
 * Gửi bếp (KOT tách theo trạm), màn hình bếp (KDS), lên món.
 * Luồng KOT:  queued → preparing → ready → completed (chỉ tiến, không lùi).
 * Luồng món:  pending → sent → preparing → ready → served.
 * Combo v1: đi 1 dòng về trạm của combo, ghi chú liệt kê thành phần
 * (v1.1 sẽ tách dòng theo trạm từng thành phần — xem GUIDE §Giới hạn).
 */
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { RestoCtx } from '../types.js';
import { RestoError } from '../types.js';
import {
  restoKots, restoOrderItems, restoStations, restoOrders, restoTables,
  restoComboItems, restoMenuItems,
} from '../db/schema.js';
import { resolveOrder, type OrderRef } from './order.service.js';
import { getSettings } from './settings.service.js';
import { expandDeductionLines } from './catalog.service.js';
import { genCode } from '../lib/codes.js';
import { fmtQty } from '../lib/money.js';

/** Gửi bếp: mọi món 'pending' → KOT theo trạm; món combo kèm ghi chú thành phần. */
/** Dựng KOT theo trạm từ danh sách món pending (dùng chung cho gửi bếp & fire-by-course). */
async function emitKots(
  ctx: RestoCtx,
  order: { id: string; code: string },
  pending: Array<{ id: string; menuItemId: string | null; stationId: string | null; name: string; qty: string; note: string | null; options: Array<{ name: string }> | null; courseNo: number }>,
  note?: string,
): Promise<Array<{ kot_code: string; station: string; items: Array<{ name: string; qty: string; note: string | null }> }>> {
  // Ghi chú thành phần cho combo (bếp đọc phiếu là hiểu)
  const comboIds = [...new Set(pending.map((p) => p.menuItemId).filter((v): v is string => Boolean(v)))];
  const comboNotes = new Map<string, string>();
  if (comboIds.length) {
    const comps = await ctx.db
      .select({ comboId: restoComboItems.comboId, qty: restoComboItems.qty, name: restoMenuItems.name })
      .from(restoComboItems)
      .innerJoin(restoMenuItems, and(
        eq(restoMenuItems.orgId, ctx.orgId),
        eq(restoMenuItems.id, restoComboItems.componentItemId)))
      .where(and(eq(restoComboItems.orgId, ctx.orgId), inArray(restoComboItems.comboId, comboIds)));
    const byCombo = new Map<string, string[]>();
    for (const c of comps) {
      if (!byCombo.has(c.comboId)) byCombo.set(c.comboId, []);
      byCombo.get(c.comboId)!.push(`${fmtQty(c.qty)} ${c.name}`);
    }
    for (const [id, parts] of byCombo) comboNotes.set(id, `gồm: ${parts.join(', ')}`);
  }

  // Nhóm theo trạm
  const byStation = new Map<string, typeof pending>();
  for (const p of pending) {
    const key = p.stationId ?? '__none__';
    if (!byStation.has(key)) byStation.set(key, []);
    byStation.get(key)!.push(p);
  }

  const stationIds = [...byStation.keys()].filter((k) => k !== '__none__');
  const stations = stationIds.length
    ? await ctx.db.select().from(restoStations)
        .where(and(eq(restoStations.orgId, ctx.orgId), inArray(restoStations.id, stationIds)))
    : [];
  const stationName = new Map(stations.map((s) => [s.id, s.name]));

  const out: Array<{ kot_code: string; station: string; items: Array<{ name: string; qty: string; note: string | null }> }> = [];
  for (const [key, items] of byStation) {
    const code = genCode('KOT');
    const stationId = key === '__none__' ? null : key;
    const kot = await ctx.db.insert(restoKots).values({
      orgId: ctx.orgId, orderId: order.id, stationId, code, note: note ?? null,
    }).returning({ id: restoKots.id });
    const kotId = kot[0]!.id;

    await ctx.db.update(restoOrderItems)
      .set({ status: 'sent', kotId, updatedAt: new Date() })
      .where(and(eq(restoOrderItems.orgId, ctx.orgId),
        inArray(restoOrderItems.id, items.map((i) => i.id))));

    const stName = stationId ? (stationName.get(stationId) ?? 'Bếp') : 'Bếp chung';
    const kotItems = items.map((i) => {
      const comboNote = i.menuItemId ? comboNotes.get(i.menuItemId) : undefined;
      const noteStr = [i.note, comboNote].filter(Boolean).join(' · ') || null;
      return { name: i.name, qty: fmtQty(i.qty), note: noteStr, options: (i.options ?? []).map((o) => o.name), course: i.courseNo };
    });
    await ctx.bus.emit('resto.kot.created', {
      org_id: ctx.orgId, kot_code: code, order_code: order.code, station: stName, items: kotItems,
    });
    out.push({ kot_code: code, station: stName, items: kotItems.map(({ name, qty, note }) => ({ name, qty, note })) });
  }
  return out;
}

export async function sendKitchen(ctx: RestoCtx, input: OrderRef & { note?: string; only_course?: number }): Promise<{
  order_code: string;
  kots: Array<{ kot_code: string; station: string; items: Array<{ name: string; qty: string; note: string | null }> }>;
}> {
  const order = await resolveOrder(ctx, input);
  const conds = [eq(restoOrderItems.orgId, ctx.orgId), eq(restoOrderItems.orderId, order.id), eq(restoOrderItems.status, 'pending')];
  if (input.only_course != null) conds.push(eq(restoOrderItems.courseNo, input.only_course));
  const pending = await ctx.db.select().from(restoOrderItems)
    .where(and(...conds)).orderBy(asc(restoOrderItems.createdAt));
  if (!pending.length) {
    throw new RestoError('NOTHING_TO_SEND', `Đơn ${order.code} không có món nào chờ gửi bếp`);
  }
  const out = await emitKots(ctx, order, pending, input.note);
  await ctx.bus.emit('resto.order.sent', {
    org_id: ctx.orgId, order_code: order.code, kots: out.map((k) => k.kot_code),
  });
  return { order_code: order.code, kots: out };
}

/** v1.2 — Fire-by-course: gửi bếp CHỈ các món của một course (ra món theo lượt). */
export async function fireCourse(ctx: RestoCtx, input: OrderRef & { course: number; note?: string }): Promise<{
  order_code: string; course: number;
  kots: Array<{ kot_code: string; station: string; items: Array<{ name: string; qty: string; note: string | null }> }>;
}> {
  const order = await resolveOrder(ctx, input);
  const pending = await ctx.db.select().from(restoOrderItems)
    .where(and(eq(restoOrderItems.orgId, ctx.orgId), eq(restoOrderItems.orderId, order.id),
      eq(restoOrderItems.status, 'pending'), eq(restoOrderItems.courseNo, input.course)))
    .orderBy(asc(restoOrderItems.createdAt));
  if (!pending.length) {
    throw new RestoError('NOTHING_TO_SEND', `Đơn ${order.code} không có món course ${input.course} nào chờ gửi bếp`);
  }
  const out = await emitKots(ctx, order, pending, input.note);
  await ctx.bus.emit('resto.order.course_fired', {
    org_id: ctx.orgId, order_code: order.code, course: input.course, kots: out.map((k) => k.kot_code),
  });
  return { order_code: order.code, course: input.course, kots: out };
}

const KOT_FLOW: Record<string, number> = { queued: 0, preparing: 1, ready: 2, completed: 3 };

/** KDS đổi trạng thái KOT (chỉ tiến): preparing | ready | completed. */
export async function kdsUpdate(ctx: RestoCtx, input: { kot_code: string; status: 'preparing' | 'ready' | 'completed' }): Promise<{
  kot_code: string; status: string; items_updated: number;
}> {
  const rows = await ctx.db.select().from(restoKots)
    .where(and(eq(restoKots.orgId, ctx.orgId),
      sql`lower(${restoKots.code}) = ${input.kot_code.trim().toLowerCase()}`)).limit(1);
  const kot = rows[0];
  if (!kot) throw new RestoError('KOT_NOT_FOUND', `Không tìm thấy phiếu bếp "${input.kot_code}"`);
  if (kot.status === 'cancelled' || kot.status === 'completed') {
    throw new RestoError('INVALID_STATUS_FLOW', `Phiếu ${kot.code} đã ${kot.status === 'completed' ? 'hoàn tất' : 'hủy'}`);
  }
  if (KOT_FLOW[input.status]! <= KOT_FLOW[kot.status]!) {
    throw new RestoError('INVALID_STATUS_FLOW', `Phiếu ${kot.code} đang "${kot.status}" — không lùi về "${input.status}"`);
  }

  await ctx.db.update(restoKots).set({
    status: input.status,
    doneAt: input.status === 'completed' ? new Date() : kot.doneAt,
    updatedAt: new Date(),
  }).where(and(eq(restoKots.orgId, ctx.orgId), eq(restoKots.id, kot.id)));

  // Đồng bộ trạng thái món trong phiếu (không đụng served/cancelled)
  const itemStatus = input.status === 'preparing' ? 'preparing' : 'ready';
  const updated = await ctx.db.update(restoOrderItems).set({
    status: itemStatus, updatedAt: new Date(),
  }).where(and(eq(restoOrderItems.orgId, ctx.orgId), eq(restoOrderItems.kotId, kot.id),
    inArray(restoOrderItems.status, input.status === 'preparing' ? ['sent'] : ['sent', 'preparing'])))
    .returning({ id: restoOrderItems.id });

  await ctx.bus.emit('resto.kot.updated', {
    org_id: ctx.orgId, kot_code: kot.code, status: input.status,
  });
  return { kot_code: kot.code, status: input.status, items_updated: updated.length };
}

/** Màn hình bếp: phiếu đang chạy theo trạm, FIFO, kèm tuổi phiếu (phút). */
export async function kdsQueue(ctx: RestoCtx, input: { station?: string; status: 'queued' | 'preparing' | 'ready' | 'active'; limit: number }): Promise<{
  total: number;
  kots: Array<{
    kot_code: string; station: string; status: string; order_code: string;
    table: string | null; age_minutes: number;
    items: Array<{ name: string; qty: string; options: string[]; note: string | null; course: number; status: string }>;
  }>;
}> {
  const conds = [eq(restoKots.orgId, ctx.orgId)];
  if (input.status === 'active') conds.push(inArray(restoKots.status, ['queued', 'preparing', 'ready']));
  else conds.push(eq(restoKots.status, input.status));
  if (input.station) {
    const st = await ctx.db.select().from(restoStations)
      .where(and(eq(restoStations.orgId, ctx.orgId),
        sql`lower(${restoStations.name}) = ${input.station.trim().toLowerCase()}`)).limit(1);
    if (!st[0]) throw new RestoError('STATION_NOT_FOUND', `Không có trạm bếp "${input.station}"`);
    conds.push(eq(restoKots.stationId, st[0].id));
  }

  const kots = await ctx.db.select().from(restoKots).where(and(...conds))
    .orderBy(asc(restoKots.sentAt)).limit(input.limit);
  if (!kots.length) return { total: 0, kots: [] };

  const kotIds = kots.map((k) => k.id);
  const items = await ctx.db.select().from(restoOrderItems)
    .where(and(eq(restoOrderItems.orgId, ctx.orgId), inArray(restoOrderItems.kotId, kotIds),
      ne(restoOrderItems.status, 'cancelled')))
    .orderBy(asc(restoOrderItems.courseNo), asc(restoOrderItems.createdAt));
  const itemsByKot = new Map<string, typeof items>();
  for (const i of items) {
    const k = i.kotId!;
    if (!itemsByKot.has(k)) itemsByKot.set(k, []);
    itemsByKot.get(k)!.push(i);
  }

  const orderIds = [...new Set(kots.map((k) => k.orderId))];
  const orders = await ctx.db.select().from(restoOrders)
    .where(and(eq(restoOrders.orgId, ctx.orgId), inArray(restoOrders.id, orderIds)));
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const tableIds = orders.map((o) => o.tableId).filter((v): v is string => Boolean(v));
  const tables = tableIds.length
    ? await ctx.db.select().from(restoTables)
        .where(and(eq(restoTables.orgId, ctx.orgId), inArray(restoTables.id, tableIds)))
    : [];
  const tName = new Map(tables.map((t) => [t.id, t.name]));
  const stIds = kots.map((k) => k.stationId).filter((v): v is string => Boolean(v));
  const sts = stIds.length
    ? await ctx.db.select().from(restoStations)
        .where(and(eq(restoStations.orgId, ctx.orgId), inArray(restoStations.id, [...new Set(stIds)])))
    : [];
  const stName = new Map(sts.map((s) => [s.id, s.name]));

  const now = Date.now();
  return {
    total: kots.length,
    kots: kots.map((k) => {
      const o = orderById.get(k.orderId);
      return {
        kot_code: k.code,
        station: k.stationId ? (stName.get(k.stationId) ?? 'Bếp') : 'Bếp chung',
        status: k.status,
        order_code: o?.code ?? '',
        table: o?.tableId ? (tName.get(o.tableId) ?? null) : null,
        age_minutes: Math.floor((now - k.sentAt.getTime()) / 60000),
        items: (itemsByKot.get(k.id) ?? []).map((i) => ({
          name: i.name, qty: fmtQty(i.qty),
          options: (i.options ?? []).map((op) => op.name),
          note: i.note, course: i.courseNo, status: i.status,
        })),
      };
    }),
  };
}

/** Lên món: đánh dấu served (mặc định mọi món 'ready'; hoặc theo tên).
 *  Nếu settings.deduct_on = 'served' → phát event trừ kho cho các món vừa lên. */
export async function serveItems(ctx: RestoCtx, input: OrderRef & { items?: string[] }): Promise<{
  order_code: string; served: Array<{ name: string; qty: string }>;
  deduction_emitted: boolean;
}> {
  const order = await resolveOrder(ctx, input);
  let targets: Array<typeof restoOrderItems.$inferSelect> = [];

  if (input.items?.length) {
    for (const name of input.items) {
      const q = name.trim().toLowerCase();
      const rows = await ctx.db.select().from(restoOrderItems)
        .where(and(eq(restoOrderItems.orgId, ctx.orgId), eq(restoOrderItems.orderId, order.id),
          inArray(restoOrderItems.status, ['sent', 'preparing', 'ready']),
          sql`lower(${restoOrderItems.name}) = ${q}`))
        .orderBy(asc(restoOrderItems.createdAt)).limit(1);
      if (!rows[0]) {
        throw new RestoError('ITEM_NOT_SERVABLE', `Không có món "${name}" đang chờ lên trong đơn ${order.code}`);
      }
      targets.push(rows[0]);
    }
  } else {
    targets = await ctx.db.select().from(restoOrderItems)
      .where(and(eq(restoOrderItems.orgId, ctx.orgId), eq(restoOrderItems.orderId, order.id),
        eq(restoOrderItems.status, 'ready')));
    if (!targets.length) {
      throw new RestoError('ITEM_NOT_SERVABLE', `Đơn ${order.code} chưa có món nào bếp báo xong (ready)`);
    }
  }

  await ctx.db.update(restoOrderItems)
    .set({ status: 'served', updatedAt: new Date() })
    .where(and(eq(restoOrderItems.orgId, ctx.orgId),
      inArray(restoOrderItems.id, targets.map((t) => t.id))));

  // KOT nào mọi món đã served → completed
  const kotIds = [...new Set(targets.map((t) => t.kotId).filter((v): v is string => Boolean(v)))];
  for (const kid of kotIds) {
    const remain = await ctx.db.select().from(restoOrderItems)
      .where(and(eq(restoOrderItems.orgId, ctx.orgId), eq(restoOrderItems.kotId, kid),
        inArray(restoOrderItems.status, ['sent', 'preparing', 'ready'])));
    if (!remain.length) {
      await ctx.db.update(restoKots)
        .set({ status: 'completed', doneAt: new Date(), updatedAt: new Date() })
        .where(and(eq(restoKots.orgId, ctx.orgId), eq(restoKots.id, kid),
          ne(restoKots.status, 'cancelled')));
    }
  }

  const served = targets.map((t) => ({ name: t.name, qty: fmtQty(t.qty) }));
  await ctx.bus.emit('resto.order.served', {
    org_id: ctx.orgId, order_code: order.code, items: served,
  });

  let deductionEmitted = false;
  const s = await getSettings(ctx);
  if (s.auto_deduct_stock && s.deduct_on === 'served') {
    const { lines, missing_recipe } = await expandDeductionLines(ctx,
      targets.map((t) => ({ menuItemId: t.menuItemId, name: t.name, qty: t.qty })));
    if (lines.length) {
      await ctx.bus.emit('resto.stock.deduct_requested', {
        org_id: ctx.orgId, order_code: order.code, trigger: 'served',
        reason: `Bán hàng ${order.code}`, lines, missing_recipe,
      });
      deductionEmitted = true;
    }
  }
  return { order_code: order.code, served, deduction_emitted: deductionEmitted };
}
