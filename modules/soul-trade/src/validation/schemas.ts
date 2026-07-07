import { z } from 'zod';
const strategy = z.enum(['rsi_ema', 'donchian_breakout', 'bollinger_meanrev']);
const timeframe = z.enum(['1m', '5m', '15m', '1h', '4h', '1d']);

export const botListSchema = z.object({}).strict();
export const botRefSchema = z.object({ name: z.string().min(1) }).strict();
export const tradesRecentSchema = z.object({ name: z.string().min(1), limit: z.number().int().min(1).max(200).optional() }).strict();
export const analyticsSchema = z.object({ name: z.string().min(1) }).strict();
export const orgAnalyticsSchema = z.object({}).strict();
export const memoryRecentSchema = z.object({ name: z.string().min(1), limit: z.number().int().min(1).max(200).optional() }).strict();

export const botCreateSchema = z.object({
  name: z.string().min(1).max(40),
  exchange: z.string().default('bingx'),
  market_type: z.enum(['spot', 'swap']).default('swap'),
  symbols: z.array(z.string()).min(1).default(['BTC/USDT:USDT']),
  strategy: strategy.default('rsi_ema'),
  params: z.record(z.number()).optional(),
  risk: z.record(z.any()).optional(),
  mode: z.enum(['paper', 'live']).default('paper'),
  llm: z.record(z.any()).optional(),
}).strict();

export const backtestRunSchema = z.object({
  strategy: strategy,
  symbol: z.string().min(1),
  timeframe: timeframe.default('15m'),
  exchange: z.string().default('bingx'),
  candles: z.number().int().min(120).max(5000).default(1000),
  params: z.record(z.number()).optional(),
  bot: z.string().optional(),
}).strict();

export const turnEvaluateSchema = z.object({
  name: z.string().min(1),
  use_agents: z.boolean().default(false),
  drop_last: z.boolean().default(true),   // skip the still-forming candle (live look-ahead guard)
}).strict();

export const walkforwardRunSchema = z.object({
  strategy: z.enum(['rsi_ema', 'donchian_breakout', 'bollinger_meanrev']),
  symbol: z.string().min(1),
  timeframe: z.enum(['1m', '5m', '15m', '1h', '4h', '1d']).default('15m'),
  exchange: z.string().default('bingx'),
  candles: z.number().int().min(600).max(10000).default(2000),
  is_bars: z.number().int().min(100).max(5000).default(500),
  oos_bars: z.number().int().min(50).max(2000).default(150),
  grid: z.record(z.array(z.number())).default({ channel: [10, 20, 30] }),
  metric: z.enum(['total_return', 'sharpe', 'profit_factor']).default('total_return'),
  bot: z.string().optional(),
}).strict();

export const memoryRecallSchema = z.object({
  name: z.string().min(1),
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(50).optional(),
}).strict();


export const automatoConfigureSchema = z.object({
  name: z.string().min(1),
  mode: z.enum(['shadow','live_sim','live']).optional(),
  risk_per_trade: z.number().min(0.01).max(10).optional(),
  max_trades_session: z.number().int().min(1).max(100).optional(),
  session_tp: z.number().min(0.1).max(100).optional(),
  session_sl: z.number().min(0.1).max(100).optional(),
  breakeven_at_r: z.number().min(0).max(10).optional(),
  trailing_atr: z.number().min(0).max(10).optional(),
  partial_tp_at_r: z.number().min(0).max(20).optional(),
  partial_tp_pct: z.number().int().min(0).max(100).optional(),
  time_stop_bars: z.number().int().min(0).max(10000).optional(),
  cb_loss_streak: z.number().int().min(1).max(20).optional(),
  cb_cooldown_min: z.number().int().min(0).max(10080).optional(),
  avoid_funding: z.boolean().optional(),
  trade_hours: z.record(z.any()).optional(),
  super_mode: z.enum(['off','soft','hard','custom']).optional(),
  super_cfg: z.record(z.any()).optional(),
  state: z.record(z.any()).optional(),
}).strict();
export const automatoPresetSchema = z.object({ name: z.string().min(1), preset: z.enum(['cautious','standard','active']) }).strict();
export const automatoRefSchema = z.object({ name: z.string().min(1) }).strict();
export const automatoLogSchema = z.object({ name: z.string().min(1), limit: z.number().int().min(1).max(500).optional() }).strict();
