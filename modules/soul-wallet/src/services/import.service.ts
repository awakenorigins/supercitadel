/**
 * SOUL-WALLET 1A — import.service (máy nhai sao kê)
 * · Preset cột: vcb / tcb / mb / acb / bidv / generic — dò header row thông minh
 *   (bỏ dấu, lowercase), tiền VN "1.234.567" / Excel serial date đều nhai được
 * · dup_hash = sha1(account|ngày|±tiền|memo chuẩn hóa) — chống import 2 lần
 * · Flow: create (parse + gợi ý rule) → preview → commit (skip dup mặc định)
 * · Export: ledger CSV + báo cáo tháng Excel (3 sheet)
 * · Reconcile: số thực tế vs sổ → giao dịch adjust có dấu, audit đầy đủ
 */
import { and, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import type { SwCtx } from '../types.js';
import { SwError, money, isoDay, isoMonth, vnd } from '../types.js';
import {
  swImportJobs, swImportRows, swLedgerEntries, swTransactions, swAccounts, swCategories,
} from '../db/schema.js';
import { own, writeAudit, getOwnAccount, accountBalance } from './ledger.service.js';
import { createTx } from './transaction.service.js';
import { applyRules } from './rule.service.js';
import { donutData, trendData } from './analytics.service.js';
import type { importCreateSchema, importCommitSchema, reconcileSchema } from '../validation/schemas.js';

// ── helpers ────────────────────────────────────────────────────────────────
const deaccent = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
const normHeader = (s: unknown) => deaccent(String(s ?? '')).toLowerCase().trim();

function parseVnAmount(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return String(Math.round(v));
  const s = String(v).replace(/[.,\s₫]|vnd/gi, '').trim();
  if (!/^-?\d+$/.test(s) || s === '' || s === '-') return null;
  return s;
}

function parseVnDate(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return isoDay(v);
  if (typeof v === 'number' && v > 20000) {
    // Excel serial → epoch (không dính bug 1900 vì > 20000)
    return isoDay(new Date(Math.round((v - 25569) * 86400 * 1000)));
  }
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

interface PresetSpec {
  hints: string[];                 // từ khóa nhận diện header row
  date: string[]; debit?: string[]; credit?: string[]; amount?: string[];
  memo: string[]; ref?: string[];
}
export const PRESETS: Record<string, PresetSpec> = {
  vcb: {
    hints: ['ngay giao dich', 'so tien ghi no', 'so tien ghi co'],
    date: ['ngay giao dich'], debit: ['so tien ghi no'], credit: ['so tien ghi co'],
    memo: ['noi dung chi tiet', 'noi dung'], ref: ['so tham chieu'],
  },
  tcb: {
    hints: ['ngay', 'ghi no', 'ghi co'],
    date: ['ngay giao dich', 'ngay'], debit: ['so tien ghi no', 'ghi no'], credit: ['so tien ghi co', 'ghi co'],
    memo: ['mo ta', 'dien giai', 'noi dung'], ref: ['ma giao dich', 'so but toan'],
  },
  mb: {
    hints: ['ngay giao dich', 'ghi no', 'ghi co'],
    date: ['ngay giao dich', 'ngay gd'], debit: ['so tien ghi no', 'ghi no'], credit: ['so tien ghi co', 'ghi co'],
    memo: ['noi dung', 'dien giai'], ref: ['so tham chieu', 'ma gd'],
  },
  acb: {
    hints: ['ngay hieu luc', 'ghi no', 'ghi co'],
    date: ['ngay hieu luc', 'ngay giao dich'], debit: ['ghi no'], credit: ['ghi co'],
    memo: ['mo ta', 'noi dung'], ref: ['so giao dich'],
  },
  bidv: {
    hints: ['ngay gd', 'phat sinh no', 'phat sinh co'],
    date: ['ngay gd', 'ngay giao dich'], debit: ['phat sinh no'], credit: ['phat sinh co'],
    memo: ['dien giai', 'noi dung'], ref: ['so ct', 'so chung tu'],
  },
  generic: {
    hints: ['date', 'amount'],
    date: ['date', 'ngay'], amount: ['amount', 'so tien'],
    debit: ['debit', 'no'], credit: ['credit', 'co'],
    memo: ['memo', 'description', 'noi dung', 'mo ta'], ref: ['ref', 'reference'],
  },
};

function findCol(headers: string[], names: string[] | undefined): number {
  if (!names) return -1;
  for (const n of names) {
    const i = headers.findIndex((h) => h.includes(n));
    if (i >= 0) return i;
  }
  return -1;
}

export function dupHashOf(accountId: string, day: string, signedAmount: string, memo: string): string {
  const normMemo = deaccent(memo).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
  return createHash('sha1').update(`${accountId}|${day}|${signedAmount}|${normMemo}`).digest('hex');
}

export interface ParsedRow {
  occurred_at: string; kind: 'income' | 'expense'; amount: string; memo: string; ref_no?: string;
}

/** Parse buffer xlsx/csv theo preset → mảng dòng chuẩn hóa (kèm lỗi từng dòng) */
export function parseStatement(buf: Buffer, preset: string): { rows: Array<{ row_no: number; raw: unknown[]; parsed?: ParsedRow; error?: string }> } {
  const spec = PRESETS[preset];
  if (!spec) throw new SwError('PRESET_UNKNOWN', `Preset không hỗ trợ: ${preset}`);
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  } catch {
    throw new SwError('FILE_PARSE_ERROR', 'Không đọc được file — cần .xlsx hoặc .csv hợp lệ');
  }
  const sheet = wb.Sheets[wb.SheetNames[0]!];
  if (!sheet) throw new SwError('FILE_PARSE_ERROR', 'File không có sheet dữ liệu');
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' });

  // dò header row: dòng đầu tiên chứa ≥2 hint
  let headerIdx = -1; let headers: string[] = [];
  for (let i = 0; i < Math.min(grid.length, 20); i++) {
    const hs = (grid[i] ?? []).map(normHeader);
    const hitCount = spec.hints.filter((h) => hs.some((x) => x.includes(h))).length;
    if (hitCount >= 2) { headerIdx = i; headers = hs; break; }
  }
  if (headerIdx < 0) throw new SwError('FILE_PARSE_ERROR', `Không tìm thấy dòng tiêu đề khớp preset ${preset}`);

  const cDate = findCol(headers, spec.date);
  const cDebit = findCol(headers, spec.debit);
  const cCredit = findCol(headers, spec.credit);
  const cAmount = findCol(headers, spec.amount);
  const cMemo = findCol(headers, spec.memo);
  const cRef = findCol(headers, spec.ref);
  if (cDate < 0 || (cDebit < 0 && cCredit < 0 && cAmount < 0)) {
    throw new SwError('FILE_PARSE_ERROR', 'Thiếu cột ngày hoặc cột tiền trong file');
  }

  const rows: Array<{ row_no: number; raw: unknown[]; parsed?: ParsedRow; error?: string }> = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = grid[i] ?? [];
    if (r.every((c) => String(c ?? '').trim() === '')) continue;
    const row_no = i + 1;
    const day = parseVnDate(r[cDate]);
    if (!day) { rows.push({ row_no, raw: r, error: 'Ngày không hợp lệ' }); continue; }
    let kind: 'income' | 'expense' | null = null; let amount: string | null = null;
    const debit = cDebit >= 0 ? parseVnAmount(r[cDebit]) : null;
    const credit = cCredit >= 0 ? parseVnAmount(r[cCredit]) : null;
    if (debit && money.isPos(debit)) { kind = 'expense'; amount = debit; }
    else if (credit && money.isPos(credit)) { kind = 'income'; amount = credit; }
    else if (cAmount >= 0) {
      const a = parseVnAmount(r[cAmount]);
      if (a && a !== '0') { kind = money.isNeg(a) ? 'expense' : 'income'; amount = money.abs(a); }
    }
    if (!kind || !amount) { rows.push({ row_no, raw: r, error: 'Không đọc được số tiền' }); continue; }
    rows.push({
      row_no, raw: r,
      parsed: {
        occurred_at: day, kind, amount,
        memo: String(cMemo >= 0 ? r[cMemo] ?? '' : '').trim(),
        ref_no: cRef >= 0 ? String(r[cRef] ?? '').trim() || undefined : undefined,
      },
    });
  }
  return { rows };
}

