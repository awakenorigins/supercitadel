/**
 * SOUL-WALLET 1A — Hono-like routes (lớp HTTP mỏng)
 * Host mount SAU chuỗi middleware chuẩn Citadel (auth → gate → org-tx).
 * File KHÔNG import 'hono' — nhận MinimalRouter (dependency injection),
 * adapter server/host-adapter.ts tạo shim strip prefix '/wallet' và gắn swCtx.
 * Route chỉ parse Zod + gọi service — không chứa logic nghiệp vụ.
 */
import { ZodError, type ZodType } from 'zod';
import type { SwCtx } from './types.js';
import { SwError } from './types.js';
import {
  accountCreateSchema, accountUpdateSchema, accountCloseSchema, accountListSchema,
  contactUpsertSchema, categoryUpsertSchema, tagUpsertSchema,
  txCreateSchema, txReverseSchema, transferSchema, txSearchSchema,
  budgetUpsertSchema, sixJarsApplySchema, budgetStatusSchema,
  goalCreateSchema, goalContributeSchema,
  debtCreateSchema, debtPaySchema, debtListSchema,
  recurringUpsertSchema, recurringRunSchema, recurringUpcomingSchema,
  ruleUpsertSchema, ruleTestSchema,
  importCreateSchema, importPreviewSchema, importCommitSchema,
  reconcileSchema, rangeSchema, monthSchema, candlesSchema,
  runwaySchema, anomalyScanSchema, scheduledTasksSchema,
} from './validation/schemas.js';
import { createAccount, updateAccount, closeAccount, listAccounts } from './services/account.service.js';
import { accountBalance, listAudit } from './services/ledger.service.js';
import { upsertContact, listContacts, upsertCategory, listCategories, seedDefaultCategories, upsertTag, listTags } from './services/catalog.service.js';
import { createTx, reverseTx, searchTx, getTx, postDraft } from './services/transaction.service.js';
import { upsertBudget, sixJarsApply, budgetStatus, createGoal, contributeGoal, goalStatus } from './services/budget.service.js';
import { createDebt, payDebt, listDebts, debtAging } from './services/debt.service.js';
import { upsertRecurring, runRecurring, upcomingRecurring } from './services/recurring.service.js';
import { upsertRule, listRules, testRules } from './services/rule.service.js';
import { createImport, previewImport, commitImport, exportLedgerCsv, exportMonthlyReportXlsx, reconcileAccount } from './services/import.service.js';
import { donutData, candlesData, waterfallData, heatmapData, trendData, anomalyScan, forecastRunway, rebuildAllSnapshots } from './services/analytics.service.js';
import { executiveSummary, cashflowReport, expenseReport, incomeReport, budgetReport, debtReport, networthReport, recurringReport, narrateExecutive } from './services/reports.service.js';
import { runScheduledTasks } from './services/scheduled.service.js';

export interface MinimalRouter {
  post(path: string, handler: (c: MinimalContext) => Promise<Response>): void;
  get(path: string, handler: (c: MinimalContext) => Promise<Response>): void;
}
export interface MinimalContext {
  req: {
    json(): Promise<unknown>;
    query(key: string): string | undefined;
    param(key: string): string;
  };
  get(key: 'swCtx'): SwCtx;
  json(data: unknown, status?: number): Response;
}

function errorToResponse(c: MinimalContext, err: unknown): Response {
  if (err instanceof SwError) {
    return c.json({ error: { code: err.code, message: err.message, details: err.details } }, 422);
  }
  if (err instanceof ZodError) {
    return c.json({ error: { code: 'INVALID_INPUT', message: 'Dữ liệu không hợp lệ', issues: err.issues } }, 400);
  }
  console.error('[soul-wallet]', err);
  return c.json({ error: { code: 'INTERNAL', message: 'Lỗi nội bộ Soul-Wallet' } }, 500);
}

/** Gom query string theo danh sách key → object cho Zod */
function q(c: MinimalContext, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = c.req.query(k);
    if (v !== undefined && v !== '') out[k] = v;
  }
  return out;
}

function post<S extends ZodType>(r: MinimalRouter, path: string, schema: S,
  fn: (ctx: SwCtx, input: S['_output'], c: MinimalContext) => Promise<unknown>) {
  r.post(path, async (c) => {
    try {
      const input = schema.parse(await c.req.json().catch(() => ({})));
      return c.json({ data: await fn(c.get('swCtx'), input, c) });
    } catch (e) { return errorToResponse(c, e); }
  });
}
function get<S extends ZodType>(r: MinimalRouter, path: string, schema: S, keys: string[],
  fn: (ctx: SwCtx, input: S['_output'], c: MinimalContext) => Promise<unknown>) {
  r.get(path, async (c) => {
    try {
      const input = schema.parse(q(c, keys));
      return c.json({ data: await fn(c.get('swCtx'), input, c) });
    } catch (e) { return errorToResponse(c, e); }
  });
}

