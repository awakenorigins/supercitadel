import { SyntheticSource } from '../src/datasource.js';
import { runWalkForward, gridProduct } from '../src/optimize.js';

let pass = 0, fail = 0; const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

// grid product
const combos = gridProduct({ channel: [10, 20, 30], atr_period: [14, 21] });
ok(combos.length === 6, `grid product = 6 combos (got ${combos.length})`);
ok(gridProduct({}).length === 1, 'empty grid -> 1 (defaults)');

// walk-forward on a decent sample
const candles = new SyntheticSource(5, 100).fetchOHLCVSync(2000);
const wf = runWalkForward(candles, 'donchian_breakout', { channel: [10, 20, 30] }, { isBars: 500, oosBars: 150 });
ok(wf.windows.length >= 3, `>=3 walk-forward windows (got ${wf.windows.length})`);
ok(wf.aggregate.oos_trades > 0, 'OOS produced trades');
ok(wf.oos_equity.length > 1, 'stitched OOS equity curve built');
ok(Number.isFinite(wf.aggregate.oos_total_return) && Number.isFinite(wf.aggregate.oos_max_drawdown), 'aggregate metrics finite');
ok(wf.aggregate.oos_max_drawdown <= 0, 'OOS max drawdown <= 0');
// each window picked a param from the grid
ok(wf.windows.every(w => [10, 20, 30].includes(w.best_params.channel)), 'every window chose a grid param');
// equity continuity: stitched curve starts at starting equity
ok(Math.abs(wf.oos_equity[0] - 1000) < 1e-6, 'stitched curve starts at starting equity');

console.log(`  windows=${wf.windows.length} OOS_ret=${(wf.aggregate.oos_total_return*100).toFixed(2)}% OOS_trades=${wf.aggregate.oos_trades} winRate=${(wf.aggregate.oos_win_rate*100).toFixed(0)}% DD=${(wf.aggregate.oos_max_drawdown*100).toFixed(2)}%`);
console.log('  best params per window:', wf.windows.map(w => w.best_params.channel).join(','));
console.log(`\nWALK-FORWARD TESTS: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
