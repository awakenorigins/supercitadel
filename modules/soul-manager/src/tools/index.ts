/**
 * SOUL-MANAGER — Tools & Actions cho Tiểu Tâm (mặt cắt ⑥)
 *
 * Theo chuẩn tích hợp SuperCitadel v10.0.1: tách hai lớp
 *   - READ TOOLS   (kind: 'tool')   — tra cứu, Tiểu Tâm gọi tự do
 *   - WRITE ACTIONS (kind: 'action') — thay đổi dữ liệu nhân sự/lương,
 *     Tiểu Tâm phải confirm với người dùng trước khi execute
 *     (luật confirm–audit–undo §09 Citadel)
 *
 * Mỗi định nghĩa: name + kind + permission (hr.resource.action)
 * + inputSchema (Zod, validate tại biên ⑦) + docs + handler.
 * Tiểu Tâm CHỈ đọc bản khai này — không "biết riêng" gì về module.
 */
import type { z, ZodType } from 'zod';
import type { HrCtx } from '../types.js';
import {
  employeeCreateSchema, employeeUpdateSchema, employeeSearchSchema,
  employeeGetSchema, dependentRegisterSchema, orgChartSchema,
  attendanceRecordSchema, attendanceSummarySchema,
  leaveRequestSchema, leaveDecideSchema, leaveBalanceSchema,
  payrollRunSchema, payrollApproveSchema, payslipGetSchema,
  headcountReportSchema, candidateAdvanceSchema, recruitmentPipelineSchema,
  trainingManageSchema,
} from '../validation/schemas.js';
import {
  createEmployee, updateEmployee, searchEmployees, getEmployee, registerDependent,
} from '../services/employee.service.js';
import { orgChart } from '../services/org.service.js';
import { recordAttendance, attendanceSummary } from '../services/attendance.service.js';
import { requestLeave, decideLeave, leaveBalance } from '../services/leave.service.js';
import { runPayroll, approvePayroll, getPayslip } from '../services/payroll.service.js';
import { headcountReport } from '../services/report.service.js';
import { candidateAdvance, recruitmentPipeline } from '../services/recruitment.service.js';
import { trainingManage } from '../services/training.service.js';

export type ToolKind = 'tool' | 'action';

export interface HrToolDefinition<S extends ZodType = ZodType> {
  /** Định danh — trùng khai báo trong manifest.json */
  name: string;
  /** 'tool' = đọc (gọi tự do) · 'action' = ghi (Tiểu Tâm confirm trước) */
  kind: ToolKind;
  /** Quyền bắt buộc theo cú pháp module.resource.action (mặt cắt ③) */
  permission: string;
  /** Mô tả để Tiểu Tâm hiểu khi nào dùng */
  description: string;
  /** Schema đầu vào — validate tại biên trước khi chạm service */
  inputSchema: S;
  /** Đường dẫn docs chi tiết kèm ví dụ */
  docs: string;
  handler(ctx: HrCtx, rawInput: unknown): Promise<unknown>;
}

function define<S extends ZodType>(def: {
  name: string; kind: ToolKind; permission: string; description: string;
  inputSchema: S; docs: string;
  run(ctx: HrCtx, input: z.infer<S>): Promise<unknown>;
}): HrToolDefinition<S> {
  return {
    name: def.name,
    kind: def.kind,
    permission: def.permission,
    description: def.description,
    inputSchema: def.inputSchema,
    docs: def.docs,
    async handler(ctx, rawInput) {
      const input = def.inputSchema.parse(rawInput); // ⑦ biên giới canh gác
      return def.run(ctx, input);
    },
  };
}

// ────────────────────────────────────────────────────────────
// READ TOOLS — Tiểu Tâm gọi tự do, không cần confirm
// ────────────────────────────────────────────────────────────

