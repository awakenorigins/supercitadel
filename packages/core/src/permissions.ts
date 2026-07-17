export type RoleType = 'super_admin' | 'owner' | 'manager' | 'staff';

export type Permission = string;
export type SecurityLevel = 1 | 2;
export interface PermissionMeta { key: Permission; module: string; resource: string; action: string; description: string; securityLevel: SecurityLevel; sensitive: boolean }

const p = (key: Permission, description: string, securityLevel: SecurityLevel = 1, sensitive = false): PermissionMeta => {
  const [module, resource, action] = String(key).split('.');
  return { key, module, resource, action, description, securityLevel, sensitive };
};

export const PERMISSION_REGISTRY = [
  p('accounting.receipt.create','Tạo phiếu thu',2,true),
  p('accounting.payment.create','Tạo phiếu chi',2,true),
  p('accounting.invoice.create','Tạo hóa đơn',2,true),
  p('accounting.payment.cancel','Hủy phiếu thu/chi',2,true),
  p('crm.contact.create','Thêm liên hệ CRM'),
  p('crm.contact.read','Xem liên hệ CRM'),
  p('crm.deal.create','Thêm deal CRM'),
  p('crm.deal.move','Chuyển giai đoạn deal CRM'),
  p('inventory.item.create','Thêm mặt hàng kho'),
  p('inventory.qty.adjust','Điều chỉnh tồn kho',2,true),
  p('hr.employee.create','Thêm nhân viên'),
  p('hr.attendance.checkin','Check-in chấm công'),
  p('hr.attendance.checkout','Check-out chấm công'),
  p('hr.shift.create','Tạo ca làm việc'),
  p('om.wallet.read','Xem ví Om'),
  p('om.wallet.spend','Chi/chuyển Om lớn',2,true),
  p('report.summary.read','Xem báo cáo tóm tắt'),
  p('core.user.role_change','Đổi quyền thành viên',2,true),
  p('core.audit.read','Xem audit log',1,false),
  p('core.permissions.read','Xem danh sách quyền'),
  p('chat.message.read','Đọc tin nhắn'),
  p('chat.message.create','Gửi tin nhắn'),
  p('chat.room.admin','Quản trị phòng chat'),
  p('chat.reaction.create','Thả cảm xúc chat'),
  p('notification.notification.read','Xem thông báo'),
  p('notification.notification.create','Tạo thông báo'),
  p('om.wallet.topup','Nạp Om',2,true),
  // ── Workflow core ──
  p('workflow.definition.read','Workflow — Xem định nghĩa quy trình'),
  p('workflow.definition.write','Workflow — Tạo/sửa định nghĩa quy trình',2,true),
  p('workflow.instance.read','Workflow — Xem instance quy trình'),
  p('workflow.instance.write','Workflow — Khởi tạo/cập nhật instance quy trình',2,true),
  p('workflow.step.approve','Workflow — Duyệt bước quy trình',2,true),
  p('workflow.step.reject','Workflow — Từ chối bước quy trình',2,true),
  p('workflow.step.delegate','Workflow — Ủy quyền bước quy trình',2,true),
  p('workflow.admin.manage','Workflow — Quản trị workflow/SLA/compliance',2,true),
  // ── Kế Toán 10A ──
  p('ke-toan-10a.receipt.create','Kế Toán 10A — Tạo phiếu thu',2,true),
  p('ke-toan-10a.payment.create','Kế Toán 10A — Tạo phiếu chi',2,true),
  p('ke-toan-10a.invoice.create','Kế Toán 10A — Tạo hóa đơn bán/mua',2,true),
  p('ke-toan-10a.invoice.collect','Kế Toán 10A — Thu tiền theo hóa đơn',2,true),
  p('ke-toan-10a.advance.create','Kế Toán 10A — Tạm ứng/đặt cọc',2,true),
  p('ke-toan-10a.recurring.create','Kế Toán 10A — Đặt giao dịch định kỳ',2,true),
  p('ke-toan-10a.recurring.run','Kế Toán 10A — Chạy giao dịch định kỳ',2,true),
  p('ke-toan-10a.credit.limit-set','Kế Toán 10A — Đặt hạn mức tín dụng',2,true),
  p('ke-toan-10a.bank.reconcile','Kế Toán 10A — Đối chiếu ngân hàng',2,true),
  p('ke-toan-10a.asset.create','Kế Toán 10A — Ghi nhận TSCĐ',2,true),
  p('ke-toan-10a.asset.depreciate','Kế Toán 10A — Chạy khấu hao',2,true),
  p('ke-toan-10a.fx.revalue','Kế Toán 10A — Đánh giá lại tỷ giá',2,true),
  p('ke-toan-10a.period.close','Kế Toán 10A — Kết chuyển & khóa niên độ',2,true),
  p('ke-toan-10a.budget.set','Kế Toán 10A — Đặt ngân sách'),
  p('ke-toan-10a.budget.read','Kế Toán 10A — Xem ngân sách vs thực tế'),
  p('ke-toan-10a.report.read','Kế Toán 10A — Xem báo cáo nhanh'),
  // ── Soul-Manager (Nhân Sự) ──
  p('hr.employee.read','Soul-Manager — Xem hồ sơ, tìm kiếm nhân viên'),
  p('hr.employee.write','Soul-Manager — Tạo/sửa hồ sơ, điều chuyển, người phụ thuộc'),
  p('hr.org.read','Soul-Manager — Xem sơ đồ tổ chức, phòng ban, chức danh'),
  p('hr.attendance.read','Soul-Manager — Xem bảng công, giờ vào ra, OT'),
  p('hr.attendance.write','Soul-Manager — Chấm công, sửa công'),
  p('hr.leave.read','Soul-Manager — Xem số dư phép, đơn nghỉ'),
  p('hr.leave.write','Soul-Manager — Tạo đơn xin nghỉ phép'),
  p('hr.leave.approve','Soul-Manager — Duyệt/từ chối đơn nghỉ phép'),
  p('hr.payroll.read','Soul-Manager — Xem phiếu lương, bảng lương kỳ'),
  p('hr.payroll.run','Soul-Manager — Chạy/tính lại bảng lương kỳ',2,true),
  p('hr.payroll.approve','Soul-Manager — Chốt bảng lương (khóa kỳ)',2,true),
  p('hr.report.read','Soul-Manager — Xem báo cáo nhân sự tổng hợp'),
  p('hr.recruitment.read','Soul-Manager — Xem pipeline tuyển dụng'),
  p('hr.recruitment.write','Soul-Manager — Thêm/chuyển stage ứng viên'),
  p('hr.training.write','Soul-Manager — Tạo khóa học, ghi danh, hoàn thành đào tạo'),
  // ── Soul-Inventory (Quản lý Kho) ── action lớp 2 khai trong tool def của module (payroll-style)
  p('kho.item.read','Soul-Inventory — Xem danh mục vật tư/hàng hóa'),
  p('kho.item.write','Soul-Inventory — Tạo/sửa vật tư, UoM, BOM, địa điểm kho'),
  p('kho.stock.read','Soul-Inventory — Tra cứu tồn, thẻ kho, cảnh báo tồn thấp + cận hạn'),
  p('kho.stock.write','Soul-Inventory — Nhập/xuất/chuyển kho, lắp ráp, hủy hàng, landed cost'),
  p('kho.reservation.read','Soul-Inventory — Xem danh sách phiếu giữ hàng'),
  p('kho.reservation.write','Soul-Inventory — Tạo/hủy/hoàn tất phiếu giữ hàng'),
  p('kho.stocktake.read','Soul-Inventory — Xem lịch sử kiểm kê'),
  p('kho.stocktake.write','Soul-Inventory — Thực hiện và chốt phiên kiểm kê'),
  p('qldn.employee.read','QLDN — Xem hồ sơ nhân viên + salary profile'),
  p('qldn.employee.write','QLDN — Thêm/sửa nhân viên, salary profile',2,true),
  p('qldn.timesheet.import','QLDN — Import bảng chấm công Excel',2,true),
  p('qldn.timesheet.write','QLDN — Nhập/sửa chấm công',2,true),
  p('qldn.payroll.run','QLDN — Chạy bảng lương kỳ',2,true),
  p('qldn.payroll.approve','QLDN — Duyệt bảng lương',2,true),
  p('qldn.payroll.read','QLDN — Xem bảng lương, tổng quỹ lương'),
  p('qldn.commission.write','QLDN — Nhập doanh số/hoa hồng',2,true),
  p('qldn.commission.read','QLDN — Xem doanh số/hoa hồng'),
  p('qldn.payout.create','QLDN — Tạo batch chi lương ngân hàng',2,true),
  p('qldn.payslip.read','QLDN — Xem phiếu lương'),
  p('qldn.contractor.write','QLDN — Thanh toán CTV/gia công/công tác phí',2,true),
  p('qldn.forecast.read','QLDN — Xem dự báo dòng tiền'),
  p('qldn.forecast.write','QLDN — Cập nhật dự báo dòng tiền',2,true),
  // ── QLDN Finance Flow — workflow tài chính mỏng, tái sử dụng Kế Toán 10A ──
  p('qldn-finance-flow.payment-request.read','QLDN Finance Flow — Xem đề nghị thanh toán/tạm ứng'),
  p('qldn-finance-flow.payment-request.write','QLDN Finance Flow — Tạo/sửa đề nghị thanh toán/tạm ứng',2,true),
  p('qldn-finance-flow.payment-request.approve','QLDN Finance Flow — Duyệt đề nghị thanh toán/tạm ứng',2,true),
  p('qldn-finance-flow.payment-request.pay','QLDN Finance Flow — Xác nhận chi/giải ngân đề nghị',2,true),
  p('qldn-finance-flow.advance.read','QLDN Finance Flow — Xem tạm ứng/quyết toán'),
  p('qldn-finance-flow.advance.write','QLDN Finance Flow — Tạo/sửa tạm ứng/quyết toán',2,true),
  p('qldn-finance-flow.advance.approve','QLDN Finance Flow — Duyệt tạm ứng/quyết toán',2,true),
  p('qldn-finance-flow.advance.settle','QLDN Finance Flow — Tất toán tạm ứng và chênh lệch',2,true),
  p('qldn-finance-flow.debt.read','QLDN Finance Flow — Xem công nợ và nhắc nợ'),
  p('qldn-finance-flow.debt.write','QLDN Finance Flow — Tạo/sửa báo cáo công nợ',2,true),
  p('qldn-finance-flow.debt.approve','QLDN Finance Flow — Duyệt kế hoạch/xóa nợ',2,true),
  p('qldn-finance-flow.debt.pay','QLDN Finance Flow — Xác nhận thanh toán công nợ',2,true),
  p('qldn-finance-flow.payroll-flow.read','QLDN Finance Flow — Xem luồng duyệt bảng lương'),
  p('qldn-finance-flow.payroll-flow.write','QLDN Finance Flow — Tạo/sửa run duyệt bảng lương',2,true),
  p('qldn-finance-flow.payroll-flow.approve','QLDN Finance Flow — Duyệt bảng lương generic',2,true),
  p('qldn-finance-flow.payroll-flow.pay','QLDN Finance Flow — Xác nhận lệnh chi lương',2,true),
  // ── QLDN HR Plus — full HR lifecycle (49 qhr_ tables) ──
  p('qldn-hr-plus.recruitment.read','QLDN HR Plus — Xem yêu cầu/kế hoạch tuyển dụng'),
  p('qldn-hr-plus.recruitment.write','QLDN HR Plus — Tạo/sửa yêu cầu/kế hoạch tuyển dụng',2,true),
  p('qldn-hr-plus.candidate.read','QLDN HR Plus — Xem kho ứng viên và pipeline'),
  p('qldn-hr-plus.candidate.write','QLDN HR Plus — Tạo/sửa ứng viên/application/offer',2,true),
  p('qldn-hr-plus.probation.read','QLDN HR Plus — Xem thử việc'),
  p('qldn-hr-plus.probation.write','QLDN HR Plus — Tạo/sửa thử việc',2,true),
  p('qldn-hr-plus.probation.evaluate','QLDN HR Plus — Đánh giá thử việc',2,true),
  p('qldn-hr-plus.onboarding.execute','QLDN HR Plus — Thực hiện onboarding checklist',2,true),
  p('qldn-hr-plus.contract.read','QLDN HR Plus — Xem hợp đồng/phụ lục/cảnh báo'),
  p('qldn-hr-plus.contract.write','QLDN HR Plus — Tạo/sửa hợp đồng/phụ lục/tracking',2,true),
  p('qldn-hr-plus.contract.sign','QLDN HR Plus — Ký/chuyển trạng thái hợp đồng',2,true),
  p('qldn-hr-plus.transfer.read','QLDN HR Plus — Xem thuyên chuyển'),
  p('qldn-hr-plus.transfer.write','QLDN HR Plus — Tạo/sửa thuyên chuyển',2,true),
  p('qldn-hr-plus.trip.read','QLDN HR Plus — Xem công tác'),
  p('qldn-hr-plus.trip.write','QLDN HR Plus — Tạo/sửa công tác/tạm ứng',2,true),
  p('qldn-hr-plus.training.read','QLDN HR Plus — Xem đào tạo'),
  p('qldn-hr-plus.training.write','QLDN HR Plus — Tạo/sửa đào tạo',2,true),
  p('qldn-hr-plus.training.evaluate','QLDN HR Plus — Đánh giá đào tạo',2,true),
  p('qldn-hr-plus.discipline.read','QLDN HR Plus — Xem kỷ luật'),
  p('qldn-hr-plus.discipline.write','QLDN HR Plus — Tạo/sửa kỷ luật',2,true),
  p('qldn-hr-plus.offboarding.read','QLDN HR Plus — Xem thôi việc'),
  p('qldn-hr-plus.offboarding.write','QLDN HR Plus — Tạo/sửa thôi việc/bàn giao/quyết toán',2,true),
  p('qldn-hr-plus.exitinterview.read','QLDN HR Plus — Xem exit interview theo ACL',2,true),
  p('qldn-hr-plus.audit.read','QLDN HR Plus — Xem audit nội bộ'),
  p('qldn-hr-plus.audit.write','QLDN HR Plus — Tạo/sửa audit/findings/CAR',2,true),
  p('qldn-hr-plus.admin.manage','QLDN HR Plus — Quản trị HR Plus',2,true),
] as const satisfies readonly PermissionMeta[];

