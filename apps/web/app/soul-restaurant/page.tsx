'use client';
/**
 * SOUL-RESTAURANT — web/RestaurantConsole.tsx
 * Bảng điều khiển vận hành cho apps/web (Next 15). Render ĐỘNG từ
 * restoUiCatalog → mọi năng lực (42) là một nút thật, gọi đúng route module.
 * "Sống 100%": không nút chết — thêm tool phải thêm entry catalog (audit ép 1:1).
 *
 * Mount tại /restaurant (khai trong manifest.module.json#menu). Component này
 * KHÔNG nằm trong tsc của module (tsconfig include chỉ src+tests); apps/web
 * biên dịch nó. Import catalog + client từ package module.
 *
 * Dùng:
 *   import { RestaurantConsole } from '@citadel/module-soul-restaurant/web/RestaurantConsole';
 *   <RestaurantConsole />   // JWT do host gắn qua cookie/session
 */
import React, { useEffect, useMemo, useState } from 'react';
type UiFieldType = 'text' | 'number' | 'bool' | 'select' | 'json' | 'textarea';

interface UiField {
  name: string;
  label: string;
  type: UiFieldType;
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

interface UiCapability {
  tool: string;                 // khớp tên tool trong registry
  group: string;                // nhóm hiển thị trên sidebar
  label: string;                // nhãn nút (tiếng Việt)
  kind: 'read' | 'action';
  method: 'GET' | 'POST';
  path: string;                 // route nội bộ (dưới /api/v1/soul-restaurant)
  sensitive?: boolean;          // action nhạy cảm → xác nhận trước khi chạy
  fields: UiField[];
}

const F = (name: string, label: string, type: UiFieldType = 'text', extra: Partial<UiField> = {}): UiField =>
  ({ name, label, type, ...extra });

const UI_GROUPS = [
  'Bảng điều khiển', 'Sàn & Bàn', 'Đơn hàng', 'Bếp / KDS', 'Menu & Định lượng',
  'Bill & Thanh toán', 'Đặt bàn', 'Khuyến mãi', 'Khách & Điểm', 'Báo cáo', 'Cấu hình',
] as const;

const restoUiCatalog: UiCapability[] = [
  // ── Bảng điều khiển ──
  { tool: 'resto.console.dashboard', group: 'Bảng điều khiển', label: 'Tổng quan quán', kind: 'read', method: 'GET', path: '/restaurant/dashboard', fields: [] },

  // ── Sàn & Bàn ──
  { tool: 'resto.table.map', group: 'Sàn & Bàn', label: 'Sơ đồ bàn', kind: 'read', method: 'GET', path: '/restaurant/tables/map', fields: [F('area', 'Khu vực')] },
  { tool: 'resto.table.upsert', group: 'Sàn & Bàn', label: 'Thêm / sửa bàn', kind: 'action', method: 'POST', path: '/restaurant/tables', fields: [F('name', 'Tên bàn', 'text', { required: true }), F('area', 'Khu vực'), F('capacity', 'Số chỗ', 'number'), F('shape', 'Hình', 'select', { options: ['square', 'round', 'rect', 'bar'] }), F('active', 'Đang dùng', 'bool')] },

  // ── Đơn hàng ──
  { tool: 'resto.table.open', group: 'Đơn hàng', label: 'Mở bàn / đơn', kind: 'action', method: 'POST', path: '/restaurant/orders/open', fields: [F('table', 'Bàn'), F('type', 'Loại', 'select', { options: ['dine_in', 'takeaway', 'delivery'] }), F('guests', 'Số khách', 'number'), F('customer_name', 'Tên khách'), F('customer_phone', 'SĐT'), F('note', 'Ghi chú')] },
  { tool: 'resto.order.add_items', group: 'Đơn hàng', label: 'Gọi món', kind: 'action', method: 'POST', path: '/restaurant/orders/items', fields: [F('table', 'Bàn'), F('order_code', 'Mã đơn'), F('items', 'Món (JSON: [{name,qty,options,course}])', 'json', { required: true })] },
  { tool: 'resto.order.view', group: 'Đơn hàng', label: 'Xem đơn', kind: 'read', method: 'GET', path: '/restaurant/orders/view', fields: [F('table', 'Bàn'), F('order_code', 'Mã đơn')] },
  { tool: 'resto.order.open_list', group: 'Đơn hàng', label: 'Đơn đang mở', kind: 'read', method: 'GET', path: '/restaurant/orders/open-list', fields: [F('type', 'Loại', 'select', { options: ['dine_in', 'takeaway', 'delivery'] })] },
  { tool: 'resto.order.cancel_item', group: 'Đơn hàng', label: 'Hủy món', kind: 'action', method: 'POST', path: '/restaurant/orders/cancel-item', sensitive: true, fields: [F('table', 'Bàn'), F('order_code', 'Mã đơn'), F('item', 'Tên món', 'text', { required: true }), F('qty', 'SL hủy', 'number'), F('reason', 'Lý do', 'text', { required: true })] },
  { tool: 'resto.order.discount', group: 'Đơn hàng', label: 'Giảm giá đơn', kind: 'action', method: 'POST', path: '/restaurant/orders/discount', sensitive: true, fields: [F('table', 'Bàn'), F('order_code', 'Mã đơn'), F('discount_type', 'Kiểu', 'select', { required: true, options: ['percent', 'amount'] }), F('value', 'Giá trị', 'text', { required: true }), F('reason', 'Lý do')] },
  { tool: 'resto.order.move_table', group: 'Đơn hàng', label: 'Chuyển bàn', kind: 'action', method: 'POST', path: '/restaurant/orders/move-table', fields: [F('table', 'Bàn hiện tại', 'text', { required: true }), F('to_table', 'Bàn đích', 'text', { required: true })] },
  { tool: 'resto.order.merge', group: 'Đơn hàng', label: 'Gộp bàn', kind: 'action', method: 'POST', path: '/restaurant/orders/merge', sensitive: true, fields: [F('from_table', 'Bàn nguồn', 'text', { required: true }), F('to_table', 'Bàn đích', 'text', { required: true })] },
  { tool: 'resto.order.cancel', group: 'Đơn hàng', label: 'Hủy cả đơn', kind: 'action', method: 'POST', path: '/restaurant/orders/cancel', sensitive: true, fields: [F('table', 'Bàn'), F('order_code', 'Mã đơn'), F('reason', 'Lý do', 'text', { required: true })] },
  { tool: 'resto.order.set_customer', group: 'Đơn hàng', label: 'Gắn khách vào đơn', kind: 'action', method: 'POST', path: '/restaurant/orders/set-customer', fields: [F('table', 'Bàn'), F('order_code', 'Mã đơn'), F('phone', 'SĐT khách', 'text', { required: true }), F('name', 'Tên khách')] },

  // ── Bếp / KDS ──
  { tool: 'resto.order.send_kitchen', group: 'Bếp / KDS', label: 'Gửi bếp', kind: 'action', method: 'POST', path: '/restaurant/orders/send-kitchen', fields: [F('table', 'Bàn'), F('order_code', 'Mã đơn'), F('note', 'Ghi chú')] },
  { tool: 'resto.order.fire_course', group: 'Bếp / KDS', label: 'Ra món theo lượt (course)', kind: 'action', method: 'POST', path: '/restaurant/orders/fire-course', fields: [F('table', 'Bàn'), F('order_code', 'Mã đơn'), F('course', 'Course #', 'number', { required: true }), F('note', 'Ghi chú')] },
  { tool: 'resto.order.serve', group: 'Bếp / KDS', label: 'Lên món', kind: 'action', method: 'POST', path: '/restaurant/orders/serve', fields: [F('table', 'Bàn'), F('order_code', 'Mã đơn'), F('items', 'Món cụ thể (JSON tên)', 'json')] },
  { tool: 'resto.kds.queue', group: 'Bếp / KDS', label: 'Hàng đợi bếp', kind: 'read', method: 'GET', path: '/restaurant/kds/queue', fields: [F('station', 'Trạm'), F('status', 'Trạng thái', 'select', { options: ['queued', 'preparing', 'ready', 'completed'] }), F('limit', 'Giới hạn', 'number')] },
  { tool: 'resto.kds.update', group: 'Bếp / KDS', label: 'Cập nhật phiếu bếp', kind: 'action', method: 'POST', path: '/restaurant/kds/update', fields: [F('kot_code', 'Mã phiếu (KOT)', 'text', { required: true }), F('status', 'Trạng thái', 'select', { required: true, options: ['preparing', 'ready', 'completed'] })] },

  // ── Menu & Định lượng ──
  { tool: 'resto.menu.search', group: 'Menu & Định lượng', label: 'Tìm menu', kind: 'read', method: 'GET', path: '/restaurant/menu', fields: [F('query', 'Từ khóa'), F('category', 'Danh mục'), F('include_soldout', 'Gồm món hết', 'bool'), F('limit', 'Giới hạn', 'number')] },
  { tool: 'resto.menu.item_info', group: 'Menu & Định lượng', label: 'Chi tiết món', kind: 'read', method: 'GET', path: '/restaurant/menu/item', fields: [F('name', 'Tên món'), F('sku', 'SKU')] },
  { tool: 'resto.menu.upsert', group: 'Menu & Định lượng', label: 'Thêm / sửa món', kind: 'action', method: 'POST', path: '/restaurant/menu', fields: [F('name', 'Tên món', 'text', { required: true }), F('sku', 'SKU'), F('price', 'Giá', 'text', { required: true }), F('category', 'Danh mục'), F('station', 'Trạm bếp'), F('options', 'Nhóm tùy chọn (JSON)', 'json'), F('combo_items', 'Thành phần combo (JSON)', 'json')] },
  { tool: 'resto.menu.set_availability', group: 'Menu & Định lượng', label: 'Báo hết / mở bán', kind: 'action', method: 'POST', path: '/restaurant/menu/availability', fields: [F('name', 'Tên món', 'text', { required: true }), F('sold_out', 'Hết món', 'bool', { required: true })] },
  { tool: 'resto.recipe.set', group: 'Menu & Định lượng', label: 'Khai định lượng', kind: 'action', method: 'POST', path: '/restaurant/recipes', fields: [F('item', 'Tên món', 'text', { required: true }), F('lines', 'Nguyên liệu (JSON: [{sku,qty,unit}])', 'json', { required: true })] },
  { tool: 'resto.recipe.coverage', group: 'Menu & Định lượng', label: 'Độ phủ định lượng', kind: 'read', method: 'GET', path: '/restaurant/recipes/coverage', fields: [] },

  // ── Bill & Thanh toán ──
  { tool: 'resto.bill.create', group: 'Bill & Thanh toán', label: 'Tạo / tách bill', kind: 'action', method: 'POST', path: '/restaurant/bills', sensitive: true, fields: [F('table', 'Bàn'), F('order_code', 'Mã đơn'), F('item_names', 'Tách theo món (JSON tên)', 'json')] },
  { tool: 'resto.bill.pay', group: 'Bill & Thanh toán', label: 'Thanh toán', kind: 'action', method: 'POST', path: '/restaurant/bills/pay', sensitive: true, fields: [F('table', 'Bàn'), F('bill_code', 'Mã bill'), F('order_code', 'Mã đơn'), F('method', 'Phương thức', 'select', { required: true, options: ['cash', 'bank', 'card', 'momo', 'zalopay', 'vnpay', 'points', 'other'] }), F('amount', 'Số tiền / điểm'), F('customer_phone', 'SĐT khách (tích/đổi điểm)')] },
  { tool: 'resto.bill.void', group: 'Bill & Thanh toán', label: 'Hủy bill', kind: 'action', method: 'POST', path: '/restaurant/bills/void', sensitive: true, fields: [F('bill_code', 'Mã bill', 'text', { required: true }), F('reason', 'Lý do', 'text', { required: true })] },
  { tool: 'resto.bill.view', group: 'Bill & Thanh toán', label: 'Xem bill', kind: 'read', method: 'GET', path: '/restaurant/bills/view', fields: [F('bill_code', 'Mã bill'), F('order_code', 'Mã đơn'), F('table', 'Bàn')] },

  // ── Đặt bàn ──
  { tool: 'resto.reservation.manage', group: 'Đặt bàn', label: 'Quản lý đặt bàn', kind: 'action', method: 'POST', path: '/restaurant/reservations/manage', fields: [F('op', 'Thao tác', 'select', { required: true, options: ['create', 'confirm', 'seat', 'cancel', 'no_show'] }), F('code', 'Mã đặt (RSV)'), F('customer_name', 'Tên khách'), F('phone', 'SĐT'), F('party_size', 'Số khách', 'number'), F('table', 'Bàn'), F('at', 'Thời điểm (ISO +07:00)'), F('duration_min', 'Thời lượng (phút)', 'number'), F('note', 'Ghi chú')] },
  { tool: 'resto.reservation.list', group: 'Đặt bàn', label: 'Danh sách đặt bàn', kind: 'read', method: 'GET', path: '/restaurant/reservations', fields: [F('date', 'Ngày (YYYY-MM-DD)'), F('days', 'Số ngày', 'number'), F('include_done', 'Gồm đã xong', 'bool')] },

  // ── Khuyến mãi ──
  { tool: 'resto.promo.upsert', group: 'Khuyến mãi', label: 'Tạo / sửa khuyến mãi', kind: 'action', method: 'POST', path: '/restaurant/promotions', sensitive: true, fields: [F('code', 'Mã (voucher)'), F('name', 'Tên', 'text', { required: true }), F('kind', 'Loại', 'select', { options: ['voucher', 'happy_hour', 'auto'] }), F('discount_type', 'Kiểu giảm', 'select', { required: true, options: ['percent', 'amount'] }), F('value', 'Giá trị', 'text', { required: true }), F('min_subtotal', 'Đơn tối thiểu'), F('max_discount', 'Trần giảm'), F('usage_limit', 'Giới hạn lượt', 'number'), F('per_customer_limit', 'Lượt/khách', 'number'), F('hh_start_min', 'HH bắt đầu (phút)', 'number'), F('hh_end_min', 'HH kết thúc (phút)', 'number'), F('active', 'Bật', 'bool')] },
  { tool: 'resto.promo.apply', group: 'Khuyến mãi', label: 'Áp / gỡ mã cho đơn', kind: 'action', method: 'POST', path: '/restaurant/promotions/apply', sensitive: true, fields: [F('table', 'Bàn'), F('order_code', 'Mã đơn'), F('code', 'Mã KM'), F('remove', 'Gỡ mã', 'bool')] },
  { tool: 'resto.promo.list', group: 'Khuyến mãi', label: 'Danh sách khuyến mãi', kind: 'read', method: 'GET', path: '/restaurant/promotions', fields: [F('active_only', 'Chỉ đang bật', 'bool')] },

  // ── Khách & Điểm ──
  { tool: 'resto.customer.upsert', group: 'Khách & Điểm', label: 'Thêm / sửa khách', kind: 'action', method: 'POST', path: '/restaurant/customers', fields: [F('phone', 'SĐT', 'text', { required: true }), F('name', 'Tên'), F('tier', 'Hạng'), F('note', 'Ghi chú')] },
  { tool: 'resto.customer.lookup', group: 'Khách & Điểm', label: 'Tra khách (SĐT)', kind: 'read', method: 'GET', path: '/restaurant/customers/lookup', fields: [F('phone', 'SĐT', 'text', { required: true })] },
  { tool: 'resto.customer.list', group: 'Khách & Điểm', label: 'Danh sách khách', kind: 'read', method: 'GET', path: '/restaurant/customers', fields: [F('query', 'Tìm tên/SĐT'), F('limit', 'Giới hạn', 'number')] },
  { tool: 'resto.loyalty.adjust', group: 'Khách & Điểm', label: 'Điều chỉnh điểm', kind: 'action', method: 'POST', path: '/restaurant/loyalty/adjust', sensitive: true, fields: [F('phone', 'SĐT', 'text', { required: true }), F('points', 'Điểm (± )', 'text', { required: true }), F('reason', 'Lý do', 'text', { required: true })] },
  { tool: 'resto.loyalty.history', group: 'Khách & Điểm', label: 'Sổ điểm khách', kind: 'read', method: 'GET', path: '/restaurant/loyalty/history', fields: [F('phone', 'SĐT', 'text', { required: true }), F('limit', 'Giới hạn', 'number')] },

  // ── Báo cáo ──
  { tool: 'resto.report.sales', group: 'Báo cáo', label: 'Doanh thu', kind: 'read', method: 'GET', path: '/restaurant/reports/sales', fields: [F('from', 'Từ ngày'), F('to', 'Đến ngày')] },
  { tool: 'resto.report.top_items', group: 'Báo cáo', label: 'Món bán chạy', kind: 'read', method: 'GET', path: '/restaurant/reports/top-items', fields: [F('from', 'Từ ngày'), F('to', 'Đến ngày'), F('limit', 'Top', 'number')] },

  // ── Cấu hình ──
  { tool: 'resto.settings.view', group: 'Cấu hình', label: 'Xem cấu hình', kind: 'read', method: 'GET', path: '/restaurant/settings', fields: [] },
  { tool: 'resto.settings.update', group: 'Cấu hình', label: 'Đổi cấu hình', kind: 'action', method: 'POST', path: '/restaurant/settings', sensitive: true, fields: [F('service_charge_pct', 'Phí phục vụ %'), F('tax_pct', 'VAT %'), F('price_includes_tax', 'VAT gộp trong giá', 'bool'), F('deduct_on', 'Trừ kho khi', 'select', { options: ['paid', 'served'] }), F('auto_deduct_stock', 'Tự trừ kho', 'bool'), F('table_auto_clean', 'Tự dọn bàn', 'bool'), F('loyalty_enabled', 'Bật tích điểm', 'bool'), F('loyalty_earn_pct', 'Tỷ lệ tích %'), F('loyalty_min_redeem', 'Đổi tối thiểu')] },
];

/** Đếm nhanh để hiển thị + audit. */

interface ApiResult<T = unknown> { ok: boolean; status: number; data?: T; error?: { code?: string; message?: string; issues?: unknown } }
class RestaurantApi {
  constructor(private baseUrl = '/api/v1/soul-restaurant', private token?: string) {}
  private headers(): Record<string, string> { const h: Record<string, string> = { 'Content-Type': 'application/json' }; if (this.token) h.Authorization = `Bearer ${this.token}`; return h; }
  async call<T = unknown>(cap: Pick<UiCapability, 'method' | 'path'>, params: Record<string, unknown>): Promise<ApiResult<T>> {
    const rel = cap.path.replace(/^\/restaurant/, ''); let url = `${this.baseUrl}${rel}`; const init: RequestInit = { method: cap.method, headers: this.headers() };
    if (cap.method === 'GET') { const qs = new URLSearchParams(); for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '' && v !== null) qs.set(k, String(v)); const q = qs.toString(); if (q) url += `?${q}`; } else init.body = JSON.stringify(params);
    try { const res = await fetch(url, init); const body = await res.json().catch(() => ({})); if (!res.ok) return { ok: false, status: res.status, error: (body as any)?.error ?? body }; return { ok: true, status: res.status, data: body as T }; }
    catch (e) { return { ok: false, status: 0, error: { message: e instanceof Error ? e.message : String(e) } }; }
  }
}


