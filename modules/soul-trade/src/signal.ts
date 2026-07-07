// AI ensemble signal (ported) — normalized score in [-1,+1], ML-ready.
import type { Indicators, AISignal } from './types.js';
const tanh = (x: number, s = 1) => Math.tanh(x / s);
const clip = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export interface SignalWeights { trend: number; rsi: number; macd: number; roc: number; volatility: number; }
export const DEFAULT_WEIGHTS: SignalWeights = { trend: 0.30, rsi: 0.25, macd: 0.20, roc: 0.15, volatility: 0.10 };

export function scoreSignal(ind: Indicators, i: number, w: SignalWeights, entryThreshold = 0.35): AISignal {
  // guard: out-of-range index or NaN indicators -> neutral signal (never emit NaN)
  if (!Number.isFinite(ind.emaSlow[i]) || !Number.isFinite(ind.rsi[i]) || !Number.isFinite(ind.atr[i])) {
    return { score: 0, direction: 'flat', confidence: 0, contributions: {}, source: 'ensemble' };
  }
  const px = Math.max(1e-9, ind.emaSlow[i]); // price-scale proxy for normalization
  const c: Record<string, number> = {};
  const gap = (ind.emaFast[i] - ind.emaSlow[i]) / px;
  c.trend = w.trend * tanh(gap, 0.01);
  c.rsi = w.rsi * clip((50 - ind.rsi[i]) / 50, -1, 1);
  c.macd = w.macd * tanh(ind.macdHist[i] / px, 0.002);
  c.roc = w.roc * tanh(ind.roc[i], 3);
  const raw = c.trend + c.rsi + c.macd + c.roc;
  const atrPct = ind.atr[i] / px;
  const volFactor = 1 / (1 + w.volatility * (atrPct / 0.01));
  const score = clip(raw * volFactor, -1, 1);
  const direction = score >= entryThreshold ? 'long' : score <= -entryThreshold ? 'short' : 'flat';
  return {
    score: +score.toFixed(4), direction,
    confidence: +Math.min(1, Math.abs(score) / Math.max(entryThreshold, 1e-9)).toFixed(3),
    contributions: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, +v.toFixed(4)])),
    source: 'ensemble',
  };
}