// ── FLOW: create → preview → commit ────────────────────────────────────────
export async function createImport(ctx: SwCtx, input: z.infer<typeof importCreateSchema>) {
  await getOwnAccount(ctx, input.account_id);
  const buf = Buffer.from(input.content_base64, 'base64');
  const { rows } = parseStatement(buf, input.preset);

  const jobRows = await ctx.db.insert(swImportJobs).values({
    orgId: ctx.orgId, ownerUserId: ctx.ownerId, createdBy: ctx.ownerId,
    fileName: input.file_name, preset: input.preset, accountId: input.account_id,
  }).returning();
  const job = jobRows[0]!;

  const seenInFile = new Set<string>();
  let ok = 0, dup = 0, err = 0;
  for (const r of rows) {
    if (!r.parsed) {
      err++;
      await ctx.db.insert(swImportRows).values({
        orgId: ctx.orgId, ownerUserId: ctx.ownerId, jobId: job.id,
        rowNo: r.row_no, raw: r.raw as never, status: 'error', error: r.error,
      });
      continue;
    }
    const p = r.parsed;
    const signed = p.kind === 'expense' ? money.neg(p.amount) : p.amount;
    const hash = dupHashOf(input.account_id, p.occurred_at, signed, p.memo);

    let dupOf: string | null = null;
    if (seenInFile.has(hash)) dupOf = 'in-file';
    else {
      const prior = await ctx.db.select().from(swImportRows)
        .where(and(own(swImportRows, ctx), eq(swImportRows.dupHash, hash), eq(swImportRows.status, 'committed')))
        .limit(1);
      if (prior[0]?.txId) dupOf = prior[0].txId;
    }
    seenInFile.add(hash);
    if (dupOf) dup++;

    const suggestion = await applyRules(ctx, {
      memo: p.memo, amount: p.amount, account_id: input.account_id, kind: p.kind,
    });
    if (!dupOf) ok++;
    await ctx.db.insert(swImportRows).values({
      orgId: ctx.orgId, ownerUserId: ctx.ownerId, jobId: job.id,
      rowNo: r.row_no, raw: r.raw as never, parsed: p as never,
      dupHash: hash, dupOfTx: dupOf && dupOf !== 'in-file' ? dupOf : null,
      suggestion: suggestion ? (suggestion.set_fields as never) : null,
      status: dupOf ? 'skipped' : 'pending',
      error: dupOf ? 'Trùng (dup-hash)' : null,
    });
  }
  const stats = { total: rows.length, ready: ok, duplicates: dup, errors: err };
  await ctx.db.update(swImportJobs).set({ stats: stats as never, updatedAt: new Date() })
    .where(and(own(swImportJobs, ctx), eq(swImportJobs.id, job.id)));
  await writeAudit(ctx, { action: 'sw.import.create', entity: 'sw_import_jobs', entityId: job.id, after: { file: input.file_name, preset: input.preset, ...stats } });
  return { job_id: job.id, ...stats };
}

