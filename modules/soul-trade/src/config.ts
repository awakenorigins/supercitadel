// Soul-Trade defaults (per-org overridable via st_settings.defaults / .llm)
export const DEFAULT_PARAMS: Record<string, number> = {
  ema_fast: 21, ema_slow: 55, rsi_period: 14, rsi_oversold: 32, rsi_overbought: 68,
  atr_period: 14, macd_fast: 12, macd_slow: 26, macd_signal: 9, channel: 20, bb_period: 20, bb_std: 2,
};
export const SUPPORTED_STRATEGIES = ['rsi_ema', 'donchian_breakout', 'bollinger_meanrev'] as const;
export const SUPPORTED_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
