/**
 * SOUL-RESTAURANT — Tools & Actions cho Tiểu Tâm (mặt cắt ⑥)
 *
 * Hai lớp theo chuẩn SuperCitadel:
 *   - READ TOOLS  (kind:'tool')   — tra cứu, gọi tự do, KHÔNG sensitive
 *   - WRITE ACTIONS (kind:'action') — thay đổi dữ liệu:
 *       · sensitive:true + securityLevel — host thực thi qua executeAction:
 *         lượt 1 chưa confirm → DRY-RUN preview, lượt 2 {confirm:true} → chạy thật
 *       · handler CHỈ lo nghiệp vụ + trả message tiếng Việt sẵn
 *         (Tiểu Tâm đọc lại message, không tự soạn số — chống bịa)
 *
 * 42 năng lực = 17 read + 25 action. Mỗi định nghĩa: name + kind + permission
 * + securityLevel + sensitive + inputSchema (Zod ⑦) + docs + handler.
 */
import type { z, ZodType } from 'zod';
import type { RestoCtx } from '../types.js';
import {
  tableMapSchema, menuSearchSchema, itemInfoSchema, orderViewSchema,
  openOrdersSchema, kdsQueueSchema, billViewSchema, reservationListSchema,
  salesReportSchema, topItemsSchema, recipeCoverageSchema, settingsViewSchema,
  tableUpsertSchema, tableOpenSchema, addItemsSchema, sendKitchenSchema,
  kdsUpdateSchema, serveSchema, cancelItemSchema, moveTableSchema,
  mergeOrdersSchema, discountSchema, billCreateSchema, payBillSchema,
  voidBillSchema, cancelOrderSchema, reservationManageSchema,
  menuUpsertSchema, setAvailabilitySchema, recipeSetSchema, settingsUpdateSchema,
  promoListSchema, customerLookupSchema, customerListSchema, loyaltyHistorySchema,
  promoUpsertSchema, promoApplySchema, customerUpsertSchema, orderSetCustomerSchema,
  loyaltyAdjustSchema, fireCourseSchema, consoleDashboardSchema,
} from '../validation/schemas.js';
import { tableMap, upsertTable } from '../services/table.service.js';
import {
  menuSearch, itemInfo, upsertMenuItem, setAvailability,
  setRecipe, recipeCoverage,
} from '../services/catalog.service.js';
import {
  openOrder, addItems, orderView, openOrders, cancelItem,
  applyDiscount, moveTable, mergeOrders, cancelOrder, setOrderCustomer,
} from '../services/order.service.js';
import { sendKitchen, kdsUpdate, kdsQueue, serveItems, fireCourse } from '../services/kitchen.service.js';
import { createBill, payBill, voidBill, billView } from '../services/billing.service.js';
import { manageReservation, listReservations } from '../services/reservation.service.js';
import { salesSummary, topItems } from '../services/report.service.js';
import { getSettings, updateSettings } from '../services/settings.service.js';
import { upsertPromo, listPromos, applyPromo } from '../services/promotion.service.js';
import { upsertCustomer, lookupCustomer, listCustomers } from '../services/customer.service.js';
import { adjustPoints, loyaltyHistory } from '../services/loyalty.service.js';
import { dashboard } from '../services/console.service.js';
import { fmtVnd } from '../lib/money.js';

export type ToolKind = 'tool' | 'action';
export type SecurityLevel = 1 | 2;

export interface RestoToolDefinition<S extends ZodType = ZodType> {
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
  handler(ctx: RestoCtx, rawInput: unknown): Promise<unknown>;
}

/** Kết quả chuẩn action: data + message tiếng Việt sẵn để Tiểu Tâm đọc lại */
export interface RestoActionResult {
  ok: true;
  message: string;
  data: unknown;
}

function define<S extends ZodType>(def: {
  name: string; kind: ToolKind; permission: string;
  securityLevel?: SecurityLevel; sensitive?: boolean;
  description: string; inputSchema: S; docs: string;
  run(ctx: RestoCtx, input: z.infer<S>): Promise<unknown>;
  /** Soạn message tiếng Việt từ kết quả (chỉ actions cần) */
  message?(result: unknown, input: z.infer<S>): string;
}): RestoToolDefinition<S> {
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
        return { ok: true, message: def.message(result, input), data: result } satisfies RestoActionResult;
      }
      return result;
    },
  };
}

