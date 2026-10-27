/**
 * SOUL-RESTAURANT — order.service
 * Vòng đời đơn: open → (gọi món/gửi bếp/phục vụ) → tính tiền → paid | cancelled.
 * Máy tính tiền (totals engine) — MỘT nguồn công thức duy nhất:
 *   line       = (đơn_giá + Σ option) × qty            [round half-up scale 2]
 *   subtotal   = Σ line (món chưa hủy)
 *   discount   = amount (cap ≤ subtotal) | percent × subtotal
 *   base       = subtotal − discount
 *   service    = base × service_charge_pct
 *   Giá GỘP thuế (mặc định VN):  gross = base + service; tax = gross×r/(100+r); grand = gross
 *   Giá CỘNG ngoài:              tax = (base+service)×r/100; grand = base + service + tax
 */
import { and, asc, eq, inArray, ne, sql, count as sqlCount } from 'drizzle-orm';
import type { RestoCtx } from '../types.js';
import { RestoError } from '../types.js';
import {
  restoOrders, restoOrderItems, restoTables, restoKots, restoBills,
  restoPromotions, restoPromoRedemptions,
  type OptionSnapshot,
} from '../db/schema.js';
import { findTableByName, releaseTable } from './table.service.js';
import { resolveMenuItem, loadItemOptionGroups } from './catalog.service.js';
import { resolveOrCreateCustomer } from './customer.service.js';
import { getSettings } from './settings.service.js';
import { genCode } from '../lib/codes.js';
import { d2, d3, f2, f3, p2, fmtVnd, fmtQty, mulPriceQty, pctOf, taxFromGross, taxOnNet, minBig } from '../lib/money.js';

type OrderRow = typeof restoOrders.$inferSelect;
type OrderItemRow = typeof restoOrderItems.$inferSelect;

export interface OrderRef { order_code?: string; table?: string }

/** Tìm đơn theo mã hoặc theo bàn (đơn đang gắn với bàn). */
export async function resolveOrder(ctx: RestoCtx, ref: OrderRef, opts: { mustOpen?: boolean } = {}): Promise<OrderRow> {
  let order: OrderRow | undefined;
  if (ref.order_code) {
    const rows = await ctx.db.select().from(restoOrders)
      .where(and(eq(restoOrders.orgId, ctx.orgId),
        sql`lower(${restoOrders.code}) = ${ref.order_code.trim().toLowerCase()}`)).limit(1);
    order = rows[0];
    if (!order) throw new RestoError('ORDER_NOT_FOUND', `Không tìm thấy đơn "${ref.order_code}"`);
  } else if (ref.table) {
    const table = await findTableByName(ctx, ref.table);
    if (!table.currentOrderId) {
      throw new RestoError('ORDER_NOT_FOUND', `Bàn "${table.name}" chưa có đơn nào đang mở`, { table: table.name });
    }
    const rows = await ctx.db.select().from(restoOrders)
      .where(and(eq(restoOrders.orgId, ctx.orgId), eq(restoOrders.id, table.currentOrderId))).limit(1);
    order = rows[0];
    if (!order) throw new RestoError('ORDER_NOT_FOUND', `Bàn "${table.name}" chưa có đơn nào đang mở`);
  } else {
    throw new RestoError('INVALID_INPUT', 'Cần order_code hoặc table');
  }
  if (opts.mustOpen !== false && order.status !== 'open') {
    throw new RestoError('ORDER_NOT_OPEN', `Đơn ${order.code} đã ${order.status === 'paid' ? 'thanh toán xong' : 'hủy'}`);
  }
  return order;
}

export interface OpenOrderInput {
  table?: string;
  type: 'dine_in' | 'takeaway' | 'delivery';
  guests?: number;
  customer_name?: string;
  customer_phone?: string;
  note?: string;
}

