import type { TradeCtx, Direction } from './types.js';
import { addIndicators } from './indicators.js';
import { fetchLiveOHLCV, fetchLivePrice } from './datasource.js';
import { recordTrade } from './services/memory.service.js';
import { j } from './db/client.js';

// Trần đòn bẩy toàn hệ thống (anh Nấng chốt 08/07/2026): max 125×.
export const LEVERAGE_MAX = 125;
export const clampLev = (v: any, max = LEVERAGE_MAX) => Math.max(1, Math.min(max, Math.round(Number(v ?? 1) || 1)));

export const AUTOMATO_PRESETS: Record<string, any> = {
  cautious: { preset: 'cautious', risk_per_trade: 0.25, max_trades_session: 5, session_tp: 3, session_sl: 1.5, cb_loss_streak: 2, cb_cooldown_min: 30, breakeven_at_r: 1, trailing_atr: 0.7, partial_tp_at_r: 1.5, partial_tp_pct: 50, time_stop_bars: 18, leverage: 2 },
  standard: { preset: 'standard', risk_per_trade: 0.5, max_trades_session: 10, session_tp: 6, session_sl: 3, cb_loss_streak: 3, cb_cooldown_min: 15, breakeven_at_r: 1, trailing_atr: 0, partial_tp_at_r: 1.5, partial_tp_pct: 50, time_stop_bars: 24, leverage: 5 },
  active: { preset: 'active', risk_per_trade: 1, max_trades_session: 18, session_tp: 10, session_sl: 5, cb_loss_streak: 4, cb_cooldown_min: 10, breakeven_at_r: 1, trailing_atr: 0.7, partial_tp_at_r: 1.5, partial_tp_pct: 50, time_stop_bars: 36, leverage: 10 },
};
const DEFAULT_STATE = { uiPhase: 'standby', phase: 'SIM', simLossStreak: 0, realLossStreak: 0, sessionTrades: 0, sessionPnl: 0, stakeMult: 1, phaseHistory: [] as any[], cooldownUntil: null as string | null, openPosition: null as any, haltedReport: null as any };
export const DEFAULT_ULTRA = { maxRiskPct: 1, tpPct: 2, trailGivebackPct: 0.5, stopLossPct: 1, timeframe: '1m', sizeMult: 1 };
const DEFAULT_SUPER = { lossN: 3, profitReinvestPct: 10, stakeCapMult: 5, ultra: DEFAULT_ULTRA };
const num = (v: any) => Number(v ?? 0);

export async function logAutomato(ctx: TradeCtx, botId: string, kind: string, message: string, data: any = {}) {
  try { await ctx.db.query(`INSERT INTO st_automato_log(org_id,bot_id,kind,message,data) VALUES($1,$2,$3,$4,$5::jsonb)`, [ctx.orgId, botId, kind, message, j(data)]); } catch { /* migration 0003 may not be present in old tests/hosts yet */ }
}

export async function getOrCreateAutomatoConfig(ctx: TradeCtx, botId: string) {
  let r: any;
  try { r = await ctx.db.query(`SELECT * FROM st_automato_configs WHERE org_id=$1 AND bot_id=$2`, [ctx.orgId, botId]); }
  catch { return { id: 'missing-migration', org_id: ctx.orgId, bot_id: botId, armed: true, mode: 'live_sim', preset: 'standard', risk_per_trade: 0.5, max_trades_session: 10, session_tp: 6, session_sl: 3, cb_loss_streak: 3, cb_cooldown_min: 15, avoid_funding: false, trade_hours: { mode: '24/7' }, super_mode: 'off', super_cfg: DEFAULT_SUPER, state: DEFAULT_STATE, leverage: 1, margin_mode: 'isolated', auto_leverage: false, lev_min: 2, lev_max: 20, lev_risk_model: 'A', sim_capital: 1000 }; }
  if (!r.rows[0]) {
    await ctx.db.query(`INSERT INTO st_automato_configs(org_id,bot_id) VALUES($1,$2) ON CONFLICT (org_id,bot_id) DO NOTHING`, [ctx.orgId, botId]);
    await logAutomato(ctx, botId, 'config', 'Tạo cấu hình AUTOMATO mặc định Chuẩn', { preset: 'standard' });
    r = await ctx.db.query(`SELECT * FROM st_automato_configs WHERE org_id=$1 AND bot_id=$2`, [ctx.orgId, botId]);
  }
  return r.rows[0] as any;
}

