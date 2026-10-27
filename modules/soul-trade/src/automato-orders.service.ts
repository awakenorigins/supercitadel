// SOUL-TRADE AUTOMATO — Đa lệnh (multi-order slots) service.
// Mỗi bot có tối đa 10 lệnh automato song song, mỗi lệnh chọn coin + side + đòn bẩy + TP/SL
// riêng (min 0.1%), bật/tắt riêng. Tick nền qua automato worker. Mô phỏng (paper) thật.
import type { TradeCtx, Direction } from './types.js';
import { addIndicators } from './indicators.js';
import { fetchLiveOHLCV, fetchLivePrice } from './datasource.js';
import { recordTrade } from './services/memory.service.js';
import { logAutomato, clampLev, ultraDirection, pnlFor } from './automato.service.js';
import { j } from './db/client.js';

export const MAX_ORDERS = 10;
const num = (v: any) => Number(v ?? 0);
const clampPct = (v: any, min = 0.1) => Math.max(min, Number(v) || min);
const normalizeSym = (s: string) => String(s || 'BTC/USDT').replace(':USDT', '');

export interface OrderRow {
  id: string; slot: number; symbol: string; side: 'long' | 'short' | 'auto';
  leverage: number; tp_pct: number; sl_pct: number; risk_pct: number;
  sim_capital: number; armed: boolean; state: any;
}

function mapRow(r: any): OrderRow {
  return {
    id: r.id, slot: num(r.slot), symbol: r.symbol, side: r.side,
    leverage: num(r.leverage), tp_pct: num(r.tp_pct), sl_pct: num(r.sl_pct),
    risk_pct: num(r.risk_pct), sim_capital: num(r.sim_capital), armed: !!r.armed,
    state: r.state ?? {},
  };
}

export async function listOrders(ctx: TradeCtx, botId: string): Promise<OrderRow[]> {
  const r = await ctx.db.query(
    `SELECT * FROM st_automato_orders WHERE org_id=$1 AND bot_id=$2 ORDER BY slot ASC, created_at ASC`,
    [ctx.orgId, botId],
  );
  return (r.rows ?? []).map(mapRow);
}

export async function addOrder(ctx: TradeCtx, botId: string, patch: Partial<OrderRow> = {}): Promise<OrderRow> {
  const existing = await listOrders(ctx, botId);
  if (existing.length >= MAX_ORDERS) throw new Error(`Tối đa ${MAX_ORDERS} lệnh — hãy xoá bớt trước khi thêm.`);
  const slot = existing.length ? Math.max(...existing.map((o) => o.slot)) + 1 : 0;
  const symbol = normalizeSym(patch.symbol ?? 'BTC/USDT');
  const side = (patch.side === 'long' || patch.side === 'short') ? patch.side : 'auto';
  const leverage = clampLev(patch.leverage ?? 1);
  const tp = clampPct(patch.tp_pct ?? 2);
  const sl = clampPct(patch.sl_pct ?? 1);
  const risk = clampPct(patch.risk_pct ?? 1);
  const cap = Math.max(1, Number(patch.sim_capital ?? 1000) || 1000);
  const r = await ctx.db.query(
    `INSERT INTO st_automato_orders(org_id,bot_id,slot,symbol,side,leverage,tp_pct,sl_pct,risk_pct,sim_capital,armed)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false) RETURNING *`,
    [ctx.orgId, botId, slot, symbol, side, leverage, tp, sl, risk, cap],
  );
  await logAutomato(ctx, botId, 'order_add', `Thêm lệnh ${side.toUpperCase()} ${symbol} · ${leverage}× · TP ${tp}% / SL ${sl}%`, { slot, symbol, side, leverage, tp, sl });
  return mapRow(r.rows[0]);
}

