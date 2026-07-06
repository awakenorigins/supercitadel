-- ============================================================
-- MODULE KHO (kho) — Migration 0000_init
-- Hợp đồng Citadel mặt cắt ④: mọi bảng có id, org_id (+index),
-- timestamps; chịu RLS (xem 0001_rls.sql)
-- Port logic từ Medusa Inventory Module (MIT):
--   InventoryItem  -> kho_items
--   StockLocation  -> kho_locations
--   InventoryLevel -> kho_stock_levels (stocked/reserved/incoming)
--   ReservationItem-> kho_reservations
--   (+ mở rộng VN: kho_movements = sổ nhật ký N-X-T,
--      kho_stocktakes = kiểm kê Mẫu 05-VT)
-- ============================================================

-- Vật tư / hàng hóa
CREATE TABLE IF NOT EXISTS kho_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL,
  sku         text NOT NULL,
  name        text NOT NULL,
  unit        text NOT NULL DEFAULT 'cái',        -- đơn vị tính
  description text,
  barcode     text,
  min_stock   numeric(18,3) NOT NULL DEFAULT 0,    -- định mức tồn tối thiểu
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kho_items_org_sku_uq UNIQUE (org_id, sku)
);
CREATE INDEX IF NOT EXISTS kho_items_org_idx ON kho_items (org_id);

-- Địa điểm kho
CREATE TABLE IF NOT EXISTS kho_locations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL,
  code        text NOT NULL,
  name        text NOT NULL,
  address     text,
  is_default  boolean NOT NULL DEFAULT false,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kho_locations_org_code_uq UNIQUE (org_id, code)
);
CREATE INDEX IF NOT EXISTS kho_locations_org_idx ON kho_locations (org_id);

-- Mức tồn theo (vật tư × địa điểm) — availability = stocked - reserved
CREATE TABLE IF NOT EXISTS kho_stock_levels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL,
  item_id     uuid NOT NULL REFERENCES kho_items(id),
  location_id uuid NOT NULL REFERENCES kho_locations(id),
  stocked     numeric(18,3) NOT NULL DEFAULT 0,
  reserved    numeric(18,3) NOT NULL DEFAULT 0,
  incoming    numeric(18,3) NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kho_levels_org_item_loc_uq UNIQUE (org_id, item_id, location_id),
  CONSTRAINT kho_levels_stocked_nonneg CHECK (stocked >= 0),
  CONSTRAINT kho_levels_reserved_nonneg CHECK (reserved >= 0)
);
CREATE INDEX IF NOT EXISTS kho_stock_levels_org_idx ON kho_stock_levels (org_id);

-- Sổ nhật ký nhập-xuất-tồn (immutable ledger; đối chiếu Mẫu 01-VT/02-VT)
CREATE TABLE IF NOT EXISTS kho_movements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  item_id       uuid NOT NULL REFERENCES kho_items(id),
  location_id   uuid NOT NULL REFERENCES kho_locations(id),
  type          text NOT NULL CHECK (type IN
                  ('receive','issue','transfer_in','transfer_out','adjust','reserve_fulfill')),
  delta         numeric(18,3) NOT NULL,            -- +nhập / -xuất
  unit_cost     numeric(18,2),                     -- đơn giá (VND) nếu có
  ref_type      text,                              -- vd: 'purchase_order','sale','stocktake'
  ref_id        text,
  note          text,
  actor_user_id uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kho_movements_org_idx ON kho_movements (org_id);
CREATE INDEX IF NOT EXISTS kho_movements_org_item_time_idx
  ON kho_movements (org_id, item_id, created_at DESC);

-- Đặt giữ hàng (reservation) — giữ chỗ trước khi xuất thật
CREATE TABLE IF NOT EXISTS kho_reservations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL,
  item_id     uuid NOT NULL REFERENCES kho_items(id),
  location_id uuid NOT NULL REFERENCES kho_locations(id),
  quantity    numeric(18,3) NOT NULL CHECK (quantity > 0),
  status      text NOT NULL DEFAULT 'active'
              CHECK (status IN ('active','fulfilled','released')),
  ref_type    text,
  ref_id      text,
  note        text,
  expires_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kho_reservations_org_idx ON kho_reservations (org_id);
