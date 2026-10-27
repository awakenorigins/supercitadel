/** SOUL-SALE 1A — self-audit: manifest ↔ registry ↔ code-emits ↔ permission coverage ↔ docs gate (mirror CI). */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTools } from '../src/registry/reads.js';
import { writeActions } from '../src/registry/writes.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const ok = (b: boolean, label: string) => { console.log(`${b ? '  ✓' : '  ✗'} ${label}`); if (!b) fails++; };

console.log('— MANIFEST —');
const m = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
ok(m.id === 'soul-sale' && m.routes === '/api/v1/soul-sale' && m.group === 'Kinh doanh' && m.icon === 'target', 'id/routes/group/icon đúng chuẩn');
ok(Array.isArray(m.permissions) && new Set(m.permissions).size === 21, '21 permission duy nhất');
ok(m.permissions.every((p: string) => /^soulsale\.[a-z]+\.(read|write)$/.test(p)), 'permission dotted notation, không underscore');
const TOPIC = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.[a-z][a-z0-9_-]*$/;
ok(m.events.emits.length === 14 && m.events.emits.every((t: string) => TOPIC.test(t) && t.startsWith('soulsale.')), '14 emits đúng regex topic + prefix soulsale.');
ok(JSON.stringify([...m.events.subscribes].sort()) === JSON.stringify(['accounting.invoice.created', 'accounting.payment.created', 'kho.stock.low']), 'subscribes đúng 3 topic host có thật');

console.log('— REGISTRY —');
ok(readTools.length === 23, '23 read tools');
ok(writeActions.length === 34, '34 write actions');
ok(writeActions.filter((a) => a.securityLevel === 2).length === 14, '14 action L2');
ok(writeActions.every((a) => a.sensitive === (a.securityLevel === 2)), 'sensitive ⟺ level 2');
const permSet = new Set<string>(m.permissions);
ok([...readTools, ...writeActions].every((x) => permSet.has(x.permission)), 'mọi tác vụ dùng permission có trong manifest');

console.log('— PERMISSION COVERAGE (không permission mồ côi) —');
const routesSrc = readFileSync(join(ROOT, 'server/routes.ts'), 'utf8');
const gateUsed = new Set([...routesSrc.matchAll(/gate\('([a-z.]+)'\)/g)].map((x) => x[1]!));
for (const p of m.permissions as string[]) {
  const used = readTools.some((t) => t.permission === p) || writeActions.some((a) => a.permission === p) || gateUsed.has(p);
  ok(used, `perm có consumer: ${p}`);
}

console.log('— EMITS TRONG CODE == MANIFEST —');
const emitFound = new Set<string>();
const scanDirs = [join(ROOT, 'src/services'), join(ROOT, 'src')];
for (const d of scanDirs) for (const f of readdirSync(d)) {
  if (!f.endsWith('.ts')) continue;
  const src = readFileSync(join(d, f), 'utf8');
  for (const mm of src.matchAll(/emit\?\.\(\s*'([a-z.]+)'/g)) emitFound.add(mm[1]!);
}
const manifestEmits = new Set<string>(m.events.emits);
const extraInCode = [...emitFound].filter((t) => !manifestEmits.has(t));
const missingInCode = [...manifestEmits].filter((t) => !emitFound.has(t));
ok(extraInCode.length === 0, `code không emit topic ngoài manifest ${extraInCode.length ? JSON.stringify(extraInCode) : ''}`);
ok(missingInCode.length === 0, `manifest không khai topic chết ${missingInCode.length ? JSON.stringify(missingInCode) : ''}`);

console.log('— DOCS GATE (mirror scripts/audit-module-docs.mts) —');
const docsFiles = ['GUIDE.md', 'TOOLS.md', 'PERMISSIONS.md', 'EVENTS.md', 'IMPORT_FORMAT.md', 'AGENCY_RETAILER_RULES.md', 'RECONCILIATION_PLAYBOOK.md', 'TUTORIAL.md', 'CHANGELOG.md'];
for (const f of [...docsFiles.map((x) => `docs/${x}`), 'README.md', 'INSTALL.md', 'LICENSE']) ok(existsSync(join(ROOT, f)), `tồn tại ${f}`);
if (existsSync(join(ROOT, 'docs/GUIDE.md'))) {
  const g = readFileSync(join(ROOT, 'docs/GUIDE.md'), 'utf8');
  ok(/^#\s+.+/m.test(g), 'GUIDE có H1');
  for (const s of ['Giới thiệu', 'Chức năng', 'Hướng dẫn sử dụng', 'Ví dụ', 'Changelog']) ok(new RegExp(`^##\\s+${s}`, 'm').test(g), `GUIDE có mục ## ${s}`);
  ok(/\|\s*Endpoint\s*\|/.test(g), 'mục Chức năng có bảng cột | Endpoint |');
  ok((g.match(/^- \*\*".+"\*\* →/gm) ?? []).length >= 2, 'mục Ví dụ ≥2 dòng - **"câu"** →');
}

console.log(fails === 0 ? `\nAUDIT PASS — 57 tác vụ, 21 perms phủ kín, 14 emits khớp code` : `\nAUDIT FAIL — ${fails} lỗi`);
process.exit(fails === 0 ? 0 : 1);
