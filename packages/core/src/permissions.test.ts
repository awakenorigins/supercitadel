import { Role, hasPermission, requiredSecurityLevel, permissionsForRole } from './index.js';
function assert(c: unknown, m: string) { if (!c) throw new Error(m); console.log('  ✓', m); }
assert(hasPermission(Role.OWNER, 'core.user.role_change'), 'owner wildcard đổi role');
assert(hasPermission(Role.MANAGER, 'crm.deal.move'), 'manager wildcard crm');
assert(!hasPermission(Role.MANAGER, 'core.user.role_change'), 'manager không đổi role');
assert(hasPermission(Role.STAFF, 'crm.contact.create'), 'staff tạo contact');
assert(!hasPermission(Role.STAFF, 'accounting.payment.create'), 'staff không tạo phiếu chi');
assert(requiredSecurityLevel('accounting.payment.create') === 2, 'phiếu chi cần lớp 2');
assert(requiredSecurityLevel('report.summary.read') === 1, 'báo cáo lớp 1');
assert(permissionsForRole(Role.SUPER_ADMIN).includes('core.audit.read'), 'super_admin resolved all');
console.log('[core/permissions] PASSED');