CREATE INDEX IF NOT EXISTS kho_reservations_org_status_idx
  ON kho_reservations (org_id, status);

-- Phiên kiểm kê (Mẫu 05-VT)
CREATE TABLE IF NOT EXISTS kho_stocktakes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL,
  location_id  uuid NOT NULL REFERENCES kho_locations(id),
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized')),
  note         text,
  started_by   uuid,
  finalized_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kho_stocktakes_org_idx ON kho_stocktakes (org_id);

-- Dòng kiểm kê: expected (sổ sách) vs counted (thực tế) → variance
CREATE TABLE IF NOT EXISTS kho_stocktake_lines (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL,
  stocktake_id uuid NOT NULL REFERENCES kho_stocktakes(id),
  item_id      uuid NOT NULL REFERENCES kho_items(id),
  expected     numeric(18,3) NOT NULL,
  counted      numeric(18,3) NOT NULL,
  variance     numeric(18,3) NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kho_stocktake_lines_org_idx ON kho_stocktake_lines (org_id);

-- ============================================================
-- SOUL-INVENTORY v1.1 — Mở rộng từ nền Kho v1.0 (port từ R9)
-- Lot / Serial / Expiry tracking + weighted avg cost
-- ============================================================

-- Lô hàng / số serial / hạn sử dụng (port ý tưởng inventory_lots của R9)
CREATE TABLE IF NOT EXISTS kho_lots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL,
  item_id     uuid NOT NULL REFERENCES kho_items(id),
  lot_no      text,
  serial_no   text,
  expiry_date date,
  received_at timestamptz NOT NULL DEFAULT now(),
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','consumed','blocked')),
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kho_lots_lot_or_serial CHECK (lot_no IS NOT NULL OR serial_no IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS kho_lots_org_idx ON kho_lots (org_id);
CREATE INDEX IF NOT EXISTS kho_lots_org_item_idx ON kho_lots (org_id, item_id);
CREATE INDEX IF NOT EXISTS kho_lots_org_expiry_idx ON kho_lots (org_id, expiry_date);
CREATE UNIQUE INDEX IF NOT EXISTS kho_lots_org_item_lot_uq
  ON kho_lots (org_id, item_id, lot_no) WHERE lot_no IS NOT NULL AND serial_no IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS kho_lots_org_item_serial_uq
  ON kho_lots (org_id, item_id, serial_no) WHERE serial_no IS NOT NULL;

-- Cột mới trên bảng nền (idempotent)
ALTER TABLE kho_items ADD COLUMN IF NOT EXISTS track_lot boolean NOT NULL DEFAULT false;
ALTER TABLE kho_items ADD COLUMN IF NOT EXISTS track_serial boolean NOT NULL DEFAULT false;
ALTER TABLE kho_items ADD COLUMN IF NOT EXISTS shelf_life_days integer;
ALTER TABLE kho_items ADD COLUMN IF NOT EXISTS avg_cost numeric(18,2) NOT NULL DEFAULT 0;

-- Lot gắn vào mức tồn + sổ + reservation (nullable — hàng không track lot thì NULL)
ALTER TABLE kho_stock_levels ADD COLUMN IF NOT EXISTS lot_id uuid REFERENCES kho_lots(id);
ALTER TABLE kho_movements    ADD COLUMN IF NOT EXISTS lot_id uuid REFERENCES kho_lots(id);
ALTER TABLE kho_reservations ADD COLUMN IF NOT EXISTS lot_id uuid REFERENCES kho_lots(id);

-- Unique level: tách theo có-lot / không-lot (partial index, port pattern R9)
-- LƯU Ý thứ tự: constraint sở hữu index → phải DROP CONSTRAINT trước (index tự rơi theo)
ALTER TABLE kho_stock_levels DROP CONSTRAINT IF EXISTS kho_levels_org_item_loc_uq;
DROP INDEX IF EXISTS kho_levels_org_item_loc_uq;
CREATE UNIQUE INDEX IF NOT EXISTS kho_levels_org_item_loc_nolot_uq
  ON kho_stock_levels (org_id, item_id, location_id) WHERE lot_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS kho_levels_org_item_loc_lot_uq
  ON kho_stock_levels (org_id, item_id, location_id, lot_id) WHERE lot_id IS NOT NULL;
