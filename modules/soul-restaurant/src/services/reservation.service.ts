/**
 * SOUL-RESTAURANT — reservation.service
 * Đặt bàn: create (check trùng khung giờ cùng bàn) → confirm → seat (mở đơn
 * luôn nếu có bàn) | cancel | no_show.
 * v1 KHÔNG tự đổi table.status theo lịch đặt (walk-in vẫn mở bàn được) —
 * ghi rõ trong GUIDE §Giới hạn; v1.1 sẽ có auto-hold trước giờ đặt.
 */
import { and, asc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { RestoCtx } from '../types.js';
import { RestoError } from '../types.js';
import { restoReservations, restoTables, restoAreas, restoOrders } from '../db/schema.js';
import { findTableByName } from './table.service.js';
import { openOrder } from './order.service.js';
import { genCode } from '../lib/codes.js';

export interface ReservationManageInput {
  op: 'create' | 'confirm' | 'seat' | 'cancel' | 'no_show';
  code?: string;
  customer_name?: string;
  phone?: string;
  party_size?: number;
  table?: string;
  area?: string;
  at?: string;
  duration_min?: number;
  note?: string;
}

async function findReservation(ctx: RestoCtx, code: string) {
  const rows = await ctx.db.select().from(restoReservations)
    .where(and(eq(restoReservations.orgId, ctx.orgId),
      sql`lower(${restoReservations.code}) = ${code.trim().toLowerCase()}`)).limit(1);
  if (!rows[0]) throw new RestoError('RESERVATION_NOT_FOUND', `Không tìm thấy đặt bàn "${code}"`);
  return rows[0];
}

/** Một action gộp: create | confirm | seat | cancel | no_show */
export async function manageReservation(ctx: RestoCtx, input: ReservationManageInput): Promise<{
  code: string; status: string; customer_name: string; at: string;
  table: string | null; party_size: number; order_code?: string; warning?: string;
}> {
  // ───────────── CREATE ─────────────
  if (input.op === 'create') {
    const at = new Date(input.at!);
    if (Number.isNaN(at.getTime())) {
      throw new RestoError('INVALID_INPUT', `Thời gian "${input.at}" không hợp lệ — dùng ISO 8601, ví dụ 2026-07-06T19:00:00+07:00`);
    }
    const duration = input.duration_min ?? 90;
    let tableId: string | null = null;
    let tableName: string | null = null;
    let warning: string | undefined;

    if (input.table) {
      const table = await findTableByName(ctx, input.table);
      tableId = table.id;
      tableName = table.name;
      // Trùng khung giờ cùng bàn (đặt còn hiệu lực): [at, at+duration) giao nhau
      const end = new Date(at.getTime() + duration * 60000);
      const conflicts = await ctx.db.select().from(restoReservations)
        .where(and(
          eq(restoReservations.orgId, ctx.orgId),
          eq(restoReservations.tableId, table.id),
          inArray(restoReservations.status, ['pending', 'confirmed', 'seated']),
          sql`${restoReservations.reservedAt} < ${end.toISOString()}::timestamptz`,
          sql`${restoReservations.reservedAt} + (${restoReservations.durationMin} || ' minutes')::interval > ${at.toISOString()}::timestamptz`,
        ));
      if (conflicts.length) {
        throw new RestoError('RESERVATION_CONFLICT',
          `Bàn "${table.name}" đã có đặt trùng khung giờ (${conflicts.map((c) => `${c.code} lúc ${c.reservedAt.toISOString()}`).join('; ')})`);
      }
      if (input.party_size && input.party_size > table.capacity) {
        warning = `Lưu ý: đoàn ${input.party_size} khách > sức chứa bàn ${table.name} (${table.capacity} chỗ)`;
      }
    }

    const code = genCode('RSV');
    await ctx.db.insert(restoReservations).values({
      orgId: ctx.orgId, code,
      customerName: input.customer_name!,
      phone: input.phone ?? null,
      status: 'pending',
      partySize: input.party_size ?? 2,
      tableId,
      reservedAt: at,
      durationMin: duration,
      note: input.note ?? null,
    });
    await ctx.bus.emit('resto.reservation.created', {
      org_id: ctx.orgId, code, customer: input.customer_name,
      at: at.toISOString(), table: tableName, party_size: input.party_size ?? 2,
    });
    return {
      code, status: 'pending', customer_name: input.customer_name!,
      at: at.toISOString(), table: tableName, party_size: input.party_size ?? 2, warning,
    };
  }

  // ───────────── CONFIRM / SEAT / CANCEL / NO_SHOW ─────────────
  const rsv = await findReservation(ctx, input.code!);
  let tableName: string | null = null;
  if (rsv.tableId) {
    const t = await ctx.db.select().from(restoTables)
      .where(and(eq(restoTables.orgId, ctx.orgId), eq(restoTables.id, rsv.tableId))).limit(1);
    tableName = t[0]?.name ?? null;
  }

  if (input.op === 'confirm') {
    if (rsv.status !== 'pending') {
      throw new RestoError('INVALID_STATUS_FLOW', `Đặt bàn ${rsv.code} đang "${rsv.status}" — chỉ xác nhận được khi pending`);
    }
    await ctx.db.update(restoReservations)
      .set({ status: 'confirmed', updatedAt: new Date() })
      .where(and(eq(restoReservations.orgId, ctx.orgId), eq(restoReservations.id, rsv.id)));
    await ctx.bus.emit('resto.reservation.updated', { org_id: ctx.orgId, code: rsv.code, status: 'confirmed' });
    return { code: rsv.code, status: 'confirmed', customer_name: rsv.customerName, at: rsv.reservedAt.toISOString(), table: tableName, party_size: rsv.partySize };
  }

  if (input.op === 'seat') {
    if (rsv.status !== 'pending' && rsv.status !== 'confirmed') {
      throw new RestoError('INVALID_STATUS_FLOW', `Đặt bàn ${rsv.code} đang "${rsv.status}" — không nhận khách được`);
    }
    // Cho phép đổi bàn ngay lúc nhận khách ("khách tới, xếp bàn 7 thay vì bàn 5")
    let seatTableName = tableName;
    let seatTableId = rsv.tableId;
    if (input.table) {
      const t = await findTableByName(ctx, input.table);
      seatTableId = t.id;
      seatTableName = t.name;
    }
    if (!seatTableName) {
      throw new RestoError('INVALID_INPUT', `Đặt bàn ${rsv.code} chưa gắn bàn — truyền "table" khi nhận khách`);
    }
    const opened = await openOrder(ctx, {
      type: 'dine_in', table: seatTableName,
      guests: rsv.partySize, customer_name: rsv.customerName,
      customer_phone: rsv.phone ?? undefined,
      note: rsv.note ? `Đặt bàn ${rsv.code}: ${rsv.note}` : `Đặt bàn ${rsv.code}`,
    });
    const orderRows = await ctx.db.select().from(restoOrders)
      .where(and(eq(restoOrders.orgId, ctx.orgId),
        sql`lower(${restoOrders.code}) = ${opened.order_code.toLowerCase()}`)).limit(1);
    await ctx.db.update(restoReservations).set({
      status: 'seated', tableId: seatTableId,
      orderId: orderRows[0]?.id ?? null, updatedAt: new Date(),
    }).where(and(eq(restoReservations.orgId, ctx.orgId), eq(restoReservations.id, rsv.id)));
    await ctx.bus.emit('resto.reservation.updated', {
      org_id: ctx.orgId, code: rsv.code, status: 'seated', order_code: opened.order_code,
    });
    return {
      code: rsv.code, status: 'seated', customer_name: rsv.customerName,
      at: rsv.reservedAt.toISOString(), table: seatTableName,
      party_size: rsv.partySize, order_code: opened.order_code,
    };
  }

  // cancel | no_show
  if (rsv.status === 'seated') {
    throw new RestoError('INVALID_STATUS_FLOW', `Đặt bàn ${rsv.code} đã nhận khách — xử lý qua đơn hàng thay vì hủy đặt`);
  }
  if (rsv.status === 'cancelled' || rsv.status === 'no_show') {
    throw new RestoError('INVALID_STATUS_FLOW', `Đặt bàn ${rsv.code} đã "${rsv.status}" rồi`);
  }
  const newStatus = input.op === 'cancel' ? 'cancelled' : 'no_show';
  await ctx.db.update(restoReservations)
    .set({ status: newStatus, note: input.note ?? rsv.note, updatedAt: new Date() })
    .where(and(eq(restoReservations.orgId, ctx.orgId), eq(restoReservations.id, rsv.id)));
  await ctx.bus.emit('resto.reservation.updated', { org_id: ctx.orgId, code: rsv.code, status: newStatus });
  return { code: rsv.code, status: newStatus, customer_name: rsv.customerName, at: rsv.reservedAt.toISOString(), table: tableName, party_size: rsv.partySize };
}

/** Danh sách đặt bàn trong khoảng [date, date + days). */
export async function listReservations(ctx: RestoCtx, input: { date?: string; days: number; include_done: boolean }): Promise<{
  total: number;
  reservations: Array<{
    code: string; status: string; customer_name: string; phone: string | null;
    party_size: number; at: string; duration_min: number;
    table: string | null; area: string | null; note: string | null;
  }>;
}> {
  const startStr = input.date ?? new Date().toISOString().slice(0, 10);
  const start = new Date(`${startStr}T00:00:00`);
  if (Number.isNaN(start.getTime())) throw new RestoError('INVALID_INPUT', `Ngày "${input.date}" không hợp lệ (YYYY-MM-DD)`);
  const end = new Date(start.getTime() + input.days * 86400000);

  const conds = [
    eq(restoReservations.orgId, ctx.orgId),
    gte(restoReservations.reservedAt, start),
    lt(restoReservations.reservedAt, end),
  ];
  if (!input.include_done) {
    conds.push(inArray(restoReservations.status, ['pending', 'confirmed', 'seated']));
  }
  const rows = await ctx.db.select().from(restoReservations).where(and(...conds))
    .orderBy(asc(restoReservations.reservedAt));

  const tableIds = [...new Set(rows.map((r) => r.tableId).filter((v): v is string => Boolean(v)))];
  const tables = tableIds.length
    ? await ctx.db.select().from(restoTables)
        .where(and(eq(restoTables.orgId, ctx.orgId), inArray(restoTables.id, tableIds)))
    : [];
  const tById = new Map(tables.map((t) => [t.id, t]));
  const areaIds = [...new Set(tables.map((t) => t.areaId).filter((v): v is string => Boolean(v)))];
  const areas = areaIds.length
    ? await ctx.db.select().from(restoAreas)
        .where(and(eq(restoAreas.orgId, ctx.orgId), inArray(restoAreas.id, areaIds)))
    : [];
  const aName = new Map(areas.map((a) => [a.id, a.name]));

  return {
    total: rows.length,
    reservations: rows.map((r) => {
      const t = r.tableId ? tById.get(r.tableId) : undefined;
      return {
        code: r.code, status: r.status, customer_name: r.customerName,
        phone: r.phone, party_size: r.partySize,
        at: r.reservedAt.toISOString(), duration_min: r.durationMin,
        table: t?.name ?? null,
        area: t?.areaId ? (aName.get(t.areaId) ?? null) : null,
        note: r.note,
      };
    }),
  };
}
