/**
 * SOUL-RESTAURANT — Intent definitions cho Tiểu Tâm
 * Patterns Việt/Anh → tool. Một phần "giáo trình" (mặt cắt ⑧):
 * Tiểu Tâm đọc bản khai này để phân giải ý định người dùng ngoài quán —
 * nhân viên nói tiếng người, hệ thống hiểu thành tool_input.
 */
export interface IntentDefinition {
  id: string;
  tool: string;
  patterns_vi: string[];
  patterns_en: string[];
  slots: string[];
  examples: Array<{ utterance: string; tool_input: Record<string, unknown> }>;
}

export const restoIntents: IntentDefinition[] = [
  {
    id: 'resto.intent.table_open',
    tool: 'resto.table.open',
    patterns_vi: ['mở bàn', 'khách vào bàn', 'nhận khách bàn', 'tạo đơn mang về', 'đơn giao đi', 'khách mới'],
    patterns_en: ['open table', 'seat guests', 'new takeaway order'],
    slots: ['table', 'type', 'guests', 'customer_name'],
    examples: [
      { utterance: 'Mở bàn 5, 4 khách', tool_input: { table: '5', guests: 4 } },
      { utterance: 'Tạo đơn mang về cho chị Hoa', tool_input: { type: 'takeaway', customer_name: 'Chị Hoa' } },
    ],
  },
  {
    id: 'resto.intent.add_items',
    tool: 'resto.order.add_items',
    patterns_vi: ['gọi món', 'order món', 'thêm món', 'bàn ... lấy', 'cho bàn ... thêm', 'khách gọi'],
    patterns_en: ['order items', 'add dishes', 'table wants'],
    slots: ['table', 'items'],
    examples: [
      {
        utterance: 'Bàn 5 gọi 2 phở bò thêm trứng với 1 trà đá',
        tool_input: { table: '5', items: [{ name: 'Phở bò', qty: '2', options: ['Thêm trứng'] }, { name: 'Trà đá', qty: '1' }] },
      },
    ],
  },
  {
    id: 'resto.intent.send_kitchen',
    tool: 'resto.order.send_kitchen',
    patterns_vi: ['gửi bếp', 'báo bếp', 'chuyển bếp', 'cho bếp làm', 'in phiếu bếp'],
    patterns_en: ['send to kitchen', 'fire order', 'print kot'],
    slots: ['table', 'order_code'],
    examples: [{ utterance: 'Gửi bếp bàn 5', tool_input: { table: '5' } }],
  },
  {
    id: 'resto.intent.table_map',
    tool: 'resto.table.map',
    patterns_vi: ['sơ đồ bàn', 'bàn nào trống', 'tình hình bàn', 'còn bàn không', 'xem sàn'],
    patterns_en: ['floor map', 'which tables are free', 'table status'],
    slots: ['area'],
    examples: [
      { utterance: 'Bàn nào đang trống?', tool_input: {} },
      { utterance: 'Khu sân vườn còn bàn không?', tool_input: { area: 'Sân vườn' } },
    ],
  },
  {
    id: 'resto.intent.order_view',
    tool: 'resto.order.view',
    patterns_vi: ['bàn ... gọi gì', 'xem đơn bàn', 'đơn này bao nhiêu tiền', 'tạm tính bàn', 'kiểm tra đơn'],
    patterns_en: ['what did table order', 'view order', 'check bill so far'],
    slots: ['table', 'order_code'],
    examples: [{ utterance: 'Bàn 5 gọi gì rồi, bao nhiêu tiền?', tool_input: { table: '5' } }],
  },
  {
    id: 'resto.intent.menu_search',
    tool: 'resto.menu.search',
    patterns_vi: ['xem menu', 'menu có gì', 'giá món', 'tìm món', 'quán có bán'],
    patterns_en: ['show menu', 'menu price', 'find dish'],
    slots: ['query', 'category'],
    examples: [{ utterance: 'Menu có món gì với giá phở?', tool_input: { query: 'phở' } }],
  },
  {
    id: 'resto.intent.sold_out',
    tool: 'resto.menu.set_availability',
    patterns_vi: ['hết món', 'báo hết', 'món ... hết rồi', 'có lại rồi', 'mở bán lại'],
    patterns_en: ['sold out', 'out of stock dish', 'back in stock'],
    slots: ['name', 'sold_out'],
    examples: [
      { utterance: 'Hết phở bò rồi', tool_input: { name: 'Phở bò', sold_out: true } },
      { utterance: 'Phở bò có lại rồi nha', tool_input: { name: 'Phở bò', sold_out: false } },
    ],
  },
  {
    id: 'resto.intent.kds_queue',
    tool: 'resto.kds.queue',
    patterns_vi: ['bếp đang nấu gì', 'phiếu bếp', 'món nào đang chờ', 'màn hình bếp', 'phiếu nào lâu nhất'],
    patterns_en: ['kitchen queue', 'pending tickets', 'kds'],
    slots: ['station', 'status'],
    examples: [{ utterance: 'Bếp nóng đang có phiếu nào?', tool_input: { station: 'Bếp nóng' } }],
  },
  {
    id: 'resto.intent.kds_update',
    tool: 'resto.kds.update',
    patterns_vi: ['phiếu ... đang nấu', 'phiếu ... xong rồi', 'bếp xong phiếu', 'bắt đầu làm phiếu'],
    patterns_en: ['ticket preparing', 'ticket ready', 'ticket done'],
    slots: ['kot_code', 'status'],
    examples: [{ utterance: 'Phiếu KOT-260706-ABCD xong rồi', tool_input: { kot_code: 'KOT-260706-ABCD', status: 'ready' } }],
  },
  {
    id: 'resto.intent.serve',
    tool: 'resto.order.serve',
    patterns_vi: ['lên món', 'đã đưa món', 'phục vụ món', 'mang món ra', 'ra món bàn'],
    patterns_en: ['serve items', 'food delivered to table'],
    slots: ['table', 'items'],
    examples: [{ utterance: 'Lên món bàn 5', tool_input: { table: '5' } }],
  },
  {
    id: 'resto.intent.cancel_item',
    tool: 'resto.order.cancel_item',
    patterns_vi: ['hủy món', 'bỏ món', 'khách đổi ý món', 'không lấy món ... nữa'],
    patterns_en: ['cancel item', 'remove dish'],
    slots: ['table', 'item', 'reason'],
    examples: [{ utterance: 'Hủy trà đá bàn 5, khách đổi ý', tool_input: { table: '5', item: 'Trà đá', reason: 'Khách đổi ý' } }],
  },
  {
    id: 'resto.intent.move_table',
    tool: 'resto.order.move_table',
    patterns_vi: ['chuyển bàn', 'đổi bàn', 'dời khách sang bàn'],
    patterns_en: ['move table', 'change table'],
    slots: ['table', 'to_table'],
    examples: [{ utterance: 'Chuyển bàn 5 sang bàn 8', tool_input: { table: '5', to_table: '8' } }],
  },
  {
    id: 'resto.intent.merge_tables',
    tool: 'resto.order.merge',
    patterns_vi: ['gộp bàn', 'dồn bàn', 'nhập bàn ... vào bàn', 'tính chung hai bàn'],
    patterns_en: ['merge tables', 'combine tables'],
    slots: ['from_table', 'to_table'],
    examples: [{ utterance: 'Gộp bàn 3 vào bàn 5 tính chung', tool_input: { from_table: '3', to_table: '5' } }],
  },
  {
    id: 'resto.intent.discount',
    tool: 'resto.order.discount',
    patterns_vi: ['giảm giá', 'bớt cho khách', 'giảm ... phần trăm', 'trừ ... nghìn'],
    patterns_en: ['apply discount', 'take off percent'],
    slots: ['table', 'discount_type', 'value', 'reason'],
    examples: [
      { utterance: 'Giảm 10% bàn 5, khách quen', tool_input: { table: '5', discount_type: 'percent', value: '10', reason: 'Khách quen' } },
      { utterance: 'Bớt 50 nghìn đơn bàn 2', tool_input: { table: '2', discount_type: 'amount', value: '50000' } },
    ],
  },
  {
    id: 'resto.intent.bill_create',
    tool: 'resto.bill.create',
    patterns_vi: ['in bill', 'xin bill', 'chốt tạm tính', 'tách bill', 'chia bill'],
    patterns_en: ['print bill', 'split bill', 'check please'],
    slots: ['table', 'item_names'],
    examples: [
      { utterance: 'In bill bàn 5', tool_input: { table: '5' } },
      { utterance: 'Tách bill bàn 5: 2 phở bò tính riêng', tool_input: { table: '5', item_names: ['Phở bò', 'Phở bò'] } },
    ],
  },
  {
    id: 'resto.intent.pay',
    tool: 'resto.bill.pay',
    patterns_vi: ['thanh toán', 'tính tiền', 'thu tiền', 'khách trả tiền', 'quẹt thẻ', 'chuyển khoản bàn'],
    patterns_en: ['pay bill', 'checkout table', 'settle'],
    slots: ['table', 'bill_code', 'method', 'amount'],
    examples: [
      { utterance: 'Bàn 5 thanh toán tiền mặt 500 nghìn', tool_input: { table: '5', method: 'cash', amount: '500000' } },
      { utterance: 'Tính tiền bàn 3 chuyển khoản', tool_input: { table: '3', method: 'bank' } },
    ],
  },
  {
    id: 'resto.intent.reservation_manage',
    tool: 'resto.reservation.manage',
    patterns_vi: ['đặt bàn', 'giữ bàn', 'khách đặt ... tới rồi', 'hủy đặt bàn', 'khách không đến'],
    patterns_en: ['book table', 'reservation arrived', 'cancel reservation'],
    slots: ['op', 'customer_name', 'party_size', 'at', 'table', 'code'],
    examples: [
      {
        utterance: 'Đặt bàn 6 người 7h tối nay tên anh Long, bàn 8',
        tool_input: { op: 'create', customer_name: 'Anh Long', party_size: 6, at: '2026-07-06T19:00:00+07:00', table: '8' },
      },
      { utterance: 'Khách đặt RSV-260706-XYZW tới rồi', tool_input: { op: 'seat', code: 'RSV-260706-XYZW' } },
    ],
  },
  {
    id: 'resto.intent.reservation_list',
    tool: 'resto.reservation.list',
    patterns_vi: ['hôm nay có đặt bàn nào', 'lịch đặt bàn', 'danh sách đặt chỗ', 'tối nay ai đặt'],
    patterns_en: ['reservations today', 'booking list'],
    slots: ['date', 'days'],
    examples: [{ utterance: 'Hôm nay có ai đặt bàn không?', tool_input: { days: 1 } }],
  },
  {
    id: 'resto.intent.sales_report',
    tool: 'resto.report.sales',
    patterns_vi: ['doanh thu hôm nay', 'bán được bao nhiêu', 'tổng kết ca', 'doanh số tuần'],
    patterns_en: ['sales today', 'revenue report'],
    slots: ['from', 'to'],
    examples: [{ utterance: 'Hôm nay bán được bao nhiêu?', tool_input: {} }],
  },
  {
    id: 'resto.intent.top_items',
    tool: 'resto.report.top_items',
    patterns_vi: ['món bán chạy', 'món nào bán nhiều nhất', 'top món', 'best seller'],
    patterns_en: ['best sellers', 'top dishes'],
    slots: ['from', 'to', 'limit'],
    examples: [{ utterance: 'Tuần này món nào bán chạy nhất?', tool_input: { from: '2026-06-29', to: '2026-07-05' } }],
  },
  // ── v1.1 · Khuyến mãi & Khách hàng thân thiết ──
  {
    id: 'resto.intent.promo_upsert',
    tool: 'resto.promo.upsert',
    patterns_vi: ['tạo khuyến mãi', 'tạo voucher', 'thêm mã giảm giá', 'happy hour', 'chương trình giảm giá'],
    patterns_en: ['create promotion', 'add voucher', 'discount code'],
    slots: ['code', 'name', 'discount_type', 'value', 'min_subtotal'],
    examples: [{
      utterance: 'Tạo voucher GIAM10 giảm 10% cho đơn từ 100 nghìn',
      tool_input: { code: 'GIAM10', name: 'Giảm 10%', discount_type: 'percent', value: '10', min_subtotal: '100000' },
    }],
  },
  {
    id: 'resto.intent.promo_apply',
    tool: 'resto.promo.apply',
    patterns_vi: ['áp mã', 'dùng voucher', 'nhập mã giảm giá', 'gỡ khuyến mãi', 'bỏ mã'],
    patterns_en: ['apply code', 'use voucher', 'remove promo'],
    slots: ['table', 'code', 'remove'],
    examples: [
      { utterance: 'Áp mã GIAM10 cho bàn 5', tool_input: { table: '5', code: 'GIAM10' } },
      { utterance: 'Gỡ khuyến mãi bàn 5', tool_input: { table: '5', remove: true } },
    ],
  },
  {
    id: 'resto.intent.promo_list',
    tool: 'resto.promo.list',
    patterns_vi: ['có mã giảm giá nào', 'khuyến mãi đang chạy', 'danh sách voucher', 'còn mã nào'],
    patterns_en: ['what promotions', 'active vouchers'],
    slots: ['active_only'],
    examples: [{ utterance: 'Đang có khuyến mãi nào?', tool_input: { active_only: true } }],
  },
  {
    id: 'resto.intent.customer_upsert',
    tool: 'resto.customer.upsert',
    patterns_vi: ['thêm khách', 'tạo khách quen', 'lưu số điện thoại khách', 'đăng ký thành viên'],
    patterns_en: ['add customer', 'register member'],
    slots: ['phone', 'name'],
    examples: [{ utterance: 'Thêm khách Long số 0909123456', tool_input: { phone: '0909123456', name: 'Long' } }],
  },
  {
    id: 'resto.intent.customer_lookup',
    tool: 'resto.customer.lookup',
    patterns_vi: ['khách còn bao nhiêu điểm', 'tra khách', 'khách này ghé mấy lần', 'kiểm tra thành viên'],
    patterns_en: ['customer points', 'look up customer'],
    slots: ['phone'],
    examples: [{ utterance: 'Khách 0909123456 còn bao nhiêu điểm?', tool_input: { phone: '0909123456' } }],
  },
  {
    id: 'resto.intent.set_customer',
    tool: 'resto.order.set_customer',
    patterns_vi: ['gắn khách vào bàn', 'bàn này của khách', 'liên kết khách với đơn', 'khách quen bàn'],
    patterns_en: ['link customer to order', 'attach member'],
    slots: ['table', 'phone', 'name'],
    examples: [{ utterance: 'Gắn khách 0909123456 vào bàn 5', tool_input: { table: '5', phone: '0909123456' } }],
  },
  {
    id: 'resto.intent.loyalty_history',
    tool: 'resto.loyalty.history',
    patterns_vi: ['lịch sử điểm', 'sổ điểm khách', 'khách tích đổi điểm thế nào'],
    patterns_en: ['points history', 'loyalty ledger'],
    slots: ['phone'],
    examples: [{ utterance: 'Lịch sử điểm khách 0909123456', tool_input: { phone: '0909123456' } }],
  },
  {
    id: 'resto.intent.loyalty_adjust',
    tool: 'resto.loyalty.adjust',
    patterns_vi: ['cộng điểm cho khách', 'trừ điểm', 'tặng điểm', 'điều chỉnh điểm'],
    patterns_en: ['add points', 'deduct points', 'comp points'],
    slots: ['phone', 'points', 'reason'],
    examples: [{
      utterance: 'Cộng 50 nghìn điểm cho khách 0909123456 vì khiếu nại',
      tool_input: { phone: '0909123456', points: '50000', reason: 'Bù khiếu nại' },
    }],
  },
  // ── v1.2 · Bảng điều khiển + bếp theo lượt ──
  {
    id: 'resto.intent.console_dashboard',
    tool: 'resto.console.dashboard',
    patterns_vi: ['tình hình quán', 'tổng quan hôm nay', 'quán đang thế nào', 'bảng điều khiển'],
    patterns_en: ['dashboard', 'how is the restaurant doing', 'overview today'],
    slots: [],
    examples: [{ utterance: 'Tình hình quán giờ thế nào?', tool_input: {} }],
  },
  {
    id: 'resto.intent.fire_course',
    tool: 'resto.order.fire_course',
    patterns_vi: ['ra món course', 'lên món lượt', 'gửi bếp món chính', 'fire course', 'ra khai vị'],
    patterns_en: ['fire course', 'send next course'],
    slots: ['table', 'course'],
    examples: [{ utterance: 'Ra món course 2 bàn 5', tool_input: { table: '5', course: 2 } }],
  },
];
