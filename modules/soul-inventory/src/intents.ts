/**
 * MODULE KHO — Intent definitions cho Tiểu Tâm
 * Patterns Việt/Anh → tool. Đây là một phần "giáo trình" (mặt cắt ⑧):
 * Tiểu Tâm đọc bản khai này để phân giải ý định người dùng.
 * slots: các trường cần trích xuất từ câu nói để điền vào inputSchema.
 */
export interface IntentDefinition {
  id: string;
  tool: string;
  patterns_vi: string[];
  patterns_en: string[];
  slots: string[];
  examples: Array<{ utterance: string; tool_input: Record<string, unknown> }>;
}

export const khoIntents: IntentDefinition[] = [
  {
    id: 'kho.intent.item_create',
    tool: 'kho.item.upsert',
    patterns_vi: ['thêm mặt hàng', 'tạo vật tư', 'thêm sản phẩm vào kho', 'khai báo hàng hóa'],
    patterns_en: ['add item', 'create product', 'new sku'],
    slots: ['sku', 'name', 'unit', 'min_stock'],
    examples: [{
      utterance: 'Thêm mặt hàng gạo ST25 mã GAO-ST25, đơn vị kg, tồn tối thiểu 50',
      tool_input: { sku: 'GAO-ST25', name: 'Gạo ST25', unit: 'kg', min_stock: '50' },
    }],
  },
  {
    id: 'kho.intent.receive',
    tool: 'kho.stock.receive',
    patterns_vi: ['nhập kho', 'hàng về', 'nhận hàng', 'nhập thêm', 'cho vào kho'],
    patterns_en: ['receive stock', 'stock in', 'goods received'],
    slots: ['sku', 'quantity', 'location_code', 'unit_cost', 'note'],
    examples: [{
      utterance: 'Nhập kho 200kg gạo ST25, giá 28000 một ký',
      tool_input: { sku: 'GAO-ST25', quantity: '200', unit_cost: '28000' },
    }],
  },
  {
    id: 'kho.intent.issue',
    tool: 'kho.stock.issue',
    patterns_vi: ['xuất kho', 'giao hàng', 'lấy hàng ra', 'xuất bán', 'trừ kho'],
    patterns_en: ['issue stock', 'stock out', 'ship goods'],
    slots: ['sku', 'quantity', 'location_code', 'note'],
    examples: [{
      utterance: 'Xuất 30kg gạo ST25 giao cho khách Minh',
      tool_input: { sku: 'GAO-ST25', quantity: '30', note: 'Giao khách Minh' },
    }],
  },
  {
    id: 'kho.intent.transfer',
    tool: 'kho.stock.transfer',
    patterns_vi: ['chuyển kho', 'chuyển hàng sang kho', 'điều chuyển'],
    patterns_en: ['transfer stock', 'move inventory'],
    slots: ['sku', 'quantity', 'from_location_code', 'to_location_code'],
    examples: [{
      utterance: 'Chuyển 50kg gạo ST25 từ kho chính sang kho Quận 7',
      tool_input: { sku: 'GAO-ST25', quantity: '50', from_location_code: 'KHO-CHINH', to_location_code: 'KHO-Q7' },
    }],
  },
  {
    id: 'kho.intent.query',
    tool: 'kho.stock.query',
    patterns_vi: ['còn bao nhiêu', 'tồn kho', 'kiểm tra tồn', 'trong kho có gì', 'xem tồn'],
    patterns_en: ['stock level', 'how many left', 'check inventory'],
    slots: ['sku', 'keyword', 'location_code'],
    examples: [{
      utterance: 'Gạo ST25 còn bao nhiêu?',
      tool_input: { sku: 'GAO-ST25' },
    }],
  },
  {
    id: 'kho.intent.low_alerts',
    tool: 'kho.stock.low_alerts',
    patterns_vi: ['hàng nào sắp hết', 'cảnh báo tồn', 'cần nhập gì', 'dưới định mức'],
    patterns_en: ['low stock', 'reorder alert', 'running out'],
    slots: ['location_code'],
    examples: [{
      utterance: 'Có mặt hàng nào sắp hết không?',
      tool_input: {},
    }],
  },
  {
    id: 'kho.intent.reserve',
    tool: 'kho.reservation.manage',
    patterns_vi: ['giữ hàng', 'đặt trước', 'để dành cho khách', 'hủy giữ hàng', 'chốt đơn đã giữ'],
    patterns_en: ['reserve stock', 'hold items', 'release reservation'],
    slots: ['action', 'sku', 'quantity', 'reservation_id'],
    examples: [{
      utterance: 'Giữ 20kg gạo ST25 cho đơn của chị Lan',
      tool_input: { action: 'create', sku: 'GAO-ST25', quantity: '20', note: 'Đơn chị Lan' },
    }],
  },
  {
    id: 'kho.intent.stocktake',
    tool: 'kho.stocktake.execute',
    patterns_vi: ['kiểm kê', 'đếm kho', 'chốt số thực tế', 'đối chiếu tồn'],
    patterns_en: ['stocktake', 'inventory count', 'cycle count'],
    slots: ['location_code', 'counts', 'finalize'],
    examples: [{
      utterance: 'Kiểm kê kho chính: gạo ST25 đếm được 148kg',
      tool_input: { counts: [{ sku: 'GAO-ST25', counted: '148' }], finalize: true },
    }],
  },
];

