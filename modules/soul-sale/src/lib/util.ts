/** SOUL-SALE 1A — util.ts: tiền VND (numeric 18,0 ↔ BigInt), chuẩn hóa tiếng Việt, kỳ, sinh mã. */
import { sql } from 'drizzle-orm';
import { ssCounters } from '../schema.js';
import type { Db, Ctx } from '../contract.js';

/* ---- Tiền VND: lưu string numeric(18,0), tính bằng BigInt ---- */
export type Vnd = string;
export const ZERO: Vnd = '0';
export const addV = (...xs: Vnd[]): Vnd => xs.reduce((a, b) => (BigInt(a) + BigInt(b || '0')).toString(), '0');
export const subV = (a: Vnd, b: Vnd): Vnd => (BigInt(a) - BigInt(b || '0')).toString();
export const cmpV = (a: Vnd, b: Vnd): number => { const d = BigInt(a) - BigInt(b); return d === 0n ? 0 : d > 0n ? 1 : -1; };
export const mulQty = (price: Vnd, qty: number): Vnd => (BigInt(price) * BigInt(qty)).toString();
/** nhân phần trăm (pct dạng '10.50') — scale 2, làm tròn về 0 */
export const pctOf = (amount: Vnd, pct: string): Vnd =>
  ((BigInt(amount) * BigInt(Math.round(parseFloat(pct || '0') * 100))) / 10000n).toString();
/** parse tiền từ chuỗi file import: '1.234.567' | '1,234,567' | '1234567đ' → '1234567' */
export const parseMoney = (raw: unknown): Vnd => {
  if (raw === null || raw === undefined) return '0';
  const s = String(raw).trim();
  const neg = s.startsWith('-') || s.startsWith('(');
  const digits = s.replace(/[^0-9]/g, '');
  if (!digits) return '0';
  return (neg ? '-' : '') + digits.replace(/^0+(?=\d)/, '');
};
export const fmtV = (v: Vnd): string => BigInt(v).toLocaleString('vi-VN');

/* ---- Tiếng Việt: bỏ dấu, lowercase, gộp khoảng trắng — phục vụ match/dup ---- */
export const vnNorm = (s: string): string =>
  (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

export const normPhone = (s: string | null | undefined): string | null => {
  if (!s) return null;
  const d = String(s).replace(/[^0-9]/g, '');
  if (!d) return null;
  return d.startsWith('84') ? '0' + d.slice(2) : d;
};

/* ---- Kỳ YYYY-MM ---- */
export const periodOf = (d: Date): string => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
export const nowOf = (ctx: Ctx): Date => ctx.now ?? new Date();

/* ---- Sinh mã tuần tự per-org qua ss_counters (atomic upsert) ---- */
export async function nextCode(db: Db, ctx: Ctx, prefix: string, opts?: { period?: string; pad?: number }): Promise<string> {
  const key = opts?.period ? `${prefix}-${opts.period.replace('-', '')}` : prefix;
  const rows = (await db
    .insert(ssCounters)
    .values({ orgId: ctx.orgId, key, value: 1 })
    .onConflictDoUpdate({ target: [ssCounters.orgId, ssCounters.key], set: { value: sql`${ssCounters.value} + 1` } })
    .returning({ value: ssCounters.value })) as { value: number }[];
  const n = rows[0]!.value;
  return `${key}-${String(n).padStart(opts?.pad ?? 4, '0')}`;
}

export class SsError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'SsError'; }
}
export const bad = (code: string, message: string): never => { throw new SsError(code, message); };
