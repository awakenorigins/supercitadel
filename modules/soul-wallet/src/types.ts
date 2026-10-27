/**
 * SOUL-WALLET 1A — kiểu dữ liệu chung
 * Mặt cắt ⑤: giao tiếp CHỈ qua event bus, payload LUÔN mang org_id.
 * Module không import thẳng module khác — host tiêm (inject) bus + db.
 *
 * KHÁC BIỆT so với module org-scope (kho/hr): Soul-Wallet là VÍ CÁ NHÂN —
 * dữ liệu scope theo (org_id, owner_user_id). Isolation chính là APP-LEVEL:
 * mọi service bắt buộc lọc cả orgId lẫn ownerId từ ctx (JWT), không bao giờ
 * nhận từ client. RLS org-level là giáp lớp 2.
 */
import type { PgDatabase } from 'drizzle-orm/pg-core';

/** Database instance do host tiêm vào (node-postgres / pglite / driver pg bất kỳ của Drizzle) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SwDb = PgDatabase<any, any, any>;

/** Payload event bắt buộc mang org_id (mặt cắt ⑤) */
export interface SwEventPayload {
  org_id: string;
  owner_user_id?: string;
  [key: string]: unknown;
}

/** Event bus trung lập — host (Citadel core) cung cấp implementation thật */
export interface EventBus {
  emit(name: `sw.${string}`, payload: SwEventPayload): void | Promise<void>;
}

/** Ngữ cảnh tenant + chủ ví cho MỌI lời gọi service/tool.
 *  orgId + ownerId lấy từ JWT tại host-adapter — client không có quyền khai. */
export interface SwCtx {
  db: SwDb;
  orgId: string;
  /** Chủ ví — bắt buộc. Ví cá nhân per-user trong org. */
  ownerId: string;
  bus: EventBus;
}

/** Lỗi nghiệp vụ có mã — Tiểu Tâm đọc code để phản hồi người dùng chính xác */
export class SwError extends Error {
  constructor(
    public code:
      | 'ACCOUNT_NOT_FOUND' | 'ACCOUNT_ARCHIVED' | 'ACCOUNT_HAS_BALANCE'
      | 'CONTACT_NOT_FOUND' | 'CATEGORY_NOT_FOUND' | 'CATEGORY_KIND_MISMATCH'
      | 'TX_NOT_FOUND' | 'TX_ALREADY_REVERSED' | 'TX_NOT_POSTED'
      | 'TRANSFER_SAME_ACCOUNT' | 'SPLIT_SUM_MISMATCH' | 'AMOUNT_INVALID'
      | 'BUDGET_NOT_FOUND' | 'GOAL_NOT_FOUND' | 'GOAL_ALREADY_REACHED'
      | 'DEBT_NOT_FOUND' | 'DEBT_ALREADY_SETTLED' | 'PAYMENT_EXCEEDS_REMAINING'
      | 'RECURRING_NOT_FOUND' | 'RULE_NOT_FOUND'
      | 'IMPORT_JOB_NOT_FOUND' | 'IMPORT_ROW_INVALID' | 'IMPORT_ALREADY_COMMITTED'
      | 'PRESET_UNKNOWN' | 'FILE_PARSE_ERROR'
      | 'RECONCILE_NO_DIFF' | 'INVALID_INPUT' | 'PERIOD_INVALID',
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'SwError';
  }
}

/** Bus no-op cho môi trường standalone/test khi host chưa nối event bus */
export const noopBus: EventBus = { emit: () => {} };

// ── Hằng nghiệp vụ ─────────────────────────────────────────────────────────
export const ACCOUNT_TYPES = ['cash', 'bank', 'ewallet', 'credit_card', 'savings', 'loan', 'investment', 'asset'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const TX_KINDS = ['income', 'expense', 'transfer', 'refund', 'fee', 'adjust'] as const;
export type TxKind = (typeof TX_KINDS)[number];

export const CONTACT_KINDS = ['customer', 'lender', 'borrower', 'vendor', 'other'] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

export const DEBT_DIRECTIONS = ['receivable', 'payable'] as const; // receivable = người ta nợ MÌNH
export type DebtDirection = (typeof DEBT_DIRECTIONS)[number];

export const RECURRING_KINDS = ['subscription', 'bill', 'income'] as const;
export type RecurringKind = (typeof RECURRING_KINDS)[number];

export const RECURRING_FREQS = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type RecurringFreq = (typeof RECURRING_FREQS)[number];

/** 6 Hũ JARS — preset ngân sách quốc dân VN */
export const SIX_JARS = [
  { code: 'NEC',  name: 'Hũ Thiết yếu (NEC)',      percent: 55 },
  { code: 'FFA',  name: 'Hũ Tự do tài chính (FFA)', percent: 10 },
  { code: 'EDU',  name: 'Hũ Giáo dục (EDU)',        percent: 10 },
  { code: 'LTS',  name: 'Hũ Tiết kiệm dài hạn (LTS)', percent: 10 },
  { code: 'PLAY', name: 'Hũ Hưởng thụ (PLAY)',      percent: 10 },
  { code: 'GIVE', name: 'Hũ Cho đi (GIVE)',         percent: 5 },
] as const;

/** Bucket aging công nợ — chuẩn 5 tầng */
export const AGING_BUCKETS = ['0-7', '8-30', '31-60', '61-90', '90+'] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

/** Chuẩn hóa tiền VND: nhận number|string → chuỗi số nguyên không âm dấu tùy hàm.
 *  numeric(18,0) — KHÔNG float. Ném AMOUNT_INVALID nếu lệch chuẩn. */
export function vnd(input: unknown, field = 'amount'): string {
  const s = typeof input === 'number' ? String(Math.trunc(input)) : String(input ?? '').trim().replace(/[,._\s]/g, '');
  if (!/^-?\d+$/.test(s)) throw new SwError('AMOUNT_INVALID', `Trường ${field} phải là số nguyên VND, nhận: ${String(input)}`);
  if (s.replace('-', '').length > 18) throw new SwError('AMOUNT_INVALID', `Trường ${field} vượt 18 chữ số`);
  return s;
}

/** Cộng/trừ tiền dạng chuỗi bằng BigInt — tuyệt đối không float */
export const money = {
  add: (a: string, b: string): string => (BigInt(a) + BigInt(b)).toString(),
  sub: (a: string, b: string): string => (BigInt(a) - BigInt(b)).toString(),
  neg: (a: string): string => (-BigInt(a)).toString(),
  cmp: (a: string, b: string): number => { const d = BigInt(a) - BigInt(b); return d === 0n ? 0 : d > 0n ? 1 : -1; },
  min: (a: string, b: string): string => (BigInt(a) <= BigInt(b) ? a : b),
  max: (a: string, b: string): string => (BigInt(a) >= BigInt(b) ? a : b),
  isNeg: (a: string): boolean => BigInt(a) < 0n,
  isPos: (a: string): boolean => BigInt(a) > 0n,
  abs: (a: string): string => (BigInt(a) < 0n ? (-BigInt(a)).toString() : a),
  /** phần trăm nguyên: amount * pct / 100 (làm tròn xuống) */
  pct: (a: string, pct: number): string => ((BigInt(a) * BigInt(Math.round(pct * 100))) / 10000n).toString(),
};

/** yyyy-mm-dd của Date theo UTC (module chỉ so sánh ngày lịch) */
export function isoDay(d: Date): string { return d.toISOString().slice(0, 10); }
/** yyyy-mm-01 đầu tháng */
export function isoMonth(d: Date): string { return `${d.toISOString().slice(0, 7)}-01`; }
