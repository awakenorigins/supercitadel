/**
 * audit-module-docs — Audit tự động hợp đồng Citadel 8 mặt cắt cho Soul-Manager.
 * Chạy: npm run audit  →  in bảng PASS/FAIL + ghi AUDIT_REPORT.md
 * Exit code 1 nếu có bất kỳ FAIL nào (dùng được trong CI gate).
 */
import { readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const add = (section, name, ok, note = '') => results.push({ section, name, ok, note });
const exists = async (p) => access(join(root, p)).then(() => true).catch(() => false);
const read = (p) => readFile(join(root, p), 'utf8');

// ── ① MANIFEST + STORE ──────────────────────────────────────
let manifest = null;
try {
  manifest = JSON.parse(await read('manifest.json'));
  add('① Manifest', 'manifest.json parse được', true);
} catch (e) { add('① Manifest', 'manifest.json parse được', false, String(e)); }

if (manifest) {
  for (const f of ['id', 'name', 'version', 'description', 'dependencies', 'conflicts',
    'permissions', 'tools', 'intents', 'routes', 'menu', 'docs', 'hooks', 'store']) {
    add('① Manifest', `có trường "${f}"`, manifest[f] !== undefined);
  }
  add('① Manifest', 'id = soul-manager', manifest.id === 'soul-manager');
  add('① Manifest', 'version đúng semver', /^\d+\.\d+\.\d+$/.test(manifest.version ?? ''));
  add('① Manifest', 'conflicts khai module hr cũ', (manifest.conflicts ?? []).includes('hr'));
  add('① Manifest', `khai ≥8 tools (thực tế ${manifest.tools?.length ?? 0})`, (manifest.tools?.length ?? 0) >= 8);
  const kinds = new Set((manifest.tools ?? []).map((t) => t.kind));
  add('① Manifest', 'tools tách 2 lớp tool + action', kinds.has('tool') && kinds.has('action'));
  for (const t of manifest.tools ?? []) {
    add('① Manifest', `tool ${t.name}: đủ kind/permission/inputSchema/docs`,
      Boolean(t.kind && t.permission && t.inputSchema && t.docs));
  }
  add('① Manifest', `routes ≥ 15 (thực tế ${manifest.routes?.length ?? 0})`, (manifest.routes?.length ?? 0) >= 15);
  const store = manifest.store ?? {};
  add('① Store', 'store listed = true, category module', store.listed === true && store.category === 'module');
  add('① Store', 'giá MUA 1.800 Ôm',
    store.pricing?.currency === 'om' && store.pricing?.buy?.price === 1800,
    `buy=${store.pricing?.buy?.price} ${store.pricing?.currency}`);
  add('① Store', 'giá THUÊ 250 Ôm / 30 ngày',
    store.pricing?.rent?.price === 250 && store.pricing?.rent?.period_days === 30);
  add('① Store', 'trial_days = 7', store.trial_days === 7);
  add('① Store', 'tagline + ≥3 highlights',
    typeof store.tagline === 'string' && (store.highlights?.length ?? 0) >= 3);
}

// ── ② VÒNG ĐỜI ──────────────────────────────────────────────
const indexSrc = await read('src/index.ts');
for (const hook of ['onInstall', 'onActivate', 'onDisable', 'onRemove']) {
  add('② Vòng đời', `hook ${hook} tồn tại`, indexSrc.includes(`export async function ${hook}`));
}
add('② Vòng đời', 'onDisable thu hồi đăng ký (unregisterModule)', indexSrc.includes('unregisterModule'));
add('② Vòng đời', 'onRemove KHÔNG drop dữ liệu mặc định (dropData opt-in)', indexSrc.includes('dropData'));
add('② Vòng đời', 'onInstall chạy đủ 3 migrations',
  indexSrc.includes('0000_init.sql') && indexSrc.includes('0001_rls.sql') && indexSrc.includes('0002_backfill_legacy.sql'));

// ── ③ NGÔN NGỮ QUYỀN ────────────────────────────────────────
if (manifest) {
  const permIds = new Set((manifest.permissions ?? []).map((p) => typeof p === 'string' ? p : p.id));
  for (const p of permIds) {
    add('③ Quyền', `"${p}" đúng cú pháp hr.resource.action`, /^hr\.[a-z_]+\.[a-z_]+$/.test(p));
  }
  for (const t of manifest.tools ?? []) {
    add('③ Quyền', `tool ${t.name} dùng quyền đã khai (${t.permission})`, permIds.has(t.permission));
  }
  for (const r of manifest.routes ?? []) {
    add('③ Quyền', `route ${r.method} ${r.path} dùng quyền đã khai`, permIds.has(r.permission));
  }
  add('③ Quyền', 'mọi permission có description',
    (manifest.permissions ?? []).every((p) => typeof p === 'object' && p.description));
}

// ── ④ DỮ LIỆU MỘT KHUÔN + RLS FAIL-CLOSED ───────────────────
const ddl = await read('migrations/0000_init.sql');
const rls = await read('migrations/0001_rls.sql');
const tables = [...ddl.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
add('④ Dữ liệu', `18 bảng khai trong 0000 (thực tế ${tables.length})`, tables.length === 18);
for (const t of tables) {
  const block = ddl.split(`CREATE TABLE IF NOT EXISTS ${t}`)[1]?.split(');')[0] ?? '';
  add('④ Dữ liệu', `${t}: org_id uuid NOT NULL`, /org_id uuid NOT NULL/.test(block));
  add('④ Dữ liệu', `${t}: timestamps đầy đủ`, block.includes('created_at') && block.includes('updated_at'));
  add('④ Dữ liệu', `${t}: có index org`, new RegExp(`ON ${t} \\(org_id`).test(ddl));
  add('④ RLS', `${t}: FORCE ROW LEVEL SECURITY`, rls.includes(`ALTER TABLE ${t} FORCE ROW LEVEL SECURITY`));
  add('④ RLS', `${t}: policy tenant_isolation USING + WITH CHECK`,
    new RegExp(`CREATE POLICY tenant_isolation ON ${t}[\\s\\S]*?USING \\(org_id = current_setting[\\s\\S]*?WITH CHECK \\(org_id = current_setting`).test(rls));
}
const rlsCode = rls.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
add('④ RLS', 'FAIL-CLOSED: policy 0001 KHÔNG có coalesce fallback (code thật, bỏ comment)', !/coalesce/i.test(rlsCode));
add('④ Dữ liệu', 'tiền/lương dùng numeric trong DDL', /numeric\(15,2\)/.test(ddl));
const schemaSrc = await read('src/db/schema.ts');
for (const t of tables) {
  add('④ Schema', `Drizzle mirror bảng ${t}`, schemaSrc.includes(`pgTable('${t}'`));
}
add('④ Backfill', '0002 idempotent (NOT EXISTS + to_regclass)',
  (await read('migrations/0002_backfill_legacy.sql')).includes('to_regclass')
  && (await read('migrations/0002_backfill_legacy.sql')).includes('NOT EXISTS'));

// ── ⑤ EVENT BUS, KHÔNG CROSS-IMPORT ─────────────────────────
const srcFiles = ['src/index.ts', 'src/types.ts', 'src/money.ts', 'src/config.ts',
  'src/intents.ts', 'src/routes.ts', 'src/db/schema.ts', 'src/validation/schemas.ts',
  'src/tools/index.ts',
  'src/services/org.service.ts', 'src/services/defaults.service.ts',
  'src/services/employee.service.ts', 'src/services/attendance.service.ts',
  'src/services/leave.service.ts', 'src/services/payroll.service.ts',
  'src/services/report.service.ts', 'src/services/recruitment.service.ts',
  'src/services/training.service.ts'];
let allSrc = '';
for (const f of srcFiles) {
  const s = await read(f);
  allSrc += s;
  add('⑤ Event', `${f}: không import module khác`,
    !/@citadel\/module-(?!soul-manager)/.test(s) && !/from '\.\.\/\.\.\//.test(s));
}
const emits = [...allSrc.matchAll(/bus\.emit\('([^']+)'/g)].map((m) => m[1]);
add('⑤ Event', `mọi event tên hr.* (${emits.length} lời gọi)`, emits.length > 0 && emits.every((e) => e.startsWith('hr.')));
const emitBlocks = allSrc.split('bus.emit(').slice(1);
add('⑤ Event', '100% payload emit mang org_id', emitBlocks.every((b) => b.slice(0, 200).includes('org_id')));
add('⑤ Event', 'EventBus type ép payload có org_id', (await read('src/types.ts')).includes('org_id: string'));

// ── ⑥ TOOL CHUẨN ────────────────────────────────────────────
const toolsSrc = await read('src/tools/index.ts');
const toolNames = [...toolsSrc.matchAll(/name: '(hr\.[a-z_.]+)'/g)].map((m) => m[1]);
add('⑥ Tool', `18 tool định nghĩa trong code (thực tế ${toolNames.length})`, toolNames.length === 18);
if (manifest) {
  const manifestNames = new Set((manifest.tools ?? []).map((t) => t.name));
  for (const n of toolNames) add('⑥ Tool', `${n} khai trong manifest`, manifestNames.has(n));
  add('⑥ Tool', 'manifest không khai tool ma (code đủ)',
    [...manifestNames].every((n) => toolNames.includes(n)));
}
add('⑥ Tool', 'read/write tách lớp (hrReadTools + hrWriteActions)',
  toolsSrc.includes('hrReadTools') && toolsSrc.includes('hrWriteActions'));
add('⑥ Tool', 'mỗi tool có description cho Tiểu Tâm',
  (toolsSrc.match(/description:/g) ?? []).length >= 18);

// ── ⑦ BIÊN GIỚI CANH GÁC ────────────────────────────────────
add('⑦ Biên', 'Zod schemas tồn tại', await exists('src/validation/schemas.ts'));
add('⑦ Biên', 'handler parse tại biên (.parse(rawInput))', toolsSrc.includes('.parse(rawInput)'));
add('⑦ Biên', 'routes bind qua tool.handler (kế thừa Zod)',
  (await read('src/routes.ts')).includes('tool.handler(ctx, def.mapInput(req))'));
add('⑦ Biên', 'HrError có code máy đọc + details',
  (await read('src/types.ts')).includes('public code:') && (await read('src/types.ts')).includes('details?'));
const moneySrc = await read('src/money.ts');
const moneyCode = moneySrc.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
add('⑦ Biên', 'money.ts không dùng parseFloat/Number() cho tiền (code thật, bỏ comment)',
  !/(parseFloat|Number\()/.test(moneyCode));

// ── ⑧ TỰ TÀI LIỆU (giáo trình Tiểu Tâm) ─────────────────────
const docFiles = ['README.md', 'CHANGELOG.md', 'docs/GUIDE.md', 'docs/TUTORIAL.md', 'docs/TOOLS.md', 'docs/EVENTS.md'];
for (const f of docFiles) add('⑧ Docs', `${f} tồn tại`, await exists(f));
const tutorial = await read('docs/TUTORIAL.md');
const baiCount = (tutorial.match(/^## Bài /gm) ?? []).length;
add('⑧ Docs', `TUTORIAL ≥8 bài (thực tế ${baiCount})`, baiCount >= 8);
add('⑧ Docs', 'TUTORIAL có checklist onboarding', /checklist/i.test(tutorial));
add('⑧ Docs', 'TUTORIAL có kịch bản Tiểu Tâm dẫn tour', tutorial.includes('dẫn tour'));
const toolsDoc = await read('docs/TOOLS.md');
add('⑧ Docs', 'TOOLS có bảng tra nhanh "nói gì → gọi gì"', toolsDoc.includes('người dùng nói gì → gọi gì'));
add('⑧ Docs', 'TOOLS có bảng mã lỗi → cách phản hồi', toolsDoc.includes('Bảng mã lỗi'));
const dialogCount = (toolsDoc.match(/\*\*Người dùng:\*\*/g) ?? []).length;
add('⑧ Docs', `TOOLS ≥10 hội thoại mẫu tiếng Việt (thực tế ${dialogCount})`, dialogCount >= 10);
if (manifest) {
  for (const t of manifest.tools ?? []) {
    add('⑧ Docs', `TOOLS có mục ${t.name}`, toolsDoc.includes(`## ${t.name}`));
  }
}
const typesSrc = await read('src/types.ts');
const codeBlock = typesSrc.split('HrErrorCode =')[1]?.split(';')[0] ?? '';
const errCodes = [...codeBlock.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
for (const c of errCodes) {
  add('⑧ Docs', `mã lỗi ${c} có trong bảng TOOLS.md`, toolsDoc.includes(`\`${c}\``));
}
const guide = await read('docs/GUIDE.md');
add('⑧ Docs', 'GUIDE khai số pháp lý "cấu hình được"', guide.includes('cấu hình được') || guide.includes('CẤU HÌNH ĐƯỢC'));
add('⑧ Docs', 'GUIDE có giảm trừ 15,5tr + biểu 5 bậc + trần 07/2026',
  guide.includes('15.500.000') && guide.includes('5 bậc') && guide.includes('2.530.000'));
add('⑧ Docs', 'GUIDE có ví dụ tính lương cụ thể (20tr → net 17.780.000)',
  guide.includes('17.780.000') && guide.includes('26.592.500'));
add('⑧ Docs', 'GUIDE nhắc vận hành role non-superuser', guide.includes('superuser'));

// ── TEST HIỆN DIỆN ──────────────────────────────────────────
add('✚ Test', 'tests/payroll.test.ts tồn tại', await exists('tests/payroll.test.ts'));
add('✚ Test', 'tests/smoke.test.ts tồn tại (PGlite + role non-superuser)',
  (await read('tests/smoke.test.ts')).includes('citadel_app'));
add('✚ Test', 'smoke test có fail-closed check (quên set org)',
  (await read('tests/smoke.test.ts')).includes('fail-closed') || (await read('tests/smoke.test.ts')).includes('Quên SET org'));

// ── XUẤT BÁO CÁO ────────────────────────────────────────────
const pass = results.filter((r) => r.ok).length;
const fail = results.length - pass;
let md = `# AUDIT_REPORT — Soul-Manager v${manifest?.version ?? '?'}\n\n`;
md += `Hợp đồng Citadel 8 mặt cắt · ${new Date().toISOString().slice(0, 10)}\n\n`;
md += `**KẾT QUẢ: ${pass}/${results.length} PASS${fail ? ` — ${fail} FAIL ❌` : ' ✅'}**\n\n`;
let cur = '';
for (const r of results) {
  if (r.section !== cur) { cur = r.section; md += `\n## ${cur}\n\n| Kiểm tra | Kết quả |\n|---|---|\n`; }
  md += `| ${r.name} | ${r.ok ? '✅ PASS' : `❌ FAIL ${r.note}`} |\n`;
}
await writeFile(join(root, 'AUDIT_REPORT.md'), md);

for (const r of results.filter((x) => !x.ok)) console.log(`❌ [${r.section}] ${r.name} ${r.note}`);
console.log(`\n══ AUDIT: ${pass}/${results.length} PASS${fail ? ` — ${fail} FAIL` : ''} ══`);
if (fail > 0) process.exit(1);
