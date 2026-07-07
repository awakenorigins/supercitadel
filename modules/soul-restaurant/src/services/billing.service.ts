/**
 * SOUL-RESTAURANT — billing.service
 * Bill = snapshot tính tiền của một tập món trong đơn (hỗ trợ TÁCH bill).
 * Phân bổ giảm giá mức đơn vào từng bill theo TỶ LỆ subtotal; bill CUỐI
 * (gom hết món còn lại) nhận phần dư → tổng các bill = tổng đơn, không rơi lẻ.
 * Thanh toán: số ghi vào payment = số ÁP VÀO bill (tiền thối trả về response,
 * không ghi đè doanh thu). Bill đủ tiền → paid; đơn hết món chưa bill + mọi
 * bill đã paid → ĐÓNG ĐƠN: giải phóng bàn + phát event trừ kho (deduct_on=paid).
 */
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { RestoCtx } from '../types.js';
import { RestoError } from '../types.js';
import {
  restoOrders, restoOrderItems, restoBills, restoBillItems, restoPayments,
  restoKots, restoTables,
} from '../db/schema.js';
import { resolveOrder, computeAndStoreTotals, billedItemIds, type OrderRef } from './order.service.js';
import { getSettings } from './settings.service.js';
import { expandDeductionLines } from './catalog.service.js';
import { releaseTable } from './table.service.js';
import { resolveOrCreateCustomer } from './customer.service.js';
import { earnOnOrderClose, redeemForPayment } from './loyalty.service.js';
import { genCode } from '../lib/codes.js';
import { d2, f2, p2, fmtVnd, fmtQty, pctOf, taxFromGross, taxOnNet, minBig, roundDivNonNeg } from '../lib/money.js';

type BillRow = typeof restoBills.$inferSelect;
type OrderItemRow = typeof restoOrderItems.$inferSelect;

async function activeUnbilledItems(ctx: RestoCtx, orderId: string): Promise<OrderItemRow[]> {
  const items = await ctx.db.select().from(restoOrderItems)
    .where(and(eq(restoOrderItems.orgId, ctx.orgId), eq(restoOrderItems.orderId, orderId),
      ne(restoOrderItems.status, 'cancelled')))
    .orderBy(asc(restoOrderItems.createdAt));
  const billed = await billedItemIds(ctx, orderId);
  return items.filter((i) => !billed.has(i.id));
}

export interface BillCreateInput extends OrderRef {
  item_names?: string[];
  item_ids?: string[];
}

export interface BillView {
  bill_code: string; order_code: string; status: string;
  items: Array<{ name: string; qty: string; amount: string; amount_fmt: string }>;
  subtotal: string; discount_total: string; service_charge: string;
  tax_total: string; grand_total: string; grand_total_fmt: string;
  paid_total: string; remaining: string;
}