export async function configureAutomato(ctx: TradeCtx, botId: string, patch: Record<string, any>) {
  await getOrCreateAutomatoConfig(ctx, botId);
  const allowed = ['armed','mode','risk_per_trade','max_trades_session','session_tp','session_sl','breakeven_at_r','trailing_atr','partial_tp_at_r','partial_tp_pct','time_stop_bars','cb_loss_streak','cb_cooldown_min','avoid_funding','trade_hours','super_mode','super_cfg','state','leverage','margin_mode','auto_leverage','lev_min','lev_max','lev_risk_model','sim_capital'];
  // clamp vốn giả lập về tối thiểu 1
  if (patch.sim_capital != null) patch.sim_capital = Math.max(1, Number(patch.sim_capital) || 1000);
  // clamp đòn bẩy về khoảng hợp lệ trước khi ghi DB
  if (patch.leverage != null) patch.leverage = clampLev(patch.leverage);
  if (patch.lev_min != null) patch.lev_min = clampLev(patch.lev_min);
  if (patch.lev_max != null) patch.lev_max = clampLev(patch.lev_max);
  if (patch.lev_min != null && patch.lev_max != null && patch.lev_min > patch.lev_max) { const t = patch.lev_min; patch.lev_min = patch.lev_max; patch.lev_max = t; }
  const keys = Object.keys(patch).filter(k => allowed.includes(k));
  if (!keys.length) return getOrCreateAutomatoConfig(ctx, botId);
  const sets = keys.map((k, i) => `${k}=$${i + 3}${['trade_hours','super_cfg','state'].includes(k) ? '::jsonb' : ''}`).join(',');
  const vals = keys.map(k => ['trade_hours','super_cfg','state'].includes(k) ? j(patch[k]) : patch[k]);
  await ctx.db.query(`UPDATE st_automato_configs SET ${sets}, updated_at=now() WHERE org_id=$1 AND bot_id=$2`, [ctx.orgId, botId, ...vals]);
  await logAutomato(ctx, botId, 'config', 'Cập nhật cấu hình AUTOMATO', patch);
  return getOrCreateAutomatoConfig(ctx, botId);
}

export async function applyAutomatoPreset(ctx: TradeCtx, botId: string, preset: string) {
  const p = AUTOMATO_PRESETS[preset] ?? AUTOMATO_PRESETS.standard;
  const cfg = await configureAutomato(ctx, botId, p);
  await logAutomato(ctx, botId, 'preset', `Áp preset ${p.preset}`, p);
  return cfg;
}
export async function setAutomatoArmed(ctx: TradeCtx, botId: string, armed: boolean) {
  const prev = await getOrCreateAutomatoConfig(ctx, botId);
  let st = { ...DEFAULT_STATE, ...(prev.state ?? {}) };
  if (armed) {
    // ARM = mở PHIÊN MỚI: reset sạch trạng thái cũ (halted, cooldown, số lệnh, streak,
    // báo cáo ngắt, vị thế treo) — nếu không, phiên trước ở 'halted'/đủ max_trades
    // sẽ khiến ARM bị chặn ngay, UI hiện halted → "ARM không được".
    st = { ...DEFAULT_STATE, phaseHistory: [] };
    st.uiPhase = 'scanning';
  } else {
    st.uiPhase = st.openPosition ? 'live' : 'standby';
  }
  const cfg = await configureAutomato(ctx, botId, { armed, state: st });
  await logAutomato(ctx, botId, armed ? 'arm' : 'disarm', armed ? 'ARM phiên AUTOMATO (phiên mới — reset session)' : 'DISARM phiên AUTOMATO');
  return cfg;
}

