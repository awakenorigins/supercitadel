// audit-buttons.mts — V7A P1 (G10): quét apps/web tìm nút "chết"
// Nút chết = <button> không có onClick/type=submit, onClick rỗng, hoặc TODO/placeholder.
// Chạy: pnpm tsx scripts/audit-buttons.mts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const WEB = join(ROOT, 'apps/web');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    if (['node_modules', '.next', 'dist'].includes(f)) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(tsx|ts|jsx)$/.test(f)) out.push(p);
  }
  return out;
}

interface Issue { file: string; line: number; kind: string; snippet: string; }
const issues: Issue[] = [];

for (const file of walk(WEB)) {
  const src = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);
  const lines = src.split('\n');

  lines.forEach((ln, i) => {
    const lineNo = i + 1;
    const snippet = ln.trim().slice(0, 120);
    // 1) onClick rỗng hoặc no-op
    if (/onClick=\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/.test(ln) || /onClick=\{\s*\(\s*\)\s*=>\s*(undefined|null|void 0)\s*\}/.test(ln))
      issues.push({ file: rel, line: lineNo, kind: 'onClick rỗng (no-op)', snippet });
    // 2) TODO/FIXME/placeholder cạnh handler
    if (/(onClick|onSubmit).*(TODO|FIXME|placeholder handler)/i.test(ln))
      issues.push({ file: rel, line: lineNo, kind: 'handler TODO/placeholder', snippet });
    // 3) href="#" — link chết
    if (/href="#"/.test(ln))
      issues.push({ file: rel, line: lineNo, kind: 'href="#" link chết', snippet });
    // 4) alert('coming soon') / chưa hỗ trợ dạng stub
    if (/onClick=\{[^}]*alert\(['"`][^'"`]*(coming|soon|chưa|sắp)[^'"`]*['"`]\)/i.test(ln))
      issues.push({ file: rel, line: lineNo, kind: 'onClick alert stub', snippet });
  });

  // 5) <button ...> nhiều dòng KHÔNG có onClick / type="submit" / disabled trong tag
  const btnRe = /<button\b[^>]*>/gs;
  let m: RegExpExecArray | null;
  while ((m = btnRe.exec(src))) {
    const tag = m[0];
    if (!/onClick|type="submit"|type='submit'|form=/.test(tag)) {
      const lineNo = src.slice(0, m.index).split('\n').length;
      issues.push({ file: rel, line: lineNo, kind: '<button> không có handler', snippet: tag.replace(/\s+/g, ' ').slice(0, 120) });
    }
  }
}

if (issues.length === 0) {
  console.log('[audit-buttons] ✓ 0 nút chết — 100% nút apps/web có handler thật');
} else {
  console.log(`[audit-buttons] ✗ ${issues.length} vấn đề:`);
  for (const i of issues) console.log(`  ${i.file}:${i.line} — ${i.kind}\n    ${i.snippet}`);
  process.exitCode = 1;
}
