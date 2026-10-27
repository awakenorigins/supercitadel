/**
 * V12 ⑥ — ĐA TIỀN TỆ TẦNG CORE (Q5 anh Nắng chốt: toàn hệ thống, VND là tiền hạch toán gốc).
 *
 * Chuẩn chung mọi module (soi từ MISA SME 2026: mọi chứng từ có bộ 3
 * CurrencyID + ExchangeRate + AmountOC, tiền quy đổi VND lưu song song):
 *  - `currency`    — mã tiền tệ chứng từ (VND mặc định).
 *  - `exchangeRate`— tỷ giá quy đổi về VND tại NGÀY GIAO DỊCH (VND = 1).
 *  - `amountOC`    — số tiền NGUYÊN TỆ (Original Currency).
 *  - `amount`      — số tiền QUY ĐỔI VND (= amountOC × exchangeRate) — mọi bút
 *                    toán, báo cáo, sổ sách đều dùng số này.
 *  - `rateNote`    — ghi chú nguồn tỷ giá (VD "TGNH VCB 10/07").
 *  - `rateDate`    — ngày áp tỷ giá (mặc định = ngày chứng từ).
 */

/** Các tiền tệ hỗ trợ sẵn (mã ISO 4217). Module có thể mở rộng. */
export const CURRENCIES = ['VND', 'USD', 'EUR', 'JPY', 'CNY', 'KRW', 'SGD', 'THB', 'GBP', 'AUD'] as const;
export type CurrencyCode = (typeof CURRENCIES)[number] | (string & {});

/** Tiền hạch toán gốc toàn hệ thống. */
export const BASE_CURRENCY = 'VND';

/** Thông tin đa tiền tệ per-chứng-từ (embed vào document schema mỗi module). */
export interface DocCurrencyInfo {
  /** Mã tiền tệ chứng từ. Mặc định "VND". */
  currency: CurrencyCode;
  /** Tỷ giá về VND tại ngày giao dịch. VND = "1". Chuỗi số (tránh float). */
  exchangeRate: string;
  /** Số tiền nguyên tệ (chuỗi số). Với VND thì = amount. */
  amountOC: string;
  /** Ghi chú nguồn tỷ giá. */
  rateNote?: string | null;
  /** Ngày áp tỷ giá (YYYY-MM-DD). */
  rateDate?: string | null;
}

/** Input đa tiền tệ tùy chọn khi tạo chứng từ (mọi field optional, mặc định VND). */
export interface DocCurrencyInput {
  currency?: string;
  exchangeRate?: string;
  rateNote?: string;
  rateDate?: string;
}

const RATE_RE = /^\d+(\.\d{1,6})?$/;

/**
 * Chuẩn hóa input đa tiền tệ + tính tiền quy đổi VND.
 * - amountOC là số tiền user nhập (nguyên tệ của chứng từ).
 * - Trả về { info, amountVND }: info để lưu vào document, amountVND để hạch toán.
 * - VND: rate ép = 1, amountVND = amountOC.
 * - Ngoại tệ: exchangeRate BẮT BUỘC > 0; amountVND = round2(amountOC × rate).
 * Ném Error message tiếng Việt khi input sai (caller wrap thành ValidationError).
 */
export function resolveDocCurrency(
  amountOC: string,
  input?: DocCurrencyInput,
  docDate?: string,
): { info: DocCurrencyInfo; amountVND: string } {
  const cur = (input?.currency ?? BASE_CURRENCY).toUpperCase().trim();
  if (!/^[A-Z]{3}$/.test(cur)) throw new Error('Mã tiền tệ phải là 3 chữ cái (VD VND, USD)');

  if (cur === BASE_CURRENCY) {
    return {
      info: { currency: BASE_CURRENCY, exchangeRate: '1', amountOC, rateNote: input?.rateNote ?? null, rateDate: null },
      amountVND: amountOC,
    };
  }

  const rate = (input?.exchangeRate ?? '').trim();
  if (!rate) throw new Error(`Chứng từ ${cur} phải có tỷ giá quy đổi VND (exchangeRate)`);
  if (!RATE_RE.test(rate) || Number(rate) <= 0) throw new Error('Tỷ giá phải là số dương (tối đa 6 số lẻ)');

  // Nhân bằng BigInt để không lệch float: amountOC (2 lẻ) × rate (6 lẻ) → làm tròn 2 lẻ.
  const amountVND = mulMoney(amountOC, rate);
  return {
    info: {
      currency: cur,
      exchangeRate: rate,
      amountOC,
      rateNote: input?.rateNote ?? null,
      rateDate: input?.rateDate ?? docDate ?? null,
    },
    amountVND,
  };
}

/** Nhân tiền (chuỗi, 2 số lẻ) với hệ số (tối đa 6 số lẻ) — BigInt, round half-up, không lệch float. */
export function mulMoney(amount: string, factor: string): string {
  const toScaled = (v: string, scale: number): bigint => {
    const neg = v.startsWith('-');
    const s = neg ? v.slice(1) : v;
    const [i, f = ''] = s.split('.');
    const frac = (f + '0'.repeat(scale)).slice(0, scale);
    const n = BigInt(i + frac);
    return neg ? -n : n;
  };
  const a = toScaled(amount, 2); // cents
  const b = toScaled(factor, 6); // micro
  const prod = a * b; // scale 8
  const div = 1_000_000n; // về scale 2
  const half = div / 2n;
  const q = prod >= 0n ? (prod + half) / div : -((-prod + half) / div);
  const abs = q < 0n ? -q : q;
  const int = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${q < 0n ? '-' : ''}${int}.${frac}`;
}
