/** SOUL-SALE 1A — sales.service.ts: báo giá, đơn hàng (state machine + credit gate), thanh toán. */
import { and, eq, desc, inArray, ilike, sql } from 'drizzle-orm';
import { ssQuotes, ssQuoteItems, ssOrders, ssOrderItems, ssOrderStatusLog, ssPayments, ssPaymentTerms, ssCreditLimits } from '../schema.js';
import type { Db, Ctx } from '../contract.js';
import { bad, SsError, nextCode, nowOf, periodOf, addV, subV, cmpV, mulQty, pctOf, ZERO, fmtV } from '../lib/util.js';
import { getCustomer } from './master.service.js';
import { priceCheck, creditCheck } from './pricing.service.js';

export interface ItemInput { productCode: string; productName: string; qty: number; unit?: string; unitPrice?: string; discountPct?: string; taxRatePct?: string }

async function buildLines(db: Db, ctx: Ctx, customerId: string, items: ItemInput[]) {
  if (!items.length) bad('NO_ITEMS', 'Chứng từ phải có ít nhất 1 dòng hàng');
  const lines = [];
  for (const it of items) {
    if (it.qty <= 0) bad('BAD_QTY', `Số lượng dòng ${it.productCode} phải > 0`);
    let unitPrice = it.unitPrice; let discountPct = it.discountPct ?? '0'; let priceRuleId: string | null = null;
    if (unitPrice === undefined) {
      const r = await priceCheck(db, ctx, { productCode: it.productCode, customerId, qty: it.qty });
      if (!r.found) bad('PRICE_NOT_FOUND', `Chưa có giá cho ${it.productCode} — truyền unitPrice hoặc đặt price rule trước`);
      unitPrice = r.unitPrice!; discountPct = it.discountPct ?? r.discountPct!; priceRuleId = r.ruleId!;
    }
    const gross = mulQty(unitPrice, it.qty);
    const disc = pctOf(gross, discountPct);
    const lineTotal = subV(gross, disc);
    lines.push({ ...it, unit: it.unit ?? 'cái', unitPrice, discountPct, taxRatePct: it.taxRatePct ?? '0', gross, disc, lineTotal, priceRuleId });
  }
  const subTotal = lines.reduce((a, l) => addV(a, l.gross), ZERO);
  const discountTotal = lines.reduce((a, l) => addV(a, l.disc), ZERO);
  const taxTotal = lines.reduce((a, l) => addV(a, pctOf(l.lineTotal, l.taxRatePct)), ZERO);
  const grandTotal = addV(subV(subTotal, discountTotal), taxTotal);
  return { lines, subTotal, discountTotal, taxTotal, grandTotal };
}

/* ---------- QUOTES ---------- */
export async function createQuote(db: Db, ctx: Ctx, p: { customerId: string; dealId?: string; items: ItemInput[]; validUntil?: string; note?: string }) {
  await getCustomer(db, ctx, p.customerId);
  const { lines, grandTotal } = await buildLines(db, ctx, p.customerId, p.items);
  const code = await nextCode(db, ctx, 'BG');
  const [q] = await db.insert(ssQuotes).values({
    orgId: ctx.orgId, code, customerId: p.customerId, dealId: p.dealId ?? null,
    validUntil: p.validUntil ? new Date(p.validUntil) : null, total: grandTotal, note: p.note ?? null,
    ownerUserId: ctx.userId, createdBy: ctx.userId, createdAt: nowOf(ctx), updatedAt: nowOf(ctx),
  }).returning();
  await db.insert(ssQuoteItems).values(lines.map((l) => ({
    orgId: ctx.orgId, quoteId: q!.id, productCode: l.productCode, productName: l.productName,
    qty: l.qty, unit: l.unit, unitPrice: l.unitPrice!, discountPct: l.discountPct!, lineTotal: l.lineTotal, priceRuleId: l.priceRuleId,
  })));
  await ctx.emit?.('soulsale.quote.created', { quote_id: q!.id, code, total: grandTotal });
  return { ...q!, items: lines.length };
}

