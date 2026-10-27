/**
 * SOUL-RESTAURANT — table.service
 * Khu vực + bàn + sơ đồ sàn. Resolve tên bàn "thân thiện tiếng Việt":
 * "5" khớp "Bàn 5", "bàn 5" khớp "5" — nhân viên nói sao hiểu vậy.
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { RestoCtx } from '../types.js';
import { RestoError } from '../types.js';
import { restoAreas, restoTables, restoOrders } from '../db/schema.js';
import { fmtVnd } from '../lib/money.js';

type TableRow = typeof restoTables.$inferSelect;

/** Tìm bàn theo tên, chịu được biến thể "5" ↔ "bàn 5" (case-insensitive) */
export async function findTableByName(ctx: RestoCtx, name: string): Promise<TableRow> {
  const q = name.trim().toLowerCase();
  const candidates = [q];
  if (q.startsWith('bàn ')) candidates.push(q.slice(4).trim());
  else if (q.startsWith('ban ')) candidates.push(q.slice(4).trim());
  else { candidates.push(`bàn ${q}`); candidates.push(`ban ${q}`); }

  for (const cand of candidates) {
    const rows = await ctx.db.select().from(restoTables)
      .where(and(eq(restoTables.orgId, ctx.orgId), sql`lower(${restoTables.name}) = ${cand}`))
      .limit(1);
    if (rows[0]) return rows[0];
  }
  throw new RestoError('TABLE_NOT_FOUND', `Không tìm thấy bàn "${name}"`);
}

async function ensureArea(ctx: RestoCtx, name: string): Promise<string> {
  const rows = await ctx.db.select().from(restoAreas)
    .where(and(eq(restoAreas.orgId, ctx.orgId), sql`lower(${restoAreas.name}) = ${name.trim().toLowerCase()}`))
    .limit(1);
  if (rows[0]) return rows[0].id;
  const inserted = await ctx.db.insert(restoAreas)
    .values({ orgId: ctx.orgId, name: name.trim() }).returning({ id: restoAreas.id });
  return inserted[0]!.id;
}

export interface TableUpsertInput {
  name: string;
  area?: string;
  capacity?: number;
  min_guests?: number;
  shape?: string;
  active?: boolean;
}

/** Tạo/sửa bàn theo tên; khu vực tự tạo nếu chưa có */
export async function upsertTable(ctx: RestoCtx, input: TableUpsertInput): Promise<{ id: string; name: string; area?: string; created: boolean }> {
  const areaId = input.area ? await ensureArea(ctx, input.area) : undefined;
  let existing: TableRow | undefined;
  try { existing = await findTableByName(ctx, input.name); } catch { /* chưa có → tạo mới */ }

  if (existing) {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (areaId !== undefined) set.areaId = areaId;
    if (input.capacity !== undefined) set.capacity = input.capacity;
    if (input.min_guests !== undefined) set.minGuests = input.min_guests;
    if (input.shape !== undefined) set.shape = input.shape;
    if (input.active !== undefined) set.active = input.active;
    await ctx.db.update(restoTables).set(set)
      .where(and(eq(restoTables.orgId, ctx.orgId), eq(restoTables.id, existing.id)));
    await ctx.bus.emit('resto.table.upserted', { org_id: ctx.orgId, table: existing.name, created: false });
    return { id: existing.id, name: existing.name, area: input.area, created: false };
  }

  const inserted = await ctx.db.insert(restoTables).values({
    orgId: ctx.orgId,
    name: input.name.trim(),
    areaId: areaId ?? null,
    capacity: input.capacity ?? 4,
    minGuests: input.min_guests ?? 1,
    shape: input.shape ?? 'square',
    active: input.active ?? true,
  }).returning({ id: restoTables.id, name: restoTables.name });
  await ctx.bus.emit('resto.table.upserted', { org_id: ctx.orgId, table: inserted[0]!.name, created: true });
  return { id: inserted[0]!.id, name: inserted[0]!.name, area: input.area, created: true };
}