export async function previewImport(ctx: SwCtx, jobId: string) {
  const jobs = await ctx.db.select().from(swImportJobs)
    .where(and(own(swImportJobs, ctx), eq(swImportJobs.id, jobId))).limit(1);
  if (!jobs[0]) throw new SwError('IMPORT_JOB_NOT_FOUND', `Không tìm thấy phiên import ${jobId}`);
  const rows = await ctx.db.select().from(swImportRows)
    .where(and(own(swImportRows, ctx), eq(swImportRows.jobId, jobId)));
  return {
    job: { id: jobs[0].id, file_name: jobs[0].fileName, preset: jobs[0].preset, status: jobs[0].status, stats: jobs[0].stats },
    rows: rows.sort((a, b) => a.rowNo - b.rowNo).map((r) => ({
      row_no: r.rowNo, status: r.status, parsed: r.parsed, suggestion: r.suggestion,
      dup_of_tx: r.dupOfTx, error: r.error,
    })),
  };
}

export async function commitImport(ctx: SwCtx, input: z.infer<typeof importCommitSchema>) {
  const jobs = await ctx.db.select().from(swImportJobs)
    .where(and(own(swImportJobs, ctx), eq(swImportJobs.id, input.job_id))).limit(1);
  const job = jobs[0];
  if (!job) throw new SwError('IMPORT_JOB_NOT_FOUND', `Không tìm thấy phiên import ${input.job_id}`);
  if (job.status === 'committed') throw new SwError('IMPORT_ALREADY_COMMITTED', 'Phiên import đã commit rồi');

  const rows = await ctx.db.select().from(swImportRows)
    .where(and(own(swImportRows, ctx), eq(swImportRows.jobId, job.id)));
  let imported = 0, skipped = 0;
  for (const r of rows.sort((a, b) => a.rowNo - b.rowNo)) {
    if (r.status === 'error') { skipped++; continue; }
    if (r.status === 'skipped' && input.skip_duplicates) { skipped++; continue; }
    if (r.status === 'committed') continue;
    const p = r.parsed as ParsedRow | null;
    if (!p) { skipped++; continue; }
    const sug = (r.suggestion ?? {}) as { category_id?: string; contact_id?: string };
    const tx = await createTx(ctx, {
      kind: p.kind, occurred_at: `${p.occurred_at}T00:00:00Z`,
      account_id: job.accountId, amount: p.amount,
      memo: p.memo || `Import dòng ${r.rowNo}`, ref_no: p.ref_no,
      category_id: sug.category_id, contact_id: sug.contact_id,
      import_row_id: r.id, status: 'posted',
    } as never);
    await ctx.db.update(swImportRows).set({ status: 'committed', txId: tx.id })
      .where(and(own(swImportRows, ctx), eq(swImportRows.id, r.id)));
    imported++;
  }
  await ctx.db.update(swImportJobs)
    .set({ status: 'committed', stats: { ...(job.stats as object ?? {}), imported, skipped } as never, updatedAt: new Date() })
    .where(and(own(swImportJobs, ctx), eq(swImportJobs.id, job.id)));
  await writeAudit(ctx, { action: 'sw.import.commit', entity: 'sw_import_jobs', entityId: job.id, after: { imported, skipped } });
  await ctx.bus.emit('sw.import.completed', {
    org_id: ctx.orgId, owner_user_id: ctx.ownerId, job_id: job.id, imported, skipped,
  });
  return { job_id: job.id, imported, skipped };
}

