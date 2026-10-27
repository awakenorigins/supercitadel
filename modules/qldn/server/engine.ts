/**
 * QLDN V1A — F4: PAYROLL ENGINE (scheme OFFICIAL) — trái tim module.
 * Đúc lại từ 2.009 công thức sheet "Bảng tổng hợp" (49r×57c) file Excel Joli Poli.
 * PURE FUNCTION — không chạm DB, để golden-test khớp từng đồng với Excel gốc.
 *
 * Công thức đã giải mã từ Excel thật (verify bằng golden test 40 NV):
 *  - daily_base   = (base + pcTN) / std_days
 *  - work pay     = base/std×days; từng allowance/std×days; TRANG PHỤC = flat (không prorate)
 *  - HĐTV         = base & pcTN nhân 0.85; meal/fuel/phone prorate KHÔNG nhân; uniform = 0
 *  - leave_pay    = (base + pcTN)/std × leave_days
 *  - ot_pay       = ROUND( (base+pcTN)/std/8 × rate × h )   [rate 1.5 / 2.0]
 *  - gross        = work + allowances + uniform + leave + ot + bonus
 *  - exempt (HĐLĐ) = min(workMeal, mealCap nếu có) + workPhone + min(workUniform, uniformCapYear/12) + TOÀN BỘ ot_pay
 *  - exempt (HĐTV/CTV) = CHỈ ot_pay — Excel: IF($D="HĐTV",0,...) cho ăn/ĐT/trang phục
 *  - ins_co       = bhxh × 21.5% (17+3+1+0.5) + KPCĐ 2%   [chỉ khi bhxhSalary > 0]
 *  - ins_emp      = bhxh × 10.5% (8+1.5+1)
 *  - HĐLĐ: taxed  = max(0, round(gross−exempt) − ins_emp − 15.5tr − npt×6.2tr) → PIT lũy tiến 7 bậc
 *  - HĐTV/CTV: taxed = round(gross−exempt) → PIT flat 10%, không giảm trừ, không BH
 *  - net          = round(gross − ins_emp − pit − advance)
 * Mọi tham số % / giảm trừ / biểu thuế lấy từ policy — KHÔNG hardcode.
 */

export interface PitBracket { upTo: number | null; rateBp: number }

export interface PayrollPolicy {
  standardDays: number;          // 26
  insCompanyBp: number;          // 2150
  kpcdBp: number;                // 200
  insEmployeeBp: number;         // 1050
  unionFeeBp: number;            // 50 (Excel Joli Poli không áp → set 0 khi golden)
  deductionPersonal: number;     // 15_500_000
  deductionDependent: number;    // 6_200_000
  insuranceMinDays: number;      // 14
  hdtvFactorBp: number;          // 8500
  ctvPitBp: number;              // 1000
  otRates: { ot150: number; ot170: number; ot200: number };
  pitBrackets: PitBracket[];
  applyUnionFee?: boolean;       // Joli Poli: false
  uniformCapYear?: number;       // 5_000_000 → miễn thuế trang phục tối đa 5tr/12 tháng
  /**
   * Cap miễn thuế tiền ăn ca/tháng (luật VN: 730.000đ). null = miễn toàn bộ.
   * PHÁT HIỆN từ Excel Joli Poli: dòng NV cũ dùng công thức miễn FULL (không cap —
   * lệch luật), dòng NV039-041 (thêm sau) dùng cap 730k đúng luật — 2 công thức
   * tồn tại song song trong cùng 1 sheet. Param này version hóa để tái lập cả 2.
   */
  mealExemptCapMonthly?: number | null;
}

export interface OfficialInput {
  contractType: 'HDLD' | 'HDTV' | 'CTV';
  bhxhSalary: number;
  baseSalary: number;
  allowResponsibility: number;
  allowMeal: number;
  allowFuel: number;
  allowPhone: number;
  allowUniform: number;
  workDays: number;
  paidLeaveDays: number;
  ot150Hours: number;
  ot170Hours: number;
  ot200Hours: number;
  bonus: number;
  dependentsCount: number;
  advance: number;
}