export async function updateOrder(ctx: TradeCtx, botId: string, orderId: string, patch: Partial<OrderRow>): Promise<OrderRow> {
  const sets: string[] = []; const vals: any[] = [ctx.orgId, botId, orderId]; let i = 4;
  const put = (col: string, v: any) => { sets.push(`${col}=$${i++}`); vals.push(v); };
  if (patch.symbol != null) put('symbol', normalizeSym(patch.symbol));
  if (patch.side != null) put('side', (patch.side === 'long' || patch.side === 'short') ? patch.side : 'auto');
  if (patch.leverage != null) put('leverage', clampLev(patch.leverage));
  if (patch.tp_pct != null) put('tp_pct', clampPct(patch.tp_pct));
  if (patch.sl_pct != null) put('sl_pct', clampPct(patch.sl_pct));
  if (patch.risk_pct != null) put('risk_pct', clampPct(patch.risk_pct));
  if (patch.sim_capital != null) put('sim_capital', Math.max(1, Number(patch.sim_capital) || 1000));
  if (patch.armed != null) put('armed', !!patch.armed);
  if (patch.state != null) { sets.push(`state=$${i++}::jsonb`); vals.push(j(patch.state)); }
  if (!sets.length) { const one = await getOrder(ctx, botId, orderId); if (!one) throw new Error('Không tìm thấy lệnh'); return one; }
  const r = await ctx.db.query(
    `UPDATE st_automato_orders SET ${sets.join(',')}, updated_at=now() WHERE org_id=$1 AND bot_id=$2 AND id=$3 RETURNING *`,
    vals,
  );
  if (!r.rows[0]) throw new Error('Không tìm thấy lệnh');
  return mapRow(r.rows[0]);
}

export async function getOrder(ctx: TradeCtx, botId: string, orderId: string): Promise<OrderRow | null> {
  const r = await ctx.db.query(`SELECT * FROM st_automato_orders WHERE org_id=$1 AND bot_id=$2 AND id=$3`, [ctx.orgId, botId, orderId]);
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}

export async function removeOrder(ctx: TradeCtx, botId: string, orderId: string): Promise<boolean> {
  const r = await ctx.db.query(`DELETE FROM st_automato_orders WHERE org_id=$1 AND bot_id=$2 AND id=$3 RETURNING id`, [ctx.orgId, botId, orderId]);
  await logAutomato(ctx, botId, 'order_remove', `Xoá lệnh ${orderId.slice(0, 8)}`, { orderId });
  return (r.rows?.length ?? 0) > 0;
}

export async function setOrderArmed(ctx: TradeCtx, botId: string, orderId: string, armed: boolean): Promise<OrderRow> {
  const o = await updateOrder(ctx, botId, orderId, { armed });
  await logAutomato(ctx, botId, armed ? 'order_arm' : 'order_disarm', `${armed ? 'BẬT' : 'TẮT'} lệnh ${o.side.toUpperCase()} ${o.symbol}`, { orderId, slot: o.slot });
  return o;
}

