/** SOUL-SALE 1A — pricing.service.ts: bảng giá tầng (resolve theo specificity), hạn mức & phơi nhiễm công nợ, điều khoản thanh toán. */
import { and, eq, inArray, or, isNull } from 'drizzle-orm';
import { ssPriceBooks, ssPriceRules, ssPaymentTerms, ssCreditLimits, ssOrders, ssPayments, ssAgencyProfiles, ssCustomers } from '../schema.js';
import type { Db, Ctx } from '../contract.js';
import { bad, addV, subV, cmpV, pctOf, ZERO, nowOf } from '../lib/util.js';
import { ensureSegment, getCustomer } from './master.service.js';

/* ---------- PRICE RULES ---------- */
export async function setPriceRule(db: Db, ctx: Ctx, p: {
  productCode: string; unitPrice: string; discountPct?: string;
  priceBookCode?: string; customerId?: string; segmentCode?: string; agencyLevel?: number;
  minQty?: number; validFrom?: string; validTo?: string; priority?: number; active?: boolean;
}) {
  const scopeCount = [p.customerId, p.segmentCode, p.agencyLevel].filter((x) => x !== undefined).length;
  if (scopeCount > 1) bad('SCOPE_CONFLICT', 'Một rule chỉ chọn MỘT phạm vi: customerId | segmentCode | agencyLevel (hoặc để trống = giá chung)');
  const bookCode = p.priceBookCode ?? 'DEFAULT';
  let books = await db.select().from(ssPriceBooks).where(and(eq(ssPriceBooks.orgId, ctx.orgId), eq(ssPriceBooks.code, bookCode)));
  if (!books[0] && bookCode === 'DEFAULT') {
    // plug-and-play: org mới chưa seed vẫn đặt giá được ngay
    books = await db.insert(ssPriceBooks)
      .values({ orgId: ctx.orgId, code: 'DEFAULT', name: 'Bảng giá chung', channel: 'all', createdBy: ctx.userId }).returning();
  }
  if (!books[0]) bad('PRICE_BOOK_NOT_FOUND', `Không có bảng giá ${bookCode}`);
  const book = books[0]!;
  let segmentId: string | null = null;
  if (p.segmentCode) segmentId = (await ensureSegment(db, ctx, p.segmentCode)).id;
  if (p.customerId) await getCustomer(db, ctx, p.customerId);

  const minQty = p.minQty ?? 1;
  const vFrom = p.validFrom ? new Date(p.validFrom) : null;
  const vTo = p.validTo ? new Date(p.validTo) : null;
  // upsert theo scope tuple: (book, product, customerId, segmentId, agencyLevel, minQty, validFrom, validTo)
  // — hai rule cùng scope nhưng khác cửa sổ hiệu lực (giá chuẩn vs khuyến mãi) PHẢI song song tồn tại
  const existing = await db.select().from(ssPriceRules).where(and(
    eq(ssPriceRules.orgId, ctx.orgId), eq(ssPriceRules.priceBookId, book.id), eq(ssPriceRules.productCode, p.productCode),
    p.customerId ? eq(ssPriceRules.customerId, p.customerId) : isNull(ssPriceRules.customerId),
    segmentId ? eq(ssPriceRules.segmentId, segmentId) : isNull(ssPriceRules.segmentId),
    p.agencyLevel !== undefined ? eq(ssPriceRules.agencyLevel, p.agencyLevel) : isNull(ssPriceRules.agencyLevel),
    eq(ssPriceRules.minQty, minQty),
    vFrom ? eq(ssPriceRules.validFrom, vFrom) : isNull(ssPriceRules.validFrom),
    vTo ? eq(ssPriceRules.validTo, vTo) : isNull(ssPriceRules.validTo),
  ));
  const values = {
    unitPrice: p.unitPrice, discountPct: p.discountPct ?? '0',
    validFrom: p.validFrom ? new Date(p.validFrom) : null, validTo: p.validTo ? new Date(p.validTo) : null,
    priority: p.priority ?? 0, active: p.active ?? true,
  };
  if (existing[0]) {
    const [row] = await db.update(ssPriceRules).set(values)
      .where(and(eq(ssPriceRules.orgId, ctx.orgId), eq(ssPriceRules.id, existing[0]!.id))).returning();
    return { ...row!, upserted: 'updated' as const };
  }
  const [row] = await db.insert(ssPriceRules).values({
    orgId: ctx.orgId, priceBookId: book.id, productCode: p.productCode,
    customerId: p.customerId ?? null, segmentId, agencyLevel: p.agencyLevel ?? null,
    minQty, ...values, createdBy: ctx.userId,
  }).returning();
  return { ...row!, upserted: 'inserted' as const };
}

export interface PriceResolution {
  found: boolean; productCode: string; qty: number;
  unitPrice?: string; discountPct?: string; effectiveUnitPrice?: string;
  source?: 'customer' | 'segment' | 'agency_level' | 'default'; ruleId?: string;
}

