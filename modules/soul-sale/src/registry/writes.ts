/** SOUL-SALE 1A — registry/writes.ts: 34 write actions (14 L2 sensitive, dry-run→confirm với preview thật). */
import { z } from 'zod';
import type { WriteActionDef } from '../contract.js';
import * as M from '../services/master.service.js';
import * as C from '../services/crm.service.js';
import * as P from '../services/pricing.service.js';
import * as S from '../services/sales.service.js';
import * as F from '../services/finance.service.js';
import * as SP from '../services/splitter.service.js';
import { fmtV } from '../lib/util.js';

const vnd = z.string().regex(/^\d+$/, 'tiền VND nguyên dương, dạng chuỗi số');
const pct = z.string().regex(/^\d+(\.\d{1,2})?$/, 'phần trăm dạng "2" hoặc "2.50"');
const period = z.string().regex(/^\d{4}-\d{2}$/, 'period dạng YYYY-MM');
const uuid = z.string().uuid();
const itemSchema = z.object({
  productCode: z.string(), productName: z.string(), qty: z.number().int().min(1),
  unit: z.string().optional(), unitPrice: vnd.optional(), discountPct: pct.optional(), taxRatePct: pct.optional(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const def = <P_>(d: WriteActionDef<P_, any>) => d as WriteActionDef;
const L1 = { securityLevel: 1 as const, sensitive: false };
const L2 = { securityLevel: 2 as const, sensitive: true };

export const writeActions: WriteActionDef[] = [
  /* ============ MASTER / KÊNH ============ */
  def({
    name: 'soulsale.customer.create', permission: 'soulsale.customer.write', ...L1,
    description: 'Tạo khách hàng mới (person/company/agency/retailer/distributor)',
    params: z.object({
      kind: z.enum(['person', 'company', 'agency', 'retailer', 'distributor']), name: z.string().min(1),
      phone: z.string().optional(), email: z.string().optional(), taxCode: z.string().optional(),
      segmentCode: z.string().optional(), ownerUserId: z.string().optional(), note: z.string().optional(),
    }),
    handler: (db, ctx, p) => M.createCustomer(db, ctx, p),
    examples: ['tạo khách mới tên Chị Út, SĐT 0988...'],
  }),
  def({
    name: 'soulsale.customer.update', permission: 'soulsale.customer.write', ...L1,
    description: 'Cập nhật thông tin khách (tên/SĐT/email/segment/ghi chú/người phụ trách)',
    params: z.object({
      customerId: uuid, name: z.string().optional(), phone: z.string().optional(), email: z.string().optional(),
      taxCode: z.string().optional(), segmentCode: z.string().optional(), ownerUserId: z.string().optional(), note: z.string().optional(),
    }),
    handler: (db, ctx, p) => M.updateCustomer(db, ctx, p),
    examples: ['đổi SĐT khách KH-0002 thành 0909...'],
  }),
  def({
    name: 'soulsale.customer.merge', permission: 'soulsale.customer.write', ...L2,
    description: 'Gộp khách trùng: dồn toàn bộ giao dịch/liên hệ về khách đích, khách nguồn đánh dấu merged (không xoá)',
    params: z.object({ sourceId: uuid, targetId: uuid }),
    preview: (db, ctx, p) => M.mergePreview(db, ctx, p),
    handler: (db, ctx, p) => M.mergeCustomer(db, ctx, p),
    examples: ['gộp KH-0009 vào KH-0002'],
  }),
  def({
    name: 'soulsale.agency.create', permission: 'soulsale.channel.write', ...L1,
    description: 'Tạo đại lý/NPP (kèm cấp, tuyến trên, khu vực, người quản lý)',
    params: z.object({
      name: z.string().min(1), level: z.number().int().min(1).max(5).optional(),
      parentAgencyCustomerId: uuid.optional(), territoryCode: z.string().optional(),
      phone: z.string().optional(), email: z.string().optional(), taxCode: z.string().optional(),
      managerUserId: z.string().optional(), discountTier: z.string().optional(), segmentCode: z.string().optional(),
    }),
    handler: (db, ctx, p) => M.createAgency(db, ctx, p),
    examples: ['mở đại lý cấp 2 ở Quận 7 thuộc NPP Miền Nam'],
  }),
  def({
    name: 'soulsale.retailer.create', permission: 'soulsale.channel.write', ...L1,
    description: 'Tạo shop/điểm bán lẻ (gắn vào đại lý tuyến trên nếu có)',
    params: z.object({
      name: z.string().min(1), parentAgencyCustomerId: uuid.optional(), shopType: z.string().optional(),
      territoryCode: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), segmentCode: z.string().optional(),
    }),
    handler: (db, ctx, p) => M.createRetailer(db, ctx, p),
    examples: ['thêm Shop Hoa Mai vào tuyến đại lý C2 Quận 7'],
  }),
  def({
    name: 'soulsale.agency.move', permission: 'soulsale.channel.write', ...L2,
    description: 'Chuyển tuyến một node kênh (đại lý/shop) sang cha mới — kéo theo toàn bộ tuyến dưới, ảnh hưởng rollup doanh số & hoa hồng',
    params: z.object({ customerId: uuid, newParentId: uuid.nullable() }),
    preview: async (db, ctx, p) => {
      const sub = await M.subtreeIds(db, ctx, p.customerId);
      return { subtreeSize: sub.length, note: `Sẽ kéo theo ${sub.length - 1} node tuyến dưới` };
    },
    handler: (db, ctx, p) => M.moveAgency(db, ctx, p),
    examples: ['chuyển Shop Hướng Dương lên thẳng NPP'],
  }),
  def({
    name: 'soulsale.territory.assign', permission: 'soulsale.channel.write', ...L1,
    description: 'Gán khu vực (territory) cho đại lý/shop — tạo territory nếu chưa có',
    params: z.object({ customerId: uuid, territoryCode: z.string().min(1), territoryName: z.string().optional() }),
    handler: (db, ctx, p) => M.assignTerritory(db, ctx, p),
    examples: ['gán đại lý này vào khu vực Mekong'],
  }),

  /* ============ CRM ============ */
  def({
    name: 'soulsale.lead.create', permission: 'soulsale.lead.write', ...L1,
    description: 'Ghi nhận lead mới (nguồn: facebook/tiktok/zalo/showroom/referral/campaign/import/other) — tự chấm điểm',
    params: z.object({
      source: z.enum(['facebook', 'tiktok', 'zalo', 'showroom', 'referral', 'campaign', 'import', 'other']),
      name: z.string().min(1), phone: z.string().optional(), email: z.string().optional(),
      note: z.string().optional(), ownerUserId: z.string().optional(),
    }),
    handler: (db, ctx, p) => C.createLead(db, ctx, p),
    examples: ['có khách hỏi qua Zalo tên Anh Bảy, lưu lead'],
  }),
  def({
    name: 'soulsale.lead.assign', permission: 'soulsale.lead.write', ...L1,
    description: 'Gán lead cho nhân viên phụ trách (lead mới chuyển sang working)',
    params: z.object({ leadId: uuid, ownerUserId: z.string().min(1) }),
    handler: (db, ctx, p) => C.assignLead(db, ctx, p),
    examples: ['giao lead này cho bạn Linh'],
  }),
  def({
    name: 'soulsale.lead.disqualify', permission: 'soulsale.lead.write', ...L1,
    description: 'Loại lead kèm lý do (SĐT ảo, không nhu cầu, spam...)',
    params: z.object({ leadId: uuid, reason: z.string().min(1) }),
    handler: (db, ctx, p) => C.disqualifyLead(db, ctx, p),
    examples: ['bỏ lead này, số ảo'],
  }),
  def({
    name: 'soulsale.lead.convert', permission: 'soulsale.lead.write', ...L1,
    description: 'Convert lead → khách + deal; tự nhận diện SĐT trùng để tái dùng khách có sẵn, không tạo trùng',
    params: z.object({
      leadId: uuid, dealTitle: z.string().optional(), amount: vnd.optional(),
      customerId: uuid.optional(), customerKind: z.enum(['person', 'company']).optional(),
    }),
    handler: (db, ctx, p) => C.convertLead(db, ctx, p),
    examples: ['lead Anh Bảy chốt rồi, convert giúp'],
  }),
  def({
    name: 'soulsale.deal.create', permission: 'soulsale.deal.write', ...L1,
    description: 'Tạo cơ hội bán hàng (deal) trong pipeline',
    params: z.object({
      title: z.string().min(1), customerId: uuid.optional(), amount: vnd.optional(),
      pipelineCode: z.string().optional(), stageName: z.string().optional(),
      expectedClose: z.string().optional(), ownerUserId: z.string().optional(),
    }),
    handler: (db, ctx, p) => C.createDeal(db, ctx, p),
    examples: ['tạo deal 30 triệu cho khách KH-0005, dự kiến chốt 20/07'],
  }),
  def({
    name: 'soulsale.deal.move-stage', permission: 'soulsale.deal.write', ...L1,
    description: 'Chuyển deal sang stage khác; về "Thua" bắt buộc lostReason; stage Thắng/Thua chốt trạng thái',
    params: z.object({ dealId: uuid, stageName: z.string().min(1), lostReason: z.string().optional(), amount: vnd.optional() }),
    handler: (db, ctx, p) => C.moveDealStage(db, ctx, p),
    examples: ['đẩy deal DL-0003 sang Báo giá'],
  }),
  def({
    name: 'soulsale.activity.log', permission: 'soulsale.deal.write', ...L1,
    description: 'Ghi hoạt động (call/meet/note/task/email/zalo) vào lead/deal/khách/đơn — nuôi điểm lead & health deal',
    params: z.object({
      kind: z.enum(['call', 'meet', 'note', 'task', 'email', 'zalo']), subject: z.string().min(1),
      content: z.string().optional(), refType: z.enum(['lead', 'deal', 'customer', 'order']), refId: uuid,
      dueAt: z.string().optional(), doneAt: z.string().optional(),
    }),
    handler: (db, ctx, p) => C.logActivity(db, ctx, p),
    examples: ['ghi lại: đã gọi khách, hẹn gặp thứ 5'],
  }),

  /* ============ SALES ============ */
  def({
    name: 'soulsale.quote.create', permission: 'soulsale.quote.write', ...L1,
    description: 'Tạo báo giá — dòng nào không truyền giá sẽ tự tra máy giá tầng theo khách',
    params: z.object({
      customerId: uuid, dealId: uuid.optional(), items: z.array(itemSchema).min(1),
      validUntil: z.string().optional(), note: z.string().optional(),
    }),
    handler: (db, ctx, p) => S.createQuote(db, ctx, p),
    examples: ['báo giá 10 thùng NPK cho đại lý Sông Tiền, hiệu lực tới 20/07'],
  }),
  def({
    name: 'soulsale.quote.close', permission: 'soulsale.quote.write', ...L1,
    description: 'Chốt báo giá: accepted hoặc rejected (rejected bắt buộc lý do)',
    params: z.object({ quoteId: uuid, outcome: z.enum(['accepted', 'rejected']), reason: z.string().optional() }),
    handler: (db, ctx, p) => S.closeQuote(db, ctx, p),
    examples: ['khách đồng ý báo giá BG-0002 rồi'],
  }),
  def({
    name: 'soulsale.order.create', permission: 'soulsale.order.write', ...L1,
    description: 'Tạo đơn nháp từ báo giá (giữ nguyên giá đã chốt) hoặc từ danh sách hàng; CHƯA chạm công nợ',
    params: z.object({
      customerId: uuid.optional(), fromQuoteId: uuid.optional(), items: z.array(itemSchema).optional(),
      paymentTermCode: z.string().optional(), channel: z.enum(['b2b', 'b2c', 'agency', 'retailer']).optional(), territoryId: uuid.optional(),
    }),
    handler: (db, ctx, p) => S.createOrder(db, ctx, p),
    examples: ['lên đơn từ báo giá BG-0002, công nợ NET15'],
  }),
  def({
    name: 'soulsale.order.confirm', permission: 'soulsale.order.write', ...L2,
    description: 'Xác nhận đơn (draft/on_hold → confirmed) — QUA CỔNG CÔNG NỢ: khoá nợ chặn, vượt hạn mức chặn trừ khi đã duyệt vượt',
    params: z.object({ orderId: uuid }),
    preview: (db, ctx, p) => S.confirmPreview(db, ctx, p),
    handler: (db, ctx, p) => S.confirmOrder(db, ctx, p),
    examples: ['xác nhận đơn SO-202607-0001'],
  }),
  def({
    name: 'soulsale.order.cancel', permission: 'soulsale.order.write', ...L2,
    description: 'Hủy đơn (draft/confirmed/delivering/on_hold) kèm lý do — giữ nguyên bản ghi + log đảo, phát sự kiện cho kế toán; đơn đã giao/xuất hoá đơn phải đi đường chứng từ đảo',
    params: z.object({ orderId: uuid, reason: z.string().min(1) }),
    preview: async (db, ctx, p) => {
      const o = await S.getOrder(db, ctx, p.orderId);
      return { order: o.code, status: o.status, grandTotal: o.grandTotal, grandTotalFmt: fmtV(o.grandTotal) };
    },
    handler: (db, ctx, p) => S.cancelOrder(db, ctx, p),
    examples: ['hủy đơn SO-202607-0003, đại lý báo nhập nhầm'],
  }),
  def({
    name: 'soulsale.order.hold-toggle', permission: 'soulsale.order.write', ...L2,
    description: 'Giữ đơn (kèm lý do) / thả đơn; overrideCredit=true để duyệt vượt hạn mức cho đơn đang kẹt cổng công nợ',
    params: z.object({ orderId: uuid, hold: z.boolean(), reason: z.string().optional(), overrideCredit: z.boolean().optional() }),
    preview: (db, ctx, p) => S.confirmPreview(db, ctx, { orderId: p.orderId }),
    handler: (db, ctx, p) => S.holdToggleOrder(db, ctx, p),
    examples: ['giữ đơn này lại, chờ đối chiếu kho', 'duyệt vượt hạn mức cho đơn SO-... rồi thả'],
  }),
  def({
    name: 'soulsale.payment.record', permission: 'soulsale.finance.write', ...L2,
    description: 'Ghi nhận tiền về (deposit/payment/refund) theo đơn hoặc theo khách — refund không được vượt số đã thu',
    params: z.object({
      orderId: uuid.optional(), customerId: uuid.optional(), kind: z.enum(['deposit', 'payment', 'refund']),
      amount: vnd, method: z.enum(['cash', 'bank', 'card', 'ewallet']).optional(), externalRef: z.string().optional(), note: z.string().optional(),
    }),
    preview: (db, ctx, p) => S.paymentPreview(db, ctx, p),
    handler: (db, ctx, p) => S.recordPayment(db, ctx, p),
    examples: ['khách chuyển khoản 5 triệu cho đơn SO-202607-0001'],
  }),
  def({
    name: 'soulsale.payment.term-set', permission: 'soulsale.finance.write', ...L1,
    description: 'Gán điều khoản thanh toán mặc định cho khách (COD/DEP30/NET7/NET15/NET30)',
    params: z.object({ customerId: uuid, termCode: z.string().min(1) }),
    handler: (db, ctx, p) => P.setPaymentTerm(db, ctx, p),
    examples: ['cho đại lý này công nợ NET30'],
  }),

  /* ============ GIÁ / CÔNG NỢ / CHỈ TIÊU / HOA HỒNG ============ */
  def({
    name: 'soulsale.price.rule-set', permission: 'soulsale.price.write', ...L2,
    description: 'Đặt/cập nhật rule giá (chung, theo segment, theo cấp đại lý, hoặc đích danh khách; bậc số lượng; cửa sổ hiệu lực) — ảnh hưởng mọi báo giá/đơn mới',
    params: z.object({
      productCode: z.string(), unitPrice: vnd, discountPct: pct.optional(),
      priceBookCode: z.string().optional(), customerId: uuid.optional(), segmentCode: z.string().optional(),
      agencyLevel: z.number().int().min(1).max(5).optional(), minQty: z.number().int().min(1).optional(),
      validFrom: z.string().optional(), validTo: z.string().optional(), priority: z.number().int().optional(), active: z.boolean().optional(),
    }),
    preview: async (db, ctx, p) => {
      const cur = await P.priceCheck(db, ctx, { productCode: p.productCode, customerId: p.customerId, qty: p.minQty ?? 1 });
      return { currentResolution: cur, incoming: { unitPrice: p.unitPrice, unitPriceFmt: fmtV(p.unitPrice), scope: p.customerId ? 'đích danh' : p.segmentCode ? `segment ${p.segmentCode}` : p.agencyLevel ? `đại lý cấp ${p.agencyLevel}` : 'giá chung' } };
    },
    handler: (db, ctx, p) => P.setPriceRule(db, ctx, p),
    examples: ['đặt giá NPK cho đại lý cấp 2 là 480k', 'khuyến mãi Urê 150k từ 01–30/06'],
  }),
  def({
    name: 'soulsale.credit.limit-set', permission: 'soulsale.finance.write', ...L2,
    description: 'Đặt hạn mức công nợ cho khách (kèm điều khoản thanh toán nếu muốn)',
    params: z.object({ customerId: uuid, limitAmount: vnd, paymentTermCode: z.string().optional() }),
    preview: (db, ctx, p) => P.creditCheck(db, ctx, { customerId: p.customerId }),
    handler: (db, ctx, p) => P.setCreditLimit(db, ctx, p),
    examples: ['nâng hạn mức NPP Cửu Long lên 200 triệu'],
  }),
  def({
    name: 'soulsale.credit.hold-toggle', permission: 'soulsale.finance.write', ...L2,
    description: 'Khoá/mở khoá công nợ một khách (khoá bắt buộc lý do) — khoá thì mọi đơn mới không xác nhận được',
    params: z.object({ customerId: uuid, hold: z.boolean(), reason: z.string().optional() }),
    preview: (db, ctx, p) => P.creditCheck(db, ctx, { customerId: p.customerId }),
    handler: (db, ctx, p) => P.creditHoldToggle(db, ctx, p),
    examples: ['khoá công nợ Shop X, quá hạn 2 kỳ'],
  }),
  def({
    name: 'soulsale.target.set', permission: 'soulsale.target.write', ...L1,
    description: 'Đặt chỉ tiêu doanh số theo kỳ cho nhân viên/đại lý/khu vực/toàn công ty (upsert)',
    params: z.object({ scope: z.enum(['user', 'agency', 'territory', 'org']), scopeId: z.string().optional(), period, targetAmount: vnd }),
    handler: (db, ctx, p) => F.setTarget(db, ctx, p),
    examples: ['giao chỉ tiêu tháng 7 cho sale-A là 150 triệu'],
  }),
  def({
    name: 'soulsale.commission.plan-set', permission: 'soulsale.finance.write', ...L2,
    description: 'Tạo/cập nhật plan hoa hồng (%, người hưởng: nhân viên phụ trách đơn hoặc đại lý gốc tuyến)',
    params: z.object({ code: z.string().min(1), name: z.string().min(1), ratePct: pct, beneficiary: z.enum(['owner', 'agency']), basis: z.string().optional(), active: z.boolean().optional() }),
    handler: (db, ctx, p) => F.setCommissionPlan(db, ctx, p),
    examples: ['plan hoa hồng nhân viên 2% doanh thu'],
  }),
  def({
    name: 'soulsale.commission.post', permission: 'soulsale.finance.write', ...L2,
    description: 'Ghi sổ hoa hồng một kỳ (idempotent — chạy lại không nhân đôi); xem trước bằng commission.preview',
    params: z.object({ period, planCode: z.string().optional() }),
    preview: (db, ctx, p) => F.commissionPreview(db, ctx, p),
    handler: (db, ctx, p) => F.commissionPost(db, ctx, p),
    examples: ['chốt hoa hồng tháng 6'],
  }),
  def({
    name: 'soulsale.debt.snapshot-close', permission: 'soulsale.finance.write', ...L2,
    description: 'Chốt kỳ công nợ: opening (kỳ trước) + phát sinh − đã thu = closing, lưu snapshot từng khách',
    params: z.object({ period, customerId: uuid.optional() }),
    preview: (db, ctx, p) => F.debtCloseSummaryPreview(db, ctx, p),
    handler: (db, ctx, p) => F.debtSnapshotClose(db, ctx, p),
    examples: ['chốt công nợ tháng 6 toàn bộ khách'],
  }),

  /* ============ SPLITTER ============ */
  def({
    name: 'soulsale.import.statement-upload', permission: 'soulsale.import.write', ...L1,
    description: 'Nạp bảng kê đại lý (Excel base64 hoặc rows JSON) — header tiếng Việt linh hoạt, tiền "1.234.567" tự hiểu',
    params: z.object({
      sourceCustomerId: uuid, period, fileName: z.string().optional(),
      fileBase64: z.string().optional(), rows: z.array(z.record(z.unknown())).optional(),
    }),
    handler: (db, ctx, p) => SP.uploadStatement(db, ctx, p),
    examples: ['nạp file bảng kê tháng 6 của NPP Đồng Tháp'],
  }),
  def({
    name: 'soulsale.import.batch-reconcile', permission: 'soulsale.import.write', ...L1,
    description: 'Đối soát batch: match khách (mã > SĐT > tên bỏ dấu), bắt dòng trùng/thiếu khách/lệch tiền thành case',
    params: z.object({ batchId: uuid }),
    handler: (db, ctx, p) => SP.reconcileBatch(db, ctx, p),
    examples: ['đối soát batch IB-202606-0001'],
  }),
  def({
    name: 'soulsale.import.row-resolve', permission: 'soulsale.import.write', ...L1,
    description: 'Xử lý một dòng ngoại lệ: match (gán khách), accept (nhận ứng viên mờ), hoặc void (bỏ dòng)',
    params: z.object({ rowId: uuid, action: z.enum(['match', 'accept', 'void']), customerId: uuid.optional(), note: z.string().optional() }),
    handler: (db, ctx, p) => SP.resolveRow(db, ctx, p),
    examples: ['dòng 3 là Chị Chín Sa Đéc, gán vào khách vừa tạo'],
  }),
  def({
    name: 'soulsale.import.split-confirm', permission: 'soulsale.import.write', ...L2,
    description: 'Chốt batch: tách dòng tiền (doanh thu/ship/cọc/CK/nợ) thành statement chính thức của đại lý — yêu cầu 0 case mở',
    params: z.object({ batchId: uuid }),
    preview: async (db, ctx, p) => {
      const { batch, cats } = await SP.computeSplitData(db, ctx, p);
      return { batch: batch.code, period: batch.period, split: cats.map((cc) => ({ ...cc, amountFmt: fmtV(cc.amount) })) };
    },
    handler: (db, ctx, p) => SP.splitConfirm(db, ctx, p),
    examples: ['chốt bảng kê tháng 6 của NPP Đồng Tháp'],
  }),
  def({
    name: 'soulsale.import.batch-void', permission: 'soulsale.import.write', ...L2,
    description: 'Hủy batch chưa chốt (file sai kỳ/sai đại lý) — dòng & case chuyển voided, giữ raw để truy vết',
    params: z.object({ batchId: uuid, reason: z.string().min(1) }),
    preview: async (db, ctx, p) => {
      const st = (await SP.batchStatus(db, ctx, { batchId: p.batchId })) as { batch: { code: string; status: string; rowCount: number } };
      return { batch: st.batch.code, status: st.batch.status, rowCount: st.batch.rowCount };
    },
    handler: (db, ctx, p) => SP.voidBatch(db, ctx, p),
    examples: ['hủy batch này, file gửi nhầm kỳ'],
  }),
];