/** Mở đơn: dine_in gắn bàn (bàn → occupied), takeaway/delivery không cần bàn */
export async function openOrder(ctx: RestoCtx, input: OpenOrderInput): Promise<{
  order_code: string; type: string; table?: string; guests: number;
}> {
  let tableId: string | null = null;
  let tableName: string | undefined;

  if (input.type === 'dine_in') {
    const table = await findTableByName(ctx, input.table!);
    if (!table.active) throw new RestoError('TABLE_INACTIVE', `Bàn "${table.name}" đang ngưng sử dụng`);
    if (table.status === 'occupied') {
      throw new RestoError('TABLE_BUSY', `Bàn "${table.name}" đang có khách — muốn gọi thêm món thì dùng đơn hiện tại`, { table: table.name, current_order_id: table.currentOrderId });
    }
    if (table.status === 'cleaning') {
      throw new RestoError('TABLE_BUSY', `Bàn "${table.name}" đang dọn dẹp — đổi trạng thái bàn trước khi mở`);
    }
    tableId = table.id;
    tableName = table.name;
  }

  // v1.1 — có SĐT thì gắn khách thân thiết (tạo hồ sơ nếu chưa có)
  let customerId: string | null = null;
  if (input.customer_phone && input.customer_phone.replace(/[^\d+]/g, '').length >= 6) {
    const c = await resolveOrCreateCustomer(ctx, input.customer_phone, input.customer_name);
    customerId = c.id;
  }

  const code = genCode('DH');
  const inserted = await ctx.db.insert(restoOrders).values({
    orgId: ctx.orgId,
    code,
    type: input.type,
    tableId,
    guests: input.guests ?? 0,
    customerName: input.customer_name ?? null,
    customerPhone: input.customer_phone ?? null,
    customerId,
    note: input.note ?? null,
    openedBy: ctx.userId ?? null,
  }).returning({ id: restoOrders.id });

  if (tableId) {
    await ctx.db.update(restoTables)
      .set({ status: 'occupied', currentOrderId: inserted[0]!.id, updatedAt: new Date() })
      .where(and(eq(restoTables.orgId, ctx.orgId), eq(restoTables.id, tableId)));
  }

  await ctx.bus.emit('resto.order.opened', {
    org_id: ctx.orgId, order_code: code, type: input.type,
    table: tableName ?? null, guests: input.guests ?? 0,
  });
  return { order_code: code, type: input.type, table: tableName, guests: input.guests ?? 0 };
}

export interface OrderTotals {
  subtotal: string; discount_total: string; service_charge: string;
  tax_total: string; grand_total: string;
}

/** Tính lại & lưu totals của đơn từ items + settings — nguồn số duy nhất. */
export async function computeAndStoreTotals(ctx: RestoCtx, orderId: string): Promise<OrderTotals> {
  const orders = await ctx.db.select().from(restoOrders)
    .where(and(eq(restoOrders.orgId, ctx.orgId), eq(restoOrders.id, orderId))).limit(1);
  const order = orders[0];
  if (!order) throw new RestoError('ORDER_NOT_FOUND', 'Đơn không tồn tại');

  const items = await ctx.db.select().from(restoOrderItems)
    .where(and(eq(restoOrderItems.orgId, ctx.orgId),
      eq(restoOrderItems.orderId, orderId), ne(restoOrderItems.status, 'cancelled')));

  let subtotal = 0n;
  for (const it of items) subtotal += d2(it.lineTotal);

  let manualDiscount = 0n;
  if (order.discountType === 'amount' && order.discountValue) {
    manualDiscount = minBig(d2(order.discountValue), subtotal);
  } else if (order.discountType === 'percent' && order.discountValue) {
    manualDiscount = pctOf(subtotal, p2(order.discountValue));
  }

  // v1.1 — khuyến mãi: tính lại từ định nghĩa promo (tự sửa khi món thay đổi).
  // Dưới ngưỡng min_subtotal hiện tại → promo tạm 0 (không xóa gắn kết).
  let promoDiscount = 0n;
  if (order.promoId) {
    const pr = await ctx.db.select().from(restoPromotions)
      .where(and(eq(restoPromotions.orgId, ctx.orgId), eq(restoPromotions.id, order.promoId))).limit(1);
    const promo = pr[0];
    if (promo && promo.active && d2(promo.minSubtotal) <= subtotal) {
      if (promo.discountType === 'percent') {
        promoDiscount = pctOf(subtotal, p2(promo.value));
        if (promo.maxDiscount != null) promoDiscount = minBig(promoDiscount, d2(promo.maxDiscount));
      } else {
        promoDiscount = minBig(d2(promo.value), subtotal);
      }
    }
  }

  const discount = minBig(manualDiscount + promoDiscount, subtotal);

  const s = await getSettings(ctx);
  const base = subtotal - discount;
  const service = pctOf(base, p2(s.service_charge_pct));
  const taxRate = p2(s.tax_pct);
  let tax: bigint; let grand: bigint;
  if (s.price_includes_tax) {
    const gross = base + service;
    tax = taxFromGross(gross, taxRate);
    grand = gross;
  } else {
    const net = base + service;
    tax = taxOnNet(net, taxRate);
    grand = net + tax;
  }

  const totals: OrderTotals = {
    subtotal: f2(subtotal), discount_total: f2(discount),
    service_charge: f2(service), tax_total: f2(tax), grand_total: f2(grand),
  };
  await ctx.db.update(restoOrders).set({
    subtotal: totals.subtotal, discountTotal: totals.discount_total,
    promoDiscount: f2(promoDiscount),
    serviceCharge: totals.service_charge, taxTotal: totals.tax_total,
    grandTotal: totals.grand_total, updatedAt: new Date(),
  }).where(and(eq(restoOrders.orgId, ctx.orgId), eq(restoOrders.id, orderId)));
  return totals;
}

