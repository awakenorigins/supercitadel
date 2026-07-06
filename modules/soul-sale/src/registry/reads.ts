/** SOUL-SALE 1A — registry/reads.ts: 23 read tools cho Tiểu Tâm (permission *.read / report.read). */
import { z } from 'zod';
import type { ReadToolDef } from '../contract.js';
import * as M from '../services/master.service.js';
import * as C from '../services/crm.service.js';
import * as P from '../services/pricing.service.js';
import * as S from '../services/sales.service.js';
import * as F from '../services/finance.service.js';
import * as SP from '../services/splitter.service.js';
import * as I from '../services/intel.service.js';

const lim = z.number().int().min(1).max(200).optional();
const period = z.string().regex(/^\d{4}-\d{2}$/, 'period dạng YYYY-MM');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const def = <P_>(d: ReadToolDef<P_, any>) => d as ReadToolDef;

export const readTools: ReadToolDef[] = [
  def({
    name: 'soulsale.customer.search', permission: 'soulsale.customer.read',
    description: 'Tìm khách hàng theo tên (bỏ dấu được), mã, hoặc SĐT; lọc theo loại (person/company/agency/retailer)',
    params: z.object({ q: z.string().optional(), kind: z.enum(['person', 'company', 'agency', 'retailer', 'distributor']).optional(), limit: lim }),
    handler: (db, ctx, p) => M.searchCustomers(db, ctx, p),
    examples: ['tìm khách tên Hoa Mai', 'có khách nào SĐT 0911222333 không'],
  }),
  def({
    name: 'soulsale.customer.profile', permission: 'soulsale.customer.read',
    description: 'Hồ sơ 360° một khách: thông tin, liên hệ, địa chỉ, hồ sơ kênh, hạn mức, chuỗi cấp trên',
    params: z.object({ customerId: z.string().uuid() }),
    handler: (db, ctx, p) => M.customerProfile(db, ctx, p),
    examples: ['xem hồ sơ khách KH-0001'],
  }),
  def({
    name: 'soulsale.customer.history', permission: 'soulsale.customer.read',
    description: 'Lịch sử mua hàng + RFM (recency/frequency/monetary) + hoạt động gần nhất của khách',
    params: z.object({ customerId: z.string().uuid() }),
    handler: (db, ctx, p) => M.customerHistory(db, ctx, p),
    examples: ['khách này mua bao nhiêu lần rồi, tổng bao nhiêu tiền'],
  }),
  def({
    name: 'soulsale.customer.duplicate-check', permission: 'soulsale.customer.read',
    description: 'Kiểm tra khả năng trùng khách theo SĐT/email/tên (trả ứng viên kèm điểm tin cậy)',
    params: z.object({ phone: z.string().optional(), email: z.string().optional(), name: z.string().optional() }),
    handler: (db, ctx, p) => M.duplicateCheck(db, ctx, p),
    examples: ['SĐT 0909xxx đã có trong hệ thống chưa'],
  }),
  def({
    name: 'soulsale.agency.tree', permission: 'soulsale.channel.read',
    description: 'Cây kênh phân phối (NPP → đại lý → shop) dạng lồng nhau; truyền rootId để xem một nhánh',
    params: z.object({ rootId: z.string().uuid().optional() }),
    handler: (db, ctx, p) => M.agencyTree(db, ctx, p),
    examples: ['vẽ cây đại lý của công ty', 'tuyến dưới của NPP Miền Nam gồm ai'],
  }),
  def({
    name: 'soulsale.retailer.by-agency', permission: 'soulsale.channel.read',
    description: 'Danh sách shop/điểm bán thuộc một đại lý (trực tiếp hoặc cả tuyến dưới)',
    params: z.object({ agencyCustomerId: z.string().uuid(), includeSub: z.boolean().optional() }),
    handler: (db, ctx, p) => M.retailersByAgency(db, ctx, p),
    examples: ['NPP Cửu Long có bao nhiêu shop'],
  }),
  def({
    name: 'soulsale.pipeline.summary', permission: 'soulsale.deal.read',
    description: 'Tổng quan pipeline: số deal, tổng tiền, giá trị có trọng số theo từng stage',
    params: z.object({ pipelineCode: z.string().optional() }),
    handler: (db, ctx, p) => C.pipelineSummary(db, ctx, p),
    examples: ['pipeline tháng này thế nào'],
  }),
  def({
    name: 'soulsale.deal.health', permission: 'soulsale.deal.read',
    description: 'Danh sách deal theo sức khỏe (hot/warm/cold/at_risk) — tự tính lại trước khi trả',
    params: z.object({ health: z.enum(['hot', 'warm', 'cold', 'at_risk']).optional(), limit: lim }),
    handler: (db, ctx, p) => C.dealHealthList(db, ctx, p),
    examples: ['deal nào đang nguy cơ rớt', 'liệt kê deal hot'],
  }),
  def({
    name: 'soulsale.activity.timeline', permission: 'soulsale.deal.read',
    description: 'Dòng thời gian hoạt động (call/meet/note/task) của một lead/deal/khách/đơn',
    params: z.object({ refType: z.enum(['lead', 'deal', 'customer', 'order']), refId: z.string().uuid(), limit: lim }),
    handler: (db, ctx, p) => C.activityTimeline(db, ctx, p),
    examples: ['lịch sử chăm sóc deal DL-0001'],
  }),
  def({
    name: 'soulsale.quote.status', permission: 'soulsale.quote.read',
    description: 'Trạng thái báo giá; expiringDays=N liệt kê báo giá sắp hết hạn trong N ngày',
    params: z.object({ status: z.string().optional(), expiringDays: z.number().int().min(0).optional(), limit: lim }),
    handler: (db, ctx, p) => S.quoteStatus(db, ctx, p),
    examples: ['báo giá nào sắp hết hạn tuần này'],
  }),
  def({
    name: 'soulsale.order.search', permission: 'soulsale.order.read',
    description: 'Tìm đơn hàng theo mã/khách/trạng thái/kỳ (YYYY-MM)',
    params: z.object({ q: z.string().optional(), customerId: z.string().uuid().optional(), status: z.string().optional(), period: period.optional(), limit: lim }),
    handler: (db, ctx, p) => S.searchOrders(db, ctx, p),
    examples: ['đơn tháng 7 của NPP Cửu Long', 'đơn nào đang on_hold'],
  }),
  def({
    name: 'soulsale.revenue.summary', permission: 'soulsale.report.read',
    description: 'Tổng hợp doanh thu (đơn đã xác nhận) theo kỳ/nhân viên/kênh/đại lý gốc',
    params: z.object({ period: period.optional(), groupBy: z.enum(['period', 'owner', 'channel', 'agency']).optional() }),
    handler: (db, ctx, p) => F.revenueSummary(db, ctx, p),
    examples: ['doanh thu tháng 6 theo nhân viên', 'kênh nào bán mạnh nhất'],
  }),
  def({
    name: 'soulsale.target.progress', permission: 'soulsale.target.read',
    description: 'Tiến độ chỉ tiêu kỳ: đạt/mục tiêu/%, gap — rollup tươi trước khi trả',
    params: z.object({ period, scope: z.enum(['user', 'agency', 'territory', 'org']).optional() }),
    handler: (db, ctx, p) => F.targetProgress(db, ctx, p),
    examples: ['ai đạt chỉ tiêu tháng này', 'NPP Cửu Long chạy được bao nhiêu % target'],
  }),
  def({
    name: 'soulsale.price.check', permission: 'soulsale.price.read',
    description: 'Tra giá áp dụng cho khách/sản phẩm/số lượng tại một thời điểm (kèm nguồn rule)',
    params: z.object({ productCode: z.string(), customerId: z.string().uuid().optional(), qty: z.number().int().min(1).optional(), at: z.string().optional() }),
    handler: (db, ctx, p) => P.priceCheck(db, ctx, p),
    examples: ['giá NPK cho đại lý cấp 2 là bao nhiêu', 'mua 100 thùng thì giá nào'],
  }),
  def({
    name: 'soulsale.credit.check', permission: 'soulsale.finance.read',
    description: 'Kiểm tra công nợ: hạn mức, đang nợ, còn khả dụng, có bị khoá không; extraAmount để thử đơn mới',
    params: z.object({ customerId: z.string().uuid(), extraAmount: z.string().regex(/^\d+$/).optional() }),
    handler: (db, ctx, p) => P.creditCheck(db, ctx, p),
    examples: ['khách này còn mua chịu được bao nhiêu'],
  }),
  def({
    name: 'soulsale.debt.summary', permission: 'soulsale.finance.read',
    description: 'Công nợ: chi tiết một khách (kèm 3 snapshot gần nhất) hoặc top khách nợ nhiều nhất',
    params: z.object({ customerId: z.string().uuid().optional(), topN: z.number().int().min(1).max(50).optional() }),
    handler: (db, ctx, p) => F.debtSummary(db, ctx, p),
    examples: ['ai đang nợ nhiều nhất', 'công nợ của Shop Hoa Mai'],
  }),
  def({
    name: 'soulsale.sellthrough.summary', permission: 'soulsale.channel.read',
    description: 'Sell-in (công ty bán vào tuyến) vs sell-out (đại lý khai qua Splitter) + gap tồn kênh',
    params: z.object({ agencyCustomerId: z.string().uuid(), period: period.optional() }),
    handler: (db, ctx, p) => F.sellthroughSummary(db, ctx, p),
    examples: ['hàng đẩy xuống NPP đã bán ra được bao nhiêu'],
  }),
  def({
    name: 'soulsale.sales.forecast', permission: 'soulsale.report.read',
    description: 'Dự báo doanh số: pipeline có trọng số theo tháng + run-rate 3 tháng (rule-based, minh bạch)',
    params: z.object({ months: z.number().int().min(1).max(12).optional() }),
    handler: (db, ctx, p) => C.salesForecast(db, ctx, p),
    examples: ['tháng sau dự kiến về được bao nhiêu'],
  }),
  def({
    name: 'soulsale.churn.risk-list', permission: 'soulsale.report.read',
    description: 'Khách có nguy cơ rời bỏ (im ắng lâu so với nhịp mua) — điểm 0..100',
    params: z.object({ limit: lim }),
    handler: (db, ctx, p) => I.churnRiskList(db, ctx, p),
    examples: ['khách nào lâu rồi không quay lại'],
  }),
  def({
    name: 'soulsale.intel.next-best', permission: 'soulsale.report.read',
    description: 'Việc nên làm ngay: chốt báo giá sắp hết hạn, nhắc nợ, gộp khách trùng, gọi lại khách sắp rời bỏ',
    params: z.object({ limit: lim }),
    handler: (db, ctx, p) => I.nextBestActions(db, ctx, p),
    examples: ['hôm nay đội sale nên làm gì trước'],
  }),
  def({
    name: 'soulsale.import.batch-status', permission: 'soulsale.import.read',
    description: 'Tình trạng batch bảng kê: số dòng theo trạng thái, số case đối soát còn mở',
    params: z.object({ batchId: z.string().uuid().optional(), period: period.optional(), limit: lim }),
    handler: (db, ctx, p) => SP.batchStatus(db, ctx, p),
    examples: ['file bảng kê tháng 6 xử lý tới đâu rồi'],
  }),
  def({
    name: 'soulsale.reconciliation.exceptions', permission: 'soulsale.import.read',
    description: 'Danh sách case đối soát (thiếu khách/match mờ/trùng dòng/lệch tiền) cần con người xử lý',
    params: z.object({ batchId: z.string().uuid().optional(), status: z.enum(['open', 'resolved', 'voided']).optional(), limit: lim }),
    handler: (db, ctx, p) => SP.reconciliationExceptions(db, ctx, p),
    examples: ['còn dòng nào chưa khớp được khách'],
  }),
  def({
    name: 'soulsale.commission.preview', permission: 'soulsale.finance.read',
    description: 'Xem trước hoa hồng một kỳ theo các plan đang bật (chưa ghi sổ)',
    params: z.object({ period, planCode: z.string().optional() }),
    handler: (db, ctx, p) => F.commissionPreview(db, ctx, p),
    examples: ['hoa hồng tháng 6 của đội sale khoảng bao nhiêu'],
  }),
];
