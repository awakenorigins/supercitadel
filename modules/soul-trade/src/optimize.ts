// ── Walk-forward optimizer (ported) ──────────────────────────
// Grid-search params on an in-sample window, validate on the next out-of-sample
// window, roll forward. Only the stitched OUT-OF-SAMPLE curve is reported — the
// performance you did NOT optimize on. IS bars serve as warmup lead-in for OOS.
import type { Candle, RiskParams } from './types.js';
import { runBacktest, type BtMetrics, type BtResult } from './backtest.js';
import { DEFAULT_WEIGHTS, type SignalWeights } from './signal.js';
import { DEFAULT_RISK } from './risk.js';
import { DEFAULT_PARAMS } from './config.js';

export interface WfWindow {
  window: number; best_params: Record<string, number>;
  is_metric: number; oos_metrics: BtMetrics; oos_return: number; oos_trades: number;
}
export interface WfAggregate {
  windows: number; oos_total_return: number; oos_trades: number; oos_win_rate: number;
  oos_max_drawdown: number; final_equity: number;
}
export interface WfResult { windows: WfWindow[]; aggregate: WfAggregate; oos_equity: number[]; }

/** Cartesian product of a param grid: {a:[1,2], b:[9]} -> [{a:1,b:9},{a:2,b:9}]. */
export function gridProduct(grid: Record<string, number[]>): Record<string, number>[] {
  const keys = Object.keys(grid);
  if (!keys.length) return [{}];
  let combos: Record<string, number>[] = [{}];
  for (const k of keys) {
    const next: Record<string, number>[] = [];
    for (const c of combos) for (const v of grid[k]) next.push({ ...c, [k]: v });
    combos = next;
  }
  return combos;
}
const scoreOf = (m: BtMetrics, metric: string): number =>
  metric === 'sharpe' ? m.sharpe : metric === 'profit_factor' ? m.profitFactor : m.totalReturn;

export function runWalkForward(candles: Candle[], strategy: string, grid: Record<string, number[]>, opts: {
  isBars?: number; oosBars?: number; baseParams?: Record<string, number>;
  risk?: RiskParams; weights?: SignalWeights; timeframe?: string; metric?: 'total_return' | 'sharpe' | 'profit_factor';
} = {}): WfResult {
  const isBars = opts.isBars ?? 500, oosBars = opts.oosBars ?? 150;
  const risk = opts.risk ?? DEFAULT_RISK, weights = opts.weights ?? DEFAULT_WEIGHTS;
  const tf = opts.timeframe ?? '15m', metric = opts.metric ?? 'total_return';
  const combos = gridProduct(grid);
  const windows: WfWindow[] = [];
  let stitched: number[] = [risk.startingEquity];
  let equity = risk.startingEquity, w = 0;

  for (let start = 0; start + isBars + oosBars <= candles.length; start += oosBars) {
    w++;
    const isSlice = candles.slice(start, start + isBars);
    // 1) optimize on in-sample
    let best = combos[0], bestScore = -Infinity;
    for (const combo of combos) {
      const p = { ...DEFAULT_PARAMS, ...(opts.baseParams ?? {}), ...combo };
      const s = scoreOf(runBacktest(isSlice, strategy, p, risk, weights, tf).metrics, metric);
      if (s > bestScore) { bestScore = s; best = combo; }
    }
    // 2) validate on out-of-sample (IS as warmup lead-in; count only OOS bars)
    const full = candles.slice(start, start + isBars + oosBars);
    const p = { ...DEFAULT_PARAMS, ...(opts.baseParams ?? {}), ...best };
    const oosRisk = { ...risk, startingEquity: equity };
    const oos: BtResult = runBacktest(full, strategy, p, oosRisk, weights, tf, isBars);
    equity = oos.metrics.finalEquity;
    stitched = stitched.concat(oos.equityCurve.slice(1));
    windows.push({ window: w, best_params: best, is_metric: +bestScore.toFixed(4),
      oos_metrics: oos.metrics, oos_return: oos.metrics.totalReturn, oos_trades: oos.metrics.numTrades });
  }

  let peak = stitched[0], mdd = 0; for (const v of stitched) { peak = Math.max(peak, v); mdd = Math.min(mdd, (v - peak) / peak); }
  const oosTrades = windows.reduce((s, x) => s + x.oos_trades, 0);
  const oosWins = windows.reduce((s, x) => s + Math.round(x.oos_metrics.winRate * x.oos_trades), 0);
  return {
    windows, oos_equity: stitched,
    aggregate: {
      windows: windows.length,
      oos_total_return: stitched.length ? stitched[stitched.length - 1] / stitched[0] - 1 : 0,
      oos_trades: oosTrades, oos_win_rate: oosTrades ? oosWins / oosTrades : 0,
      oos_max_drawdown: mdd, final_equity: equity,
    },
  };
}
