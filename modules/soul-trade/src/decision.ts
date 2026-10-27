// Shared combine logic — identical for live and backtest (no drift).
import type { StrategyDecision, AISignal, Direction } from './types.js';
const OPP: Record<string, Direction> = { long: 'short', short: 'long' };

export function combineSignals(dec: StrategyDecision, sig: AISignal, vetoConf = 0.5, standaloneConf = 1.0): { direction: Direction; sizeMult: number; note: string } {
  if (dec.direction !== 'flat') {
    const aiOpposes = sig.direction === OPP[dec.direction] && sig.confidence >= vetoConf;
    if (aiOpposes) return { direction: 'flat', sizeMult: 0, note: `AI veto (AI=${sig.direction} conf=${sig.confidence})` };
    const size = sig.direction === dec.direction ? 1.0 : 0.75;
    return { direction: dec.direction, sizeMult: size, note: sig.direction === dec.direction ? 'AI confirms' : 'AI neutral' };
  }
  if (sig.direction !== 'flat' && sig.confidence >= standaloneConf) return { direction: sig.direction, sizeMult: 1.0, note: 'standalone AI' };
  return { direction: 'flat', sizeMult: 0, note: 'no setup' };
}