export interface AddItemsInput {
  order_code?: string; table?: string;
  items: Array<{ name?: string; sku?: string; qty: string; options?: string[]; note?: string; course?: number }>;
}

/** Gọi món: resolve tên món + tùy chọn, snapshot giá, cộng totals. */
export async function addItems(ctx: RestoCtx, input: AddItemsInput): Promise<{
  order_code: string;
  added: Array<{ name: string; qty: string; options: string[]; line_total: string; line_total_fmt: string }>;
  totals: OrderTotals;
}> {
  const order = await resolveOrder(ctx, input);
  const added: Array<{ name: string; qty: string; options: string[]; line_total: string; line_total_fmt: string }> = [];

  for (const line of input.items) {
    const item = await resolveMenuItem(ctx, { name: line.name, sku: line.sku }, { forOrder: true });
    const groups = await loadItemOptionGroups(ctx, item.id);

    // ── Resolve tùy chọn theo tên trong các nhóm gắn với món ──
    const chosen: OptionSnapshot[] = [];
    const chosenPerGroup = new Map<string, number>();
    for (const optName of line.options ?? []) {
      const q = optName.trim().toLowerCase();
      const matches: Array<{ group: LoadedGroup; choice: { name: string; priceDelta: string } }> = [];
      for (const g of groups) {
        for (const c of g.choices) {
          if (c.name.toLowerCase() === q) matches.push({ group: g, choice: c });
        }
      }
      if (!matches.length) {
        const available = groups.flatMap((g) => g.choices.map((c) => c.name)).slice(0, 12);
        throw new RestoError('OPTION_INVALID',
          `Món "${item.name}" không có tùy chọn "${optName}"${available.length ? `. Có thể chọn: ${available.join(', ')}` : ' (món này không có tùy chọn)'}`);
      }
      if (matches.length > 1) {
        throw new RestoError('OPTION_INVALID',
          `Tùy chọn "${optName}" xuất hiện ở nhiều nhóm (${matches.map((m) => m.group.name).join(', ')}) — nói rõ hơn nhé`);
      }
      const m = matches[0]!;
      const cnt = (chosenPerGroup.get(m.group.id) ?? 0) + 1;
      if (cnt > m.group.maxSelect) {
        throw new RestoError('OPTION_INVALID',
          `Nhóm "${m.group.name}" chọn tối đa ${m.group.maxSelect} — đang chọn ${cnt}`);
      }
      chosenPerGroup.set(m.group.id, cnt);
      chosen.push({ group: m.group.name, name: m.choice.name, price_delta: m.choice.priceDelta });
    }
    for (const g of groups) {
      const need = g.required ? Math.max(1, g.minSelect) : g.minSelect;
      const got = chosenPerGroup.get(g.id) ?? 0;
      if (got < need) {
        throw new RestoError('OPTION_INVALID',
          `Món "${item.name}" bắt buộc chọn ${need} trong nhóm "${g.name}": ${g.choices.map((c) => c.name).join(', ')}`);
      }
    }

    let optionsTotal = 0n;
    for (const c of chosen) optionsTotal += d2(c.price_delta);
    const qty3 = d3(line.qty);
    const lineTotal = mulPriceQty(d2(item.price) + optionsTotal, qty3);

    await ctx.db.insert(restoOrderItems).values({
      orgId: ctx.orgId,
      orderId: order.id,
      menuItemId: item.id,
      stationId: item.stationId ?? null,
      name: item.name,
      unitPrice: item.price,
      qty: f3(qty3),
      options: chosen,
      optionsTotal: f2(optionsTotal),
      lineTotal: f2(lineTotal),
      courseNo: line.course ?? 1,
      note: line.note ?? null,
    });

    added.push({
      name: item.name, qty: fmtQty(qty3),
      options: chosen.map((c) => c.name),
      line_total: f2(lineTotal), line_total_fmt: fmtVnd(lineTotal),
    });
  }

  const totals = await computeAndStoreTotals(ctx, order.id);
  await ctx.bus.emit('resto.order.items_added', {
    org_id: ctx.orgId, order_code: order.code,
    items: added.map((a) => ({ name: a.name, qty: a.qty, options: a.options })),
  });
  return { order_code: order.code, added, totals };
}
type LoadedGroup = Awaited<ReturnType<typeof loadItemOptionGroups>>[number];

