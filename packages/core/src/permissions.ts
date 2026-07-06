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
] as const satisfies readonly PermissionMeta[];

export const ROLE_PERMISSIONS: Record<RoleType, readonly Permission[]> = {
  super_admin: ['*'],
  owner: ['*'],
  manager: ['accounting.*','crm.*','inventory.*','hr.*','om.wallet.read','report.*','core.permissions.read','ke-toan-10a.*','kho.*'],
  staff: ['crm.contact.create','crm.contact.read','hr.attendance.checkin','hr.attendance.checkout','om.wallet.read','report.summary.read','core.permissions.read','ke-toan-10a.report.read'],
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