function inHours(tradeHours: any, d = new Date()) {
  const mode = tradeHours?.mode ?? tradeHours?.label ?? '24/7'; if (mode === '24/7') return true;
  const start = tradeHours?.start ?? (String(mode).match(/(\d\d):(\d\d)/)?.[0] ?? '00:00');
  const end = tradeHours?.end ?? (String(mode).match(/–\s*(\d\d:\d\d)/)?.[1] ?? '23:59');
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes(); const [sh, sm] = start.split(':').map(Number); const [eh, em] = end.split(':').map(Number);
  return mins >= sh * 60 + sm && mins <= eh * 60 + em;
}
function nearFunding(d = new Date()) { const m = d.getUTCMinutes(); const h = d.getUTCHours(); return (h % 8 === 0 && (m <= 10 || m >= 50)); }

export async function evaluateAutomatoGuards(ctx: TradeCtx, bot: any, cfg0?: any, marketState: any = {}) {
  const cfg = cfg0 ?? await getOrCreateAutomatoConfig(ctx, bot.id); const st = { ...DEFAULT_STATE, ...(cfg.state ?? {}) };
  const reasons: string[] = [];
  if (!cfg.armed) reasons.push('AUTOMATO chưa ARM');
  if (st.cooldownUntil && new Date(st.cooldownUntil).getTime() > Date.now()) reasons.push(`Circuit breaker đang nghỉ tới ${st.cooldownUntil}`);
  if (num(st.realLossStreak) >= num(cfg.cb_loss_streak)) reasons.push(`Đủ ${cfg.cb_loss_streak} lệnh THẬT thua liên tiếp`);
  if (num(st.sessionTrades) >= num(cfg.max_trades_session)) reasons.push(`Đạt giới hạn ${cfg.max_trades_session} lệnh/phiên`);
  if (num(st.sessionPnl) >= num(cfg.session_tp)) reasons.push(`Chạm TP phiên +${cfg.session_tp}%`);
  if (num(st.sessionPnl) <= -num(cfg.session_sl)) reasons.push(`Chạm SL phiên -${cfg.session_sl}%`);
  if (!inHours(cfg.trade_hours)) reasons.push('Ngoài khung giờ giao dịch');
  if (cfg.avoid_funding && (marketState.nearFunding || nearFunding())) reasons.push('Né cửa sổ funding/tin biến động');
  const allowed = reasons.length === 0;
  await logAutomato(ctx, bot.id, allowed ? 'guard_allow' : 'guard_block', allowed ? 'Guard cho phép đánh giá/vào lệnh' : reasons.join(' · '), { reasons, state: st });
  return { allowed, blocked: !allowed, reasons, phase: currentPhase(cfg), stakeMult: num(st.stakeMult) || 1 };
}

export function currentPhase(cfg: any): 'SIM' | 'REAL' { return cfg.super_mode && cfg.super_mode !== 'off' ? ((cfg.state?.phase === 'REAL') ? 'REAL' : 'SIM') : (cfg.mode === 'shadow' ? 'SIM' : 'REAL'); }

export function ultraCfg(cfg: any) { return { ...DEFAULT_ULTRA, ...((cfg?.super_cfg?.ultra ?? cfg?.super_cfg) ?? {}) }; }

export function ultraDirection(candles: Array<{ close:number }>, ind: any): 'long' | 'short' | 'flat' {
  const i = candles.length - 1; const prev = Math.max(0, i - 1);
  const emaF = ind.emaFast?.[i] ?? ind.ema?.[i] ?? candles[i].close;
  const emaS = ind.emaSlow?.[i] ?? ind.ema200?.[i] ?? candles[prev].close;
  const mom = candles[i].close - candles[prev].close;
  const rsi = Number(ind.rsi?.[i] ?? 50);
  if (emaF >= emaS && mom >= 0 && rsi < 78) return 'long';
  if (emaF <= emaS && mom <= 0 && rsi > 22) return 'short';
  return mom >= 0 ? 'long' : 'short';
}