// ── Intents mới Soul-Inventory v1.1 ──
khoIntents.push(
  {
    id: 'kho.intent.expiry_alerts',
    tool: 'kho.lot.expiry_alerts',
    patterns_vi: ['lô nào sắp hết hạn', 'hàng cận date', 'hạn sử dụng', 'sắp hết hạn'],
    patterns_en: ['expiring lots', 'near expiry', 'expiry alert'],
    slots: ['within_days'],
    examples: [{
      utterance: 'Có lô hàng nào sắp hết hạn trong 2 tuần tới không?',
      tool_input: { within_days: 14 },
    }],
  },
  {
    id: 'kho.intent.stock_card',
    tool: 'kho.report.stock_card',
    patterns_vi: ['thẻ kho', 'lịch sử mặt hàng', 'truy nguyên', 'lịch sử nhập xuất'],
    patterns_en: ['stock card', 'item history', 'movement history'],
    slots: ['sku'],
    examples: [{
      utterance: 'Cho xem thẻ kho của gạo ST25',
      tool_input: { sku: 'GAO-ST25' },
    }],
  },
  {
    id: 'kho.intent.summary',
    tool: 'kho.report.summary',
    patterns_vi: ['tổng quan kho', 'kho đang thế nào', 'báo cáo kho', 'tình hình kho'],
    patterns_en: ['inventory summary', 'warehouse overview'],
    slots: [],
    examples: [{
      utterance: 'Kho đang thế nào rồi?',
      tool_input: {},
    }],
  },
);

