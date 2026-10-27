-- ============================================================
-- SOUL-INVENTORY v2.0 FINAL — Migration 0003
-- Tinh hoa từ Odoo stock / ERPNext / InvenTree, chuẩn hóa Citadel:
-- mọi bảng có id, org_id (+index), timestamps; FORCE RLS ở 0004.
-- Khối: Multi-UoM · BOM/Assembly · Reorder rules · Landed cost ·
--        Scrap · Doc numbers · ABC/Cycle count
-- ============================================================

-- ── MULTI-UoM: đơn vị quy đổi (thùng 24 lon ↔ lon, bao 50kg ↔ kg) ──
-- Chuẩn ERPNext: mỗi item một bảng conversion, factor so với đơn vị GỐC (kho_items.unit)
CREATE TABLE IF NOT EXISTS kho_item_uoms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL,
  item_id     uuid NOT NULL REFERENCES kho_items(id),
  uom_name    text NOT NULL,                     -- 'thùng', 'bao', 'lốc'
  factor      numeric(18,6) NOT NULL,            -- 1 uom_name = factor × đơn vị gốc
  is_purchase boolean NOT NULL DEFAULT false,    -- đơn vị mua mặc định
  is_sales    boolean NOT NULL DEFAULT false,    -- đơn vị bán mặc định
  barcode     text,                              -- mã vạch riêng theo quy cách
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kho_item_uoms_factor_pos CHECK (factor > 0),
  CONSTRAINT kho_item_uoms_org_item_name_uq UNIQUE (org_id, item_id, uom_name)
);
CREATE INDEX IF NOT EXISTS kho_item_uoms_org_idx ON kho_item_uoms (org_id);
CREATE INDEX IF NOT EXISTS kho_item_uoms_org_barcode_idx ON kho_item_uoms (org_id, barcode);

-- Barcode chính trên item đã có cột barcode; thêm index tra nhanh
CREATE INDEX IF NOT EXISTS kho_items_org_barcode_idx ON kho_items (org_id, barcode);

-- ── BOM: định mức nguyên liệu (sản xuất/lắp ráp) ──
CREATE TABLE IF NOT EXISTS kho_boms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL,
  item_id     uuid NOT NULL REFERENCES kho_items(id),  -- thành phẩm
  name        text NOT NULL DEFAULT 'Định mức chuẩn',
  output_qty  numeric(18,3) NOT NULL DEFAULT 1,        -- 1 lần ra bao nhiêu thành phẩm
  is_active   boolean NOT NULL DEFAULT true,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kho_boms_output_pos CHECK (output_qty > 0)
);
CREATE INDEX IF NOT EXISTS kho_boms_org_idx ON kho_boms (org_id);
CREATE INDEX IF NOT EXISTS kho_boms_org_item_idx ON kho_boms (org_id, item_id);

CREATE TABLE IF NOT EXISTS kho_bom_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  bom_id        uuid NOT NULL REFERENCES kho_boms(id),
  component_id  uuid NOT NULL REFERENCES kho_items(id), -- nguyên liệu
  qty_per       numeric(18,6) NOT NULL,                 -- lượng NL cho 1 lần output_qty
  scrap_pct     numeric(5,2) NOT NULL DEFAULT 0,        -- % hao hụt định mức
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kho_bom_lines_qty_pos CHECK (qty_per > 0),
  CONSTRAINT kho_bom_lines_scrap_range CHECK (scrap_pct >= 0 AND scrap_pct < 100)
);
CREATE INDEX IF NOT EXISTS kho_bom_lines_org_idx ON kho_bom_lines (org_id);
CREATE INDEX IF NOT EXISTS kho_bom_lines_bom_idx ON kho_bom_lines (org_id, bom_id);

-- Lệnh lắp ráp / tháo dỡ (Stock Entry kiểu ERPNext: manufacture / disassemble)
CREATE TABLE IF NOT EXISTS kho_assembly_orders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL,
  doc_no       text NOT NULL,                           -- LSX-000001 / LTD-000001
  kind         text NOT NULL CHECK (kind IN ('assemble','disassemble')),
  bom_id       uuid REFERENCES kho_boms(id),
  item_id      uuid NOT NULL REFERENCES kho_items(id),  -- thành phẩm
  qty          numeric(18,3) NOT NULL,
  location_id  uuid NOT NULL REFERENCES kho_locations(id),
  status       text NOT NULL DEFAULT 'done' CHECK (status IN ('done','cancelled')),
  note         text,
  actor_user_id uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kho_assembly_qty_pos CHECK (qty > 0),
  CONSTRAINT kho_assembly_org_doc_uq UNIQUE (org_id, doc_no)
);
CREATE INDEX IF NOT EXISTS kho_assembly_org_idx ON kho_assembly_orders (org_id);

