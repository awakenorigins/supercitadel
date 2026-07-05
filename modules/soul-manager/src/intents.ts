/**
 * SOUL-MANAGER — Intent definitions cho Tiểu Tâm
 * Patterns Việt/Anh → tool. Một phần "giáo trình" (mặt cắt ⑧):
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

export const hrIntents: IntentDefinition[] = [
  {
    id: 'hr.intent.employee_create',
    tool: 'hr.employee.create',
    patterns_vi: ['thêm nhân viên', 'tuyển nhân viên mới', 'lập hồ sơ nhân viên', 'nhận người mới vào làm'],
    patterns_en: ['add employee', 'new hire', 'create employee'],
    slots: ['full_name', 'department', 'position', 'hire_date', 'base_salary', 'contract_type'],
    examples: [{
      utterance: 'Thêm nhân viên Trần Văn An, phòng Kinh doanh, chức danh Nhân viên kinh doanh, vào làm 1/7/2026, lương 20 triệu',
      tool_input: {
        full_name: 'Trần Văn An', department: 'Kinh doanh',
        position: 'Nhân viên kinh doanh', hire_date: '2026-07-01', base_salary: '20000000',
      },
    }],
  },
  {
    id: 'hr.intent.employee_search',
    tool: 'hr.employee.search',
    patterns_vi: ['tìm nhân viên', 'danh sách nhân viên', 'ai đang làm ở phòng', 'liệt kê nhân sự'],
    patterns_en: ['find employee', 'list employees', 'who works in'],
    slots: ['q', 'department', 'status'],
    examples: [{
      utterance: 'Cho tao danh sách nhân viên phòng Kỹ thuật',
      tool_input: { department: 'Kỹ thuật' },
    }],
  },
  {
    id: 'hr.intent.employee_get',
    tool: 'hr.employee.get',
    patterns_vi: ['hồ sơ nhân viên', 'thông tin của', 'xem chi tiết nhân viên'],
    patterns_en: ['employee profile', 'employee details'],
    slots: ['code'],
    examples: [{
      utterance: 'Xem hồ sơ NV0002',
      tool_input: { code: 'NV0002' },
    }],
  },
  {
    id: 'hr.intent.employee_update',
    tool: 'hr.employee.update',
    patterns_vi: ['tăng lương cho', 'điều chuyển', 'thăng chức', 'chuyển chính thức', 'cho nghỉ việc', 'chấm dứt hợp đồng'],
    patterns_en: ['raise salary', 'transfer employee', 'promote', 'terminate'],
    slots: ['code', 'base_salary', 'department', 'position', 'status', 'terminated_at'],
    examples: [{
      utterance: 'Tăng lương NV0001 lên 25 triệu và chuyển chính thức',
      tool_input: { code: 'NV0001', base_salary: '25000000', status: 'active' },
    }],
  },
  {
    id: 'hr.intent.dependent_register',
    tool: 'hr.dependent.register',
    patterns_vi: ['đăng ký người phụ thuộc', 'thêm con vào giảm trừ', 'khai người phụ thuộc'],
    patterns_en: ['register dependent', 'add dependent'],
    slots: ['employee_code', 'full_name', 'relationship'],
    examples: [{
      utterance: 'Đăng ký người phụ thuộc cho NV0002: con gái Lê Bảo Anh',
      tool_input: { employee_code: 'NV0002', full_name: 'Lê Bảo Anh', relationship: 'con' },
    }],
  },
  {
    id: 'hr.intent.attendance_record',
    tool: 'hr.attendance.record',
    patterns_vi: ['chấm công', 'điểm danh', 'ghi công', 'hôm nay đi làm', 'check in cho'],
    patterns_en: ['record attendance', 'check in', 'clock in'],
    slots: ['employee_code', 'work_date', 'check_in', 'check_out', 'status', 'ot_weekday_hours'],
    examples: [{
      utterance: 'Chấm công NV0001 ngày 2026-07-01, vào 08:00 ra 17:00',
      tool_input: { employee_code: 'NV0001', work_date: '2026-07-01', check_in: '08:00', check_out: '17:00' },
    }],
  },
  {
    id: 'hr.intent.attendance_summary',
    tool: 'hr.attendance.summary',
    patterns_vi: ['bảng công', 'tổng hợp công tháng', 'tháng này làm mấy công', 'ai đi muộn nhiều'],
    patterns_en: ['attendance summary', 'timesheet', 'monthly attendance'],
    slots: ['year', 'month', 'employee_code'],
    examples: [{
      utterance: 'Bảng công tháng 7/2026 của cả công ty',
      tool_input: { year: 2026, month: 7 },
    }],
  },
  {
    id: 'hr.intent.leave_request',
    tool: 'hr.leave.request',
    patterns_vi: ['xin nghỉ phép', 'tạo đơn nghỉ', 'nghỉ ốm', 'xin nghỉ không lương'],
    patterns_en: ['request leave', 'take a day off', 'sick leave'],
    slots: ['employee_code', 'leave_type', 'start_date', 'end_date', 'days', 'reason'],
    examples: [{
      utterance: 'NV0002 xin nghỉ phép năm ngày 15/7, 1 ngày, lý do việc gia đình',
      tool_input: {
        employee_code: 'NV0002', leave_type: 'PHEP-NAM',
        start_date: '2026-07-15', end_date: '2026-07-15', days: '1', reason: 'việc gia đình',
      },
    }],
  },
  {
    id: 'hr.intent.leave_decide',
    tool: 'hr.leave.decide',
    patterns_vi: ['duyệt đơn nghỉ', 'phê duyệt phép', 'từ chối đơn nghỉ'],
    patterns_en: ['approve leave', 'reject leave request'],
    slots: ['request_id', 'decision', 'note'],
    examples: [{
      utterance: 'Duyệt đơn nghỉ vừa tạo',
      tool_input: { request_id: '<uuid từ ngữ cảnh>', decision: 'approved' },
    }],
  },
  {
    id: 'hr.intent.leave_balance',
    tool: 'hr.leave.balance',
    patterns_vi: ['còn mấy ngày phép', 'số dư phép', 'phép năm còn lại'],
    patterns_en: ['leave balance', 'remaining leave days'],
    slots: ['employee_code', 'year'],
    examples: [{
      utterance: 'NV0002 còn bao nhiêu ngày phép năm nay?',
      tool_input: { employee_code: 'NV0002' },
    }],
  },
  {
    id: 'hr.intent.payroll_run',
    tool: 'hr.payroll.run',
    patterns_vi: ['chạy bảng lương', 'tính lương tháng', 'làm lương', 'tính bảng lương kỳ này'],
    patterns_en: ['run payroll', 'calculate salary', 'process payroll'],
    slots: ['year', 'month', 'standard_work_days'],
    examples: [{
      utterance: 'Chạy bảng lương tháng 7/2026',
      tool_input: { year: 2026, month: 7 },
    }],
  },
  {
    id: 'hr.intent.payslip',
    tool: 'hr.payroll.payslip',
    patterns_vi: ['xem phiếu lương', 'lương tháng này bao nhiêu', 'giải thích lương', 'vì sao thuế cao'],
    patterns_en: ['payslip', 'salary breakdown', 'explain my salary'],
    slots: ['year', 'month', 'employee_code'],
    examples: [{
      utterance: 'Phiếu lương tháng 7 của NV0002, giải thích giúp vì sao bị trừ nhiều',
      tool_input: { year: 2026, month: 7, employee_code: 'NV0002' },
    }],
  },
  {
    id: 'hr.intent.recruitment',
    tool: 'hr.candidate.advance',
    patterns_vi: ['thêm ứng viên', 'ứng viên mới nộp hồ sơ', 'chuyển ứng viên sang phỏng vấn', 'ứng viên trúng tuyển'],
    patterns_en: ['add candidate', 'move candidate to interview', 'candidate hired'],
    slots: ['mode', 'opening_title', 'full_name', 'stage'],
    examples: [{
      utterance: 'Chuyển ứng viên Phạm Thu Hà vị trí Kế toán trưởng sang vòng phỏng vấn',
      tool_input: { mode: 'move', opening_title: 'Kế toán trưởng', full_name: 'Phạm Thu Hà', stage: 'interview' },
    }],
  },
];