/** Món đã nằm trong bill còn hiệu lực (unpaid/paid) thì không đụng được nữa */
async function billedItemIds(ctx: RestoCtx, orderId: string): Promise<Set<string>> {
  const rows = await ctx.db.execute(sql`
    SELECT bi.order_item_id AS oid
    FROM resto_bill_items bi
    JOIN resto_bills b ON b.id = bi.bill_id AND b.org_id = ${ctx.orgId} AND b.status <> 'void'
    WHERE bi.org_id = ${ctx.orgId} AND b.order_id = ${orderId}`);
  const list = (rows as unknown as { rows?: Array<{ oid: string }> }).rows ?? (rows as unknown as Array<{ oid: string }>);
  return new Set(list.map((r) => r.oid));
}
export { billedItemIds };

export interface CancelItemInput { order_code?: string; table?: string; item: string; reason: string }

/** Hủy 1 dòng món (kèm lý do). Món đã phục vụ/đã vào bill → không hủy được. */
export async function cancelItem(ctx: RestoCtx, input: CancelItemInput): Promise<{
  order_code: string; item: string; qty: string; was_sent: boolean; totals: OrderTotals;
}> {
  const order = await resolveOrder(ctx, input);
  const q = input.item.trim().toLowerCase();
  const items = await ctx.db.select().from(restoOrderItems)
    .where(and(eq(restoOrderItems.orgId, ctx.orgId), eq(restoOrderItems.orderId, order.id),
      ne(restoOrderItems.status, 'cancelled'), sql`lower(${restoOrderItems.name}) = ${q}`))
    .orderBy(asc(restoOrderItems.createdAt));
  if (!items.length) {
    throw new RestoError('ORDER_ITEM_NOT_FOUND', `Đơn ${order.code} không có món "${input.item}" (chưa hủy)`);
  }
  // Ưu tiên hủy dòng CHƯA gửi bếp trước — đỡ phí đồ đang nấu
  const target = items.find((i) => i.status === 'pending') ?? items[0]!;
  if (target.status === 'served') {
    throw new RestoError('ITEM_NOT_CANCELLABLE', `Món "${target.name}" đã phục vụ — muốn bỏ khỏi bill thì void bill rồi tính lại`);
  }
  const billed = await billedItemIds(ctx, order.id);
  if (billed.has(target.id)) {
    throw new RestoError('ITEMS_ALREADY_BILLED', `Món "${target.name}" đã nằm trong bill — void bill trước rồi hủy món`);
  }

  const wasSent = target.status !== 'pending';
  await ctx.db.update(restoOrderItems)
    .set({ status: 'cancelled', cancelReason: input.reason, updatedAt: new Date() })
    .where(and(eq(restoOrderItems.orgId, ctx.orgId), eq(restoOrderItems.id, target.id)));

  // KOT chỉ còn món hủy → hủy luôn KOT
  if (target.kotId) {
    const remain = await ctx.db.select().from(restoOrderItems)
      .where(and(eq(restoOrderItems.orgId, ctx.orgId), eq(restoOrderItems.kotId, target.kotId),
        ne(restoOrderItems.status, 'cancelled')));
    if (!remain.length) {
      await ctx.db.update(restoKots)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(and(eq(restoKots.orgId, ctx.orgId), eq(restoKots.id, target.kotId)));
    }
  }

  const totals = await computeAndStoreTotals(ctx, order.id);
  await ctx.bus.emit('resto.order.item_cancelled', {
    org_id: ctx.orgId, order_code: order.code, item: target.name,
    qty: fmtQty(target.qty), reason: input.reason, was_sent: wasSent,
  });
  return { order_code: order.code, item: target.name, qty: fmtQty(target.qty), was_sent: wasSent, totals };
}

