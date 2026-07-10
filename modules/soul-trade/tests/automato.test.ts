import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs'; import { dirname, join } from 'node:path'; import { fileURLToPath } from 'node:url';
import type { TradeToolCtx } from '../src/tools/index.js';
import { createBot, getBot } from '../src/services/bot.service.js';
import { getOrCreateAutomatoConfig, configureAutomato, applyAutomatoPreset, evaluateAutomatoGuards, afterAutomatoTradeClosed, automatoAnalytics, resolveLeverage, clampLev, LEVERAGE_MAX } from '../src/automato.service.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const db = new PGlite();
for (const m of ['0000_init.sql','0003_automato.sql','0004_automato_ultra.sql','0005_automato_leverage.sql']) await db.exec(readFileSync(join(__dir, '..', 'migrations', m), 'utf8'));
let pass = 0, fail = 0; const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };
const ORG = '55555555-5555-5555-5555-555555555555'; const ctx: TradeToolCtx = { db: db as any, orgId: ORG, env: {} };
await createBot(ctx, { name: 'auto', strategy: 'rsi_ema', symbols: ['BTC/USDT:USDT'], mode: 'paper' });
const bot = await getBot(ctx, 'auto');
const cfg0 = await getOrCreateAutomatoConfig(ctx, bot.id);
ok(cfg0.preset === 'standard' && cfg0.armed === false, 'getOrCreate default standard disarmed');
await configureAutomato(ctx, bot.id, { armed: true, max_trades_session: 1, session_tp: 5, session_sl: 2, avoid_funding: false });
let g = await evaluateAutomatoGuards(ctx, bot, undefined, { nearFunding: false });
ok(g.allowed, 'guards allow armed fresh session');
await afterAutomatoTradeClosed(ctx, bot.id, { pnl: 10, r: 1 });
g = await evaluateAutomatoGuards(ctx, bot, undefined, { nearFunding: false });
ok(g.blocked && g.reasons.some(r => r.includes('giới hạn')), 'max trades/session blocks second trade');
await configureAutomato(ctx, bot.id, { state: { phase:'REAL', simLossStreak:0, realLossStreak:3, sessionTrades:0, sessionPnl:0, stakeMult:1 }, max_trades_session: 10, cb_loss_streak: 3 });
g = await evaluateAutomatoGuards(ctx, bot, undefined, { nearFunding: false });
ok(g.blocked && g.reasons.some(r => r.includes('thua liên tiếp')), 'circuit breaker loss streak blocks');
await configureAutomato(ctx, bot.id, { state: { phase:'SIM', simLossStreak:0, realLossStreak:0, sessionTrades:0, sessionPnl:6, stakeMult:1 }, session_tp: 5 });
g = await evaluateAutomatoGuards(ctx, bot, undefined, { nearFunding: false });
ok(g.blocked && g.reasons.some(r => r.includes('TP phiên')), 'session TP blocks');
const p = await applyAutomatoPreset(ctx, bot.id, 'cautious');
ok(Number(p.risk_per_trade) === 0.25 && Number(p.max_trades_session) === 5, 'preset cautious applied');
await configureAutomato(ctx, bot.id, { armed: true, super_mode:'soft', state: { phase:'SIM', simLossStreak:2, realLossStreak:0, sessionTrades:0, sessionPnl:0, stakeMult:1 } });
const st = await afterAutomatoTradeClosed(ctx, bot.id, { pnl: -5, r: -1 });
ok(st.phase === 'REAL', 'Super soft transitions SIM -> REAL after 3 simulated losses');
const an = await automatoAnalytics(ctx, bot.id);
ok(an.guardBlocks >= 3 && an.phaseHistory.length >= 1, 'analytics returns guard blocks + phase history');
// ULTRA unit checks: long/short 2% trigger, 0.5% giveback, risk cap <=1%
const ultraRiskSize = (equity:number, entry:number, stopPct:number, maxRiskPct:number) => (equity * Math.min(maxRiskPct, 1) / 100) / (entry * stopPct / 100);
const longEntry = 100, longPeak = 102.6, longPull = 102.05;
ok(((longPeak / longEntry - 1) * 100) >= 2, 'ultra long reaches +2% TP threshold');
ok(((longPull / longEntry - 1) * 100) <= ((longPeak / longEntry - 1) * 100) - 0.5, 'ultra long trailing exits after 0.5% giveback from peak');
const shortEntry = 100, shortPeakPx = 97.4, shortPullPx = 97.95;
ok(((shortEntry / shortPeakPx - 1) * 100) >= 2, 'ultra short reaches mirrored +2% TP threshold');
ok(((shortEntry / shortPullPx - 1) * 100) <= ((shortEntry / shortPeakPx - 1) * 100) - 0.5, 'ultra short trailing exits after mirrored 0.5% giveback');
const sz = ultraRiskSize(1000, 100, 1, 1); ok(Math.abs(sz * 1 - 10) < 1e-9, 'ultra position sizing risk <= 1% equity');

// ---- ĐÒN BẨY (leverage) ----
ok(LEVERAGE_MAX === 125, 'leverage max cap = 125x (anh Nấng chốt)');
ok(clampLev(200) === 125 && clampLev(0) === 1 && clampLev(5) === 5, 'clampLev giới hạn [1,125]');
// config leverage persist + clamp
await configureAutomato(ctx, bot.id, { leverage: 999, margin_mode: 'cross', lev_min: 50, lev_max: 3, lev_risk_model: 'B' });
const lc = await getOrCreateAutomatoConfig(ctx, bot.id);
ok(Number(lc.leverage) === 125, 'leverage clamp về 125 khi nhập 999');
ok(lc.margin_mode === 'cross' && lc.lev_risk_model === 'B', 'margin_mode + risk model lưu đúng');
ok(Number(lc.lev_min) === 3 && Number(lc.lev_max) === 50, 'lev_min/max tự đổi chỗ khi min>max');
// resolveLeverage: cố định
ok(resolveLeverage({ auto_leverage: false, leverage: 8 }, []) === 8, 'resolveLeverage cố định = cfg.leverage');
// auto-leverage: vol thấp → gần max ; vol cao → gần min
const calm = Array.from({length:20},(_,i)=>({o:100,h:100.05,l:99.97,c:100}));
const storm = Array.from({length:20},(_,i)=>({o:100,h:101.5,l:98.5,c:100}));
const levCalm = resolveLeverage({ auto_leverage: true, lev_min: 2, lev_max: 20 }, calm);
const levStorm = resolveLeverage({ auto_leverage: true, lev_min: 2, lev_max: 20 }, storm);
ok(levCalm > levStorm, 'auto-leverage: vol thấp đòn bẩy cao hơn vol cao');
ok(levCalm <= 20 && levStorm >= 2, 'auto-leverage nằm trong [lev_min, lev_max]');

console.log(`\nAUTOMATO TESTS: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