export const hrReadTools: HrToolDefinition[] = [
  define({
    name: 'hr.employee.search',
    kind: 'tool',
    permission: 'hr.employee.read',
    description: 'TÌM NHÂN VIÊN: theo tên/mã, lọc phòng ban, trạng thái. Dùng khi hỏi "ai ở phòng X", "danh sách nhân viên", "tìm anh An".',
    inputSchema: employeeSearchSchema,
    docs: 'docs/TOOLS.md#hremployeesearch',
    run: (ctx, input) => searchEmployees(ctx, input),
  }),
  define({
    name: 'hr.employee.get',
    kind: 'tool',
    permission: 'hr.employee.read',
    description: 'HỒ SƠ 360°: chi tiết một nhân viên theo mã — thông tin, phòng ban, phụ cấp, người phụ thuộc, phép còn lại. Dùng khi hỏi "hồ sơ của NV0001", "thông tin chị Bình".',
    inputSchema: employeeGetSchema,
    docs: 'docs/TOOLS.md#hremployeeget',
    run: (ctx, input) => getEmployee(ctx, input),
  }),
  define({
    name: 'hr.org.chart',
    kind: 'tool',
    permission: 'hr.org.read',
    description: 'SƠ ĐỒ TỔ CHỨC: cây phòng ban + headcount, tùy chọn kèm danh sách nhân viên từng phòng. Dùng khi hỏi "công ty có mấy phòng", "sơ đồ tổ chức".',
    inputSchema: orgChartSchema,
    docs: 'docs/TOOLS.md#hrorgchart',
    run: (ctx, input) => orgChart(ctx, input),
  }),
  define({
    name: 'hr.attendance.summary',
    kind: 'tool',
    permission: 'hr.attendance.read',
    description: 'BẢNG CÔNG THÁNG: tổng công, ngày nghỉ, OT từng loại, phút đi muộn/về sớm — cả công ty hoặc một NV. Dùng khi hỏi "bảng công tháng 7", "tháng này An làm mấy công".',
    inputSchema: attendanceSummarySchema,
    docs: 'docs/TOOLS.md#hrattendancesummary',
    run: (ctx, input) => attendanceSummary(ctx, input),
  }),
  define({
    name: 'hr.leave.balance',
    kind: 'tool',
    permission: 'hr.leave.read',
    description: 'SỐ DƯ PHÉP: phép năm còn lại + các đơn đang chờ duyệt của một NV. Dùng khi hỏi "còn mấy ngày phép", "phép năm của Bình".',
    inputSchema: leaveBalanceSchema,
    docs: 'docs/TOOLS.md#hrleavebalance',
    run: (ctx, input) => leaveBalance(ctx, input),
  }),
  define({
    name: 'hr.payroll.payslip',
    kind: 'tool',
    permission: 'hr.payroll.read',
    description: 'PHIẾU LƯƠNG / BẢNG LƯƠNG: chi tiết lương một NV (kèm giải thích từng bước BHXH, thuế) hoặc tổng hợp cả kỳ. Dùng khi hỏi "lương tháng 7 của tôi", "vì sao thuế cao vậy", "tổng chi lương kỳ này".',
    inputSchema: payslipGetSchema,
    docs: 'docs/TOOLS.md#hrpayrollpayslip',
    run: (ctx, input) => getPayslip(ctx, input),
  }),
  define({
    name: 'hr.report.headcount',
    kind: 'tool',
    permission: 'hr.report.read',
    description: 'BÁO CÁO NHÂN SỰ: headcount theo trạng thái/phòng ban, số tuyển mới & nghỉ việc trong khoảng. Dùng khi hỏi "công ty bao nhiêu người", "năm nay tuyển được mấy người".',
    inputSchema: headcountReportSchema,
    docs: 'docs/TOOLS.md#hrreportheadcount',
    run: (ctx, input) => headcountReport(ctx, input),
  }),
];

// ────────────────────────────────────────────────────────────
// WRITE ACTIONS — Tiểu Tâm confirm với người dùng trước khi chạy
// ────────────────────────────────────────────────────────────