export async function afterAutomatoTradeClosed(ctx: TradeCtx, botId: string, trade: { pnl: number; r?: number | null }) {
  const cfg = await getOrCreateAutomatoConfig(ctx, botId); const st = { ...DEFAULT_STATE, ...(cfg.state ?? {}) }; const phase = currentPhase(cfg);
  const pnlPct = num(trade.pnl) / 1000 * 100; // normalized session estimate for paper/live parity
  st.sessionTrades = num(st.sessionTrades) + 1; st.sessionPnl = num(st.sessionPnl) + pnlPct;
  if (phase === 'REAL') st.realLossStreak = num(trade.pnl) < 0 ? num(st.realLossStreak) + 1 : (num(trade.pnl) > 0 ? 0 : num(st.realLossStreak));
  if (phase === 'SIM') st.simLossStreak = num(trade.pnl) < 0 ? num(st.simLossStreak) + 1 : (num(trade.pnl) > 0 ? 0 : num(st.simLossStreak));
  const sc = { ...DEFAULT_SUPER, ...(cfg.super_cfg ?? {}) };
  if (cfg.super_mode && cfg.super_mode !== 'off') {
    const n = cfg.super_mode === 'hard' ? 5 : cfg.super_mode === 'soft' ? 3 : num(sc.lossN) || 3;
    if (phase === 'SIM' && num(st.simLossStreak) >= n) { st.phase = 'REAL'; st.stakeMult = 1; st.phaseHistory = [...(st.phaseHistory ?? []), { at: new Date().toISOString(), phase: 'REAL', reason: `sim_loss_streak_${n}` }]; await logAutomato(ctx, botId, 'phase', 'Super Automato chuyển sang VỐN THẬT', { n }); }
    else if (phase === 'REAL' && num(trade.pnl) < 0) { st.phase = 'SIM'; st.stakeMult = 1; st.simLossStreak = 0; st.phaseHistory = [...(st.phaseHistory ?? []), { at: new Date().toISOString(), phase: 'SIM', reason: 'real_loss' }]; await logAutomato(ctx, botId, 'phase', 'Thua 1 lệnh THẬT → quay về GIẢ LẬP', {}); }
    else if (phase === 'REAL' && num(trade.pnl) > 0) { st.stakeMult = Math.min(num(sc.stakeCapMult) || 5, (num(st.stakeMult) || 1) + (num(sc.profitReinvestPct) || 0) / 100); }
  }
  if (num(st.realLossStreak) >= num(cfg.cb_loss_streak)) st.cooldownUntil = new Date(Date.now() + num(cfg.cb_cooldown_min) * 60000).toISOString();
  await configureAutomato(ctx, botId, { state: st });
  await logAutomato(ctx, botId, 'trade_close', 'Cập nhật ledger AUTOMATO sau đóng lệnh', { trade, state: st, phase });
  return st;
}


function sideMul(side: string) { return side === 'short' ? -1 : 1; }
/**
 * Chọn đòn bẩy hiệu lực cho lệnh sắp vào.
 * - auto_leverage=false → dùng cfg.leverage cố định.
 * - auto_leverage=true  → theo biến động ATR%: vol cao → gần lev_min, vol thấp → gần lev_max.
 * Luôn clamp trong [1, LEVERAGE_MAX] và [lev_min, lev_max].
 */
export function resolveLeverage(cfg: any, series: any[]): number {
  const lo = clampLev(cfg?.lev_min ?? 2), hi = clampLev(cfg?.lev_max ?? 20);
  const min = Math.min(lo, hi), max = Math.max(lo, hi);
  if (!cfg?.auto_leverage) return clampLev(cfg?.leverage ?? 1);
  const n = Math.min(14, series.length - 1);
  if (n < 2) return clampLev(cfg?.leverage ?? min, max);
  let tr = 0; for (let i = series.length - n; i < series.length; i++) {
    const c = series[i], pc = series[i - 1];
    const h = Number(c.h ?? c.high), l = Number(c.l ?? c.low), pcl = Number(pc.c ?? pc.close);
    tr += Math.max(h - l, Math.abs(h - pcl), Math.abs(l - pcl));
  }
  const last = Number(series[series.length - 1].c ?? series[series.length - 1].close) || 1;
  const atrPct = (tr / n) / last * 100;
  const LOW = 0.15, HIGH = 1.2;
  const t = Math.max(0, Math.min(1, (atrPct - LOW) / (HIGH - LOW)));
  const lev = Math.round(max - t * (max - min));
  return clampLev(lev, max);
}