export interface OfficialLine {
  workBase: number; workPcTN: number; workMeal: number; workFuel: number; workPhone: number; workUniform: number;
  leavePay: number; ot150Pay: number; ot170Pay: number; ot200Pay: number; otPay: number;
  workPay: number; allowancePay: number; bonus: number;
  gross: number;
  exemptMeal: number; exemptPhone: number; exemptUniform: number; exemptOt: number; exemptTotal: number;
  insuranceCompany: number; kpcd: number; insuranceEmployee: number; unionFee: number;
  deductionPersonal: number; deductionDependents: number; deductionTotal: number;
  taxableIncome: number; taxedIncome: number; pit: number;
  advanceDeduct: number; netPay: number;
}

/** Round half-up có chắn floating-point (khớp ROUND của Excel). */
const r0 = (x: number) => Math.round(Number(x.toFixed(4)));

/** Thuế TNCN lũy tiến — brackets [{upTo, rateBp}] theo thứ tự tăng, upTo null = vô cực. */
export function progressivePit(taxed: number, brackets: PitBracket[]): number {
  if (taxed <= 0) return 0;
  let pit = 0, prev = 0;
  for (const b of brackets) {
    const cap = b.upTo ?? Infinity;
    const slice = Math.min(taxed, cap) - prev;
    if (slice > 0) pit += slice * (b.rateBp / 10000);
    if (taxed <= cap) break;
    prev = cap;
  }
  return r0(pit);
}

// ============================================================
// SCHEME INTERNAL (F5) — dịch từ sheet "TÍNH LƯƠNG" file LUONGNB (127r×59c):
//  - income   = base + PC(sáng tạo + trách nhiệm + tay nghề + xăng xe)
//  - workPay  = income × workDays / stdDays   (K*L/26 — KHÔNG round)
//  - OT theo NGÀY (dư công giờ máy quy ra ngày): pay = base/std × rate × otDays
//  - gross    = ROUND(workPay + OT + hoa hồng + thưởng vượt DS + phí công tác
//               + hỗ trợ + gia công + OT đêm + thưởng lễ/SN + T13, -3) ← tròn NGHÌN
//  - net      = ROUND(gross − trừ đi trễ − tạm ứng − khấu trừ thử việc 15%
//               − BHXH NLĐ − ĐÃ LĨNH hệ chính thức (VLOOKUP Bảng thể hiện)
//               − thuế TNCN + (nghỉ P + L), -3)
//  → đây chính là reconciliation 2 hệ lương: nội bộ trả phần chênh sau khi
//    hệ chính thức (BHXH/thuế) đã chi.
// ============================================================

export interface InternalInput {
  baseSalary: number;          // lương nội bộ (hoặc đơn giá GIỜ nếu hourlyMode)
  pcCreative: number; pcResponsibility: number; pcSkill: number; pcFuel: number;
  workDays: number;
  ot170Days: number; ot150Days: number; ot200Days: number;
  /** Thợ tính lương theo GIỜ (Excel M = L×F×8): workPay = days × rate/giờ × 8. */
  hourlyMode?: boolean;
  /** Mẫu số chia công riêng (ví dụ 22 ngày chuẩn thay 26 — JPTK002). */
  workPayDivisor?: number;
  /** Rate OT200 override (Excel có dòng gõ 1.5 thay 2.0 — JPMM001). */
  ot200RateOverride?: number;
  /** Điều chỉnh cộng thẳng vào gross sau ROUND (Excel +769230 — JPMM002). */
  grossAdjust?: number;
  /** Lương phẳng không chia công (Excel M = F — tạp vụ JPHN001). */
  flatWorkPay?: boolean;
  commission: number; bonusOverTarget: number;
  feeProvince: number; feeCity: number; feeSupport: number;
  outsourcing: number; otNight: number;
  bonusHoliday: number; bonus13: number;
  lateAmount: number; advance: number; probationDeduct: number;
  insuranceEmployee: number;   // BHXH 10.5% tính trên lương hệ chính thức
  officialNetPaid: number;     // đã thực lĩnh ở hệ chính thức (khấu trừ)
  leavePayP: number; leavePayL: number;
  pit: number;
}