export function createSoulWalletRoutes(r: MinimalRouter): void {
  // ── Accounts ─────────────────────────────────────────────────────────────
  post(r, '/wallet/accounts', accountCreateSchema, (ctx, i) => createAccount(ctx, i));
  post(r, '/wallet/accounts/update', accountUpdateSchema, (ctx, i) => updateAccount(ctx, i));
  post(r, '/wallet/accounts/close', accountCloseSchema, (ctx, i) => closeAccount(ctx, i));
  get(r, '/wallet/accounts', accountListSchema.extend({}), ['include_archived'],
    (ctx, i) => listAccounts(ctx, String((i as { include_archived?: unknown }).include_archived) === 'true'));
  r.get('/wallet/accounts/:id/balance', async (c) => {
    try {
      const ctx = c.get('swCtx');
      return c.json({ data: { balance: await accountBalance(ctx, c.req.param('id')) } });
    } catch (e) { return errorToResponse(c, e); }
  });

  // ── Catalog ──────────────────────────────────────────────────────────────
  post(r, '/wallet/contacts', contactUpsertSchema, (ctx, i) => upsertContact(ctx, i));
  r.get('/wallet/contacts', async (c) => {
    try { return c.json({ data: await listContacts(c.get('swCtx')) }); } catch (e) { return errorToResponse(c, e); }
  });
  post(r, '/wallet/categories', categoryUpsertSchema, (ctx, i) => upsertCategory(ctx, i));
  r.get('/wallet/categories', async (c) => {
    try {
      const kind = c.req.query('kind') as 'income' | 'expense' | undefined;
      return c.json({ data: await listCategories(c.get('swCtx'), kind) });
    } catch (e) { return errorToResponse(c, e); }
  });
  r.post('/wallet/categories/seed', async (c) => {
    try { return c.json({ data: await seedDefaultCategories(c.get('swCtx')) }); } catch (e) { return errorToResponse(c, e); }
  });
  post(r, '/wallet/tags', tagUpsertSchema, (ctx, i) => upsertTag(ctx, i));
  r.get('/wallet/tags', async (c) => {
    try { return c.json({ data: await listTags(c.get('swCtx')) }); } catch (e) { return errorToResponse(c, e); }
  });

  // ── Transactions ─────────────────────────────────────────────────────────
  post(r, '/wallet/transactions', txCreateSchema, (ctx, i) => createTx(ctx, i));
  post(r, '/wallet/transactions/search', txSearchSchema, (ctx, i) => searchTx(ctx, i));
  post(r, '/wallet/transactions/reverse', txReverseSchema, (ctx, i) => reverseTx(ctx, i.id, i.reason));
  post(r, '/wallet/transactions/post-draft', txReverseSchema.pick({ id: true }), (ctx, i) => postDraft(ctx, i.id));
  post(r, '/wallet/transfer', transferSchema, (ctx, i) => createTx(ctx, {
    kind: 'transfer', occurred_at: i.occurred_at, account_id: i.from_account_id,
    counter_account_id: i.to_account_id, amount: i.amount, memo: i.memo, status: 'posted',
  } as never));
  r.get('/wallet/transactions/:id', async (c) => {
    try { return c.json({ data: await getTx(c.get('swCtx'), c.req.param('id')) }); } catch (e) { return errorToResponse(c, e); }
  });

  // ── Budget & Goals ───────────────────────────────────────────────────────
  post(r, '/wallet/budgets', budgetUpsertSchema, (ctx, i) => upsertBudget(ctx, i));
  post(r, '/wallet/budgets/six-jars', sixJarsApplySchema, (ctx, i) => sixJarsApply(ctx, i));
  get(r, '/wallet/budgets/status', budgetStatusSchema, ['period'], (ctx, i) => budgetStatus(ctx, i.period));
  post(r, '/wallet/goals', goalCreateSchema, (ctx, i) => createGoal(ctx, i));
  post(r, '/wallet/goals/contribute', goalContributeSchema, (ctx, i) => contributeGoal(ctx, i));
  r.get('/wallet/goals', async (c) => {
    try { return c.json({ data: await goalStatus(c.get('swCtx')) }); } catch (e) { return errorToResponse(c, e); }
  });

  // ── Debts ────────────────────────────────────────────────────────────────
  post(r, '/wallet/debts', debtCreateSchema, (ctx, i) => createDebt(ctx, i));
  post(r, '/wallet/debts/pay', debtPaySchema, (ctx, i) => payDebt(ctx, i));
  get(r, '/wallet/debts', debtListSchema, ['direction', 'status', 'as_of'], (ctx, i) => listDebts(ctx, i));
  get(r, '/wallet/debts/aging', debtListSchema.pick({ as_of: true }), ['as_of'], (ctx, i) => debtAging(ctx, i.as_of));

  // ── Recurring ────────────────────────────────────────────────────────────
  post(r, '/wallet/recurring', recurringUpsertSchema, (ctx, i) => upsertRecurring(ctx, i));
  get(r, '/wallet/recurring/upcoming', recurringUpcomingSchema, ['days'], (ctx, i) => upcomingRecurring(ctx, i.days));
  post(r, '/wallet/recurring/run', recurringRunSchema, (ctx, i) => runRecurring(ctx, i.now));

  // ── Rules ────────────────────────────────────────────────────────────────
  post(r, '/wallet/rules', ruleUpsertSchema, (ctx, i) => upsertRule(ctx, i));
  r.get('/wallet/rules', async (c) => {
    try { return c.json({ data: await listRules(c.get('swCtx')) }); } catch (e) { return errorToResponse(c, e); }
  });
  post(r, '/wallet/rules/test', ruleTestSchema, (ctx, i) => testRules(ctx, i.limit));

  // ── Import / Export / Reconcile ──────────────────────────────────────────
  post(r, '/wallet/import', importCreateSchema, (ctx, i) => createImport(ctx, i));
  post(r, '/wallet/import/preview', importPreviewSchema, (ctx, i) => previewImport(ctx, i.job_id));
  post(r, '/wallet/import/commit', importCommitSchema, (ctx, i) => commitImport(ctx, i));
  get(r, '/wallet/export/ledger-csv', rangeSchema, ['from', 'to'], (ctx, i) => exportLedgerCsv(ctx, i));
  get(r, '/wallet/export/report-xlsx', monthSchema, ['month'], (ctx, i) => exportMonthlyReportXlsx(ctx, i.month));
  post(r, '/wallet/reconcile', reconcileSchema, (ctx, i) => reconcileAccount(ctx, i));

  // ── Charts ───────────────────────────────────────────────────────────────
  get(r, '/wallet/charts/donut', monthSchema.extend({ kind: txSearchSchema.shape.kind.unwrap().optional() }) as never,
    ['month', 'kind'], (ctx, i: { month?: string; kind?: string }) =>
      donutData(ctx, i.month ?? new Date().toISOString().slice(0, 7) + '-01', (i.kind === 'income' ? 'income' : 'expense')));
  get(r, '/wallet/charts/candles', candlesSchema, ['account_id', 'from', 'to'], (ctx, i) => candlesData(ctx, i));
  get(r, '/wallet/charts/waterfall', monthSchema, ['month'], (ctx, i) =>
    waterfallData(ctx, i.month ?? new Date().toISOString().slice(0, 7) + '-01'));
  get(r, '/wallet/charts/heatmap', monthSchema, ['month'], (ctx, i) =>
    heatmapData(ctx, i.month ?? new Date().toISOString().slice(0, 7) + '-01'));
  get(r, '/wallet/charts/trend', rangeSchema, ['from', 'to'], (ctx, i) => trendData(ctx, i.from, i.to));

  // ── Insights ─────────────────────────────────────────────────────────────
  get(r, '/wallet/insights/anomalies', anomalyScanSchema, ['lookback_days'], (ctx, i) => anomalyScan(ctx, i.lookback_days));
  get(r, '/wallet/insights/runway', runwaySchema, ['horizon_days'], (ctx, i) => forecastRunway(ctx, i.horizon_days));

  // ── Reports ──────────────────────────────────────────────────────────────
  get(r, '/wallet/reports/executive', monthSchema, ['month'], (ctx, i) => executiveSummary(ctx, i.month));
  get(r, '/wallet/reports/cashflow', monthSchema, ['month'], (ctx, i) => cashflowReport(ctx, i.month));
  get(r, '/wallet/reports/expense', monthSchema, ['month'], (ctx, i) => expenseReport(ctx, i.month));
  get(r, '/wallet/reports/income', monthSchema, ['month'], (ctx, i) => incomeReport(ctx, i.month));
  get(r, '/wallet/reports/budget', monthSchema, ['month'], (ctx, i) => budgetReport(ctx, i.month));
  r.get('/wallet/reports/debt', async (c) => {
    try { return c.json({ data: await debtReport(c.get('swCtx')) }); } catch (e) { return errorToResponse(c, e); }
  });
  get(r, '/wallet/reports/networth', monthSchema, ['month'], (ctx, i) => networthReport(ctx, i.month));
  r.get('/wallet/reports/recurring', async (c) => {
    try { return c.json({ data: await recurringReport(c.get('swCtx')) }); } catch (e) { return errorToResponse(c, e); }
  });
  get(r, '/wallet/reports/narrate', monthSchema, ['month'], (ctx, i) => narrateExecutive(ctx, i.month));

  // ── Maintenance ──────────────────────────────────────────────────────────
  r.post('/wallet/maintenance/rebuild-snapshots', async (c) => {
    try { return c.json({ data: { rebuilt_days: await rebuildAllSnapshots(c.get('swCtx')) } }); } catch (e) { return errorToResponse(c, e); }
  });
  post(r, '/wallet/scheduled/run', scheduledTasksSchema, (ctx, i) => runScheduledTasks(ctx, i.now));
  r.get('/wallet/audit', async (c) => {
    try {
      const limit = Math.min(200, Number(c.req.query('limit') ?? 50) || 50);
      return c.json({ data: await listAudit(c.get('swCtx'), limit) });
    } catch (e) { return errorToResponse(c, e); }
  });
}