export interface DiscountInput {
  order_code?: string; table?: string;
  discount_type: 'amount' | 'percent'; value: string; reason?: string;
}

/** Áp giảm giá mức đơn (amount cap ≤ subtotal | percent ≤ 100). */
export async function applyDiscount(ctx: RestoCtx, input: DiscountInput): Promise<{
  order_code: string; totals: OrderTotals;
}> {
  const order = await resolveOrder(ctx, input);
  await ctx.db.update(restoOrders).set({
    discountType: input.discount_type,
    discountValue: input.value,
    discountReason: input.reason ?? null,
    updatedAt: new Date(),
  }).where(and(eq(restoOrders.orgId, ctx.orgId), eq(restoOrders.id, order.id)));
  const totals = await computeAndStoreTotals(ctx, order.id);
  await ctx.bus.emit('resto.order.discounted', {
    org_id: ctx.orgId, order_code: order.code,
    discount_type: input.discount_type, value: input.value,
    discount_total: totals.discount_total, reason: input.reason ?? null,
  });
  return { order_code: order.code, totals };
}

/** Chuyển đơn sang bàn khác (bàn đích phải trống). */
export async function moveTable(ctx: RestoCtx, input: { order_code?: string; table?: string; to_table: string }): Promise<{
  order_code: string; from?: string; to: string;
}> {
  const order = await resolveOrder(ctx, input);
  if (order.type !== 'dine_in') {
    throw new RestoError('INVALID_STATUS_FLOW', `Đơn ${order.code} là ${order.type} — không gắn bàn`);
  }
  const to = await findTableByName(ctx, input.to_table);
  if (!to.active) throw new RestoError('TABLE_INACTIVE', `Bàn "${to.name}" đang ngưng sử dụng`);
  if (to.status !== 'available') {
    throw new RestoError('TABLE_BUSY', `Bàn "${to.name}" không trống (đang ${to.status})`);
  }

  let fromName: string | undefined;
  if (order.tableId) {
    const fromRows = await ctx.db.select().from(restoTables)
      .where(and(eq(restoTables.orgId, ctx.orgId), eq(restoTables.id, order.tableId))).limit(1);
    fromName = fromRows[0]?.name;
    await ctx.db.update(restoTables)
      .set({ status: 'available', currentOrderId: null, updatedAt: new Date() })
      .where(and(eq(restoTables.orgId, ctx.orgId), eq(restoTables.id, order.tableId)));
  }
  await ctx.db.update(restoTables)
    .set({ status: 'occupied', currentOrderId: order.id, updatedAt: new Date() })
    .where(and(eq(restoTables.orgId, ctx.orgId), eq(restoTables.id, to.id)));
  await ctx.db.update(restoOrders)
    .set({ tableId: to.id, updatedAt: new Date() })
    .where(and(eq(restoOrders.orgId, ctx.orgId), eq(restoOrders.id, order.id)));

  await ctx.bus.emit('resto.order.moved', {
    org_id: ctx.orgId, order_code: order.code, from: fromName ?? null, to: to.name,
  });
  return { order_code: order.code, from: fromName, to: to.name };
}

