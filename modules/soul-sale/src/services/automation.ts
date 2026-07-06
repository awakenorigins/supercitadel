/** SOUL-SALE 1A — automation.ts: runScheduledTasks — 6 job đêm, host cron gọi 1 hàm duy nhất. */
import type { Db, Ctx } from '../contract.js';
import { periodOf, nowOf } from '../lib/util.js';
import { recomputeDealHealth } from './crm.service.js';
import { targetRollup } from './finance.service.js';
import { churnScan, duplicateScan, quoteExpiryScan, debtAgingRefresh } from './intel.service.js';

export interface ScheduledRunResult {
  ranAt: string; period: string;
  quoteExpiry: { expired: number };
  dealHealth: { updated: number };
  churn: { flagged: number };
  duplicates: { suggestions: number };
  targetRollup: { updated: number };
  debtAging: { scored: number };
}

/** Host gọi mỗi đêm (per org). Không job nào ném lỗi làm sập job khác — gom lỗi vào kết quả. */
export async function runScheduledTasks(db: Db, ctx: Ctx): Promise<ScheduledRunResult> {
  const period = periodOf(nowOf(ctx));
  const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn(); } catch { return fallback; }
  };
  const result: ScheduledRunResult = {
    ranAt: nowOf(ctx).toISOString(), period,
    quoteExpiry: await safe(() => quoteExpiryScan(db, ctx), { expired: -1 }),
    dealHealth: await safe(() => recomputeDealHealth(db, ctx), { updated: -1 }),
    churn: await safe(() => churnScan(db, ctx), { flagged: -1 }),
    duplicates: await safe(() => duplicateScan(db, ctx), { suggestions: -1 }),
    targetRollup: await safe(() => targetRollup(db, ctx, { period }), { updated: -1 }),
    debtAging: await safe(() => debtAgingRefresh(db, ctx), { scored: -1 }),
  };
  await ctx.emit?.('soulsale.automation.ran', { period, ...JSON.parse(JSON.stringify(result)) });
  return result;
}
