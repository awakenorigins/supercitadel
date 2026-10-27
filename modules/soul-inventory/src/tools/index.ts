/**
 * SOUL-INVENTORY v2.0 FINAL — Tools & Actions cho Tiểu Tâm (mặt cắt ⑥)
 *
 * Hai lớp theo chuẩn SuperCitadel v10.0.1 + dry-run protocol (hấp thụ Kế Toán 10A):
 *   - READ TOOLS  (kind:'tool')   — tra cứu, gọi tự do, KHÔNG sensitive
 *   - WRITE ACTIONS (kind:'action') — thay đổi tồn kho:
 *       · sensitive:true + securityLevel — host thực thi qua executeAction:
 *         lượt 1 chưa confirm → trả DRY-RUN preview (không ghi DB),
 *         lượt 2 {confirm:true} → execute thật
 *       · handler ở đây CHỈ lo nghiệp vụ + trả message tiếng Việt sẵn
 *         (Tiểu Tâm đọc lại message, không tự soạn số liệu — chống bịa)
 *
 * Mỗi định nghĩa: name + kind + permission + securityLevel + sensitive
 * + inputSchema (Zod, validate tại biên ⑦) + docs + handler.
 */
import type { z, ZodType } from 'zod';
import type { KhoCtx } from '../types.js';
import {
  itemUpsertSchema, receiveStockSchema, issueStockSchema,
  transferStockSchema, queryStockSchema, lowAlertsSchema,
  reservationManageSchema, stocktakeExecuteSchema,
  stockCardSchema, expiryAlertsSchema, summarySchema,
  uomUpsertSchema, bomUpsertSchema, assemblySchema, bomInfoSchema,
  reorderRuleSchema, reorderSuggestSchema, pickingSuggestSchema,
  landedCostSchema, scrapSchema, abcAnalysisSchema,
  stockAgingSchema, cycleCountSchema, barcodeSchema,
  replenishParamsSchema, smartReplenishSchema, projectedInventorySchema,
  forecastRunSchema, deadStockSchema, xyzRunSchema, scheduledTasksSchema,
} from '../validation/schemas.js';
import { upsertItem, getItemBySku } from '../services/catalog.service.js';
import {
  receiveStock, issueStock, transferStock,
  queryStock, lowStockAlerts,
} from '../services/stock.service.js';
import { manageReservation } from '../services/reservation.service.js';
import { executeStocktake } from '../services/stocktake.service.js';
import { expiryAlerts } from '../services/lot.service.js';
import { stockCard, inventorySummary } from '../services/report.service.js';
import { upsertUom, findByBarcode } from '../services/uom.service.js';
import { upsertBom, assemble, disassemble, bomInfo } from '../services/bom.service.js';
import { upsertReorderRule, reorderSuggestions } from '../services/reorder.service.js';
import { pickingSuggestion } from '../services/picking.service.js';
import { applyLandedCost } from '../services/landed_cost.service.js';
import { scrapStock } from '../services/scrap.service.js';
import { runAbcAnalysis, stockAging, cycleCountSuggestion } from '../services/analytics.service.js';
import {
  setReplenishParams, smartReplenishSuggestions, projectedInventory,
  computeDemandStats, computeForecasts, runXyzAnalysis,
  deadStockDetection, runScheduledTasks,
} from '../services/automation.service.js';

export type ToolKind = 'tool' | 'action';
export type SecurityLevel = 1 | 2;

export interface KhoToolDefinition<S extends ZodType = ZodType> {
  /** Định danh — trùng manifest.json */
  name: string;
  /** 'tool' = đọc (tự do) · 'action' = ghi (dry-run→confirm phía host) */
  kind: ToolKind;
  /** Quyền module.resource.action (mặt cắt ③) */
  permission: string;
  /** Lớp bảo mật: 2 = đòi xác thực cấp 2 với thao tác nhạy cảm */
  securityLevel: SecurityLevel;
  /** true → host bắt buộc dry-run preview trước, confirm mới chạy */
  sensitive: boolean;
  /** Mô tả để Tiểu Tâm hiểu khi nào dùng */
  description: string;
  inputSchema: S;
  docs: string;
  handler(ctx: KhoCtx, rawInput: unknown): Promise<unknown>;
}

