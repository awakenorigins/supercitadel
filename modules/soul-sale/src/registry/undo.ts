/** SOUL-SALE 1A — registry/undo.ts: Hoàn tác (Ctrl+Z) cho write actions.
 *  Mỗi action có UndoDef: snapshot (chụp trạng thái TRƯỚC khi chạy) + undo (đảo ngược bằng input/result/snapshot).
 *  29/34 action hoàn tác được; 5 action không thể lùi an toàn có reason rõ ràng.
 *  Nguyên tắc: KHÔNG hard-delete dữ liệu gốc khi có lịch sử giao dịch — ưu tiên soft (status inactive) hoặc khôi phục giá trị cũ. */
import { and, eq, inArray } from 'drizzle-orm';
import type { Db, Ctx } from '../contract.js';
import {
  ssCustomers, ssCustomerRelationships, ssAgencyProfiles, ssRetailerProfiles,
  ssLeads, ssDeals, ssActivities, ssQuotes, ssQuoteItems, ssOrders, ssOrderItems, ssOrderStatusLog,
  ssPayments, ssCreditLimits, ssPriceRules, ssTargets, ssCommissionPlans, ssCommissionEntries,
  ssDebtSnapshots, ssImportRows,
} from '../schema.js';
import { bad } from '../lib/util.js';
import { moveAgency, subtreeIds } from '../services/master.service.js';
import { voidBatch } from '../services/splitter.service.js';

