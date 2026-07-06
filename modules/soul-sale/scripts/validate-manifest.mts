/** Gate B11: validate manifest.json bằng CHÍNH validateManifest của host core.
 *  Trình tự chuẩn NẠP-MODULE: nạp permission vào registry TRƯỚC (Beat 2), rồi mới validate manifest (Beat loader).
 *  Ở đây mô phỏng đúng trình tự đó: push 21 key vào PERMISSION_REGISTRY trước khi import manifest.ts
 *  (vì manifest.ts snapshot permSet lúc module load). */
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));

const perms = await import('../../../packages/core/src/permissions.js');
const P = perms.PERMISSION_REGISTRY as { key: string; module: string; resource: string; action: string; description: string; securityLevel: 1 | 2; sensitive: boolean }[];
const mk = (key: string, description: string, securityLevel: 1 | 2, sensitive: boolean) => {
  const [module, resource, action] = key.split('.');
  return { key, module: module!, resource: resource!, action: action!, description, securityLevel, sensitive };
};
const KEYS: [string, string, 1 | 2, boolean][] = [
  ['soulsale.customer.read', 'Xem khách hàng', 1, false], ['soulsale.customer.write', 'Tạo/sửa/gộp khách', 2, true],
  ['soulsale.channel.read', 'Xem cây kênh', 1, false], ['soulsale.channel.write', 'Quản trị kênh', 2, true],
  ['soulsale.lead.read', 'Xem lead', 1, false], ['soulsale.lead.write', 'Ghi/convert lead', 1, false],
  ['soulsale.deal.read', 'Xem deal', 1, false], ['soulsale.deal.write', 'Sửa deal/hoạt động', 1, false],
  ['soulsale.quote.read', 'Xem báo giá', 1, false], ['soulsale.quote.write', 'Tạo/chốt báo giá', 1, false],
  ['soulsale.order.read', 'Xem đơn', 1, false], ['soulsale.order.write', 'Xác nhận/hủy/giữ đơn', 2, true],
  ['soulsale.finance.read', 'Xem công nợ/hoa hồng', 1, false], ['soulsale.finance.write', 'Thu tiền/hạn mức/chốt kỳ', 2, true],
  ['soulsale.price.read', 'Tra giá', 1, false], ['soulsale.price.write', 'Đặt rule giá', 2, true],
  ['soulsale.target.read', 'Xem chỉ tiêu', 1, false], ['soulsale.target.write', 'Giao chỉ tiêu', 1, false],
  ['soulsale.import.read', 'Xem batch đối soát', 1, false], ['soulsale.import.write', 'Nạp/chốt bảng kê', 2, true],
  ['soulsale.report.read', 'Báo cáo/dự báo', 1, false],
];
for (const [k, d, l, s] of KEYS) if (!P.some((x) => x.key === k)) P.push(mk(k, d, l, s));

const { validateManifest } = await import('../../../packages/core/src/manifest.js');
const result = validateManifest(manifest) as { ok: boolean; errors?: string[]; warnings: string[] };
if (!result.ok) {
  console.error('❌ validateManifest FAIL:', JSON.stringify(result, null, 2));
  process.exit(1);
}
if (result.warnings?.length) console.log('⚠️ warnings:', result.warnings);
console.log('✅ validateManifest PASS (21 permission inject đúng trình tự NẠP-MODULE Beat 2 → loader)');
console.log(`   id=${manifest.id} engine=${manifest.engine} perms=${manifest.permissions.length} emits=${manifest.events.emits.length} subscribes=${manifest.events.subscribes.length} group="${manifest.group}" icon=${manifest.icon}`);