/** Resolve giá: đích danh khách > segment > level đại lý > giá chung; lọc minQty + hiệu lực; tie-break priority. */
export async function priceCheck(db: Db, ctx: Ctx, p: { productCode: string; customerId?: string; qty?: number; at?: string }): Promise<PriceResolution> {
  const qty = p.qty ?? 1;
  const at = p.at ? new Date(p.at) : nowOf(ctx);
  let segmentId: string | null = null; let level: number | null = null;
  if (p.customerId) {
    const cust = await getCustomer(db, ctx, p.customerId);
    segmentId = cust.segmentId;
    const prof = await db.select().from(ssAgencyProfiles)
      .where(and(eq(ssAgencyProfiles.orgId, ctx.orgId), eq(ssAgencyProfiles.customerId, cust.id)));
    level = prof[0]?.level ?? null;
  }
  const activeBooks = await db.select().from(ssPriceBooks).where(and(eq(ssPriceBooks.orgId, ctx.orgId), eq(ssPriceBooks.active, true)));
  if (activeBooks.length === 0) return { found: false, productCode: p.productCode, qty };
  const rules = await db.select().from(ssPriceRules).where(and(
    eq(ssPriceRules.orgId, ctx.orgId), eq(ssPriceRules.productCode, p.productCode), eq(ssPriceRules.active, true),
    inArray(ssPriceRules.priceBookId, activeBooks.map((b) => b.id)),
  ));
  type Cand = { rule: typeof rules[number]; specificity: number; source: PriceResolution['source'] };
  const cands: Cand[] = [];
  for (const r of rules) {
    if (r.minQty > qty) continue;
    if (r.validFrom && at < new Date(r.validFrom)) continue;
    if (r.validTo && at > new Date(r.validTo)) continue;
    if (r.customerId) { if (r.customerId !== p.customerId) continue; cands.push({ rule: r, specificity: 3, source: 'customer' }); continue; }
    if (r.segmentId) { if (!segmentId || r.segmentId !== segmentId) continue; cands.push({ rule: r, specificity: 2, source: 'segment' }); continue; }
    if (r.agencyLevel !== null) { if (level === null || r.agencyLevel !== level) continue; cands.push({ rule: r, specificity: 1, source: 'agency_level' }); continue; }
    cands.push({ rule: r, specificity: 0, source: 'default' });
  }
  if (cands.length === 0) return { found: false, productCode: p.productCode, qty };
  cands.sort((a, b) =>
    b.specificity - a.specificity
    || b.rule.priority - a.rule.priority
    || b.rule.minQty - a.rule.minQty
    || cmpV(a.rule.unitPrice, b.rule.unitPrice));
  const best = cands[0]!;
  const eff = subV(best.rule.unitPrice, pctOf(best.rule.unitPrice, best.rule.discountPct));
  return {
    found: true, productCode: p.productCode, qty,
    unitPrice: best.rule.unitPrice, discountPct: best.rule.discountPct,
    effectiveUnitPrice: eff, source: best.source, ruleId: best.rule.id,
  };
}

/* ---------- CREDIT ---------- */
const OPEN_STATUSES = ['confirmed', 'delivering', 'delivered', 'invoiced'];

/** Phơi nhiễm = Σ grandTotal đơn mở − Σ tiền đã thu (deposit/payment; refund cộng ngược). Có thể âm (khách ứng trước). */
export async function creditExposure(db: Db, ctx: Ctx, customerId: string): Promise<string> {
  const open = await db.select().from(ssOrders).where(and(
    eq(ssOrders.orgId, ctx.orgId), eq(ssOrders.customerId, customerId), inArray(ssOrders.status, OPEN_STATUSES),
  ));
  const openIds = open.map((o) => o.id);
  const pays = await db.select().from(ssPayments).where(and(
    eq(ssPayments.orgId, ctx.orgId), eq(ssPayments.customerId, customerId),
    openIds.length ? or(isNull(ssPayments.orderId), inArray(ssPayments.orderId, openIds))! : isNull(ssPayments.orderId),
  ));
  const ordered = open.reduce((a, o) => addV(a, o.grandTotal), ZERO);
  const paid = pays.reduce((a, x) => addV(a, x.kind === 'refund' ? `-${x.amount}` : x.amount), ZERO);
  return subV(ordered, paid);
}

export async function creditCheck(db: Db, ctx: Ctx, p: { customerId: string; extraAmount?: string }) {
  await getCustomer(db, ctx, p.customerId);
  const rows = await db.select().from(ssCreditLimits)
    .where(and(eq(ssCreditLimits.orgId, ctx.orgId), eq(ssCreditLimits.customerId, p.customerId)));
  const limit = rows[0]?.limitAmount ?? ZERO;
  const hold = rows[0]?.hold ?? false;
  const exposure = await creditExposure(db, ctx, p.customerId);
  const available = subV(limit, exposure);
  const extra = p.extraAmount ?? ZERO;
  return {
    customerId: p.customerId, limit, exposure, available,
    hold, holdReason: rows[0]?.holdReason ?? null,
    hasLimit: !!rows[0],
    wouldExceed: cmpV(extra, available) > 0,
  };
}

