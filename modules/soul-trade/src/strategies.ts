// Pluggable strategies (ported). Each turns candles+indicators into a decision.
import type { Candle, Indicators, StrategyDecision } from './types.js';

export type StrategyFn = (c: Candle[], ind: Indicators, i: number, p: Record<string, number>) => StrategyDecision;
const flat = (reasons: string[]): StrategyDecision => ({ direction: 'flat', strength: 0, reasons, features: {} });

export const rsiEma: StrategyFn = (c, ind, i, p) => {
  if (i < 2) return flat(['not enough data']);
  const os = p.rsi_oversold ?? 32, ob = p.rsi_overbought ?? 68;
  const up = ind.emaFast[i] > ind.emaSlow[i], down = ind.emaFast[i] < ind.emaSlow[i];
  const rsiUp = ind.rsi[i - 1] < ind.rsi[i], rsiDown = ind.rsi[i - 1] > ind.rsi[i];
  const macdRising = ind.macdHist[i] > ind.macdHist[i - 1], macdFalling = ind.macdHist[i] < ind.macdHist[i - 1];
  const features = { close: c[i].close, rsi: +ind.rsi[i].toFixed(2), atr: +ind.atr[i].toFixed(6), macd_hist: +ind.macdHist[i].toFixed(6) };
  if (up && ind.rsi[i] < os + 8 && rsiUp && macdRising) {
    const depth = Math.max(0, (os + 8 - ind.rsi[i]) / (os + 8));
    return { direction: 'long', strength: Math.min(1, 0.5 + 0.5 * depth), reasons: [`uptrend`, `RSI ${features.rsi} turning up from oversold`, 'MACD rising'], features };
  }
  if (down && ind.rsi[i] > ob - 8 && rsiDown && macdFalling) {
    const depth = Math.max(0, (ind.rsi[i] - (ob - 8)) / (100 - (ob - 8)));
    return { direction: 'short', strength: Math.min(1, 0.5 + 0.5 * depth), reasons: [`downtrend`, `RSI ${features.rsi} turning down from overbought`, 'MACD falling'], features };
  }
  return flat(['no setup']);
};

export const donchianBreakout: StrategyFn = (c, ind, i, p) => {
  const lb = p.channel ?? 20;
  if (i < lb + 1) return flat(['not enough data']);
  let hi = -Infinity, lo = Infinity;
  for (let j = i - lb; j < i; j++) { hi = Math.max(hi, c[j].high); lo = Math.min(lo, c[j].low); }
  const px = c[i].close, a = ind.atr[i] || 1e-9;
  const features = { close: px, donchian_upper: +hi.toFixed(6), donchian_lower: +lo.toFixed(6), atr: +ind.atr[i].toFixed(6) };
  if (px > hi) return { direction: 'long', strength: Math.min(1, 0.6 + (px - hi) / a * 0.2), reasons: [`breakout above ${lb}-bar high`], features };
  if (px < lo) return { direction: 'short', strength: Math.min(1, 0.6 + (lo - px) / a * 0.2), reasons: [`breakdown below ${lb}-bar low`], features };
  return flat(['inside channel']);
};

export const bollingerMeanRev: StrategyFn = (c, ind, i, p) => {
  const per = p.bb_period ?? 20, k = p.bb_std ?? 2;
  if (i < per + 1) return flat(['not enough data']);
  let sum = 0; for (let j = i - per + 1; j <= i; j++) sum += c[j].close;
  const mean = sum / per;
  let varsum = 0; for (let j = i - per + 1; j <= i; j++) varsum += (c[j].close - mean) ** 2;
  const sd = Math.sqrt(varsum / per), up = mean + k * sd, lo = mean - k * sd;
  const cc = c[i].close, cp = c[i - 1].close;
  const features = { close: cc, bb_upper: +up.toFixed(6), bb_lower: +lo.toFixed(6), bb_mid: +mean.toFixed(6), atr: +ind.atr[i].toFixed(6) };
  if (cp <= lo && cc > cp) { const depth = Math.min(1, (mean - cc) / Math.max(mean - lo, 1e-9)); return { direction: 'long', strength: Math.min(1, 0.5 + 0.5 * depth), reasons: ['reverting up off lower band'], features }; }
  if (cp >= up && cc < cp) { const depth = Math.min(1, (cc - mean) / Math.max(up - mean, 1e-9)); return { direction: 'short', strength: Math.min(1, 0.5 + 0.5 * depth), reasons: ['reverting down off upper band'], features }; }
  return flat(['within bands']);
};

export const STRATEGIES: Record<string, StrategyFn> = { rsi_ema: rsiEma, donchian_breakout: donchianBreakout, bollinger_meanrev: bollingerMeanRev };
export function getStrategy(name: string): StrategyFn {
  const s = STRATEGIES[name]; if (!s) throw new Error(`Unknown strategy '${name}'`); return s;
}