export interface InternalLine {
  income: number; workPay: number;
  ot170Pay: number; ot150Pay: number; ot200Pay: number; otPay: number;
  gross: number; netPay: number;
}

const r3 = (x: number) => Math.round(Number((x / 1000).toFixed(6))) * 1000; // ROUND(x,-3) Excel

/** Tính 1 dòng lương INTERNAL — bản dịch 1-1 sheet TÍNH LƯƠNG LUONGNB. */
export function calcInternalLine(inp: InternalInput, pol: { standardDays: number; otRates: { ot150: number; ot170: number; ot200: number } }): InternalLine {
  const std = inp.workPayDivisor ?? pol.standardDays;
  const income = inp.hourlyMode ? 0 : inp.baseSalary + inp.pcCreative + inp.pcResponsibility + inp.pcSkill + inp.pcFuel;
  // Thợ theo giờ: M = ngày công × đơn giá giờ × 8; lương phẳng: M = F; còn lại: income × công / mẫu số
  const workPay = inp.hourlyMode
    ? inp.workDays * inp.baseSalary * 8
    : inp.flatWorkPay
      ? inp.baseSalary
      : (inp.baseSalary + inp.pcCreative + inp.pcResponsibility + inp.pcSkill + inp.pcFuel) * inp.workDays / std;
  const daily = inp.baseSalary / pol.standardDays; // OT luôn chia 26 (F/26 cố định trong Excel, kể cả dòng chia 22)
  const ot170Pay = daily * pol.otRates.ot170 * inp.ot170Days;
  const ot150Pay = daily * pol.otRates.ot150 * inp.ot150Days;
  const ot200Pay = daily * (inp.ot200RateOverride ?? pol.otRates.ot200) * inp.ot200Days;
  const otPay = ot170Pay + ot150Pay + ot200Pay;
  const gross = r3(
    workPay + ot170Pay + ot150Pay + ot200Pay
    + inp.commission + inp.bonusOverTarget
    + inp.feeProvince + inp.feeCity + inp.feeSupport
    + inp.outsourcing + inp.otNight
    + inp.bonusHoliday + inp.bonus13,
  ) + (inp.grossAdjust ?? 0);
  const netPay = r3(
    gross - inp.lateAmount - inp.advance - inp.probationDeduct
    - inp.insuranceEmployee - inp.officialNetPaid - inp.pit
    + (inp.leavePayP + inp.leavePayL),
  );
  return { income, workPay, ot170Pay, ot150Pay, ot200Pay, otPay, gross, netPay };
}

