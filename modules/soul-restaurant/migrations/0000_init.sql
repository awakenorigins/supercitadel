-- ============================================================
-- SOUL-RESTAURANT v1.0 — Migration 0000: schema 18 bảng resto_*
-- Mặt cắt ④: mọi bảng có id, org_id (kèm index), timestamps.
-- Idempotent: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
-- Kiểu tiền numeric(14,2) · lượng numeric(12,3) (học từ R9: qty KHÔNG integer).
-- Trạng thái = text + CHECK (không enum → migrate thêm trạng thái không đau).
-- ============================================================

-- ── Khu vực (tầng/phòng/sân) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS resto_areas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL,
  name        text NOT NULL,
  sort_order  int  NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resto_areas_org ON resto_areas(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_resto_areas_org_name ON resto_areas(org_id, lower(name));

-- ── Bàn ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resto_tables (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL,
  area_id          uuid REFERENCES resto_areas(id) ON DELETE SET NULL,
  name             text NOT NULL,
  capacity         int  NOT NULL DEFAULT 4,
  min_guests       int  NOT NULL DEFAULT 1,
  shape            text NOT NULL DEFAULT 'square',
  status           text NOT NULL DEFAULT 'available'
                   CHECK (status IN ('available','occupied','reserved','cleaning')),
  current_order_id uuid,
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resto_tables_org ON resto_tables(org_id);
CREATE INDEX IF NOT EXISTS idx_resto_tables_org_area ON resto_tables(org_id, area_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_resto_tables_org_name ON resto_tables(org_id, lower(name));

-- ── Trạm bếp/bar (định tuyến KOT) ────────────────────────────
CREATE TABLE IF NOT EXISTS resto_stations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL,
  name       text NOT NULL,
  kind       text NOT NULL DEFAULT 'kitchen'
             CHECK (kind IN ('kitchen','bar','dessert','other')),
  printer    jsonb NOT NULL DEFAULT '{}'::jsonb,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resto_stations_org ON resto_stations(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_resto_stations_org_name ON resto_stations(org_id, lower(name));

-- ── Danh mục món ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resto_menu_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL,
  name       text NOT NULL,
  parent_id  uuid REFERENCES resto_menu_categories(id) ON DELETE SET NULL,
  station_id uuid REFERENCES resto_stations(id) ON DELETE SET NULL,
  sort_order int  NOT NULL DEFAULT 0,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resto_menu_categories_org ON resto_menu_categories(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_resto_menu_categories_org_name ON resto_menu_categories(org_id, lower(name));

-- ── Món (single | combo) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS resto_menu_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL,
  category_id uuid REFERENCES resto_menu_categories(id) ON DELETE SET NULL,
  station_id  uuid REFERENCES resto_stations(id) ON DELETE SET NULL,
  sku         text,
  name        text NOT NULL,
  description text,
  kind        text NOT NULL DEFAULT 'single' CHECK (kind IN ('single','combo')),
  unit        text NOT NULL DEFAULT 'phần',
  price       numeric(14,2) NOT NULL DEFAULT 0,
  cost        numeric(14,2),
  tax_rate    numeric(5,2),
  image_url   text,
  sold_out    boolean NOT NULL DEFAULT false,
  active      boolean NOT NULL DEFAULT true,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resto_menu_items_org ON resto_menu_items(org_id);
CREATE INDEX IF NOT EXISTS idx_resto_menu_items_org_cat ON resto_menu_items(org_id, category_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_resto_menu_items_org_name ON resto_menu_items(org_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS uq_resto_menu_items_org_sku ON resto_menu_items(org_id, sku) WHERE sku IS NOT NULL;

-- ── Nhóm tùy chọn (size, topping, mức đá/đường…) ─────────────
CREATE TABLE IF NOT EXISTS resto_option_groups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL,
  name       text NOT NULL,
  min_select int  NOT NULL DEFAULT 0,
  max_select int  NOT NULL DEFAULT 1,
  required   boolean NOT NULL DEFAULT false,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resto_option_groups_org ON resto_option_groups(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_resto_option_groups_org_name ON resto_option_groups(org_id, lower(name));

-- ── Tùy chọn trong nhóm ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS resto_options (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL,
  group_id    uuid NOT NULL REFERENCES resto_option_groups(id) ON DELETE CASCADE,
  name        text NOT NULL,
  price_delta numeric(14,2) NOT NULL DEFAULT 0,
  sort_order  int NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resto_options_org ON resto_options(org_id);
CREATE INDEX IF NOT EXISTS idx_resto_options_org_group ON resto_options(org_id, group_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_resto_options_org_group_name ON resto_options(org_id, group_id, lower(name));

-- ── Gắn nhóm tùy chọn ↔ món ──────────────────────────────────
CREATE TABLE IF NOT EXISTS resto_item_option_groups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL,
  item_id    uuid NOT NULL REFERENCES resto_menu_items(id) ON DELETE CASCADE,
  group_id   uuid NOT NULL REFERENCES resto_option_groups(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resto_item_option_groups_org ON resto_item_option_groups(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_resto_item_option_groups ON resto_item_option_groups(org_id, item_id, group_id);

-- ── Thành phần combo (chỉ món kind='single') ─────────────────
CREATE TABLE IF NOT EXISTS resto_combo_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL,
  combo_id          uuid NOT NULL REFERENCES resto_menu_items(id) ON DELETE CASCADE,
  component_item_id uuid NOT NULL REFERENCES resto_menu_items(id) ON DELETE CASCADE,
  qty               numeric(12,3) NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resto_combo_items_org ON resto_combo_items(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_resto_combo_items ON resto_combo_items(org_id, combo_id, component_item_id);

-- ── Định lượng (recipe/BOM) — nối Kho qua SKU, KHÔNG FK cứng ─
-- Soft-coupling: kho_sku là text; module Kho nghe event
-- resto.stock.deduct_requested để trừ tồn. Không có Kho vẫn chạy.
CREATE TABLE IF NOT EXISTS resto_recipes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  menu_item_id  uuid NOT NULL REFERENCES resto_menu_items(id) ON DELETE CASCADE,
  kho_sku       text NOT NULL,
  kho_item_name text NOT NULL DEFAULT '',
  qty           numeric(14,3) NOT NULL,
  unit          text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resto_recipes_org ON resto_recipes(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_resto_recipes ON resto_recipes(org_id, menu_item_id, kho_sku);

-- ── Đơn (order) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resto_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  code            text NOT NULL,
  type            text NOT NULL DEFAULT 'dine_in'
                  CHECK (type IN ('dine_in','takeaway','delivery')),
  table_id        uuid REFERENCES resto_tables(id) ON DELETE SET NULL,
  guests          int  NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','paid','cancelled')),
  customer_name   text,
  customer_phone  text,
  note            text,
  discount_type   text CHECK (discount_type IN ('amount','percent')),
  discount_value  numeric(14,2),
  discount_reason text,
  subtotal        numeric(14,2) NOT NULL DEFAULT 0,
  discount_total  numeric(14,2) NOT NULL DEFAULT 0,
  service_charge  numeric(14,2) NOT NULL DEFAULT 0,
  tax_total       numeric(14,2) NOT NULL DEFAULT 0,
  grand_total     numeric(14,2) NOT NULL DEFAULT 0,
  opened_by       uuid,
  opened_at       timestamptz NOT NULL DEFAULT now(),
  closed_at       timestamptz,
  cancel_reason   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resto_orders_org ON resto_orders(org_id);
CREATE INDEX IF NOT EXISTS idx_resto_orders_org_status ON resto_orders(org_id, status);
CREATE INDEX IF NOT EXISTS idx_resto_orders_org_opened ON resto_orders(org_id, opened_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_resto_orders_org_code ON resto_orders(org_id, code);

-- ── Dòng món trong đơn (snapshot giá tại thời điểm gọi) ──────
CREATE TABLE IF NOT EXISTS resto_order_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  order_id      uuid NOT NULL REFERENCES resto_orders(id) ON DELETE CASCADE,
  menu_item_id  uuid REFERENCES resto_menu_items(id) ON DELETE SET NULL,
  station_id    uuid REFERENCES resto_stations(id) ON DELETE SET NULL,
  kot_id        uuid,
  name          text NOT NULL,
  unit_price    numeric(14,2) NOT NULL DEFAULT 0,
  qty           numeric(12,3) NOT NULL DEFAULT 1,
  options       jsonb NOT NULL DEFAULT '[]'::jsonb,
  options_total numeric(14,2) NOT NULL DEFAULT 0,
  line_total    numeric(14,2) NOT NULL DEFAULT 0,
  course_no     int NOT NULL DEFAULT 1,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','sent','preparing','ready','served','cancelled')),
  cancel_reason text,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resto_order_items_org ON resto_order_items(org_id);
CREATE INDEX IF NOT EXISTS idx_resto_order_items_org_order ON resto_order_items(org_id, order_id);
CREATE INDEX IF NOT EXISTS idx_resto_order_items_org_kot ON resto_order_items(org_id, kot_id);

-- ── KOT (Kitchen Order Ticket) ───────────────────────────────
CREATE TABLE IF NOT EXISTS resto_kots (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL,
  order_id   uuid NOT NULL REFERENCES resto_orders(id) ON DELETE CASCADE,
  station_id uuid REFERENCES resto_stations(id) ON DELETE SET NULL,
  code       text NOT NULL,
  status     text NOT NULL DEFAULT 'queued'
             CHECK (status IN ('queued','preparing','ready','completed','cancelled')),
  note       text,
  sent_at    timestamptz NOT NULL DEFAULT now(),
  done_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resto_kots_org ON resto_kots(org_id);
CREATE INDEX IF NOT EXISTS idx_resto_kots_org_station_status ON resto_kots(org_id, station_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_resto_kots_org_code ON resto_kots(org_id, code);

-- ── Hóa đơn (bill) — hỗ trợ tách bill theo món ───────────────
CREATE TABLE IF NOT EXISTS resto_bills (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL,
  order_id       uuid NOT NULL REFERENCES resto_orders(id) ON DELETE CASCADE,
  code           text NOT NULL,
  status         text NOT NULL DEFAULT 'unpaid'
                 CHECK (status IN ('unpaid','paid','void')),
  subtotal       numeric(14,2) NOT NULL DEFAULT 0,
  discount_total numeric(14,2) NOT NULL DEFAULT 0,
  service_charge numeric(14,2) NOT NULL DEFAULT 0,
  tax_total      numeric(14,2) NOT NULL DEFAULT 0,
  grand_total    numeric(14,2) NOT NULL DEFAULT 0,
  paid_total     numeric(14,2) NOT NULL DEFAULT 0,
  issued_by      uuid,
  issued_at      timestamptz NOT NULL DEFAULT now(),
  paid_at        timestamptz,
  void_reason    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resto_bills_org ON resto_bills(org_id);
CREATE INDEX IF NOT EXISTS idx_resto_bills_org_order ON resto_bills(org_id, order_id);
CREATE INDEX IF NOT EXISTS idx_resto_bills_org_paid_at ON resto_bills(org_id, paid_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_resto_bills_org_code ON resto_bills(org_id, code);

-- ── Dòng món thuộc bill nào (tách bill) ──────────────────────
CREATE TABLE IF NOT EXISTS resto_bill_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  bill_id       uuid NOT NULL REFERENCES resto_bills(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES resto_order_items(id) ON DELETE CASCADE,
  amount        numeric(14,2) NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resto_bill_items_org ON resto_bill_items(org_id);
CREATE INDEX IF NOT EXISTS idx_resto_bill_items_org_bill ON resto_bill_items(org_id, bill_id);
CREATE INDEX IF NOT EXISTS idx_resto_bill_items_org_oi ON resto_bill_items(org_id, order_item_id);

-- ── Thanh toán (số ghi = số ÁP VÀO bill; tiền thối trả về response) ──
CREATE TABLE IF NOT EXISTS resto_payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL,
  bill_id     uuid NOT NULL REFERENCES resto_bills(id) ON DELETE CASCADE,
  method      text NOT NULL
              CHECK (method IN ('cash','bank','card','momo','zalopay','vnpay','points','other')),
  amount      numeric(14,2) NOT NULL,
  ref         text,
  received_by uuid,
  paid_at     timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resto_payments_org ON resto_payments(org_id);
CREATE INDEX IF NOT EXISTS idx_resto_payments_org_bill ON resto_payments(org_id, bill_id);

-- ── Đặt bàn ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resto_reservations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  code          text NOT NULL,
  customer_name text NOT NULL,
  phone         text,
  party_size    int NOT NULL DEFAULT 2,
  table_id      uuid REFERENCES resto_tables(id) ON DELETE SET NULL,
  area_id       uuid REFERENCES resto_areas(id) ON DELETE SET NULL,
  reserved_at   timestamptz NOT NULL,
  duration_min  int NOT NULL DEFAULT 90,
  status        text NOT NULL DEFAULT 'confirmed'
                CHECK (status IN ('pending','confirmed','seated','cancelled','no_show')),
  order_id      uuid,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resto_reservations_org ON resto_reservations(org_id);
CREATE INDEX IF NOT EXISTS idx_resto_reservations_org_time ON resto_reservations(org_id, reserved_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_resto_reservations_org_code ON resto_reservations(org_id, code);

-- ── Cấu hình per-org (1 dòng/org, vẫn chịu RLS) ──────────────
CREATE TABLE IF NOT EXISTS resto_settings (
  org_id             uuid PRIMARY KEY,
  service_charge_pct numeric(5,2) NOT NULL DEFAULT 0,
  tax_pct            numeric(5,2) NOT NULL DEFAULT 8,
  price_includes_tax boolean NOT NULL DEFAULT true,
  currency           text NOT NULL DEFAULT 'VND',
  auto_deduct_stock  boolean NOT NULL DEFAULT true,
  deduct_on          text NOT NULL DEFAULT 'paid' CHECK (deduct_on IN ('paid','served')),
  table_auto_clean   boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