type R<T extends (...a: never[]) => unknown> = Awaited<ReturnType<T>>;

// ────────────────────────────────────────────────────────────
// READ TOOLS (17) — gọi tự do
// ────────────────────────────────────────────────────────────

export const restoReadTools: RestoToolDefinition[] = [
  define({
    name: 'resto.table.map', kind: 'tool', permission: 'resto.table.read',
    description: 'SƠ ĐỒ BÀN theo khu: trạng thái (trống/có khách/đặt trước/đang dọn) + đơn đang mở & tạm tính. Hỏi "bàn nào trống", "sơ đồ sàn".',
    inputSchema: tableMapSchema, docs: 'docs/TOOLS.md#restotablemap',
    run: (ctx, input) => tableMap(ctx, input),
  }),
  define({
    name: 'resto.menu.search', kind: 'tool', permission: 'resto.menu.read',
    description: 'TRA MENU theo từ khóa/danh mục: giá, còn/hết, có tùy chọn không. Hỏi "menu có gì", "giá phở".',
    inputSchema: menuSearchSchema, docs: 'docs/TOOLS.md#restomenusearch',
    run: (ctx, input) => menuSearch(ctx, input),
  }),
  define({
    name: 'resto.menu.item_info', kind: 'tool', permission: 'resto.menu.read',
    description: 'CHI TIẾT 1 MÓN: giá, tùy chọn (size/topping), thành phần combo, định lượng nguyên liệu. Hỏi "phở bò có tùy chọn gì".',
    inputSchema: itemInfoSchema, docs: 'docs/TOOLS.md#restomenuitem_info',
    run: (ctx, input) => itemInfo(ctx, input),
  }),
  define({
    name: 'resto.order.view', kind: 'tool', permission: 'resto.order.read',
    description: 'XEM ĐƠN của bàn/mã đơn: món + trạng thái từng món + tạm tính đầy đủ + bills. Hỏi "bàn 5 gọi gì rồi", "đơn này bao nhiêu tiền".',
    inputSchema: orderViewSchema, docs: 'docs/TOOLS.md#restoorderview',
    run: (ctx, input) => orderView(ctx, input),
  }),
  define({
    name: 'resto.order.open_list', kind: 'tool', permission: 'resto.order.read',
    description: 'DANH SÁCH ĐƠN ĐANG MỞ toàn quán (lọc theo loại dine_in/takeaway/delivery). Hỏi "đang có mấy bàn ăn", "đơn mang về nào chưa xong".',
    inputSchema: openOrdersSchema, docs: 'docs/TOOLS.md#restoorderopen_list',
    run: (ctx, input) => openOrders(ctx, input),
  }),
  define({
    name: 'resto.kds.queue', kind: 'tool', permission: 'resto.kitchen.read',
    description: 'MÀN HÌNH BẾP: phiếu KOT đang chờ/đang nấu/đã xong theo trạm, FIFO, kèm tuổi phiếu (phút). Hỏi "bếp đang nấu gì", "phiếu nào lâu nhất".',
    inputSchema: kdsQueueSchema, docs: 'docs/TOOLS.md#restokdsqueue',
    run: (ctx, input) => kdsQueue(ctx, input),
  }),
  define({
    name: 'resto.bill.view', kind: 'tool', permission: 'resto.bill.read',
    description: 'XEM BILL theo mã bill hoặc theo bàn/đơn: món, tổng, đã thu, còn lại, lịch sử thanh toán. Hỏi "bill bàn 5", "hóa đơn BILL-xxx".',
    inputSchema: billViewSchema, docs: 'docs/TOOLS.md#restobillview',
    run: (ctx, input) => billView(ctx, input),
  }),
  define({
    name: 'resto.reservation.list', kind: 'tool', permission: 'resto.reservation.read',
    description: 'DANH SÁCH ĐẶT BÀN trong khoảng ngày (mặc định hôm nay + 7 ngày). Hỏi "hôm nay có đặt bàn nào", "lịch đặt tuần này".',
    inputSchema: reservationListSchema, docs: 'docs/TOOLS.md#restoreservationlist',
    run: (ctx, input) => listReservations(ctx, input),
  }),
  define({
    name: 'resto.report.sales', kind: 'tool', permission: 'resto.report.read',
    description: 'BÁO CÁO DOANH THU theo khoảng ngày (mặc định hôm nay): tổng thu, số bill/đơn, TB/đơn, theo phương thức, theo loại đơn. Hỏi "hôm nay bán được bao nhiêu".',
    inputSchema: salesReportSchema, docs: 'docs/TOOLS.md#restoreportsales',
    run: (ctx, input) => salesSummary(ctx, input),
  }),
  define({
    name: 'resto.report.top_items', kind: 'tool', permission: 'resto.report.read',
    description: 'MÓN BÁN CHẠY theo doanh thu đã thanh toán trong khoảng ngày. Hỏi "món nào bán chạy nhất tuần này".',
    inputSchema: topItemsSchema, docs: 'docs/TOOLS.md#restoreporttop_items',
    run: (ctx, input) => topItems(ctx, input),
  }),
  define({
    name: 'resto.recipe.coverage', kind: 'tool', permission: 'resto.menu.read',
    description: 'MÓN CHƯA KHAI ĐỊNH LƯỢNG nguyên liệu (không trừ kho được) + combo thiếu recipe thành phần. Hỏi "món nào chưa có công thức".',
    inputSchema: recipeCoverageSchema, docs: 'docs/TOOLS.md#restorecipecoverage',
    run: (ctx) => recipeCoverage(ctx),
  }),
  define({
    name: 'resto.settings.view', kind: 'tool', permission: 'resto.settings.read',
    description: 'XEM CẤU HÌNH quán: phí phục vụ %, VAT % (gộp/cộng ngoài), trừ kho khi nào, tự dọn bàn. Hỏi "quán đang cài đặt gì".',
    inputSchema: settingsViewSchema, docs: 'docs/TOOLS.md#restosettingsview',
    run: (ctx) => getSettings(ctx),
  }),
  // -- v1.1 . Khuyen mai & Khach hang --
  define({
    name: 'resto.promo.list', kind: 'tool', permission: 'resto.promo.read',
    description: 'DANH SÁCH KHUYẾN MÃI: voucher/happy-hour/auto, mã, mức giảm, đã dùng bao nhiêu lượt. Hỏi "có mã giảm giá nào", "khuyến mãi đang chạy".',
    inputSchema: promoListSchema, docs: 'docs/TOOLS.md#restopromolist',
    run: (ctx, input) => listPromos(ctx, input),
  }),
  define({
    name: 'resto.customer.lookup', kind: 'tool', permission: 'resto.customer.read',
    description: 'TRA KHÁCH THÂN THIẾT theo SĐT: điểm tích lũy, số lần ghé, chi tiêu, đơn gần đây. Hỏi "khách 0909... còn bao nhiêu điểm".',
    inputSchema: customerLookupSchema, docs: 'docs/TOOLS.md#restocustomerlookup',
    run: (ctx, input) => lookupCustomer(ctx, input),
  }),
  define({
    name: 'resto.customer.list', kind: 'tool', permission: 'resto.customer.read',
    description: 'DANH SÁCH KHÁCH (tìm theo tên/SĐT): điểm, hạng, số lần ghé. Hỏi "danh sách khách quen", "tìm khách tên Long".',
    inputSchema: customerListSchema, docs: 'docs/TOOLS.md#restocustomerlist',
    run: (ctx, input) => listCustomers(ctx, input),
  }),
  define({
    name: 'resto.loyalty.history', kind: 'tool', permission: 'resto.loyalty.read',
    description: 'SỔ ĐIỂM của một khách: tích/đổi/điều chỉnh theo thời gian + số dư. Hỏi "lịch sử điểm khách 0909...".',
    inputSchema: loyaltyHistorySchema, docs: 'docs/TOOLS.md#restoloyaltyhistory',
    run: (ctx, input) => loyaltyHistory(ctx, input),
  }),
  define({
    name: 'resto.console.dashboard', kind: 'tool', permission: 'resto.report.read',
    description: 'TỔNG QUAN QUÁN thời gian thực: đơn đang mở, hàng đợi bếp theo trạm, doanh thu hôm nay, khuyến mãi đang chạy, khách nhiều điểm. Hỏi "tình hình quán thế nào", "tổng quan hôm nay".',
    inputSchema: consoleDashboardSchema, docs: 'docs/TOOLS.md#restoconsoledashboard',
    run: (ctx) => dashboard(ctx),
  }),
];