// ── Intents v2.0 — picking, BOM, reorder, scrap, ABC, barcode, UoM ──
khoIntents.push(
  {
    id: 'kho.intent.picking_suggest',
    tool: 'kho.picking.suggest',
    patterns_vi: ['xuất lô nào trước', 'gợi ý xuất', 'nên xuất lô nào', 'fefo', 'lô nào xuất trước'],
    patterns_en: ['which lot to pick', 'picking suggestion', 'fefo'],
    slots: ['sku', 'quantity'],
    examples: [{
      utterance: 'Xuất 35 hộp sữa TH thì nên lấy lô nào trước?',
      tool_input: { sku: 'SUA-TH', quantity: '35' },
    }],
  },
  {
    id: 'kho.intent.bom_info',
    tool: 'kho.bom.info',
    patterns_vi: ['định mức', 'công thức', 'lắp được bao nhiêu', 'bom', 'nguyên liệu cần'],
    patterns_en: ['bill of materials', 'bom info', 'how many can I build'],
    slots: ['sku'],
    examples: [{
      utterance: 'Giỏ quà Tết lắp được tối đa bao nhiêu với tồn hiện tại?',
      tool_input: { sku: 'COMBO-QUA' },
    }],
  },
  {
    id: 'kho.intent.bom_upsert',
    tool: 'kho.bom.upsert',
    patterns_vi: ['tạo định mức', 'khai công thức', 'đặt bom', 'định mức nguyên liệu'],
    patterns_en: ['create bom', 'set bill of materials'],
    slots: ['sku', 'lines'],
    examples: [{
      utterance: 'Tạo định mức giỏ quà: 1 rượu vang + 2 hộp bánh quy',
      tool_input: { sku: 'COMBO-QUA', lines: [
        { component_sku: 'RUOU-VANG', qty_per: '1' },
        { component_sku: 'BANH-QUY', qty_per: '2' },
      ]},
    }],
  },
  {
    id: 'kho.intent.assembly',
    tool: 'kho.assembly.execute',
    patterns_vi: ['lắp ráp', 'lắp', 'đóng bộ', 'tháo dỡ', 'tháo bộ', 'sản xuất'],
    patterns_en: ['assemble', 'disassemble', 'build'],
    slots: ['sku', 'qty', 'kind'],
    examples: [{
      utterance: 'Lắp 3 giỏ quà Tết',
      tool_input: { sku: 'COMBO-QUA', qty: '3', kind: 'assemble' },
    }],
  },
  {
    id: 'kho.intent.uom_upsert',
    tool: 'kho.uom.upsert',
    patterns_vi: ['khai quy đổi', 'đơn vị quy đổi', 'một thùng bằng', 'quy cách'],
    patterns_en: ['unit conversion', 'uom'],
    slots: ['sku', 'uom_name', 'factor'],
    examples: [{
      utterance: 'Bia 333 một thùng 24 lon',
      tool_input: { sku: 'BIA-333', uom_name: 'thùng', factor: '24' },
    }],
  },
  {
    id: 'kho.intent.reorder_suggest',
    tool: 'kho.reorder.suggest',
    patterns_vi: ['cần đặt hàng gì', 'lên đơn nhập', 'gợi ý đặt hàng', 'đặt thêm gì'],
    patterns_en: ['reorder suggestions', 'what to order'],
    slots: [],
    examples: [{
      utterance: 'Tuần này cần đặt thêm hàng gì?',
      tool_input: {},
    }],
  },
  {
    id: 'kho.intent.reorder_rule',
    tool: 'kho.reorder.rule_upsert',
    patterns_vi: ['đặt định mức đặt hàng', 'min max', 'rule đặt hàng', 'tồn tối thiểu tối đa'],
    patterns_en: ['reorder rule', 'min max rule'],
    slots: ['sku', 'min_qty', 'max_qty'],
    examples: [{
      utterance: 'Bia 333 giữ tồn từ 60 đến 200 lon, nhà cung cấp Sabeco giao 3 ngày',
      tool_input: { sku: 'BIA-333', min_qty: '60', max_qty: '200', supplier_name: 'Sabeco', lead_time_days: 3 },
    }],
  },
  {
    id: 'kho.intent.scrap',
    tool: 'kho.stock.scrap',
    patterns_vi: ['hủy hàng', 'hàng hỏng', 'hàng vỡ', 'bỏ hàng hết hạn', 'thanh lý hủy'],
    patterns_en: ['scrap', 'write off damaged'],
    slots: ['sku', 'quantity'],
    examples: [{
      utterance: 'Hủy 5 hộp sữa lô L-A bị vỡ',
      tool_input: { sku: 'SUA-TH', quantity: '5', lot_no: 'L-A', reason: 'Vỡ hộp' },
    }],
  },
  {
    id: 'kho.intent.abc',
    tool: 'kho.abc.run',
    patterns_vi: ['phân loại abc', 'chạy abc', 'hàng nào quan trọng', 'phân tích abc'],
    patterns_en: ['abc analysis', 'classify items'],
    slots: [],
    examples: [{
      utterance: 'Chạy phân loại ABC cho kho',
      tool_input: {},
    }],
  },
  {
    id: 'kho.intent.analytics',
    tool: 'kho.analytics.report',
    patterns_vi: ['hàng tồn lâu', 'tồn kho già', 'nên kiểm kê gì', 'stock aging'],
    patterns_en: ['stock aging', 'cycle count due'],
    slots: [],
    examples: [{
      utterance: 'Hàng nào nằm kho lâu chưa bán được?',
      tool_input: {},
    }],
  },
  {
    id: 'kho.intent.barcode',
    tool: 'kho.barcode.lookup',
    patterns_vi: ['quét mã', 'mã vạch này', 'barcode', 'tra mã vạch'],
    patterns_en: ['scan barcode', 'lookup barcode'],
    slots: ['barcode'],
    examples: [{
      utterance: 'Mã vạch 8934822101343 là hàng gì?',
      tool_input: { barcode: '8934822101343' },
    }],
  },
);