export async function getQuote(db: Db, ctx: Ctx, id: string) {
  const rows = await db.select().from(ssQuotes).where(and(eq(ssQuotes.orgId, ctx.orgId), eq(ssQuotes.id, id)));
  if (!rows[0]) bad('QUOTE_NOT_FOUND', `Không tìm thấy báo giá ${id}`);
  return rows[0]!;
}

export async function sendQuote(db: Db, ctx: Ctx, p: { quoteId: string }) {
  const q = await getQuote(db, ctx, p.quoteId);
  if (q.status !== 'draft') bad('QUOTE_NOT_DRAFT', `Báo giá đang ${q.status}, chỉ gửi từ draft`);
  const [row] = await db.update(ssQuotes).set({ status: 'sent', updatedAt: nowOf(ctx) })
    .where(and(eq(ssQuotes.orgId, ctx.orgId), eq(ssQuotes.id, q.id))).returning();
  return row!;
}

export async function closeQuote(db: Db, ctx: Ctx, p: { quoteId: string; outcome: 'accepted' | 'rejected'; reason?: string }) {
  const q = await getQuote(db, ctx, p.quoteId);
  if (!['draft', 'sent'].includes(q.status)) bad('QUOTE_CLOSED', `Báo giá đã ${q.status} — không chốt lại`);
  if (p.outcome === 'rejected' && !p.reason) bad('REASON_REQUIRED', 'Từ chối báo giá phải kèm lý do');
  const [row] = await db.update(ssQuotes)
    .set({ status: p.outcome, closedReason: p.reason ?? null, updatedAt: nowOf(ctx) })
    .where(and(eq(ssQuotes.orgId, ctx.orgId), eq(ssQuotes.id, q.id))).returning();
  return row!;
}

export async function quoteStatus(db: Db, ctx: Ctx, p?: { status?: string; expiringDays?: number; limit?: number }) {
  const conds = [eq(ssQuotes.orgId, ctx.orgId)];
  if (p?.status) conds.push(eq(ssQuotes.status, p.status));
  let rows = await db.select().from(ssQuotes).where(and(...conds)).orderBy(desc(ssQuotes.createdAt)).limit(p?.limit ?? 50);
  if (p?.expiringDays !== undefined) {
    const until = new Date(nowOf(ctx).getTime() + p.expiringDays * 86400000);
    rows = rows.filter((q) => ['draft', 'sent'].includes(q.status) && q.validUntil && new Date(q.validUntil) <= until && new Date(q.validUntil) >= nowOf(ctx));
  }
  return rows.map((q) => ({ id: q.id, code: q.code, status: q.status, total: q.total, validUntil: q.validUntil, customerId: q.customerId }));
}

/* ---------- ORDERS ---------- */
const HOLDABLE = ['confirmed', 'delivering'];
const CANCELLABLE = ['confirmed', 'delivering', 'on_hold', 'draft'];
const LINEAR: Record<string, string> = { confirmed: 'delivering', delivering: 'delivered', delivered: 'invoiced', invoiced: 'closed' };

async function logStatus(db: Db, ctx: Ctx, orderId: string, from: string, to: string, reason?: string) {
  await db.insert(ssOrderStatusLog).values({ orgId: ctx.orgId, orderId, fromStatus: from, toStatus: to, reason: reason ?? null, actorUserId: ctx.userId, at: nowOf(ctx) });
}

