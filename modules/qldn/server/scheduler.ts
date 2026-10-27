/**
 * QLDN V1A — F7.5: SCHEDULER auto-run bảng lương (target T5 anh Nấng duyệt).
 * Học đúng pattern soul-inventory nightly: host điều phối per-org qua
 * startQldnMonthlyAutomation(db, listActiveOrgIds) — module KHÔNG tự spawn cron
 * ngoài hàm host gọi; setInterval 10 phút + unref; lỗi 1 org không chặn org khác.
 *
 * Nghiệp vụ auto mùng 1 hàng tháng (07:00 mặc định):
 *  1. Tạo kỳ mới YYYY-MM nếu chưa có (standard_days mặc định 26)
 *  2. Với kỳ TRƯỚC: nếu đã có timesheet + chưa có run OFFICIAL → tạo run + calculate
 *     (KHÔNG auto-approve — duyệt/chi tiền luôn là người thật, đúng chuẩn an toàn)
 *  3. Emit qldn.payroll.autorun_completed để notification module báo user
 */
import { and, eq } from 'drizzle-orm';
import { emitEvent } from '@citadel/core';
import { periods, timesheets, payrollRuns } from './schema.js';
import { createPayrollRun, calculateRun } from './payroll.js';
import { effectivePolicyParams } from './service.js';

const pad = (n: number) => String(n).padStart(2, '0');

export interface AutorunResult {
  orgId: string;
  periodCreated: string | null;
  runCreated: string | null;
  calculated: { lines: number; netTotal: number } | null;
  skippedReason: string | null;
}

/** Kỳ hiện tại + kỳ trước theo mốc thời gian `now`. */
export function periodCodesFor(now: Date): { current: string; previous: string } {
  const y = now.getUTCFullYear(), m = now.getUTCMonth(); // m: 0-11
  const current = `${y}-${pad(m + 1)}`;
  const pm = m === 0 ? 12 : m;
  const py = m === 0 ? y - 1 : y;
  const previous = `${py}-${pad(pm)}`;
  return { current, previous };
}

/**
 * Chạy auto cho 1 org (idempotent — gọi lại không tạo trùng):
 * tạo kỳ mới + calculate lương kỳ trước nếu đủ điều kiện.
 */
export async function runMonthlyAutomation(db: any, orgId: string, now = new Date()): Promise<AutorunResult> {
  const { current, previous } = periodCodesFor(now);
  const result: AutorunResult = { orgId, periodCreated: null, runCreated: null, calculated: null, skippedReason: null };

  // 1) Kỳ hiện tại
  const curExists = await db.select().from(periods)
    .where(and(eq(periods.orgId, orgId), eq(periods.code, current))).limit(1);
  if (!curExists.length) {
    await db.insert(periods).values({
      orgId, code: current, name: `Tháng ${current.slice(5)}/${current.slice(0, 4)}`,
    }).onConflictDoNothing();
    result.periodCreated = current;
  }

  // 2) Kỳ trước: đủ điều kiện auto-calculate?
  const prevPeriod = (await db.select().from(periods)
    .where(and(eq(periods.orgId, orgId), eq(periods.code, previous))).limit(1))[0];
  if (!prevPeriod) { result.skippedReason = `Chưa có kỳ ${previous}`; return result; }
  if (prevPeriod.status === 'closed') { result.skippedReason = `Kỳ ${previous} đã khóa`; return result; }

  const tsCount = await db.select().from(timesheets)
    .where(and(eq(timesheets.orgId, orgId), eq(timesheets.periodId, prevPeriod.id)));
  if (!tsCount.length) { result.skippedReason = `Kỳ ${previous} chưa có chấm công`; return result; }

  const existingRun = await db.select().from(payrollRuns).where(and(
    eq(payrollRuns.orgId, orgId), eq(payrollRuns.periodId, prevPeriod.id), eq(payrollRuns.scheme, 'OFFICIAL' as any),
  )).limit(1);
  if (existingRun.length) { result.skippedReason = `Kỳ ${previous} đã có bảng lương OFFICIAL (${existingRun[0].status})`; return result; }

  const policy = await effectivePolicyParams(db, orgId, `${previous}-28`);
  if (!policy) { result.skippedReason = 'Chưa có policy_params hiệu lực'; return result; }

  // 3) Tạo run + calculate (KHÔNG approve)
  const run = await createPayrollRun(db, orgId, { period: previous, scheme: 'OFFICIAL', note: 'Auto-run mùng 1 (scheduler F7.5)' });
  result.runCreated = run.id;
  const calc = await calculateRun(db, orgId, run.id);
  result.calculated = { lines: calc.lines, netTotal: calc.totals.netPay };

  // 4) Thông báo qua outbox (transaction riêng — event nhỏ, không cần gộp)
  await db.transaction(async (tx: any) => {
    await emitEvent(tx, {
      orgId, topic: 'qldn.payroll.autorun_completed',
      payload: {
        period: previous, runId: run.id,
        lines: calc.lines, netTotal: calc.totals.netPay, skipped: calc.skipped.length,
        message: `Bảng lương ${previous} đã tính tự động (${calc.lines} NV) — chờ duyệt`,
      },
    });
  });
  return result;
}

/**
 * Host hook — gọi 1 lần trong services/api/src/index.ts (pattern soul-inventory):
 * startQldnMonthlyAutomation(getDb(), async () => orgIds active module qldn).
 * Mặc định chạy NGÀY 1 hàng tháng lúc 07:00 (giờ server), mỗi ngày tối đa 1 lần.
 */
export function startQldnMonthlyAutomation(
  db: any,
  listActiveOrgIds: () => Promise<string[]>,
  opts?: { dayOfMonth?: number; hour?: number },
): { stop: () => void; tick: () => Promise<void> } {
  const dayOfMonth = opts?.dayOfMonth ?? 1;
  const hour = opts?.hour ?? 7;
  let lastRunDay = '';
  const tick = async () => {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    if (now.getUTCDate() !== dayOfMonth || now.getUTCHours() !== hour || lastRunDay === day) return;
    lastRunDay = day;
    let orgIds: string[] = [];
    try { orgIds = await listActiveOrgIds(); } catch (e) { console.error('[qldn][cron] không lấy được org active', e); return; }
    for (const orgId of orgIds) {
      try {
        const r = await runMonthlyAutomation(db, orgId, now);
        console.log(`[qldn][cron] org ${orgId}: period=${r.periodCreated ?? '-'} run=${r.runCreated ?? '-'} ${r.calculated ? `lines=${r.calculated.lines}` : `skip=${r.skippedReason}`}`);
      } catch (e) {
        console.error(`[qldn][cron] org ${orgId} lỗi`, e);
      }
    }
  };
  const timer = setInterval(() => { tick().catch((e) => console.error('[qldn][cron] tick lỗi', e)); }, 10 * 60 * 1000);
  (timer as any).unref?.();
  return { stop: () => clearInterval(timer), tick };
}
