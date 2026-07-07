// Pure technical indicators (ported from the tested Python engine)
import type { Candle, Indicators } from './types.js';

export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1); const out: number[] = [];
  let prev = values[0] ?? 0;
  values.forEach((v, i) => { prev = i === 0 ? v : v * k + prev * (1 - k); out.push(prev); });
  return out;
}
export function rsi(values: number[], period = 14): number[] {
  const out: number[] = []; let avgGain = 0, avgLoss = 0; const a = 1 / period;
  for (let i = 0; i < values.length; i++) {
    if (i === 0) { out.push(50); continue; }
    const d = values[i] - values[i - 1];
    const gain = Math.max(d, 0), loss = Math.max(-d, 0);
    avgGain = i === 1 ? gain : gain * a + avgGain * (1 - a);
    avgLoss = i === 1 ? loss : loss * a + avgLoss * (1 - a);
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    out.push(avgLoss === 0 && avgGain === 0 ? 50 : 100 - 100 / (1 + rs));
  }
  return out;
}
export function atr(c: Candle[], period = 14): number[] {
  const out: number[] = []; let prev = 0; const a = 1 / period;
  for (let i = 0; i < c.length; i++) {
    const pc = i > 0 ? c[i - 1].close : c[i].close;
    const tr = Math.max(c[i].high - c[i].low, Math.abs(c[i].high - pc), Math.abs(c[i].low - pc));
    prev = i === 0 ? tr : tr * a + prev * (1 - a);
    out.push(prev);
  }
  return out;
}
export function roc(values: number[], period = 10): number[] {
  return values.map((v, i) => i < period ? 0 : ((v - values[i - period]) / (values[i - period] || 1)) * 100);
}
export function addIndicators(c: Candle[], p: Record<string, number>): Indicators {
  const close = c.map(x => x.close);
  const emaFast = ema(close, p.ema_fast ?? 21);
  const emaSlow = ema(close, p.ema_slow ?? 55);
  const macdLine = ema(close, p.macd_fast ?? 12).map((v, i) => v - ema(close, p.macd_slow ?? 26)[i]);
  const macdSignal = ema(macdLine, p.macd_signal ?? 9);
  const macdHist = macdLine.map((v, i) => v - macdSignal[i]);
  return {
    emaFast, emaSlow, rsi: rsi(close, p.rsi_period ?? 14), atr: atr(c, p.atr_period ?? 14),
    macd: macdLine, macdSignal, macdHist, roc: roc(close, 10),
  };
}
