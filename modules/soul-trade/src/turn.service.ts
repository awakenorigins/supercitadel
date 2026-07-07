// Runtime services: one shared assessment pipeline used by BOTH the turn.evaluate tool
// and the auto-trade runner (no drift), plus backtest / walk-forward persisted to DB.
import type { TradeCtx, Candle, Direction } from './types.js';
import type { DataSource } from './datasource.js';
import type { HostLLMEnv } from './llm.js';
import { addIndicators } from './indicators.js';
import { getStrategy } from './strategies.js';
import { scoreSignal, DEFAULT_WEIGHTS } from './signal.js';
import { combineSignals } from './decision.js';
import { runBacktest, type BtResult } from './backtest.js';
import { runWalkForward, type WfResult } from './optimize.js';
import { DEFAULT_PARAMS } from './config.js';
import { orchestrate, applyConsensus, DEFAULT_AGENTS, type AgentDef, type AgentVote } from './agents.js';
import { recordDecision } from './services/memory.service.js';
import { getOrCreateAutomatoConfig, evaluateAutomatoGuards } from './automato.service.js';
import { resolveEmbeddingProvider, decisionToText, recordEmbedding } from './embeddings.js';

export interface Assessment {
  symbol: string; direction: Direction; sizeMult: number; note: string;
  votes: AgentVote[]; aiScore: number; atr: number; close: number; high: number; low: number;
  strategySignal: unknown; aiSignal: unknown;
}

/**
 * Assess ONE symbol on already-fetched candles. `dropLast` removes the (possibly still
 * forming) latest candle so live evaluation never peeks at an unclosed bar.
 */
export async function assessSymbol(candles: Candle[], symbol: string, bot: any, env: HostLLMEnv,
  opts: { useAgents?: boolean; agents?: AgentDef[]; dropLast?: boolean } = {}): Promise<Assessment> {
  const series = (opts.dropLast ?? true) ? candles.slice(0, -1) : candles;
  if (series.length < 80) throw new Error(`not enough closed candles (${series.length})`);
  const params = { ...DEFAULT_PARAMS, ...(bot.params ?? {}) };
  const ind = addIndicators(series, params);
  const i = series.length - 1;
  const dec = getStrategy(bot.strategy)(series, ind, i, params);
  const sig = scoreSignal(ind, i, DEFAULT_WEIGHTS);
  let { direction, sizeMult, note } = combineSignals(dec, sig);

  let votes: AgentVote[] = [];
  if (opts.useAgents && direction !== 'flat') {
    const roster = opts.agents ?? (bot.llm?.agents as AgentDef[]) ?? DEFAULT_AGENTS;
    const { votes: v, consensus } = await orchestrate(roster, {
      symbol, timeframe: bot.timeframe ?? '15m', proposed: direction, aiScore: sig.score, features: dec.features,
    }, env);
    votes = v;
    const applied = applyConsensus(direction, consensus);
    direction = applied.direction; sizeMult = applied.sizeMult;
    note += ` · agents ${consensus.action}(${consensus.confidence})`;
  }
  const bar = series[i];
  return { symbol, direction, sizeMult, note, votes, aiScore: sig.score,
    atr: ind.atr[i], close: bar.close, high: bar.high, low: bar.low,
    strategySignal: dec, aiSignal: sig };
}

/** Persist an assessment as a decision turn; auto-embed for semantic recall when configured. */
export async function persistDecision(ctx: TradeCtx, botId: string, strategy: string, a: Assessment,
  env: HostLLMEnv, embedCfg?: unknown): Promise<string> {
  const id = await recordDecision(ctx, {
    botId, symbol: a.symbol, strategy,
    strategySignal: a.strategySignal, aiSignal: a.aiSignal, agentVotes: a.votes,
    finalAction: a.direction, sizeMult: a.sizeMult, note: a.note,
  });
  // Auto-embed ONLY when an embedding config is present (bot.llm.embedding) — the write
  // needs the pgvector column; failures are non-fatal (host without 0002, provider down).
  if (embedCfg) {
    try {
      const prov = resolveEmbeddingProvider(embedCfg as any, env);
      const [vec] = await prov.embed([decisionToText({ symbol: a.symbol, strategy, finalAction: a.direction, note: a.note, features: (a.strategySignal as any)?.features })]);
      await recordEmbedding(ctx, id, vec);
    } catch { /* non-fatal: memory row is already saved */ }
  }
  return id;
}