/** Tạo bill (tạm tính → chốt). Không truyền món → gom TẤT CẢ món chưa bill. */
export async function createBill(ctx: RestoCtx, input: BillCreateInput): Promise<BillView> {
  const order = await resolveOrder(ctx, input);
  await computeAndStoreTotals(ctx, order.id);
  const fresh = await ctx.db.select().from(restoOrders)
    .where(and(eq(restoOrders.orgId, ctx.orgId), eq(restoOrders.id, order.id))).limit(1);
  const ord = fresh[0]!;

  const unbilled = await activeUnbilledItems(ctx, order.id);
  if (!unbilled.length) {
    throw new RestoError('NOTHING_TO_BILL', `Đơn ${order.code} không còn món nào chưa lên bill`);
  }

  // ── Chọn món cho bill này ──
  let selected: OrderItemRow[];
  if (input.item_ids?.length) {
    const byId = new Map(unbilled.map((i) => [i.id, i]));
    selected = input.item_ids.map((id) => {
      const it = byId.get(id);
      if (!it) throw new RestoError('ITEMS_ALREADY_BILLED', `Món id=${id} không thuộc nhóm chưa-bill của đơn ${order.code}`);
      return it;
    });
  } else if (input.item_names?.length) {
    const pool = [...unbilled];
    selected = input.item_names.map((name) => {
      const q = name.trim().toLowerCase();
      const idx = pool.findIndex((i) => i.name.toLowerCase() === q);
      if (idx < 0) throw new RestoError('ORDER_ITEM_NOT_FOUND', `Không còn món "${name}" chưa-bill trong đơn ${order.code}`);
      return pool.splice(idx, 1)[0]!;
    });
  } else {
    selected = unbilled;
  }
  const takesAllRemaining = selected.length === unbilled.length;

  // ── Số liệu bill ──
  let billSub = 0n;
  for (const i of selected) billSub += d2(i.lineTotal);

  const orderDisc = d2(ord.discountTotal);
  const orderSub = d2(ord.subtotal);
  const priorBills = await ctx.db.select().from(restoBills)
    .where(and(eq(restoBills.orgId, ctx.orgId), eq(restoBills.orderId, order.id),
      ne(restoBills.status, 'void')));
  let priorAlloc = 0n;
  for (const b of priorBills) priorAlloc += d2(b.discountTotal);
  const remainingDisc = orderDisc > priorAlloc ? orderDisc - priorAlloc : 0n;

  let discAlloc: bigint;
  if (takesAllRemaining) discAlloc = minBig(remainingDisc, billSub);
  else if (orderSub > 0n) discAlloc = minBig(minBig(roundDivNonNeg(orderDisc * billSub, orderSub), remainingDisc), billSub);
  else discAlloc = 0n;

  const s = await getSettings(ctx);
  const base = billSub - discAlloc;
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

  const code = genCode('BILL');
  const inserted = await ctx.db.insert(restoBills).values({
    orgId: ctx.orgId, orderId: order.id, code,
    subtotal: f2(billSub), discountTotal: f2(discAlloc),
    serviceCharge: f2(service), taxTotal: f2(tax), grandTotal: f2(grand),
    issuedBy: ctx.userId ?? null,
  }).returning({ id: restoBills.id });
  const billId = inserted[0]!.id;

  for (const i of selected) {
    await ctx.db.insert(restoBillItems).values({
      orgId: ctx.orgId, billId, orderItemId: i.id, amount: i.lineTotal,
    });
  }

  await ctx.bus.emit('resto.bill.created', {
    org_id: ctx.orgId, bill_code: code, order_code: order.code,
    grand_total: f2(grand), items: selected.length, split: !takesAllRemaining,
  });

  return {
    bill_code: code, order_code: order.code, status: 'unpaid',
    items: selected.map((i) => ({
      name: i.name, qty: fmtQty(i.qty), amount: i.lineTotal, amount_fmt: fmtVnd(i.lineTotal),
    })),
    subtotal: f2(billSub), discount_total: f2(discAlloc),
    service_charge: f2(service), tax_total: f2(tax),
    grand_total: f2(grand), grand_total_fmt: fmtVnd(grand),
    paid_total: '0.00', remaining: f2(grand),
  };
}

/** Tìm bill để thanh toán: theo mã, hoặc theo đơn/bàn (0 bill → tự tạo full). */
async function resolveBillForPay(ctx: RestoCtx, input: { bill_code?: string } & OrderRef): Promise<{ bill: BillRow; autoCreated: boolean }> {
  if (input.bill_code) {
    const rows = await ctx.db.select().from(restoBills)
      .where(and(eq(restoBills.orgId, ctx.orgId),
        sql`lower(${restoBills.code}) = ${input.bill_code.trim().toLowerCase()}`)).limit(1);
    const bill = rows[0];
    if (!bill) throw new RestoError('BILL_NOT_FOUND', `Không tìm thấy bill "${input.bill_code}"`);
    if (bill.status === 'paid') throw new RestoError('BILL_ALREADY_PAID', `Bill ${bill.code} đã thanh toán xong`);
    if (bill.status === 'void') throw new RestoError('BILL_NOT_UNPAID', `Bill ${bill.code} đã void`);
    return { bill, autoCreated: false };
  }
  const order = await resolveOrder(ctx, input);
  const unpaid = await ctx.db.select().from(restoBills)
    .where(and(eq(restoBills.orgId, ctx.orgId), eq(restoBills.orderId, order.id),
      eq(restoBills.status, 'unpaid')))
    .orderBy(asc(restoBills.issuedAt));
  if (unpaid.length === 1) return { bill: unpaid[0]!, autoCreated: false };
  if (unpaid.length > 1) {
    throw new RestoError('PAYMENT_INVALID',
      `Đơn ${order.code} có ${unpaid.length} bill chưa thanh toán (${unpaid.map((b) => b.code).join(', ')}) — nêu rõ bill_code`);
  }
  // Chưa có bill → tạo full bill rồi thanh toán luôn ("tính tiền bàn 5" một câu là xong)
  const created = await createBill(ctx, { order_code: order.code });
  const rows = await ctx.db.select().from(restoBills)
    .where(and(eq(restoBills.orgId, ctx.orgId), sql`lower(${restoBills.code}) = ${created.bill_code.toLowerCase()}`)).limit(1);
  return { bill: rows[0]!, autoCreated: true };
}

