/**
 * QLDN V1A — F5 GOLDEN TEST: engine INTERNAL khớp từng đồng với sheet
 * "TÍNH LƯƠNG" file LUONGNB 06.2026 (fixtures/golden-t06-internal.json —
 * extract nguyên trạng 66 NV, gồm cả reconciliation trừ lương hệ chính thức).
 * Quy tắc: SAI 1 ĐỒNG = KHÔNG SHIP.
 * Chạy: npx tsx server/qldn.internal.test.ts
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calcInternalLine, type InternalInput } from './engine.js';

let passed = 0, failed = 0;
function check(cond: boolean, name: string, extra?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
}

interface GoldenInternal {
  row: number; code: string; name: string; role: string;
  stdDays: number; base: number;
  pcCreative: number; pcResponsibility: number; pcSkill: number; pcFuel: number;
  income: number; workDays: number; workPay: number;
  ot170d: number; ot150d: number; ot200d: number;
  ot170pay: number; ot150pay: number; ot200pay: number;
  commissionPct: number; bonusOverTarget: number;
  feeProvince: number; feeCity: number; feeSupport: number; outsourcing: number; otNight: number;
  bonusHoliday: number; bonus13: number;
  gross: number;
  lateCount: number; lateAmount: number; advance: number; probationDeduct: number;
  insEmp: number; officialNetPaid: number;
  leaveP: number; leaveL: number; pit: number;
  net: number;
  netFormula: string | null;
  /** Đọc từ CÔNG THỨC Excel từng dòng (không suy đoán): */
  hourlyMode: boolean;          // M = L×F×8 — thợ tính theo giờ (JPFL001-004)
  workPayDivisor: number | null; // K/22×L — JPTK002 chia 22 thay 26
  ot200Rate: number;             // S = F/26×1.5×P — JPMM001 gõ 1.5 thay 2.0
  grossAdjust: number;           // ROUND(...,-3)+769230 — JPMM002 cộng tay
  flatWorkPay: boolean;          // M = F — lương phẳng tạp vụ JPHN001
}

