/**
 * SOUL-MANAGER — Chính sách pháp lý (CẤU HÌNH ĐƯỢC per-org)
 *
 * ⚠️ Các con số dưới đây là MẶC ĐỊNH theo quy định hiện hành tại thời
 * điểm phát hành module (07/2026) và PHẢI cập nhật khi pháp luật thay đổi
 * (qua hr_settings.policy — không sửa code). Nguồn:
 *   - Giảm trừ gia cảnh 15,5tr / 6,2tr: NQ 110/2025/UBTVQH15 (kỳ thuế 2026)
 *   - Biểu thuế TNCN 5 bậc: Luật Thuế TNCN 109/2025/QH15 (kỳ thuế 2026)
 *   - BHXH 8% + BHYT 1,5% + BHTN 1% (NLĐ): Luật BHXH 41/2024/QH15
 *   - Mức tham chiếu 2,34tr → 2,53tr từ 01/7/2026: NĐ 73/2024 → NĐ 161/2026
 *   - Lương tối thiểu vùng từ 01/01/2026: NĐ 293/2025/NĐ-CP
 *   - OT 150/200/300%, phép năm 12 ngày +1/5 năm: BLLĐ 2019 (Đ98, Đ113, Đ114)
 */

export interface RefLevel { from: string; amount: string }
export interface RegionalWage { from: string; amounts: Record<string, string> }

export interface HrPolicy {
  version: string;
  personal_deduction: string;                 // giảm trừ bản thân /tháng
  dependent_deduction: string;                // giảm trừ mỗi NPT /tháng
  tax_brackets: Array<{ up_to: string | null; rate: string }>;
  insurance: {
    employee: { si: string; hi: string; ui: string };
    employer: { si: string; hi: string; ui: string };
    reference_levels: RefLevel[];             // mức tham chiếu theo mốc hiệu lực
    si_cap_multiplier: string;                // trần BHXH/BHYT = k × tham chiếu
    ui_cap_multiplier: string;                // trần BHTN = k × LTT vùng
    regional_min_wage: RegionalWage[];        // LTT vùng theo mốc hiệu lực
  };
  ot: { weekday: string; weekend: string; holiday: string; premium_tax_exempt: boolean };
  annual_leave: { base_days: string; per_5y_bonus: string };
}

export const DEFAULT_POLICY: HrPolicy = {
  version: 'VN-2026.07',
  personal_deduction: '15500000',
  dependent_deduction: '6200000',
  tax_brackets: [
    { up_to: '10000000', rate: '0.05' },
    { up_to: '30000000', rate: '0.10' },
    { up_to: '60000000', rate: '0.20' },
    { up_to: '100000000', rate: '0.30' },
    { up_to: null, rate: '0.35' },
  ],
  insurance: {
    employee: { si: '0.08', hi: '0.015', ui: '0.01' },
    employer: { si: '0.175', hi: '0.03', ui: '0.01' },
    reference_levels: [
      { from: '2024-07-01', amount: '2340000' },
      { from: '2026-07-01', amount: '2530000' },
    ],
    si_cap_multiplier: '20',
    ui_cap_multiplier: '20',
    regional_min_wage: [
      {
        from: '2024-07-01',
        amounts: { '1': '4960000', '2': '4410000', '3': '3860000', '4': '3450000' },
      },
      {
        from: '2026-01-01',
        amounts: { '1': '5310000', '2': '4730000', '3': '4140000', '4': '3700000' },
      },
    ],
  },
  ot: { weekday: '1.5', weekend: '2.0', holiday: '3.0', premium_tax_exempt: true },
  annual_leave: { base_days: '12', per_5y_bonus: '1' },
};

/** Merge policy đã lưu trong hr_settings.policy đè lên mặc định (shallow theo khối) */
export function mergePolicy(stored: unknown): HrPolicy {
  const s = (stored ?? {}) as Partial<HrPolicy>;
  return {
    ...DEFAULT_POLICY,
    ...s,
    insurance: { ...DEFAULT_POLICY.insurance, ...(s.insurance ?? {}) },
    ot: { ...DEFAULT_POLICY.ot, ...(s.ot ?? {}) },
    annual_leave: { ...DEFAULT_POLICY.annual_leave, ...(s.annual_leave ?? {}) },
  };
}

/** Ngày đầu của kỳ lương YYYY-MM để tra mốc hiệu lực */
export function periodDate(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/** Mức tham chiếu hiệu lực tại kỳ (chọn mốc from lớn nhất ≤ kỳ) */
export function referenceLevelAt(policy: HrPolicy, isoDate: string): string {
  let chosen = policy.insurance.reference_levels[0]?.amount ?? '0';
  for (const lv of policy.insurance.reference_levels) {
    if (lv.from <= isoDate) chosen = lv.amount;
  }
  return chosen;
}

/** Lương tối thiểu vùng hiệu lực tại kỳ */
export function regionalMinWageAt(policy: HrPolicy, isoDate: string, region: number): string {
  let chosen: Record<string, string> = policy.insurance.regional_min_wage[0]?.amounts ?? {};
  for (const rw of policy.insurance.regional_min_wage) {
    if (rw.from <= isoDate) chosen = rw.amounts;
  }
  return chosen[String(region)] ?? chosen['1'] ?? '0';
}