export function pnlFor(p: any, livePrice: number) {
  const entry = num(p.entry), size = num(p.size), capital = Math.max(1, num(p.capital ?? p.entry * p.size));
  const pnlAbs = (livePrice - entry) * size * sideMul(p.side);
  const pnlPct = pnlAbs / capital * 100;
  return { pnlAbs, pnlPct };
}
function uiPhase(cfg: any, st: any) { if (st.uiPhase === 'halted') return 'halted'; if (st.openPosition) return 'live'; if (cfg.armed) return 'scanning'; return 'standby'; }
function normalizeSym(s: string) { return String(s || 'BTC/USDT').replace(':USDT',''); }

export async function getAutomatoPosition(ctx: TradeCtx, bot: any) {
  const cfg = await getOrCreateAutomatoConfig(ctx, bot.id); const st = { ...DEFAULT_STATE, ...(cfg.state ?? {}) };
  const symbol = normalizeSym(st.openPosition?.symbol ?? bot.symbols?.[0] ?? 'BTC/USDT');
  let livePrice = 0;
  try { livePrice = await fetchLivePrice(bot.exchange ?? 'binance', symbol); } catch { livePrice = num(st.openPosition?.lastPrice ?? st.openPosition?.entry); }
  if (cfg.armed && bot.status === 'running') await automatoHeartbeat(ctx, bot, cfg, st, livePrice, symbol);
  const cfg2 = await getOrCreateAutomatoConfig(ctx, bot.id); const st2 = { ...DEFAULT_STATE, ...(cfg2.state ?? {}) };
  const p = st2.openPosition;
  if (p) { try { livePrice = await fetchLivePrice(bot.exchange ?? 'binance', normalizeSym(p.symbol)); } catch {} }
  const pnl = p ? pnlFor(p, livePrice) : { pnlAbs: 0, pnlPct: 0 };
  return { bot: bot.name, phase: uiPhase(cfg2, st2), openPosition: p ? { ...p, mode: p.mode ?? (currentPhase(cfg2)==='SIM'?'sim':'real') } : null,
    livePrice, pnlAbs: pnl.pnlAbs, pnlPct: pnl.pnlPct, sessionPnlPct: num(st2.sessionPnl), sessionTpPct: num(cfg2.session_tp ?? 6), sessionSlPct: num(cfg2.session_sl ?? 3), tradeCount: num(st2.sessionTrades), maxTrades: num(cfg2.max_trades_session ?? 10), mode: currentPhase(cfg2)==='SIM'?'sim':'real',
    leverage: num(p?.leverage ?? cfg2.leverage ?? 1), marginMode: p?.marginMode ?? cfg2.margin_mode ?? 'isolated', autoLeverage: !!cfg2.auto_leverage, levMin: num(cfg2.lev_min ?? 2), levMax: num(cfg2.lev_max ?? 20), levRiskModel: String(cfg2.lev_risk_model ?? 'A'), simCapital: num(cfg2.sim_capital ?? bot.equity ?? 1000), liqPct: num(p?.liqPct ?? (100/Math.max(1,num(p?.leverage ?? cfg2.leverage ?? 1)))),
    haltedReport: st2.haltedReport ?? null };
}

