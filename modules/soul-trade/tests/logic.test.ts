import { SyntheticSource } from '../src/datasource.js';
import { addIndicators } from '../src/indicators.js';
import { getStrategy, STRATEGIES } from '../src/strategies.js';
import { scoreSignal } from '../src/signal.js';
import { buildPlan, DEFAULT_RISK } from '../src/risk.js';
import { runBacktest } from '../src/backtest.js';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; } else { fail++; console.log('  ✗ FAIL:', m); } };

// indicators
const candles = new SyntheticSource(11).fetchOHLCVSync(400);
const ind = addIndicators(candles, { ema_fast: 21, ema_slow: 55, rsi_period: 14, atr_period: 14 });
ok(ind.rsi.length === 400 && ind.atr[399] > 0 && Number.isFinite(ind.rsi[399]), 'indicators computed, no NaN');
ok(ind.rsi[399] >= 0 && ind.rsi[399] <= 100, 'RSI in [0,100]');

// strategies registry
ok(Object.keys(STRATEGIES).length === 3, '3 strategies registered');

// risk sizing exact: 1% of 1000 = $10 risked
const plan = buildPlan('BTC/USDT:USDT', 'long', 100, 0.8, 1000, DEFAULT_RISK, 1);
ok(!!plan && Math.abs(plan!.riskAmount - 10) < 1e-9, 'risk sizing = $10 (1%)');
ok(!!plan && Math.abs(Math.abs(plan!.entry - plan!.stop) * plan!.size - plan!.riskAmount) < 1e-6, 'stop distance * size == risk');

// backtest across 3 strategies
for (const name of Object.keys(STRATEGIES)) {
  const res = runBacktest(candles, name, { ema_fast: 21, ema_slow: 55, rsi_period: 14, rsi_oversold: 32, rsi_overbought: 68, atr_period: 14, channel: 20, bb_period: 20, bb_std: 2, macd_fast: 12, macd_slow: 26, macd_signal: 9 });
  ok(res.metrics.bars === 400 && res.metrics.maxDrawdown <= 0 && res.equityCurve.length > 0, `backtest ${name} runs, DD<=0`);
  ok(Number.isFinite(res.metrics.profitFactor) && res.metrics.profitFactor <= 999, `backtest ${name} PF finite & capped`);
  console.log(`  ${name.padEnd(20)} trades=${String(res.metrics.numTrades).padStart(2)} ret=${(res.metrics.totalReturn*100).toFixed(2)}% PF=${res.metrics.profitFactor.toFixed(2)} DD=${(res.metrics.maxDrawdown*100).toFixed(2)}%`);
}

// R-multiples correct: TP≈+2R, stop≈-1R (from a bigger trending sample)
const trend = new SyntheticSource(3, 100).fetchOHLCVSync(600);
const btd = runBacktest(trend, 'donchian_breakout', { channel: 20, atr_period: 14, macd_slow: 26, macd_signal: 9 });
const tps = btd.trades.filter(t => t.reason === 'take_profit'), sls = btd.trades.filter(t => t.reason === 'stop');
if (tps.length) ok(Math.abs(tps[0].r - 1.98) < 0.15, `TP ≈ +2R (got ${tps[0]?.r.toFixed(2)})`);
if (sls.length) ok(Math.abs(sls[0].r + 1.02) < 0.15, `stop ≈ -1R (got ${sls[0]?.r.toFixed(2)})`);

console.log(`\nLOGIC TESTS: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