export async function createOrder(db: Db, ctx: Ctx, p: {
  customerId?: string; fromQuoteId?: string; items?: ItemInput[];
  paymentTermCode?: string; channel?: string; territoryId?: string;
}) {
  let customerId = p.customerId; let items = p.items ?? []; let quoteId: string | null = null;
  if (p.fromQuoteId) {
    const q = await getQuote(db, ctx, p.fromQuoteId);
    if (['rejected', 'expired'].includes(q.status)) bad('QUOTE_DEAD', `Báo giá ${q.code} đã ${q.status} — không lên đơn được`);
    customerId = q.customerId; quoteId = q.id;
    if (items.length === 0) {
      const qi = await db.select().from(ssQuoteItems).where(and(eq(ssQuoteItems.orgId, ctx.orgId), eq(ssQuoteItems.quoteId, q.id)));
      items = qi.map((i) => ({ productCode: i.productCode, productName: i.productName, qty: i.qty, unit: i.unit, unitPrice: i.unitPrice, discountPct: i.discountPct }));
    }
  }
  if (!customerId) bad('CUSTOMER_REQUIRED', 'Thiếu customerId (hoặc fromQuoteId)');
  await getCustomer(db, ctx, customerId!);
  const { lines, subTotal, discountTotal, taxTotal, grandTotal } = await buildLines(db, ctx, customerId!, items);
  let paymentTermId: string | null = null;
  if (p.paymentTermCode) {
    const t = await db.select().from(ssPaymentTerms).where(and(eq(ssPaymentTerms.orgId, ctx.orgId), eq(ssPaymentTerms.code, p.paymentTermCode)));
    if (!t[0]) bad('TERM_NOT_FOUND', `Không có điều khoản ${p.paymentTermCode}`);
    paymentTermId = t[0]!.id;
  }
  const code = await nextCode(db, ctx, 'SO', { period: periodOf(nowOf(ctx)) });
  const [o] = await db.insert(ssOrders).values({
    orgId: ctx.orgId, code, customerId: customerId!, quoteId, subTotal, discountTotal, taxTotal, grandTotal,
    paymentTermId, channel: p.channel ?? 'b2b', territoryId: p.territoryId ?? null,
    ownerUserId: ctx.userId, createdBy: ctx.userId, createdAt: nowOf(ctx), updatedAt: nowOf(ctx),
  }).returning();
  await db.insert(ssOrderItems).values(lines.map((l) => ({
    orgId: ctx.orgId, orderId: o!.id, productCode: l.productCode, productName: l.productName,
    qty: l.qty, unit: l.unit, unitPrice: l.unitPrice!, discountPct: l.discountPct!, taxRatePct: l.taxRatePct!, lineTotal: l.lineTotal,
  })));
  return o!;
}

export async function getOrder(db: Db, ctx: Ctx, id: string) {
  const rows = await db.select().from(ssOrders).where(and(eq(ssOrders.orgId, ctx.orgId), eq(ssOrders.id, id)));
  if (!rows[0]) bad('ORDER_NOT_FOUND', `Không tìm thấy đơn ${id}`);
  return rows[0]!;
}

/** Preview cho dry-run confirm: tổng tiền + tình trạng công nợ, KHÔNG ghi gì. */
export async function confirmPreview(db: Db, ctx: Ctx, p: { orderId: string }) {
  const o = await getOrder(db, ctx, p.orderId);
  const credit = await creditCheck(db, ctx, { customerId: o.customerId, extraAmount: o.grandTotal });
  return {
    order: { code: o.code, status: o.status, grandTotal: o.grandTotal, grandTotalFmt: fmtV(o.grandTotal) },
    credit: { limit: credit.limit, exposure: credit.exposure, available: credit.available, hold: credit.hold, wouldExceed: credit.wouldExceed },
    creditOverride: o.creditOverride,
    willBlock: credit.hold || (credit.hasLimit && credit.wouldExceed && !o.creditOverride),
  };
}

export async function confirmOrder(db: Db, ctx: Ctx, p: { orderId: string }) {
  const o = await getOrder(db, ctx, p.orderId);
  if (!['draft', 'on_hold'].includes(o.status)) bad('BAD_STATUS', `Đơn ${o.code} đang ${o.status} — chỉ xác nhận từ draft/on_hold`);
  const itemCount = (await db.select({ n: sql<number>`count(*)::int` }).from(ssOrderItems)
    .where(and(eq(ssOrderItems.orgId, ctx.orgId), eq(ssOrderItems.orderId, o.id))))[0]!.n;
  if (itemCount === 0) bad('NO_ITEMS', 'Đơn chưa có dòng hàng');
  const credit = await creditCheck(db, ctx, { customerId: o.customerId, extraAmount: o.grandTotal });
  if (credit.hold) bad('CREDIT_HOLD', `Khách đang bị KHOÁ công nợ: ${credit.holdReason ?? 'không rõ lý do'} — mở khoá (credit.hold-toggle) trước`);
  if (credit.hasLimit && credit.wouldExceed && !o.creditOverride) {
    bad('CREDIT_EXCEEDED', `Vượt hạn mức: đơn ${fmtV(o.grandTotal)}đ, còn khả dụng ${fmtV(credit.available)}đ (hạn mức ${fmtV(credit.limit)}đ, đang nợ ${fmtV(credit.exposure)}đ). Nâng hạn mức (credit.limit-set) hoặc duyệt vượt (order.hold-toggle overrideCredit)`);
  }
  const [row] = await db.update(ssOrders)
    .set({ status: 'confirmed', confirmedAt: nowOf(ctx), holdReason: null, updatedAt: nowOf(ctx) })
    .where(and(eq(ssOrders.orgId, ctx.orgId), eq(ssOrders.id, o.id))).returning();
  await logStatus(db, ctx, o.id, o.status, 'confirmed');
  await ctx.emit?.('soulsale.order.created', { order_id: o.id, code: o.code, customer_id: o.customerId, grand_total: o.grandTotal });
  return row!;
}