export interface TableMapEntry {
  name: string;
  capacity: number;
  status: string;
  order_code?: string;
  order_total?: string;
  order_total_fmt?: string;
}

export interface TableMapView {
  counts: { available: number; occupied: number; reserved: number; cleaning: number; total: number };
  areas: Array<{ area: string; tables: TableMapEntry[] }>;
}

/** Sơ đồ sàn: bàn theo khu + trạng thái + đơn đang mở (mã & tạm tính) */
export async function tableMap(ctx: RestoCtx, input: { area?: string }): Promise<TableMapView> {
  const conds = [eq(restoTables.orgId, ctx.orgId), eq(restoTables.active, true)];
  if (input.area) {
    const areaRows = await ctx.db.select().from(restoAreas)
      .where(and(eq(restoAreas.orgId, ctx.orgId), sql`lower(${restoAreas.name}) = ${input.area.trim().toLowerCase()}`))
      .limit(1);
    if (!areaRows[0]) throw new RestoError('AREA_NOT_FOUND', `Không có khu vực "${input.area}"`);
    conds.push(eq(restoTables.areaId, areaRows[0].id));
  }

  const tables = await ctx.db.select().from(restoTables).where(and(...conds))
    .orderBy(asc(restoTables.name));

  const areaIds = [...new Set(tables.map((t) => t.areaId).filter((v): v is string => Boolean(v)))];
  const areas = areaIds.length
    ? await ctx.db.select().from(restoAreas)
        .where(and(eq(restoAreas.orgId, ctx.orgId), inArray(restoAreas.id, areaIds)))
    : [];
  const areaName = new Map(areas.map((a) => [a.id, a.name]));

  const orderIds = tables.map((t) => t.currentOrderId).filter((v): v is string => Boolean(v));
  const orders = orderIds.length
    ? await ctx.db.select({ id: restoOrders.id, code: restoOrders.code, grand: restoOrders.grandTotal })
        .from(restoOrders)
        .where(and(eq(restoOrders.orgId, ctx.orgId), inArray(restoOrders.id, orderIds)))
    : [];
  const orderById = new Map(orders.map((o) => [o.id, o]));

  const grouped = new Map<string, TableMapEntry[]>();
  const counts = { available: 0, occupied: 0, reserved: 0, cleaning: 0, total: 0 };
  for (const t of tables) {
    counts.total += 1;
    if (t.status === 'available') counts.available += 1;
    else if (t.status === 'occupied') counts.occupied += 1;
    else if (t.status === 'reserved') counts.reserved += 1;
    else if (t.status === 'cleaning') counts.cleaning += 1;

    const key = (t.areaId && areaName.get(t.areaId)) || 'Chưa phân khu';
    const entry: TableMapEntry = { name: t.name, capacity: t.capacity, status: t.status };
    const o = t.currentOrderId ? orderById.get(t.currentOrderId) : undefined;
    if (o) {
      entry.order_code = o.code;
      entry.order_total = o.grand;
      entry.order_total_fmt = fmtVnd(o.grand);
    }
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(entry);
  }

  return {
    counts,
    areas: [...grouped.entries()].map(([area, ts]) => ({ area, tables: ts })),
  };
}

/** Giải phóng bàn sau khi đơn đóng/hủy (auto_clean → 'cleaning') */
export async function releaseTable(ctx: RestoCtx, tableId: string, autoClean: boolean): Promise<void> {
  await ctx.db.update(restoTables).set({
    status: autoClean ? 'cleaning' : 'available',
    currentOrderId: null,
    updatedAt: new Date(),
  }).where(and(eq(restoTables.orgId, ctx.orgId), eq(restoTables.id, tableId)));
  await ctx.bus.emit('resto.table.updated', {
    org_id: ctx.orgId, table_id: tableId,
    status: autoClean ? 'cleaning' : 'available',
  });
}
