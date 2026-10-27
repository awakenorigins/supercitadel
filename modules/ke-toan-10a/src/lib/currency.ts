/**
 * V12 ⑥ — Đa tiền tệ (MIRROR chuẩn core `packages/core/src/currency.ts`).
 * Module này standalone (không dep @citadel/core) nên mirror helper — logic
 * PHẢI giữ đồng bộ với bản core. Chuẩn: VND là tiền hạch toán gốc;
 * chứng từ ngoại tệ lưu bộ 3 currency + exchangeRate + amountOC (soi Misa),
 * amount hạch toán luôn là VND quy đổi tại ngày giao dịch.
 */
import { ValidationError } from "./errors.js";

export const BASE_CURRENCY = "VND";

export interface DocCurrencyInput {
  currency?: string;
  exchangeRate?: string;
  rateNote?: string;
  rateDate?: string;
}

export interface DocCurrencyResolved {
  currency: string;
  exchangeRate: string;
  amountOC: string;
  rateNote: string | null;
  rateDate: string | null;
  /** Số tiền quy đổi VND — dùng cho hạch toán/bút toán/báo cáo. */
  amountVND: string;
}

const RATE_RE = /^\d+(\.\d{1,6})?$/;

/** Nhân tiền (2 số lẻ) với tỷ giá (≤6 số lẻ) bằng BigInt — round half-up, không lệch float. */
export function mulRate(amount: string, rate: string): string {
  const toScaled = (v: string, scale: number): bigint => {
    const neg = v.startsWith("-");
    const s = neg ? v.slice(1) : v;
    const [i, f = ""] = s.split(".");
    const frac = (f + "0".repeat(scale)).slice(0, scale);
    const n = BigInt(i + frac);
    return neg ? -n : n;
  };
  const a = toScaled(amount, 2);
  const b = toScaled(rate, 6);
  const prod = a * b;
  const div = 1_000_000n;
  const half = div / 2n;
  const q = prod >= 0n ? (prod + half) / div : -((-prod + half) / div);
  const abs = q < 0n ? -q : q;
  return `${q < 0n ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

/**
 * Chuẩn hóa input đa tiền tệ: amountOC = tiền user nhập (nguyên tệ).
 * VND → rate=1, amountVND=amountOC. Ngoại tệ → BẮT BUỘC exchangeRate > 0.
 */
export function resolveDocCurrency(
  amountOC: string,
  input?: DocCurrencyInput,
  docDate?: string,
): DocCurrencyResolved {
  const cur = (input?.currency ?? BASE_CURRENCY).toUpperCase().trim();
  if (!/^[A-Z]{3}$/.test(cur)) {
    throw new ValidationError("Mã tiền tệ phải là 3 chữ cái (VD VND, USD)");
  }
  if (cur === BASE_CURRENCY) {
    return {
      currency: BASE_CURRENCY,
      exchangeRate: "1",
      amountOC,
      rateNote: input?.rateNote ?? null,
      rateDate: null,
      amountVND: amountOC,
    };
  }
  const rate = (input?.exchangeRate ?? "").trim();
  if (!rate) {
    throw new ValidationError(`Chứng từ ${cur} phải có tỷ giá quy đổi VND (exchangeRate)`);
  }
  if (!RATE_RE.test(rate) || Number(rate) <= 0) {
    throw new ValidationError("Tỷ giá phải là số dương (tối đa 6 số lẻ)");
  }
  return {
    currency: cur,
    exchangeRate: rate,
    amountOC,
    rateNote: input?.rateNote ?? null,
    rateDate: input?.rateDate ?? docDate ?? null,
    amountVND: mulRate(amountOC, rate),
  };
}
