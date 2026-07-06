/**
 * SOUL-INVENTORY v2.0 — picking.service
 * Removal strategy theo pattern Odoo (đơn giản hóa):
 *   - FEFO (First-Expired-First-Out): hàng có hạn dùng — xuất lô cận hạn trước
 *   - FIFO (First-In-First-Out): mặc định — xuất lô nhập trước
 * pickingSuggestion KHÔNG ghi DB — chỉ trả kế hoạch xuất từng lô để
 * Tiểu Tâm đọc cho người dùng xác nhận, rồi issue từng dòng theo lot_no.
 * Đây là tầng "trí tuệ xuất kho" đặt TRƯỚC kho.stock.issue.
 */
import { sql } from 'drizzle-orm';
import type { KhoCtx } from '../types.js';
import { KhoError } from '../types.js';
import { getItemBySku, resolveLocation } from './catalog.service.js';

export interface PickPlanLine {
  lot_id: string | null;
  lot_no: string | null;
  serial_no: string | null;
  expiry_date: string | null;
  available: string;
  take: string;
}

/**
 * Lập kế hoạch xuất `quantity` của `sku` tại `location_code` theo strategy.
 * Trả về danh sách lô + lượng lấy từng lô; báo thiếu nếu tổng không đủ.
 */
export async function pickingSuggestion(ctx: KhoCtx, input: {
  sku: string; quantity: string; location_code?: string;
  strategy?: 'fefo' | 'fifo';
}): Promise<{
  sku: string; name: string; unit: string; location: string;
  strategy: string; requested: string; plan: PickPlanLine[];
  fulfilled: string; shortage: string;
}> {
  const item = await getItemBySku(ctx, input.sku);
  const loc = await resolveLocation(ctx, input.location_code);
  const strategy = input.strategy
    ?? ((item.trackLot || item.trackSerial) ? 'fefo' : 'fifo');

  // Lấy mọi level còn khả dụng của item tại location, join lot để biết hạn/ngày nhập.
  // FEFO: expiry NULLS LAST rồi received_at; FIFO: received_at (level không lot xếp theo level.created_at)
  const orderBy = strategy === 'fefo'
    ? sql`l.expiry_date ASC NULLS LAST, coalesce(l.received_at, s.created_at) ASC`
    : sql`coalesce(l.received_at, s.created_at) ASC`;

  const res = await ctx.db.execute<{
    lot_id: string | null; lot_no: string | null; serial_no: string | null;
    expiry_date: string | null; available: string;
  }>(sql`
    SELECT s.lot_id, l.lot_no, l.serial_no,
           l.expiry_date::text AS expiry_date,
           (s.stocked - s.reserved)::text AS available
    FROM kho_stock_levels s
    LEFT JOIN kho_lots l ON l.id = s.lot_id AND l.org_id = ${ctx.orgId}
    WHERE s.org_id = ${ctx.orgId}
      AND s.item_id = ${item.id}
      AND s.location_id = ${loc.id}
      AND s.stocked - s.reserved > 0
      AND (l.id IS NULL OR l.status = 'active')
    ORDER BY ${orderBy}
  `);
  const rows = ('rows' in res ? (res as unknown as { rows: unknown[] }).rows : res) as Array<{
    lot_id: string | null; lot_no: string | null; serial_no: string | null;
    expiry_date: string | null; available: string;
  }>;

  if (rows.length === 0) {
    throw new KhoError('INSUFFICIENT_STOCK',
      `Không có tồn khả dụng của "${item.name}" tại ${loc.code}`,
      { sku: item.sku, location_code: loc.code, requested: input.quantity });
  }

  // Phân bổ greedy phía SQL-safe: dùng số học JS CHỈ cho lập kế hoạch hiển thị
  // (kế hoạch được xác nhận rồi mới issue thật — issue có guard SQL riêng).
  const plan: PickPlanLine[] = [];
  let remaining = Number.parseFloat(input.quantity);
  for (const r of rows) {
    if (remaining <= 0) break;
    const avail = Number.parseFloat(r.available);
    const take = Math.min(avail, remaining);
    remaining = Number((remaining - take).toFixed(3));
    plan.push({
      lot_id: r.lot_id, lot_no: r.lot_no, serial_no: r.serial_no,
      expiry_date: r.expiry_date, available: r.available,
      take: String(take),
    });
  }

  const fulfilled = Number(
    (Number.parseFloat(input.quantity) - remaining).toFixed(3));

  return {
    sku: item.sku, name: item.name, unit: item.unit, location: loc.code,
    strategy: strategy.toUpperCase(), requested: input.quantity,
    plan,
    fulfilled: String(fulfilled),
    shortage: String(remaining > 0 ? remaining : 0),
  };
}
