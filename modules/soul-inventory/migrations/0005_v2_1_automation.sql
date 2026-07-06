-- ============================================================
-- SOUL-INVENTORY v2.1 — Migration 0005: AUTOMATION LAYER (nhẹ)
-- Chỉ phần AN TOÀN: safety stock, reorder point động, demand forecast
-- (MA + SES), EOQ, ABC-XYZ, dead stock detection, snapshot forecast.
-- KHÔNG auto-tạo PO, KHÔNG cron nội bộ (host gọi runScheduledTasks).
-- Mọi bảng org_id (+index) + timestamps; FORCE RLS ở 0006.
-- ============================================================

-- ── DEMAND STATS: thống kê nhu cầu xuất theo item, tái tính định kỳ ──
-- Nguồn: kho_movements type issue/reserve_fulfill. Lưu lại để không phải
-- quét toàn ledger mỗi lần, và để tính forecast/safety stock/EOQ.
CREATE TABLE IF NOT EXISTS kho_demand_stats (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL,
  item_id        uuid NOT NULL REFERENCES kho_items(id),
  window_days    integer NOT NULL DEFAULT 90,       -- cửa sổ tính
  avg_daily      numeric(18,4) NOT NULL DEFAULT 0,  -- nhu cầu bình quân/ngày
  stddev_daily   numeric(18,4) NOT NULL DEFAULT 0,  -- độ lệch chuẩn/ngày (cho safety stock)
  cv             numeric(9,4) NOT NULL DEFAULT 0,   -- hệ số biến động = stddev/avg (cho XYZ)
  total_issued   numeric(18,3) NOT NULL DEFAULT 0,
  active_days    integer NOT NULL DEFAULT 0,        -- số ngày có phát sinh xuất
  computed_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kho_demand_stats_org_item_uq UNIQUE (org_id, item_id)
);
CREATE INDEX IF NOT EXISTS kho_demand_stats_org_idx ON kho_demand_stats (org_id);

-- ── FORECAST: dự báo nhu cầu kỳ tới (MA + SES), lưu để Tiểu Tâm đọc ──
CREATE TABLE IF NOT EXISTS kho_forecasts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL,
  item_id        uuid NOT NULL REFERENCES kho_items(id),
  method         text NOT NULL CHECK (method IN ('moving_avg','ses')),
  horizon_days   integer NOT NULL DEFAULT 30,
  forecast_qty   numeric(18,3) NOT NULL,            -- dự báo tổng nhu cầu trong horizon
  daily_rate     numeric(18,4) NOT NULL,            -- nhu cầu/ngày dự báo
  computed_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kho_forecasts_org_item_uq UNIQUE (org_id, item_id)
);
CREATE INDEX IF NOT EXISTS kho_forecasts_org_idx ON kho_forecasts (org_id);

-- ── REPLENISHMENT PARAMS: tham số bổ hàng động per item (+location) ──
-- reorder_point = avg_daily × lead_time + safety_stock
-- safety_stock  = z(service_level) × stddev_daily × sqrt(lead_time)
-- eoq           = sqrt(2 × annual_demand × order_cost / holding_cost)
CREATE TABLE IF NOT EXISTS kho_replenish_params (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL,
  item_id          uuid NOT NULL REFERENCES kho_items(id),
  location_id      uuid REFERENCES kho_locations(id),      -- NULL = toàn org
  service_level    numeric(5,4) NOT NULL DEFAULT 0.95,     -- 90/95/97/99%
  lead_time_days   integer NOT NULL DEFAULT 7,
  order_cost       numeric(18,2) NOT NULL DEFAULT 0,       -- chi phí mỗi lần đặt (cho EOQ)
  holding_cost_pct numeric(6,4) NOT NULL DEFAULT 0.20,     -- % chi phí lưu kho/năm (cho EOQ)
  -- các giá trị tính ra, cache lại để gợi ý nhanh:
  safety_stock     numeric(18,3) NOT NULL DEFAULT 0,
  reorder_point    numeric(18,3) NOT NULL DEFAULT 0,
  eoq              numeric(18,3) NOT NULL DEFAULT 0,
  computed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kho_replenish_service_range CHECK (service_level > 0 AND service_level < 1),
  CONSTRAINT kho_replenish_holding_range CHECK (holding_cost_pct >= 0)
);
CREATE INDEX IF NOT EXISTS kho_replenish_params_org_idx ON kho_replenish_params (org_id);
CREATE UNIQUE INDEX IF NOT EXISTS kho_replenish_org_item_loc_uq
  ON kho_replenish_params (org_id, item_id, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ── ITEM: thêm trục XYZ (biến động nhu cầu) bên cạnh abc_class sẵn có ──
ALTER TABLE kho_items ADD COLUMN IF NOT EXISTS xyz_class text
  CHECK (xyz_class IN ('X','Y','Z') OR xyz_class IS NULL);

-- ── AUTOMATION LOG: nhật ký chạy scheduled tasks (minh bạch, chống "im lặng") ──
CREATE TABLE IF NOT EXISTS kho_automation_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  task          text NOT NULL,                     -- 'demand_stats','forecast','replenish','dead_stock','all'
  items_touched integer NOT NULL DEFAULT 0,
  findings      jsonb,                             -- tóm tắt kết quả (vd số hàng cần đặt)
  ran_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kho_automation_runs_org_idx ON kho_automation_runs (org_id, ran_at);
