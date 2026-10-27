import { pgTable, uuid, text, jsonb, numeric, timestamp } from 'drizzle-orm/pg-core';
const org = () => uuid('org_id').notNull();
const ts = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();

export const stBots = pgTable('st_bots', {
  id: uuid('id').primaryKey().defaultRandom(), orgId: org(), name: text('name').notNull(),
  exchange: text('exchange').notNull().default('bingx'), marketType: text('market_type').notNull().default('swap'),
  symbols: jsonb('symbols').notNull().default('[]'), strategy: text('strategy').notNull().default('rsi_ema'),
  params: jsonb('params').notNull().default('{}'), risk: jsonb('risk').notNull().default('{}'),
  mode: text('mode').notNull().default('paper'), llm: jsonb('llm').notNull().default('{}'),
  status: text('status').notNull().default('idle'), equity: numeric('equity', { precision: 20, scale: 8 }).notNull().default('0'),
  apiKeyEnc: text('api_key_enc'), apiSecretEnc: text('api_secret_enc'), createdAt: ts(),
});
export const stTrades = pgTable('st_trades', {
  id: uuid('id').primaryKey().defaultRandom(), orgId: org(), botId: uuid('bot_id').notNull(),
  symbol: text('symbol').notNull(), direction: text('direction').notNull(),
  entry: numeric('entry', { precision: 20, scale: 8 }).notNull(), exit: numeric('exit', { precision: 20, scale: 8 }),
  size: numeric('size', { precision: 20, scale: 8 }).notNull(), pnl: numeric('pnl', { precision: 20, scale: 8 }),
  rMultiple: numeric('r_multiple', { precision: 10, scale: 4 }), reason: text('reason'), strategy: text('strategy'),
  openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(), closedAt: timestamp('closed_at', { withTimezone: true }), createdAt: ts(),
});
export const stDecisions = pgTable('st_decisions', {
  id: uuid('id').primaryKey().defaultRandom(), orgId: org(), botId: uuid('bot_id').notNull(),
  symbol: text('symbol').notNull(), strategy: text('strategy'),
  strategySignal: jsonb('strategy_signal'), aiSignal: jsonb('ai_signal'), agentVotes: jsonb('agent_votes'),
  finalAction: text('final_action').notNull(), sizeMult: numeric('size_mult', { precision: 6, scale: 3 }).notNull().default('1'),
  note: text('note'), createdAt: ts(),
});
export const stBacktests = pgTable('st_backtests', {
  id: uuid('id').primaryKey().defaultRandom(), orgId: org(), botId: uuid('bot_id'), kind: text('kind').notNull().default('backtest'),
  strategy: text('strategy').notNull(), symbol: text('symbol').notNull(), timeframe: text('timeframe').notNull(),
  params: jsonb('params').notNull().default('{}'), metrics: jsonb('metrics').notNull().default('{}'), createdAt: ts(),
});
export const stSettings = pgTable('st_settings', {
  id: uuid('id').primaryKey().defaultRandom(), orgId: org(),
  defaults: jsonb('defaults').notNull().default('{}'), llm: jsonb('llm').notNull().default('{}'), createdAt: ts(),
});
export const tradeSchema = { stBots, stTrades, stDecisions, stBacktests, stSettings };