/** Gộp bàn: chuyển hết món của bàn nguồn sang bàn đích, đơn nguồn đóng lại. */
export async function mergeOrders(ctx: RestoCtx, input: { from_table: string; to_table: string }): Promise<{
  from_code: string; to_code: string; moved_items: number; totals: OrderTotals;
}> {
  const from = await resolveOrder(ctx, { table: input.from_table });
  const to = await resolveOrder(ctx, { table: input.to_table });
  if (from.id === to.id) throw new RestoError('INVALID_INPUT', 'Hai bàn đang chung một đơn rồi');

  const billed = await billedItemIds(ctx, from.id);
  if (billed.size) {
    throw new RestoError('ITEMS_ALREADY_BILLED', `Đơn ${from.code} đã có bill — void bill trước khi gộp bàn`);
  }

  const moved = await ctx.db.update(restoOrderItems)
    .set({ orderId: to.id, updatedAt: new Date() })
    .where(and(eq(restoOrderItems.orgId, ctx.orgId), eq(restoOrderItems.orderId, from.id)))
    .returning({ id: restoOrderItems.id });
  await ctx.db.update(restoKots)
    .set({ orderId: to.id, updatedAt: new Date() })
    .where(and(eq(restoKots.orgId, ctx.orgId), eq(restoKots.orderId, from.id)));

  await ctx.db.update(restoOrders).set({
    status: 'cancelled', cancelReason: `Gộp vào đơn ${to.code}`,
    closedAt: new Date(), updatedAt: new Date(),
  }).where(and(eq(restoOrders.orgId, ctx.orgId), eq(restoOrders.id, from.id)));
  if (from.tableId) await releaseTable(ctx, from.tableId, false);

  await computeAndStoreTotals(ctx, from.id);
  const totals = await computeAndStoreTotals(ctx, to.id);
  await ctx.bus.emit('resto.orders.merged', {
    org_id: ctx.orgId, from_code: from.code, to_code: to.code, moved_items: moved.length,
  });
  return { from_code: from.code, to_code: to.code, moved_items: moved.length, totals };
}

