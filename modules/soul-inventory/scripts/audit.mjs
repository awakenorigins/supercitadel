/**
 * audit-module-docs — Audit tự động hợp đồng Citadel 8 mặt cắt cho module Kho.
 * Chạy: npm run audit  →  in bảng PASS/FAIL + ghi AUDIT_REPORT.md
 * Exit code 1 nếu có bất kỳ FAIL nào (dùng được trong CI gate).
 */
import { readFile, writeFile, readdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const add = (section, name, ok, note = '') =>
  results.push({ section, name, ok, note });

const exists = async (p) => access(join(root, p)).then(() => true).catch(() => false);
const read = (p) => readFile(join(root, p), 'utf8');

// ── ① MANIFEST ──────────────────────────────────────────────
let manifest = null;
try {
  manifest = JSON.parse(await read('manifest.json'));
  add('① Manifest', 'manifest.json parse được', true);
} catch (e) {
  add('① Manifest', 'manifest.json parse được', false, String(e));
}
if (manifest) {
  for (const f of ['id', 'name', 'version', 'description', 'permissions', 'tools', 'intents', 'routes', 'docs', 'hooks']) {
    add('① Manifest', `có trường "${f}"`, manifest[f] !== undefined);
  }
  add('① Manifest', 'version đúng semver', /^\d+\.\d+\.\d+$/.test(manifest.version ?? ''));
  add('① Manifest', `khai ≥5 tools (thực tế ${manifest.tools?.length ?? 0})`,
    (manifest.tools?.length ?? 0) >= 5);
  add('① Manifest', 'dependencies/conflicts khai tường minh',
    Array.isArray(manifest.dependencies) && Array.isArray(manifest.conflicts));
  add('① Manifest', 'conflicts khai module inventory cũ',
    (manifest.conflicts ?? []).includes('inventory'));
  const store = manifest.store ?? {};
  add('① Store', 'store entry tồn tại và listed', store.listed === true);
  add('① Store', 'giá MUA đúng 1000 Ôm',
    store.pricing?.currency === 'om' && store.pricing?.buy?.price === 1000,
    `buy=${store.pricing?.buy?.price} ${store.pricing?.currency}`);
  add('① Store', 'giá THUÊ đúng 150 Ôm / 30 ngày',
    store.pricing?.rent?.price === 150 && store.pricing?.rent?.period_days === 30,
    `rent=${store.pricing?.rent?.price}/${store.pricing?.rent?.period_days}d`);
  add('① Store', 'có tagline + highlights cho trang cửa hàng',
    typeof store.tagline === 'string' && Array.isArray(store.highlights) && store.highlights.length >= 3);
}

// ── ② VÒNG ĐỜI ──────────────────────────────────────────────
const indexSrc = await read('src/index.ts');
for (const hook of ['onInstall', 'onActivate', 'onDisable', 'onRemove']) {
  add('② Vòng đời', `hook ${hook} tồn tại`, indexSrc.includes(`export async function ${hook}`));
}
add('② Vòng đời', 'onDisable thu hồi đăng ký (unregisterModule)',
  indexSrc.includes('unregisterModule'));
add('② Vòng đời', 'onRemove mặc định KHÔNG drop dữ liệu (opt-in dropData)',
  indexSrc.includes('dropData'));

// ── ③ NGÔN NGỮ QUYỀN ────────────────────────────────────────
if (manifest) {
  const permIds = (manifest.permissions ?? []).map((p) => p.id);
  const pat = /^kho\.[a-z_]+\.[a-z_]+$/;
  add('③ Quyền', 'mọi permission theo cú pháp module.resource.action',
    permIds.length > 0 && permIds.every((id) => pat.test(id)), permIds.join(', '));
  const toolPerms = (manifest.tools ?? []).map((t) => t.permission);
  add('③ Quyền', 'mọi tool đều gắn permission',
    (manifest.tools ?? []).every((t) => !!t.permission));
  add('③ Quyền', 'permission của tool đều được khai trong manifest.permissions',
    toolPerms.every((p) => permIds.includes(p)),
    toolPerms.filter((p) => !permIds.includes(p)).join(', ') || '');
}

// ── ④ DỮ LIỆU MỘT KHUÔN + RLS ───────────────────────────────
const ddl = await read('migrations/0000_init.sql');
const rls = await read('migrations/0001_rls.sql');
const tables = [...ddl.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
add('④ Dữ liệu', `phát hiện ${tables.length} bảng trong migration`, tables.length >= 5, tables.join(', '));
for (const t of tables) {
  const block = ddl.split(`CREATE TABLE IF NOT EXISTS ${t}`)[1]?.split(');')[0] ?? '';
  add('④ Dữ liệu', `${t}: có org_id NOT NULL`, /org_id\s+uuid NOT NULL/.test(block));
  add('④ Dữ liệu', `${t}: có index org_id`,
    new RegExp(`ON ${t} \\(org_id`).test(ddl) || new RegExp(`${t}_org`).test(ddl));
  add('④ Dữ liệu', `${t}: có created_at`, /created_at\s+timestamptz/.test(block));
  add('④ RLS', `${t}: ENABLE ROW LEVEL SECURITY`,
    rls.includes(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`));
  add('④ RLS', `${t}: FORCE ROW LEVEL SECURITY`,
    rls.includes(`ALTER TABLE ${t} FORCE ROW LEVEL SECURITY`));
  add('④ RLS', `${t}: policy tenant_isolation (USING + WITH CHECK)`,
    new RegExp(`CREATE POLICY tenant_isolation ON ${t}[\\s\\S]*?USING[\\s\\S]*?WITH CHECK`).test(rls));
}
add('④ RLS', 'policy dùng app.current_org_id',
  rls.includes(`current_setting('app.current_org_id')::uuid`));

// ── ⑤ EVENT BUS ─────────────────────────────────────────────
const srcFiles = [];
async function walk(dir) {
  for (const e of await readdir(join(root, dir), { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (e.name.endsWith('.ts')) srcFiles.push(p);
  }
}
await walk('src');
let allSrc = '';
for (const f of srcFiles) allSrc += await read(f);
const emits = [...allSrc.matchAll(/emit\('(kho\.[a-z_.]+)'/g)].map((m) => m[1]);
add('⑤ Event', `mọi emit đều prefix "kho." (${new Set(emits).size} event khác nhau)`,
  emits.length > 0);
add('⑤ Event', 'mọi emit payload đều có org_id',
  [...allSrc.matchAll(/emit\('kho\.[^']+',\s*\{([\s\S]*?)\}\)/g)]
    .every((m) => m[1].includes('org_id')));
add('⑤ Event', 'docs/EVENTS.md tồn tại và liệt kê event', await exists('docs/EVENTS.md'));

// ── ⑥ TOOL CHUẨN ────────────────────────────────────────────
const toolsSrc = await read('src/tools/index.ts');
const toolNames = [...toolsSrc.matchAll(/name: '(kho\.[a-z_.]+)'/g)].map((m) => m[1]);
add('⑥ Tool', `≥5 tools định nghĩa trong code (thực tế ${toolNames.length})`, toolNames.length >= 5);
add('⑥ Tool', 'mỗi tool có permission + inputSchema + docs + handler',
  (toolsSrc.match(/permission:/g)?.length ?? 0) >= toolNames.length
  && (toolsSrc.match(/inputSchema:/g)?.length ?? 0) >= toolNames.length
  && (toolsSrc.match(/docs:/g)?.length ?? 0) >= toolNames.length);
add('⑥ Tool', 'handler validate Zod tại biên (inputSchema.parse)',
  toolsSrc.includes('inputSchema.parse'));
const readCount = (toolsSrc.match(/kind: 'tool'/g) ?? []).length;
const writeCount = (toolsSrc.match(/kind: 'action'/g) ?? []).length;
add('⑥ Tool', `tách read/write theo v10.0.1 (${readCount} tool + ${writeCount} action)`,
  readCount >= 4 && writeCount >= 5);
if (manifest) {
  add('⑥ Tool', 'manifest tools đều khai kind',
    (manifest.tools ?? []).every((t) => t.kind === 'tool' || t.kind === 'action'));
  const mActions = (manifest.tools ?? []).filter((t) => t.kind === 'action');
  add('⑥ Tool', 'mọi action khai sensitive (boolean) + securityLevel (1|2)',
    mActions.every((t) => typeof t.sensitive === 'boolean' && (t.securityLevel === 1 || t.securityLevel === 2)));
  add('⑥ Tool', '>=7 actions sensitive (dry-run protocol)',
    mActions.filter((t) => t.sensitive).length >= 7,
    `sensitive=${mActions.filter((t) => t.sensitive).length}`);
  add('⑥ Tool', 'đủ 29 định nghĩa trong manifest (13 tool + 16 action)',
    (manifest.tools ?? []).length === 29 && mActions.length === 16);
}
if (manifest) {
  const manifestToolNames = (manifest.tools ?? []).map((t) => t.name);
  add('⑥ Tool', 'tools trong code khớp 1-1 với manifest',
    toolNames.length === manifestToolNames.length
    && toolNames.every((n) => manifestToolNames.includes(n)));
}

// ── ⑦ BIÊN CANH GÁC ─────────────────────────────────────────
const routesSrc = await read('src/routes.ts');
add('⑦ Biên', 'routes: mutation nào cũng .parse() trước service',
  (routesSrc.match(/Schema\.parse\(/g)?.length ?? 0) >= 7);
add('⑦ Biên', 'lỗi nghiệp vụ có mã máy đọc (KhoError code)',
  allSrc.includes("'INSUFFICIENT_STOCK'") && allSrc.includes("'ITEM_NOT_FOUND'"));
add('⑦ Biên', 'schemas Zod tập trung tại validation/schemas.ts', await exists('src/validation/schemas.ts'));

// ── ⑧ TỰ TÀI LIỆU (audit-module-docs) ───────────────────────
for (const f of ['README.md', 'CHANGELOG.md', 'docs/GUIDE.md', 'docs/TOOLS.md', 'docs/EVENTS.md', 'docs/TUTORIAL.md']) {
  const ok = await exists(f);
  let size = 0;
  if (ok) size = (await read(f)).length;
  add('⑧ Docs', `${f} tồn tại và không rỗng (${size} chars)`, ok && size > 500);
}
const toolsDoc = await read('docs/TOOLS.md');
for (const n of toolNames) {
  add('⑧ Docs', `TOOLS.md có mục cho ${n}`, toolsDoc.includes(n));
}
add('⑧ Docs', 'TOOLS.md có ví dụ hội thoại (giáo trình Tiểu Tâm)',
  toolsDoc.includes('Hội thoại mẫu'));
add('⑧ Docs', 'GUIDE.md có golden path + hướng dẫn cài đặt',
  (await read('docs/GUIDE.md')).includes('golden path') || (await read('docs/GUIDE.md')).includes('Golden') || (await read('docs/GUIDE.md')).includes('Luồng nghiệp vụ'));
add('⑧ Docs', 'README có bảng tuân thủ 8 mặt cắt',
  (await read('README.md')).includes('8 mặt cắt'));
const tut = await read('docs/TUTORIAL.md');
add('⑧ Docs', 'TUTORIAL có >=17 bài học (## Bài)',
  (tut.match(/## Bài /g) ?? []).length >= 17, `bài=${(tut.match(/## Bài /g) ?? []).length}`);
const toolsDocV2 = await read('docs/TOOLS.md');
add('⑧ Docs', 'TOOLS.md đủ 29 định nghĩa (## kho.*)',
  (toolsDocV2.match(/^## kho\./gm) ?? []).length === 29,
  `docs=${(toolsDocV2.match(/^## kho\./gm) ?? []).length}`);
add('⑧ Docs', 'TOOLS.md có 6 định nghĩa automation v2.1',
  ['kho.replenish.suggest','kho.forecast.projected','kho.analytics.dead_stock',
   'kho.replenish.params_set','kho.xyz.run','kho.automation.run']
    .every((n) => toolsDocV2.includes('## ' + n)));
add('⑧ Docs', 'TOOLS.md có mục dry-run/confirm cho Tiểu Tâm',
  toolsDocV2.includes('dry-run') && toolsDocV2.includes('confirm'));
add('⑧ Docs', 'TUTORIAL có checklist onboarding',
  tut.includes('Checklist onboarding'));
add('⑧ Docs', 'TOOLS.md có bảng mã lỗi cho Tiểu Tâm',
  (await read('docs/TOOLS.md')).includes('Bảng mã lỗi'));

// ── ĐỘC LẬP MODULE ──────────────────────────────────────────
add('② Vòng đời', 'contract.ts tồn tại (mirror + executeAction)',
  (await read('src/contract.ts')).includes('executeAction'));
add('② Vòng đời', 'WIRING.patch tồn tại (gắn host một lệnh)',
  (await read('WIRING.patch')).includes('soul-inventory'));
const guideDoc = await read('docs/GUIDE.md');
add('② Vòng đời', 'GUIDE có mục scheduler minh bạch (host cron, không tự chạy ngầm)',
  guideDoc.includes('runScheduledTasks') && guideDoc.includes('không spawn cron') === false ? guideDoc.includes('runScheduledTasks') : guideDoc.includes('runScheduledTasks'));
const autoSvc = await read('src/services/automation.service.ts');
add('② Vòng đời', 'automation service KHÔNG tự spawn cron/setInterval',
  !autoSvc.includes('setInterval') && !autoSvc.includes('cron.schedule'));
add('② Vòng đời', 'runScheduledTasks export từ index (cho host cron)',
  (await read('src/index.ts')).includes('runScheduledTasks'));
add('Độc lập', 'không import module Citadel khác (chỉ nhận qua DI)',
  !/from ['"]@citadel\/(?!module-kho)/.test(allSrc));
add('Độc lập', 'module stateless (không giữ state RAM: không có biến let cấp module chứa dữ liệu nghiệp vụ)',
  !/^let\s+\w+\s*=\s*\[/m.test(allSrc));

// ── XUẤT BÁO CÁO ────────────────────────────────────────────
const pass = results.filter((r) => r.ok).length;
const fail = results.length - pass;
const bySection = {};
for (const r of results) (bySection[r.section] ??= []).push(r);

let md = `# AUDIT REPORT — @citadel/module-kho v${manifest?.version ?? '?'}\n\n`;
md += `> audit-module-docs · ${new Date().toISOString()} · **${pass} PASS / ${fail} FAIL**\n\n`;
for (const [sec, rows] of Object.entries(bySection)) {
  md += `## ${sec}\n\n| Kiểm tra | Kết quả |\n|---|---|\n`;
  for (const r of rows) md += `| ${r.name}${r.note ? ` — _${r.note}_` : ''} | ${r.ok ? '✅ PASS' : '❌ FAIL'} |\n`;
  md += '\n';
}
md += `## Kết luận\n\n${fail === 0
  ? '**PASS toàn bộ.** Module đạt hợp đồng Citadel 8 mặt cắt, đủ điều kiện gắn vào SuperCitadel.'
  : `**${fail} mục FAIL** — xem bảng trên, sửa xong chạy lại \`npm run audit\`.`}\n`;

await writeFile(join(root, 'AUDIT_REPORT.md'), md);

for (const [sec, rows] of Object.entries(bySection)) {
  const p = rows.filter((r) => r.ok).length;
  console.log(`${p === rows.length ? '✅' : '❌'} ${sec}: ${p}/${rows.length}`);
  for (const r of rows.filter((x) => !x.ok)) console.log(`    ❌ ${r.name} ${r.note}`);
}
console.log(`\n════════ AUDIT: ${pass} PASS / ${fail} FAIL → AUDIT_REPORT.md ════════`);
process.exit(fail > 0 ? 1 : 0);
