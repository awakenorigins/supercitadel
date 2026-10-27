-- SOUL-TRADE AUTOMATO — Đa lệnh (multi-order slots) v1.4
-- Anh Nấng (09/07/2026): mỗi bot có thể chạy tối đa 10 lệnh automato song song, mỗi lệnh
-- chọn cặp coin + long/short (hoặc auto) + đòn bẩy + TP/SL riêng (min 0.1%), bật/tắt riêng.
-- Chạy nền qua automato worker; mô phỏng thật (paper) trước khi nối sàn thật.
CREATE TABLE IF NOT EXISTS st_automato_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  bot_id uuid NOT NULL REFERENCES st_bots(id) ON DELETE CASCADE,
  slot int NOT NULL DEFAULT 0,               -- thứ tự hiển thị (0..9)
  symbol varchar(32) NOT NULL DEFAULT 'BTC/USDT',
  side varchar(6) NOT NULL DEFAULT 'auto',   -- long | short | auto (theo strategy)
  leverage int NOT NULL DEFAULT 1,
  tp_pct numeric(10,4) NOT NULL DEFAULT 2,   -- chốt lời % (min 0.1)
  sl_pct numeric(10,4) NOT NULL DEFAULT 1,   -- cắt lỗ % (min 0.1)
  risk_pct numeric(10,4) NOT NULL DEFAULT 1, -- rủi ro %/lệnh
  sim_capital numeric(16,2) NOT NULL DEFAULT 1000,
  armed boolean NOT NULL DEFAULT false,      -- bật/tắt riêng từng lệnh
  state jsonb NOT NULL DEFAULT '{"uiPhase":"standby","openPosition":null,"sessionTrades":0,"sessionPnl":0}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS st_automato_orders_org_bot_idx ON st_automato_orders(org_id, bot_id);
CREATE INDEX IF NOT EXISTS st_automato_orders_armed_idx ON st_automato_orders(armed) WHERE armed = true;

ALTER TABLE st_automato_orders ADD CONSTRAINT st_automato_orders_side_check CHECK (side IN ('long','short','auto'));
ALTER TABLE st_automato_orders ADD CONSTRAINT st_automato_orders_lev_check CHECK (leverage BETWEEN 1 AND 125);
ALTER TABLE st_automato_orders ADD CONSTRAINT st_automato_orders_tp_check CHECK (tp_pct >= 0.1);
ALTER TABLE st_automato_orders ADD CONSTRAINT st_automato_orders_sl_check CHECK (sl_pct >= 0.1);

ALTER TABLE st_automato_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS st_automato_orders_org_isolation ON st_automato_orders;
CREATE POLICY st_automato_orders_org_isolation ON st_automato_orders
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);
