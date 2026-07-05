/**
 * Money — toán tiền tệ chính xác tuyệt đối.
 *
 * Nguyên tắc: KHÔNG BAO GIỜ dùng float cho tiền. Mọi số tiền lưu dạng
 * numeric(20,2) trong DB (chuỗi như "500000.00"). Trong code, quy về
 * đơn vị nhỏ nhất (xu = 1/100) dưới dạng BigInt để cộng/trừ/so sánh,
 * rồi format lại thành chuỗi 2 chữ số thập phân.
 *
 * VND thực tế không có phần lẻ, nhưng ta vẫn giữ scale 2 để:
 *  - Tương thích ngoại tệ (USD, EUR...)
 *  - Tránh sai số khi tính thuế/tỷ giá trung gian.
 */

const SCALE = 2n;
const SCALE_FACTOR = 100n; // 10^2

/** Chuỗi tiền hợp lệ (chuẩn hoá) → BigInt xu. */
export function toMinor(value: string | number): bigint {
  const s = typeof value === "number" ? value.toFixed(2) : value.trim();
  if (s === "" || s === undefined) return 0n;

  const neg = s.startsWith("-");
  const clean = (neg ? s.slice(1) : s).replace(/,/g, "");

  const [intPart = "0", fracPartRaw = ""] = clean.split(".");
  // Cắt/đệm phần thập phân về đúng 2 chữ số.
  const fracPart = (fracPartRaw + "00").slice(0, 2);

  if (!/^\d+$/.test(intPart) || !/^\d+$/.test(fracPart)) {
    throw new Error(`Money.toMinor: giá trị không hợp lệ "${value}"`);
  }

  const minor = BigInt(intPart) * SCALE_FACTOR + BigInt(fracPart);
  return neg ? -minor : minor;
}

/** BigInt xu → chuỗi "####.##" để ghi DB. */
export function fromMinor(minor: bigint): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const intPart = abs / SCALE_FACTOR;
  const fracPart = abs % SCALE_FACTOR;
  const frac = fracPart.toString().padStart(2, "0");
  return `${neg ? "-" : ""}${intPart.toString()}.${frac}`;
}

/** Cộng danh sách chuỗi tiền → chuỗi tiền. */
export function sum(values: Array<string | number>): string {
  let acc = 0n;
  for (const v of values) acc += toMinor(v);
  return fromMinor(acc);
}

/** a + b */
export function add(a: string, b: string): string {
  return fromMinor(toMinor(a) + toMinor(b));
}

/** a - b */
export function sub(a: string, b: string): string {
  return fromMinor(toMinor(a) - toMinor(b));
}

/**
 * Nhân tiền với hệ số (thuế suất, tỷ giá). Làm tròn nửa lên (round half up).
 * `factor` là chuỗi số thực, ví dụ "0.08" (thuế 8%), "23500" (tỷ giá).
 */
export function multiply(amount: string, factor: string): string {
  const amtMinor = toMinor(amount); // đã *100
  // factor có thể nhiều chữ số thập phân → quy về BigInt với scale 6.
  const factorScale = 6n;
  const factorFactor = 10n ** factorScale;
  const [fi = "0", ffRaw = ""] = factor.replace(/,/g, "").split(".");
  const ff = (ffRaw + "000000").slice(0, 6);
  const factorBig = BigInt(fi) * factorFactor + BigInt(ff);

  // Kết quả có scale (2 + 6). Chia về scale 2, làm tròn nửa lên.
  const raw = amtMinor * factorBig; // scale = 8
  const divisor = 10n ** factorScale; // đưa về scale 2
  const rounded = roundHalfUp(raw, divisor);
  return fromMinor(rounded);
}

/** Chia BigInt làm tròn nửa lên (round half up), giữ dấu. */
function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const neg = numerator < 0n;
  const absN = neg ? -numerator : numerator;
  const q = absN / denominator;
  const r = absN % denominator;
  const rounded = r * 2n >= denominator ? q + 1n : q;
  return neg ? -rounded : rounded;
}

/**
 * Tính tiền thuế GTGT từ tiền hàng và thuế suất (%).
 * Ví dụ: taxOf("1000000", 8) = "80000.00".
 */
export function taxOf(subtotal: string, ratePercent: string | number): string {
  const rate =
    typeof ratePercent === "number" ? ratePercent.toString() : ratePercent;
  const factor = rateToFactor(rate); // "8" → "0.080000"
  return multiply(subtotal, factor);
}

/** Đổi thuế suất phần trăm sang hệ số nhân. "8" → "0.080000" (scale 6). */
function rateToFactor(ratePercent: string): string {
  const [i = "0", f = ""] = ratePercent.replace(/,/g, "").split(".");
  // Giá trị rate tại scale 6.
  const val = BigInt(i) * 1_000_000n + BigInt((f + "000000").slice(0, 6));
  // Chia 100 để ra hệ số (giữ nguyên scale 6).
  const per100 = val / 100n;
  const intPart = per100 / 1_000_000n;
  const fracPart = (per100 % 1_000_000n).toString().padStart(6, "0");
  return `${intPart}.${fracPart}`;
}

/** So sánh: trả -1, 0, 1. */
export function compare(a: string, b: string): number {
  const av = toMinor(a);
  const bv = toMinor(b);
  return av < bv ? -1 : av > bv ? 1 : 0;
}

export function isZero(a: string): boolean {
  return toMinor(a) === 0n;
}

export function isNegative(a: string): boolean {
  return toMinor(a) < 0n;
}

export function abs(a: string): string {
  const m = toMinor(a);
  return fromMinor(m < 0n ? -m : m);
}

/** Format hiển thị: "500000.00" → "500.000 ₫". */
export function formatVND(value: string): string {
  const minor = toMinor(value);
  const abs = minor < 0n ? -minor : minor;
  const intPart = (abs / SCALE_FACTOR).toString();
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${minor < 0n ? "-" : ""}${grouped} ₫`;
}