// ── EXPORT ─────────────────────────────────────────────────────────────────
export async function exportLedgerCsv(ctx: SwCtx, opts: { from?: string; to?: string }) {
  const conds = [own(swLedgerEntries, ctx)];
  const entries = await ctx.db.select().from(swLedgerEntries).where(and(...conds))
    .orderBy(swLedgerEntries.occurredAt);
  const accs = new Map((await ctx.db.select().from(swAccounts).where(own(swAccounts, ctx))).map((a) => [a.id, a.name]));
  const txs = new Map((await ctx.db.select().from(swTransactions).where(own(swTransactions, ctx))).map((t) => [t.id, t]));
  const lines = ['occurred_at,account,doc_no,kind,memo,delta'];
  for (const e of entries) {
    const day = isoDay(e.occurredAt);
    if (opts.from && day < opts.from) continue;
    if (opts.to && day > opts.to) continue;
    const t = txs.get(e.txId);
    const memo = (t?.memo ?? '').replace(/"/g, '""');
    lines.push(`${day},"${accs.get(e.accountId) ?? '?'}",${t?.docNo ?? ''},${t?.kind ?? ''},"${memo}",${e.delta}`);
  }
  await writeAudit(ctx, { action: 'sw.export.ledger_csv', entity: 'sw_ledger_entries', after: { rows: lines.length - 1, ...opts } });
  return { file_name: `soul-wallet-ledger-${opts.from ?? 'all'}.csv`, mime: 'text/csv', content: lines.join('\n') };
}

export async function exportMonthlyReportXlsx(ctx: SwCtx, month?: string) {
  const m = month ?? isoMonth(new Date());
  const donutExp = await donutData(ctx, m, 'expense');
  const donutInc = await donutData(ctx, m, 'income');
  const trend = await trendData(ctx);
  const txs = await ctx.db.select().from(swTransactions)
    .where(and(own(swTransactions, ctx), eq(swTransactions.status, 'posted')));
  const monthTxs = txs.filter((t) => isoMonth(t.occurredAt) === m)
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    trend.map((r) => ({ 'Tháng': r.month, 'Thu': Number(r.income), 'Chi': Number(r.expense), 'Ròng': Number(r.net) }))), 'Tổng quan');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    ...donutExp.map((d) => ({ 'Loại': 'Chi', 'Danh mục': d.label, 'Số tiền': Number(d.value) })),
    ...donutInc.map((d) => ({ 'Loại': 'Thu', 'Danh mục': d.label, 'Số tiền': Number(d.value) })),
  ]), 'Theo danh mục');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    monthTxs.map((t) => ({
      'Ngày': isoDay(t.occurredAt), 'Số CT': t.docNo, 'Loại': t.kind,
      'Số tiền': Number(t.amount), 'Ghi chú': t.memo ?? '',
    }))), 'Giao dịch');
  const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  await writeAudit(ctx, { action: 'sw.export.report_xlsx', entity: 'sw_transactions', after: { month: m, tx_rows: monthTxs.length } });
  return {
    file_name: `soul-wallet-baocao-${m.slice(0, 7)}.xlsx`,
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    content_base64: b64,
  };
}

