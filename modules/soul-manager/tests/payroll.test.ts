/**
 * SOUL-MANAGER — Test engine lương (PURE, không DB)
 * Chứng minh ngưỡng đạt: BHXH + thuế TNCN lũy tiến tính đúng TỪNG ĐỒNG
 * theo luật 2026, kể cả đổi trần đóng giữa kỳ 06/2026 → 07/2026.
 * Đối chiếu tay theo: Luật 109/2025/QH15 (biểu 5 bậc), NQ 110/2025
 * (giảm trừ 15,5tr/6,2tr), NĐ 293/2025 (LTT vùng), NĐ 161/2026 (tham chiếu).
 */
import { M, progressiveTax } from '../src/money.js';
import { DEFAULT_POLICY } from '../src/config.js';
import { computePayslipNumbers, type PayslipInput } from '../src/services/payroll.service.js';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
}
function eqM(name: string, actual: string, expected: string) {
  check(name, M.cmp(actual, expected) === 0, `(actual=${actual}, expected=${expected})`);
}

const base: Omit<PayslipInput, 'baseSalary'> = {
  insuranceSalary: null,
  standardWorkDays: '26', workHoursPerDay: '8',
  workedDays: '26', paidLeaveDays: '0',
  otWeekdayHours: '0', otWeekendHours: '0', otHolidayHours: '0',
  allowanceTaxable: '0', allowanceNontaxable: '0',
  dependentsCount: 0, workRegion: 1, periodIso: '2026-07-01',
};

console.log('— 1. money.ts: số học decimal chính xác —');
eqM('add 0.1 + 0.2 = 0.3 (không lỗi float)', M.add('0.1', '0.2'), '0.3');
eqM('mulDiv 30tr × 10/26 half-up', M.round0(M.mulDiv('30000000', '10', '26')), '11538462');
eqM('round0 half-up 257500.5 → 257501', M.round0('257500.5'), '257501');
check('cmp: 100.00 == 100', M.cmp('100.00', '100') === 0);

console.log('\n— 2. Thuế TNCN lũy tiến 5 bậc (Luật 109/2025/QH15) —');
eqM('assessable 0 → thuế 0', progressiveTax('0', DEFAULT_POLICY.tax_brackets), '0');
eqM('10.000.000 (hết bậc 1) → 500.000', progressiveTax('10000000', DEFAULT_POLICY.tax_brackets), '500000');
eqM('5.150.000 → 257.500', progressiveTax('5150000', DEFAULT_POLICY.tax_brackets), '257500');
eqM('30.000.000 (hết bậc 2) → 2.500.000', progressiveTax('30000000', DEFAULT_POLICY.tax_brackets), '2500000');
eqM('98.631.000 → 20.089.300 (qua 4 bậc)', progressiveTax('98631000', DEFAULT_POLICY.tax_brackets), '20089300');
eqM('120.000.000 → 27.500.000 (chạm bậc 35%)', progressiveTax('120000000', DEFAULT_POLICY.tax_brackets), '27500000');

console.log('\n— 3. CASE A: lương 20tr, đủ 26 công, 0 NPT, kỳ 07/2026 —');
{
  const r = computePayslipNumbers(DEFAULT_POLICY, { ...base, baseSalary: '20000000' });
  eqM('BHXH 8% = 1.600.000', r.siAmount, '1600000');
  eqM('BHYT 1,5% = 300.000', r.hiAmount, '300000');
  eqM('BHTN 1% = 200.000', r.uiAmount, '200000');
  eqM('Tổng BH 10,5% = 2.100.000', r.insuranceTotal, '2100000');
  eqM('TN tính thuế = 2.400.000', r.assessableIncome, '2400000');
  eqM('Thuế TNCN = 120.000', r.pit, '120000');
  eqM('THỰC NHẬN = 17.780.000', r.net, '17780000');
}

console.log('\n— 4. CASE B: lương 30tr, đủ công, 1 NPT, kỳ 07/2026 —');
{
  const r = computePayslipNumbers(DEFAULT_POLICY, { ...base, baseSalary: '30000000', dependentsCount: 1 });
  eqM('Tổng BH = 3.150.000', r.insuranceTotal, '3150000');
  eqM('Giảm trừ NPT = 6.200.000', r.dependentDeduction, '6200000');
  eqM('TN tính thuế = 5.150.000', r.assessableIncome, '5150000');
  eqM('Thuế = 257.500', r.pit, '257500');
  eqM('THỰC NHẬN = 26.592.500', r.net, '26592500');
}

