/**
 * SOUL-WALLET 1A — Zod schemas (mặt cắt ⑦: validate tại biên)
 * Tiền nhận number|string ("320000" / "320,000" / 320000) → chuẩn hóa chuỗi
 * số nguyên VND qua vnd(). Ngày nhận ISO string.
 */
import { z } from 'zod';
import { vnd, ACCOUNT_TYPES, TX_KINDS, CONTACT_KINDS, DEBT_DIRECTIONS, RECURRING_KINDS, RECURRING_FREQS } from '../types.js';

const zVnd = z.union([z.string(), z.number()]).transform((v) => vnd(v));
const zVndOpt = zVnd.optional();
const zId = z.string().uuid();
const zDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ngày dạng yyyy-mm-dd');
const zIso = z.string().min(10); // ISO datetime hoặc yyyy-mm-dd

// ── Account ────────────────────────────────────────────────────────────────
export const accountCreateSchema = z.object({
  name: z.string().min(1),
  type: z.enum(ACCOUNT_TYPES),
  opening_balance: zVnd.default('0'),
  statement_day: z.coerce.number().int().min(1).max(28).optional(),
  due_day: z.coerce.number().int().min(1).max(28).optional(),
  credit_limit: zVndOpt,
  term_months: z.coerce.number().int().min(1).optional(),
  interest_rate: z.coerce.number().min(0).optional(),
  maturity_date: zDay.optional(),
  icon: z.string().optional(),
  note: z.string().optional(),
});
export type AccountCreateInput = z.infer<typeof accountCreateSchema>;

export const accountUpdateSchema = accountCreateSchema.partial().extend({ id: zId });
export const accountCloseSchema = z.object({ id: zId, force: z.boolean().default(false) });
export const accountListSchema = z.object({ include_archived: z.boolean().default(false) });

// ── Catalog ────────────────────────────────────────────────────────────────
export const contactUpsertSchema = z.object({
  id: zId.optional(),
  name: z.string().min(1),
  kind: z.enum(CONTACT_KINDS).default('other'),
  phone: z.string().optional(),
  note: z.string().optional(),
});
export const categoryUpsertSchema = z.object({
  id: zId.optional(),
  name: z.string().min(1),
  kind: z.enum(['income', 'expense']),
  parent_id: zId.optional(),
  icon: z.string().optional(),
});
export const tagUpsertSchema = z.object({ id: zId.optional(), name: z.string().min(1) });

// ── Transaction ────────────────────────────────────────────────────────────
export const txCreateSchema = z.object({
  kind: z.enum(TX_KINDS),
  occurred_at: zIso,
  account_id: zId,
  counter_account_id: zId.optional(),     // bắt buộc khi kind=transfer
  contact_id: zId.optional(),
  category_id: zId.optional(),
  amount: zVnd,
  memo: z.string().optional(),
  ref_no: z.string().optional(),
  status: z.enum(['posted', 'draft']).default('posted'),
  splits: z.array(z.object({ category_id: zId.optional(), amount: zVnd, note: z.string().optional() })).optional(),
  tag_ids: z.array(zId).optional(),
  attachments: z.array(z.object({
    file_name: z.string().min(1), mime: z.string().optional(),
    size_bytes: z.coerce.number().int().optional(), storage_key: z.string().optional(),
  })).optional(),
  import_row_id: zId.optional(),
  meta: z.record(z.unknown()).optional(),
});
export type TxCreateInput = z.infer<typeof txCreateSchema>;

