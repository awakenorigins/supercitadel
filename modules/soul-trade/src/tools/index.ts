/**
 * SOUL-TRADE — Tools & Actions for Tiểu Tâm (Citadel integration §06).
 *   READ TOOLS  (kind 'tool')   — queries; the assistant calls freely.
 *   WRITE ACTIONS (kind 'action') — mutate state / place-affecting; confirm first.
 * Each: name (matches manifest) + permission + Zod inputSchema (parsed at the edge) + handler.
 */
import type { z, ZodType } from 'zod';
import type { TradeCtx } from '../types.js';
import type { HostLLMEnv } from '../llm.js';
import { makeDataSource } from '../datasource.js';
import * as S from '../validation/schemas.js';
import { createBot, listBots, getBot, setStatus, deleteBot } from '../services/bot.service.js';
import { recentTrades, recentDecisions } from '../services/memory.service.js';
import { botAnalytics, orgAnalytics, agentContribution } from '../services/analytics.service.js';
import { backtestAndSave, evaluateTurn, walkforwardAndSave } from '../turn.service.js';
import { resolveEmbeddingProvider, recallSimilar } from '../embeddings.js';
import { getOrCreateAutomatoConfig, configureAutomato, applyAutomatoPreset, setAutomatoArmed, automatoLog, automatoAnalytics } from '../automato.service.js';

export type ToolKind = 'tool' | 'action';
export type TradeToolCtx = TradeCtx & { env?: HostLLMEnv };

export interface TradeToolDefinition<T extends ZodType = ZodType> {
  name: string; kind: ToolKind; permission: string; description: string;
  inputSchema: T; docs: string; handler(ctx: TradeToolCtx, raw: unknown): Promise<unknown>;
}
function define<T extends ZodType>(d: {
  name: string; kind: ToolKind; permission: string; description: string;
  inputSchema: T; docs: string; run(ctx: TradeToolCtx, input: z.infer<T>): Promise<unknown>;
}): TradeToolDefinition<T> {
  return { ...d, async handler(ctx, raw) { return d.run(ctx, d.inputSchema.parse(raw)); } };
}
async function mustBot(ctx: TradeToolCtx, name: string) {
  const b = await getBot(ctx, name); if (!b) throw new Error(`Bot '${name}' not found`); return b;
}

