import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TradeCtx } from '../src/types.js';
import { createBot, listBots, getBot, setStatus } from '../src/services/bot.service.js';
import { recordDecision, recordTrade, recentTrades } from '../src/services/memory.service.js';
import { botAnalytics, orgAnalytics, agentContribution } from '../src/services/analytics.service.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const mig = (f: string) => readFileSync(join(__dir, '..', 'migrations', f), 'utf8');
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.log('  ✗ FAIL:', m); } };

const db = new PGlite();
// migrations apply (core + RLS); pgvector (0002) is host-only, skipped here
await db.exec(mig('0000_init.sql'));
ok(true, '0000_init applied');
await db.exec(mig('0001_rls.sql'));
ok(true, '0001_rls applied (FORCE RLS policies created)');

const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';
const ctxA: TradeCtx = { db: db as any, orgId: ORG_A };
const ctxB: TradeCtx = { db: db as any, orgId: ORG_B };

// create bots in two orgs
const botA = await createBot(ctxA, { name: 'main', strategy: 'rsi_ema', symbols: ['BTC/USDT:USDT'], mode: 'paper' });
await createBot(ctxA, { name: 'alt', strategy: 'donchian_breakout' });
const botB = await createBot(ctxB, { name: 'main', strategy: 'bollinger_meanrev' });
ok(!!botA && !!botB, 'bots created in org A and org B');

// org isolation at service layer
const aBots = await listBots(ctxA), bBots = await listBots(ctxB);
ok(aBots.length === 2 && bBots.length === 1, 'org isolation: A sees 2, B sees 1');
ok(!aBots.find((x: any) => x.id === botB), 'org A cannot see org B bot');
await setStatus(ctxA, 'main', 'running');
ok((await getBot(ctxA, 'main')).status === 'running', 'status update scoped to org');

// record decisions (per-turn memory) with agent votes
const votes = [
  { name: 'signal-agent', action: 'long', confidence: 0.7, reason: 'oversold bounce' },
  { name: 'risk-agent', action: 'long', confidence: 0.6, reason: 'vol acceptable' },
  { name: 'sentiment-agent', action: 'flat', confidence: 0.3, reason: 'mixed' },
];
for (let k = 0; k < 5; k++)
  await recordDecision(ctxA, { botId: botA, symbol: 'BTC/USDT:USDT', strategy: 'rsi_ema',
    strategySignal: { direction: 'long', strength: 0.6 }, aiSignal: { score: 0.4, direction: 'long', confidence: 0.9 },
    agentVotes: votes, finalAction: 'long', sizeMult: 0.75, note: 'AI confirms' });
await recordDecision(ctxA, { botId: botA, symbol: 'BTC/USDT:USDT', strategy: 'rsi_ema',
  strategySignal: { direction: 'flat' }, aiSignal: { score: 0.02, direction: 'flat', confidence: 0.1 },
  agentVotes: [], finalAction: 'flat', sizeMult: 0, note: 'no setup' });

// record trades: 3 wins, 2 losses
const T = [[70,+18,'take_profit'],[65,-9,'stop'],[80,+21,'take_profit'],[60,-10,'stop'],[75,+19,'take_profit']];
for (const [entry, pnl, reason] of T)
  await recordTrade(ctxA, { botId: botA, symbol: 'BTC/USDT:USDT', direction: 'long', entry: entry as number,
    exit: (entry as number) + (pnl as number), size: 0.1, pnl: pnl as number, r: (pnl as number) > 0 ? 1.98 : -1.02,
    reason: reason as string, strategy: 'rsi_ema', closed: true });

// analytics per bot
const an = await botAnalytics(ctxA, botA);
console.log(`  bot analytics: trades=${an.total_trades} winRate=${(an.win_rate*100).toFixed(0)}% PF=${an.profit_factor.toFixed(2)} pnl=$${an.total_pnl.toFixed(2)} avgR=${an.avg_r.toFixed(2)}`);
ok(an.total_trades === 5 && an.wins === 3, 'analytics: 5 trades, 3 wins');
ok(Math.abs(an.win_rate - 0.6) < 1e-9, 'analytics: win rate 60%');
ok(Math.abs(an.total_pnl - 39) < 1e-9, 'analytics: total pnl = +39');
const expPF = (18+21+19)/(9+10);
ok(Math.abs(an.profit_factor - expPF) < 1e-6, `analytics: PF = ${expPF.toFixed(2)}`);
ok(an.turns_by_action.long === 5 && an.turns_by_action.flat === 1, 'per-turn action counts (5 long, 1 flat)');

// org-level analytics + per-agent contribution
const org = await orgAnalytics(ctxA);
ok(org.total_trades === 5 && org.by_strategy[0].strategy === 'rsi_ema', 'org analytics by strategy');
const contrib = await agentContribution(ctxA, botA);
const sa = contrib.find(c => c.name === 'signal-agent'), se = contrib.find(c => c.name === 'sentiment-agent');
console.log('  agent contribution:', contrib.map(c => `${c.name}=${(c.agreement*100).toFixed(0)}%(${c.votes})`).join(' '));
ok(sa!.agreement === 1 && se!.agreement === 0, 'agent contribution: signal-agent 100%, sentiment-agent 0% (matched final long)');

// isolation on trades read
ok((await recentTrades(ctxB, botB)).length === 0, 'org B sees none of org A trades');

console.log(`\nSMOKE TESTS: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
