import type { TradeCtx } from './types.js';
import { j } from './db/client.js';

export const AUTOMATO_PRESETS: Record<string, any> = {
  cautious: { preset: 'cautious', risk_per_trade: 0.25, max_trades_session: 5, session_tp: 3, session_sl: 1.5, cb_loss_streak: 2, cb_cooldown_min: 30, breakeven_at_r: 1, trailing_atr: 0.7, partial_tp_at_r: 1.5, partial_tp_pct: 50, time_stop_bars: 18 },
  standard: { preset: 'standard', risk_per_trade: 0.5, max_trades_session: 10, session_tp: 6, session_sl: 3, cb_loss_streak: 3, cb_cooldown_min: 15, breakeven_at_r: 1, trailing_atr: 0, partial_tp_at_r: 1.5, partial_tp_pct: 50, time_stop_bars: 24 },
  active: { preset: 'active', risk_per_trade: 1, max_trades_session: 18, session_tp: 10, session_sl: 5, cb_loss_streak: 4, cb_cooldown_min: 10, breakeven_at_r: 1, trailing_atr: 0.7, partial_tp_at_r: 1.5, partial_tp_pct: 50, time_stop_bars: 36 },
};
const DEFAULT_STATE = { phase: 'SIM', simLossStreak: 0, realLossStreak: 0, sessionTrades: 0, sessionPnl: 0, stakeMult: 1, phaseHistory: [] as any[], cooldownUntil: null as string | null };
const DEFAULT_SUPER = { lossN: 3, profitReinvestPct: 10, stakeCapMult: 5 };
const num = (v: any) => Number(v ?? 0);

export async function logAutomato(ctx: TradeCtx, botId: string, kind: string, message: string, data: any = {}) {
  try { await ctx.db.query(`INSERT INTO st_automato_log(org_id,bot_id,kind,message,data) VALUES($1,$2,$3,$4,$5::jsonb)`, [ctx.orgId, botId, kind, message, j(data)]); } catch { /* migration 0003 may not be present in old tests/hosts yet */ }
}

export async function getOrCreateAutomatoConfig(ctx: TradeCtx, botId: string) {
  let r: any;
  try { r = await ctx.db.query(`SELECT * FROM st_automato_configs WHERE org_id=$1 AND bot_id=$2`, [ctx.orgId, botId]); }
  catch { return { id: 'missing-migration', org_id: ctx.orgId, bot_id: botId, armed: true, mode: 'live_sim', preset: 'standard', risk_per_trade: 0.5, max_trades_session: 10, session_tp: 6, session_sl: 3, cb_loss_streak: 3, cb_cooldown_min: 15, avoid_funding: false, trade_hours: { mode: '24/7' }, super_mode: 'off', super_cfg: DEFAULT_SUPER, state: DEFAULT_STATE }; }
  if (!r.rows[0]) {
    await ctx.db.query(`INSERT INTO st_automato_configs(org_id,bot_id) VALUES($1,$2) ON CONFLICT (org_id,bot_id) DO NOTHING`, [ctx.orgId, botId]);
    await logAutomato(ctx, botId, 'config', 'Tạo cấu hình AUTOMATO mặc định Chuẩn', { preset: 'standard' });
    r = await ctx.db.query(`SELECT * FROM st_automato_configs WHERE org_id=$1 AND bot_id=$2`, [ctx.orgId, botId]);
  }
  return r.rows[0] as any;
}

export async function configureAutomato(ctx: TradeCtx, botId: string, patch: Record<string, any>) {
  await getOrCreateAutomatoConfig(ctx, botId);
  const allowed = ['armed','mode','risk_per_trade','max_trades_session','session_tp','session_sl','breakeven_at_r','trailing_atr','partial_tp_at_r','partial_tp_pct','time_stop_bars','cb_loss_streak','cb_cooldown_min','avoid_funding','trade_hours','super_mode','super_cfg','state'];
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
  const cfg = await configureAutomato(ctx, botId, { armed, state: { ...DEFAULT_STATE, ...((await getOrCreateAutomatoConfig(ctx, botId)).state ?? {}) } });
  await logAutomato(ctx, botId, armed ? 'arm' : 'disarm', armed ? 'ARM phiên AUTOMATO' : 'DISARM phiên AUTOMATO');
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

export async function automatoLog(ctx: TradeCtx, botId: string, limit = 50) { return (await ctx.db.query(`SELECT at,kind,message,data FROM st_automato_log WHERE org_id=$1 AND bot_id=$2 ORDER BY at DESC LIMIT $3`, [ctx.orgId, botId, limit])).rows; }
export async function automatoAnalytics(ctx: TradeCtx, botId: string) {
  const cfg = await getOrCreateAutomatoConfig(ctx, botId);
  const logs = await automatoLog(ctx, botId, 200);
  const trades = (await ctx.db.query(`SELECT pnl::float8 AS pnl,r_multiple::float8 AS r,reason,created_at FROM st_trades WHERE org_id=$1 AND bot_id=$2 ORDER BY created_at DESC LIMIT 500`, [ctx.orgId, botId])).rows as any[];
  const sim = logs.filter((l: any) => l.kind === 'trade_close' && l.data?.phase === 'SIM'); const real = logs.filter((l: any) => l.kind === 'trade_close' && l.data?.phase === 'REAL');
  const sum = (xs: any[]) => xs.reduce((s, x) => s + num(x.data?.trade?.pnl), 0);
  return { state: cfg.state, mode: cfg.mode, super_mode: cfg.super_mode, ledger: { sim: { trades: sim.length, pnl: sum(sim) }, real: { trades: real.length || trades.length, pnl: sum(real) || trades.reduce((s,t)=>s+num(t.pnl),0) } }, guardBlocks: logs.filter((l: any) => l.kind === 'guard_block').length, phaseHistory: cfg.state?.phaseHistory ?? [] };
}