/** Tick 1 lệnh (mô phỏng): mở/đóng vị thế theo TP/SL riêng của lệnh đó. Gọi bởi worker nền. */
export async function tickOrder(ctx: TradeCtx, bot: any, order: OrderRow): Promise<void> {
  if (!order.armed) return;
  const symbol = normalizeSym(order.symbol);
  const exchange = bot.exchange ?? 'binance';
  const st = { uiPhase: 'standby', openPosition: null as any, sessionTrades: 0, sessionPnl: 0, ...(order.state ?? {}) };
  const livePrice = await fetchLivePrice(exchange, symbol).catch(() => num(st.openPosition?.lastPrice ?? st.openPosition?.entry));
  if (!livePrice || livePrice <= 0) return;

  // Đang giữ vị thế → check TP/SL riêng của lệnh
  if (st.openPosition) {
    const p = st.openPosition;
    const { pnlAbs, pnlPct } = pnlFor(p, livePrice);
    p.lastPrice = livePrice; p.pnlAbs = pnlAbs; p.pnlPct = pnlPct; p.updatedAt = new Date().toISOString();
    const tpHit = pnlPct >= Math.abs(order.tp_pct);
    const slHit = pnlPct <= -Math.abs(order.sl_pct);
    if (tpHit || slHit) {
      const reason = tpHit ? 'order_take_profit' : 'order_stop_loss';
      await recordTrade(ctx, { botId: bot.id, symbol: p.symbol, direction: p.side, entry: p.entry, exit: livePrice, size: p.size, pnl: pnlAbs, r: pnlPct / Math.max(0.0001, num(p.riskPct)), reason, strategy: 'ULTRA-multi', closed: true });
      st.sessionTrades = num(st.sessionTrades) + 1; st.sessionPnl = num(st.sessionPnl) + pnlPct;
      st.openPosition = null; st.uiPhase = 'scanning';
      await logAutomato(ctx, bot.id, 'order_close', `${tpHit ? 'CHỐT LỜI' : 'CẮT LỖ'} ${p.side.toUpperCase()} ${p.symbol} @ ${pnlPct.toFixed(2)}%`, { orderId: order.id, slot: order.slot, pnlPct, reason });
      await updateOrder(ctx, bot.id, order.id, { state: st });
      return;
    }
    st.uiPhase = 'live';
    await updateOrder(ctx, bot.id, order.id, { state: st });
    return;
  }

  // Chưa có vị thế → tìm hướng vào lệnh
  let dir: Direction;
  if (order.side === 'long' || order.side === 'short') {
    dir = order.side as Direction;
  } else {
    // auto: theo ULTRA strategy
    const candles = await fetchLiveOHLCV(exchange, symbol, '1m', 200).catch(() => []);
    if (!candles.length) { st.uiPhase = 'scanning'; await updateOrder(ctx, bot.id, order.id, { state: st }); return; }
    const series = candles.slice(0, -1);
    const ind = addIndicators(series, { ...(bot.params ?? {}) } as any);
    dir = ultraDirection(series, ind) as Direction;
    if (dir === 'flat') { st.uiPhase = 'scanning'; await updateOrder(ctx, bot.id, order.id, { state: st }); return; }
  }

  const lev = clampLev(order.leverage);
  const capital = Math.max(1, order.sim_capital);
  const riskPct = clampPct(order.risk_pct);
  const stopPct = Math.abs(order.sl_pct);
  const tpPct = Math.abs(order.tp_pct);
  // size cơ sở theo risk%/SL; đòn bẩy khuếch đại notional (model B mặc định cho đa lệnh)
  let size = (capital * riskPct / 100) / (livePrice * stopPct / 100);
  size = size * lev;
  const marginUsd = (livePrice * size) / Math.max(1, lev);
  const liqPct = 100 / Math.max(1, lev);
  st.openPosition = {
    symbol, side: dir, entry: livePrice, size, capital, leverage: lev, marginUsd, liqPct,
    sl: dir === 'long' ? livePrice * (1 - stopPct / 100) : livePrice * (1 + stopPct / 100),
    tp: dir === 'long' ? livePrice * (1 + tpPct / 100) : livePrice * (1 - tpPct / 100),
    riskPct, reason: `multi-order ${dir.toUpperCase()}`, mode: 'sim', strategy: 'ULTRA-multi',
    openedAt: new Date().toISOString(), peakPnlPct: 0, pnlAbs: 0, pnlPct: 0,
  };
  st.uiPhase = 'live';
  await logAutomato(ctx, bot.id, 'order_entry', `Vào ${dir.toUpperCase()} ${symbol} · ${lev}× · TP ${tpPct}%/SL ${stopPct}%`, { orderId: order.id, slot: order.slot, symbol, side: dir, leverage: lev });
  await updateOrder(ctx, bot.id, order.id, { state: st });
}

/** Trạng thái tổng hợp cho UI (list + live pnl mỗi lệnh). */
export async function ordersStatus(ctx: TradeCtx, bot: any): Promise<any[]> {
  const orders = await listOrders(ctx, bot.id);
  const out: any[] = [];
  for (const o of orders) {
    const p = o.state?.openPosition;
    let livePrice = 0, pnlPct = 0, pnlAbs = 0;
    if (p) {
      try { livePrice = await fetchLivePrice(bot.exchange ?? 'binance', normalizeSym(o.symbol)); } catch { livePrice = num(p.lastPrice ?? p.entry); }
      const r = pnlFor(p, livePrice || num(p.entry)); pnlPct = r.pnlPct; pnlAbs = r.pnlAbs;
    }
    out.push({
      id: o.id, slot: o.slot, symbol: o.symbol, side: o.side, leverage: o.leverage,
      tp_pct: o.tp_pct, sl_pct: o.sl_pct, risk_pct: o.risk_pct, sim_capital: o.sim_capital,
      armed: o.armed, uiPhase: o.state?.uiPhase ?? 'standby',
      openPosition: p ? { ...p, pnlPct, pnlAbs, livePrice } : null,
      sessionTrades: num(o.state?.sessionTrades), sessionPnl: num(o.state?.sessionPnl),
    });
  }
  return out;
}
