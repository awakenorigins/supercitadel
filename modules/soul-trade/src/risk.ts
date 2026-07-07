// Position sizing + SL/TP (ported)
import type { Direction, RiskParams, TradePlan } from './types.js';
export const DEFAULT_RISK: RiskParams = {
  startingEquity: 1000, riskPerTrade: 0.01, maxPositions: 3, leverage: 3,
  stopAtrMult: 2.0, takeProfitR: 2.0, maxDailyLoss: 0.05, cooldownBars: 3, takerFee: 0.0005, slippage: 0.0005,
};
export function buildPlan(symbol: string, direction: Direction, entry: number, atr: number, equity: number, r: RiskParams, sizeMult = 1): TradePlan | null {
  if (atr <= 0 || entry <= 0 || direction === 'flat') return null;
  const stopDist = r.stopAtrMult * atr;
  const stop = direction === 'long' ? entry - stopDist : entry + stopDist;
  const takeProfit = direction === 'long' ? entry + r.takeProfitR * stopDist : entry - r.takeProfitR * stopDist;
  const riskAmount = equity * r.riskPerTrade * Math.max(0, sizeMult);
  const size = riskAmount / stopDist;
  if (size <= 0) return null;
  return { symbol, direction, entry, stop, takeProfit, size, notional: size * entry, riskAmount };
}