/** Tính 1 dòng lương OFFICIAL — bản dịch 1-1 của engine Excel Joli Poli. */
export function calcOfficialLine(inp: OfficialInput, pol: PayrollPolicy): OfficialLine {
  const std = pol.standardDays;
  const isTV = inp.contractType === 'HDTV';
  const isCTV = inp.contractType === 'CTV';
  const factor = isTV ? pol.hdtvFactorBp / 10000 : 1;

  // Lương + phụ cấp theo ngày công thực tế
  const workBase = (inp.baseSalary * factor / std) * inp.workDays;
  const workPcTN = (inp.allowResponsibility * factor / std) * inp.workDays;
  const workMeal = (inp.allowMeal / std) * inp.workDays;
  const workFuel = (inp.allowFuel / std) * inp.workDays;
  const workPhone = (inp.allowPhone / std) * inp.workDays;
  const workUniform = isTV || isCTV ? 0 : inp.allowUniform; // trang phục: flat, HĐTV không có

  // Nghỉ hưởng lương
  const leavePay = ((inp.baseSalary + inp.allowResponsibility) / std) * inp.paidLeaveDays;

  // Tăng ca — đơn giá giờ từ (base + PC trách nhiệm), KHÔNG nhân hệ số HĐTV (Excel giữ nguyên)
  const hourly = (inp.baseSalary + inp.allowResponsibility) / std / 8;
  const ot150Pay = r0(hourly * pol.otRates.ot150 * inp.ot150Hours);
  const ot170Pay = r0(hourly * pol.otRates.ot170 * inp.ot170Hours);
  const ot200Pay = r0(hourly * pol.otRates.ot200 * inp.ot200Hours);
  const otPay = ot150Pay + ot170Pay + ot200Pay;

  const workPay = workBase + workPcTN;
  const allowancePay = workMeal + workFuel + workPhone + workUniform;
  const gross = workPay + allowancePay + leavePay + otPay + inp.bonus;

  // Miễn thuế — đúng công thức Excel: HĐTV/CTV không được miễn ăn/ĐT/trang phục, chỉ miễn OT.
  const mealCap = pol.mealExemptCapMonthly ?? null;
  const uniformCapMonthly = (pol.uniformCapYear ?? 5_000_000) / 12;
  const exemptMeal = isTV || isCTV ? 0 : (mealCap === null ? workMeal : Math.min(workMeal, mealCap));
  const exemptPhone = isTV || isCTV ? 0 : workPhone;
  const exemptUniform = isTV || isCTV ? 0 : Math.min(workUniform, uniformCapMonthly);
  const exemptOt = otPay;
  const exemptTotal = exemptMeal + exemptPhone + exemptUniform + exemptOt;

  // Bảo hiểm — chỉ khi có lương BHXH và đủ ngày công tối thiểu
  const insured = inp.bhxhSalary > 0 && inp.workDays >= pol.insuranceMinDays;
  const insuranceCompany = insured ? r0(inp.bhxhSalary * pol.insCompanyBp / 10000) : 0;
  const kpcd = insured ? r0(inp.bhxhSalary * pol.kpcdBp / 10000) : 0;
  const insuranceEmployee = insured ? r0(inp.bhxhSalary * pol.insEmployeeBp / 10000) : 0;
  const unionFee = insured && pol.applyUnionFee ? r0(inp.bhxhSalary * pol.unionFeeBp / 10000) : 0;

  // Thuế
  const taxableIncome = r0(gross - exemptTotal);
  let taxedIncome: number, pit: number, deductionPersonal = 0, deductionDependents = 0;
  if (isTV || isCTV) {
    taxedIncome = taxableIncome;
    pit = r0(taxedIncome * pol.ctvPitBp / 10000);
  } else {
    deductionPersonal = pol.deductionPersonal;
    deductionDependents = inp.dependentsCount * pol.deductionDependent;
    taxedIncome = Math.max(0, taxableIncome - insuranceEmployee - unionFee - deductionPersonal - deductionDependents);
    pit = progressivePit(taxedIncome, pol.pitBrackets);
  }

  const netPay = r0(gross - insuranceEmployee - unionFee - pit - inp.advance);

  return {
    workBase, workPcTN, workMeal, workFuel, workPhone, workUniform,
    leavePay, ot150Pay, ot170Pay, ot200Pay, otPay,
    workPay, allowancePay, bonus: inp.bonus,
    gross,
    exemptMeal, exemptPhone, exemptUniform, exemptOt, exemptTotal,
    insuranceCompany, kpcd, insuranceEmployee, unionFee,
    deductionPersonal, deductionDependents, deductionTotal: deductionPersonal + deductionDependents,
    taxableIncome, taxedIncome, pit,
    advanceDeduct: inp.advance, netPay,
  };
}
