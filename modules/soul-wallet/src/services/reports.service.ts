/**
 * SOUL-WALLET 1A — reports.service (8 báo cáo quản trị)
 * Toàn bộ trả JSON chuẩn hóa — FE render infographic, Tiểu Tâm thuật lại.
 * 1 executive  · 2 cashflow · 3 expense · 4 income
 * 5 budget     · 6 debt     · 7 networth · 8 recurring
 */
import { and, eq } from 'drizzle-orm';
import type { SwCtx } from '../types.js';
import { money, isoMonth } from '../types.js';
import { swMonthlySummary } from '../db/schema.js';
import { own, allBalances } from './ledger.service.js';
import {
  donutData, candlesData, waterfallData, heatmapData, trendData,
  refreshNetworth, anomalyScan, forecastRunway,
} from './analytics.service.js';
import { budgetStatus, goalStatus } from './budget.service.js';
import { listDebts, debtAging } from './debt.service.js';
import { upcomingRecurring } from './recurring.service.js';

function prevMonth(m: string): string {
  const d = new Date(`${m}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return isoMonth(d);
}
function monthEnd(m: string): string {
  const d = new Date(`${m}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

async function monthlyOf(ctx: SwCtx, m: string): Promise<{ income: string; expense: string; net: string }> {
  const rows = await ctx.db.select().from(swMonthlySummary)
    .where(and(own(swMonthlySummary, ctx), eq(swMonthlySummary.month, m))).limit(1);
  const income = rows[0] ? String(rows[0].income) : '0';
  const expense = rows[0] ? String(rows[0].expense) : '0';
  return { income, expense, net: money.sub(income, expense) };
}

/** 1. EXECUTIVE — bức tranh 1 màn hình */
export async function executiveSummary(ctx: SwCtx, month?: string) {
  const m = month ?? isoMonth(new Date());
  const balances = await allBalances(ctx);
  const liquid = balances.filter((b) => ['cash', 'bank', 'ewallet'].includes(b.type))
    .reduce((s, b) => money.add(s, b.balance), '0');
  const nw = await refreshNetworth(ctx, m);
  const cur = await monthlyOf(ctx, m);
  const prev = await monthlyOf(ctx, prevMonth(m));
  const topExpense = (await donutData(ctx, m, 'expense')).slice(0, 3);
  const bs = await budgetStatus(ctx, m);
  const worstBudgets = [...bs.budgets].sort((a, b) => b.pct_used - a.pct_used).slice(0, 3);
  const aging = await debtAging(ctx);
  const upcoming = await upcomingRecurring(ctx, 7);
  const anomalies = await anomalyScan(ctx, 90);
  const runway = await forecastRunway(ctx, 30);

  return {
    month: m,
    net_worth: nw,
    liquid,
    accounts: balances,
    this_month: cur,
    last_month: prev,
    net_change_vs_last: money.sub(cur.net, prev.net),
    top_expense_categories: topExpense,
    budgets_watchlist: worstBudgets,
    debt_aging: aging,
    upcoming_recurring_7d: upcoming,
    anomaly_count: anomalies.alerts.length,
    anomalies: anomalies.alerts.slice(0, 5),
    runway,
  };
}

/** 2. CASHFLOW — dòng tiền tháng: waterfall + nến + heatmap */
export async function cashflowReport(ctx: SwCtx, month?: string) {
  const m = month ?? isoMonth(new Date());
  return {
    month: m,
    waterfall: await waterfallData(ctx, m),
    candles: await candlesData(ctx, { from: m, to: monthEnd(m) }),
    heatmap: await heatmapData(ctx, m),
  };
}

/** 3. EXPENSE — cơ cấu chi + so tháng trước */
export async function expenseReport(ctx: SwCtx, month?: string) {
  const m = month ?? isoMonth(new Date());
  const pm = prevMonth(m);
  const cur = await donutData(ctx, m, 'expense');
  const prev = await donutData(ctx, pm, 'expense');
  const prevMap = new Map(prev.map((p) => [p.label, p.value]));
  return {
    month: m,
    total: cur.reduce((s, c) => money.add(s, c.value), '0'),
    total_prev: prev.reduce((s, c) => money.add(s, c.value), '0'),
    donut: cur,
    movers: cur.map((c) => ({
      label: c.label, current: c.value, previous: prevMap.get(c.label) ?? '0',
      change: money.sub(c.value, prevMap.get(c.label) ?? '0'),
    })).sort((a, b) => money.cmp(money.abs(b.change), money.abs(a.change))).slice(0, 8),
  };
}

/** 4. INCOME — cơ cấu thu + so tháng trước */
export async function incomeReport(ctx: SwCtx, month?: string) {
  const m = month ?? isoMonth(new Date());
  const pm = prevMonth(m);
  const cur = await donutData(ctx, m, 'income');
  const prev = await donutData(ctx, pm, 'income');
  return {
    month: m,
    total: cur.reduce((s, c) => money.add(s, c.value), '0'),
    total_prev: prev.reduce((s, c) => money.add(s, c.value), '0'),
    donut: cur,
  };
}

/** 5. BUDGET — trạng thái mọi envelope/hũ */
export async function budgetReport(ctx: SwCtx, month?: string) {
  const bs = await budgetStatus(ctx, month);
  const goals = await goalStatus(ctx);
  return { ...bs, goals };
}

/** 6. DEBT — sổ nợ mở + aging + lãi cộng dồn */
export async function debtReport(ctx: SwCtx) {
  const debts = await listDebts(ctx, { status: 'open' } as never);
  const aging = await debtAging(ctx);
  const sum = (dir: string, field: 'remaining' | 'interest_accrued') =>
    debts.filter((d) => d.direction === dir).reduce((s, d) => money.add(s, d[field]), '0');
  return {
    aging,
    open_debts: debts,
    totals: {
      receivable_remaining: sum('receivable', 'remaining'),
      receivable_interest: sum('receivable', 'interest_accrued'),
      payable_remaining: sum('payable', 'remaining'),
      payable_interest: sum('payable', 'interest_accrued'),
    },
  };
}

/** 7. NETWORTH — tài sản ròng hiện tại + chuỗi 6 tháng */
export async function networthReport(ctx: SwCtx, month?: string) {
  const m = month ?? isoMonth(new Date());
  const series: Array<{ month: string; assets: string; liabilities: string; net: string }> = [];
  let cursor = m;
  const months: string[] = [];
  for (let i = 0; i < 6; i++) { months.unshift(cursor); cursor = prevMonth(cursor); }
  for (const mm of months) {
    const r = await refreshNetworth(ctx, mm);
    series.push({ month: mm, ...r });
  }
  return { month: m, current: series[series.length - 1], series, trend: await trendData(ctx) };
}

/** 8. RECURRING — subscription sắp trừ tiền + tăng giá + tổng gánh */
export async function recurringReport(ctx: SwCtx) {
  const upcoming = await upcomingRecurring(ctx, 30);
  const outflow = upcoming.filter((u) => u.kind !== 'income');
  return {
    upcoming_30d: upcoming,
    hikes: upcoming.filter((u) => u.price_hiked),
    total_out_30d: outflow.reduce((s, u) => money.add(s, u.amount), '0'),
    total_in_30d: upcoming.filter((u) => u.kind === 'income').reduce((s, u) => money.add(s, u.amount), '0'),
  };
}

/** Thuật lại executive bằng tiếng Việt gọn — cho tool sw.report.narrate */
export async function narrateExecutive(ctx: SwCtx, month?: string): Promise<{ text: string; data: Awaited<ReturnType<typeof executiveSummary>> }> {
  const d = await executiveSummary(ctx, month);
  const fmt = (v: string) => Number(v).toLocaleString('vi-VN');
  const lines = [
    `📊 Ví tháng ${d.month.slice(0, 7)}:`,
    `• Tài sản ròng ${fmt(d.net_worth.net)}đ (tài sản ${fmt(d.net_worth.assets)}đ − nợ ${fmt(d.net_worth.liabilities)}đ), tiền lỏng ${fmt(d.liquid)}đ.`,
    `• Thu ${fmt(d.this_month.income)}đ · Chi ${fmt(d.this_month.expense)}đ · Ròng ${fmt(d.this_month.net)}đ (${money.isNeg(d.net_change_vs_last) ? 'giảm' : 'tăng'} ${fmt(money.abs(d.net_change_vs_last))}đ so với tháng trước).`,
  ];
  if (d.top_expense_categories.length) {
    lines.push(`• Chi nhiều nhất: ${d.top_expense_categories.map((c) => `${c.label} ${fmt(c.value)}đ`).join(', ')}.`);
  }
  const exceeded = d.budgets_watchlist.filter((b) => b.exceeded);
  if (exceeded.length) lines.push(`• ⚠️ Vượt ngân sách: ${exceeded.map((b) => b.name).join(', ')}.`);
  if (d.runway.will_run_dry) lines.push(`• 🔥 Cảnh báo runway: với tốc độ hiện tại, tiền lỏng cạn trong ~${d.runway.runway_days} ngày.`);
  if (d.anomaly_count > 0) lines.push(`• 👁 ${d.anomaly_count} điểm bất thường cần liếc qua.`);
  if (d.upcoming_recurring_7d.length) {
    lines.push(`• 7 ngày tới có ${d.upcoming_recurring_7d.length} khoản định kỳ.`);
  }
  return { text: lines.join('\n'), data: d };
}