export const tradeReadTools: TradeToolDefinition[] = [

  define({ name: 'soul-trade.automato.status', kind: 'tool', permission: 'trade.automato.read',
    description: 'AUTOMATO status/config for one bot.', inputSchema: S.automatoRefSchema, docs: 'docs/AUTOMATO.md',
    run: async (ctx, i) => ({ bot: i.name, config: await getOrCreateAutomatoConfig(ctx, (await mustBot(ctx, i.name)).id) }) }),
  define({ name: 'soul-trade.automato.log', kind: 'tool', permission: 'trade.automato.read',
    description: 'AUTOMATO journal log.', inputSchema: S.automatoLogSchema, docs: 'docs/AUTOMATO.md#journal',
    run: async (ctx, i) => automatoLog(ctx, (await mustBot(ctx, i.name)).id, i.limit ?? 50) }),
  define({ name: 'soul-trade.automato.analytics', kind: 'tool', permission: 'trade.automato.read',
    description: 'AUTOMATO analytics split by SIM/THAT ledgers.', inputSchema: S.automatoRefSchema, docs: 'docs/AUTOMATO.md#analytics',
    run: async (ctx, i) => automatoAnalytics(ctx, (await mustBot(ctx, i.name)).id) }),
  define({ name: 'soul-trade.bot.list', kind: 'tool', permission: 'trade.bot.read',
    description: 'List all trading bots with status and equity.', inputSchema: S.botListSchema,
    docs: 'docs/TOOLS.md#botlist', run: (ctx) => listBots(ctx) }),
  define({ name: 'soul-trade.bot.status', kind: 'tool', permission: 'trade.bot.read',
    description: 'Status, strategy, mode and equity of one bot.', inputSchema: S.botRefSchema,
    docs: 'docs/TOOLS.md#botstatus', run: async (ctx, i) => { const b = await mustBot(ctx, i.name); return { name: b.name, status: b.status, strategy: b.strategy, mode: b.mode, equity: Number(b.equity), symbols: b.symbols }; } }),
  define({ name: 'soul-trade.trades.recent', kind: 'tool', permission: 'trade.history.read',
    description: 'Recent trades (fills) for a bot.', inputSchema: S.tradesRecentSchema,
    docs: 'docs/TOOLS.md#tradesrecent', run: async (ctx, i) => recentTrades(ctx, (await mustBot(ctx, i.name)).id, i.limit ?? 50) }),
  define({ name: 'soul-trade.analytics.summary', kind: 'tool', permission: 'trade.analytics.read',
    description: 'Aggregate performance for a bot: win rate, profit factor, PnL, avg R, per-turn action counts.',
    inputSchema: S.analyticsSchema, docs: 'docs/TOOLS.md#analyticssummary',
    run: async (ctx, i) => botAnalytics(ctx, (await mustBot(ctx, i.name)).id) }),
  define({ name: 'soul-trade.analytics.org', kind: 'tool', permission: 'trade.analytics.read',
    description: 'Portfolio-wide performance across all bots, broken down by strategy.',
    inputSchema: S.orgAnalyticsSchema, docs: 'docs/TOOLS.md#analyticsorg', run: (ctx) => orgAnalytics(ctx) }),
  define({ name: 'soul-trade.memory.recent', kind: 'tool', permission: 'trade.analytics.read',
    description: 'Recent decision turns (the bot memory): strategy + AI + agent votes per evaluation.',
    inputSchema: S.memoryRecentSchema, docs: 'docs/TOOLS.md#memoryrecent',
    run: async (ctx, i) => recentDecisions(ctx, (await mustBot(ctx, i.name)).id, i.limit ?? 50) }),
  define({ name: 'soul-trade.agents.contribution', kind: 'tool', permission: 'trade.analytics.read',
    description: 'How often each agent has agreed with the final action (agent quality).',
    inputSchema: S.analyticsSchema, docs: 'docs/TOOLS.md#agentscontribution',
    run: async (ctx, i) => agentContribution(ctx, (await mustBot(ctx, i.name)).id) }),
  define({ name: 'soul-trade.memory.recall', kind: 'tool', permission: 'trade.analytics.read',
    description: 'Semantic recall: find past decision turns most similar to a described situation (pgvector).',
    inputSchema: S.memoryRecallSchema, docs: 'docs/TOOLS.md#memoryrecall',
    run: async (ctx, i) => {
      const b = await mustBot(ctx, i.name);
      const emb = resolveEmbeddingProvider((b.llm?.embedding) as any, ctx.env ?? {});
      const [vec] = await emb.embed([i.query]);
      return recallSimilar(ctx, b.id, vec, i.limit ?? 5);
    } }),
];

