/**
 * SOUL-INVENTORY — lot.service
 * Quản lý lô hàng (lot) / số serial / hạn sử dụng.
 * Port ý tưởng inventory_lots của R9, viết lại theo chuẩn Soul-Inventory:
 *   - numeric giữ string, guard phía SQL
 *   - defense-in-depth: RLS + filter org_id tường minh
 *   - lot chỉ bắt buộc khi item bật track_lot / track_serial
 */
import { and, eq, isNotNull, lte, sql } from 'drizzle-orm';
import { khoLots } from '../db/schema.js';
import type { KhoCtx } from '../types.js';
import { KhoError } from '../types.js';

export interface LotRef {
  lot_no?: string;
  serial_no?: string;
  expiry_date?: string; // YYYY-MM-DD
}

/** Tìm-hoặc-tạo lot khi NHẬP kho (serial là duy nhất; lot_no tái sử dụng) */
export async function resolveOrCreateLot(
  ctx: KhoCtx,
  item: { id: string; sku: string; trackLot: boolean; trackSerial: boolean },
  ref: LotRef,
): Promise<{ id: string; lotNo: string | null; serialNo: string | null } | null> {
  const wantsLot = !!(ref.lot_no || ref.serial_no);
  if (!wantsLot) {
    if (item.trackLot || item.trackSerial) {
      throw new KhoError('LOT_REQUIRED',
        `Mặt hàng "${item.sku}" bật theo dõi ${item.trackSerial ? 'serial' : 'lô'} — cần cung cấp ${item.trackSerial ? 'serial_no' : 'lot_no'} khi nhập/xuất`,
        { sku: item.sku, track_lot: item.trackLot, track_serial: item.trackSerial });
    }
    return null;
  }

  // serial: mỗi serial một dòng duy nhất
  if (ref.serial_no) {
    const [existing] = await ctx.db.select().from(khoLots).where(and(
      eq(khoLots.orgId, ctx.orgId),
      eq(khoLots.itemId, item.id),
      eq(khoLots.serialNo, ref.serial_no),
    )).limit(1);
    if (existing) return existing;
    const [row] = await ctx.db.insert(khoLots).values({
      orgId: ctx.orgId, itemId: item.id,
      lotNo: ref.lot_no ?? null, serialNo: ref.serial_no,
      expiryDate: ref.expiry_date ?? null,
    }).returning();
    await ctx.bus.emit('kho.lot.created', {
      org_id: ctx.orgId, lot_id: row.id, item_id: item.id,
      serial_no: ref.serial_no,
    });
    return row;
  }

  // lot_no: tái sử dụng nếu đã có
  const [existing] = await ctx.db.select().from(khoLots).where(and(
    eq(khoLots.orgId, ctx.orgId),
    eq(khoLots.itemId, item.id),
    eq(khoLots.lotNo, ref.lot_no!),
    sql`${khoLots.serialNo} IS NULL`,
  )).limit(1);
  if (existing) return existing;

  const [row] = await ctx.db.insert(khoLots).values({
    orgId: ctx.orgId, itemId: item.id,
    lotNo: ref.lot_no!, serialNo: null,
    expiryDate: ref.expiry_date ?? null,
  }).returning();
  await ctx.bus.emit('kho.lot.created', {
    org_id: ctx.orgId, lot_id: row.id, item_id: item.id, lot_no: ref.lot_no,
  });
  return row;
}

/** Tra lot theo lot_no/serial_no khi XUẤT — phải tồn tại, không tự tạo */
export async function findLot(
  ctx: KhoCtx,
  itemId: string,
  ref: LotRef,
): Promise<{ id: string } | null> {
  if (!ref.lot_no && !ref.serial_no) return null;
  const conds = [eq(khoLots.orgId, ctx.orgId), eq(khoLots.itemId, itemId)];
  if (ref.serial_no) conds.push(eq(khoLots.serialNo, ref.serial_no));
  else conds.push(eq(khoLots.lotNo, ref.lot_no!), sql`${khoLots.serialNo} IS NULL`);
  const [row] = await ctx.db.select().from(khoLots).where(and(...conds)).limit(1);
  if (!row) {
    throw new KhoError('LOT_NOT_FOUND',
      `Không tìm thấy ${ref.serial_no ? `serial "${ref.serial_no}"` : `lô "${ref.lot_no}"`} của mặt hàng này`,
      { lot_no: ref.lot_no, serial_no: ref.serial_no });
  }
  return row;
}

/** Danh sách lô sắp hết hạn trong N ngày tới (mặc định 30) — kèm tồn còn lại */
export async function expiryAlerts(ctx: KhoCtx, withinDays = 30, limit = 50) {
  const rows = await ctx.db.execute<{
    lot_id: string; sku: string; name: string; lot_no: string | null;
    serial_no: string | null; expiry_date: string; days_left: number; stocked: string;
  }>(sql`
    SELECT l.id AS lot_id, i.sku, i.name, l.lot_no, l.serial_no,
           l.expiry_date::text AS expiry_date,
           (l.expiry_date - CURRENT_DATE) AS days_left,
           COALESCE(sum(s.stocked - s.reserved), 0)::text AS stocked
    FROM kho_lots l
    JOIN kho_items i ON i.id = l.item_id AND i.org_id = ${ctx.orgId}
    LEFT JOIN kho_stock_levels s ON s.lot_id = l.id AND s.org_id = ${ctx.orgId}
    WHERE l.org_id = ${ctx.orgId}
      AND l.expiry_date IS NOT NULL
      AND l.status = 'active'
      AND l.expiry_date <= CURRENT_DATE + ${withinDays}::int
    GROUP BY l.id, i.sku, i.name, l.lot_no, l.serial_no, l.expiry_date
    HAVING COALESCE(sum(s.stocked - s.reserved), 0) > 0
    ORDER BY l.expiry_date ASC
    LIMIT ${limit}
  `);
  const list = ('rows' in rows ? (rows as unknown as { rows: unknown[] }).rows : rows) as Array<Record<string, unknown>>;
  return list;
}
