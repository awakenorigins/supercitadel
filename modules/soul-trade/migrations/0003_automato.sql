-- SOUL-TRADE AUTOMATO v1.1
CREATE TABLE IF NOT EXISTS st_automato_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL,
  bot_id uuid NOT NULL REFERENCES st_bots(id) ON DELETE CASCADE,
  armed boolean NOT NULL DEFAULT false,
  mode varchar(16) NOT NULL DEFAULT 'shadow' CHECK (mode IN ('shadow','live_sim','live')),
  preset varchar(24) NOT NULL DEFAULT 'standard',
  risk_per_trade numeric(8,4) NOT NULL DEFAULT 0.5,
  max_trades_session int NOT NULL DEFAULT 10,
  session_tp numeric(8,4) NOT NULL DEFAULT 6,
  session_sl numeric(8,4) NOT NULL DEFAULT 3,
  breakeven_at_r numeric(8,4) NOT NULL DEFAULT 1,
  trailing_atr numeric(8,4) NOT NULL DEFAULT 0,
  partial_tp_at_r numeric(8,4) NOT NULL DEFAULT 1.5,
  partial_tp_pct int NOT NULL DEFAULT 50,
  time_stop_bars int NOT NULL DEFAULT 24,
  cb_loss_streak int NOT NULL DEFAULT 3,
  cb_cooldown_min int NOT NULL DEFAULT 15,
  avoid_funding boolean NOT NULL DEFAULT true,
  trade_hours jsonb NOT NULL DEFAULT '{"mode":"24/7"}',
  super_mode varchar(16) NOT NULL DEFAULT 'off' CHECK (super_mode IN ('off','soft','hard','custom')),
  super_cfg jsonb NOT NULL DEFAULT '{"lossN":3,"profitReinvestPct":10,"stakeCapMult":5}',
  state jsonb NOT NULL DEFAULT '{"phase":"SIM","simLossStreak":0,"realLossStreak":0,"sessionTrades":0,"sessionPnl":0,"stakeMult":1,"phaseHistory":[]}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, bot_id)
);
CREATE INDEX IF NOT EXISTS st_automato_configs_org_bot_idx ON st_automato_configs(org_id, bot_id);

CREATE TABLE IF NOT EXISTS st_automato_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL,
  bot_id uuid NOT NULL REFERENCES st_bots(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(), kind varchar(40) NOT NULL, message text NOT NULL, data jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS st_automato_log_org_bot_at_idx ON st_automato_log(org_id, bot_id, at DESC);

ALTER TABLE st_automato_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE st_automato_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS st_automato_configs_org_isolation ON st_automato_configs;
DROP POLICY IF EXISTS st_automato_log_org_isolation ON st_automato_log;
CREATE POLICY st_automato_configs_org_isolation ON st_automato_configs
  USING (org_id = current_setting('app.org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);
CREATE POLICY st_automato_log_org_isolation ON st_automato_log
  USING (org_id = current_setting('app.org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);
