import { PaperExecutor, makeExecutor } from '../src/executor.js';
import { buildPlan, DEFAULT_RISK } from '../src/risk.js';

let pass = 0, fail = 0; const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };
const noFee = { ...DEFAULT_RISK, takerFee: 0, slippage: 0 };

// open a long, TP hit -> +2R
const ex = new PaperExecutor(1000, noFee);
const plan = buildPlan('BTC/USDT:USDT', 'long', 100, 1, 1000, noFee, 1)!; // stop@98, tp@104, risk $10, size 10
await ex.openPosition(plan);
ok(ex.positions().length === 1 && ex.positions()[0].entry === 100, 'position opened');
const hit = ex.checkExit('BTC/USDT:USDT', 104, 99.5);   // high touches TP
ok(hit?.reason === 'take_profit' && hit.price === 104, 'intrabar TP detected');
const tr = await ex.closePosition('BTC/USDT:USDT', hit!.price, hit!.reason);
ok(tr !== null && Math.abs(tr!.pnl - 20) < 1e-9, `TP pnl = +$20 (=2R of $10 risk; got ${tr!.pnl})`);
ok(Math.abs(tr!.r - 2) < 1e-6, `R multiple = +2 (got ${tr!.r.toFixed(2)})`);
ok(Math.abs((await ex.equity()) - 1020) < 1e-9, 'equity 1000 -> 1020');
ok(ex.positions().length === 0, 'position closed');

// short, stop hit -> -1R
const ex2 = new PaperExecutor(1000, noFee);
const sp = buildPlan('ETH/USDT:USDT', 'short', 100, 1, 1000, noFee, 1)!; // stop@102, tp@96
await ex2.openPosition(sp);
const se = ex2.checkExit('ETH/USDT:USDT', 102, 97);     // high touches stop
ok(se?.reason === 'stop', 'short stop detected');
const st = await ex2.closePosition('ETH/USDT:USDT', se!.price, se!.reason);
ok(st !== null && Math.abs(st!.pnl + 10) < 1e-9, `stop pnl = -$10 (=-1R; got ${st!.pnl})`);

// unrealized MTM
const ex3 = new PaperExecutor(1000, noFee);
await ex3.openPosition(buildPlan('BTC/USDT:USDT', 'long', 100, 1, 1000, noFee, 1)!);
ok(Math.abs(ex3.unrealized({ 'BTC/USDT:USDT': 101 }) - 1005) < 1e-9, 'unrealized MTM at +1.0 (size 5) = +$5');

// factory guards
ok(makeExecutor('paper', {}).mode === 'paper', 'factory paper');
let threw = false; try { makeExecutor('live', {}); } catch { threw = true; }
ok(threw, 'live without keys throws');
ok(makeExecutor('live', { exchangeId: 'bybit', keys: { apiKey: 'k', secret: 's' } }).mode === 'live', 'factory live with keys');

console.log(`\nEXECUTOR TESTS: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