console.log('\n— 5. CASE C: lương 120tr chạm TRẦN, vùng I, kỳ 07/2026 (tham chiếu 2,53tr) —');
{
  const r = computePayslipNumbers(DEFAULT_POLICY, { ...base, baseSalary: '120000000' });
  eqM('Căn cứ BHXH/BHYT = trần 50.600.000', r.insuranceBase, '50600000');
  eqM('BHXH = 4.048.000', r.siAmount, '4048000');
  eqM('BHYT = 759.000', r.hiAmount, '759000');
  eqM('Căn cứ BHTN = trần 106.200.000', r.uiBase, '106200000');
  eqM('BHTN = 1.062.000', r.uiAmount, '1062000');
  eqM('Tổng BH = 5.869.000', r.insuranceTotal, '5869000');
  eqM('TN tính thuế = 98.631.000', r.assessableIncome, '98631000');
  eqM('Thuế = 20.089.300', r.pit, '20089300');
  eqM('THỰC NHẬN = 94.041.700', r.net, '94041700');
}

console.log('\n— 6. CASE D: cùng 120tr nhưng kỳ 06/2026 (tham chiếu CŨ 2,34tr) — effective-dated —');
{
  const r = computePayslipNumbers(DEFAULT_POLICY, { ...base, baseSalary: '120000000', periodIso: '2026-06-01' });
  eqM('Căn cứ BHXH/BHYT = trần CŨ 46.800.000', r.insuranceBase, '46800000');
  eqM('BHXH = 3.744.000', r.siAmount, '3744000');
  eqM('BHYT = 702.000', r.hiAmount, '702000');
  eqM('Tổng BH = 5.508.000', r.insuranceTotal, '5508000');
  eqM('Thuế = 20.197.600', r.pit, '20197600');
  eqM('THỰC NHẬN = 94.294.400', r.net, '94294400');
}

console.log('\n— 7. CASE E: OT — lương 26tr, 10h ngày thường + 4h cuối tuần —');
{
  const r = computePayslipNumbers(DEFAULT_POLICY, {
    ...base, baseSalary: '26000000', otWeekdayHours: '10', otWeekendHours: '4',
  });
  eqM('Tiền OT (150%/200%) = 2.875.000', r.otPay, '2875000');
  eqM('Phần phụ trội MIỄN THUẾ = 1.125.000', r.otTaxExempt, '1125000');
  eqM('Gross = 28.875.000', r.gross, '28875000');
  eqM('Tổng BH (trên lương HĐ 26tr) = 2.730.000', r.insuranceTotal, '2730000');
  eqM('TN chịu thuế = 27.750.000 (chỉ tính phần OT 100%)', r.taxableIncome, '27750000');
  eqM('TN tính thuế = 9.520.000', r.assessableIncome, '9520000');
  eqM('Thuế = 476.000', r.pit, '476000');
  eqM('THỰC NHẬN = 25.669.000', r.net, '25669000');
}

console.log('\n— 8. CASE F: luật ≥14 ngày không lương → KHÔNG đóng BH —');
{
  const r = computePayslipNumbers(DEFAULT_POLICY, { ...base, baseSalary: '30000000', workedDays: '10' });
  eqM('Lương 10/26 công = 11.538.462', r.salaryByDays, '11538462');
  eqM('BHXH = 0 (nghỉ 16 ngày ≥ 14)', r.siAmount, '0');
  eqM('Tổng BH = 0', r.insuranceTotal, '0');
  eqM('Thuế = 0 (dưới giảm trừ)', r.pit, '0');
  eqM('THỰC NHẬN = 11.538.462', r.net, '11538462');
  check('breakdown ghi rõ skip_insurance', (r.breakdown as { skip_insurance?: boolean }).skip_insurance === true);
}

console.log('\n— 9. CASE G: SÀN lương tối thiểu vùng I 2026 (5,31tr) —');
{
  const r = computePayslipNumbers(DEFAULT_POLICY, { ...base, baseSalary: '4000000' });
  eqM('Căn cứ BH nâng lên sàn = 5.310.000', r.insuranceBase, '5310000');
  eqM('Tổng BH = 557.550', r.insuranceTotal, '557550');
  eqM('THỰC NHẬN = 3.442.450', r.net, '3442450');
}

console.log(`\n══ KẾT QUẢ: ${passed} pass / ${failed} fail ══`);
if (failed > 0) process.exit(1);
