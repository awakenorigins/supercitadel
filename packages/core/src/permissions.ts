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
] as const satisfies readonly PermissionMeta[];

export const ROLE_PERMISSIONS: Record<RoleType, readonly Permission[]> = {
  super_admin: ['*'],
  owner: ['*'],
  manager: ['accounting.*','crm.*','inventory.*','hr.*','om.wallet.read','report.*','core.permissions.read'],
  staff: ['crm.contact.create','crm.contact.read','hr.attendance.checkin','hr.attendance.checkout','om.wallet.read','report.summary.read','core.permissions.read'],
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
