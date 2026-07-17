/**
 * QLDN V1A — SMOKE TEST PGlite (Postgres-in-WASM), chạy trong `pnpm -r test`
 * không cần Postgres ngoài. Kiểm: migration 17 bảng, seed, CRUD, tenant isolation.
 * Chạy: npx tsx server/qldn.pglite.test.ts
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import {
  listPeriods, createPeriod, closePeriod,
  createPolicyParams, effectivePolicyParams,
  listEmployees, createEmployee, updateEmployee,
} from './service.js';
import { seedQldnDefaults } from './seed.js';

let passed = 0, failed = 0;
function check(cond: boolean, name: string, extra?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const pg = new PGlite();
  const sql = readFileSync(join(here, '..', 'migrations', '0000_init.sql'), 'utf8');
  await pg.exec(sql);
  // Migration idempotent: chạy lại lần 2 không được nổ
  await pg.exec(sql);
  const db = drizzle(pg) as any;

  console.log('=== PGLITE QLDN: migration + kiểm bảng ===');
  const tables = await pg.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='qldn' ORDER BY table_name`,
  );
  check(tables.rows.length === 17, 'Schema qldn đủ 17 bảng', `có ${tables.rows.length}`);

  const orgA = randomUUID();
  const orgB = randomUUID();

  console.log('=== PGLITE QLDN: seed defaults ===');
  const seeded = await seedQldnDefaults(db, orgA, { today: new Date('2026-06-15T00:00:00Z') });
  check(seeded.periodCode === '2026-06', 'Seed kỳ 2026-06', seeded.periodCode);
  const pol = await effectivePolicyParams(db, orgA, '2026-06-30');
  check(!!pol && pol.insCompanyBp === 2150 && pol.insEmployeeBp === 1050, 'Policy hiệu lực: BH cty 21.5% / NLĐ 10.5%');
  check(Array.isArray(pol.pitBrackets) && pol.pitBrackets.length === 7, 'Biểu thuế 7 bậc seed đúng');

  console.log('=== PGLITE QLDN: periods ===');
  const p07 = await createPeriod(db, orgA, { code: '2026-07' });
  check(p07.name === 'Tháng 07/2026', 'Tạo kỳ 2026-07 auto-name', p07.name);
  let dupErr = '';
  try { await createPeriod(db, orgA, { code: '2026-07' }); } catch (e: any) { dupErr = e.message; }
  check(dupErr.includes('đã tồn tại'), 'Chặn kỳ trùng code');
  const closed = await closePeriod(db, orgA, p07.id);
  check(closed.status === 'closed', 'Khóa kỳ 2026-07');

  console.log('=== PGLITE QLDN: policy versioning ===');
  await createPolicyParams(db, orgA, { effectiveFrom: '2026-07-01', deductionPersonal: '20000000' });
  const polJun = await effectivePolicyParams(db, orgA, '2026-06-30');
  const polJul = await effectivePolicyParams(db, orgA, '2026-07-15');
  check(String(polJun.deductionPersonal) === '15500000.00', 'T06 dùng giảm trừ 15.5tr (bản cũ)', String(polJun.deductionPersonal));
  check(String(polJul.deductionPersonal) === '20000000.00', 'T07 dùng giảm trừ 20tr (bản mới)', String(polJul.deductionPersonal));

  console.log('=== PGLITE QLDN: employees ===');
  const e1 = await createEmployee(db, orgA, {
    fullName: 'Nguyễn Văn A', codeOfficial: 'NV001', codeInternal: 'JPKD001',
    contractType: 'HDLD', dependentsCount: 2, bhxhEnrolled: true,
    bankAccount: '0071000123456', bankName: 'Vietcombank',
  });
  check(e1.codeOfficial === 'NV001' && e1.dependentsCount === 2, 'Tạo NV mã kép NV001/JPKD001');
  const e1u = await updateEmployee(db, orgA, e1.id, { position: 'Kế toán trưởng', contractType: 'HDTV' });
  check(e1u.position === 'Kế toán trưởng' && e1u.contractType === 'HDTV', 'Update NV: position + HĐTV');
  let valErr = '';
  try { await createEmployee(db, orgA, { fullName: '' }); } catch (e: any) { valErr = e.message; }
  check(valErr.includes('fullName'), 'Validate fullName bắt buộc');

  console.log('=== PGLITE QLDN: tenant isolation ===');
  await createEmployee(db, orgB, { fullName: 'Trần Thị B', codeOfficial: 'NV001' });
  const listA = await listEmployees(db, orgA);
  const listB = await listEmployees(db, orgB);
  check(listA.length === 1 && listA[0].fullName === 'Nguyễn Văn A', 'Org A chỉ thấy NV của A');
  check(listB.length === 1 && listB[0].fullName === 'Trần Thị B', 'Org B chỉ thấy NV của B');
  check((await listPeriods(db, orgB)).length === 0, 'Org B không thấy kỳ của org A');
  // Cùng code NV001 ở 2 org khác nhau phải được (unique theo org)
  check(listA[0].codeOfficial === 'NV001' && listB[0].codeOfficial === 'NV001', 'Unique code_official theo org (2 org cùng NV001 OK)');
  let updErr = '';
  try { await updateEmployee(db, orgB, e1.id, { fullName: 'Hack' }); } catch (e: any) { updErr = e.message; }
  check(updErr.includes('Không tìm thấy'), 'Org B không update được NV org A');

  console.log(`\n   KẾT QUẢ PGLITE QLDN: ${passed} PASS, ${failed} FAIL`);
  await pg.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('[PGLITE-QLDN]', e); process.exit(1); });