export interface PayInput extends OrderRef {
  bill_code?: string;
  method: 'cash' | 'bank' | 'card' | 'momo' | 'zalopay' | 'vnpay' | 'points' | 'other';
  amount?: string;
  ref?: string;
  /** v1.1 — gắn khách thân thiết (SĐT) trước khi thu để tích/đổi điểm */
  customer_phone?: string;
}

/** Ghi thanh toán. Tiền mặt đưa dư → trả change; phi tiền mặt không cho vượt. */
export async function payBill(ctx: RestoCtx, input: PayInput): Promise<{
  bill_code: string; order_code: string; method: string;
  applied: string; applied_fmt: string; change: string; change_fmt: string;
  bill_status: string; remaining: string; remaining_fmt: string;
  order_closed: boolean; auto_created_bill: boolean;
  deduction: { emitted: boolean; lines: number; missing_recipe: string[] };
  loyalty: { redeemed: string; earned: string; customer_linked: boolean };
}> {
  const { bill, autoCreated } = await resolveBillForPay(ctx, input);

  // Lấy đơn sớm (cần customerId cho điểm thưởng)
  const ord0 = await ctx.db.select().from(restoOrders)
    .where(and(eq(restoOrders.orgId, ctx.orgId), eq(restoOrders.id, bill.orderId))).limit(1);
  const order = ord0[0]!;

  // v1.1 — gắn khách theo SĐT nếu truyền (để tích/đổi điểm)
  let customerLinked = false;
  if (input.customer_phone && input.customer_phone.replace(/[^\d+]/g, '').length >= 6) {
    const c = await resolveOrCreateCustomer(ctx, input.customer_phone);
    if (order.customerId !== c.id) {
      await ctx.db.update(restoOrders).set({ customerId: c.id, customerPhone: c.phone, updatedAt: new Date() })
        .where(and(eq(restoOrders.orgId, ctx.orgId), eq(restoOrders.id, order.id)));
      order.customerId = c.id;
    }
    customerLinked = true;
  }

  const grand = d2(bill.grandTotal);
  const paid = d2(bill.paidTotal);
  const due = grand - paid;
  if (due <= 0n) throw new RestoError('BILL_ALREADY_PAID', `Bill ${bill.code} không còn nợ`);

  let applied: bigint;
  let change: bigint;
  let redeemedPoints = 0n;
  if (input.method === 'points') {
    // Đổi điểm làm thanh toán — 1 điểm = 1đ, không có tiền thối
    if (!order.customerId) throw new RestoError('LOYALTY_NO_CUSTOMER', 'Cần gắn khách (SĐT) để đổi điểm — truyền customer_phone');
    redeemedPoints = await redeemForPayment(ctx, {
      customerId: order.customerId, orderId: order.id, orderCode: order.code,
      requested: input.amount, due,
    });
    applied = redeemedPoints;
    change = 0n;
  } else {
    const tendered = input.amount !== undefined ? d2(input.amount) : due;
    if (tendered <= 0n) throw new RestoError('PAYMENT_INVALID', 'Số tiền thanh toán phải > 0');
    if (tendered > due && input.method !== 'cash') {
      throw new RestoError('PAYMENT_INVALID',
        `${fmtVnd(tendered)} vượt số cần thu ${fmtVnd(due)} — thanh toán ${input.method} không có tiền thối`);
    }
    applied = minBig(tendered, due);
    change = tendered - applied;
  }

  await ctx.db.insert(restoPayments).values({
    orgId: ctx.orgId, billId: bill.id,
    method: input.method, amount: f2(applied),
    ref: input.ref ?? null, receivedBy: ctx.userId ?? null,
  });
  const newPaid = paid + applied;
  const isPaid = newPaid >= grand;
  await ctx.db.update(restoBills).set({
    paidTotal: f2(newPaid),
    status: isPaid ? 'paid' : 'unpaid',
    paidAt: isPaid ? new Date() : null,
    updatedAt: new Date(),
  }).where(and(eq(restoBills.orgId, ctx.orgId), eq(restoBills.id, bill.id)));

  await ctx.bus.emit('resto.payment.recorded', {
    org_id: ctx.orgId, bill_code: bill.code, method: input.method, amount: f2(applied),
  });

  let orderClosed = false;
  let deduction = { emitted: false, lines: 0, missing_recipe: [] as string[] };
  let earnedPoints = '0.00';

  if (isPaid) {
    await ctx.bus.emit('resto.bill.paid', {
      org_id: ctx.orgId, bill_code: bill.code, order_code: order.code, grand_total: f2(grand),
    });
    const res = await maybeCloseOrder(ctx, order.id);
    orderClosed = res.closed;
    deduction = res.deduction;
    earnedPoints = res.loyalty.earned;
  }

  return {
    bill_code: bill.code, order_code: order.code, method: input.method,
    applied: f2(applied), applied_fmt: fmtVnd(applied),
    change: f2(change), change_fmt: fmtVnd(change),
    bill_status: isPaid ? 'paid' : 'unpaid',
    remaining: f2(grand - newPaid), remaining_fmt: fmtVnd(grand - newPaid),
    order_closed: orderClosed, auto_created_bill: autoCreated,
    deduction,
    loyalty: { redeemed: f2(redeemedPoints), earned: earnedPoints, customer_linked: customerLinked },
  };
}