/** Hủy cả đơn (chưa có bill đã thanh toán). */
export async function cancelOrder(ctx: RestoCtx, input: { order_code?: string; table?: string; reason: string }): Promise<{
  order_code: string; cancelled_items: number;
}> {
  const order = await resolveOrder(ctx, input);
  const paidBills = await ctx.db.select().from(restoBills)
    .where(and(eq(restoBills.orgId, ctx.orgId), eq(restoBills.orderId, order.id), eq(restoBills.status, 'paid')));
  if (paidBills.length) {
    throw new RestoError('ORDER_HAS_PAID_BILL', `Đơn ${order.code} đã có bill thanh toán — không hủy được (cần quy trình hoàn tiền)`);
  }
  await ctx.db.update(restoBills).set({
    status: 'void', voidReason: `Hủy đơn: ${input.reason}`, updatedAt: new Date(),
  }).where(and(eq(restoBills.orgId, ctx.orgId), eq(restoBills.orderId, order.id), eq(restoBills.status, 'unpaid')));

  const cancelled = await ctx.db.update(restoOrderItems).set({
    status: 'cancelled', cancelReason: input.reason, updatedAt: new Date(),
  }).where(and(eq(restoOrderItems.orgId, ctx.orgId), eq(restoOrderItems.orderId, order.id),
    ne(restoOrderItems.status, 'cancelled')))
    .returning({ id: restoOrderItems.id });

  await ctx.db.update(restoKots).set({ status: 'cancelled', updatedAt: new Date() })
    .where(and(eq(restoKots.orgId, ctx.orgId), eq(restoKots.orderId, order.id),
      inArray(restoKots.status, ['queued', 'preparing', 'ready'])));

  await ctx.db.update(restoOrders).set({
    status: 'cancelled', cancelReason: input.reason, closedAt: new Date(), updatedAt: new Date(),
  }).where(and(eq(restoOrders.orgId, ctx.orgId), eq(restoOrders.id, order.id)));

  // v1.1 — gỡ redemption khuyến mãi của đơn (trả lại lượt), đồng bộ used_count
  const redem = await ctx.db.select({ promoId: restoPromoRedemptions.promoId }).from(restoPromoRedemptions)
    .where(and(eq(restoPromoRedemptions.orgId, ctx.orgId), eq(restoPromoRedemptions.orderId, order.id)));
  if (redem.length) {
    await ctx.db.delete(restoPromoRedemptions)
      .where(and(eq(restoPromoRedemptions.orgId, ctx.orgId), eq(restoPromoRedemptions.orderId, order.id)));
    for (const r of redem) {
      const cnt = await ctx.db.select({ n: sqlCount() }).from(restoPromoRedemptions)
        .where(and(eq(restoPromoRedemptions.orgId, ctx.orgId), eq(restoPromoRedemptions.promoId, r.promoId)));
      await ctx.db.update(restoPromotions).set({ usedCount: Number(cnt[0]?.n ?? 0), updatedAt: new Date() })
        .where(and(eq(restoPromotions.orgId, ctx.orgId), eq(restoPromotions.id, r.promoId)));
    }
  }

  const s = await getSettings(ctx);
  if (order.tableId) await releaseTable(ctx, order.tableId, s.table_auto_clean);
  await computeAndStoreTotals(ctx, order.id);

  await ctx.bus.emit('resto.order.cancelled', {
    org_id: ctx.orgId, order_code: order.code, reason: input.reason,
  });
  return { order_code: order.code, cancelled_items: cancelled.length };
}

export interface OrderItemView {
  name: string; qty: string; unit_price: string; options: string[];
  line_total: string; line_total_fmt: string; status: string;
  course: number; note: string | null;
}

/** Xem đơn: items + totals + bills tóm tắt. */
export async function orderView(ctx: RestoCtx, ref: OrderRef): Promise<{
  order_code: string; type: string; status: string; table: string | null;
  guests: number; opened_at: string;
  items: OrderItemView[];
  totals: OrderTotals & { grand_total_fmt: string };
  discount_reason: string | null;
  bills: Array<{ code: string; status: string; grand_total: string; paid_total: string }>;
}> {
  const order = await resolveOrder(ctx, ref, { mustOpen: false });
  const items = await ctx.db.select().from(restoOrderItems)
    .where(and(eq(restoOrderItems.orgId, ctx.orgId), eq(restoOrderItems.orderId, order.id)))
    .orderBy(asc(restoOrderItems.createdAt));

  let tableName: string | null = null;
  if (order.tableId) {
    const t = await ctx.db.select().from(restoTables)
      .where(and(eq(restoTables.orgId, ctx.orgId), eq(restoTables.id, order.tableId))).limit(1);
    tableName = t[0]?.name ?? null;
  }
  const bills = await ctx.db.select().from(restoBills)
    .where(and(eq(restoBills.orgId, ctx.orgId), eq(restoBills.orderId, order.id)))
    .orderBy(asc(restoBills.issuedAt));

  return {
    order_code: order.code, type: order.type, status: order.status,
    table: tableName, guests: order.guests,
    opened_at: order.openedAt.toISOString(),
    items: items.map((i) => ({
      name: i.name, qty: fmtQty(i.qty), unit_price: i.unitPrice,
      options: (i.options ?? []).map((o) => o.name),
      line_total: i.lineTotal, line_total_fmt: fmtVnd(i.lineTotal),
      status: i.status, course: i.courseNo, note: i.note,
    })),
    totals: {
      subtotal: order.subtotal, discount_total: order.discountTotal,
      service_charge: order.serviceCharge, tax_total: order.taxTotal,
      grand_total: order.grandTotal, grand_total_fmt: fmtVnd(order.grandTotal),
    },
    discount_reason: order.discountReason,
    bills: bills.map((b) => ({
      code: b.code, status: b.status, grand_total: b.grandTotal, paid_total: b.paidTotal,
    })),
  };
}

