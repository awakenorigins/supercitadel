import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs'; import { dirname, join } from 'node:path'; import { fileURLToPath } from 'node:url';
import type { TradeCtx } from '../src/types.js';
import { createBot, getBot } from '../src/services/bot.service.js';
import { backtestAndSave, evaluateTurn } from '../src/turn.service.js';
import { recentDecisions } from '../src/services/memory.service.js';
import { SyntheticSource } from '../src/datasource.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const db = new PGlite();
await db.exec(readFileSync(join(__dir, '..', 'migrations', '0000_init.sql'), 'utf8'));
let pass = 0, fail = 0; const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

const ctx: TradeCtx = { db: db as any, orgId: '33333333-3333-3333-3333-333333333333' };
await createBot(ctx, { name: 'main', strategy: 'donchian_breakout', symbols: ['BTC/USDT:USDT'], mode: 'paper' });
const bot = await getBot(ctx, 'main');
const src = new SyntheticSource(7);

// backtest saved to DB
const res = await backtestAndSave(ctx, src, { strategy: 'donchian_breakout', symbol: 'BTC/USDT:USDT', timeframe: '15m', candles: 600, botId: bot.id });
ok(res.metrics.bars === 600, 'backtest ran via data source');
const saved = await db.query('SELECT metrics FROM st_backtests WHERE org_id=$1', [ctx.orgId]);
ok(saved.rows.length === 1, 'backtest persisted to st_backtests');

// evaluate a turn WITHOUT agents -> records a decision (memory)
const t1 = await evaluateTurn(ctx, src, bot, {});
ok(!!t1.decisionId, 'evaluateTurn recorded a decision');
// evaluate WITH agents (stub providers, offline) -> still records, includes votes
const t2 = await evaluateTurn(ctx, src, bot, {}, { useAgents: true });
ok(!!t2.decisionId, 'evaluateTurn with agents recorded a decision');

const mem = await recentDecisions(ctx, bot.id, 10);
ok(mem.length === 2, 'memory holds 2 decision turns');
console.log(`  turn1: ${t1.finalAction} sizeMult=${t1.sizeMult} | turn2(agents): ${t2.finalAction} | ${t2.note}`);
console.log(`\nTURN TESTS: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
