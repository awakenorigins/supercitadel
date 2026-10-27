// Persistent memory: record every decision (per turn) and every trade.
import type { TradeCtx } from '../types.js';
import { j } from '../db/client.js';

export interface DecisionRow {
  botId: string; symbol: string; strategy: string;
  strategySignal: unknown; aiSignal: unknown; agentVotes: unknown;
  finalAction: string; sizeMult: number; note: string;
}
export async function recordDecision(ctx: TradeCtx, d: DecisionRow): Promise<string> {
  const r = await ctx.db.query<{ id: string }>(
    `INSERT INTO st_decisions(org_id,bot_id,symbol,strategy,strategy_signal,ai_signal,agent_votes,final_action,size_mult,note)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,$10) RETURNING id`,
    [ctx.orgId, d.botId, d.symbol, d.strategy, j(d.strategySignal), j(d.aiSignal), j(d.agentVotes), d.finalAction, d.sizeMult, d.note]);
  return r.rows[0].id;
}
export async function recordTrade(ctx: TradeCtx, t: {
  botId: string; symbol: string; direction: string; entry: number; exit: number | null;
  size: number; pnl: number | null; r: number | null; reason: string; strategy: string; closed: boolean;
}): Promise<void> {
  await ctx.db.query(
    `INSERT INTO st_trades(org_id,bot_id,symbol,direction,entry,exit,size,pnl,r_multiple,reason,strategy,closed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [ctx.orgId, t.botId, t.symbol, t.direction, t.entry, t.exit, t.size, t.pnl, t.r, t.reason, t.strategy, t.closed ? new Date().toISOString() : null]);
}
export async function recentDecisions(ctx: TradeCtx, botId: string, limit = 50) {
  const r = await ctx.db.query(
    `SELECT symbol,strategy,strategy_signal,ai_signal,agent_votes,final_action,size_mult::float8 AS size_mult,note,created_at
     FROM st_decisions WHERE org_id=$1 AND bot_id=$2 ORDER BY created_at DESC LIMIT $3`, [ctx.orgId, botId, limit]);
  return r.rows;
}
export async function recentTrades(ctx: TradeCtx, botId: string, limit = 50) {
  const r = await ctx.db.query(
    `SELECT symbol,direction,entry::float8 AS entry,exit::float8 AS exit,pnl::float8 AS pnl,
            r_multiple::float8 AS r,reason,strategy,opened_at,closed_at
     FROM st_trades WHERE org_id=$1 AND bot_id=$2 ORDER BY opened_at DESC LIMIT $3`, [ctx.orgId, botId, limit]);
  return r.rows;
}