export const hrWriteActions: HrToolDefinition[] = [
  define({
    name: 'hr.employee.create',
    kind: 'action',
    permission: 'hr.employee.write',
    description: 'THÊM NHÂN VIÊN: lập hồ sơ mới — mã tự sinh NVxxxx nếu bỏ trống, phòng ban/chức danh tự tạo nếu chưa có, tự mở số dư phép năm.',
    inputSchema: employeeCreateSchema,
    docs: 'docs/TOOLS.md#hremployeecreate',
    run: (ctx, input) => createEmployee(ctx, input),
  }),
  define({
    name: 'hr.employee.update',
    kind: 'action',
    permission: 'hr.employee.write',
    description: 'CẬP NHẬT HỒ SƠ: điều chuyển phòng ban, thăng chức, đổi lương, chuyển chính thức, cho nghỉ việc (status=terminated kèm terminated_at).',
    inputSchema: employeeUpdateSchema,
    docs: 'docs/TOOLS.md#hremployeeupdate',
    run: (ctx, input) => updateEmployee(ctx, input),
  }),
  define({
    name: 'hr.dependent.register',
    kind: 'action',
    permission: 'hr.employee.write',
    description: 'NGƯỜI PHỤ THUỘC: đăng ký/ngừng người phụ thuộc để giảm trừ gia cảnh khi tính thuế TNCN (6,2tr/người/tháng theo policy).',
    inputSchema: dependentRegisterSchema,
    docs: 'docs/TOOLS.md#hrdependentregister',
    run: (ctx, input) => registerDependent(ctx, input),
  }),
  define({
    name: 'hr.attendance.record',
    kind: 'action',
    permission: 'hr.attendance.write',
    description: 'CHẤM CÔNG: ghi một ngày công cho NV — giờ vào/ra (tự tính muộn/sớm theo ca), trạng thái, OT ngày thường/cuối tuần/lễ. Ngày đã chấm phải allow_update mới sửa được.',
    inputSchema: attendanceRecordSchema,
    docs: 'docs/TOOLS.md#hrattendancerecord',
    run: (ctx, input) => recordAttendance(ctx, input),
  }),
  define({
    name: 'hr.leave.request',
    kind: 'action',
    permission: 'hr.leave.write',
    description: 'TẠO ĐƠN NGHỈ PHÉP: phép năm/ốm/thai sản/không lương — guard đủ số dư với phép có quota, không vắt tháng.',
    inputSchema: leaveRequestSchema,
    docs: 'docs/TOOLS.md#hrleaverequest',
    run: (ctx, input) => requestLeave(ctx, input),
  }),
  define({
    name: 'hr.leave.decide',
    kind: 'action',
    permission: 'hr.leave.approve',
    description: 'DUYỆT/TỪ CHỐI ĐƠN NGHỈ: approve trừ số dư phép (guard phía SQL — không đủ là fail), reject giữ nguyên số dư.',
    inputSchema: leaveDecideSchema,
    docs: 'docs/TOOLS.md#hrleavedecide',
    run: (ctx, input) => decideLeave(ctx, input),
  }),
  define({
    name: 'hr.payroll.run',
    kind: 'action',
    permission: 'hr.payroll.run',
    description: 'CHẠY BẢNG LƯƠNG: tính lương cả kỳ (năm/tháng) cho mọi NV đang làm việc — ngày công, OT, BHXH/BHYT/BHTN, thuế TNCN lũy tiến, thực nhận. Tính lại được khi chưa chốt; kỳ đã chốt bị khóa.',
    inputSchema: payrollRunSchema,
    docs: 'docs/TOOLS.md#hrpayrollrun',
    run: (ctx, input) => runPayroll(ctx, input),
  }),
  define({
    name: 'hr.payroll.approve',
    kind: 'action',
    permission: 'hr.payroll.approve',
    description: 'CHỐT BẢNG LƯƠNG: chuyển kỳ đã tính sang approved — sau bước này không tính lại được nữa.',
    inputSchema: payrollApproveSchema,
    docs: 'docs/TOOLS.md#hrpayrollapprove',
    run: (ctx, input) => approvePayroll(ctx, input),
  }),
  define({
    name: 'hr.candidate.advance',
    kind: 'action',
    permission: 'hr.recruitment.write',
    description: 'TUYỂN DỤNG: thêm ứng viên vào vị trí (mode=add, vị trí tự tạo nếu chưa có) hoặc chuyển stage (mode=move): applied → screening → interview → offer → hired/rejected.',
    inputSchema: candidateAdvanceSchema,
    docs: 'docs/TOOLS.md#hrcandidateadvance',
    run: (ctx, input) => candidateAdvance(ctx, input),
  }),
  define({
    name: 'hr.training.manage',
    kind: 'action',
    permission: 'hr.training.write',
    description: 'ĐÀO TẠO: tạo khóa học (create_course), ghi danh NV (enroll — idempotent), ghi nhận hoàn thành kèm điểm (complete).',
    inputSchema: trainingManageSchema,
    docs: 'docs/TOOLS.md#hrtrainingmanage',
    run: (ctx, input) => trainingManage(ctx, input),
  }),
];

/** Read pipeline tuyển dụng — nằm cạnh action để nhóm nghiệp vụ */
export const hrRecruitmentReadTools: HrToolDefinition[] = [
  define({
    name: 'hr.recruitment.pipeline',
    kind: 'tool',
    permission: 'hr.recruitment.read',
    description: 'PIPELINE TUYỂN DỤNG: các vị trí đang tuyển + số ứng viên theo từng stage. Dùng khi hỏi "tuyển dụng đến đâu rồi", "vị trí kế toán có mấy ứng viên".',
    inputSchema: recruitmentPipelineSchema,
    docs: 'docs/TOOLS.md#hrrecruitmentpipeline',
    run: (ctx, input) => recruitmentPipeline(ctx, input),
  }),
];

export const hrTools: HrToolDefinition[] = [
  ...hrReadTools, ...hrRecruitmentReadTools, ...hrWriteActions,
];

export function getHrTool(name: string): HrToolDefinition | undefined {
  return hrTools.find((t) => t.name === name);
}
