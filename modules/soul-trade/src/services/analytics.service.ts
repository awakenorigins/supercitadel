// Analytics across turns and across total trades.
import type { TradeCtx } from '../types.js';

export async function botAnalytics(ctx: TradeCtx, botId: string) {
  const agg = (await ctx.db.query<any>(
    `SELECT count(*)::int AS trades,
            count(*) FILTER (WHERE pnl > 0)::int AS wins,
            COALESCE(sum(pnl),0)::float8 AS total_pnl,
            COALESCE(sum(pnl) FILTER (WHERE pnl>0),0)::float8 AS gross_win,
            COALESCE(-sum(pnl) FILTER (WHERE pnl<=0),0)::float8 AS gross_loss,
            COALESCE(avg(r_multiple),0)::float8 AS avg_r
     FROM st_trades WHERE org_id=$1 AND bot_id=$2 AND closed_at IS NOT NULL`, [ctx.orgId, botId])).rows[0];
  const turns = (await ctx.db.query<any>(
    `SELECT final_action, count(*)::int AS n FROM st_decisions WHERE org_id=$1 AND bot_id=$2 GROUP BY final_action`, [ctx.orgId, botId])).rows;
  const trades = agg.trades || 0;
  return {
    total_trades: trades, wins: agg.wins || 0,
    win_rate: trades ? agg.wins / trades : 0,
    total_pnl: agg.total_pnl || 0, avg_r: agg.avg_r || 0,
    profit_factor: agg.gross_loss > 0 ? Math.min(agg.gross_win / agg.gross_loss, 999) : (agg.gross_win > 0 ? 999 : 0),
    turns_by_action: Object.fromEntries(turns.map((t: any) => [t.final_action, t.n])),
  };
}

export async function orgAnalytics(ctx: TradeCtx) {
  const byStrat = (await ctx.db.query<any>(
    `SELECT strategy,
            count(*)::int AS trades,
            count(*) FILTER (WHERE pnl>0)::int AS wins,
            COALESCE(sum(pnl),0)::float8 AS pnl
     FROM st_trades WHERE org_id=$1 AND closed_at IS NOT NULL GROUP BY strategy ORDER BY pnl DESC`, [ctx.orgId])).rows;
  const totals = (await ctx.db.query<any>(
    `SELECT count(*)::int AS trades, COALESCE(sum(pnl),0)::float8 AS pnl,
            count(*) FILTER (WHERE pnl>0)::int AS wins FROM st_trades WHERE org_id=$1 AND closed_at IS NOT NULL`, [ctx.orgId])).rows[0];
  return {
    total_trades: totals.trades || 0, total_pnl: totals.pnl || 0,
    win_rate: totals.trades ? totals.wins / totals.trades : 0,
    by_strategy: byStrat.map((s: any) => ({ strategy: s.strategy, trades: s.trades, win_rate: s.trades ? s.wins / s.trades : 0, pnl: s.pnl })),
  };
}

// Per-agent contribution: how often each agent's vote matched the eventual trade direction.
export async function agentContribution(ctx: TradeCtx, botId: string) {
  const rows = (await ctx.db.query<any>(
    `SELECT agent_votes, final_action FROM st_decisions
     WHERE org_id=$1 AND bot_id=$2 AND agent_votes IS NOT NULL AND final_action <> 'flat'`, [ctx.orgId, botId])).rows;
  const tally: Record<string, { agreed: number; total: number }> = {};
  for (const r of rows) {
    const votes = Array.isArray(r.agent_votes) ? r.agent_votes : [];
    for (const v of votes) {
      const name = v.name ?? 'agent';
      tally[name] ??= { agreed: 0, total: 0 };
      tally[name].total++;
      if (v.action === r.final_action) tally[name].agreed++;
    }
  }
  return Object.entries(tally).map(([name, s]) => ({ name, votes: s.total, agreement: s.total ? s.agreed / s.total : 0 }));
}
