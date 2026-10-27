/**
 * SOUL-TRADE — entry point + lifecycle (Citadel module contract).
 * available → installed → active → disabled → removed.
 * Register (tools/intents) only on activate; revoke cleanly on disable.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
// 0002 (pgvector) is applied by the host (image ships pgvector); safe to include.
const MIGRATIONS = ['0000_init.sql', '0001_rls.sql', '0002_memory_vector.sql'];

export const MODULE_ID = 'soul-trade';
export const MODULE_VERSION = '1.0.0';

export interface TradeHostContext {
  db: { execute(sqlText: string): Promise<unknown> };
  bus: { emit(event: string, payload: unknown): Promise<void> };
  registry?: { registerTool(m: string, t: unknown): void; registerIntent(m: string, i: unknown): void; unregisterModule(m: string): void; };
}

export async function onInstall(host: TradeHostContext): Promise<void> {
  for (const f of MIGRATIONS) {
    const ddl = await readFile(join(__dir, '..', 'migrations', f), 'utf8');
    await host.db.execute(ddl);
  }
  await host.bus.emit('trade.module.installed', { version: MODULE_VERSION });
}
export async function onActivate(host: TradeHostContext): Promise<void> {
  const { tradeTools } = await import('./tools/index.js');
  const { tradeIntents } = await import('./intents.js');
  if (host.registry) {
    for (const t of tradeTools) host.registry.registerTool(MODULE_ID, t);
    for (const i of tradeIntents) host.registry.registerIntent(MODULE_ID, i);
  }
  await host.bus.emit('trade.module.activated', {});
}
export async function onDisable(host: TradeHostContext): Promise<void> {
  host.registry?.unregisterModule(MODULE_ID);
  await host.bus.emit('trade.module.disabled', {});
}
export async function onRemove(host: TradeHostContext, opts?: { dropData?: boolean }): Promise<void> {
  host.registry?.unregisterModule(MODULE_ID);
  if (opts?.dropData) {
    await host.db.execute('DROP TABLE IF EXISTS st_backtests, st_decisions, st_trades, st_bots, st_settings CASCADE;');
  }
  await host.bus.emit('trade.module.removed', {});
}

// Public API — host imports from this single gate
export { tradeTools, tradeReadTools, tradeWriteActions, getTradeTool } from './tools/index.js';
export { tradeIntents } from './intents.js';
export { createTradeRoutes } from './routes.js';
export { DEFAULT_AGENTS, orchestrate, aggregateVotes, applyConsensus } from './agents.js';
export { resolveProvider, OpenAICompatProvider, StubProvider } from './llm.js';
export { makeDataSource, CcxtSource, SyntheticSource, SUPPORTED_EXCHANGES } from './datasource.js';
export { runBacktest } from './backtest.js';
export { runWalkForward, gridProduct } from './optimize.js';
export { resolveEmbeddingProvider, StubEmbeddings, OpenAICompatEmbeddings, cosine, recallSimilar, recordEmbedding, decisionToText } from './embeddings.js';
export { makeExecutor, PaperExecutor, LiveExecutor } from './executor.js';
export { BotRunner, RunnerManager } from './runner.js';
export { assessSymbol, persistDecision } from './turn.service.js';
export { backtestAndSave, evaluateTurn, walkforwardAndSave } from './turn.service.js';
export { DEFAULT_PARAMS, SUPPORTED_STRATEGIES, SUPPORTED_TIMEFRAMES } from './config.js';
export * from './types.js';
