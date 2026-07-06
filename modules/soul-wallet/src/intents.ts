/**
 * SOUL-WALLET 1A — Intent definitions cho Tiểu Tâm (mặt cắt ⑧)
 * Patterns Việt/Anh → tool. Tiểu Tâm đọc bản khai này để phân giải ý định.
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

export const swIntents: IntentDefinition[] = [
  {
    id: 'sw.intent.expense',
    tool: 'sw.tx.create',
    patterns_vi: ['ghi chi', 'tiêu', 'mới chi', 'vừa mua', 'trả tiền', 'thanh toán'],
    patterns_en: ['spent', 'paid', 'add expense'],
    slots: ['amount', 'memo', 'account_id', 'category_id', 'occurred_at'],
    examples: [{
      utterance: 'Ghi chi 320k cafe tiếp khách sáng nay từ tiền mặt',
      tool_input: { kind: 'expense', amount: '320000', memo: 'Cafe tiếp khách', occurred_at: '2026-07-06T09:00:00Z' },
    }],
  },
  {
    id: 'sw.intent.income',
    tool: 'sw.tx.create',
    patterns_vi: ['ghi thu', 'nhận tiền', 'vừa nhận', 'khách chuyển', 'lương về'],
    patterns_en: ['received', 'got paid', 'add income'],
    slots: ['amount', 'memo', 'account_id', 'contact_id'],
    examples: [{
      utterance: 'Khách A vừa chuyển 15 triệu tiền dự án vào VCB',
      tool_input: { kind: 'income', amount: '15000000', memo: 'Tiền dự án — Khách A' },
    }],
  },
  {
    id: 'sw.intent.transfer',
    tool: 'sw.transfer.create',
    patterns_vi: ['chuyển tiền giữa', 'rút tiền', 'nạp ví', 'chuyển từ', 'trả thẻ tín dụng'],
    patterns_en: ['transfer between', 'move money', 'withdraw'],
    slots: ['from_account_id', 'to_account_id', 'amount'],
    examples: [{
      utterance: 'Rút 2 triệu từ VCB về ví tiền mặt',
      tool_input: { amount: '2000000', memo: 'Rút về ví' },
    }],
  },
  {
    id: 'sw.intent.reverse',
    tool: 'sw.tx.reverse',
    patterns_vi: ['hủy giao dịch', 'ghi nhầm', 'đảo bút toán', 'xóa giao dịch vừa ghi'],
    patterns_en: ['undo transaction', 'reverse', 'cancel entry'],
    slots: ['id', 'reason'],
    examples: [{
      utterance: 'Hủy giúp tao giao dịch 1 triệu vừa ghi nhầm',
      tool_input: { reason: 'ghi nhầm' },
    }],
  },
  {
    id: 'sw.intent.summary',
    tool: 'sw.report.narrate',
    patterns_vi: ['tháng này tiêu sao', 'tổng quan ví', 'tình hình tài chính', 'ví còn bao nhiêu', 'báo cáo tháng'],
    patterns_en: ['monthly summary', 'how am i doing', 'wallet overview'],
    slots: ['month'],
    examples: [{ utterance: 'Tháng này tao tiêu sao rồi?', tool_input: {} }],
  },
  {
    id: 'sw.intent.tx_search',
    tool: 'sw.tx.search',
    patterns_vi: ['tìm giao dịch', 'liệt kê chi', 'các khoản trên', 'xem lại chi tiêu', 'chi cho gì'],
    patterns_en: ['find transactions', 'list expenses'],
    slots: ['from', 'to', 'kind', 'memo_contains', 'min_amount'],
    examples: [{
      utterance: 'Liệt kê các khoản chi trên 1 triệu tuần này',
      tool_input: { kind: 'expense', min_amount: '1000000', from: '2026-06-29' },
    }],
  },
  {
    id: 'sw.intent.six_jars',
    tool: 'sw.budget.upsert',
    patterns_vi: ['chia 6 hũ', 'áp 6 hũ', 'chia lương', 'thiết lập ngân sách 6 hũ'],
    patterns_en: ['six jars', 'jars budget'],
    slots: ['six_jars_income'],
    examples: [{
      utterance: 'Lương 20 triệu, chia 6 hũ giúp tao',
      tool_input: { six_jars_income: '20000000' },
    }],
  },
  {
    id: 'sw.intent.budget_status',
    tool: 'sw.budget.status',
    patterns_vi: ['ngân sách còn bao nhiêu', 'hũ nào sắp vỡ', 'tình hình các hũ', 'còn tiêu được bao nhiêu'],
    patterns_en: ['budget status', 'how much left'],
    slots: ['period'],
    examples: [{ utterance: 'Hũ nào sắp vỡ rồi?', tool_input: {} }],
  },
  {
    id: 'sw.intent.goal_contribute',
    tool: 'sw.goal.contribute',
    patterns_vi: ['nạp hũ', 'bỏ vào hũ mục tiêu', 'gom tiền mua'],
    patterns_en: ['add to goal', 'save toward'],
    slots: ['goal_id', 'amount', 'from_account_id'],
    examples: [{
      utterance: 'Nạp 5 triệu vào hũ mua MacBook từ VCB',
      tool_input: { amount: '5000000' },
    }],
  },
  {
    id: 'sw.intent.debt_create',
    tool: 'sw.debt.create',
    patterns_vi: ['cho vay', 'nợ tao', 'tao nợ', 'mượn tiền', 'ghi nợ'],
    patterns_en: ['lent money', 'borrowed', 'owes me'],
    slots: ['contact_name', 'direction', 'principal', 'due_date', 'interest_rate'],
    examples: [{
      utterance: 'Anh B mượn 5 triệu, hẹn trả cuối tháng',
      tool_input: { contact_name: 'Anh B', direction: 'receivable', principal: '5000000', start_date: '2026-07-06', due_date: '2026-07-31' },
    }],
  },
  {
    id: 'sw.intent.debt_pay',
    tool: 'sw.debt.pay',
    patterns_vi: ['trả nợ', 'thu nợ', 'đã trả', 'trả bớt', 'nhận lại tiền cho vay'],
    patterns_en: ['pay debt', 'collect debt'],
    slots: ['debt_id', 'amount', 'paid_at', 'account_id'],
    examples: [{
      utterance: 'Anh B trả 2 triệu, nhận vào tiền mặt',
      tool_input: { amount: '2000000', paid_at: '2026-07-06' },
    }],
  },
  {
    id: 'sw.intent.debt_who',
    tool: 'sw.debt.list',
    patterns_vi: ['ai đang nợ', 'tao nợ ai', 'sổ nợ', 'công nợ cá nhân', 'nợ quá hạn'],
    patterns_en: ['who owes me', 'debt list'],
    slots: ['direction', 'status'],
    examples: [{ utterance: 'Ai đang nợ tao, khoản nào quá hạn?', tool_input: { direction: 'receivable', status: 'open' } }],
  },
  {
    id: 'sw.intent.recurring',
    tool: 'sw.recurring.upsert',
    patterns_vi: ['đặt định kỳ', 'hàng tháng trừ', 'subscription', 'tự động ghi mỗi tháng'],
    patterns_en: ['recurring', 'subscription', 'monthly bill'],
    slots: ['name', 'amount', 'freq', 'next_run_at', 'auto_post', 'account_id'],
    examples: [{
      utterance: 'Server DigitalOcean 1tr2 mỗi tháng trừ VCB ngày 5, tự ghi luôn',
      tool_input: { name: 'Server DigitalOcean', kind: 'subscription', amount: '1200000', freq: 'monthly', next_run_at: '2026-08-05', auto_post: true },
    }],
  },
  {
    id: 'sw.intent.upcoming',
    tool: 'sw.recurring.upcoming',
    patterns_vi: ['sắp trừ tiền', 'khoản nào sắp tới', 'subscription tháng này', 'cái gì tăng giá'],
    patterns_en: ['upcoming bills', 'what will charge'],
    slots: ['days'],
    examples: [{ utterance: 'Tuần tới có khoản nào tự trừ tiền không?', tool_input: { days: 7 } }],
  },
  {
    id: 'sw.intent.import_commit',
    tool: 'sw.import.commit',
    patterns_vi: ['commit import', 'chốt sao kê', 'ghi các dòng import vào sổ'],
    patterns_en: ['commit import', 'confirm statement import'],
    slots: ['job_id', 'skip_duplicates'],
    examples: [{ utterance: 'Chốt phiên import sao kê vừa preview đi', tool_input: { skip_duplicates: true } }],
  },
  {
    id: 'sw.intent.anomaly',
    tool: 'sw.anomaly.scan',
    patterns_vi: ['có gì bất thường', 'soi chi tiêu lạ', 'kiểm tra trùng', 'khoản nào đáng ngờ'],
    patterns_en: ['anything unusual', 'anomaly check'],
    slots: ['lookback_days'],
    examples: [{ utterance: 'Soi giúp tao 3 tháng qua có khoản nào bất thường', tool_input: { lookback_days: 90 } }],
  },
  {
    id: 'sw.intent.runway',
    tool: 'sw.forecast.runway',
    patterns_vi: ['cầm cự được bao lâu', 'runway', 'bao giờ hết tiền', 'dự báo dòng tiền'],
    patterns_en: ['runway', 'how long will money last'],
    slots: ['horizon_days'],
    examples: [{ utterance: 'Với đà này tao cầm cự được bao lâu?', tool_input: { horizon_days: 30 } }],
  },
];
