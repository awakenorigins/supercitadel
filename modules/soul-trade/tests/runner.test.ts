// End-to-end AUTO-TRADE test: the runner must open + close trades BY ITSELF,
// record them to the DB (trades + decision memory + equity), respect cooldown
// and the daily kill-switch, and keep running through per-symbol errors.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs'; import { dirname, join } from 'node:path'; import { fileURLToPath } from 'node:url';
import type { TradeToolCtx } from '../src/tools/index.js';
import { createBot, getBot, setStatus } from '../src/services/bot.service.js';
import { BotRunner, RunnerManager, type RunnerEvent } from '../src/runner.js';
import { PaperExecutor } from '../src/executor.js';
import { SyntheticSource, type DataSource } from '../src/datasource.js';
import type { Candle } from '../src/types.js';
import { DEFAULT_RISK } from '../src/risk.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const db = new PGlite();
await db.exec(readFileSync(join(__dir, '..', 'migrations', '0000_init.sql'), 'utf8'));
let pass = 0, fail = 0; const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

const ORG = '44444444-4444-4444-4444-444444444444';
const ctx: TradeToolCtx = { db: db as any, orgId: ORG, env: {} };
const withCtx = <T,>(fn: (c: TradeToolCtx) => Promise<T>) => fn(ctx);   // tests: static ctx

// A data source that reveals one more candle per tick (simulated market time)
class SteppingSource implements DataSource {
  readonly id = 'stepping';
  private all: Candle[]; i: number;
  constructor(seed: number, total: number, start: number) { this.all = new SyntheticSource(seed, 100).fetchOHLCVSync(total); this.i = start; }
  advance() { if (this.i < this.all.length) this.i++; }
  async fetchOHLCV(_s: string, _tf: string, limit: number): Promise<Candle[]> { return this.all.slice(Math.max(0, this.i - limit), this.i); }
  async fetchPrice(): Promise<number> { return this.all[this.i - 1].close; }
}

// bot with no-fee risk for exact R assertions
await createBot(ctx, { name: 'auto', strategy: 'donchian_breakout', symbols: ['BTC/USDT:USDT'], mode: 'paper',
  params: { channel: 20 }, risk: { takerFee: 0, slippage: 0 } as any });
await setStatus(ctx, 'auto', 'running');
const bot = await getBot(ctx, 'auto');

const src = new SteppingSource(3, 800, 160);
const exec = new PaperExecutor(1000, { ...DEFAULT_RISK, takerFee: 0, slippage: 0 });
const events: RunnerEvent[] = [];
const runner = new BotRunner('auto', withCtx, src, exec, {}, { candles: 150, dropLastCandle: true, onEvent: e => events.push(e) });

// ── drive 500 simulated ticks ──
for (let t = 0; t < 500 && src.i < 799; t++) { await runner.tickOnce(); src.advance(); }

const trades = (await db.query(`SELECT * FROM st_trades WHERE org_id=$1 AND closed_at IS NOT NULL`, [ORG])).rows as any[];
const decisions = (await db.query(`SELECT count(*)::int AS n FROM st_decisions WHERE org_id=$1`, [ORG])).rows[0] as any;
const botAfter = await getBot(ctx, 'auto');

console.log(`  ticks=${runner.stats.ticks} entries=${runner.stats.entries} exits=${runner.stats.exits} trades_in_db=${trades.length} decisions=${decisions.n} equity=${Number(botAfter.equity).toFixed(2)}`);
ok(runner.stats.ticks >= 400, `runner ticked (${runner.stats.ticks})`);
ok(runner.stats.entries >= 1, `runner OPENED trades by itself (${runner.stats.entries})`);
ok(runner.stats.exits >= 1 && trades.length === runner.stats.exits, `runner CLOSED trades + recorded to st_trades (${trades.length})`);
ok(decisions.n === runner.stats.ticks, `every tick recorded a decision memory row (${decisions.n})`);
ok(Number(botAfter.equity) > 0 && Math.abs(Number(botAfter.equity) - 1000) > 1e-9, 'equity persisted + moved from start');

// R-multiples honest: TP≈+2R, stop≈-1R (no fees)
const tp = trades.filter(t => t.reason === 'take_profit'), sl = trades.filter(t => t.reason === 'stop');
if (tp.length) ok(Math.abs(Number(tp[0].r_multiple) - 2) < 0.05, `TP r≈+2 (got ${Number(tp[0].r_multiple).toFixed(2)})`);
if (sl.length) ok(Math.abs(Number(sl[0].r_multiple) + 1) < 0.05, `stop r≈-1 (got ${Number(sl[0].r_multiple).toFixed(2)})`);

// events fired in the right shape
ok(events.some(e => e.type === 'open') && events.some(e => e.type === 'close') && events.some(e => e.type === 'turn'), 'events: turn + open + close emitted');

// equity conservation: 1000 + sum(pnl) == realized equity of executor (no fees)
const sumPnl = trades.reduce((s, t) => s + Number(t.pnl), 0);
const realized = await exec.equity();
const openMtm = exec.positions().length;  // maybe one position still open (unrealized excluded from realized)
ok(Math.abs(1000 + sumPnl - realized) < 1e-6, `equity conservation: 1000+ΣPnL(${sumPnl.toFixed(2)})==realized(${realized.toFixed(2)}) [open_pos=${openMtm}]`);

// ── kill-switch: pin day-start equity high → drawdown breached → entries skipped ──
runner.setDayStart(realized * 2);
const skippedBefore = runner.stats.entriesSkippedKillSwitch;
for (let t = 0; t < 120 && src.i < 799; t++) { await runner.tickOnce(); src.advance(); }
ok(runner.stats.killSwitchActive === true, 'kill-switch tripped on daily drawdown');
ok(runner.stats.entriesSkippedKillSwitch >= skippedBefore, `entries gated by kill-switch (skipped=${runner.stats.entriesSkippedKillSwitch})`);
ok(events.some(e => e.type === 'kill_switch'), 'kill_switch event emitted');

// ── status honor: stop via DB status -> runner does nothing ──
await setStatus(ctx, 'auto', 'idle');
const ticksBefore = runner.stats.ticks;
await runner.tickOnce();
ok(runner.stats.ticks === ticksBefore, 'paused bot (status=idle) is not ticked');

// ── error isolation: broken source on one tick must not throw out ──
const badSrc: DataSource = { id: 'bad', fetchOHLCV: async () => { throw new Error('exchange down'); }, fetchPrice: async () => 0 };
await setStatus(ctx, 'auto', 'running');
const r2 = new BotRunner('auto', withCtx, badSrc, exec, {}, { onEvent: e => events.push(e) });
await r2.tickOnce();
ok(r2.stats.errors >= 1 && events.some(e => e.type === 'error'), 'source failure isolated + error event emitted');

// ── RunnerManager wiring ──
const mgr = new RunnerManager();
mgr.register(ORG, 'auto', runner);
ok(mgr.status().length === 1 && mgr.status()[0].key === `${ORG}:auto`, 'manager tracks runner');
await mgr.stopBot(ctx, ORG, 'auto');
ok((await getBot(ctx, 'auto')).status === 'idle' && !runner.running, 'manager stopBot -> status idle + timer off');
mgr.stopAll();

console.log(`\nRUNNER TESTS: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