/** Kết quả chuẩn: data + message tiếng Việt sẵn để Tiểu Tâm đọc lại */
export interface KhoActionResult {
  ok: true;
  message: string;
  data: unknown;
}

function define<S extends ZodType>(def: {
  name: string; kind: ToolKind; permission: string;
  securityLevel?: SecurityLevel; sensitive?: boolean;
  description: string; inputSchema: S; docs: string;
  run(ctx: KhoCtx, input: z.infer<S>): Promise<unknown>;
  /** Soạn message tiếng Việt từ kết quả (chỉ actions cần) */
  message?(result: unknown, input: z.infer<S>): string;
}): KhoToolDefinition<S> {
  return {
    name: def.name,
    kind: def.kind,
    permission: def.permission,
    securityLevel: def.securityLevel ?? 1,
    sensitive: def.sensitive ?? false,
    description: def.description,
    inputSchema: def.inputSchema,
    docs: def.docs,
    async handler(ctx, rawInput) {
      const input = def.inputSchema.parse(rawInput); // ⑦ biên giới canh gác
      const result = await def.run(ctx, input);
      if (def.kind === 'action' && def.message) {
        return { ok: true, message: def.message(result, input), data: result } satisfies KhoActionResult;
      }
      return result;
    },
  };
}

const fmt = (v: unknown) => String(v ?? '');

// ────────────────────────────────────────────────────────────
// READ TOOLS (9) — gọi tự do
// ────────────────────────────────────────────────────────────

