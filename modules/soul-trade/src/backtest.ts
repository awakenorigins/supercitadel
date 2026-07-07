// Look-ahead-safe backtest (ported): decide on close[i] -> enter open[i+1];
// SL/TP intrabar via high/low; stop assumed first if both touched.
import type { Candle } from './types.js';
import { addIndicators } from './indicators.js';
import { getStrategy } from './strategies.js';
import { scoreSignal, DEFAULT_WEIGHTS, type SignalWeights } from './signal.js';
import { combineSignals } from './decision.js';
import { DEFAULT_RISK, type RiskParams } from './types-risk.js';

export interface BtTrade { direction: string; entryIdx: number; exitIdx: number; entry: number; exit: number; size: number; pnl: number; reason: string; r: number; }
export interface BtMetrics {
  bars: number; numTrades: number; winRate: number; totalReturn: number; maxDrawdown: number;
  profitFactor: number; sharpe: number; avgWin: number; avgLoss: number; startEquity: number; finalEquity: number;
}
export interface BtResult { metrics: BtMetrics; equityCurve: number[]; trades: BtTrade[]; }

function barsPerYear(tf: string): number {
  const u = tf.slice(-1), v = parseInt(tf.slice(0, -1), 10);
  const min = ({ m: 1, h: 60, d: 1440, w: 10080 } as Record<string, number>)[u] * v;
  return (365 * 24 * 60) / min;
}
const safe = (x: number) => Number.isFinite(x) ? x : 0;

export function runBacktest(
  c: Candle[], strategyName: string, params: Record<string, number>,
  risk: RiskParams = DEFAULT_RISK, weights: SignalWeights = DEFAULT_WEIGHTS,
  timeframe = '15m', countFrom?: number,
): BtResult {
  const ind = addIndicators(c, params);
  const strat = getStrategy(strategyName);
  const n = c.length;
  const need = Math.max(params.ema_slow ?? 55, params.bb_period ?? 20, params.channel ?? 20, (params.macd_slow ?? 26) + (params.macd_signal ?? 9), 40);
  const warmup = Math.floor(need * 1.3);
  const start = countFrom ?? Math.max(warmup, 40);

  let equity = risk.startingEquity; const curve = [equity]; const trades: BtTrade[] = [];
  let pos: any = null, pending: any = null;

  for (let i = start; i < n; i++) {
    const bar = c[i];
    if (pending && !pos) {
      const dir = pending.dir, atrSig = pending.atr;
      const entry = bar.open * (dir === 'long' ? 1 + risk.slippage : 1 - risk.slippage);
      const stopDist = risk.stopAtrMult * atrSig;
      if (stopDist > 0) {
        const stop = dir === 'long' ? entry - stopDist : entry + stopDist;
        const tp = dir === 'long' ? entry + risk.takeProfitR * stopDist : entry - risk.takeProfitR * stopDist;
        const size = (equity * risk.riskPerTrade * pending.mult) / stopDist;
        equity -= entry * size * risk.takerFee;
        pos = { dir, entry, stop, tp, size, entryIdx: i, stopDist };
      }
      pending = null;
    }
    if (pos) {
      let exit: number | null = null, reason = '';
      if (pos.dir === 'long') { if (bar.low <= pos.stop) { exit = pos.stop; reason = 'stop'; } else if (bar.high >= pos.tp) { exit = pos.tp; reason = 'take_profit'; } }
      else { if (bar.high >= pos.stop) { exit = pos.stop; reason = 'stop'; } else if (bar.low <= pos.tp) { exit = pos.tp; reason = 'take_profit'; } }
      if (exit !== null) {
        let pnl = pos.dir === 'long' ? (exit - pos.entry) * pos.size : (pos.entry - exit) * pos.size;
        pnl -= exit * pos.size * risk.takerFee; equity += pnl;
        trades.push({ direction: pos.dir, entryIdx: pos.entryIdx, exitIdx: i, entry: pos.entry, exit, size: pos.size, pnl, reason, r: pnl / Math.max(pos.stopDist * pos.size, 1e-9) });
        pos = null;
      }
    }
    if (!pos && !pending) {
      const dec = strat(c, ind, i, params);
      const sig = scoreSignal(ind, i, weights);
      const { direction, sizeMult } = combineSignals(dec, sig);
      if (direction !== 'flat') pending = { dir: direction, mult: sizeMult, atr: ind.atr[i] };
    }
    let mtm = equity;
    if (pos) mtm += pos.dir === 'long' ? (bar.close - pos.entry) * pos.size : (pos.entry - bar.close) * pos.size;
    curve.push(mtm);
  }
  return { metrics: metrics(curve, trades, n, barsPerYear(timeframe)), equityCurve: curve, trades };
}

function metrics(curve: number[], trades: BtTrade[], bars: number, bpy: number): BtMetrics {
  const rets: number[] = []; for (let i = 1; i < curve.length; i++) { const r = (curve[i] - curve[i - 1]) / curve[i - 1]; if (Number.isFinite(r)) rets.push(r); }
  const wins = trades.filter(t => t.pnl > 0), losses = trades.filter(t => t.pnl <= 0);
  const gw = wins.reduce((s, t) => s + t.pnl, 0), gl = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  let peak = curve[0], mdd = 0; for (const v of curve) { peak = Math.max(peak, v); mdd = Math.min(mdd, (v - peak) / peak); }
  const mean = rets.reduce((s, v) => s + v, 0) / (rets.length || 1);
  const sd = Math.sqrt(rets.reduce((s, v) => s + (v - mean) ** 2, 0) / (rets.length || 1));
  const sharpe = rets.length > 1 && sd > 0 ? (mean / sd) * Math.sqrt(bpy) : 0;
  const pf = gl > 0 ? Math.min(gw / gl, 999) : gw > 0 ? 999 : 0;
  return {
    bars, numTrades: trades.length, winRate: trades.length ? wins.length / trades.length : 0,
    totalReturn: safe(curve[curve.length - 1] / curve[0] - 1), maxDrawdown: safe(mdd),
    profitFactor: safe(pf), sharpe: safe(sharpe),
    avgWin: wins.length ? gw / wins.length : 0, avgLoss: losses.length ? -gl / losses.length : 0,
    startEquity: curve[0], finalEquity: curve[curve.length - 1],
  };
}
