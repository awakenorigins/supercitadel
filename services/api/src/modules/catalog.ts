// Module catalog — nguồn sự thật về module khả dụng (khớp manifest.json từng module).
export interface ModuleDef {
  id: string; name: string; icon: string; desc: string;
  tier: 'core' | 'free' | 'paid'; priceOm: number;
  group: string; route: string; status: 'ready' | 'coming_soon';
}
export const MODULE_CATALOG: ModuleDef[] = [
  { id: 'chat', name: 'Nhắn Tin', icon: 'chat', desc: 'Chat nội bộ real-time, nhóm.', tier: 'core', priceOm: 0, group: 'Cốt lõi', route: '/chat', status: 'ready' },
  { id: 'notification', name: 'Thông Báo', icon: 'bell', desc: 'Thông báo real-time, đánh dấu đã đọc.', tier: 'core', priceOm: 0, group: 'Cốt lõi', route: '/notifications', status: 'ready' },
  { id: 'om', name: 'Ví Om', icon: 'coin', desc: 'Đồng Om — tiền tệ nội bộ cho AI & module.', tier: 'core', priceOm: 0, group: 'Cốt lõi', route: '/om', status: 'ready' },
  { id: 'crm', name: 'CRM', icon: 'users', desc: 'Khách hàng, pipeline bán hàng, chăm sóc.', tier: 'paid', priceOm: 400, group: 'Kinh doanh', route: '/crm', status: 'ready' },
  { id: 'inventory', name: 'Kho Hàng', icon: 'box', desc: 'Tồn kho, cảnh báo sắp hết, nhập hàng.', tier: 'paid', priceOm: 300, group: 'Vận hành', route: '/inventory', status: 'ready' },
  { id: 'hr', name: 'Nhân Sự & Ca', icon: 'user', desc: 'Phân ca làm việc, danh sách nhân viên trực.', tier: 'paid', priceOm: 250, group: 'Nhân sự', route: '/hr', status: 'ready' },
  { id: 'accounting', name: 'Kế Toán', icon: 'coin', desc: 'Sổ cái kép, thu chi, công nợ, lãi lỗ.', tier: 'paid', priceOm: 500, group: 'Tài chính', route: '/accounting', status: 'ready' },
  { id: 'pos', name: 'Bán Hàng POS', icon: 'cart', desc: 'Order tại bàn, hóa đơn, ca thu ngân.', tier: 'paid', priceOm: 600, group: 'Kinh doanh', route: '/pos', status: 'coming_soon' },
];
export const CORE_IDS = MODULE_CATALOG.filter((m) => m.tier === 'core').map((m) => m.id);
