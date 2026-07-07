/**
 * SOUL-RESTAURANT — số học tiền tệ & số lượng fixed-point trên BigInt.
 * Hiến pháp §5: tiền dùng decimal, KHÔNG cast Number(), không vùng xám.
 *  - Tiền  : scale 2 (numeric(14,2) trong DB) — vào/ra dạng string "45000.00"
 *  - Lượng : scale 3 (numeric(12,3))          — hỗ trợ 0.5 phần / 0.250 kg
 *  - Phần trăm: scale 2 (numeric(5,2))
 * Làm tròn: half-up trên số KHÔNG ÂM (mọi dòng tiền module đều ≥ 0;
 * chiết khấu bị cap ≤ subtotal trước khi trừ).
 */

export class MoneyError extends Error {
  constructor(message: string) { super(message); this.name = 'MoneyError'; }
}

const NUM_RE = /^-?\d+(\.\d+)?$/;

function parseScaled(v: string | number, scale: number, label: string): bigint {
  const s = (typeof v === 'number' ? String(v) : String(v)).trim();
  if (!NUM_RE.test(s)) throw new MoneyError(`${label} không hợp lệ: "${v}"`);
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const [iRaw, fRaw = ''] = body.split('.');
  if (fRaw.length > scale) {
    throw new MoneyError(`${label} quá ${scale} chữ số thập phân: "${v}"`);
  }
  const n = BigInt(iRaw + fRaw.padEnd(scale, '0'));
  return neg ? -n : n;
}

function formatScaled(n: bigint, scale: number): string {
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const s = abs.toString().padStart(scale + 1, '0');
  const i = s.slice(0, s.length - scale);
  const f = scale > 0 ? '.' + s.slice(s.length - scale) : '';
  return (neg ? '-' : '') + i + f;
}

/** parse tiền (scale 2) → bigint */
export const d2 = (v: string | number): bigint => parseScaled(v, 2, 'Số tiền');
/** parse số lượng (scale 3) → bigint */
export const d3 = (v: string | number): bigint => parseScaled(v, 3, 'Số lượng');
/** parse phần trăm (scale 2) → bigint */
export const p2 = (v: string | number): bigint => parseScaled(v, 2, 'Phần trăm');

/** bigint scale2 → chuỗi "12345.67" (khớp numeric(14,2)) */
export const f2 = (n: bigint): string => formatScaled(n, 2);
/** bigint scale3 → chuỗi "12.500" */
export const f3 = (n: bigint): string => formatScaled(n, 3);

/** Chia làm tròn half-up, num ≥ 0 bắt buộc (guard nghiệp vụ) */
export function roundDivNonNeg(num: bigint, den: bigint): bigint {
  if (num < 0n || den <= 0n) {
    throw new MoneyError(`roundDivNonNeg nhận số âm (num=${num}, den=${den})`);
  }
  return (2n * num + den) / (2n * den);
}

/** (đơn giá + option, scale2) × (số lượng, scale3) → thành tiền scale2 */
export function mulPriceQty(price2: bigint, qty3: bigint): bigint {
  return roundDivNonNeg(price2 * qty3, 1000n);
}

/** (lượng scale3) × (lượng scale3) → lượng scale3 (định lượng combo × recipe) */
export function mulQty(a3: bigint, b3: bigint): bigint {
  return roundDivNonNeg(a3 * b3, 1000n);
}

/** amount(scale2) × pct(scale2)/100 → scale2 */
export function pctOf(amount2: bigint, pct2: bigint): bigint {
  return roundDivNonNeg(amount2 * pct2, 10000n);
}

/** Thuế GỘP TRONG GIÁ: tax = gross × r/(100+r) — giá menu đã gồm VAT (mặc định VN) */
export function taxFromGross(gross2: bigint, rate2: bigint): bigint {
  if (rate2 <= 0n) return 0n;
  return roundDivNonNeg(gross2 * rate2, 10000n + rate2);
}

/** Thuế CỘNG NGOÀI: tax = net × r/100 */
export function taxOnNet(net2: bigint, rate2: bigint): bigint {
  if (rate2 <= 0n) return 0n;
  return pctOf(net2, rate2);
}

/** So sánh -1|0|1 */
export function cmp(a: bigint, b: bigint): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** min */
export const minBig = (a: bigint, b: bigint): bigint => (a < b ? a : b);

/** Định dạng hiển thị VND: "1.234.567₫" (bỏ .00 vì VND không dùng xu) */
export function fmtVnd(v: string | bigint): string {
  const n = typeof v === 'bigint' ? v : d2(v);
  const whole = roundDivNonNeg(n < 0n ? -n : n, 100n);
  const s = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0n ? '-' : '') + s + '₫';
}

/** Định dạng số lượng gọn: "2" | "0.5" | "1.25" (bỏ số 0 thừa) */
export function fmtQty(v: string | bigint): string {
  const s = typeof v === 'bigint' ? f3(v) : f3(d3(v));
  return s.replace(/\.?0+$/, '');
}