function coerce(field: UiField, raw: string): unknown {
  if (raw === '' || raw == null) return undefined;
  if (field.type === 'number') return Number(raw);
  if (field.type === 'bool') return raw === 'true';
  if (field.type === 'json') { try { return JSON.parse(raw); } catch { return raw; } }
  return raw;
}


const KEY_VI: Record<string, string> = {
  ok: 'Kết quả', status: 'Trạng thái', data: 'Dữ liệu', error: 'Lỗi', code: 'Mã', message: 'Thông báo', issues: 'Chi tiết lỗi',
  revenue: 'Doanh thu', revenue_fmt: 'Doanh thu', today: 'Hôm nay', open_orders: 'Đơn đang mở', pending_kots: 'Phiếu bếp chờ', oldest_minutes: 'Chờ lâu nhất (phút)', by_station: 'Theo trạm bếp', kitchen: 'Bếp', total: 'Tổng', count: 'Số lượng', qty: 'Số lượng', quantity: 'Số lượng', price: 'Giá', unit_price: 'Đơn giá', subtotal: 'Tạm tính', discount: 'Giảm giá', tax: 'Thuế', grand_total: 'Tổng thanh toán', amount: 'Số tiền', paid: 'Đã thanh toán', remaining: 'Còn lại',
  tables: 'Bàn', table: 'Bàn', table_name: 'Tên bàn', area: 'Khu vực', capacity: 'Số chỗ', shape: 'Hình bàn', active: 'Đang dùng', clean: 'Đã dọn', occupied: 'Có khách', available: 'Còn trống',
  order: 'Đơn', orders: 'Đơn hàng', order_code: 'Mã đơn', type: 'Loại đơn', guests: 'Số khách', customer_name: 'Tên khách', customer_phone: 'SĐT khách', note: 'Ghi chú', items: 'Món', item: 'Món', item_name: 'Tên món', course: 'Lượt ra món', options: 'Tùy chọn', reason: 'Lý do',
  kot: 'Phiếu bếp', kots: 'Phiếu bếp', kot_code: 'Mã phiếu bếp', station: 'Trạm bếp', queue: 'Hàng đợi', started_at: 'Bắt đầu lúc', ready_at: 'Sẵn sàng lúc',
  menu: 'Menu', name: 'Tên', sku: 'Mã món', category: 'Danh mục', sold_out: 'Hết món', include_soldout: 'Gồm món hết', combo_items: 'Thành phần combo', lines: 'Dòng', coverage: 'Độ phủ', missing: 'Còn thiếu',
  bill: 'Bill', bills: 'Bill', bill_code: 'Mã bill', method: 'Phương thức', payment: 'Thanh toán', payments: 'Thanh toán',
  reservation: 'Đặt bàn', reservations: 'Danh sách đặt bàn', date: 'Ngày', days: 'Số ngày', party_size: 'Số khách', at: 'Thời điểm', duration_min: 'Thời lượng (phút)', include_done: 'Gồm đã xong', op: 'Thao tác',
  promo: 'Khuyến mãi', promotions: 'Khuyến mãi', discount_type: 'Kiểu giảm', value: 'Giá trị', min_subtotal: 'Đơn tối thiểu', max_discount: 'Trần giảm', usage_limit: 'Giới hạn lượt', per_customer_limit: 'Lượt/khách', active_only: 'Chỉ đang bật', remove: 'Gỡ mã', kind: 'Loại',
  customer: 'Khách', customers: 'Khách hàng', phone: 'SĐT', tier: 'Hạng', points: 'Điểm', balance: 'Số dư điểm', history: 'Lịch sử',
  from: 'Từ ngày', to: 'Đến ngày', limit: 'Giới hạn', top_items: 'Món bán chạy', settings: 'Cấu hình', service_charge_pct: 'Phí phục vụ %', tax_pct: 'VAT %', price_includes_tax: 'VAT gộp trong giá', deduct_on: 'Trừ kho khi', auto_deduct_stock: 'Tự trừ kho', table_auto_clean: 'Tự dọn bàn', loyalty_enabled: 'Bật tích điểm', loyalty_earn_pct: 'Tỷ lệ tích điểm %', loyalty_min_redeem: 'Đổi điểm tối thiểu',
  created_at: 'Tạo lúc', updated_at: 'Cập nhật lúc', createdAt: 'Tạo lúc', updatedAt: 'Cập nhật lúc', result: 'Kết quả', dry_run: 'Chạy thử', preview: 'Xem trước', input: 'Thông tin nhập', success: 'Thành công',
};
const VALUE_VI: Record<string, string> = {
  open: 'Đang mở', closed: 'Đã đóng', cancelled: 'Đã hủy', paid: 'Đã thanh toán', void: 'Đã hủy', draft: 'Nháp', pending: 'Đang chờ', completed: 'Hoàn tất', ready: 'Sẵn sàng', preparing: 'Đang làm', queued: 'Đang chờ', served: 'Đã lên món',
  dine_in: 'Ăn tại bàn', takeaway: 'Mang đi', delivery: 'Giao hàng', cash: 'Tiền mặt', bank: 'Chuyển khoản', card: 'Thẻ', momo: 'MoMo', zalopay: 'ZaloPay', vnpay: 'VNPay', points: 'Điểm', other: 'Khác',
  square: 'Vuông', round: 'Tròn', rect: 'Chữ nhật', bar: 'Quầy bar', percent: 'Theo %', amount: 'Theo số tiền', voucher: 'Voucher', happy_hour: 'Giờ vàng', auto: 'Tự động', create: 'Tạo mới', confirm: 'Xác nhận', seat: 'Xếp bàn', cancel: 'Hủy', no_show: 'Khách không đến',
};
const HIDE_KEYS = new Set(['id','uuid','orgId','org_id','userId','user_id','customerId','customer_id','orderId','order_id','billId','bill_id','tableId','table_id','kotId','kot_id','promoId','promo_id','recipeId','recipe_id','reservationId','reservation_id','_id']);
const EMPTY_BY_KEY: Record<string, string> = { open_orders: 'Chưa có đơn nào đang mở', orders: 'Chưa có đơn hàng nào', tables: 'Chưa có bàn nào', items: 'Chưa có món nào', kots: 'Chưa có phiếu bếp nào', by_station: 'Chưa có dữ liệu theo trạm', bills: 'Chưa có bill nào', reservations: 'Chưa có lịch đặt bàn nào', promotions: 'Chưa có khuyến mãi nào', customers: 'Chưa có khách hàng nào' };
const moneyLike = (k: string) => /(revenue|price|amount|total|subtotal|tax|discount|paid|remaining|value|min|max|charge)/i.test(k) && !/(pct|percent|qty|count|limit|code|phone)/i.test(k);
const viKey = (k: string) => KEY_VI[k] ?? k.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function fmtValue(k: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Có' : 'Không';
  if (typeof v === 'number') return moneyLike(k) ? `${v.toLocaleString('vi-VN')}đ` : v.toLocaleString('vi-VN');
  if (typeof v === 'string') {
    if (isUuid(v)) return '—';
    if (/^-?\d+(\.\d+)?$/.test(v) && moneyLike(k)) return `${Number(v).toLocaleString('vi-VN')}đ`;
    return VALUE_VI[v] ?? v;
  }
  return String(v);
}
function cleanEntries(obj: Record<string, unknown>) { return Object.entries(obj).filter(([k,v]) => !(HIDE_KEYS.has(k) || (typeof v === 'string' && isUuid(v)))); }
function friendlyPayload(result: unknown): unknown {
  if (!result || typeof result !== 'object') return result;
  const r = result as ApiResult;
  if (r.ok && r.data !== undefined) return r.data;
  if (!r.ok) return { status: r.status, ...(r.error ?? { message: 'Không chạy được thao tác này' }) };
  return result;
}
function EmptyHint({ nameKey }: { nameKey?: string }) { return <div style={{ padding: 12, borderRadius: 10, background: 'rgba(15,23,42,.04)', color: '#64748b', fontSize: 13 }}>{(nameKey && EMPTY_BY_KEY[nameKey]) || 'Chưa có dữ liệu để hiển thị'}</div>; }
function DataTable({ rows }: { rows: Record<string, unknown>[] }) {
  const keys = Array.from(new Set(rows.flatMap((r) => cleanEntries(r).map(([k]) => k)))).slice(0, 8);
  if (!rows.length || !keys.length) return <EmptyHint />;
  return <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}><thead><tr>{keys.map(k => <th key={k} style={{ textAlign: 'left', padding: '7px 8px', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>{viKey(k)}</th>)}</tr></thead><tbody>{rows.map((r,i) => <tr key={i}>{keys.map(k => <td key={k} style={{ padding: '7px 8px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }}>{typeof r[k] === 'object' && r[k] !== null ? <SmartData data={r[k]} nameKey={k} /> : fmtValue(k, r[k])}</td>)}</tr>)}</tbody></table></div>;
}
function SmartData({ data, nameKey }: { data: unknown; nameKey?: string }) {
  if (data === null || data === undefined || data === '') return <span>—</span>;
  if (Array.isArray(data)) {
    if (!data.length) return <EmptyHint nameKey={nameKey} />;
    if (data.every((x) => x && typeof x === 'object' && !Array.isArray(x))) return <DataTable rows={data as Record<string, unknown>[]} />;
    return <div>{data.map((x,i) => <div key={i} style={{ padding: '3px 0' }}><SmartData data={x} nameKey={nameKey} /></div>)}</div>;
  }
  if (typeof data !== 'object') return <span>{fmtValue(nameKey ?? '', data)}</span>;
  const entries = cleanEntries(data as Record<string, unknown>);
  if (!entries.length) return <EmptyHint nameKey={nameKey} />;
  return <div style={{ display: 'grid', gap: 6 }}>{entries.map(([k,v]) => <div key={k} style={{ borderBottom: '1px solid rgba(148,163,184,.18)', paddingBottom: 5 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}><span style={{ color: '#64748b', fontSize: 13 }}>{viKey(k)}</span>{(v === null || typeof v !== 'object') && <b style={{ textAlign: 'right', fontSize: 13.5 }}>{fmtValue(k,v)}</b>}</div>{v !== null && typeof v === 'object' && <div style={{ marginTop: 6, paddingLeft: 8, borderLeft: '2px solid rgba(14,165,233,.18)' }}><SmartData data={v} nameKey={k} /></div>}</div>)}</div>;
}
function ResultView({ result }: { result: unknown }) {
  const [json, setJson] = useState(false);
  const payload = friendlyPayload(result);
  return <div style={{ marginTop: 10, border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, background: '#fff' }}><SmartData data={payload} /><button type="button" onClick={() => setJson(!json)} style={{ marginTop: 10, fontSize: 12, padding: '4px 8px', borderRadius: 999, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#334155' }}>{json ? 'Ẩn JSON' : 'Xem JSON'}</button>{json && <pre style={{ marginTop: 8, maxHeight: 240, overflow: 'auto', background: '#0b1021', color: '#d7e0ff', padding: 10, borderRadius: 8, fontSize: 12 }}>{JSON.stringify(result, null, 2)}</pre>}</div>;
}
const optionLabel = (o: string) => VALUE_VI[o] ?? o;
function CapabilityCard({ cap, api }: { cap: UiCapability; api: RestaurantApi }) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  async function run() {
    if (cap.sensitive && !window.confirm(`Bạn chắc chắn muốn ${cap.label.toLowerCase()}? Thao tác này có thể ảnh hưởng đơn/bill/dữ liệu quán.`)) return;
    setBusy(true); setResult(null);
    const params: Record<string, unknown> = {};
    for (const f of cap.fields) { const v = coerce(f, form[f.name] ?? ''); if (v !== undefined) params[f.name] = v; }
    if (cap.sensitive) params.confirm = true;
    const res = await api.call(cap, params); setResult(res); setBusy(false);
  }
  return <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 14, background: '#fff', boxShadow: '0 12px 30px rgba(15,23,42,.08)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}><strong style={{ color: '#0f172a' }}>{cap.label}</strong><span style={{ fontSize: 11, color: cap.kind === 'action' ? '#b45309' : '#0369a1', fontWeight: 700 }}>{cap.kind === 'action' ? 'Thao tác' : 'Tra cứu'}{cap.sensitive ? ' · Cần xác nhận' : ''}</span></div>
    {cap.fields.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, margin: '12px 0' }}>{cap.fields.map((f) => <label key={f.name} style={{ fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 4, color: '#475569', fontWeight: 600 }}><span>{f.label}{f.required ? ' *' : ''}</span>{f.type === 'select' ? <select value={form[f.name] ?? ''} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '8px 9px', background: '#f8fafc', color: '#0f172a' }}><option value="">— chọn —</option>{(f.options ?? []).map((o) => <option key={o} value={o}>{optionLabel(o)}</option>)}</select> : f.type === 'bool' ? <select value={form[f.name] ?? ''} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '8px 9px', background: '#f8fafc', color: '#0f172a' }}><option value="">— chọn —</option><option value="true">Có</option><option value="false">Không</option></select> : f.type === 'json' || f.type === 'textarea' ? <textarea rows={2} placeholder={f.placeholder ?? 'Nhập danh sách theo mẫu'} value={form[f.name] ?? ''} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '8px 9px', background: '#f8fafc', color: '#0f172a' }} /> : <input type={f.type === 'number' ? 'number' : 'text'} placeholder={f.placeholder} value={form[f.name] ?? ''} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '8px 9px', background: '#f8fafc', color: '#0f172a' }} />}</label>)}</div>}
    <button className="btn-primary" disabled={busy} onClick={run} style={{ border: 0, borderRadius: 999, padding: '8px 14px', background: cap.sensitive ? '#b45309' : '#0f766e', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>{busy ? 'Đang chạy…' : cap.sensitive ? `Xác nhận ${cap.label}` : 'Chạy thử'}</button>
    {result != null && <ResultView result={result} />}
  </div>;
}
function RestaurantConsole({ baseUrl, token }: { baseUrl?: string; token?: string }) {
  const api = useMemo(() => new RestaurantApi(baseUrl, token), [baseUrl, token]);
  const [group, setGroup] = useState<string>(UI_GROUPS[0]);
  const [dash, setDash] = useState<unknown>(null);

  useEffect(() => {
    api.call({ method: 'GET', path: '/restaurant/dashboard' }, {}).then((r) => setDash(r.data ?? r.error));
  }, [api]);

  const caps = restoUiCatalog.filter((c) => c.group === group);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, fontFamily: 'system-ui, sans-serif' }}>
      <aside style={{ borderRight: '1px solid #e5e7eb', paddingRight: 12 }}>
        <h3>Nhà hàng</h3>
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>{restoUiCatalog.length} năng lực · sống 100%</div>
        {UI_GROUPS.map((g) => (
          <button key={g} onClick={() => setGroup(g)}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', marginBottom: 4,
              borderRadius: 8, border: 'none', cursor: 'pointer',
              background: g === group ? '#111827' : '#f3f4f6', color: g === group ? '#fff' : '#111827' }}>
            {g}
          </button>
        ))}
      </aside>
      <main>
        {group === 'Bảng điều khiển' && dash != null && (
          <div style={{ marginBottom: 12 }}>
            <ResultView result={{ ok: true, status: 200, data: dash }} />
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {caps.map((c) => <CapabilityCard key={c.tool} cap={c} api={api} />)}
        </div>
      </main>
    </div>
  );
}


const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
function sessionJwt(): string { if (typeof window === 'undefined') return ''; try { return JSON.parse(localStorage.getItem('citadel.session') ?? '{}')?.jwt ?? ''; } catch { return ''; } }
export default function Page() { return <RestaurantConsole baseUrl={`${API}/api/v1/soul-restaurant`} token={sessionJwt()} />; }

