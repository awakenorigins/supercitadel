// audit-module-docs.mts — V7A P4 (G6, quy chuẩn ⑧): gate tài liệu module.
// Mọi module PHẢI có: manifest.docs → file GUIDE.md tồn tại → đủ các mục bắt buộc.
// Thiếu bất kỳ điều nào → exit 1 (dùng làm CI gate).
// Chạy: pnpm tsx scripts/audit-module-docs.mts
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const MODULES = join(ROOT, 'modules');

const REQUIRED_SECTIONS = ['Giới thiệu', 'Chức năng', 'Hướng dẫn sử dụng', 'Ví dụ', 'Changelog'];

const moduleIds = readdirSync(MODULES).filter((f) => statSync(join(MODULES, f)).isDirectory());
let fails = 0;
let passes = 0;

for (const id of moduleIds.sort()) {
  const errs: string[] = [];
  const manifestPath = join(MODULES, id, 'manifest.json');
  if (!existsSync(manifestPath)) { console.log(`✗ ${id}: thiếu manifest.json`); fails++; continue; }
  let manifest: any;
  try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); }
  catch { console.log(`✗ ${id}: manifest.json không parse được`); fails++; continue; }

  if (typeof manifest.docs !== 'string' || !manifest.docs) errs.push('manifest thiếu trường "docs"');
  const docPath = join(MODULES, id, manifest.docs ?? 'docs/GUIDE.md');
  if (!existsSync(docPath)) errs.push(`file docs không tồn tại: ${manifest.docs}`);
  else {
    const md = readFileSync(docPath, 'utf8');
    if (!/^#\s+.+/m.test(md)) errs.push('thiếu tiêu đề H1 (# Tên module)');
    for (const s of REQUIRED_SECTIONS) {
      if (!new RegExp(`^##\\s+${s}`, 'm').test(md)) errs.push(`thiếu mục "## ${s}"`);
    }
    // Chức năng phải là bảng có cột Endpoint (giáo trình đúng theo code thật)
    const funcSection = md.match(/##\s+Chức năng\s*\n([\s\S]*?)(?=\n##\s|$)/)?.[1] ?? '';
    if (!/\|\s*Endpoint\s*\|/i.test(funcSection)) errs.push('mục Chức năng thiếu bảng có cột Endpoint');
    // Ví dụ phải có tối thiểu 2 tình huống hỏi Tiểu Tâm (dạng **"câu hỏi"** → hành động)
    const exSection = md.match(/##\s+Ví dụ[\s\S]*?(?=\n##\s|$)/)?.[0] ?? '';
    const exCount = [...exSection.matchAll(/-\s+\*\*.+?\*\*\s*→/g)].length;
    if (exCount < 2) errs.push(`mục Ví dụ cần ≥ 2 tình huống hỏi Tiểu Tâm (hiện ${exCount})`);
  }

  if (errs.length) {
    fails++;
    console.log(`✗ ${id}:`);
    for (const e of errs) console.log(`    - ${e}`);
  } else {
    passes++;
    console.log(`✓ ${id}: giáo trình đầy đủ (${manifest.docs})`);
  }
}

console.log(`\n[audit-module-docs] ${passes}/${moduleIds.length} module PASS`);
if (fails > 0) { console.error(`[audit-module-docs] FAIL — ${fails} module thiếu giáo trình chuẩn`); process.exit(1); }
console.log('[audit-module-docs] PASS — mọi module có giáo trình chuẩn quy chuẩn ⑧');
