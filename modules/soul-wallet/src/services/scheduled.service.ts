/**
 * SOUL-WALLET 1A — scheduled.service (việc đêm của két sắt)
 * Chạy per (org, owner) — host cron/route gọi. Thứ tự cố ý:
 *   1. runRecurring     — sinh giao dịch đến hạn (posted/draft)
 *   2. checkDueAndEmit  — nhắc nợ đến hạn/quá hạn (sw.debt.due)
 *   3. rebuildAllSnapshots — đối soát snapshot từ ledger (nguồn chân lý)
 *   4. refreshNetworth  — chốt tài sản ròng tháng hiện tại
 *   5. anomalyScan      — soi bất thường, emit sw.anomaly.detected
 */
import type { SwCtx } from '../types.js';
import { isoMonth } from '../types.js';
import { runRecurring } from './recurring.service.js';
import { checkDueAndEmit } from './debt.service.js';
import { rebuildAllSnapshots, refreshNetworth, anomalyScan } from './analytics.service.js';

export async function runScheduledTasks(ctx: SwCtx, now?: string) {
  const recurring = await runRecurring(ctx, now);
  const debtsDue = await checkDueAndEmit(ctx, 7);
  const snapshotDays = await rebuildAllSnapshots(ctx);
  const networth = await refreshNetworth(ctx, isoMonth(now ? new Date(`${now}T00:00:00Z`) : new Date()));
  const anomalies = await anomalyScan(ctx, 90);
  return {
    recurring: { posted: recurring.posted, drafts: recurring.drafts },
    debts_due_notified: debtsDue.notified,
    snapshot_days_rebuilt: snapshotDays,
    networth,
    anomaly_count: anomalies.alerts.length,
  };
}