export interface UndoEntryData {
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  snapshot: Record<string, unknown> | null;
}
export interface UndoDef {
  /** Chụp trạng thái trước khi handler chạy (đọc-không-ghi). */
  snapshot?: (db: Db, ctx: Ctx, params: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  /** Đảo ngược thao tác. Throw SsError nếu không thể lùi (trạng thái đã đổi tiếp). */
  undo?: (db: Db, ctx: Ctx, e: UndoEntryData) => Promise<Record<string, unknown>>;
  /** Lý do không hoàn tác được (action không có undo). */
  reason?: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : String(v ?? ''));

async function custRow(db: Db, ctx: Ctx, id: string) {
  const r = await db.select().from(ssCustomers).where(and(eq(ssCustomers.orgId, ctx.orgId), eq(ssCustomers.id, id)));
  return r[0] ?? null;
}
async function creditRow(db: Db, ctx: Ctx, customerId: string) {
  const r = await db.select().from(ssCreditLimits).where(and(eq(ssCreditLimits.orgId, ctx.orgId), eq(ssCreditLimits.customerId, customerId)));
  return r[0] ?? null;
}
async function profileParents(db: Db, ctx: Ctx, customerId: string) {
  const ag = await db.select().from(ssAgencyProfiles).where(and(eq(ssAgencyProfiles.orgId, ctx.orgId), eq(ssAgencyProfiles.customerId, customerId)));
  const rt = await db.select().from(ssRetailerProfiles).where(and(eq(ssRetailerProfiles.orgId, ctx.orgId), eq(ssRetailerProfiles.customerId, customerId)));
  return { agencyParent: ag[0]?.parentAgencyCustomerId ?? null, retailerParent: rt[0]?.parentAgencyCustomerId ?? null, agencyTerr: ag[0]?.territoryId ?? null, retailerTerr: rt[0]?.territoryId ?? null, hasAgency: !!ag[0], hasRetailer: !!rt[0] };
}
/** Ẩn node kênh mới tạo: chỉ khi chưa có tuyến dưới. */
async function undoCreateChannelNode(db: Db, ctx: Ctx, e: UndoEntryData, label: string) {
  const id = str(e.result?.id);
  if (!id) bad('NO_RESULT', 'Thiếu id trong kết quả gốc');
  const sub = await subtreeIds(db, ctx, id);
  if (sub.length > 1) bad('HAS_CHILDREN', `${label} này đã có ${sub.length - 1} tuyến dưới — chuyển tuyến dưới đi trước rồi mới hoàn tác được`);
  await db.delete(ssCustomerRelationships).where(and(eq(ssCustomerRelationships.orgId, ctx.orgId), eq(ssCustomerRelationships.descendantId, id)));
  await db.update(ssCustomers).set({ status: 'inactive' }).where(and(eq(ssCustomers.orgId, ctx.orgId), eq(ssCustomers.id, id)));
  return { hidden: id };
}

export const UNDO_DEFS: Record<string, UndoDef> = {
  /* ============ KHÁCH ============ */
  'soulsale.customer.create': {
    undo: async (db, ctx, e) => {
      const id = str(e.result?.id);
      await db.update(ssCustomers).set({ status: 'inactive' }).where(and(eq(ssCustomers.orgId, ctx.orgId), eq(ssCustomers.id, id)));
      return { hidden: id };
    },
  },
  'soulsale.customer.update': {
    snapshot: async (db, ctx, p) => {
      const c = await custRow(db, ctx, str(p.customerId));
      return c ? { name: c.name, nameNorm: c.nameNorm, phone: c.phone, email: c.email, taxCode: c.taxCode, segmentId: c.segmentId, ownerUserId: c.ownerUserId, note: c.note } : null;
    },
    undo: async (db, ctx, e) => {
      const s = e.snapshot; if (!s) return bad('NO_SNAPSHOT', 'Không có bản chụp trước đó');
      await db.update(ssCustomers).set(s as Record<string, string | null>).where(and(eq(ssCustomers.orgId, ctx.orgId), eq(ssCustomers.id, str(e.input.customerId))));
      return { restored: e.input.customerId as string };
    },
  },
  'soulsale.customer.merge': { reason: 'Gộp khách dồn toàn bộ giao dịch — không thể tách ngược an toàn. Liên hệ quản trị nếu gộp nhầm.' },

  /* ============ KÊNH ============ */
  'soulsale.agency.create': { undo: (db, ctx, e) => undoCreateChannelNode(db, ctx, e, 'Đại lý') },
  'soulsale.retailer.create': { undo: (db, ctx, e) => undoCreateChannelNode(db, ctx, e, 'Điểm bán') },
  'soulsale.agency.move': {
    snapshot: async (db, ctx, p) => {
      const pr = await profileParents(db, ctx, str(p.customerId));
      return { oldParent: pr.hasAgency ? pr.agencyParent : pr.retailerParent };
    },
    undo: async (db, ctx, e) => {
      const oldParent = (e.snapshot?.oldParent as string | null) ?? null;
      return (await moveAgency(db, ctx, { customerId: str(e.input.customerId), newParentId: oldParent })) as unknown as Record<string, unknown>;
    },
  },
  'soulsale.territory.assign': {
    snapshot: async (db, ctx, p) => {
      const pr = await profileParents(db, ctx, str(p.customerId));
      return { agencyTerr: pr.agencyTerr, retailerTerr: pr.retailerTerr, hasAgency: pr.hasAgency, hasRetailer: pr.hasRetailer };
    },
    undo: async (db, ctx, e) => {
      const id = str(e.input.customerId);
      if (e.snapshot?.hasAgency) await db.update(ssAgencyProfiles).set({ territoryId: (e.snapshot.agencyTerr as string | null) }).where(and(eq(ssAgencyProfiles.orgId, ctx.orgId), eq(ssAgencyProfiles.customerId, id)));
      if (e.snapshot?.hasRetailer) await db.update(ssRetailerProfiles).set({ territoryId: (e.snapshot.retailerTerr as string | null) }).where(and(eq(ssRetailerProfiles.orgId, ctx.orgId), eq(ssRetailerProfiles.customerId, id)));
      return { restored: id };
    },
  },

  /* ============ CRM ============ */
  'soulsale.lead.create': {
    undo: async (db, ctx, e) => {
      const id = str(e.result?.id);
      const l = await db.select().from(ssLeads).where(and(eq(ssLeads.orgId, ctx.orgId), eq(ssLeads.id, id)));
      if (!l[0]) bad('GONE', 'Lead không còn');
      if (l[0]!.status === 'converted') bad('CONVERTED', 'Lead đã convert thành khách — hoàn tác convert trước');
      await db.delete(ssLeads).where(and(eq(ssLeads.orgId, ctx.orgId), eq(ssLeads.id, id)));
      return { deleted: id };
    },
  },
  'soulsale.lead.assign': {
    snapshot: async (db, ctx, p) => {
      const l = await db.select().from(ssLeads).where(and(eq(ssLeads.orgId, ctx.orgId), eq(ssLeads.id, str(p.leadId))));
      return l[0] ? { ownerUserId: l[0]!.ownerUserId, status: l[0]!.status } : null;
    },
    undo: async (db, ctx, e) => {
      const s = e.snapshot; if (!s) return bad('NO_SNAPSHOT', 'Không có bản chụp trước đó');
      await db.update(ssLeads).set({ ownerUserId: (s.ownerUserId as string | null), status: str(s.status) }).where(and(eq(ssLeads.orgId, ctx.orgId), eq(ssLeads.id, str(e.input.leadId))));
      return { restored: e.input.leadId as string };
    },
  },
  'soulsale.lead.disqualify': {
    snapshot: async (db, ctx, p) => {
      const l = await db.select().from(ssLeads).where(and(eq(ssLeads.orgId, ctx.orgId), eq(ssLeads.id, str(p.leadId))));
      return l[0] ? { status: l[0]!.status } : null;
    },
    undo: async (db, ctx, e) => {
      await db.update(ssLeads).set({ status: str(e.snapshot?.status ?? 'working'), disqualifyReason: null }).where(and(eq(ssLeads.orgId, ctx.orgId), eq(ssLeads.id, str(e.input.leadId))));
      return { restored: e.input.leadId as string };
    },
  },
  'soulsale.lead.convert': {
    snapshot: async (db, ctx, p) => {
      const l = await db.select().from(ssLeads).where(and(eq(ssLeads.orgId, ctx.orgId), eq(ssLeads.id, str(p.leadId))));
      return l[0] ? { status: l[0]!.status } : null;
    },
    undo: async (db, ctx, e) => {
      const dealId = str(e.result?.dealId); const leadId = str(e.result?.leadId);
      const quotes = await db.select().from(ssQuotes).where(and(eq(ssQuotes.orgId, ctx.orgId), eq(ssQuotes.dealId, dealId)));
      if (quotes.length) bad('HAS_QUOTES', 'Deal từ convert đã có báo giá — không hoàn tác được nữa');
      await db.delete(ssDeals).where(and(eq(ssDeals.orgId, ctx.orgId), eq(ssDeals.id, dealId)));
      await db.update(ssLeads).set({ status: str(e.snapshot?.status ?? 'working'), convertedCustomerId: null, convertedDealId: null }).where(and(eq(ssLeads.orgId, ctx.orgId), eq(ssLeads.id, leadId)));
      if (e.result?.customerReused === false) {
        await db.update(ssCustomers).set({ status: 'inactive' }).where(and(eq(ssCustomers.orgId, ctx.orgId), eq(ssCustomers.id, str(e.result?.customerId))));
      }
      return { leadRestored: leadId, dealDeleted: dealId };
    },
  },
  'soulsale.deal.create': {
    undo: async (db, ctx, e) => {
      const id = str(e.result?.id);
      const quotes = await db.select().from(ssQuotes).where(and(eq(ssQuotes.orgId, ctx.orgId), eq(ssQuotes.dealId, id)));
      if (quotes.length) bad('HAS_QUOTES', 'Deal đã có báo giá gắn vào — không xoá được');
      await db.delete(ssDeals).where(and(eq(ssDeals.orgId, ctx.orgId), eq(ssDeals.id, id)));
      return { deleted: id };
    },
  },
  'soulsale.deal.move-stage': {
    snapshot: async (db, ctx, p) => {
      const d = await db.select().from(ssDeals).where(and(eq(ssDeals.orgId, ctx.orgId), eq(ssDeals.id, str(p.dealId))));
      return d[0] ? { stageId: d[0]!.stageId, status: d[0]!.status, lostReason: d[0]!.lostReason, amount: d[0]!.amount, stageEnteredAt: d[0]!.stageEnteredAt?.toISOString?.() ?? null } : null;
    },
    undo: async (db, ctx, e) => {
      const s = e.snapshot; if (!s) return bad('NO_SNAPSHOT', 'Không có bản chụp trước đó');
      await db.update(ssDeals).set({
        stageId: str(s.stageId), status: str(s.status), lostReason: (s.lostReason as string | null),
        amount: str(s.amount), stageEnteredAt: s.stageEnteredAt ? new Date(str(s.stageEnteredAt)) : new Date(),
      }).where(and(eq(ssDeals.orgId, ctx.orgId), eq(ssDeals.id, str(e.input.dealId))));
      return { restored: e.input.dealId as string };
    },
  },
  'soulsale.activity.log': {
    undo: async (db, ctx, e) => {
      const id = str(e.result?.id);
      await db.delete(ssActivities).where(and(eq(ssActivities.orgId, ctx.orgId), eq(ssActivities.id, id)));
      return { deleted: id };
    },
  },

  /* ============ SALES ============ */
  'soulsale.quote.create': {
    undo: async (db, ctx, e) => {
      const id = str(e.result?.id);
      const q = await db.select().from(ssQuotes).where(and(eq(ssQuotes.orgId, ctx.orgId), eq(ssQuotes.id, id)));
      if (!q[0]) bad('GONE', 'Báo giá không còn');
      if (!['draft', 'sent'].includes(q[0]!.status)) bad('CLOSED', `Báo giá đã ${q[0]!.status} — không xoá được`);
      const orders = await db.select().from(ssOrders).where(and(eq(ssOrders.orgId, ctx.orgId), eq(ssOrders.quoteId, id)));
      if (orders.length) bad('HAS_ORDERS', 'Đã có đơn tạo từ báo giá này');
      await db.delete(ssQuoteItems).where(and(eq(ssQuoteItems.orgId, ctx.orgId), eq(ssQuoteItems.quoteId, id)));
      await db.delete(ssQuotes).where(and(eq(ssQuotes.orgId, ctx.orgId), eq(ssQuotes.id, id)));
      return { deleted: id };
    },
  },
  'soulsale.quote.close': {
    snapshot: async (db, ctx, p) => {
      const q = await db.select().from(ssQuotes).where(and(eq(ssQuotes.orgId, ctx.orgId), eq(ssQuotes.id, str(p.quoteId))));
      return q[0] ? { status: q[0]!.status, closedReason: q[0]!.closedReason } : null;
    },
    undo: async (db, ctx, e) => {
      const s = e.snapshot; if (!s) return bad('NO_SNAPSHOT', 'Không có bản chụp trước đó');
      await db.update(ssQuotes).set({ status: str(s.status), closedReason: (s.closedReason as string | null) }).where(and(eq(ssQuotes.orgId, ctx.orgId), eq(ssQuotes.id, str(e.input.quoteId))));
      return { restored: e.input.quoteId as string };
    },
  },
  'soulsale.order.create': {
    undo: async (db, ctx, e) => {
      const id = str(e.result?.id);
      const o = await db.select().from(ssOrders).where(and(eq(ssOrders.orgId, ctx.orgId), eq(ssOrders.id, id)));
      if (!o[0]) bad('GONE', 'Đơn không còn');
      if (o[0]!.status !== 'draft') bad('NOT_DRAFT', `Đơn đã ${o[0]!.status} — hoàn tác bước sau trước (hoặc hủy đơn)`);
      const pays = await db.select().from(ssPayments).where(and(eq(ssPayments.orgId, ctx.orgId), eq(ssPayments.orderId, id)));
      if (pays.length) bad('HAS_PAYMENTS', 'Đơn đã có tiền ghi nhận — gỡ thanh toán trước');
      await db.delete(ssOrderItems).where(and(eq(ssOrderItems.orgId, ctx.orgId), eq(ssOrderItems.orderId, id)));
      await db.delete(ssOrderStatusLog).where(and(eq(ssOrderStatusLog.orgId, ctx.orgId), eq(ssOrderStatusLog.orderId, id)));
      await db.delete(ssOrders).where(and(eq(ssOrders.orgId, ctx.orgId), eq(ssOrders.id, id)));
      return { deleted: id };
    },
  },
  'soulsale.order.confirm': {
    undo: async (db, ctx, e) => {
      const id = str(e.input.orderId);
      const o = await db.select().from(ssOrders).where(and(eq(ssOrders.orgId, ctx.orgId), eq(ssOrders.id, id)));
      if (!o[0]) bad('GONE', 'Đơn không còn');
      if (o[0]!.status !== 'confirmed') bad('MOVED_ON', `Đơn đã sang ${o[0]!.status} — không lùi về nháp được`);
      await db.update(ssOrders).set({ status: 'draft' }).where(and(eq(ssOrders.orgId, ctx.orgId), eq(ssOrders.id, id)));
      await db.insert(ssOrderStatusLog).values({ orgId: ctx.orgId, orderId: id, fromStatus: 'confirmed', toStatus: 'draft', reason: 'Hoàn tác xác nhận đơn', actorUserId: ctx.userId, at: new Date() });
      return { reverted: id };
    },
  },
  'soulsale.order.cancel': {
    snapshot: async (db, ctx, p) => {
      const o = await db.select().from(ssOrders).where(and(eq(ssOrders.orgId, ctx.orgId), eq(ssOrders.id, str(p.orderId))));
      return o[0] ? { status: o[0]!.status } : null;
    },
    undo: async (db, ctx, e) => {
      const id = str(e.input.orderId);
      const o = await db.select().from(ssOrders).where(and(eq(ssOrders.orgId, ctx.orgId), eq(ssOrders.id, id)));
      if (!o[0] || o[0]!.status !== 'cancelled') bad('NOT_CANCELLED', 'Đơn không ở trạng thái đã hủy');
      const prev = str(e.snapshot?.status ?? 'draft');
      await db.update(ssOrders).set({ status: prev, cancelledAt: null, cancelReason: null }).where(and(eq(ssOrders.orgId, ctx.orgId), eq(ssOrders.id, id)));
      await db.insert(ssOrderStatusLog).values({ orgId: ctx.orgId, orderId: id, fromStatus: 'cancelled', toStatus: prev, reason: 'Hoàn tác hủy đơn', actorUserId: ctx.userId, at: new Date() });
      return { restored: id, status: prev };
    },
  },
  'soulsale.order.hold-toggle': {
    snapshot: async (db, ctx, p) => {
      const o = await db.select().from(ssOrders).where(and(eq(ssOrders.orgId, ctx.orgId), eq(ssOrders.id, str(p.orderId))));
      return o[0] ? { status: o[0]!.status, holdReason: o[0]!.holdReason } : null;
    },
    undo: async (db, ctx, e) => {
      const s = e.snapshot; if (!s) return bad('NO_SNAPSHOT', 'Không có bản chụp trước đó');
      const id = str(e.input.orderId);
      await db.update(ssOrders).set({ status: str(s.status), holdReason: (s.holdReason as string | null) }).where(and(eq(ssOrders.orgId, ctx.orgId), eq(ssOrders.id, id)));
      await db.insert(ssOrderStatusLog).values({ orgId: ctx.orgId, orderId: id, fromStatus: 'undo', toStatus: str(s.status), reason: 'Hoàn tác giữ/thả đơn', actorUserId: ctx.userId, at: new Date() });
      return { restored: id };
    },
  },
  'soulsale.payment.record': {
    undo: async (db, ctx, e) => {
      const id = str(e.result?.id);
      const p = await db.select().from(ssPayments).where(and(eq(ssPayments.orgId, ctx.orgId), eq(ssPayments.id, id)));
      if (!p[0]) bad('GONE', 'Bút toán không còn');
      await db.delete(ssPayments).where(and(eq(ssPayments.orgId, ctx.orgId), eq(ssPayments.id, id)));
      return { deleted: id, amount: p[0]!.amount };
    },
  },
  'soulsale.payment.term-set': {
    snapshot: async (db, ctx, p) => {
      const c = await creditRow(db, ctx, str(p.customerId));
      return { existed: !!c, paymentTermId: c?.paymentTermId ?? null };
    },
    undo: async (db, ctx, e) => {
      const customerId = str(e.input.customerId);
      if (!e.snapshot?.existed) {
        await db.delete(ssCreditLimits).where(and(eq(ssCreditLimits.orgId, ctx.orgId), eq(ssCreditLimits.customerId, customerId)));
        return { removed: customerId };
      }
      await db.update(ssCreditLimits).set({ paymentTermId: (e.snapshot.paymentTermId as string | null) }).where(and(eq(ssCreditLimits.orgId, ctx.orgId), eq(ssCreditLimits.customerId, customerId)));
      return { restored: customerId };
    },
  },

  /* ============ GIÁ / NỢ / CHỈ TIÊU / HOA HỒNG ============ */
  'soulsale.price.rule-set': {
    snapshot: async () => null, // trạng thái cũ suy ra từ result.upserted; rule cũ chụp qua handler riêng phức tạp — dùng result
    undo: async (db, ctx, e) => {
      const id = str(e.result?.id);
      if (e.result?.upserted === 'inserted') {
        await db.delete(ssPriceRules).where(and(eq(ssPriceRules.orgId, ctx.orgId), eq(ssPriceRules.id, id)));
        return { deleted: id };
      }
      bad('WAS_UPDATE', 'Rule này là cập nhật đè giá cũ — đặt lại giá đúng bằng form Đặt giá (giá cũ hiển thị ở phần xem trước lần đặt)');
      return {};
    },
  },
  'soulsale.credit.limit-set': {
    snapshot: async (db, ctx, p) => {
      const c = await creditRow(db, ctx, str(p.customerId));
      return { existed: !!c, limitAmount: c?.limitAmount ?? null, paymentTermId: c?.paymentTermId ?? null };
    },
    undo: async (db, ctx, e) => {
      const customerId = str(e.input.customerId);
      if (!e.snapshot?.existed) {
        await db.delete(ssCreditLimits).where(and(eq(ssCreditLimits.orgId, ctx.orgId), eq(ssCreditLimits.customerId, customerId)));
        return { removed: customerId };
      }
      await db.update(ssCreditLimits).set({ limitAmount: str(e.snapshot.limitAmount), paymentTermId: (e.snapshot.paymentTermId as string | null) }).where(and(eq(ssCreditLimits.orgId, ctx.orgId), eq(ssCreditLimits.customerId, customerId)));
      return { restored: customerId };
    },
  },
  'soulsale.credit.hold-toggle': {
    snapshot: async (db, ctx, p) => {
      const c = await creditRow(db, ctx, str(p.customerId));
      return { existed: !!c, hold: c?.hold ?? false, holdReason: c?.holdReason ?? null };
    },
    undo: async (db, ctx, e) => {
      const customerId = str(e.input.customerId);
      if (!e.snapshot?.existed) {
        await db.delete(ssCreditLimits).where(and(eq(ssCreditLimits.orgId, ctx.orgId), eq(ssCreditLimits.customerId, customerId)));
        return { removed: customerId };
      }
      await db.update(ssCreditLimits).set({ hold: !!e.snapshot.hold, holdReason: (e.snapshot.holdReason as string | null) }).where(and(eq(ssCreditLimits.orgId, ctx.orgId), eq(ssCreditLimits.customerId, customerId)));
      return { restored: customerId };
    },
  },
  'soulsale.target.set': {
    snapshot: async (db, ctx, p) => {
      const scopeId = p.scope === 'org' ? 'org' : str(p.scopeId);
      const t = await db.select().from(ssTargets).where(and(eq(ssTargets.orgId, ctx.orgId), eq(ssTargets.scope, str(p.scope)), eq(ssTargets.scopeId, scopeId), eq(ssTargets.period, str(p.period))));
      return { existed: !!t[0], targetAmount: t[0]?.targetAmount ?? null };
    },
    undo: async (db, ctx, e) => {
      const scopeId = e.input.scope === 'org' ? 'org' : str(e.input.scopeId);
      const w = and(eq(ssTargets.orgId, ctx.orgId), eq(ssTargets.scope, str(e.input.scope)), eq(ssTargets.scopeId, scopeId), eq(ssTargets.period, str(e.input.period)));
      if (!e.snapshot?.existed) { await db.delete(ssTargets).where(w); return { removed: scopeId }; }
      await db.update(ssTargets).set({ targetAmount: str(e.snapshot.targetAmount) }).where(w);
      return { restored: scopeId };
    },
  },
  'soulsale.commission.plan-set': {
    snapshot: async (db, ctx, p) => {
      const r = await db.select().from(ssCommissionPlans).where(and(eq(ssCommissionPlans.orgId, ctx.orgId), eq(ssCommissionPlans.code, str(p.code))));
      return r[0] ? { existed: true, name: r[0]!.name, ratePct: r[0]!.ratePct, beneficiary: r[0]!.beneficiary, basis: r[0]!.basis, active: r[0]!.active } : { existed: false };
    },
    undo: async (db, ctx, e) => {
      const code = str(e.input.code);
      const r = await db.select().from(ssCommissionPlans).where(and(eq(ssCommissionPlans.orgId, ctx.orgId), eq(ssCommissionPlans.code, code)));
      if (!r[0]) bad('GONE', 'Plan không còn');
      if (!e.snapshot?.existed) {
        const entries = await db.select().from(ssCommissionEntries).where(and(eq(ssCommissionEntries.orgId, ctx.orgId), eq(ssCommissionEntries.planId, r[0]!.id)));
        if (entries.length) bad('HAS_ENTRIES', 'Plan đã có hoa hồng ghi sổ — chỉ tắt được (active=false), không xoá');
        await db.delete(ssCommissionPlans).where(and(eq(ssCommissionPlans.orgId, ctx.orgId), eq(ssCommissionPlans.id, r[0]!.id)));
        return { deleted: code };
      }
      await db.update(ssCommissionPlans).set({ name: str(e.snapshot.name), ratePct: str(e.snapshot.ratePct), beneficiary: str(e.snapshot.beneficiary), basis: str(e.snapshot.basis), active: !!e.snapshot.active }).where(and(eq(ssCommissionPlans.orgId, ctx.orgId), eq(ssCommissionPlans.id, r[0]!.id)));
      return { restored: code };
    },
  },
  'soulsale.commission.post': { reason: 'Hoa hồng đã ghi sổ theo kỳ (idempotent) — muốn sửa thì điều chỉnh plan rồi chốt lại kỳ, không lùi trực tiếp.' },
  'soulsale.debt.snapshot-close': {
    undo: async (db, ctx, e) => {
      const period = str(e.input.period);
      const conds = [eq(ssDebtSnapshots.orgId, ctx.orgId), eq(ssDebtSnapshots.period, period)];
      if (e.input.customerId) conds.push(eq(ssDebtSnapshots.customerId, str(e.input.customerId)));
      await db.delete(ssDebtSnapshots).where(and(...conds));
      return { reopened: period };
    },
  },

  /* ============ SPLITTER ============ */
  'soulsale.import.statement-upload': {
    undo: async (db, ctx, e) => {
      const batchId = str(e.result?.batchId);
      return (await voidBatch(db, ctx, { batchId, reason: 'Hoàn tác nạp bảng kê' })) as unknown as Record<string, unknown>;
    },
  },
  'soulsale.import.batch-reconcile': { reason: 'Đối soát chạy lại được bất kỳ lúc nào (ghi đè kết quả cũ) — không cần hoàn tác.' },
  'soulsale.import.row-resolve': {
    snapshot: async (db, ctx, p) => {
      const r = await db.select().from(ssImportRows).where(and(eq(ssImportRows.orgId, ctx.orgId), eq(ssImportRows.id, str(p.rowId))));
      return r[0] ? { status: r[0]!.status, matchedCustomerId: r[0]!.matchedCustomerId, exceptionKind: r[0]!.exceptionKind, confidence: r[0]!.confidence } : null;
    },
    undo: async (db, ctx, e) => {
      const s = e.snapshot; if (!s) return bad('NO_SNAPSHOT', 'Không có bản chụp trước đó');
      await db.update(ssImportRows).set({
        status: str(s.status), matchedCustomerId: (s.matchedCustomerId as string | null),
        exceptionKind: (s.exceptionKind as string | null), confidence: str(s.confidence ?? '0'),
      }).where(and(eq(ssImportRows.orgId, ctx.orgId), eq(ssImportRows.id, str(e.input.rowId))));
      return { restored: e.input.rowId as string };
    },
  },
  'soulsale.import.split-confirm': { reason: 'Bảng kê đã chốt thành statement chính thức — sai thì hủy batch (batch-void) và nạp lại.' },
  'soulsale.import.batch-void': { reason: 'Batch đã hủy giữ nguyên để truy vết — nạp lại file mới thay vì khôi phục.' },
};

/** Tóm tắt ngắn cho danh sách lịch sử (không lộ uuid). */
export function summarize(action: string, input: Record<string, unknown>, result: Record<string, unknown> | null): string {
  const pick = (...keys: string[]) => keys.map((k) => input[k] ?? result?.[k]).filter((v) => v !== undefined && v !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}/.test(String(v))).map(String);
  const parts = pick('name', 'title', 'subject', 'code', 'period', 'productCode', 'termCode', 'stageName', 'outcome', 'kind', 'scope');
  const money = input.amount ?? input.limitAmount ?? input.targetAmount ?? input.unitPrice;
  if (money && /^\d+$/.test(String(money))) parts.push(`${Number(money).toLocaleString('vi-VN')}đ`);
  const rc = result?.code;
  if (rc && !parts.includes(String(rc))) parts.push(String(rc));
  return parts.slice(0, 3).join(' · ');
}