export async function setCreditLimit(db: Db, ctx: Ctx, p: { customerId: string; limitAmount: string; paymentTermCode?: string }) {
  await getCustomer(db, ctx, p.customerId);
  let paymentTermId: string | null | undefined = undefined;
  if (p.paymentTermCode) {
    const t = await db.select().from(ssPaymentTerms).where(and(eq(ssPaymentTerms.orgId, ctx.orgId), eq(ssPaymentTerms.code, p.paymentTermCode)));
    if (!t[0]) bad('TERM_NOT_FOUND', `Không có điều khoản ${p.paymentTermCode}`);
    paymentTermId = t[0]!.id;
  }
  const existing = await db.select().from(ssCreditLimits)
    .where(and(eq(ssCreditLimits.orgId, ctx.orgId), eq(ssCreditLimits.customerId, p.customerId)));
  if (existing[0]) {
    const [row] = await db.update(ssCreditLimits)
      .set({ limitAmount: p.limitAmount, ...(paymentTermId !== undefined ? { paymentTermId } : {}), updatedBy: ctx.userId, updatedAt: nowOf(ctx) })
      .where(and(eq(ssCreditLimits.orgId, ctx.orgId), eq(ssCreditLimits.id, existing[0]!.id))).returning();
    return row!;
  }
  const [row] = await db.insert(ssCreditLimits).values({
    orgId: ctx.orgId, customerId: p.customerId, limitAmount: p.limitAmount,
    paymentTermId: paymentTermId ?? null, updatedBy: ctx.userId, updatedAt: nowOf(ctx),
  }).returning();
  return row!;
}

export async function creditHoldToggle(db: Db, ctx: Ctx, p: { customerId: string; hold: boolean; reason?: string }) {
  await getCustomer(db, ctx, p.customerId);
  if (p.hold && !p.reason) bad('REASON_REQUIRED', 'Khoá công nợ phải kèm lý do');
  const existing = await db.select().from(ssCreditLimits)
    .where(and(eq(ssCreditLimits.orgId, ctx.orgId), eq(ssCreditLimits.customerId, p.customerId)));
  if (existing[0]) {
    const [row] = await db.update(ssCreditLimits)
      .set({ hold: p.hold, holdReason: p.hold ? p.reason! : null, updatedBy: ctx.userId, updatedAt: nowOf(ctx) })
      .where(and(eq(ssCreditLimits.orgId, ctx.orgId), eq(ssCreditLimits.id, existing[0]!.id))).returning();
    return row!;
  }
  const [row] = await db.insert(ssCreditLimits).values({
    orgId: ctx.orgId, customerId: p.customerId, limitAmount: ZERO,
    hold: p.hold, holdReason: p.hold ? p.reason! : null, updatedBy: ctx.userId, updatedAt: nowOf(ctx),
  }).returning();
  return row!;
}

export async function setPaymentTerm(db: Db, ctx: Ctx, p: { customerId: string; termCode: string }) {
  const r = await setCreditLimitTermOnly(db, ctx, p);
  return r;
}
async function setCreditLimitTermOnly(db: Db, ctx: Ctx, p: { customerId: string; termCode: string }) {
  await getCustomer(db, ctx, p.customerId);
  const t = await db.select().from(ssPaymentTerms).where(and(eq(ssPaymentTerms.orgId, ctx.orgId), eq(ssPaymentTerms.code, p.termCode)));
  if (!t[0]) bad('TERM_NOT_FOUND', `Không có điều khoản ${p.termCode}`);
  const existing = await db.select().from(ssCreditLimits)
    .where(and(eq(ssCreditLimits.orgId, ctx.orgId), eq(ssCreditLimits.customerId, p.customerId)));
  if (existing[0]) {
    const [row] = await db.update(ssCreditLimits).set({ paymentTermId: t[0]!.id, updatedBy: ctx.userId, updatedAt: nowOf(ctx) })
      .where(and(eq(ssCreditLimits.orgId, ctx.orgId), eq(ssCreditLimits.id, existing[0]!.id))).returning();
    return { customerId: p.customerId, term: p.termCode, creditRow: row! };
  }
  const [row] = await db.insert(ssCreditLimits).values({
    orgId: ctx.orgId, customerId: p.customerId, limitAmount: ZERO, paymentTermId: t[0]!.id, updatedBy: ctx.userId, updatedAt: nowOf(ctx),
  }).returning();
  return { customerId: p.customerId, term: p.termCode, creditRow: row! };
}

export async function listPaymentTerms(db: Db, ctx: Ctx) {
  return db.select().from(ssPaymentTerms).where(eq(ssPaymentTerms.orgId, ctx.orgId)).orderBy(ssPaymentTerms.days);
}
