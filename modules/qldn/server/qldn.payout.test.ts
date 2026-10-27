/**
 * QLDN V1A — F6 TEST: payout batch UNC + payslip snapshot + CTV gross-up.
 * Golden CTV từ sheet "Bảng TT CTV" Excel thật:
 *  - Trần Kiều Ánh Ly (HĐDV): net 7.000.000 → gross 7.777.778 → PIT 777.778
 *  - Nguyễn Thị Duyên (HĐGC): net 65.600.000 → gross 72.888.889 → PIT 7.288.889
 * Full-flow: import NV + BCC thật → run OFFICIAL → calculate → approve →
 * payout batch (STK từ hồ sơ) → payslips bất biến.
 * Chạy: npx tsx server/qldn.payout.test.ts
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { parseOfficialWorkbook, parseInternalWorkbook, importEmployees } from './import.js';
import { parseOfficialBcc, importBcc } from './timesheet.js';
import { createPayrollRun, calculateRun, listRunLines } from './payroll.js';
import {
  grossUpFromNet, withholdFromGross, createContractorPayment, listContractorPayments,
  approveRun, createPayoutBatch, markBatchStatus, generatePayslips, getPayslip,
} from './payout.js';
import { createPolicyParams, listEmployees, updateEmployee } from './service.js';

let passed = 0, failed = 0;
function check(cond: boolean, name: string, extra?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const fx = (f: string) => readFileSync(join(here, '..', 'tests', 'fixtures', f));

  console.log('=== F6: CTV gross-up — golden từ Bảng TT CTV ===');
  const ly = grossUpFromNet(7_000_000);
  check(ly.gross === 7_777_778 && ly.pit === 777_778, 'Ánh Ly: net 7tr → gross 7.777.778 + PIT 777.778', JSON.stringify(ly));
  const duyen = grossUpFromNet(65_600_000);
  check(duyen.gross === 72_888_889 && duyen.pit === 7_288_889, 'Duyên: net 65.6tr → gross 72.888.889 + PIT 7.288.889', JSON.stringify(duyen));
  const wh = withholdFromGross(10_000_000);
  check(wh.pit === 1_000_000 && wh.net === 9_000_000, 'Chiều ngược: gross 10tr → PIT 1tr + net 9tr');

  const pg = new PGlite();
  await pg.exec(readFileSync(join(here, '..', 'migrations', '0000_init.sql'), 'utf8'));
  const db = drizzle(pg) as any;
  const orgA = randomUUID();
  const userId = randomUUID();

  console.log('=== F6: contractor payments (DB) ===');
  // Tạo kỳ qua policy + import trước
  const official = parseOfficialWorkbook(fx('bang-luong-t06.xlsx'));
  const internal = parseInternalWorkbook(fx('luongnb-t06.xls'));
  await importEmployees(db, orgA, { official, internal, effectiveFrom: '2026-06-01' });
  await createPolicyParams(db, orgA, { effectiveFrom: '2026-01-01', applyUnionFee: false, mealExemptCapMonthly: null });
  const bcc = parseOfficialBcc(fx('bang-luong-t06.xlsx'));
  await importBcc(db, orgA, bcc); // tự tạo kỳ 2026-06

  const cp1 = await createContractorPayment(db, orgA, {
    contractorName: 'Trần Kiều Ánh Ly', kind: 'ctv', netAmount: 7_000_000,
    taxCode: '52199014438', period: '2026-06',
  });
  check(String(cp1.grossAmount) === '7777778.00' && String(cp1.pitWithheld) === '777778.00', 'CTV DB: gross-up đúng từ net');
  const cp2 = await createContractorPayment(db, orgA, {
    contractorName: 'Xưởng may Minh Tâm', kind: 'gia_cong', grossAmount: 20_000_000, qty: 100, unitPrice: 200_000, period: '2026-06',
  });
  check(String(cp2.pitWithheld) === '2000000.00' && String(cp2.netAmount) === '18000000.00', 'Gia công: khấu trừ 10% từ gross');
  const cp3 = await createContractorPayment(db, orgA, {
    contractorName: 'Nguyễn Văn Tài', kind: 'cong_tac', grossAmount: 3_000_000, period: '2026-06',
  });
  check(String(cp3.pitWithheld) === '0.00' && String(cp3.netAmount) === '3000000.00', 'Công tác phí: không khấu trừ thuế');
  const cps = await listContractorPayments(db, orgA, '2026-06');
  check(cps.length === 3, 'List CTV theo kỳ = 3 khoản');

  console.log('=== F6: full-flow run → approve → payout → payslip ===');
  const run = await createPayrollRun(db, orgA, { period: '2026-06', scheme: 'OFFICIAL' });
  const calc = await calculateRun(db, orgA, run.id);
  check(calc.lines === 40, `Calculate: ${calc.lines} dòng lương`, calc.skipped.join('; ').slice(0, 100));

  // Batch trước duyệt phải bị chặn
  let err = '';
  try { await createPayoutBatch(db, orgA, { runId: run.id }, userId); } catch (e: any) { err = e.message; }
  check(err.includes('ĐÃ DUYỆT'), 'Chặn tạo batch khi run chưa approve');
  try { await generatePayslips(db, orgA, run.id); } catch (e: any) { err = e.message; }
  check(err.includes('ĐÃ DUYỆT'), 'Chặn phát payslip khi run chưa approve');

  const approved = await approveRun(db, orgA, run.id, userId);
  check(approved.status === 'approved' && approved.approvedBy === userId, 'Approve run OK');
  try { err = ''; await calculateRun(db, orgA, run.id); } catch (e: any) { err = e.message; }
  check(err.includes('đã duyệt'), 'Chặn tính lại run đã duyệt');

  const { batch, summary } = await createPayoutBatch(db, orgA, { runId: run.id }, userId);
  check(summary.lines === 40 && summary.totalAmount > 400_000_000, `Batch: 40 dòng, tổng ${summary.totalAmount.toLocaleString('vi')}`);
  const linesArr = batch.lines as any[];
  const loanLine = linesArr.find((l) => l.code === 'NV001');
  check(!!loanLine && loanLine.bankAccount === '791305596979' && loanLine.bankName === 'MB', 'STK Châu Loan vào batch từ hồ sơ merge F2');
  console.log(`    → missingBank: ${summary.missingBank} NV chưa có STK (trả tiền mặt)`);
  const exported = await markBatchStatus(db, orgA, batch.id, 'exported');
  check(exported.status === 'exported', 'Batch → exported');

  const ps = await generatePayslips(db, orgA, run.id);
  check(ps.created === 40 && ps.skipped === 0, `Phát ${ps.created} phiếu lương`);
  const ps2 = await generatePayslips(db, orgA, run.id);
  check(ps2.created === 0 && ps2.skipped === 40, 'Phát lại: phiếu bất biến, skip toàn bộ');

  // Payslip snapshot bất biến: đổi tên NV sau khi phát, snapshot giữ nguyên
  const emps = await listEmployees(db, orgA);
  const loan = emps.find((e: any) => e.codeOfficial === 'NV001');
  const slipsBefore = await getPayslip(db, orgA, loan.id, '2026-06');
  check(slipsBefore.length === 1, 'Payslip Châu Loan kỳ 2026-06 tồn tại');
  await updateEmployee(db, orgA, loan.id, { fullName: 'TÊN ĐÃ ĐỔI' });
  const slipsAfter = await getPayslip(db, orgA, loan.id, '2026-06');
  check(slipsAfter[0].snapshot.employee.fullName === 'Nguyễn Thị Châu Loan', 'Snapshot BẤT BIẾN sau khi đổi hồ sơ NV');
  // Đối chiếu net trong payslip với payroll line
  const rl = await listRunLines(db, orgA, run.id);
  const loanPl = rl.find((l: any) => l.employeeId === loan.id);
  check(String(slipsAfter[0].snapshot.line.netPay) === String(loanPl.netPay), 'Payslip net = payroll line net');

  console.log('=== F6: tenant isolation ===');
  const orgB = randomUUID();
  check((await listContractorPayments(db, orgB)).length === 0, 'Org B không thấy CTV org A');
  try { err = ''; await createPayoutBatch(db, orgB, { runId: run.id }, userId); } catch (e: any) { err = e.message; }
  check(err.includes('Không tìm thấy'), 'Org B không tạo được batch từ run org A');

  console.log(`\n   KẾT QUẢ F6 PAYOUT: ${passed} PASS, ${failed} FAIL`);
  await pg.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('[F6-PAYOUT]', e); process.exit(1); });
