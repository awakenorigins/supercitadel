# Soul-Trade — Tools reference (for Tiểu Tâm)

Read tools (kind `tool`) can be called freely. Write actions (kind `action`) mutate state —
Tiểu Tâm confirms with the user first (Citadel confirm–audit–undo).

## Read tools
### bot.list — `soul-trade.bot.list` · perm `trade.bot.read`
List all bots (name, exchange, strategy, mode, status, equity). Input: `{}`.
### bot.status — `soul-trade.bot.status` · perm `trade.bot.read`
One bot's status/equity. Input: `{ "name": "main" }`.
### trades.recent — `soul-trade.trades.recent` · perm `trade.history.read`
Recent fills. Input: `{ "name": "main", "limit": 50 }`.
### analytics.summary — `soul-trade.analytics.summary` · perm `trade.analytics.read`
Aggregate over total trades: `total_trades, wins, win_rate, profit_factor, total_pnl, avg_r,
turns_by_action`. Input: `{ "name": "main" }`.
### analytics.org — `soul-trade.analytics.org` · perm `trade.analytics.read`
Portfolio totals + `by_strategy` breakdown. Input: `{}`.
### memory.recent — `soul-trade.memory.recent` · perm `trade.analytics.read`
Recent decision turns (strategy signal + AI + agent votes). Input: `{ "name": "main", "limit": 50 }`.
### agents.contribution — `soul-trade.agents.contribution` · perm `trade.analytics.read`
Per-agent agreement with the final action. Input: `{ "name": "main" }`.

## Write actions
### bot.create — `soul-trade.bot.create` · perm `trade.bot.write`
Create a bot. Input: `{ "name","exchange","market_type","symbols":[],"strategy","mode","llm":{} }`.
Paper mode needs no keys.
### bot.start / bot.stop — perm `trade.bot.control` · Input: `{ "name": "main" }`.
### bot.delete — `soul-trade.bot.delete` · perm `trade.bot.write` · Input: `{ "name": "main" }`.
### backtest.run — `soul-trade.backtest.run` · perm `trade.backtest.run`
Backtest on real exchange data, saved to `st_backtests`. Input:
`{ "strategy","symbol","timeframe","exchange","candles","params":{} }`.
### turn.evaluate — `soul-trade.turn.evaluate` · perm `trade.bot.control`
Run one evaluation turn (records a decision to memory). Input:
`{ "name":"main", "use_agents":true, "drop_last":true }` — `drop_last` (default true) skips the
still-forming candle so live evaluation never peeks at an unclosed bar.

### memory.recall — `soul-trade.memory.recall` · perm `trade.analytics.read`
Semantic recall — find past decision turns most similar to a described situation (pgvector
cosine). The query text is embedded with the bot's embedding provider (cloud/local/stub).
Input: `{ "name": "main", "query": "BTC breakout strong uptrend", "limit": 5 }`.
Returns rows `{ symbol, final_action, note, size_mult, created_at, similarity }`.

### walkforward.run — `soul-trade.walkforward.run` · perm `trade.backtest.run`
Walk-forward optimization: grid-search params on rolling in-sample windows, validate on the
next out-of-sample window, roll forward; only the stitched OOS result is reported. Saved to
`st_backtests` with `kind='walkforward'`. Input:
`{ "strategy","symbol","timeframe","exchange","candles","is_bars","oos_bars","grid":{"channel":[10,20,30]},"metric" }`.
Returns `{ aggregate:{windows,oos_total_return,oos_trades,oos_win_rate,oos_max_drawdown,final_equity}, windows:[…] }`.