export const tradeWriteActions: TradeToolDefinition[] = [

  define({ name: 'soul-trade.automato.configure', kind: 'action', permission: 'trade.automato.write',
    description: 'Configure AUTOMATO risk shell, shield and Super Automato.', inputSchema: S.automatoConfigureSchema,
    docs: 'docs/AUTOMATO.md', run: async (ctx, i) => { const b = await mustBot(ctx, i.name); const { name, ...patch } = i as any; return configureAutomato(ctx, b.id, patch); } }),
  define({ name: 'soul-trade.automato.arm', kind: 'action', permission: 'trade.automato.control',
    description: 'ARM AUTOMATO session (sensitive).', inputSchema: S.automatoRefSchema,
    docs: 'docs/AUTOMATO.md#arm', run: async (ctx, i) => setAutomatoArmed(ctx, (await mustBot(ctx, i.name)).id, true) }),
  define({ name: 'soul-trade.automato.disarm', kind: 'action', permission: 'trade.automato.control',
    description: 'DISARM AUTOMATO session.', inputSchema: S.automatoRefSchema,
    docs: 'docs/AUTOMATO.md#arm', run: async (ctx, i) => setAutomatoArmed(ctx, (await mustBot(ctx, i.name)).id, false) }),
  define({ name: 'soul-trade.automato.preset', kind: 'action', permission: 'trade.automato.write',
    description: 'Apply AUTOMATO preset: cautious/standard/active.', inputSchema: S.automatoPresetSchema,
    docs: 'docs/AUTOMATO.md#preset', run: async (ctx, i) => applyAutomatoPreset(ctx, (await mustBot(ctx, i.name)).id, i.preset) }),
  define({ name: 'soul-trade.bot.create', kind: 'action', permission: 'trade.bot.write',
    description: 'Create a trading bot. Paper mode needs no keys.', inputSchema: S.botCreateSchema,
    docs: 'docs/TOOLS.md#botcreate', run: async (ctx, i) => ({ id: await createBot(ctx, i), name: i.name }) }),
  define({ name: 'soul-trade.bot.start', kind: 'action', permission: 'trade.bot.control',
    description: 'Start a bot (begin its trading loop).', inputSchema: S.botRefSchema,
    docs: 'docs/TOOLS.md#botstart', run: async (ctx, i) => { await mustBot(ctx, i.name); await setStatus(ctx, i.name, 'running'); return { started: i.name }; } }),
  define({ name: 'soul-trade.bot.stop', kind: 'action', permission: 'trade.bot.control',
    description: 'Stop a bot.', inputSchema: S.botRefSchema, docs: 'docs/TOOLS.md#botstop',
    run: async (ctx, i) => { await mustBot(ctx, i.name); await setStatus(ctx, i.name, 'idle'); return { stopped: i.name }; } }),
  define({ name: 'soul-trade.bot.delete', kind: 'action', permission: 'trade.bot.write',
    description: 'Delete a bot and its history.', inputSchema: S.botRefSchema, docs: 'docs/TOOLS.md#botdelete',
    run: async (ctx, i) => { await mustBot(ctx, i.name); await deleteBot(ctx, i.name); return { deleted: i.name }; } }),
  define({ name: 'soul-trade.backtest.run', kind: 'action', permission: 'trade.backtest.run',
    description: 'Backtest a strategy on real exchange data and save the result.', inputSchema: S.backtestRunSchema,
    docs: 'docs/TOOLS.md#backtestrun', run: async (ctx, i) => {
      const src = makeDataSource(i.exchange);
      const botId = i.bot ? (await mustBot(ctx, i.bot)).id : undefined;
      const res = await backtestAndSave(ctx, src, { ...i, botId });
      return { metrics: res.metrics, trades: res.trades.length };
    } }),
  define({ name: 'soul-trade.turn.evaluate', kind: 'action', permission: 'trade.bot.control',
    description: 'Run one evaluation turn for a bot (records a decision to memory).', inputSchema: S.turnEvaluateSchema,
    docs: 'docs/TOOLS.md#turnevaluate', run: async (ctx, i) => {
      const b = await mustBot(ctx, i.name);
      const src = makeDataSource(b.exchange);
      return evaluateTurn(ctx, src, b, ctx.env ?? {}, { useAgents: i.use_agents, dropLast: i.drop_last });
    } }),
  define({ name: 'soul-trade.walkforward.run', kind: 'action', permission: 'trade.backtest.run',
    description: 'Walk-forward optimize + validate out-of-sample on real exchange data; saves the run.',
    inputSchema: S.walkforwardRunSchema, docs: 'docs/TOOLS.md#walkforwardrun', run: async (ctx, i) => {
      const src = makeDataSource(i.exchange);
      const botId = i.bot ? (await mustBot(ctx, i.bot)).id : undefined;
      const res = await walkforwardAndSave(ctx, src, { ...i, botId });
      return { aggregate: res.aggregate, windows: res.windows };
    } }),
];

export const tradeTools = [...tradeReadTools, ...tradeWriteActions];
export function getTradeTool(name: string) { return tradeTools.find(t => t.name === name); }