export const khoReadTools: KhoToolDefinition[] = [
  define({
    name: 'kho.stock.query', kind: 'tool', permission: 'kho.stock.read',
    description: 'TRA CỨU TỒN theo SKU/từ khóa/kho: stocked, reserved, available, incoming. Hỏi "còn bao nhiêu", "tồn kho".',
    inputSchema: queryStockSchema, docs: 'docs/TOOLS.md#khostockquery',
    run: (ctx, input) => queryStock(ctx, input),
  }),
  define({
    name: 'kho.stock.low_alerts', kind: 'tool', permission: 'kho.stock.read',
    description: 'CẢNH BÁO TỒN THẤP theo min_stock của item. Hỏi "sắp hết hàng gì".',
    inputSchema: lowAlertsSchema, docs: 'docs/TOOLS.md#khostocklow_alerts',
    run: (ctx, input) => lowStockAlerts(ctx, input),
  }),
  define({
    name: 'kho.lot.expiry_alerts', kind: 'tool', permission: 'kho.stock.read',
    description: 'CẢNH BÁO CẬN HẠN: lô còn tồn sắp hết hạn trong N ngày. Hỏi "hàng cận date".',
    inputSchema: expiryAlertsSchema, docs: 'docs/TOOLS.md#kholotexpiry_alerts',
    run: (ctx, input) => expiryAlerts(ctx, input.within_days, input.limit),
  }),
  define({
    name: 'kho.report.stock_card', kind: 'tool', permission: 'kho.stock.read',
    description: 'THẺ KHO (S10-DN): lịch sử N-X-T một SKU + tổng nhập/xuất/dư. Hỏi "thẻ kho", "truy nguyên".',
    inputSchema: stockCardSchema, docs: 'docs/TOOLS.md#khoreportstock_card',
    run: (ctx, input) => stockCard(ctx, input.sku, input.limit),
  }),
  define({
    name: 'kho.report.summary', kind: 'tool', permission: 'kho.stock.read',
    description: 'TỔNG QUAN KHO: mặt hàng/kho/lô, tổng khả dụng, dưới định mức, giá trị tồn. Hỏi "kho thế nào".',
    inputSchema: summarySchema, docs: 'docs/TOOLS.md#khoreportsummary',
    run: (ctx) => inventorySummary(ctx),
  }),
  define({
    name: 'kho.picking.suggest', kind: 'tool', permission: 'kho.stock.read',
    description: 'GỢI Ý XUẤT LÔ (FEFO/FIFO): lập kế hoạch xuất lô nào trước — lô cận hạn xuất trước (FEFO) hoặc nhập trước xuất trước (FIFO). Dùng TRƯỚC khi xuất hàng có lô. KHÔNG ghi DB.',
    inputSchema: pickingSuggestSchema, docs: 'docs/TOOLS.md#khopickingsuggest',
    run: (ctx, input) => pickingSuggestion(ctx, input),
  }),
  define({
    name: 'kho.bom.info', kind: 'tool', permission: 'kho.stock.read',
    description: 'XEM ĐỊNH MỨC (BOM) + số thành phẩm LẮP ĐƯỢC TỐI ĐA với tồn nguyên liệu hiện tại. Hỏi "công thức", "lắp được bao nhiêu".',
    inputSchema: bomInfoSchema, docs: 'docs/TOOLS.md#khobominfo',
    run: (ctx, input) => bomInfo(ctx, input.sku),
  }),
  define({
    name: 'kho.reorder.suggest', kind: 'tool', permission: 'kho.stock.read',
    description: 'GỢI Ý ĐẶT HÀNG theo rule min-max: hàng nào cần đặt, đặt bao nhiêu (về max), NCC nào, lead time. Hỏi "cần đặt gì", "lên đơn nhập".',
    inputSchema: reorderSuggestSchema, docs: 'docs/TOOLS.md#khoreordersuggest',
    run: (ctx, input) => reorderSuggestions(ctx, input.limit),
  }),
  define({
    name: 'kho.analytics.report', kind: 'tool', permission: 'kho.stock.read',
    description: 'PHÂN TÍCH KHO: stock aging (tồn lâu ngày, bucket 0-30/31-60/61-90/>90) + cycle count (gợi ý kiểm kê luân phiên theo lớp ABC). Hỏi "hàng tồn lâu", "nên kiểm gì".',
    inputSchema: stockAgingSchema, docs: 'docs/TOOLS.md#khoanalyticsreport',
    run: async (ctx, input) => ({
      aging: await stockAging(ctx, input.limit),
      cycle_count_due: await cycleCountSuggestion(ctx, 20),
    }),
  }),
  define({
    name: 'kho.replenish.suggest', kind: 'tool', permission: 'kho.stock.read',
    description: 'GỢI Ý BỔ HÀNG THÔNG MINH (v2.1): dùng reorder point ĐỘNG (nhu cầu×lead time + safety stock) thay min cố định. Trả kèm EOQ, days_of_cover, NCC. Hỏi "cần đặt gì theo dự báo", "bổ hàng thông minh". KHÔNG tự tạo đơn — chỉ đề xuất.',
    inputSchema: smartReplenishSchema, docs: 'docs/TOOLS.md#khoreplenishsuggest',
    run: (ctx, input) => smartReplenishSuggestions(ctx, input.limit),
  }),
  define({
    name: 'kho.forecast.projected', kind: 'tool', permission: 'kho.stock.read',
    description: 'CHIẾU TỒN TƯƠNG LAI (v2.1): theo tốc độ xuất dự báo, bao nhiêu ngày nữa hết hàng (days_to_stockout), tồn cuối kỳ dự kiến, mức rủi ro high/medium/low. Hỏi "bao lâu nữa hết hàng", "hàng nào sắp cạn".',
    inputSchema: projectedInventorySchema, docs: 'docs/TOOLS.md#khoforecastprojected',
    run: (ctx, input) => projectedInventory(ctx, input.horizon_days, input.limit),
  }),
  define({
    name: 'kho.analytics.dead_stock', kind: 'tool', permission: 'kho.stock.read',
    description: 'PHÁT HIỆN HÀNG CHẾT (v2.1): còn tồn nhưng không xuất trong N ngày (mặc định 90), kèm vốn đọng (tied_value). Hỏi "hàng chết", "hàng ế", "vốn đọng ở đâu". CHỈ phát hiện — quyết định giảm giá/thanh lý là của người dùng.',
    inputSchema: deadStockSchema, docs: 'docs/TOOLS.md#khoanalyticsdead_stock',
    run: (ctx, input) => deadStockDetection(ctx, input.idle_days, input.limit),
  }),
];

