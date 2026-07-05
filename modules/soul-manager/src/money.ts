/**
 * SOUL-MANAGER — money.ts
 * Số học decimal CHÍNH XÁC trên chuỗi numeric (Hiến pháp #5).
 * KHÔNG BAO GIỜ cast Number() cho nghiệp vụ tiền/lương — mọi phép tính
 * đi qua BigInt scaled arithmetic, làm tròn half-up có kiểm soát.
 *
 * Quy ước: tiền VND biểu diễn dạng chuỗi 2 chữ số lẻ ("125000.00"),
 * tỷ lệ (rate) tối đa 6 chữ số lẻ ("0.085"), ngày công 2 chữ số lẻ.
 */

/** Parse chuỗi decimal → BigInt ở scale cho trước (half-up nếu thừa lẻ) */
export function parseScaled(value: string | number, scale: number): bigint {
  const s = String(value).trim();
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`Giá trị decimal không hợp lệ: "${s}"`);
  const neg = m[1] === '-';
  const intPart = m[2];
  let frac = m[3] ?? '';
  let unscaled: bigint;
  if (frac.length <= scale) {
    frac = frac.padEnd(scale, '0');
    unscaled = BigInt(intPart + frac);
  } else {
    const kept = frac.slice(0, scale);
    const nextDigit = BigInt(frac[scale]!);
    unscaled = BigInt(intPart + kept) + (nextDigit >= 5n ? 1n : 0n);
  }
  return neg ? -unscaled : unscaled;
}

/** BigInt scaled → chuỗi decimal chuẩn "123.45" */
export function formatScaled(v: bigint, scale: number): string {
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const s = abs.toString().padStart(scale + 1, '0');
  const intPart = s.slice(0, s.length - scale);
  const frac = scale > 0 ? '.' + s.slice(s.length - scale) : '';
  return (neg ? '-' : '') + intPart + frac;
}

/** Chia BigInt với làm tròn half-up (hỗ trợ âm) */
function divHalfUp(num: bigint, den: bigint): bigint {
  if (den === 0n) throw new Error('Chia cho 0');
  const negative = (num < 0n) !== (den < 0n);
  const n = num < 0n ? -num : num;
  const d = den < 0n ? -den : den;
  const q = n / d;
  const r = n % d;
  const rounded = r * 2n >= d ? q + 1n : q;
  return negative ? -rounded : rounded;
}

const S2 = 2; // scale tiền tệ

/** Bộ phép toán tiền tệ (scale 2, chuỗi vào — chuỗi ra) */
export const M = {
  /** Chuẩn hóa về dạng "x.yy" */
  norm(a: string | number): string {
    return formatScaled(parseScaled(a, S2), S2);
  },
  add(a: string, b: string): string {
    return formatScaled(parseScaled(a, S2) + parseScaled(b, S2), S2);
  },
  sub(a: string, b: string): string {
    return formatScaled(parseScaled(a, S2) - parseScaled(b, S2), S2);
  },
  /** So sánh: -1 | 0 | 1 */
  cmp(a: string, b: string): -1 | 0 | 1 {
    const x = parseScaled(a, S2); const y = parseScaled(b, S2);
    return x < y ? -1 : x > y ? 1 : 0;
  },
  min(a: string, b: string): string { return M.cmp(a, b) <= 0 ? M.norm(a) : M.norm(b); },
  max(a: string, b: string): string { return M.cmp(a, b) >= 0 ? M.norm(a) : M.norm(b); },
  isZero(a: string): boolean { return parseScaled(a, S2) === 0n; },
  isNeg(a: string): boolean { return parseScaled(a, S2) < 0n; },

  /**
   * a × num ÷ den — tính chính xác trên hữu tỷ rồi half-up về scale 2.
   * num/den nhận tối đa 6 chữ số lẻ (đủ cho tỷ lệ %, hệ số OT, ngày công).
   */
  mulDiv(a: string, num: string, den: string): string {
    const A = parseScaled(a, S2);           // scale 2
    const N = parseScaled(num, 6);          // scale 6
    const D = parseScaled(den, 6);          // scale 6
    if (D === 0n) throw new Error('Chia cho 0');
    // (A/100 × N/1e6 ÷ (D/1e6)) = A×N/D / 100 → giữ scale 2: A×N/D
    return formatScaled(divHalfUp(A * N, D), S2);
  },

  /** a × rate (rate tối đa 6 lẻ) */
  mulRate(a: string, rate: string): string {
    return M.mulDiv(a, rate, '1');
  },

  /** Làm tròn về đồng nguyên (half-up), giữ dạng "x.00" */
  round0(a: string): string {
    const cents = parseScaled(a, S2);
    const dong = divHalfUp(cents, 100n);
    return formatScaled(dong * 100n, S2);
  },

  sum(values: string[]): string {
    let acc = 0n;
    for (const v of values) acc += parseScaled(v, S2);
    return formatScaled(acc, S2);
  },
};

export interface TaxBracket { up_to: string | null; rate: string }

/**
 * Thuế TNCN lũy tiến từng phần trên thu nhập tính thuế (assessable).
 * Tích lũy ở scale 8 (micro-đồng) để không mất mát giữa các bậc,
 * làm tròn MỘT LẦN về đồng nguyên ở kết quả cuối.
 */
export function progressiveTax(assessable: string, brackets: TaxBracket[]): string {
  const A = parseScaled(assessable, S2);
  if (A <= 0n) return M.norm('0');
  let taxMicro = 0n;              // scale 8
  let prev = 0n;                  // scale 2
  for (const b of brackets) {
    const cap = b.up_to === null ? A : parseScaled(b.up_to, S2);
    const upper = cap < A ? cap : A;
    if (upper > prev) {
      const portion = upper - prev;                 // scale 2
      const rate = parseScaled(b.rate, 6);          // scale 6
      taxMicro += portion * rate;                   // scale 8
    }
    prev = cap;
    if (prev >= A) break;
  }
  const cents = divHalfUp(taxMicro, 1_000_000n);    // về scale 2
  return M.round0(formatScaled(cents, S2));
}
