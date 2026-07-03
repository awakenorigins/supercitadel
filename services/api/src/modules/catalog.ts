// Module catalog — nguồn sự thật về module khả dụng (khớp manifest.json từng module).
export interface ModuleDef {
  id: string; name: string; icon: string; desc: string;
  tier: 'core' | 'free' | 'paid' | 'custom'; priceOm: number;
  group: string; route: string; status: 'ready' | 'coming_soon' | 'demo' | 'open';
  /** R5: module chỉ cho thuê, không bán đứt. */
  rentOnly?: boolean;
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
  { id: 'company-module', name: 'Module Company', icon: 'building', desc: 'Module quản trị may đo riêng cho công ty của bạn — mô tả doanh nghiệp, đội Citadel forge và gắn thẳng vào pháo đài', tier: 'custom', priceOm: 0, group: 'May Đo Doanh Nghiệp', route: '/modules', status: 'open' },
  // R5: module demo — KHÔNG trừ Om thật, backend chặn purchase/rent 400 "Module đang xây dựng", FE chạy demo flow riêng
  { id: 'automato-secretary', name: 'Automato Thư Ký', icon: 'robot', desc: 'Thư ký AI tự động — nhân viên ảo phụ trách công việc cho từng bộ phận.', tier: 'paid', priceOm: 800, group: 'AI Automation', route: '/modules', status: 'demo', rentOnly: true },
];
export const CORE_IDS = MODULE_CATALOG.filter((m) => m.tier === 'core').map((m) => m.id);
