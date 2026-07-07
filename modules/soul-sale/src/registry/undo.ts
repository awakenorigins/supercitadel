/** SOUL-SALE 1A — registry/undo.ts: Hoàn tác (Ctrl+Z) cho write actions.
 *  Mỗi action có UndoDef: snapshot (chụp trạng thái TRƯỚC khi chạy) + undo (đảo ngược bằng input/result/snapshot).
 *  29/34 action hoàn tác được; 5 action không thể lùi an toàn có reason rõ ràng.
 *  Nguyên tắc: KHÔNG hard-delete dữ liệu gốc khi có lịch sử giao dịch — ưu tiên soft (status inactive) hoặc khôi phục giá trị cũ. */
import { and, eq, inArray } from 'drizzle-orm';
import type { Db, Ctx } from '../contract.js';
import {
  ssCustomers, ssCustomerRelationships, ssAgencyProfiles, ssRetailerProfiles, ssCustomerContacts, ssCustomerAddresses,
  ssLeads, ssDeals, ssActivities, ssQuotes, ssQuoteItems, ssOrders, ssOrderItems, ssOrderStatusLog,
  ssPayments, ssCreditLimits, ssPriceRules, ssTargets, ssCommissionPlans, ssCommissionEntries,
  ssDebtSnapshots, ssImportRows, ssImportBatches, ssReconciliationCases, ssSplitResults, ssAgencyStatements, ssSuggestions,
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
  'soulsale.customer.merge': {
    // Chụp ĐẦY ĐỦ những gì thuộc về khách nguồn TRƯỚC khi gộp → undo repoint ngược đúng các bản ghi gốc,
    // dữ liệu mới phát sinh cho khách đích SAU khi gộp không bị ảnh hưởng.
    snapshot: async (db, ctx, p) => {
      const src = str(p.sourceId);
      const ids = async (tbl: any, col: any) => (await db.select({ id: tbl.id }).from(tbl).where(and(eq(tbl.orgId, ctx.orgId), eq(col, src)))).map((r: { id: string }) => r.id);
      const rels = await db.select().from(ssCustomerRelationships).where(and(eq(ssCustomerRelationships.orgId, ctx.orgId), eq(ssCustomerRelationships.descendantId, src)));
      const rels2 = await db.select().from(ssCustomerRelationships).where(and(eq(ssCustomerRelationships.orgId, ctx.orgId), eq(ssCustomerRelationships.ancestorId, src)));
      const ag = await db.select().from(ssAgencyProfiles).where(and(eq(ssAgencyProfiles.orgId, ctx.orgId), eq(ssAgencyProfiles.customerId, src)));
      const rt = await db.select().from(ssRetailerProfiles).where(and(eq(ssRetailerProfiles.orgId, ctx.orgId), eq(ssRetailerProfiles.customerId, src)));
      const cr = await db.select().from(ssCreditLimits).where(and(eq(ssCreditLimits.orgId, ctx.orgId), eq(ssCreditLimits.customerId, src)));
      const dstCr = await db.select().from(ssCreditLimits).where(and(eq(ssCreditLimits.orgId, ctx.orgId), eq(ssCreditLimits.customerId, str(p.targetId))));
      const cust = await custRow(db, ctx, src);
      return {
        contacts: await ids(ssCustomerContacts, ssCustomerContacts.customerId),
        addresses: await ids(ssCustomerAddresses, ssCustomerAddresses.customerId),
        deals: await ids(ssDeals, ssDeals.customerId),
        quotes: await ids(ssQuotes, ssQuotes.customerId),
        orders: await ids(ssOrders, ssOrders.customerId),
        payments: await ids(ssPayments, ssPayments.customerId),
        importRows: await ids(ssImportRows, ssImportRows.matchedCustomerId),
        debtSnaps: await ids(ssDebtSnapshots, ssDebtSnapshots.customerId),
        statements: await ids(ssAgencyStatements, ssAgencyStatements.agencyCustomerId),
        suggestions: (await db.select({ id: ssSuggestions.id }).from(ssSuggestions).where(and(eq(ssSuggestions.orgId, ctx.orgId), eq(ssSuggestions.refType, 'customer'), eq(ssSuggestions.refId, src)))).map((r) => r.id),
        targets: (await db.select({ id: ssTargets.id }).from(ssTargets).where(and(eq(ssTargets.orgId, ctx.orgId), eq(ssTargets.scope, 'agency'), eq(ssTargets.scopeId, src)))).map((r) => r.id),
        commEntries: (await db.select({ id: ssCommissionEntries.id }).from(ssCommissionEntries).where(and(eq(ssCommissionEntries.orgId, ctx.orgId), eq(ssCommissionEntries.beneficiaryType, 'agency'), eq(ssCommissionEntries.beneficiaryId, src)))).map((r) => r.id),
        relationships: [...rels, ...rels2].map((r) => ({ ancestorId: r.ancestorId, descendantId: r.descendantId, depth: r.depth })),
        agencyProfile: ag[0] ?? null, retailerProfile: rt[0] ?? null,
        srcCredit: cr[0] ?? null, dstHadCredit: dstCr.length > 0,
        custStatus: cust?.status ?? 'active',
      };
    },
    undo: async (db, ctx, e) => {
      const s = e.snapshot; if (!s) return bad('NO_SNAPSHOT', 'Không có bản chụp trước đó');
      const src = str(e.input.sourceId); const dst = str(e.input.targetId);
      const cust = await custRow(db, ctx, src);
      if (!cust || cust.status !== 'merged' || cust.mergedInto !== dst) bad('MOVED_ON', 'Khách nguồn không còn ở trạng thái vừa gộp — không lùi được nữa');
      const back = async (tbl: any, col: string, idList: unknown) => {
        const list = (idList as string[]) ?? [];
        if (list.length) await db.update(tbl).set({ [col]: src } as never).where(and(eq(tbl.orgId, ctx.orgId), inArray(tbl.id, list)));
      };
      await back(ssCustomerContacts, 'customerId', s.contacts);
      await back(ssCustomerAddresses, 'customerId', s.addresses);
      await back(ssDeals, 'customerId', s.deals);
      await back(ssQuotes, 'customerId', s.quotes);
      await back(ssOrders, 'customerId', s.orders);
      await back(ssPayments, 'customerId', s.payments);
      await back(ssImportRows, 'matchedCustomerId', s.importRows);
      await back(ssDebtSnapshots, 'customerId', s.debtSnaps);
      await back(ssAgencyStatements, 'agencyCustomerId', s.statements);
      await back(ssSuggestions, 'refId', s.suggestions);
      await back(ssTargets, 'scopeId', s.targets);
      await back(ssCommissionEntries, 'beneficiaryId', s.commEntries);
      // credit: lúc gộp — đích chưa có thì row nguồn bị repoint sang đích; đích có rồi thì row nguồn bị xoá
      const sc = s.srcCredit as Record<string, unknown> | null;
      if (sc) {
        if (!s.dstHadCredit) await db.update(ssCreditLimits).set({ customerId: src }).where(and(eq(ssCreditLimits.orgId, ctx.orgId), eq(ssCreditLimits.id, str(sc.id))));
        else await db.insert(ssCreditLimits).values({ orgId: ctx.orgId, customerId: src, limitAmount: str(sc.limitAmount ?? '0'), hold: !!sc.hold, holdReason: (sc.holdReason as string | null), paymentTermId: (sc.paymentTermId as string | null), updatedBy: ctx.userId, updatedAt: new Date() }).onConflictDoNothing();
      }
      // hồ sơ kênh + quan hệ cây
      const ap = s.agencyProfile as Record<string, unknown> | null;
      if (ap) await db.insert(ssAgencyProfiles).values({ orgId: ctx.orgId, customerId: src, level: Number(ap.level ?? 1), parentAgencyCustomerId: (ap.parentAgencyCustomerId as string | null), territoryId: (ap.territoryId as string | null), discountTier: (ap.discountTier as string | null), managerUserId: (ap.managerUserId as string | null), createdBy: ctx.userId }).onConflictDoNothing();
      const rp = s.retailerProfile as Record<string, unknown> | null;
      if (rp) await db.insert(ssRetailerProfiles).values({ orgId: ctx.orgId, customerId: src, parentAgencyCustomerId: (rp.parentAgencyCustomerId as string | null), shopType: (rp.shopType as string | null), territoryId: (rp.territoryId as string | null), createdBy: ctx.userId }).onConflictDoNothing();
      const rels = (s.relationships as { ancestorId: string; descendantId: string; depth: number }[]) ?? [];
      if (rels.length) await db.insert(ssCustomerRelationships).values(rels.map((r) => ({ orgId: ctx.orgId, ...r }))).onConflictDoNothing();
      await db.update(ssCustomers).set({ status: str(s.custStatus ?? 'active'), mergedInto: null, updatedAt: new Date() }).where(and(eq(ssCustomers.orgId, ctx.orgId), eq(ssCustomers.id, src)));
      return { unmerged: src, restoredFrom: dst };
    },
  },

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
  'soulsale.commission.post': {
    // Chụp ID các entry ĐÃ có trước khi chốt → undo xoá đúng các entry MỚI sinh ra lần này (chỉ khi chưa trả tiền).
    snapshot: async (db, ctx, p) => {
      const before = await db.select({ id: ssCommissionEntries.id }).from(ssCommissionEntries)
        .where(and(eq(ssCommissionEntries.orgId, ctx.orgId), eq(ssCommissionEntries.period, str(p.period))));
      return { beforeIds: before.map((r) => r.id) };
    },
    undo: async (db, ctx, e) => {
      const s = e.snapshot; if (!s) return bad('NO_SNAPSHOT', 'Không có bản chụp trước đó');
      const beforeIds = new Set((s.beforeIds as string[]) ?? []);
      const now = await db.select().from(ssCommissionEntries).where(and(eq(ssCommissionEntries.orgId, ctx.orgId), eq(ssCommissionEntries.period, str(e.input.period))));
      const created = now.filter((r) => !beforeIds.has(r.id));
      if (!created.length) return { deleted: 0 };
      const paid = created.filter((r) => r.status !== 'posted');
      if (paid.length) bad('ALREADY_PAID', `${paid.length} dòng hoa hồng đã trả/đảo — không gỡ tự động được nữa`);
      await db.delete(ssCommissionEntries).where(and(eq(ssCommissionEntries.orgId, ctx.orgId), inArray(ssCommissionEntries.id, created.map((r) => r.id))));
      return { deleted: created.length, period: e.input.period as string };
    },
  },
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
  'soulsale.import.batch-reconcile': {
    snapshot: async (db, ctx, p) => {
      const b = await db.select().from(ssImportBatches).where(and(eq(ssImportBatches.orgId, ctx.orgId), eq(ssImportBatches.id, str(p.batchId))));
      const pend = await db.select({ id: ssImportRows.id }).from(ssImportRows).where(and(eq(ssImportRows.orgId, ctx.orgId), eq(ssImportRows.batchId, str(p.batchId)), eq(ssImportRows.status, 'pending')));
      const cases = await db.select({ id: ssReconciliationCases.id }).from(ssReconciliationCases).where(and(eq(ssReconciliationCases.orgId, ctx.orgId), eq(ssReconciliationCases.batchId, str(p.batchId))));
      return { batchStatus: b[0]?.status ?? 'uploaded', exceptionCount: b[0]?.exceptionCount ?? 0, pendingRowIds: pend.map((r) => r.id), beforeCaseIds: cases.map((r) => r.id) };
    },
    undo: async (db, ctx, e) => {
      const s = e.snapshot; if (!s) return bad('NO_SNAPSHOT', 'Không có bản chụp trước đó');
      const batchId = str(e.input.batchId);
      const b = await db.select().from(ssImportBatches).where(and(eq(ssImportBatches.orgId, ctx.orgId), eq(ssImportBatches.id, batchId)));
      if (!b[0]) bad('GONE', 'Batch không còn');
      if (['confirmed', 'void'].includes(b[0]!.status)) bad('MOVED_ON', `Batch đã ${b[0]!.status === 'confirmed' ? 'chốt' : 'hủy'} — không lùi đối soát được nữa`);
      const rowIds = (s.pendingRowIds as string[]) ?? [];
      if (rowIds.length) {
        const touched = await db.select().from(ssImportRows).where(and(eq(ssImportRows.orgId, ctx.orgId), inArray(ssImportRows.id, rowIds)));
        const resolved = touched.filter((r) => r.status === 'resolved');
        if (resolved.length) bad('ROWS_RESOLVED', `${resolved.length} dòng đã được xử lý tay sau đối soát — hoàn tác các xử lý dòng đó trước`);
        await db.update(ssImportRows).set({ status: 'pending', matchedCustomerId: null, confidence: '0', exceptionKind: null })
          .where(and(eq(ssImportRows.orgId, ctx.orgId), inArray(ssImportRows.id, rowIds)));
      }
      const beforeCases = new Set((s.beforeCaseIds as string[]) ?? []);
      const nowCases = await db.select({ id: ssReconciliationCases.id }).from(ssReconciliationCases).where(and(eq(ssReconciliationCases.orgId, ctx.orgId), eq(ssReconciliationCases.batchId, batchId)));
      const newCases = nowCases.map((c) => c.id).filter((id) => !beforeCases.has(id));
      if (newCases.length) await db.delete(ssReconciliationCases).where(and(eq(ssReconciliationCases.orgId, ctx.orgId), inArray(ssReconciliationCases.id, newCases)));
      await db.update(ssImportBatches).set({ status: str(s.batchStatus ?? 'uploaded'), exceptionCount: Number(s.exceptionCount ?? 0), updatedAt: new Date() })
        .where(and(eq(ssImportBatches.orgId, ctx.orgId), eq(ssImportBatches.id, batchId)));
      return { reverted: batchId, rowsBackToPending: rowIds.length, casesRemoved: newCases.length };
    },
  },
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
  'soulsale.import.split-confirm': {
    snapshot: async (db, ctx, p) => {
      const b = await db.select().from(ssImportBatches).where(and(eq(ssImportBatches.orgId, ctx.orgId), eq(ssImportBatches.id, str(p.batchId))));
      return { batchStatus: b[0]?.status ?? 'ready' };
    },
    undo: async (db, ctx, e) => {
      const batchId = str(e.input.batchId);
      const b = await db.select().from(ssImportBatches).where(and(eq(ssImportBatches.orgId, ctx.orgId), eq(ssImportBatches.id, batchId)));
      if (!b[0]) bad('GONE', 'Batch không còn');
      if (b[0]!.status !== 'confirmed') bad('NOT_CONFIRMED', 'Batch không ở trạng thái đã chốt');
      await db.delete(ssAgencyStatements).where(and(eq(ssAgencyStatements.orgId, ctx.orgId), eq(ssAgencyStatements.batchId, batchId)));
      await db.update(ssSplitResults).set({ confirmed: false }).where(and(eq(ssSplitResults.orgId, ctx.orgId), eq(ssSplitResults.batchId, batchId)));
      await db.update(ssImportBatches).set({ status: str(e.snapshot?.batchStatus ?? 'ready'), updatedAt: new Date() }).where(and(eq(ssImportBatches.orgId, ctx.orgId), eq(ssImportBatches.id, batchId)));
      return { reopened: batchId, statementRemoved: true };
    },
  },
  'soulsale.import.batch-void': {
    snapshot: async (db, ctx, p) => {
      const batchId = str(p.batchId);
      const b = await db.select().from(ssImportBatches).where(and(eq(ssImportBatches.orgId, ctx.orgId), eq(ssImportBatches.id, batchId)));
      const rows = await db.select({ id: ssImportRows.id, status: ssImportRows.status }).from(ssImportRows)
        .where(and(eq(ssImportRows.orgId, ctx.orgId), eq(ssImportRows.batchId, batchId), inArray(ssImportRows.status, ['pending', 'exception', 'ok', 'resolved'])));
      const cases = await db.select({ id: ssReconciliationCases.id }).from(ssReconciliationCases)
        .where(and(eq(ssReconciliationCases.orgId, ctx.orgId), eq(ssReconciliationCases.batchId, batchId), eq(ssReconciliationCases.status, 'open')));
      return { batchStatus: b[0]?.status ?? 'uploaded', exceptionCount: b[0]?.exceptionCount ?? 0, rowStates: rows, openCaseIds: cases.map((c) => c.id) };
    },
    undo: async (db, ctx, e) => {
      const s = e.snapshot; if (!s) return bad('NO_SNAPSHOT', 'Không có bản chụp trước đó');
      const batchId = str(e.input.batchId);
      const b = await db.select().from(ssImportBatches).where(and(eq(ssImportBatches.orgId, ctx.orgId), eq(ssImportBatches.id, batchId)));
      if (!b[0]) bad('GONE', 'Batch không còn');
      if (b[0]!.status !== 'void') bad('NOT_VOID', 'Batch không ở trạng thái đã hủy');
      // khôi phục trạng thái từng dòng theo nhóm status cũ
      const rowStates = (s.rowStates as { id: string; status: string }[]) ?? [];
      const byStatus = new Map<string, string[]>();
      for (const r of rowStates) { const l = byStatus.get(r.status) ?? []; l.push(r.id); byStatus.set(r.status, l); }
      for (const [status, ids] of byStatus) {
        await db.update(ssImportRows).set({ status }).where(and(eq(ssImportRows.orgId, ctx.orgId), inArray(ssImportRows.id, ids)));
      }
      const openIds = (s.openCaseIds as string[]) ?? [];
      if (openIds.length) {
        await db.update(ssReconciliationCases).set({ status: 'open', resolution: null, resolvedBy: null, resolvedAt: null })
          .where(and(eq(ssReconciliationCases.orgId, ctx.orgId), inArray(ssReconciliationCases.id, openIds)));
      }
      await db.update(ssImportBatches).set({ status: str(s.batchStatus ?? 'uploaded'), exceptionCount: Number(s.exceptionCount ?? 0), updatedAt: new Date() })
        .where(and(eq(ssImportBatches.orgId, ctx.orgId), eq(ssImportBatches.id, batchId)));
      return { restored: batchId, rows: rowStates.length, casesReopened: openIds.length };
    },
  },
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