function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const golden: GoldenInternal[] = JSON.parse(readFileSync(join(here, '..', 'tests', 'fixtures', 'golden-t06-internal.json'), 'utf8'));

  console.log(`=== F5: GOLDEN INTERNAL T06 — ${golden.length} NV LUONGNB, đối chiếu từng đồng ===`);
  let exact = 0;
  const mismatches: string[] = [];
  const pol = { standardDays: 26, otRates: { ot150: 1.5, ot170: 1.7, ot200: 2.0 } };
  for (const g of golden) {
    // 1 dòng đặc thù (JPTK002): công thức tay AC-AI-AJ, không theo template — bỏ qua template engine,
    // nhưng vẫn phải tái lập đúng bằng công thức thay thế bên dưới.
    const inp: InternalInput = {
      baseSalary: g.base,
      pcCreative: g.pcCreative, pcResponsibility: g.pcResponsibility, pcSkill: g.pcSkill, pcFuel: g.pcFuel,
      workDays: g.workDays,
      ot170Days: g.ot170d, ot150Days: g.ot150d, ot200Days: g.ot200d,
      commission: g.commissionPct, bonusOverTarget: g.bonusOverTarget,
      feeProvince: g.feeProvince, feeCity: g.feeCity, feeSupport: g.feeSupport,
      outsourcing: g.outsourcing, otNight: g.otNight,
      bonusHoliday: g.bonusHoliday, bonus13: g.bonus13,
      lateAmount: g.lateAmount, advance: g.advance, probationDeduct: g.probationDeduct,
      insuranceEmployee: g.insEmp, officialNetPaid: g.officialNetPaid,
      leavePayP: g.leaveP, leavePayL: g.leaveL,
      pit: g.pit,
      // Variant flags đọc từ chính công thức Excel (OT luôn /26 — cố định trong mọi dòng)
      hourlyMode: g.hourlyMode,
      workPayDivisor: g.workPayDivisor === 22 ? 22 : undefined,
      ot200RateOverride: g.ot200Rate !== 2 ? g.ot200Rate : undefined,
      grossAdjust: g.grossAdjust,
      flatWorkPay: g.flatWorkPay,
    };
    const out = calcInternalLine(inp, pol);
    const diffs: string[] = [];
    const cmp = (label: string, got: number, want: number, tol = 1) => {
      if (Math.abs(got - want) > tol) diffs.push(`${label}: engine=${Math.round(got)} excel=${Math.round(want)}`);
    };
    cmp('income', out.income, g.income);
    cmp('workPay', out.workPay, g.workPay);
    cmp('ot170', out.ot170Pay, g.ot170pay);
    cmp('ot150', out.ot150Pay, g.ot150pay);
    cmp('ot200', out.ot200Pay, g.ot200pay);
    cmp('gross', out.gross, g.gross, 0);
    if (g.netFormula && !g.netFormula.includes('ROUND')) {
      // variant tay: net = gross − officialNetPaid − leaveP (AC−AI−AJ)
      const manual = g.gross - g.officialNetPaid - g.leaveP;
      cmp('NET(manual-variant)', manual, g.net, 0);
    } else {
      cmp('NET', out.netPay, g.net, 0);
    }
    if (diffs.length === 0) exact++;
    else mismatches.push(`${g.code} ${g.name} [row ${g.row}]: ${diffs.join(' · ')}`);
  }
  check(exact === golden.length, `GOLDEN INTERNAL: ${exact}/${golden.length} NV khớp TỪNG ĐỒNG (gross+net tolerance 0đ)`);
  if (mismatches.length) {
    console.error('\n  ── SAI LỆCH CHI TIẾT ──');
    for (const m of mismatches) console.error('  ✗', m);
  }

  console.log('=== F5: tổng quỹ lương nội bộ T06 ===');
  let sumNet = 0, sumNetGolden = 0, sumGross = 0, sumGrossGolden = 0;
  for (const g of golden) {
    const out = calcInternalLine({
      baseSalary: g.base,
      pcCreative: g.pcCreative, pcResponsibility: g.pcResponsibility, pcSkill: g.pcSkill, pcFuel: g.pcFuel,
      workDays: g.workDays,
      ot170Days: g.ot170d, ot150Days: g.ot150d, ot200Days: g.ot200d,
      commission: g.commissionPct, bonusOverTarget: g.bonusOverTarget,
      feeProvince: g.feeProvince, feeCity: g.feeCity, feeSupport: g.feeSupport,
      outsourcing: g.outsourcing, otNight: g.otNight,
      bonusHoliday: g.bonusHoliday, bonus13: g.bonus13,
      lateAmount: g.lateAmount, advance: g.advance, probationDeduct: g.probationDeduct,
      insuranceEmployee: g.insEmp, officialNetPaid: g.officialNetPaid,
      leavePayP: g.leaveP, leavePayL: g.leaveL, pit: g.pit,
      hourlyMode: g.hourlyMode,
      workPayDivisor: g.workPayDivisor === 22 ? 22 : undefined,
      ot200RateOverride: g.ot200Rate !== 2 ? g.ot200Rate : undefined,
      grossAdjust: g.grossAdjust,
      flatWorkPay: g.flatWorkPay,
    }, pol);
    sumGross += out.gross; sumGrossGolden += g.gross;
    const isManual = g.netFormula && !g.netFormula.includes('ROUND');
    sumNet += isManual ? (g.gross - g.officialNetPaid - g.leaveP) : out.netPay;
    sumNetGolden += g.net;
  }
  check(sumGross === sumGrossGolden, `Tổng gross nội bộ: ${sumGross.toLocaleString('vi')} = Excel ${sumGrossGolden.toLocaleString('vi')}`);
  check(sumNet === sumNetGolden, `Tổng thực lĩnh nội bộ: ${sumNet.toLocaleString('vi')} = Excel ${sumNetGolden.toLocaleString('vi')}`);

  console.log(`\n   KẾT QUẢ F5 GOLDEN INTERNAL: ${passed} PASS, ${failed} FAIL`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