export async function holdToggleOrder(db: Db, ctx: Ctx, p: { orderId: string; hold: boolean; reason?: string; overrideCredit?: boolean }): Promise<typeof ssOrders.$inferSelect> {
  const o = await getOrder(db, ctx, p.orderId);
  if (p.hold) {
    if (!HOLDABLE.includes(o.status)) bad('BAD_STATUS', `Chỉ giữ đơn đang ${HOLDABLE.join('/')} (đơn này: ${o.status})`);
    if (!p.reason) bad('REASON_REQUIRED', 'Giữ đơn phải kèm lý do');
    const [row] = await db.update(ssOrders).set({ status: 'on_hold', holdReason: p.reason, updatedAt: nowOf(ctx) })
      .where(and(eq(ssOrders.orgId, ctx.orgId), eq(ssOrders.id, o.id))).returning();
    await logStatus(db, ctx, o.id, o.status, 'on_hold', p.reason);
    return row!;
  }
  // release / duyệt vượt hạn mức
  const patch: Record<string, unknown> = { updatedAt: nowOf(ctx) };
  if (p.overrideCredit) patch.creditOverride = true;
  if (o.status === 'on_hold') {
    patch.status = 'confirmed'; patch.holdReason = null; patch.confirmedAt = o.confirmedAt ?? nowOf(ctx);
    const [row] = await db.update(ssOrders).set(patch).where(and(eq(ssOrders.orgId, ctx.orgId), eq(ssOrders.id, o.id))).returning();
    await logStatus(db, ctx, o.id, 'on_hold', 'confirmed', p.reason ?? (p.overrideCredit ? 'duyệt vượt hạn mức' : 'thả đơn'));
    return row!;
  }
  if (o.status === 'draft' && p.overrideCredit) {
    const [row] = await db.update(ssOrders).set(patch).where(and(eq(ssOrders.orgId, ctx.orgId), eq(ssOrders.id, o.id))).returning();
    await logStatus(db, ctx, o.id, 'draft', 'draft', 'duyệt vượt hạn mức (chờ confirm)');
    return row!;
  }
  throw new SsError('BAD_STATUS', `Đơn đang ${o.status} — không có gì để thả`);
}

export async function cancelOrder(db: Db, ctx: Ctx, p: { orderId: string; reason: string }) {
  const o = await getOrder(db, ctx, p.orderId);
  if (!CANCELLABLE.includes(o.status)) {
    bad('BAD_STATUS', o.status === 'cancelled'
      ? `Đơn ${o.code} đã hủy rồi`
      : `Đơn ${o.code} đang ${o.status} — đã giao/xuất hoá đơn thì xử lý bằng chứng từ đảo bên kế toán, không hủy trực tiếp`);
  }
  const [row] = await db.update(ssOrders)
    .set({ status: 'cancelled', cancelledAt: nowOf(ctx), cancelReason: p.reason, updatedAt: nowOf(ctx) })
    .where(and(eq(ssOrders.orgId, ctx.orgId), eq(ssOrders.id, o.id))).returning();
  await logStatus(db, ctx, o.id, o.status, 'cancelled', p.reason);
  await ctx.emit?.('soulsale.order.cancelled', { order_id: o.id, code: o.code, customer_id: o.customerId, grand_total: o.grandTotal, reason: p.reason });
  return row!;
}