/** Danh sách đơn đang mở (tổng quan sàn cho thu ngân). */
export async function openOrders(ctx: RestoCtx, input: { type?: 'dine_in' | 'takeaway' | 'delivery' }): Promise<{
  total: number;
  orders: Array<{ order_code: string; type: string; table: string | null; guests: number;
    items_count: number; grand_total: string; grand_total_fmt: string; opened_at: string }>;
}> {
  const conds = [eq(restoOrders.orgId, ctx.orgId), eq(restoOrders.status, 'open')];
  if (input.type) conds.push(eq(restoOrders.type, input.type));
  const orders = await ctx.db.select().from(restoOrders).where(and(...conds))
    .orderBy(asc(restoOrders.openedAt));

  const ids = orders.map((o) => o.id);
  const items = ids.length
    ? await ctx.db.select({ orderId: restoOrderItems.orderId, id: restoOrderItems.id })
        .from(restoOrderItems)
        .where(and(eq(restoOrderItems.orgId, ctx.orgId),
          inArray(restoOrderItems.orderId, ids), ne(restoOrderItems.status, 'cancelled')))
    : [];
  const countByOrder = new Map<string, number>();
  for (const i of items) countByOrder.set(i.orderId, (countByOrder.get(i.orderId) ?? 0) + 1);

  const tableIds = orders.map((o) => o.tableId).filter((v): v is string => Boolean(v));
  const tables = tableIds.length
    ? await ctx.db.select().from(restoTables)
        .where(and(eq(restoTables.orgId, ctx.orgId), inArray(restoTables.id, tableIds)))
    : [];
  const tName = new Map(tables.map((t) => [t.id, t.name]));

  return {
    total: orders.length,
    orders: orders.map((o) => ({
      order_code: o.code, type: o.type,
      table: o.tableId ? (tName.get(o.tableId) ?? null) : null,
      guests: o.guests,
      items_count: countByOrder.get(o.id) ?? 0,
      grand_total: o.grandTotal, grand_total_fmt: fmtVnd(o.grandTotal),
      opened_at: o.openedAt.toISOString(),
    })),
  };
}

/** v1.1 — Gắn khách thân thiết (theo SĐT, tạo hồ sơ nếu chưa có) vào một đơn đang mở. */
export async function setOrderCustomer(ctx: RestoCtx, input: { order_code?: string; table?: string; phone: string; name?: string }): Promise<{
  order_code: string; customer_id: string; phone: string; name: string;
}> {
  const order = await resolveOrder(ctx, input, { mustOpen: true });
  const c = await resolveOrCreateCustomer(ctx, input.phone, input.name);
  await ctx.db.update(restoOrders)
    .set({ customerId: c.id, customerPhone: c.phone, customerName: order.customerName ?? c.name, updatedAt: new Date() })
    .where(and(eq(restoOrders.orgId, ctx.orgId), eq(restoOrders.id, order.id)));
  // đồng bộ khách vào redemption (nếu đơn đã áp mã có giới hạn theo khách)
  await ctx.db.update(restoPromoRedemptions).set({ customerId: c.id })
    .where(and(eq(restoPromoRedemptions.orgId, ctx.orgId), eq(restoPromoRedemptions.orderId, order.id)));
  await ctx.bus.emit('resto.order.customer_set', {
    org_id: ctx.orgId, order_code: order.code, customer_id: c.id, phone: c.phone,
  });
  return { order_code: order.code, customer_id: c.id, phone: c.phone!, name: c.name };
}