/** One evaluation turn (tool path): fetch → assess → record memory. */
export async function evaluateTurn(ctx: TradeCtx, source: DataSource, bot: any, env: HostLLMEnv,
  opts: { useAgents?: boolean; agents?: AgentDef[]; timeframe?: string; candles?: number; dropLast?: boolean } = {}): Promise<{
    symbol: string; finalAction: string; sizeMult: number; note: string; decisionId: string;
  }> {
  const symbol = (bot.symbols?.[0]) ?? 'BTC/USDT:USDT';
  const candles = await source.fetchOHLCV(symbol, opts.timeframe ?? '15m', opts.candles ?? 200);
  const a = await assessSymbol(candles, symbol, bot, env, opts);
  const decisionId = await persistDecision(ctx, bot.id, bot.strategy, a, env, bot.llm?.embedding);
  if (a.direction !== 'flat') {
    const cfg = await getOrCreateAutomatoConfig(ctx, bot.id);
    const guard = await evaluateAutomatoGuards(ctx, bot, cfg, {});
    if (!guard.allowed) return { symbol, finalAction: 'flat', sizeMult: 0, note: `AUTOMATO BLOCK: ${guard.reasons.join(' · ')}`, decisionId };
  }
  return { symbol, finalAction: a.direction, sizeMult: a.sizeMult, note: a.note, decisionId };
}

export async function backtestAndSave(ctx: TradeCtx, source: DataSource, req: {
  strategy: string; symbol: string; timeframe: string; candles: number; params?: Record<string, number>; botId?: string;
}): Promise<BtResult> {
  const candles = await source.fetchOHLCV(req.symbol, req.timeframe, req.candles);
  if (candles.length < 80) throw new Error(`not enough candles (${candles.length})`);
  const params = { ...DEFAULT_PARAMS, ...(req.params ?? {}) };
  const res = runBacktest(candles, req.strategy, params, undefined, DEFAULT_WEIGHTS, req.timeframe);
  await ctx.db.query(
    `INSERT INTO st_backtests(org_id,bot_id,kind,strategy,symbol,timeframe,params,metrics)
     VALUES ($1,$2,'backtest',$3,$4,$5,$6::jsonb,$7::jsonb)`,
    [ctx.orgId, req.botId ?? null, req.strategy, req.symbol, req.timeframe, JSON.stringify(params), JSON.stringify(res.metrics)]);
  return res;
}

export async function walkforwardAndSave(ctx: TradeCtx, source: DataSource, req: {
  strategy: string; symbol: string; timeframe: string; candles: number;
  is_bars?: number; oos_bars?: number; grid?: Record<string, number[]>;
  metric?: 'total_return' | 'sharpe' | 'profit_factor'; botId?: string;
}): Promise<WfResult> {
  const candles = await source.fetchOHLCV(req.symbol, req.timeframe, req.candles);
  if (candles.length < (req.is_bars ?? 500) + (req.oos_bars ?? 150)) throw new Error(`not enough candles (${candles.length})`);
  const res = runWalkForward(candles, req.strategy, req.grid ?? { channel: [10, 20, 30] }, {
    isBars: req.is_bars, oosBars: req.oos_bars, timeframe: req.timeframe, metric: req.metric,
  });
  await ctx.db.query(
    `INSERT INTO st_backtests(org_id,bot_id,kind,strategy,symbol,timeframe,params,metrics)
     VALUES ($1,$2,'walkforward',$3,$4,$5,$6::jsonb,$7::jsonb)`,
    [ctx.orgId, req.botId ?? null, req.strategy, req.symbol, req.timeframe,
     JSON.stringify({ grid: req.grid, is_bars: req.is_bars, oos_bars: req.oos_bars }),
     JSON.stringify({ aggregate: res.aggregate, windows: res.windows.length })]);
  return res;
}