/** Tiến trình tuyến tính confirmed→delivering→delivered→invoiced→closed (dùng ở routes). */
export async function advanceOrder(db: Db, ctx: Ctx, p: { orderId: string; to: string }) {
  const o = await getOrder(db, ctx, p.orderId);
  if (LINEAR[o.status] !== p.to) bad('BAD_TRANSITION', `Không đi được ${o.status} → ${p.to} (đúng tuyến: ${o.status} → ${LINEAR[o.status] ?? '∅'})`);
  const [row] = await db.update(ssOrders).set({ status: p.to, updatedAt: nowOf(ctx) })
    .where(and(eq(ssOrders.orgId, ctx.orgId), eq(ssOrders.id, o.id))).returning();
  await logStatus(db, ctx, o.id, o.status, p.to);
  return row!;
}

export async function searchOrders(db: Db, ctx: Ctx, p: { q?: string; customerId?: string; status?: string; period?: string; limit?: number }) {
  const conds = [eq(ssOrders.orgId, ctx.orgId)];
  if (p.q) conds.push(ilike(ssOrders.code, `%${p.q}%`));
  if (p.customerId) conds.push(eq(ssOrders.customerId, p.customerId));
  if (p.status) conds.push(eq(ssOrders.status, p.status));
  let rows = await db.select().from(ssOrders).where(and(...conds)).orderBy(desc(ssOrders.createdAt)).limit(p.limit ?? 50);
  if (p.period) rows = rows.filter((o) => periodOf(new Date(o.createdAt)) === p.period);
  return rows.map((o) => ({ id: o.id, code: o.code, customerId: o.customerId, status: o.status, grandTotal: o.grandTotal, createdAt: o.createdAt }));
}

/* ---------- PAYMENTS ---------- */
export async function recordPayment(db: Db, ctx: Ctx, p: {
  orderId?: string; customerId?: string; kind: 'deposit' | 'payment' | 'refund';
  amount: string; method?: string; externalRef?: string; note?: string;
}) {
  if (cmpV(p.amount, ZERO) <= 0) bad('BAD_AMOUNT', 'Số tiền phải > 0');
  let customerId = p.customerId; let order = null;
  if (p.orderId) { order = await getOrder(db, ctx, p.orderId); customerId = order.customerId; }
  if (!customerId) bad('CUSTOMER_REQUIRED', 'Thiếu customerId hoặc orderId');
  await getCustomer(db, ctx, customerId!);
  if (p.kind === 'refund' && p.orderId) {
    const pays = await db.select().from(ssPayments).where(and(eq(ssPayments.orgId, ctx.orgId), eq(ssPayments.orderId, p.orderId)));
    const paid = pays.reduce((a, x) => addV(a, x.kind === 'refund' ? `-${x.amount}` : x.amount), ZERO);
    if (cmpV(p.amount, paid) > 0) bad('REFUND_EXCEEDS', `Hoàn ${fmtV(p.amount)}đ vượt số đã thu ${fmtV(paid)}đ trên đơn này`);
  }
  const code = await nextCode(db, ctx, 'PC', { period: periodOf(nowOf(ctx)) });
  const [row] = await db.insert(ssPayments).values({
    orgId: ctx.orgId, code, customerId: customerId!, orderId: p.orderId ?? null, kind: p.kind,
    amount: p.amount, method: p.method ?? 'bank', externalRef: p.externalRef ?? null, note: p.note ?? null,
    recordedBy: ctx.userId, at: nowOf(ctx),
  }).returning();
  await ctx.emit?.('soulsale.payment.recorded', { payment_id: row!.id, code, order_id: p.orderId ?? null, customer_id: customerId, kind: p.kind, amount: p.amount });
  return row!;
}

export async function paymentPreview(db: Db, ctx: Ctx, p: { orderId?: string; customerId?: string; kind: string; amount: string }) {
  const target = p.orderId ? await getOrder(db, ctx, p.orderId) : null;
  const customerId = target?.customerId ?? p.customerId;
  const credit = customerId ? await creditCheck(db, ctx, { customerId }) : null;
  return {
    amountFmt: fmtV(p.amount), kind: p.kind,
    order: target ? { code: target.code, grandTotal: target.grandTotal, status: target.status } : null,
    debtBefore: credit?.exposure ?? null,
  };
}