/** Đơn hết món chưa-bill + mọi bill paid → đóng đơn, thả bàn, trừ kho (paid-mode). */
export async function maybeCloseOrder(ctx: RestoCtx, orderId: string): Promise<{
  closed: boolean;
  deduction: { emitted: boolean; lines: number; missing_recipe: string[] };
  loyalty: { earned: string; customer_id?: string };
}> {
  const deduction = { emitted: false, lines: 0, missing_recipe: [] as string[] };
  const orders = await ctx.db.select().from(restoOrders)
    .where(and(eq(restoOrders.orgId, ctx.orgId), eq(restoOrders.id, orderId))).limit(1);
  const order = orders[0];
  if (!order || order.status !== 'open') return { closed: false, deduction, loyalty: { earned: '0.00' } };

  const unbilled = await activeUnbilledItems(ctx, orderId);
  if (unbilled.length) return { closed: false, deduction, loyalty: { earned: '0.00' } };
  const unpaidBills = await ctx.db.select().from(restoBills)
    .where(and(eq(restoBills.orgId, ctx.orgId), eq(restoBills.orderId, orderId),
      eq(restoBills.status, 'unpaid')));
  if (unpaidBills.length) return { closed: false, deduction, loyalty: { earned: '0.00' } };

  // Món đang chạy → served; KOT đang chạy → completed (dữ liệu sạch khi đóng)
  await ctx.db.update(restoOrderItems).set({ status: 'served', updatedAt: new Date() })
    .where(and(eq(restoOrderItems.orgId, ctx.orgId), eq(restoOrderItems.orderId, orderId),
      inArray(restoOrderItems.status, ['sent', 'preparing', 'ready'])));
  await ctx.db.update(restoKots).set({ status: 'completed', doneAt: new Date(), updatedAt: new Date() })
    .where(and(eq(restoKots.orgId, ctx.orgId), eq(restoKots.orderId, orderId),
      inArray(restoKots.status, ['queued', 'preparing', 'ready'])));

  await ctx.db.update(restoOrders).set({
    status: 'paid', closedAt: new Date(), updatedAt: new Date(),
  }).where(and(eq(restoOrders.orgId, ctx.orgId), eq(restoOrders.id, orderId)));

  const s = await getSettings(ctx);
  if (order.tableId) await releaseTable(ctx, order.tableId, s.table_auto_clean);

  if (s.auto_deduct_stock && s.deduct_on === 'paid') {
    const active = await ctx.db.select().from(restoOrderItems)
      .where(and(eq(restoOrderItems.orgId, ctx.orgId), eq(restoOrderItems.orderId, orderId),
        ne(restoOrderItems.status, 'cancelled')));
    const { lines, missing_recipe } = await expandDeductionLines(ctx,
      active.map((a) => ({ menuItemId: a.menuItemId, name: a.name, qty: a.qty })));
    if (lines.length) {
      await ctx.bus.emit('resto.stock.deduct_requested', {
        org_id: ctx.orgId, order_code: order.code, trigger: 'paid',
        reason: `Bán hàng ${order.code}`, lines, missing_recipe,
      });
      deduction.emitted = true;
      deduction.lines = lines.length;
    }
    deduction.missing_recipe = missing_recipe;
  }

  // v1.1 — tích điểm cho khách thân thiết (an toàn khi tắt loyalty/không có khách)
  const loyalty = await earnOnOrderClose(ctx, orderId);

  await ctx.bus.emit('resto.order.closed', {
    org_id: ctx.orgId, order_code: order.code, grand_total: order.grandTotal,
  });
  return { closed: true, deduction, loyalty };
}

