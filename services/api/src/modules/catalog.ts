import { buildCatalogFromManifests, coreIds, loadModuleManifests } from './loader.js';
export interface ModuleDef { id:string; name:string; icon:string; desc:string; tier:'core'|'paid'|'demo'|'custom'; priceOm:number; group:string; route:string; status:'ready'|'coming_soon'|'demo'|'open'; rentOnly?:boolean; manifest?:unknown; external?: boolean }

const EXTERNAL_MODULES: ModuleDef[] = [
  { id: 'pos', name: 'Bán Hàng POS', icon: 'cart', desc: 'Order tại bàn, hóa đơn, ca thu ngân.', tier: 'paid', priceOm: 600, group: 'Kinh doanh', route: '/pos', status: 'coming_soon', external: true },
  { id: 'company-module', name: 'Module Company', icon: 'building', desc: 'Module quản trị may đo riêng cho công ty của bạn — mô tả doanh nghiệp, đội Citadel forge và gắn thẳng vào pháo đài', tier: 'custom', priceOm: 0, group: 'May Đo Doanh Nghiệp', route: '/modules', status: 'open', external: true },
  { id: 'automato-secretary', name: 'Automato Thư Ký', icon: 'robot', desc: 'Thư ký AI tự động — nhân viên ảo phụ trách công việc cho từng bộ phận.', tier: 'paid', priceOm: 800, group: 'AI Automation', route: '/modules', status: 'demo', rentOnly: true, external: true },
];

if (!buildCatalogFromManifests().length) loadModuleManifests();
export const MODULE_CATALOG: ModuleDef[] = [...buildCatalogFromManifests(), ...EXTERNAL_MODULES];
export const CORE_IDS = coreIds();
