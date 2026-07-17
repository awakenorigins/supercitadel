/**
 * QLDN V1A — F4 GOLDEN TEST: engine OFFICIAL phải khớp TỪNG ĐỒNG với
 * bảng lương T06 Joli Poli thật (fixtures/golden-t06-official.json —
 * extract nguyên trạng từ sheet "Bảng tổng hợp" 49r×57c, 2.009 công thức).
 * Quy tắc anh Nấng: SAI 1 ĐỒNG = KHÔNG SHIP.
 * Chạy: npx tsx server/qldn.golden.test.ts
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calcOfficialLine, progressivePit, type PayrollPolicy, type OfficialInput } from './engine.js';
import { DEFAULT_PIT_BRACKETS } from './service.js';

let passed = 0, failed = 0;
function check(cond: boolean, name: string, extra?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
}

interface Golden {
  code: string; name: string; contract: string;
  bhxhSalary: number; base: number; pcTN: number; meal: number; fuel: number; phone: number; uniform: number;
  workDays: number; leaveDays: number; leavePay: number;
  ot150h: number; ot150pay: number; ot200h: number; ot200pay: number;
  bonus: number; gross: number; exTotal: number;
  insCo: number; kpcd: number; insEmp: number; unionFee: number;
  gtSelf: number; nptCount: number; gtNpt: number; gtTotal: number;
  taxableIncome: number; taxedIncome: number; pit: number; advance: number; net: number;
  /** Đọc từ CÔNG THỨC Excel từng dòng: NV cũ miễn full tiền ăn, NV039-044 cap 730k đúng luật. */
  mealExemptCap: number | null;
}

const POLICY: PayrollPolicy = {
  standardDays: 26,
  insCompanyBp: 2150, kpcdBp: 200, insEmployeeBp: 1050, unionFeeBp: 50,
  deductionPersonal: 15_500_000, deductionDependent: 6_200_000,
  insuranceMinDays: 14, hdtvFactorBp: 8500, ctvPitBp: 1000,
  otRates: { ot150: 1.5, ot170: 1.7, ot200: 2.0 },
  pitBrackets: DEFAULT_PIT_BRACKETS,
  applyUnionFee: false, // Excel Joli Poli: cột phí công đoàn = 0 toàn bộ
};

function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const golden: Golden[] = JSON.parse(readFileSync(join(here, '..', 'tests', 'fixtures', 'golden-t06-official.json'), 'utf8'));

  console.log('=== F4: PIT lũy tiến — kiểm bậc thuế ===');
  check(progressivePit(0, DEFAULT_PIT_BRACKETS) === 0, 'PIT(0) = 0');
  check(progressivePit(5_000_000, DEFAULT_PIT_BRACKETS) === 250_000, 'PIT(5tr) = 250k (bậc 1: 5%)');
  check(progressivePit(10_000_000, DEFAULT_PIT_BRACKETS) === 750_000, 'PIT(10tr) = 750k (5%+10%)');
  check(progressivePit(2_500_000, DEFAULT_PIT_BRACKETS) === 125_000, 'PIT(2.5tr) = 125k');

  console.log(`=== F4: GOLDEN T06 — ${golden.length} NV, đối chiếu từng đồng ===`);
  let exact = 0;
  const mismatches: string[] = [];
  for (const g of golden) {
    const contractType = g.contract.includes('TV') && !g.contract.includes('LĐ') ? 'HDTV' : 'HDLD';
    const inp: OfficialInput = {
      contractType,
      bhxhSalary: g.bhxhSalary, baseSalary: g.base,
      allowResponsibility: g.pcTN, allowMeal: g.meal, allowFuel: g.fuel,
      allowPhone: g.phone, allowUniform: g.uniform,
      workDays: g.workDays, paidLeaveDays: g.leaveDays,
      ot150Hours: g.ot150h, ot170Hours: 0, ot200Hours: g.ot200h,
      bonus: g.bonus, dependentsCount: g.nptCount, advance: g.advance,
    };
    // Policy theo dòng: Excel Joli Poli tồn tại song song 2 công thức miễn thuế tiền ăn
    // (NV cũ miễn full — lệch luật; NV mới cap 730k đúng luật) → version hóa qua param.
    const out = calcOfficialLine(inp, { ...POLICY, mealExemptCapMonthly: g.mealExemptCap });
    const diffs: string[] = [];
    const cmp = (label: string, got: number, want: number, tol = 1) => {
      if (Math.abs(got - want) > tol) diffs.push(`${label}: engine=${got} excel=${Math.round(want)}`);
    };
    cmp('leavePay', out.leavePay, g.leavePay);
    cmp('ot150', out.ot150Pay, g.ot150pay);
    cmp('ot200', out.ot200Pay, g.ot200pay);
    cmp('gross', out.gross, g.gross);
    cmp('exempt', out.exemptTotal, g.exTotal);
    cmp('insCo', out.insuranceCompany, g.insCo, 0);
    cmp('kpcd', out.kpcd, g.kpcd, 0);
    cmp('insEmp', out.insuranceEmployee, g.insEmp, 0);
    cmp('taxable', out.taxableIncome, g.taxableIncome);
    cmp('taxed', out.taxedIncome, g.taxedIncome);
    cmp('pit', out.pit, g.pit);
    cmp('NET', out.netPay, g.net, 0); // NET: 0 đồng sai số
    if (diffs.length === 0) exact++;
    else mismatches.push(`${g.code} ${g.name} [${g.contract}]: ${diffs.join(' · ')}`);
  }
  check(exact === golden.length, `GOLDEN: ${exact}/${golden.length} NV khớp TỪNG ĐỒNG (net tolerance 0đ)`);
  if (mismatches.length) {
    console.error('\n  ── SAI LỆCH CHI TIẾT ──');
    for (const m of mismatches) console.error('  ✗', m);
  }

  // Tổng quỹ lương toàn công ty phải khớp tuyệt đối
  console.log('=== F4: tổng quỹ lương T06 ===');
  let sumNet = 0, sumNetGolden = 0, sumPit = 0, sumPitGolden = 0;
  for (const g of golden) {
    const contractType = g.contract.includes('TV') && !g.contract.includes('LĐ') ? 'HDTV' : 'HDLD';
    const out = calcOfficialLine({
      contractType, bhxhSalary: g.bhxhSalary, baseSalary: g.base,
      allowResponsibility: g.pcTN, allowMeal: g.meal, allowFuel: g.fuel,
      allowPhone: g.phone, allowUniform: g.uniform,
      workDays: g.workDays, paidLeaveDays: g.leaveDays,
      ot150Hours: g.ot150h, ot170Hours: 0, ot200Hours: g.ot200h,
      bonus: g.bonus, dependentsCount: g.nptCount, advance: g.advance,
    }, { ...POLICY, mealExemptCapMonthly: g.mealExemptCap });
    sumNet += out.netPay; sumNetGolden += g.net;
    sumPit += out.pit; sumPitGolden += g.pit;
  }
  check(sumNet === sumNetGolden, `Tổng thực lĩnh toàn cty: ${sumNet.toLocaleString('vi')} = Excel ${sumNetGolden.toLocaleString('vi')}`);
  check(sumPit === sumPitGolden, `Tổng thuế TNCN: ${sumPit.toLocaleString('vi')} = Excel ${sumPitGolden.toLocaleString('vi')}`);

  console.log(`\n   KẾT QUẢ F4 GOLDEN: ${passed} PASS, ${failed} FAIL`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
