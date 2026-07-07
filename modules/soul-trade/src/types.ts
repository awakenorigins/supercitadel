// Soul-Trade — shared types
export interface Candle { ts: number; open: number; high: number; low: number; close: number; volume: number; }
export type Direction = 'long' | 'short' | 'flat';

export interface Indicators {
  emaFast: number[]; emaSlow: number[]; rsi: number[]; atr: number[];
  macd: number[]; macdSignal: number[]; macdHist: number[]; roc: number[];
}
export interface StrategyDecision { direction: Direction; strength: number; reasons: string[]; features: Record<string, number>; }
export interface AISignal { score: number; direction: Direction; confidence: number; contributions: Record<string, number>; source: string; }

export interface RiskParams {
  startingEquity: number; riskPerTrade: number; maxPositions: number; leverage: number;
  stopAtrMult: number; takeProfitR: number; maxDailyLoss: number; cooldownBars: number;
  takerFee: number; slippage: number;
}
export interface TradePlan {
  symbol: string; direction: Direction; entry: number; stop: number;
  takeProfit: number; size: number; notional: number; riskAmount: number;
}
// Multi-tenant context passed to every service/tool (matches Citadel HrCtx pattern)
import type { DbClient } from './db/client.js';
export interface TradeCtx { db: DbClient; orgId: string; actor?: string; }