-- ── REORDER RULES: min-max per item (+ location tùy chọn), lead time ──
CREATE TABLE IF NOT EXISTS kho_reorder_rules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL,
  item_id        uuid NOT NULL REFERENCES kho_items(id),
  location_id    uuid REFERENCES kho_locations(id),     -- NULL = toàn org
  min_qty        numeric(18,3) NOT NULL,
  max_qty        numeric(18,3) NOT NULL,
  supplier_name  text,
  lead_time_days integer NOT NULL DEFAULT 0,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kho_reorder_minmax CHECK (max_qty >= min_qty AND min_qty >= 0)
);
CREATE INDEX IF NOT EXISTS kho_reorder_rules_org_idx ON kho_reorder_rules (org_id);
CREATE UNIQUE INDEX IF NOT EXISTS kho_reorder_org_item_loc_uq
  ON kho_reorder_rules (org_id, item_id, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ── LANDED COST: phân bổ chi phí (vận chuyển/thuế NK) vào giá vốn ──
CREATE TABLE IF NOT EXISTS kho_landed_costs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL,
  doc_no      text NOT NULL,                            -- LC-000001
  method      text NOT NULL DEFAULT 'by_value' CHECK (method IN ('by_value','by_qty')),
  total_cost  numeric(18,2) NOT NULL,
  note        text,
  actor_user_id uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kho_landed_total_pos CHECK (total_cost > 0),
  CONSTRAINT kho_landed_org_doc_uq UNIQUE (org_id, doc_no)
);
CREATE INDEX IF NOT EXISTS kho_landed_costs_org_idx ON kho_landed_costs (org_id);

CREATE TABLE IF NOT EXISTS kho_landed_cost_lines (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL,
  landed_cost_id uuid NOT NULL REFERENCES kho_landed_costs(id),
  movement_id    uuid NOT NULL REFERENCES kho_movements(id), -- dòng receive được phân bổ
  allocated      numeric(18,2) NOT NULL,                     -- chi phí phân bổ vào dòng này
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kho_landed_cost_lines_org_idx ON kho_landed_cost_lines (org_id);

-- ── SCRAP: hàng hỏng/hủy (Odoo scrap) — movement type mới 'scrap' ──
-- mở rộng CHECK của kho_movements để nhận 'scrap' + 'assembly_in/out'
ALTER TABLE kho_movements DROP CONSTRAINT IF EXISTS kho_movements_type_check;
ALTER TABLE kho_movements ADD CONSTRAINT kho_movements_type_check CHECK (type IN
  ('receive','issue','transfer_in','transfer_out','adjust','reserve_fulfill',
   'scrap','assembly_in','assembly_out'));

-- ── DOC NUMBERS: số chứng từ tuần tự theo org + loại (pattern Kế Toán 10A) ──
CREATE TABLE IF NOT EXISTS kho_doc_counters (
  org_id     uuid NOT NULL,
  doc_type   text NOT NULL,               -- 'PNK','PXK','KK','LSX','LTD','LC','SCR'
  last_no    bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, doc_type)
);

-- Gắn doc_no vào movements (phiếu nhập/xuất) + stocktakes
ALTER TABLE kho_movements ADD COLUMN IF NOT EXISTS doc_no text;
ALTER TABLE kho_stocktakes ADD COLUMN IF NOT EXISTS doc_no text;
CREATE INDEX IF NOT EXISTS kho_movements_org_doc_idx ON kho_movements (org_id, doc_no);

-- ── COST LAYERS (FIFO valuation, tùy chọn bên cạnh avg_cost) ──
CREATE TABLE IF NOT EXISTS kho_cost_layers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL,
  item_id     uuid NOT NULL REFERENCES kho_items(id),
  location_id uuid NOT NULL REFERENCES kho_locations(id),
  lot_id      uuid REFERENCES kho_lots(id),
  qty_remain  numeric(18,3) NOT NULL,
  unit_cost   numeric(18,2) NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  movement_id uuid REFERENCES kho_movements(id),
  CONSTRAINT kho_cost_layers_qty_nonneg CHECK (qty_remain >= 0)
);
CREATE INDEX IF NOT EXISTS kho_cost_layers_org_idx ON kho_cost_layers (org_id);
CREATE INDEX IF NOT EXISTS kho_cost_layers_fifo_idx
  ON kho_cost_layers (org_id, item_id, location_id, received_at);

-- ── ITEM: cột mới cho ABC + valuation method ──
ALTER TABLE kho_items ADD COLUMN IF NOT EXISTS abc_class text
  CHECK (abc_class IN ('A','B','C') OR abc_class IS NULL);
ALTER TABLE kho_items ADD COLUMN IF NOT EXISTS valuation_method text NOT NULL DEFAULT 'avg'
  CHECK (valuation_method IN ('avg','fifo'));
