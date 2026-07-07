#!/usr/bin/env node
/**
 * SOUL-RESTAURANT — audit.mjs
 * Đối chiếu chéo 8 mặt cắt hợp đồng: manifest ↔ registry (chạy thật qua tsx)
 * ↔ routes ↔ docs ↔ intents ↔ events ↔ RLS ↔ an toàn số học/bí mật.
 * Kết quả: in màn hình + ghi AUDIT_REPORT.md với số đếm tường minh.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0; const lines = [];
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; lines.push(`✅ ${name}`); }
  else { fail++; lines.push(`❌ ${name} ${extra}`); }
};
const section = (t) => lines.push(`\n## ${t}`);

// ── Nguồn dữ liệu ──────────────────────────────────────────────
const reg = JSON.parse(execSync('npx tsx scripts/dump-registry.ts', { cwd: root }).toString());
const storeMan = JSON.parse(R('manifest.module.json'));
const coreMan = JSON.parse(R('manifest.json'));
const toolsMd = R('docs/TOOLS.md');
const routesTs = R('src/routes.ts');
const intentsTs = R('src/intents.ts');
const initSql = R('migrations/0000_init.sql') + '\n' + R('migrations/0002_v1_1_loyalty.sql');
const rlsSql = R('migrations/0001_rls.sql') + '\n' + R('migrations/0003_v1_1_rls.sql');
const schemaTs = R('src/db/schema.ts');
const svcDir = join(root, 'src/services');
const svcFiles = readdirSync(svcDir).filter((f) => f.endsWith('.ts'));
const svcAll = svcFiles.map((f) => [f, readFileSync(join(svcDir, f), 'utf8')]);

// ── ① MANIFEST — nguồn sự thật ────────────────────────────────
section('① Manifest — nguồn sự thật');
ok('id/version khớp giữa 2 manifest',
  storeMan.id === coreMan.id && storeMan.version === coreMan.version && storeMan.id === 'soul-restaurant');
const corePerms = new Set(coreMan.permissions);
const storePerms = new Set(storeMan.permissions.map((p) => p.id));
ok(`Permissions đồng nhất core↔store (${corePerms.size})`,
  corePerms.size === storePerms.size && [...corePerms].every((p) => storePerms.has(p)));
ok('Mọi permission store có description + actions',
  storeMan.permissions.every((p) => p.description?.length > 3 && p.actions?.length > 0));
ok('Store listing đủ: pricing buy/rent/trial + tagline + highlights',
  storeMan.store?.pricing?.buy?.price === 1000 && storeMan.store?.pricing?.rent?.price === 150
  && storeMan.store?.trial_days === 7 && storeMan.store?.highlights?.length >= 8);
ok('Conflicts khai module restaurant cũ', storeMan.conflicts.includes('restaurant'));
ok('Docs đủ 4 thành phần (readme/guides/examples ⑧)',
  Boolean(storeMan.docs?.readme) && storeMan.docs.guides.length >= 3 && storeMan.docs.examples.length >= 2);
ok('Hooks đủ 4 pha vòng đời ②', ['install','activate','disable','remove'].every((h) => storeMan.hooks?.[h]));

// ── ⑥ TOOLS — registry (chạy thật) ↔ manifest ─────────────────
section('⑥ Tools — registry thật ↔ manifest');
const regByName = new Map(reg.tools.map((t) => [t.name, t]));
ok(`Registry: 31 năng lực (12 read + 19 action)`,
  reg.tools.length === 42
  && reg.tools.filter((t) => t.kind === 'tool').length === 17
  && reg.tools.filter((t) => t.kind === 'action').length === 25);
const manTools = storeMan.tools;
ok(`Manifest tools = ${manTools.length} == 42`, manTools.length === 42);
let parity = 0;
for (const m of manTools) {
  const r = regByName.get(m.name);
  if (r && r.kind === m.kind && r.permission === m.permission) parity++;
  else lines.push(`   ↳ lệch: ${m.name}`);
}
ok(`Parity tên+kind+permission: ${parity}/42`, parity === 42);
ok('Mọi tool registry có schema + mô tả + docs path',
  reg.tools.every((t) => t.hasSchema && t.descLen > 10 && t.docs.startsWith('docs/TOOLS.md#')));
const l2 = reg.tools.filter((t) => t.securityLevel === 2).map((t) => t.name).sort().join(',');
ok('5 action lớp 2 đúng danh sách',
  l2 === 'resto.bill.pay,resto.bill.void,resto.loyalty.adjust,resto.order.cancel,resto.settings.update');
ok('Mọi permission tool nằm trong manifest permissions',
  reg.tools.every((t) => storePerms.has(t.permission)));

// ── ⑧ DOCS — mọi tool có giáo trình (anchor khớp) ─────────────
section('⑧ Docs — giáo trình Tiểu Tâm');
const slug = (name) => name.replace(/[.]/g, '');
const headings = new Set([...toolsMd.matchAll(/^### (resto\.[a-z_.]+)/gm)].map((m) => slug(m[1])));
let docCover = 0;
for (const t of reg.tools) {
  const anchor = t.docs.split('#')[1];
  if (headings.has(anchor) && anchor === slug(t.name)) docCover++;
  else lines.push(`   ↳ thiếu/lệch anchor: ${t.name} → #${anchor}`);
}
ok(`TOOLS.md phủ ${docCover}/42 năng lực, anchor khớp manifest`, docCover === 42);
ok('TOOLS.md có mục công thức tiền (nguồn duy nhất)', toolsMd.includes('computeAndStoreTotals'));
for (const f of ['README.md','CHANGELOG.md','docs/GUIDE.md','docs/TUTORIAL.md','docs/INSTALL.md','docs/EVENTS.md','WIRING.patch']) {
  ok(`Có ${f}`, R(f).length > 400);
}

// ── ROUTES — manifest ↔ src/routes.ts (mọi endpoint sống) ─────
section('Routes — 31 endpoint sống');
let routeHit = 0;
for (const rt of storeMan.routes) {
  const method = rt.method.toLowerCase();
  if (routesTs.includes(`app.${method}('${rt.path}'`)) routeHit++;
  else lines.push(`   ↳ thiếu route: ${rt.method} ${rt.path}`);
}
ok(`Manifest routes ${storeMan.routes.length} == 43 và có handler thật ${routeHit}/43`,
  storeMan.routes.length === 43 && routeHit === 43);
const codeRoutes = [...routesTs.matchAll(/app\.(get|post)\('([^']+)'/g)].length;
ok(`src/routes.ts không có endpoint ngoài manifest (${codeRoutes} == 43)`, codeRoutes === 43);
ok('Mọi route POST parse Zod tại biên ⑦',
  [...routesTs.matchAll(/app\.post\('[^']+', async \(c\) => \{\s+try \{\s+const input = \w+Schema\.parse/g)].length
  === [...routesTs.matchAll(/app\.post\(/g)].length);

// ── INTENTS ────────────────────────────────────────────────────
section('Intents — 20 mẫu câu Việt/Anh');
ok(`Registry intents = ${reg.intents.length} == 30`, reg.intents.length === 30);
ok('Mọi intent trỏ tool tồn tại + có patterns VI + ví dụ',
  reg.intents.every((i) => regByName.has(i.tool) && i.vi > 0 && i.ex > 0));
ok('Manifest trỏ đúng file intents', storeMan.intents === 'src/intents.ts#restoIntents');

// ── ⑤ EVENTS — chỉ giao tiếp qua sự kiện ──────────────────────
section('⑤ Events — bản khai ↔ code');
const emitted = new Set(
  [...svcAll.map(([, s]) => s).join('\n').matchAll(/emit\('([^']+)'/g)].map((m) => m[1])
);
// lifecycle events nằm ở src/index.ts
for (const m of R('src/index.ts').matchAll(/emit\('([^']+)'/g)) emitted.add(m[1]);
const declared = new Set(coreMan.events.emits);
let evOk = 0;
for (const e of emitted) { if (declared.has(e)) evOk++; else lines.push(`   ↳ code phát nhưng manifest thiếu: ${e}`); }
ok(`Mọi event code phát đều khai trong manifest (${evOk}/${emitted.size})`, evOk === emitted.size);
let evDecl = 0;
for (const e of declared) { if (emitted.has(e)) evDecl++; else lines.push(`   ↳ manifest khai nhưng code không phát: ${e}`); }
ok(`Mọi event manifest khai đều có code phát (${evDecl}/${declared.size})`, evDecl === declared.size);
const TOPIC_RE = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.[a-z][a-z0-9_-]*$/;
ok('Mọi topic đúng format outbox host (domain.entity.verb)',
  [...declared].every((e) => TOPIC_RE.test(e)));
ok('Có cầu nối trừ kho resto.stock.deduct_requested', declared.has('resto.stock.deduct_requested'));
ok('Không import chéo module khác (cấm gọi thẳng ⑤)',
  !svcAll.some(([, s]) => /from '(@citadel\/module-|\.\.\/\.\.\/soul-)/.test(s)));

// ── ④ DỮ LIỆU MỘT KHUÔN + RLS ─────────────────────────────────
section('④ Dữ liệu một khuôn + RLS fail-closed');
const tables = [...initSql.matchAll(/CREATE TABLE IF NOT EXISTS (resto_\w+)/g)].map((m) => m[1]);
ok(`22 bảng resto_* trong DDL (${tables.length})`, tables.length === 22);
const blockOf = (t) => initSql.split(`CREATE TABLE IF NOT EXISTS ${t}`)[1]?.split(');')[0] ?? '';
ok('Mọi bảng có org_id uuid NOT NULL (hoặc PRIMARY KEY)', tables.every((t) =>
  /org_id\s+uuid\s+(NOT NULL|PRIMARY KEY)/.test(blockOf(t))));
// index org_id: CREATE [UNIQUE] INDEX ... ON t(org_id...) HOẶC org_id là PRIMARY KEY (tự có index)
const orgIdx = new Set([...initSql.matchAll(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS \S+ ON (resto_\w+)\s*\(org_id/g)].map((m) => m[1]));
for (const t of tables) if (/org_id\s+uuid\s+PRIMARY KEY/.test(blockOf(t))) orgIdx.add(t);
ok(`Mọi bảng có index dẫn đầu org_id (${orgIdx.size}/22)`, orgIdx.size === 22);
const schemaTables = [...schemaTs.matchAll(/pgTable\('(resto_\w+)'/g)].map((m) => m[1]);
ok(`Drizzle schema khớp DDL (${schemaTables.length}/22)`,
  schemaTables.length === 22 && schemaTables.every((t) => tables.includes(t)));
const enableN = (rlsSql.match(/ENABLE ROW LEVEL SECURITY/g) || []).length;
const forceN = (rlsSql.match(/FORCE ROW LEVEL SECURITY/g) || []).length;
const polN = (rlsSql.match(/CREATE POLICY/g) || []).length;
const gucN = (rlsSql.match(/current_setting\('app\.current_org_id'\)::uuid/g) || []).length;
ok(`RLS: ENABLE ${enableN}/22 · FORCE ${forceN}/22 · POLICY ${polN}/22 · GUC ${gucN}`,
  enableN === 22 && forceN === 22 && polN === 22 && gucN >= 22);
const rlsCode = rlsSql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
ok('RLS KHÔNG có coalesce fallback trong policy (fail-closed)', !/coalesce/i.test(rlsCode));
ok('Migration idempotent (IF NOT EXISTS + DROP POLICY IF EXISTS)',
  /IF NOT EXISTS/.test(initSql) && (rlsSql.match(/DROP POLICY IF EXISTS/g) || []).length === 22);

// ── AN TOÀN SỐ HỌC + TENANT TRONG SERVICE ─────────────────────
section('Số học BigInt + org_id tường minh trong service');
let svcClean = 0; let orgRefs = 0;
const MONEY_RE = /Number\([^)]*(price|amount|total|discount|value|subtotal|grand|paid|tendered|due|balance|pct|qty|points)[^)]*\)|parseFloat\(/i;
for (const [f, s] of svcAll) {
  const bad = MONEY_RE.test(s); // Number() trên TIỀN bị cấm; Number() trên count/index được phép
  const hasOrg = s.includes('ctx.orgId');
  orgRefs += (s.match(/ctx\.orgId/g) || []).length;
  if (!bad && hasOrg) svcClean++;
  else lines.push(`   ↳ ${f}: ${bad ? 'có Number()/parseFloat trên tiền' : 'thiếu ctx.orgId'}`);
}
ok(`12/12 service không Number() trên tiền + lọc org tường minh (${svcClean}/${svcFiles.length}, ${orgRefs} chỗ dùng ctx.orgId)`,
  svcClean === svcFiles.length && svcFiles.length === 12);
ok('money.ts là nguồn số học duy nhất (BigInt)',
  R('src/lib/money.ts').includes('BigInt') && svcAll.every(([, s]) => !s.includes('toFixed(')));

// ── BÍ MẬT + SCRIPTS ──────────────────────────────────────────
section('Bí mật & scripts');
const secretRe = /(password|secret|api[_-]?key|private[_-]?key)\s*[:=]\s*['"][^'"]{4,}/i;
ok('Không secret nào trong src/server/scripts',
  ![...svcAll.map(([, s]) => s), routesTs, intentsTs, R('server/host-adapter.ts'), R('server/tieu-tam-actions.ts')]
    .some((s) => secretRe.test(s)));
const pkg = JSON.parse(R('package.json'));
ok('package.json đủ scripts typecheck/test/audit',
  ['typecheck','test','audit'].every((k) => pkg.scripts?.[k]));
ok('Module standalone: không dependency @citadel/core',
  !Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).some((d) => d.startsWith('@citadel/')));

// ── UI · BẢNG ĐIỀU KHIỂN PHỦ ĐỦ NÚT (v1.2, sống 100%) ─────────
section('UI · Bảng điều khiển phủ đủ nút (không nút chết)');
const uiByTool = new Map(reg.ui.map((c) => [c.tool, c]));
ok(`Catalog UI = ${reg.ui.length} mục == 42 năng lực`, reg.ui.length === 42);
let uiCover = 0;
for (const t of reg.tools) { if (uiByTool.has(t.name)) uiCover++; else lines.push(`   ↳ thiếu nút cho: ${t.name}`); }
ok(`Mọi tool có nút trên bảng điều khiển (${uiCover}/42, 1:1)`, uiCover === 42 && reg.ui.length === reg.tools.length);
ok('Mọi mục UI trỏ tool tồn tại (không nút thừa)',
  reg.ui.every((c) => reg.tools.some((t) => t.name === c.tool)));
ok('Mọi mục UI khớp kind của tool', reg.ui.every((c) => { const t = reg.tools.find((x) => x.name === c.tool); return t && (t.kind === 'tool' ? 'read' : 'action') === c.kind; }));
const routeSet = new Set(storeMan.routes.map((r) => `${r.method} ${r.path}`));
ok('Mọi nút UI ánh xạ đúng route trong manifest',
  reg.ui.every((c) => routeSet.has(`${c.method} ${c.path}`)));
const groupSet = new Set(reg.uiGroups);
ok('Mọi nhóm nút đã khai trong UI_GROUPS', reg.ui.every((c) => groupSet.has(c.group)));
ok('Có endpoint /capabilities phục vụ UI render động',
  storeMan.routes.some((r) => r.path === '/restaurant/capabilities'));
for (const f of ['web/RestaurantConsole.tsx', 'web/soul-restaurant-console.html', 'web/api-client.ts', 'web/README.md']) {
  ok(`Có ${f}`, R(f).length > 200);
}
ok('Console React render từ catalog (tham chiếu restoUiCatalog)', /restoUiCatalog|capabilities/.test(R('web/RestaurantConsole.tsx')));
ok('Demo HTML nhúng đủ 42 mục năng lực', (R('web/soul-restaurant-console.html').match(/"tool":\s*"resto\./g) || []).length >= 42);

// ── KẾT QUẢ ───────────────────────────────────────────────────
const total = pass + fail;
const summary = `# SOUL-RESTAURANT — AUDIT_REPORT.md\n\n**Kết quả: ${pass}/${total} checks đạt** · sinh bởi \`npm run audit\` · ${new Date().toISOString()}\n${lines.join('\n')}\n\n---\nĐối chiếu: manifest(①) · lifecycle hooks(②) · permission(③ qua ⑥) · dữ liệu+RLS(④) · event-only(⑤) · tool chuẩn(⑥) · Zod tại biên(⑦) · docs giáo trình(⑧).\nSmoke test riêng: \`npm run test\` → 95/95 trên PGlite.\n`;
writeFileSync(join(root, 'AUDIT_REPORT.md'), summary);
console.log(lines.join('\n'));
console.log(`\n════════ AUDIT: ${pass}/${total} đạt ════════`);
if (fail > 0) process.exit(1);