// ── RECONCILE ──────────────────────────────────────────────────────────────
export async function reconcileAccount(ctx: SwCtx, input: z.infer<typeof reconcileSchema>) {
  const derived = await accountBalance(ctx, input.account_id);
  const actual = vnd(input.actual_balance, 'actual_balance');
  const diff = money.sub(actual, derived);
  if (money.cmp(diff, '0') === 0) {
    throw new SwError('RECONCILE_NO_DIFF', `Sổ khớp thực tế (${derived} VND) — không cần điều chỉnh`);
  }
  const tx = await createTx(ctx, {
    kind: 'adjust',
    occurred_at: input.occurred_at ?? new Date().toISOString(),
    account_id: input.account_id,
    amount: money.abs(diff),
    memo: `Đối soát: sổ ${derived} → thực tế ${actual}${input.note ? ` — ${input.note}` : ''}`,
    status: 'posted',
    meta: { sign: money.isNeg(diff) ? -1 : 1, reconcile: true },
  } as never);
  await writeAudit(ctx, {
    action: 'sw.reconcile', entity: 'sw_accounts', entityId: input.account_id,
    before: { derived }, after: { actual, diff, tx_id: tx.id },
  });
  return { account_id: input.account_id, derived, actual, diff, adjust_tx_id: tx.id, doc_no: tx.docNo };
}