export async function automatoHeartbeat(ctx: TradeCtx, bot: any, cfg0?: any, st0?: any, livePrice0?: number, symbol0?: string) {
  const cfg = cfg0 ?? await getOrCreateAutomatoConfig(ctx, bot.id); const st = { ...DEFAULT_STATE, ...(st0 ?? cfg.state ?? {}) };
  if (!cfg.armed || st.uiPhase === 'halted') return st;
  const symbol = normalizeSym(symbol0 ?? st.openPosition?.symbol ?? bot.symbols?.[0] ?? 'BTC/USDT');
  const livePrice = livePrice0 && livePrice0 > 0 ? livePrice0 : await fetchLivePrice(bot.exchange ?? 'binance', symbol);
  if (st.openPosition) {
    const p = st.openPosition; const { pnlAbs, pnlPct } = pnlFor(p, livePrice); const uc = ultraCfg(cfg);
    p.lastPrice = livePrice; p.pnlAbs = pnlAbs; p.pnlPct = pnlPct; p.peakPnlPct = Math.max(num(p.peakPnlPct), pnlPct); p.updatedAt = new Date().toISOString(); st.openPosition = p; st.uiPhase = 'live';
    const slHit = pnlPct <= -Math.abs(num(uc.stopLossPct ?? cfg.risk_per_trade ?? 1));
    const tpHit = pnlPct >= Math.abs(num(uc.tpPct ?? 2));
    const trailHit = p.peakPnlPct >= Math.abs(num(uc.tpPct ?? 2)) && pnlPct <= p.peakPnlPct - Math.abs(num(uc.trailGivebackPct ?? 0.5));
    if (slHit || tpHit || trailHit) return closeAutomatoPosition(ctx, bot, slHit ? 'ultra_stop_loss' : trailHit ? 'ultra_trailing_lock' : 'ultra_take_profit', livePrice, st, cfg);
    await configureAutomato(ctx, bot.id, { state: st }); return st;
  }
  const guard = await evaluateAutomatoGuards(ctx, bot, cfg, {}); if (!guard.allowed) { st.uiPhase = 'scanning'; await configureAutomato(ctx, bot.id, { state: st }); return st; }
  const candles = await fetchLiveOHLCV(bot.exchange ?? 'binance', symbol, ultraCfg(cfg).timeframe ?? '1m', 200);
  const series = candles.slice(0, -1); const ind = addIndicators(series, { ...(bot.params ?? {}) } as any); const dir = ultraDirection(series, ind) as Direction;
  if (dir === 'flat') { st.uiPhase = 'scanning'; await configureAutomato(ctx, bot.id, { state: st }); return st; }
  // Vốn cơ sở tính size + P&L%: ưu tiên sim_capital (vốn giả lập anh đặt), fallback bot.equity, cuối cùng 1000.
  const equity = Math.max(1, num(cfg.sim_capital ?? bot.equity ?? 1000)); const uc = ultraCfg(cfg); const riskPct = Math.min(num(uc.maxRiskPct ?? cfg.risk_per_trade ?? 1), 1);
  const stopPct = Math.max(0.05, num(uc.stopLossPct ?? 1)); const tpPct = Math.max(0.1, num(uc.tpPct ?? 2)); const capital = equity;
  // ĐÒN BẨY: chọn đòn bẩy (cố định hoặc auto theo ATR)
  const lev = resolveLeverage(cfg, series);
  const riskModel = String(cfg?.lev_risk_model ?? 'A').toUpperCase();
  // size cơ sở theo risk%/SL (mô hình A: giữ nguyên, đòn bẩy chỉ giảm ký quỹ)
  let size = (capital * riskPct / 100) / (livePrice * stopPct / 100);
  // mô hình B: đòn bẩy khuếch đại notional → size × lev (P&L% tăng theo đòn bẩy)
  if (riskModel === 'B') size = size * lev;
  const marginUsd = (livePrice * size) / Math.max(1, lev);
  const liqPct = 100 / Math.max(1, lev);
  st.openPosition = { symbol, side: dir, entry: livePrice, size, capital, leverage: lev, marginMode: cfg?.margin_mode ?? 'isolated', riskModel, marginUsd, liqPct, sl: dir==='long'?livePrice*(1-stopPct/100):livePrice*(1+stopPct/100), tp: dir==='long'?livePrice*(1+tpPct/100):livePrice*(1-tpPct/100), riskPct, reason: 'ULTRA scalping EMA/RSI/momentum', mode: currentPhase(cfg)==='SIM'?'sim':'real', strategy: 'ULTRA', openedAt: new Date().toISOString(), peakPnlPct: 0, pnlAbs: 0, pnlPct: 0 };
  st.uiPhase = 'live'; await configureAutomato(ctx, bot.id, { state: st }); await logAutomato(ctx, bot.id, 'ultra_entry', `ULTRA vào ${String(dir).toUpperCase()} — state.openPosition`, st.openPosition); return st;
}