export const txReverseSchema = z.object({ id: zId, reason: z.string().optional() });
export const transferSchema = z.object({
  occurred_at: zIso,
  from_account_id: zId,
  to_account_id: zId,
  amount: zVnd,
  memo: z.string().optional(),
});
export const txSearchSchema = z.object({
  from: zDay.optional(), to: zDay.optional(),
  kind: z.enum(TX_KINDS).optional(),
  account_id: zId.optional(),
  category_id: zId.optional(),
  contact_id: zId.optional(),
  memo_contains: z.string().optional(),
  min_amount: zVndOpt, max_amount: zVndOpt,
  status: z.enum(['posted', 'draft', 'reversed']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});
export type TxSearchInput = z.infer<typeof txSearchSchema>;

// ── Budget / Goal ──────────────────────────────────────────────────────────
export const budgetUpsertSchema = z.object({
  id: zId.optional(),
  name: z.string().min(1),
  amount: zVnd,
  category_id: zId.optional(),
  jar_code: z.enum(['NEC', 'FFA', 'EDU', 'LTS', 'PLAY', 'GIVE']).optional(),
  rollover: z.boolean().default(false),
  period: zDay.optional(),               // yyyy-mm-01, mặc định tháng hiện tại
});
export const sixJarsApplySchema = z.object({
  monthly_income: zVnd,                  // tổng thu dự kiến/tháng → chia 6 hũ
  period: zDay.optional(),
});
export const budgetStatusSchema = z.object({ period: zDay.optional() });

export const goalCreateSchema = z.object({
  name: z.string().min(1),
  target: zVnd,
  deadline: zDay.optional(),
  account_id: zId.optional(),
});
export const goalContributeSchema = z.object({
  goal_id: zId,
  amount: zVnd,
  from_account_id: zId.optional(),       // có → sinh transaction expense 'Tiết kiệm'
  occurred_at: zIso.optional(),
});

// ── Debt ───────────────────────────────────────────────────────────────────
export const debtCreateSchema = z.object({
  contact_id: zId.optional(),
  contact_name: z.string().optional(),   // tiện Tiểu Tâm: tự tạo contact nếu chưa có
  direction: z.enum(DEBT_DIRECTIONS),
  principal: zVnd,
  interest_rate: z.coerce.number().min(0).default(0),
  start_date: zDay,
  due_date: zDay.optional(),
  note: z.string().optional(),
  account_id: zId.optional(),            // có → sinh transaction dòng tiền gốc
});
export const debtPaySchema = z.object({
  debt_id: zId,
  amount: zVnd,
  paid_at: zDay,
  account_id: zId.optional(),            // có → sinh transaction dòng tiền trả
  note: z.string().optional(),
});
export const debtListSchema = z.object({
  direction: z.enum(DEBT_DIRECTIONS).optional(),
  status: z.enum(['open', 'settled']).optional(),
  as_of: zDay.optional(),
});

// ── Recurring ──────────────────────────────────────────────────────────────
export const recurringUpsertSchema = z.object({
  id: zId.optional(),
  name: z.string().min(1),
  kind: z.enum(RECURRING_KINDS),
  account_id: zId,
  category_id: zId.optional(),
  contact_id: zId.optional(),
  amount: zVnd,
  freq: z.enum(RECURRING_FREQS),
  interval_n: z.coerce.number().int().min(1).default(1),
  next_run_at: zDay,
  auto_post: z.boolean().default(false),
  active: z.boolean().default(true),
});
export const recurringRunSchema = z.object({ now: zDay.optional() });
export const recurringUpcomingSchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

// ── Rules ──────────────────────────────────────────────────────────────────
export const ruleUpsertSchema = z.object({
  id: zId.optional(),
  name: z.string().min(1),
  priority: z.coerce.number().int().default(100),
  match: z.object({
    memo_contains: z.string().optional(),
    payee_contains: z.string().optional(),
    min_amount: zVndOpt, max_amount: zVndOpt,
    account_id: zId.optional(),
    kind: z.enum(TX_KINDS).optional(),
  }),
  set_fields: z.object({
    category_id: zId.optional(),
    contact_id: zId.optional(),
    tag_ids: z.array(zId).optional(),
  }),
  active: z.boolean().default(true),
});
export const ruleTestSchema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });

// ── Import ─────────────────────────────────────────────────────────────────
export const importCreateSchema = z.object({
  file_name: z.string().min(1),
  preset: z.enum(['vcb', 'tcb', 'mb', 'acb', 'bidv', 'generic']),
  account_id: zId,
  /** nội dung file base64 (xlsx/csv) — route nhận multipart rồi encode */
  content_base64: z.string().min(4),
});
export const importPreviewSchema = z.object({ job_id: zId });
export const importCommitSchema = z.object({
  job_id: zId,
  skip_duplicates: z.boolean().default(true),
});

// ── Reconcile / Reports / Charts ───────────────────────────────────────────
export const reconcileSchema = z.object({
  account_id: zId,
  actual_balance: zVnd,
  note: z.string().optional(),
  occurred_at: zIso.optional(),
});
export const rangeSchema = z.object({ from: zDay.optional(), to: zDay.optional() });
export const monthSchema = z.object({ month: zDay.optional() });
export const candlesSchema = z.object({
  account_id: zId.optional(),            // bỏ trống = gộp toàn bộ ví
  from: zDay.optional(), to: zDay.optional(),
});
export const runwaySchema = z.object({ horizon_days: z.coerce.number().int().min(7).max(365).default(30) });
export const anomalyScanSchema = z.object({ lookback_days: z.coerce.number().int().min(30).max(365).default(90) });
export const summarySchema = z.object({});
export const scheduledTasksSchema = z.object({ now: zDay.optional() });
