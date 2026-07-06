// Intent detection — lightweight keyword matcher for Vietnamese business queries.
// Used by the stub provider; the live provider may also use it for tool routing hints.

export type Intent =
  | 'help'      // hướng dẫn sử dụng — trả lời từ giáo trình module (V7A P4)
  | 'revenue'   // doanh thu
  | 'deals'     // CRM deals
  | 'inventory' // tồn kho
  | 'shift'     // ca làm
  | 'attendance' // chấm công
  | 'leave'      // nghỉ phép
  | 'finance'    // kế toán/thu chi/lãi lỗ
  | 'reminder'  // nhắc nhở
  | 'greeting'  // chào hỏi
  | 'unknown';

interface IntentRule {
  intent: Intent;
  keywords: string[];
}

// Order matters: more specific first.
const RULES: IntentRule[] = [
  { intent: 'help', keywords: ['làm sao', 'làm thế nào', 'hướng dẫn', 'cách tạo', 'cách dùng', 'cách xuất', 'cách nhập', 'sử dụng thế nào', 'chỉ em', 'chỉ tôi'] },
  { intent: 'greeting', keywords: ['chào', 'hello', 'hi ', 'xin chào', 'alo'] },
  { intent: 'finance', keywords: ['lãi lỗ', 'công nợ', 'thu chi', 'tiền mặt', 'sổ quỹ', 'kế toán', 'hóa đơn'] },
  { intent: 'revenue', keywords: ['doanh thu', 'doanh số', 'bán được', 'thu nhập', 'lãi', 'tiền'] },
  { intent: 'deals', keywords: ['deal', 'khách hàng', 'crm', 'hợp đồng', 'chốt đơn', 'pipeline'] },
  { intent: 'inventory', keywords: ['kho', 'tồn', 'hết hàng', 'nhập hàng', 'sữa', 'nguyên liệu'] },
  { intent: 'shift', keywords: ['ca làm', 'ca tối', 'ca sáng', 'lịch làm', 'phân ca', 'nhân viên trực'] },
  { intent: 'attendance', keywords: ['chấm công', 'check in', 'check-in', 'đi làm', 'đi trễ', 'có mặt', 'điểm danh'] },
  { intent: 'leave', keywords: ['nghỉ phép', 'xin nghỉ', 'đơn nghỉ', 'số dư phép', 'duyệt đơn', 'nghỉ ốm'] },
  { intent: 'reminder', keywords: ['nhắc', 'deadline', 'hẹn', 'lịch', 'đừng quên'] },
];

export function detectIntent(text: string): Intent {
  const t = text.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((k) => t.includes(k))) return rule.intent;
  }
  return 'unknown';
}