// ────────────────────────────────────────────────────────────
// WRITE ACTIONS (11) — dry-run→confirm phía host, message tiếng Việt sẵn
// ────────────────────────────────────────────────────────────

export const khoWriteActions: KhoToolDefinition[] = [
  define({
    name: 'kho.item.upsert', kind: 'action', permission: 'kho.item.write',
    securityLevel: 1, sensitive: false,
    description: 'Tạo/cập nhật vật tư (SKU, tên, ĐVT, định mức, theo dõi lô/serial). Idempotent theo SKU.',
    inputSchema: itemUpsertSchema, docs: 'docs/TOOLS.md#khoitemupsert',
    run: (ctx, input) => upsertItem(ctx, input),
    message: (r) => {
      const it = r as { sku: string; name: string; unit: string };
      return `Đã lưu mặt hàng ${it.name} (${it.sku}), đơn vị ${it.unit}.`;
    },
  }),
  define({
    name: 'kho.uom.upsert', kind: 'action', permission: 'kho.item.write',
    securityLevel: 1, sensitive: false,
    description: 'Khai ĐƠN VỊ QUY ĐỔI cho mặt hàng: 1 <đơn vị mới> = factor × <đơn vị gốc> (vd 1 thùng = 24 lon). Kèm barcode riêng theo quy cách nếu có.',
    inputSchema: uomUpsertSchema, docs: 'docs/TOOLS.md#khouomupsert',
    run: async (ctx, input) => {
      const item = await getItemBySku(ctx, input.sku);
      const uom = await upsertUom(ctx, item.id, input);
      return { sku: item.sku, unit_base: item.unit, ...uom };
    },
    message: (r, i) => {
      const d = r as { unit_base: string };
      return `Đã khai quy đổi: 1 ${i.uom_name} = ${i.factor} ${d.unit_base} cho ${i.sku}.`;
    },
  }),
  define({
    name: 'kho.stock.receive', kind: 'action', permission: 'kho.stock.write',
    securityLevel: 2, sensitive: true,
    description: 'NHẬP KHO (PNK/01-VT): tăng tồn, ghi sổ, hỗ trợ lot/serial/expiry, tự cập nhật giá vốn bình quân. GHI SỔ — host dry-run trước.',
    inputSchema: receiveStockSchema, docs: 'docs/TOOLS.md#khostockreceive',
    run: (ctx, input) => receiveStock(ctx, input),
    message: (r) => {
      const d = r as { sku: string; name: string; unit: string; location: string; stocked: string; doc_no?: string; lot_no?: string };
      return `Đã nhập kho${d.doc_no ? ` (${d.doc_no})` : ''}: ${d.name}${d.lot_no ? ` lô ${d.lot_no}` : ''} vào ${d.location}. Tồn hiện tại: ${d.stocked} ${d.unit}.`;
    },
  }),
  define({
    name: 'kho.stock.issue', kind: 'action', permission: 'kho.stock.write',
    securityLevel: 2, sensitive: true,
    description: 'XUẤT KHO (PXK/02-VT): giảm tồn, guard khả dụng, bắt buộc lot/serial nếu item có theo dõi. GHI SỔ — host dry-run trước.',
    inputSchema: issueStockSchema, docs: 'docs/TOOLS.md#khostockissue',
    run: (ctx, input) => issueStock(ctx, input),
    message: (r) => {
      const d = r as { name: string; unit: string; location: string; stocked: string; available: string; warning?: string };
      return `Đã xuất kho: ${d.name} tại ${d.location}. Tồn còn ${d.stocked} ${d.unit} (khả dụng ${d.available}).${d.warning ? ` ⚠️ ${d.warning}` : ''}`;
    },
  }),
  define({
    name: 'kho.stock.transfer', kind: 'action', permission: 'kho.stock.write',
    securityLevel: 2, sensitive: true,
    description: 'CHUYỂN KHO atomic 2 chiều giữa hai địa điểm. GHI SỔ — host dry-run trước.',
    inputSchema: transferStockSchema, docs: 'docs/TOOLS.md#khostocktransfer',
    run: (ctx, input) => transferStock(ctx, input),
    message: (r) => {
      const d = r as { sku: string; quantity: string; unit: string; from: { code: string }; to: { code: string } };
      return `Đã chuyển ${d.quantity} ${d.unit} ${d.sku} từ ${d.from.code} sang ${d.to.code}.`;
    },
  }),
  define({
    name: 'kho.reservation.manage', kind: 'action', permission: 'kho.reservation.write',
    securityLevel: 1, sensitive: true,
    description: 'ĐẶT GIỮ HÀNG: create/release/fulfill/list. fulfill là GHI SỔ.',
    inputSchema: reservationManageSchema, docs: 'docs/TOOLS.md#khoreservationmanage',
    run: (ctx, input) => manageReservation(ctx, input),
    message: (r, i) => {
      if (i.action === 'create') {
        const d = r as { quantity: string; available_after: string; reservation_id: string };
        return `Đã giữ ${d.quantity} (phiếu ${d.reservation_id.slice(0, 8)}). Khả dụng còn ${d.available_after}.`;
      }
      if (i.action === 'fulfill') {
        const d = r as { quantity: string; stocked_after: string };
        return `Đã xuất ${d.quantity} theo phiếu giữ. Tồn còn ${d.stocked_after}.`;
      }
      if (i.action === 'release') {
        const d = r as { quantity: string };
        return `Đã hủy giữ ${d.quantity}, trả về khả dụng.`;
      }
      return `Danh sách phiếu giữ hàng.`;
    },
  }),
  define({
    name: 'kho.stocktake.execute', kind: 'action', permission: 'kho.stocktake.write',
    securityLevel: 2, sensitive: true,
    description: 'KIỂM KÊ (KK/05-VT): finalize=false xem lệch trước (an toàn), finalize=true chốt + điều chỉnh + ghi sổ. Chốt là GHI SỔ — host dry-run trước.',
    inputSchema: stocktakeExecuteSchema, docs: 'docs/TOOLS.md#khostocktakeexecute',
    run: (ctx, input) => executeStocktake(ctx, input),
    message: (r) => {
      const d = r as { status: string; summary: { total: number; variance: number }; doc_no?: string };
      return d.status === 'finalized'
        ? `Đã chốt kiểm kê${d.doc_no ? ` (${d.doc_no})` : ''}: ${d.summary.total} dòng, ${d.summary.variance} dòng lệch đã điều chỉnh và ghi sổ.`
        : `Bản nháp kiểm kê: ${d.summary.total} dòng, ${d.summary.variance} dòng lệch — CHƯA đụng tồn. Xác nhận để chốt.`;
    },
  }),
  define({
    name: 'kho.bom.upsert', kind: 'action', permission: 'kho.item.write',
    securityLevel: 1, sensitive: false,
    description: 'Tạo/cập nhật ĐỊNH MỨC (BOM) cho thành phẩm: danh sách nguyên liệu + lượng cần + % hao hụt. Thay toàn bộ BOM cũ.',
    inputSchema: bomUpsertSchema, docs: 'docs/TOOLS.md#khobomupsert',
    run: (ctx, input) => upsertBom(ctx, input),
    message: (r) => {
      const d = r as { sku: string; output_qty: string; lines: unknown[] };
      return `Đã lưu định mức cho ${d.sku}: ${d.lines.length} nguyên liệu / ${d.output_qty} thành phẩm mỗi mẻ.`;
    },
  }),
  define({
    name: 'kho.assembly.execute', kind: 'action', permission: 'kho.stock.write',
    securityLevel: 2, sensitive: true,
    description: 'LẮP RÁP/THÁO DỠ theo BOM: kind=assemble trừ nguyên liệu (backflush) + cộng thành phẩm + tính giá vốn; kind=disassemble ngược lại. GHI SỔ — host dry-run trước.',
    inputSchema: assemblySchema,
    docs: 'docs/TOOLS.md#khoassemblyexecute',
    run: (ctx, input) => input.kind === 'disassemble' ? disassemble(ctx, input) : assemble(ctx, input),
    message: (r) => {
      const d = r as { doc_no: string; kind: string; sku: string; qty: string; unit?: string; unit_cost?: string };
      return d.kind === 'assemble'
        ? `Đã lắp ${d.qty} ${d.sku} (${d.doc_no}), giá vốn ${d.unit_cost}đ/đơn vị. Nguyên liệu đã trừ tự động.`
        : `Đã tháo ${d.qty} ${d.sku} (${d.doc_no}), nguyên liệu hoàn về kho.`;
    },
  }),
  define({
    name: 'kho.reorder.rule_upsert', kind: 'action', permission: 'kho.item.write',
    securityLevel: 1, sensitive: false,
    description: 'Đặt RULE ĐẶT HÀNG min-max cho mặt hàng (+kho tùy chọn): dưới min → gợi ý đặt về max, kèm NCC + lead time.',
    inputSchema: reorderRuleSchema, docs: 'docs/TOOLS.md#khoreorderrule_upsert',
    run: (ctx, input) => upsertReorderRule(ctx, input),
    message: (r) => {
      const d = r as { sku: string; min_qty: string; max_qty: string; location: string };
      return `Đã đặt rule cho ${d.sku} tại ${d.location}: min ${d.min_qty} / max ${d.max_qty}.`;
    },
  }),
  define({
    name: 'kho.stock.scrap', kind: 'action', permission: 'kho.stock.write',
    securityLevel: 2, sensitive: true,
    description: 'HỦY HÀNG HỎNG/HẾT HẠN (SCR): trừ tồn khả dụng, ghi sổ scrap, tính giá trị thiệt hại theo avg_cost. GHI SỔ — host dry-run trước.',
    inputSchema: scrapSchema, docs: 'docs/TOOLS.md#khostockscrap',
    run: (ctx, input) => scrapStock(ctx, input),
    message: (r) => {
      const d = r as { doc_no: string; name: string; quantity: string; unit: string; loss_value: string };
      return `Đã hủy ${d.quantity} ${d.unit} ${d.name} (${d.doc_no}). Giá trị thiệt hại ước tính: ${d.loss_value}đ.`;
    },
  }),
  define({
    name: 'kho.landed_cost.apply', kind: 'action', permission: 'kho.stock.write',
    securityLevel: 2, sensitive: true,
    description: 'PHÂN BỔ CHI PHÍ (LC): vận chuyển/thuế NK vào các phiếu nhập theo giá trị hoặc số lượng → cập nhật giá vốn. GHI SỔ — host dry-run trước.',
    inputSchema: landedCostSchema, docs: 'docs/TOOLS.md#kholanded_costapply',
    run: (ctx, input) => applyLandedCost(ctx, input),
    message: (r) => {
      const d = r as { doc_no: string; total_cost: string; lines: unknown[] };
      return `Đã phân bổ ${d.total_cost}đ chi phí (${d.doc_no}) vào ${d.lines.length} dòng nhập — giá vốn đã cập nhật.`;
    },
  }),
  define({
    name: 'kho.abc.run', kind: 'action', permission: 'kho.stocktake.write',
    securityLevel: 1, sensitive: false,
    description: 'CHẠY PHÂN LOẠI ABC theo giá trị xuất N ngày (mặc định 90): A=top 80%, B=15% kế, C=còn lại. Ghi abc_class vào item — nền cho kiểm kê luân phiên.',
    inputSchema: abcAnalysisSchema, docs: 'docs/TOOLS.md#khoabcrun',
    run: (ctx, input) => runAbcAnalysis(ctx, input.lookback_days),
    message: (r) => {
      const d = r as { summary: { A: number; B: number; C: number } };
      return `Đã phân loại ABC: ${d.summary.A} hàng lớp A, ${d.summary.B} lớp B, ${d.summary.C} lớp C.`;
    },
  }),
  define({
    name: 'kho.replenish.params_set', kind: 'action', permission: 'kho.item.write',
    securityLevel: 1, sensitive: false,
    description: 'THIẾT LẬP THAM SỐ BỔ HÀNG (v2.1) cho mặt hàng: service level (độ phủ 0.90-0.99), lead time, chi phí đặt hàng + % lưu kho. Hệ TỰ TÍNH safety stock, reorder point động, EOQ từ lịch sử xuất thật.',
    inputSchema: replenishParamsSchema, docs: 'docs/TOOLS.md#khoreplenishparams_set',
    run: (ctx, input) => setReplenishParams(ctx, input),
    message: (r) => {
      const d = r as { sku: string; reorder_point: string; safety_stock: string; eoq: string; note?: string };
      return `Đã tính tham số bổ hàng cho ${d.sku}: điểm đặt lại ${d.reorder_point}, tồn an toàn ${d.safety_stock}, EOQ ${d.eoq}.${d.note ? ' ' + d.note : ''}`;
    },
  }),
  define({
    name: 'kho.xyz.run', kind: 'action', permission: 'kho.stocktake.write',
    securityLevel: 1, sensitive: false,
    description: 'CHẠY PHÂN LOẠI XYZ (v2.1): X ổn định / Y dao động / Z thất thường theo hệ số biến động nhu cầu. Kết hợp ABC sẵn có thành ma trận 9 ô kèm chiến lược từng ô. Tự tính demand stats trước nếu thiếu.',
    inputSchema: xyzRunSchema, docs: 'docs/TOOLS.md#khoxyzrun',
    run: async (ctx, input) => {
      await computeDemandStats(ctx, input.window_days);
      return runXyzAnalysis(ctx);
    },
    message: (r) => {
      const d = r as { matrix: Record<string, number> };
      const cells = Object.entries(d.matrix).map(([k, v]) => `${k}:${v}`).join(', ');
      return `Đã phân loại ABC-XYZ. Ma trận: ${cells}. Xem chiến lược từng nhóm trong kết quả.`;
    },
  }),
  define({
    name: 'kho.automation.run', kind: 'action', permission: 'kho.stocktake.write',
    securityLevel: 1, sensitive: false,
    description: 'CHẠY TÁC VỤ ĐỊNH KỲ (v2.1): tái tính demand stats → forecast (MA/SES) → cập nhật reorder point/safety stock → quét cảnh báo bổ hàng + hàng chết. Host nên gọi hằng ngày qua cron; Tiểu Tâm cũng gọi được khi người dùng yêu cầu "cập nhật dự báo". Ghi log kho_automation_runs — minh bạch, không chạy ngầm.',
    inputSchema: scheduledTasksSchema, docs: 'docs/TOOLS.md#khoautomationrun',
    run: (ctx, input) => runScheduledTasks(ctx, {
      windowDays: input.window_days,
      forecastMethod: input.forecast_method,
      horizonDays: input.horizon_days,
    }),
    message: (r) => {
      const d = r as { demand_stats_items: number; forecast_items: number; replenish_alerts: number; dead_stock_alerts: number };
      return `Đã chạy automation: cập nhật ${d.demand_stats_items} thống kê nhu cầu, ${d.forecast_items} dự báo. Phát hiện ${d.replenish_alerts} hàng cần bổ, ${d.dead_stock_alerts} hàng chết.`;
    },
  }),
];

/** Barcode lookup — read tool đặc biệt (quét mã → item + quy cách) */
khoReadTools.push(define({
  name: 'kho.barcode.lookup', kind: 'tool', permission: 'kho.stock.read',
  description: 'QUÉT MÃ VẠCH: tra barcode → mặt hàng + quy cách (nếu là barcode thùng/lốc thì trả kèm factor quy đổi). Nền cho workflow quét nhập/xuất/kiểm.',
  inputSchema: barcodeSchema, docs: 'docs/TOOLS.md#khobarcodelookup',
  run: async (ctx, input) => {
    const hit = await findByBarcode(ctx, input.barcode);
    return {
      sku: hit.item.sku, name: hit.item.name, unit: hit.item.unit,
      track_lot: hit.item.trackLot, track_serial: hit.item.trackSerial,
      matched_uom: hit.uom ? { uom_name: hit.uom.uomName, factor: hit.uom.factor } : null,
    };
  },
}));

/** Toàn bộ định nghĩa — manifest validate + audit */
export const khoTools: KhoToolDefinition[] = [...khoReadTools, ...khoWriteActions];

export function getKhoTool(name: string): KhoToolDefinition | undefined {
  return khoTools.find(t => t.name === name);
}
