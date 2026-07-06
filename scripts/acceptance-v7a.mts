// acceptance-v7a.mts — NGHIỆM THU CUỐI V7A (PLAN-V7A.md mục 6 — 9 chuẩn §09 spec v5.1)
// Chạy 9 chuẩn tự động tối đa, mỗi chuẩn PASS/FAIL/MANUAL kèm bằng chứng từ lệnh chạy THẬT.
// Exit 0 khi mọi chuẩn automated PASS. Chuẩn có phần không automate nổi → ghi chú MANUAL kèm hướng dẫn.
//
// Chạy:  cd services/api && pnpm exec tsx ../../scripts/acceptance-v7a.mts
// Chỉ secret scan (CI gate):  ... acceptance-v7a.mts --secret-only
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const API_DIR = join(ROOT, 'services/api');

// ── runner: chạy lệnh thật, cache theo key (1 bài test phục vụ nhiều chuẩn chỉ chạy 1 lần) ──
interface RunResult { ok: boolean; checks: number; tail: string; }
const cache = new Map<string, RunResult>();
function run(key: string, args: string[], cwd = API_DIR): RunResult {
  if (cache.has(key)) return cache.get(key)!;
  process.stdout.write(`  … chạy ${key} `);
  const t0 = Date.now();
  const r = spawnSync('pnpm', ['exec', 'tsx', ...args], { cwd, encoding: 'utf8', timeout: 300_000 });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  const checks = (out.match(/✓/g) ?? []).length;
  const lines = out.trim().split('\n').filter((l) => l.trim());
  const res: RunResult = { ok: r.status === 0, checks, tail: lines.at(-1) ?? '(no output)' };
  console.log(`(${((Date.now() - t0) / 1000).toFixed(1)}s, exit ${r.status}, ${checks} ✓)`);
  cache.set(key, res);
  return res;
}

// ── Chuẩn #9: secret scan trên source (tự chứa, không cần grep ngoài) ──
const SECRET_PATTERNS: [string, RegExp][] = [
  ['OpenAI key', /sk-[A-Za-z0-9]{8,}/],
  ['GitHub token', /ghp_[A-Za-z0-9]{10,}/],
  ['GitHub PAT', /github_pat_[A-Za-z0-9_]{10,}/],
  ['AWS key', /AKIA[0-9A-Z]{8,}/],
  ['Private key', /BEGIN[ A-Z]*PRIVATE KEY/],
  ['Hardcoded password', /password\s*=\s*['"][^'"]{4,}['"]/i],
];
const SCAN_EXT = /\.(ts|tsx|mts|js|mjs|cjs|sh|sql|ya?ml|json)$/;
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '.git', '.turbo']);
function scanSecrets(): { hits: { file: string; line: number; kind: string }[]; files: number } {
  const hits: { file: string; line: number; kind: string }[] = [];
  let files = 0;
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      if (SKIP_DIRS.has(f)) continue;
      const p = join(dir, f);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!SCAN_EXT.test(f)) continue;
      if (f === '.env.example' || /\.test\.ts$/.test(f) || f === 'pnpm-lock.yaml') continue; // fixtures/example được miễn
      files++;
      const src = readFileSync(p, 'utf8').split('\n');
      src.forEach((ln, i) => {
        for (const [kind, re] of SECRET_PATTERNS)
          if (re.test(ln)) hits.push({ file: relative(ROOT, p), line: i + 1, kind });
      });
    }
  };
  walk(ROOT);
  return { hits, files };
}

if (process.argv.includes('--secret-only')) {
  const { hits, files } = scanSecrets();
  if (hits.length) {
    console.error(`[secret-scan] ✗ ${hits.length} hit:`);
    hits.forEach((h) => console.error(`  ${h.file}:${h.line} — ${h.kind}`));
    process.exit(1);
  }
  console.log(`[secret-scan] ✓ 0 bí mật trong ${files} file source`);
  process.exit(0);
}

// ── 9 chuẩn ──
type Status = 'PASS' | 'FAIL' | 'MANUAL';
interface Criterion { n: number; name: string; status: Status; evidence: string; manualNote?: string; }
const results: Criterion[] = [];

console.log('════ NGHIỆM THU V7A — 9 chuẩn §09 ════\n');

// Các bài test nền (chạy 1 lần, dùng cho nhiều chuẩn)
console.log('[chạy các bài test nền]');
const p2 = run('v7a-p2 (swap model + energy/beta)', ['src/v7a-p2.test.ts']);
const p3 = run('v7a-p3 (item system + use effects)', ['src/v7a-p3.test.ts']);
const p4 = run('v7a-p4 (Excel + module docs)', ['src/v7a-p4.test.ts']);
const p6 = run('v7a-p6 (cross-org + token 30s + module off)', ['src/v7a-p6.test.ts']);
const btn = run('audit-buttons', ['../../scripts/audit-buttons.mts']);
const docs = run('audit-module-docs', ['../../scripts/audit-module-docs.mts']);
console.log('');

// 1. Đổi model AI → trí nhớ/nhân cách nhất quán
results.push({
  n: 1, name: 'Đổi model AI → trí nhớ/nhân cách nhất quán tuyệt đối',
  status: p2.ok ? 'PASS' : 'FAIL',
  evidence: p2.ok ? `v7a-p2.test.ts ${p2.checks} ✓ — swap stub-a→stub-b qua PATCH /engine, cùng bộ câu hỏi, fact + persona nhất quán` : p2.tail,
});

