/**
 * QLDN V1A — F2 TEST: import nhân sự từ 2 file Excel Joli Poli THẬT (fixtures).
 * Kiểm: parse đúng số NV, merge mã kép theo tên, salary profiles gộp 2 hệ,
 * all-or-nothing, tenant isolation.
 * Chạy: npx tsx server/qldn.import.test.ts
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { parseOfficialWorkbook, parseInternalWorkbook, importEmployees, normalizeName, excelDateToIso } from './import.js';
import { listEmployees, effectiveSalaryProfile } from './service.js';

let passed = 0, failed = 0;
function check(cond: boolean, name: string, extra?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const fx = (f: string) => readFileSync(join(here, '..', 'tests', 'fixtures', f));

  console.log('=== F2: unit helpers ===');
  check(normalizeName('Nguyễn Thị Châu  Loan ') === 'nguyen thi chau loan', 'normalizeName bỏ dấu + gộp space');
  check(normalizeName('Ỳ Khố Lệ') === 'y kho le', 'normalizeName chữ hiếm Ỳ/Khố');
  check(excelDateToIso(45149) === '2023-08-11', 'excelDateToIso serial 45149', String(excelDateToIso(45149)));

  console.log('=== F2: parse file CHÍNH THỨC (Bảng thông tin) ===');
  const official = parseOfficialWorkbook(fx('bang-luong-t06.xlsx'));
  check(official.length === 40, 'Parse đúng 40 NV hệ chính thức', String(official.length));
  const thu = official.find((o) => o.codeOfficial === 'QL001');
  check(!!thu && thu.fullName === 'Phạm Đăng Anh Thư' && thu.bhxhSalary === 18000000 && thu.baseSalary === 15000000, 'QL001: BHXH 18tr + CB 15tr');
  check(thu!.allowResponsibility === 3000000 && thu!.allowMeal === 2600000 && thu!.allowPhone === 4000000 && thu!.allowUniform === 400000, 'QL001: 4 phụ cấp đúng số Excel');
  const hdtvCount = official.filter((o) => o.contractType === 'HDTV').length;
  check(hdtvCount > 0, `Nhận diện HĐTV (${hdtvCount} NV)`);

  console.log('=== F2: parse file NỘI BỘ (NHÂN SỰ .xls legacy) ===');
  const internal = parseInternalWorkbook(fx('luongnb-t06.xls'));
  check(internal.length === 69, 'Parse đúng 69 NV hệ nội bộ (.xls đọc OK)', String(internal.length));
  const loan = internal.find((i) => normalizeName(i.fullName) === 'nguyen thi chau loan');
  check(!!loan && loan.baseSalaryInternal === 15000000 && loan.allowResponsibility === 5000000, 'Châu Loan: lương NB 15tr + PC trách nhiệm 5tr');
  check(loan!.bankAccount === '791305596979' && loan!.bankName === 'MB', 'Châu Loan: STK MB từ file nội bộ');

  console.log('=== F2: import merge vào DB (PGlite) ===');
  const pg = new PGlite();
  await pg.exec(readFileSync(join(here, '..', 'migrations', '0000_init.sql'), 'utf8'));
  const db = drizzle(pg) as any;
  const orgA = randomUUID();
  const orgB = randomUUID();

  const res = await importEmployees(db, orgA, { official, internal, effectiveFrom: '2026-06-01' });
  check(res.created + res.updated >= 40, `Ghi ${res.created} created / ${res.updated} updated`);
  check(res.matchedInternal > 0, `Merge theo tên khớp ${res.matchedInternal} NV 2 hệ`);
  check(res.profilesCreated === res.employees.length, `Salary profiles đủ ${res.profilesCreated} bản`);
  console.log(`    → matched ${res.matchedInternal}, unmatched nội bộ: ${res.unmatchedInternal.length}`);

  const all = await listEmployees(db, orgA);
  check(all.length === res.employees.length, `DB có ${all.length} NV (khớp result)`);
  const loanDb = all.find((e: any) => normalizeName(e.fullName) === 'nguyen thi chau loan');
  check(!!loanDb && loanDb.codeOfficial === 'NV001' && !!loanDb.codeInternal, 'Châu Loan: MÃ KÉP official NV001 + internal điền từ merge', `${loanDb?.codeOfficial}/${loanDb?.codeInternal}`);
  check(loanDb.bankAccount === '791305596979', 'Châu Loan: STK sync vào employees');

  const prof = await effectiveSalaryProfile(db, orgA, loanDb.id, '2026-06-30');
  check(!!prof && String(prof.bhxhSalary) === '8500000.00' && String(prof.baseSalary) === '7500000.00', 'Profile: lương BHXH 8.5tr + CB 7.5tr (hệ chính thức)', `${prof?.bhxhSalary}/${prof?.baseSalary}`);
  check(String(prof.baseSalaryInternal) === '15000000.00', 'Profile: lương nội bộ 15tr (hệ NB) — gộp 2 hệ trong 1 bản', String(prof?.baseSalaryInternal));

  console.log('=== F2: idempotency + isolation ===');
  const res2 = await importEmployees(db, orgA, { official, internal, effectiveFrom: '2026-07-01' });
  check(res2.created === 0 || res2.updated >= 40, 'Import lại = update, không nhân đôi NV', `c${res2.created}/u${res2.updated}`);
  const all2 = await listEmployees(db, orgA);
  check(all2.length === all.length, 'Số NV không đổi sau import lần 2', String(all2.length));
  const profJul = await effectiveSalaryProfile(db, orgA, loanDb.id, '2026-07-15');
  check(String(profJul.effectiveFrom) === '2026-07-01', 'Profile mới version 2026-07-01 (version hóa đúng)');

  check((await listEmployees(db, orgB)).length === 0, 'Org B không thấy dữ liệu org A');

  console.log('=== F2: all-or-nothing ===');
  const badOfficial = [...official];
  badOfficial[5] = { ...badOfficial[5], codeOfficial: badOfficial[0].codeOfficial }; // trùng mã
  let err = '';
  try { await importEmployees(db, orgB, { official: badOfficial, internal: [], effectiveFrom: '2026-06-01' }); } catch (e: any) { err = e.message; }
  check(err.includes('trùng lặp'), 'File có mã trùng → reject toàn bộ');
  check((await listEmployees(db, orgB)).length === 0, 'Org B vẫn sạch sau import lỗi (không ghi gì)');

  console.log(`\n   KẾT QUẢ F2 IMPORT: ${passed} PASS, ${failed} FAIL`);
  await pg.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('[F2-IMPORT]', e); process.exit(1); });
