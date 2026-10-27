-- ============================================================
-- SOUL-TRADE — Migration 0000_init
-- Citadel contract ④: every table has id, org_id (+index), timestamps.
-- Constitution #5: money uses numeric. Idempotent: IF NOT EXISTS.
-- ============================================================

-- Per-org config: default exchange, strategy, risk, LLM/agent defaults
CREATE TABLE IF NOT EXISTS st_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  defaults jsonb NOT NULL DEFAULT '{}',
  llm jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS st_settings_org_uq ON st_settings (org_id);

-- Trading bots (one isolated engine per row)
CREATE TABLE IF NOT EXISTS st_bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  exchange text NOT NULL DEFAULT 'bingx',
  market_type text NOT NULL DEFAULT 'swap',
  symbols jsonb NOT NULL DEFAULT '[]',
  strategy text NOT NULL DEFAULT 'rsi_ema',
  params jsonb NOT NULL DEFAULT '{}',
  risk jsonb NOT NULL DEFAULT '{}',
  mode text NOT NULL DEFAULT 'paper',           -- paper | live
  llm jsonb NOT NULL DEFAULT '{}',              -- per-bot LLM + agent roster config
  status text NOT NULL DEFAULT 'idle',          -- idle | running | error
  equity numeric(20,8) NOT NULL DEFAULT 0,
  api_key_enc text,                             -- encrypted at rest (host secret)
  api_secret_enc text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS st_bots_org_name_uq ON st_bots (org_id, name);
CREATE INDEX IF NOT EXISTS st_bots_org_idx ON st_bots (org_id);

-- Trade history (every fill, per bot)
CREATE TABLE IF NOT EXISTS st_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  bot_id uuid NOT NULL REFERENCES st_bots(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  direction text NOT NULL,
  entry numeric(20,8) NOT NULL,
  exit numeric(20,8),
  size numeric(20,8) NOT NULL,
  pnl numeric(20,8),
  r_multiple numeric(10,4),
  reason text,
  strategy text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS st_trades_org_bot_idx ON st_trades (org_id, bot_id);
CREATE INDEX IF NOT EXISTS st_trades_org_closed_idx ON st_trades (org_id, closed_at);

-- Decision memory: one row PER TURN (every evaluation), the bot's "memory"
CREATE TABLE IF NOT EXISTS st_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  bot_id uuid NOT NULL REFERENCES st_bots(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  strategy text,
  strategy_signal jsonb,       -- {direction, strength, reasons, features}
  ai_signal jsonb,             -- {score, direction, confidence, contributions}
  agent_votes jsonb,           -- per-agent {name, action, confidence, reason}
  final_action text NOT NULL,  -- long | short | flat
  size_mult numeric(6,3) NOT NULL DEFAULT 1,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS st_decisions_org_bot_idx ON st_decisions (org_id, bot_id, created_at);

-- Saved backtest / walk-forward runs
CREATE TABLE IF NOT EXISTS st_backtests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  bot_id uuid REFERENCES st_bots(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'backtest',   -- backtest | walkforward
  strategy text NOT NULL,
  symbol text NOT NULL,
  timeframe text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}',
  metrics jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS st_backtests_org_idx ON st_backtests (org_id, created_at);