export const ROLE_PERMISSIONS: Record<RoleType, readonly Permission[]> = {
  super_admin: ['*'],
  owner: ['*'],
  manager: ['accounting.*','crm.*','inventory.*','hr.*','om.wallet.read','report.*','core.permissions.read','ke-toan-10a.*','kho.*','qldn.*'],
  staff: ['crm.contact.create','crm.contact.read','hr.attendance.checkin','hr.attendance.checkout','om.wallet.read','report.summary.read','core.permissions.read','ke-toan-10a.report.read','qldn.payslip.read'],
};

export function permissionMatches(grant: Permission, perm: Permission): boolean {
  if (grant === '*' || grant === perm) return true;
  if (grant.endsWith('.*')) return String(perm).startsWith(String(grant).slice(0, -1));
  return false;
}
export function hasPermission(role: RoleType, perm: Permission): boolean {
  return (ROLE_PERMISSIONS[role] ?? []).some((g) => permissionMatches(g, perm));
}
export function permissionMeta(perm: Permission): PermissionMeta | undefined { return PERMISSION_REGISTRY.find((x) => x.key === perm); }
export function requiredSecurityLevel(perm: Permission): SecurityLevel { return permissionMeta(perm)?.securityLevel ?? 1; }
export function isSensitivePermission(perm: Permission): boolean { return permissionMeta(perm)?.sensitive ?? false; }
export function permissionsForRole(role: RoleType): Permission[] {
  if ((ROLE_PERMISSIONS[role] ?? []).includes('*')) return PERMISSION_REGISTRY.map((x) => x.key);
  return PERMISSION_REGISTRY.filter((x) => hasPermission(role, x.key)).map((x) => x.key);
}