// 2. Cross-org mọi ngả → chặn + ghi vết
results.push({
  n: 2, name: 'Org A truy dữ liệu org B mọi ngả → chặn + ghi vết',
  status: p6.ok ? 'PASS' : 'FAIL',
  evidence: p6.ok ? `v7a-p6.test.ts — audit-logs/memories/kho vật phẩm/accounting export/JWT giả/?orgId đều chặn, audit ghi vết đủ` : p6.tail,
});

// 3. Vật phẩm xem info + use hiệu ứng thật
results.push({
  n: 3, name: 'Mọi vật phẩm xem được info; Sử dụng → hiệu ứng thật',
  status: p3.ok ? 'PASS' : 'FAIL',
  evidence: p3.ok ? `v7a-p3.test.ts ${p3.checks} ✓ — catalog info đầy đủ, food +energy đúng amount, recharge 100, decor đổi theme lưu bền` : p3.tail,
  manualNote: 'Bổ sung bằng mắt: mở /items → tap vật phẩm → Sử dụng → thấy toast + energy pill/theme đổi ngay.',
});

// 4. 100% nút và màn hình sống
results.push({
  n: 4, name: '100% nút và màn hình sống',
  status: btn.ok ? 'PASS' : 'FAIL',
  evidence: btn.ok ? btn.tail : btn.tail,
  manualNote: 'Bổ sung bằng mắt: next build 15/15 routes (đã verify P5); mở từng màn rà click.',
});

// 5. Token → dùng trong 30 giây + sensitive đòi lớp 2
results.push({
  n: 5, name: 'Token 13 ký tự → đặt tên → dùng trong 30 giây; nhạy cảm đòi lớp 2',
  status: p6.ok ? 'PASS' : 'FAIL',
  evidence: p6.ok ? `v7a-p6.test.ts — login→/me→topup đo thời gian thật <30s; chi Om >1000 lớp 1 → 403 tiếng Việt; bind email → lớp 2 → 200` : p6.tail,
});

// 6. Beta mode bật/tắt
results.push({
  n: 6, name: 'Beta mode: true không cạn; false hao/hồi/nhắc đúng',
  status: p2.ok ? 'PASS' : 'FAIL',
  evidence: p2.ok ? `v7a-p2.test.ts — BETA_MODE=false: hao -2/-5, kiệt sức từ chối việc nặng; BETA_MODE=true: không bao giờ cạn` : p2.tail,
});

// 7. M0 Kế Toán đủ + docs + Excel
const c7ok = p4.ok && docs.ok;
results.push({
  n: 7, name: 'M0 Kế Toán đủ chức năng + tài liệu + Tiểu Tâm vận hành + Excel',
  status: c7ok ? 'PASS' : 'FAIL',
  evidence: c7ok ? `v7a-p4.test.ts ${p4.checks} ✓ (export 4 .xlsx + JSON, import validate từng dòng, Tiểu Tâm trả lời từ docs thật) · ${docs.tail}` : `${p4.tail} · ${docs.tail}`,
});

// 8. Tạm tắt module → không gãy
results.push({
  n: 8, name: 'Tạm tắt module bất kỳ → không gãy, quyền thu hồi sạch',
  status: p6.ok ? 'PASS' : 'FAIL',
  evidence: p6.ok ? `v7a-p6.test.ts — deactivate accounting → mọi route 403 MODULE_INACTIVE (kể cả export); om/notifications/tieu-tam/store vẫn 200; activate lại data nguyên; audit ghi vết` : p6.tail,
});

// 9. Secret scan
const { hits, files } = scanSecrets();
results.push({
  n: 9, name: 'Rà mã nguồn → 0 bí mật trong code',
  status: hits.length === 0 ? 'PASS' : 'FAIL',
  evidence: hits.length === 0
    ? `secret-scan: 0 hit trên ${files} file source (regex sk-/ghp_/github_pat_/AKIA/PRIVATE KEY/password=; exclude .env.example, *.test.ts, node_modules)`
    : hits.map((h) => `${h.file}:${h.line} ${h.kind}`).join(' · '),
});

// ── báo cáo ──
console.log('┌────┬────────┬' + '─'.repeat(70));
for (const c of results.sort((a, b) => a.n - b.n)) {
  const icon = c.status === 'PASS' ? '✅' : c.status === 'MANUAL' ? '🖐' : '❌';
  console.log(`│ #${c.n} │ ${icon} ${c.status.padEnd(6)} │ ${c.name}`);
  console.log(`│    │        │   ↳ ${c.evidence}`);
  if (c.manualNote) console.log(`│    │        │   🖐 MANUAL bổ sung: ${c.manualNote}`);
}
console.log('└────┴────────┴' + '─'.repeat(70));

const fails = results.filter((r) => r.status === 'FAIL');
const passes = results.filter((r) => r.status === 'PASS').length;
console.log(`\n[acceptance-v7a] ${passes}/9 PASS · ${fails.length} FAIL · ${results.filter((r) => r.status === 'MANUAL').length} MANUAL`);
if (fails.length) { console.error('→ FAIL:', fails.map((f) => `#${f.n}`).join(', ')); process.exit(1); }
console.log('→ 9/9 chuẩn nghiệm thu §09 PASS — sẵn sàng release v7a.1.0 🦊');