/** Void bill chưa thanh toán — món trong bill được tự do để bill lại. */
export async function voidBill(ctx: RestoCtx, input: { bill_code: string; reason: string }): Promise<{
  bill_code: string; order_code: string;
}> {
  const rows = await ctx.db.select().from(restoBills)
    .where(and(eq(restoBills.orgId, ctx.orgId),
      sql`lower(${restoBills.code}) = ${input.bill_code.trim().toLowerCase()}`)).limit(1);
  const bill = rows[0];
  if (!bill) throw new RestoError('BILL_NOT_FOUND', `Không tìm thấy bill "${input.bill_code}"`);
  if (bill.status === 'paid') {
    throw new RestoError('BILL_ALREADY_PAID', `Bill ${bill.code} đã thanh toán — không void được (cần quy trình hoàn tiền)`);
  }
  if (bill.status === 'void') {
    throw new RestoError('BILL_NOT_UNPAID', `Bill ${bill.code} đã void trước đó`);
  }
  await ctx.db.update(restoBills).set({
    status: 'void', voidReason: input.reason, updatedAt: new Date(),
  }).where(and(eq(restoBills.orgId, ctx.orgId), eq(restoBills.id, bill.id)));

  const orders = await ctx.db.select().from(restoOrders)
    .where(and(eq(restoOrders.orgId, ctx.orgId), eq(restoOrders.id, bill.orderId))).limit(1);
  const orderCode = orders[0]?.code ?? '';
  await ctx.bus.emit('resto.bill.voided', {
    org_id: ctx.orgId, bill_code: bill.code, order_code: orderCode, reason: input.reason,
  });
  return { bill_code: bill.code, order_code: orderCode };
}

/** Xem bill: theo mã → chi tiết; theo đơn/bàn → danh sách bill của đơn. */
export async function billView(ctx: RestoCtx, input: { bill_code?: string } & OrderRef): Promise<{
  bills: Array<BillView & { payments: Array<{ method: string; amount: string; paid_at: string }> }>;
}> {
  let bills: BillRow[];
  let orderCode = '';
  if (input.bill_code) {
    const rows = await ctx.db.select().from(restoBills)
      .where(and(eq(restoBills.orgId, ctx.orgId),
        sql`lower(${restoBills.code}) = ${input.bill_code.trim().toLowerCase()}`)).limit(1);
    if (!rows[0]) throw new RestoError('BILL_NOT_FOUND', `Không tìm thấy bill "${input.bill_code}"`);
    bills = rows;
    const o = await ctx.db.select().from(restoOrders)
      .where(and(eq(restoOrders.orgId, ctx.orgId), eq(restoOrders.id, rows[0].orderId))).limit(1);
    orderCode = o[0]?.code ?? '';
  } else {
    const order = await resolveOrder(ctx, input, { mustOpen: false });
    orderCode = order.code;
    bills = await ctx.db.select().from(restoBills)
      .where(and(eq(restoBills.orgId, ctx.orgId), eq(restoBills.orderId, order.id)))
      .orderBy(asc(restoBills.issuedAt));
  }

  const out: Array<BillView & { payments: Array<{ method: string; amount: string; paid_at: string }> }> = [];
  for (const b of bills) {
    const bItems = await ctx.db
      .select({ name: restoOrderItems.name, qty: restoOrderItems.qty, amount: restoBillItems.amount })
      .from(restoBillItems)
      .innerJoin(restoOrderItems, and(
        eq(restoOrderItems.orgId, ctx.orgId),
        eq(restoOrderItems.id, restoBillItems.orderItemId)))
      .where(and(eq(restoBillItems.orgId, ctx.orgId), eq(restoBillItems.billId, b.id)));
    const pays = await ctx.db.select().from(restoPayments)
      .where(and(eq(restoPayments.orgId, ctx.orgId), eq(restoPayments.billId, b.id)))
      .orderBy(asc(restoPayments.paidAt));
    const remaining = d2(b.grandTotal) - d2(b.paidTotal);
    out.push({
      bill_code: b.code, order_code: orderCode, status: b.status,
      items: bItems.map((i) => ({ name: i.name, qty: fmtQty(i.qty), amount: i.amount, amount_fmt: fmtVnd(i.amount) })),
      subtotal: b.subtotal, discount_total: b.discountTotal,
      service_charge: b.serviceCharge, tax_total: b.taxTotal,
      grand_total: b.grandTotal, grand_total_fmt: fmtVnd(b.grandTotal),
      paid_total: b.paidTotal, remaining: f2(remaining > 0n ? remaining : 0n),
      payments: pays.map((p) => ({ method: p.method, amount: p.amount, paid_at: p.paidAt.toISOString() })),
    });
  }
  return { bills: out };
}