export async function closeAutomatoPosition(ctx: TradeCtx, bot: any, reason = 'kill', price?: number, st0?: any, cfg0?: any) {
  const cfg = cfg0 ?? await getOrCreateAutomatoConfig(ctx, bot.id); const st = { ...DEFAULT_STATE, ...(st0 ?? cfg.state ?? {}) }; const p = st.openPosition; if (!p) { st.uiPhase = 'halted'; await configureAutomato(ctx, bot.id, { armed: false, state: st }); return st; }
  const exit = price ?? await fetchLivePrice(bot.exchange ?? 'binance', normalizeSym(p.symbol)); const { pnlAbs, pnlPct } = pnlFor(p, exit);
  await recordTrade(ctx, { botId: bot.id, symbol: p.symbol, direction: p.side, entry: p.entry, exit, size: p.size, pnl: pnlAbs, r: pnlPct / Math.max(0.0001, num(p.riskPct)), reason, strategy: bot.strategy, closed: true });
  st.sessionTrades = num(st.sessionTrades) + 1; st.sessionPnl = num(st.sessionPnl) + pnlPct; st.haltedReport = { symbol: p.symbol, side: p.side, entry: p.entry, exit, pnlAbs, pnlPct, reason, closedAt: new Date().toISOString(), trades: st.sessionTrades, equity: num(bot.equity ?? 0) + pnlAbs }; st.openPosition = null; st.uiPhase = 'halted';
  await configureAutomato(ctx, bot.id, { armed: false, state: st }); await logAutomato(ctx, bot.id, 'kill', reason === 'kill' ? 'KILL — đóng & ngắt phiên' : `Đóng vị thế: ${reason}`, st.haltedReport); return st;
}


export async function getAutomatoOHLCV(ctx: TradeCtx, bot: any, timeframe = '1m', limit = 60) {
  const cfg = await getOrCreateAutomatoConfig(ctx, bot.id); const st = { ...DEFAULT_STATE, ...(cfg.state ?? {}) };
  const symbol = normalizeSym(st.openPosition?.symbol ?? bot.symbols?.[0] ?? 'BTC/USDT');
  const exchange = bot.exchange ?? 'binance';
  try {
    const candles = await fetchLiveOHLCV(exchange, symbol, timeframe, limit);
    return { bot: bot.name, exchange, symbol, timeframe, source: 'ccxt', synthetic: false, candles: candles.map(c => ({ t: c.ts, o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume })) };
  } catch (e: any) {
    const { SyntheticSource } = await import('./datasource.js');
    const base = num(st.openPosition?.lastPrice ?? st.openPosition?.entry ?? 100);
    const candles = await new SyntheticSource(42, base > 0 ? base : 100).fetchOHLCV(symbol, timeframe, limit);
    await logAutomato(ctx, bot.id, 'ohlcv_fallback', 'OHLCV live ccxt bị chặn/lỗi — dùng synthetic fallback', { exchange, symbol, timeframe, error: e?.message ?? String(e) });
    return { bot: bot.name, exchange, symbol, timeframe, source: 'synthetic_fallback', synthetic: true, warning: `ccxt live OHLCV unavailable: ${e?.message ?? e}`, candles: candles.map(c => ({ t: c.ts, o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume })) };
  }
}

export async function automatoLog(ctx: TradeCtx, botId: string, limit = 50) { return (await ctx.db.query(`SELECT at,kind,message,data FROM st_automato_log WHERE org_id=$1 AND bot_id=$2 ORDER BY at DESC LIMIT $3`, [ctx.orgId, botId, limit])).rows; }
export async function automatoAnalytics(ctx: TradeCtx, botId: string) {
  const cfg = await getOrCreateAutomatoConfig(ctx, botId);
  const logs = await automatoLog(ctx, botId, 200);
  const trades = (await ctx.db.query(`SELECT pnl::float8 AS pnl,r_multiple::float8 AS r,reason,created_at FROM st_trades WHERE org_id=$1 AND bot_id=$2 ORDER BY created_at DESC LIMIT 500`, [ctx.orgId, botId])).rows as any[];
  const sim = logs.filter((l: any) => l.kind === 'trade_close' && l.data?.phase === 'SIM'); const real = logs.filter((l: any) => l.kind === 'trade_close' && l.data?.phase === 'REAL');
  const sum = (xs: any[]) => xs.reduce((s, x) => s + num(x.data?.trade?.pnl), 0);
  return { state: cfg.state, mode: cfg.mode, super_mode: cfg.super_mode, ledger: { sim: { trades: sim.length, pnl: sum(sim) }, real: { trades: real.length || trades.length, pnl: sum(real) || trades.reduce((s,t)=>s+num(t.pnl),0) } }, guardBlocks: logs.filter((l: any) => l.kind === 'guard_block').length, phaseHistory: cfg.state?.phaseHistory ?? [] };
}