// ── Intents v2.1 — AUTOMATION ──
khoIntents.push(
  {
    id: 'kho.intent.replenish_suggest',
    tool: 'kho.replenish.suggest',
    patterns_vi: ['bổ hàng thông minh', 'cần đặt gì theo dự báo', 'đặt hàng theo điểm đặt lại', 'gợi ý bổ hàng'],
    patterns_en: ['smart replenishment', 'reorder suggestions dynamic'],
    slots: [],
    examples: [{
      utterance: 'Theo dự báo thì tuần này cần bổ hàng gì?',
      tool_input: {},
    }],
  },
  {
    id: 'kho.intent.projected',
    tool: 'kho.forecast.projected',
    patterns_vi: ['bao lâu nữa hết hàng', 'hàng nào sắp cạn', 'chiếu tồn', 'dự kiến hết hàng khi nào'],
    patterns_en: ['days to stockout', 'projected inventory', 'when will we run out'],
    slots: ['horizon_days'],
    examples: [{
      utterance: 'Với tốc độ bán hiện tại thì bia còn đủ bán bao lâu?',
      tool_input: { horizon_days: 30 },
    }],
  },
  {
    id: 'kho.intent.dead_stock',
    tool: 'kho.analytics.dead_stock',
    patterns_vi: ['hàng chết', 'hàng ế', 'vốn đọng', 'hàng không bán được'],
    patterns_en: ['dead stock', 'slow moving items'],
    slots: ['idle_days'],
    examples: [{
      utterance: 'Hàng nào 3 tháng nay không bán được cái nào?',
      tool_input: { idle_days: 90 },
    }],
  },
  {
    id: 'kho.intent.replenish_params',
    tool: 'kho.replenish.params_set',
    patterns_vi: ['thiết lập bổ hàng', 'đặt service level', 'tính điểm đặt lại', 'tồn an toàn cho'],
    patterns_en: ['set replenishment params', 'safety stock for'],
    slots: ['sku', 'service_level', 'lead_time_days'],
    examples: [{
      utterance: 'Tính điểm đặt lại cho bia 333, độ phủ 95%, giao hàng 7 ngày',
      tool_input: { sku: 'BIA-333', service_level: '0.95', lead_time_days: 7 },
    }],
  },
  {
    id: 'kho.intent.xyz',
    tool: 'kho.xyz.run',
    patterns_vi: ['phân loại xyz', 'abc xyz', 'hàng nào ổn định', 'ma trận abc xyz'],
    patterns_en: ['xyz analysis', 'abc-xyz matrix'],
    slots: [],
    examples: [{
      utterance: 'Chạy phân tích ABC-XYZ xem hàng nào nên tự động hóa',
      tool_input: {},
    }],
  },
  {
    id: 'kho.intent.automation_run',
    tool: 'kho.automation.run',
    patterns_vi: ['cập nhật dự báo', 'chạy automation', 'tính lại thống kê kho', 'refresh dự báo'],
    patterns_en: ['run automation', 'refresh forecast'],
    slots: [],
    examples: [{
      utterance: 'Cập nhật lại toàn bộ dự báo và cảnh báo kho',
      tool_input: {},
    }],
  },
);