// ────────────────────────────────────────────────────────────
// WRITE ACTIONS (25) — thay đổi dữ liệu
// ────────────────────────────────────────────────────────────

export const restoWriteActions: RestoToolDefinition[] = [
  define({
    name: 'resto.table.upsert', kind: 'action', permission: 'resto.table.write',
    description: 'THÊM/SỬA BÀN: tên, khu vực (tự tạo), sức chứa. Nói "thêm bàn 12 khu sân vườn 6 chỗ".',
    inputSchema: tableUpsertSchema, docs: 'docs/TOOLS.md#restotableupsert',
    run: (ctx, input) => upsertTable(ctx, input),
    message: (r) => {
      const v = r as R<typeof upsertTable>;
      return `${v.created ? 'Đã thêm' : 'Đã cập nhật'} bàn "${v.name}"${v.area ? ` (khu ${v.area})` : ''}.`;
    },
  }),
  define({
    name: 'resto.table.open', kind: 'action', permission: 'resto.order.write',
    description: 'MỞ BÀN / MỞ ĐƠN MỚI: dine_in cần tên bàn (bàn → có khách); takeaway/delivery không cần bàn. Nói "mở bàn 5, 4 khách", "tạo đơn mang về".',
    inputSchema: tableOpenSchema, docs: 'docs/TOOLS.md#restotableopen',
    run: (ctx, input) => openOrder(ctx, input),
    message: (r) => {
      const v = r as R<typeof openOrder>;
      const loai = v.type === 'dine_in' ? `bàn ${v.table}` : v.type === 'takeaway' ? 'mang về' : 'giao đi';
      return `Đã mở đơn ${v.order_code} (${loai}${v.guests ? `, ${v.guests} khách` : ''}).`;
    },
  }),
  define({
    name: 'resto.order.add_items', kind: 'action', permission: 'resto.order.write',
    description: 'GỌI MÓN vào đơn (theo bàn hoặc mã đơn): tên món + số lượng + tùy chọn (size, topping) + ghi chú. Nói "bàn 5 gọi 2 phở bò thêm trứng, 1 trà đá".',
    inputSchema: addItemsSchema, docs: 'docs/TOOLS.md#restoorderadd_items',
    run: (ctx, input) => addItems(ctx, input),
    message: (r) => {
      const v = r as R<typeof addItems>;
      const list = v.added.map((a) => `${a.qty} ${a.name}${a.options.length ? ` (${a.options.join(', ')})` : ''}`).join(', ');
      return `Đã thêm vào đơn ${v.order_code}: ${list}. Tạm tính ${fmtVnd(v.totals.grand_total)}.`;
    },
  }),
  define({
    name: 'resto.order.send_kitchen', kind: 'action', permission: 'resto.kitchen.write',
    description: 'GỬI BẾP: mọi món chưa gửi → phiếu KOT tách theo trạm bếp. Nói "gửi bếp bàn 5", "báo bếp làm".',
    inputSchema: sendKitchenSchema, docs: 'docs/TOOLS.md#restoordersend_kitchen',
    run: (ctx, input) => sendKitchen(ctx, input),
    message: (r) => {
      const v = r as R<typeof sendKitchen>;
      const parts = v.kots.map((k) => `${k.kot_code} → ${k.station} (${k.items.length} món)`).join('; ');
      return `Đã gửi bếp đơn ${v.order_code}: ${parts}.`;
    },
  }),
  define({
    name: 'resto.kds.update', kind: 'action', permission: 'resto.kitchen.write',
    description: 'BẾP CẬP NHẬT PHIẾU: preparing (bắt đầu nấu) / ready (xong, chờ lên) / completed. Nói "phiếu KOT-xxx đang nấu", "KOT-xxx xong rồi".',
    inputSchema: kdsUpdateSchema, docs: 'docs/TOOLS.md#restokdsupdate',
    run: (ctx, input) => kdsUpdate(ctx, input),
    message: (r) => {
      const v = r as R<typeof kdsUpdate>;
      const label = v.status === 'preparing' ? 'đang nấu' : v.status === 'ready' ? 'đã xong — chờ lên món' : 'hoàn tất';
      return `Phiếu ${v.kot_code}: ${label} (${v.items_updated} món cập nhật).`;
    },
  }),
  define({
    name: 'resto.order.serve', kind: 'action', permission: 'resto.order.write',
    description: 'LÊN MÓN cho khách: mặc định mọi món bếp đã báo xong (ready); hoặc nêu tên món cụ thể. Nói "lên món bàn 5", "đã đưa phở bò bàn 3".',
    inputSchema: serveSchema, docs: 'docs/TOOLS.md#restoorderserve',
    run: (ctx, input) => serveItems(ctx, input),
    message: (r) => {
      const v = r as R<typeof serveItems>;
      return `Đã lên ${v.served.map((s) => `${s.qty} ${s.name}`).join(', ')} cho đơn ${v.order_code}.`;
    },
  }),
  define({
    name: 'resto.order.cancel_item', kind: 'action', permission: 'resto.order.write',
    sensitive: true,
    description: 'HỦY 1 MÓN trong đơn (bắt buộc lý do). Món đã phục vụ/đã vào bill không hủy được. Nói "hủy trà đá bàn 5, khách đổi ý".',
    inputSchema: cancelItemSchema, docs: 'docs/TOOLS.md#restoordercancel_item',
    run: (ctx, input) => cancelItem(ctx, input),
    message: (r) => {
      const v = r as R<typeof cancelItem>;
      return `Đã hủy ${v.qty} ${v.item} khỏi đơn ${v.order_code}${v.was_sent ? ' (⚠️ món ĐÃ gửi bếp — báo bếp bỏ)' : ''}. Tạm tính còn ${fmtVnd(v.totals.grand_total)}.`;
    },
  }),
  define({
    name: 'resto.order.move_table', kind: 'action', permission: 'resto.order.write',
    description: 'CHUYỂN BÀN: dời đơn sang bàn trống khác. Nói "chuyển bàn 5 sang bàn 8".',
    inputSchema: moveTableSchema, docs: 'docs/TOOLS.md#restoordermove_table',
    run: (ctx, input) => moveTable(ctx, input),
    message: (r) => {
      const v = r as R<typeof moveTable>;
      return `Đã chuyển đơn ${v.order_code}${v.from ? ` từ bàn ${v.from}` : ''} sang bàn ${v.to}.`;
    },
  }),
  define({
    name: 'resto.order.merge', kind: 'action', permission: 'resto.order.write',
    sensitive: true,
    description: 'GỘP BÀN: dồn hết món của bàn nguồn sang bàn đích (tính chung 1 bill). Nói "gộp bàn 3 vào bàn 5".',
    inputSchema: mergeOrdersSchema, docs: 'docs/TOOLS.md#restoordermerge',
    run: (ctx, input) => mergeOrders(ctx, input),
    message: (r) => {
      const v = r as R<typeof mergeOrders>;
      return `Đã gộp ${v.moved_items} món từ đơn ${v.from_code} vào ${v.to_code}. Tạm tính chung ${fmtVnd(v.totals.grand_total)}.`;
    },
  }),
  define({
    name: 'resto.order.discount', kind: 'action', permission: 'resto.order.write',
    sensitive: true,
    description: 'GIẢM GIÁ mức đơn: theo số tiền hoặc %. Nói "giảm 10% bàn 5", "bớt 50 nghìn đơn này vì khách quen".',
    inputSchema: discountSchema, docs: 'docs/TOOLS.md#restoorderdiscount',
    run: (ctx, input) => applyDiscount(ctx, input),
    message: (r, input) => {
      const v = r as R<typeof applyDiscount>;
      const kieu = input.discount_type === 'percent' ? `${input.value}%` : fmtVnd(input.value);
      return `Đã giảm ${kieu} cho đơn ${v.order_code} (trừ ${fmtVnd(v.totals.discount_total)}). Tạm tính còn ${fmtVnd(v.totals.grand_total)}.`;
    },
  }),
  define({
    name: 'resto.bill.create', kind: 'action', permission: 'resto.bill.write',
    sensitive: true,
    description: 'TẠO BILL (chốt tạm tính): mặc định gom hết món chưa bill; truyền item_names để TÁCH bill (khách chia tiền). Nói "in bill bàn 5", "tách bill: 2 phở tính riêng".',
    inputSchema: billCreateSchema, docs: 'docs/TOOLS.md#restobillcreate',
    run: (ctx, input) => createBill(ctx, input),
    message: (r) => {
      const v = r as R<typeof createBill>;
      return `Đã tạo bill ${v.bill_code} (đơn ${v.order_code}): ${v.items.length} món, tổng ${v.grand_total_fmt}.`;
    },
  }),
  define({
    name: 'resto.bill.pay', kind: 'action', permission: 'resto.bill.write',
    securityLevel: 2, sensitive: true,
    description: 'THANH TOÁN: theo bill_code hoặc theo bàn/đơn (chưa có bill → tự tạo full bill rồi thu luôn). Tiền mặt đưa dư → tính tiền thối. Nói "bàn 5 thanh toán tiền mặt 500k", "thu bill BILL-xxx chuyển khoản".',
    inputSchema: payBillSchema, docs: 'docs/TOOLS.md#restobillpay',
    run: (ctx, input) => payBill(ctx, input),
    message: (r) => {
      const v = r as R<typeof payBill>;
      const label = v.method === 'points' ? 'đổi điểm' : v.method;
      let msg = `Đã thu ${v.applied_fmt} (${label}) cho bill ${v.bill_code}.`;
      if (v.change !== '0.00') msg += ` Thối lại ${v.change_fmt}.`;
      if (v.bill_status !== 'paid') msg += ` Còn thiếu ${v.remaining_fmt}.`;
      if (v.order_closed) msg += ` Đơn ${v.order_code} đã đóng, bàn được giải phóng.`;
      if (v.loyalty.earned !== '0.00') msg += ` Khách được +${fmtVnd(v.loyalty.earned)} điểm.`;
      if (v.deduction.emitted) msg += ` Đã gửi yêu cầu trừ kho (${v.deduction.lines} nguyên liệu).`;
      if (v.deduction.missing_recipe.length) msg += ` ⚠️ Chưa có định lượng: ${v.deduction.missing_recipe.join(', ')}.`;
      return msg;
    },
  }),
  define({
    name: 'resto.bill.void', kind: 'action', permission: 'resto.bill.write',
    securityLevel: 2, sensitive: true,
    description: 'HỦY BILL chưa thanh toán (bắt buộc lý do) — món trong bill được tự do để tính lại. Bill đã thanh toán KHÔNG void được. Nói "hủy bill BILL-xxx, tính sai".',
    inputSchema: voidBillSchema, docs: 'docs/TOOLS.md#restobillvoid',
    run: (ctx, input) => voidBill(ctx, input),
    message: (r) => {
      const v = r as R<typeof voidBill>;
      return `Đã void bill ${v.bill_code} (đơn ${v.order_code}) — món trong bill có thể tính lại.`;
    },
  }),
  define({
    name: 'resto.order.cancel', kind: 'action', permission: 'resto.order.write',
    securityLevel: 2, sensitive: true,
    description: 'HỦY CẢ ĐƠN (bắt buộc lý do): hủy mọi món + phiếu bếp, void bill chưa thu, thả bàn. Đơn có bill ĐÃ thanh toán không hủy được. Nói "hủy đơn bàn 5, khách bỏ về".',
    inputSchema: cancelOrderSchema, docs: 'docs/TOOLS.md#restoordercancel',
    run: (ctx, input) => cancelOrder(ctx, input),
    message: (r, input) => {
      const v = r as R<typeof cancelOrder>;
      return `Đã hủy đơn ${v.order_code} (${v.cancelled_items} món) — lý do: ${input.reason}.`;
    },
  }),
  define({
    name: 'resto.reservation.manage', kind: 'action', permission: 'resto.reservation.write',
    description: 'ĐẶT BÀN một cửa: op=create (tạo, check trùng giờ) / confirm / seat (khách tới → mở đơn luôn) / cancel / no_show. Nói "đặt bàn 6 người 7h tối tên anh Long", "khách RSV-xxx tới rồi".',
    inputSchema: reservationManageSchema, docs: 'docs/TOOLS.md#restoreservationmanage',
    run: (ctx, input) => manageReservation(ctx, input),
    message: (r, input) => {
      const v = r as R<typeof manageReservation>;
      if (input.op === 'create') {
        return `Đã tạo đặt bàn ${v.code} cho ${v.customer_name} (${v.party_size} khách, ${v.at}${v.table ? `, bàn ${v.table}` : ''}).${v.warning ? ` ${v.warning}.` : ''}`;
      }
      if (input.op === 'seat') return `Khách ${v.customer_name} đã nhận bàn ${v.table} — mở đơn ${v.order_code}.`;
      const label = v.status === 'confirmed' ? 'đã xác nhận' : v.status === 'cancelled' ? 'đã hủy' : 'đánh dấu không đến';
      return `Đặt bàn ${v.code} ${label}.`;
    },
  }),
  define({
    name: 'resto.menu.upsert', kind: 'action', permission: 'resto.menu.write',
    description: 'THÊM/SỬA MÓN trọn gói: giá, danh mục, trạm bếp, nhóm tùy chọn (size/topping + phụ thu), thành phần combo. Nói "thêm món phở bò 45k, bếp nóng, tùy chọn thêm trứng +5k".',
    inputSchema: menuUpsertSchema, docs: 'docs/TOOLS.md#restomenuupsert',
    run: (ctx, input) => upsertMenuItem(ctx, input),
    message: (r) => {
      const v = r as R<typeof upsertMenuItem>;
      let msg = `${v.created ? 'Đã thêm' : 'Đã cập nhật'} món "${v.name}" — giá ${fmtVnd(v.price)}${v.kind === 'combo' ? ' (combo)' : ''}.`;
      if (v.options_linked) msg += ` Gắn ${v.options_linked} nhóm tùy chọn.`;
      if (v.combo_components) msg += ` ${v.combo_components} thành phần.`;
      return msg;
    },
  }),
  define({
    name: 'resto.menu.set_availability', kind: 'action', permission: 'resto.menu.write',
    description: 'BÁO HẾT MÓN / MỞ BÁN LẠI trong ngày. Nói "hết phở bò rồi", "phở bò có lại rồi".',
    inputSchema: setAvailabilitySchema, docs: 'docs/TOOLS.md#restomenuset_availability',
    run: (ctx, input) => setAvailability(ctx, input),
    message: (r) => {
      const v = r as R<typeof setAvailability>;
      return v.sold_out ? `Đã báo hết món "${v.name}" — gọi món sẽ bị chặn.` : `Món "${v.name}" đã mở bán lại.`;
    },
  }),
  define({
    name: 'resto.recipe.set', kind: 'action', permission: 'resto.menu.write',
    description: 'KHAI ĐỊNH LƯỢNG nguyên liệu cho món (SKU kho + số lượng/phần) — để tự trừ kho khi bán. Nói "phở bò dùng 0.2kg bánh phở BP-01, 0.15kg thịt bò TB-02".',
    inputSchema: recipeSetSchema, docs: 'docs/TOOLS.md#restorecipeset',
    run: (ctx, input) => setRecipe(ctx, input),
    message: (r) => {
      const v = r as R<typeof setRecipe>;
      return `Đã khai định lượng cho "${v.item}": ${v.lines} nguyên liệu.`;
    },
  }),
  define({
    name: 'resto.settings.update', kind: 'action', permission: 'resto.settings.write',
    securityLevel: 2, sensitive: true,
    description: 'CẬP NHẬT CẤU HÌNH quán: phí phục vụ %, VAT % + gộp/cộng ngoài, trừ kho khi paid/served, tự chuyển bàn sang dọn dẹp. Nói "đặt phí phục vụ 5%", "VAT 8% giá đã gồm thuế".',
    inputSchema: settingsUpdateSchema, docs: 'docs/TOOLS.md#restosettingsupdate',
    run: (ctx, input) => updateSettings(ctx, input),
    message: (r) => {
      const v = r as R<typeof updateSettings>;
      return `Đã cập nhật cấu hình: phí phục vụ ${v.service_charge_pct}%, VAT ${v.tax_pct}% (${v.price_includes_tax ? 'giá gộp thuế' : 'cộng ngoài'}), trừ kho khi ${v.deduct_on === 'paid' ? 'thanh toán' : 'lên món'}.`;
    },
  }),
  // ── v1.1 · Khuyến mãi & Khách hàng thân thiết ──
  define({
    name: 'resto.promo.upsert', kind: 'action', permission: 'resto.promo.write',
    securityLevel: 1, sensitive: true,
    description: 'TẠO/SỬA KHUYẾN MÃI: voucher (có mã), happy_hour (khung giờ +07:00), auto. Giảm %/tiền, đơn tối thiểu, trần giảm, giới hạn lượt/khách. Nói "tạo voucher GIAM10 giảm 10% đơn từ 100k".',
    inputSchema: promoUpsertSchema, docs: 'docs/TOOLS.md#restopromoupsert',
    run: (ctx, input) => upsertPromo(ctx, input),
    message: (r) => {
      const v = r as R<typeof upsertPromo>;
      const giam = v.discount_type === 'percent' ? `${v.value}%` : fmtVnd(v.value);
      return `${v.created ? 'Đã tạo' : 'Đã cập nhật'} khuyến mãi "${v.name}"${v.code ? ` (mã ${v.code})` : ''} — giảm ${giam}.`;
    },
  }),
  define({
    name: 'resto.promo.apply', kind: 'action', permission: 'resto.promo.write',
    securityLevel: 1, sensitive: true,
    description: 'ÁP MÃ KHUYẾN MÃI vào đơn (hoặc remove:true để gỡ). Kiểm tra hạn/khung giờ/đơn tối thiểu/giới hạn lượt. Nói "áp mã GIAM10 cho bàn 5", "gỡ khuyến mãi bàn 5".',
    inputSchema: promoApplySchema, docs: 'docs/TOOLS.md#restopromoapply',
    run: (ctx, input) => applyPromo(ctx, input),
    message: (r) => {
      const v = r as R<typeof applyPromo>;
      if (v.removed) return `Đã gỡ khuyến mãi khỏi đơn ${v.order_code}. Tổng mới: ${fmtVnd(v.totals.grand_total)}.`;
      return `Đã áp mã ${v.code} cho đơn ${v.order_code} — giảm ${v.discount_amount_fmt}. Tổng còn ${fmtVnd(v.totals.grand_total)}.`;
    },
  }),
  define({
    name: 'resto.customer.upsert', kind: 'action', permission: 'resto.customer.write',
    description: 'TẠO/SỬA HỒ SƠ KHÁCH thân thiết (khóa theo SĐT): tên, hạng, ghi chú. Nói "thêm khách Long 0909123456".',
    inputSchema: customerUpsertSchema, docs: 'docs/TOOLS.md#restocustomerupsert',
    run: (ctx, input) => upsertCustomer(ctx, input),
    message: (r) => {
      const v = r as R<typeof upsertCustomer>;
      return `${v.created ? 'Đã thêm' : 'Đã cập nhật'} khách ${v.name} (${v.phone}) — số dư ${fmtVnd(v.points_balance)} điểm, ${v.visits} lần ghé.`;
    },
  }),
  define({
    name: 'resto.order.set_customer', kind: 'action', permission: 'resto.customer.write',
    description: 'GẮN KHÁCH THÂN THIẾT (theo SĐT, tự tạo nếu chưa có) vào đơn đang mở — để tích/đổi điểm khi thanh toán. Nói "gắn khách 0909123456 vào bàn 5".',
    inputSchema: orderSetCustomerSchema, docs: 'docs/TOOLS.md#restoorderset_customer',
    run: (ctx, input) => setOrderCustomer(ctx, input),
    message: (r) => {
      const v = r as R<typeof setOrderCustomer>;
      return `Đã gắn khách ${v.name} (${v.phone}) vào đơn ${v.order_code}.`;
    },
  }),
  define({
    name: 'resto.loyalty.adjust', kind: 'action', permission: 'resto.loyalty.write',
    securityLevel: 2, sensitive: true,
    description: 'ĐIỀU CHỈNH ĐIỂM tay cho khách (comp/sửa sai) — points dương để cộng, âm để trừ, bắt buộc lý do. Nói "cộng 50000 điểm cho khách 0909... vì khiếu nại".',
    inputSchema: loyaltyAdjustSchema, docs: 'docs/TOOLS.md#restoloyaltyadjust',
    run: (ctx, input) => adjustPoints(ctx, input),
    message: (r) => {
      const v = r as R<typeof adjustPoints>;
      const sign = v.delta.startsWith('-') ? 'Trừ' : 'Cộng';
      return `${sign} điểm cho ${v.name}: số dư mới ${v.balance_after_fmt}.`;
    },
  }),
  define({
    name: 'resto.order.fire_course', kind: 'action', permission: 'resto.kitchen.write',
    description: 'RA MÓN THEO LƯỢT (fire-by-course): gửi bếp CHỈ các món của một course cụ thể — dùng khi phục vụ theo trình tự (khai vị → món chính → tráng miệng). Nói "ra món course 2 bàn 5".',
    inputSchema: fireCourseSchema, docs: 'docs/TOOLS.md#restoorderfire_course',
    run: (ctx, input) => fireCourse(ctx, input),
    message: (r) => {
      const v = r as R<typeof fireCourse>;
      return `Đã gửi bếp course ${v.course} của đơn ${v.order_code}: ${v.kots.length} phiếu.`;
    },
  }),
];

export const restoTools: RestoToolDefinition[] = [...restoReadTools, ...restoWriteActions];

export function getRestoTool(name: string): RestoToolDefinition | undefined {
  return restoTools.find((t) => t.name === name);
}
