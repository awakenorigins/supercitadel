-- ============================================================
-- SOUL-RESTAURANT v1.1 — Migration 0002: Khuyến mãi & Khách hàng thân thiết
-- 4 bảng mới: resto_customers, resto_promotions, resto_promo_redemptions,
--             resto_loyalty_ledger  (nâng 18 → 22 bảng)
-- ALTER: resto_settings (+3 cột loyalty), resto_orders (+4 cột customer/promo)
-- Idempotent: IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- ============================================================

-- ── Khách hàng thân thiết (khóa theo SĐT trong 1 org) ────────
CREATE TABLE IF NOT EXISTS resto_customers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL,
  phone          text,
  name           text NOT NULL,
  points_balance numeric(14,2) NOT NULL DEFAULT 0,
  total_spent    numeric(14,2) NOT NULL DEFAULT 0,
  visits         int NOT NULL DEFAULT 0,
  tier           text NOT NULL DEFAULT 'regular',
  note           text,
  first_visit_at timestamptz,
  last_visit_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resto_customers_org ON resto_customers(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_resto_customers_org_phone
  ON resto_customers(org_id, phone) WHERE phone IS NOT NULL;

-- ── Khuyến mãi: voucher (có mã) / happy_hour (khung giờ) / auto ─
CREATE TABLE IF NOT EXISTS resto_promotions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL,
  code               text,
  name               text NOT NULL,
  kind               text NOT NULL DEFAULT 'voucher' CHECK (kind IN ('voucher','happy_hour','auto')),
  discount_type      text NOT NULL CHECK (discount_type IN ('percent','amount')),
  value              numeric(14,2) NOT NULL,
  min_subtotal       numeric(14,2) NOT NULL DEFAULT 0,
  max_discount       numeric(14,2),                    -- trần cho percent (NULL = không trần)
  starts_at          timestamptz,
  ends_at            timestamptz,
  hh_start_min       int,                              -- happy hour: phút-trong-ngày [0..1439], giờ +07:00
  hh_end_min         int,
  days_mask          int NOT NULL DEFAULT 127,         -- bit theo thứ (CN=1<<0 … T7=1<<6); 127 = mọi ngày
  usage_limit        int,                              -- tổng lượt (NULL = không giới hạn)
  per_customer_limit int,                              -- lượt mỗi khách (NULL = không giới hạn)
  used_count         int NOT NULL DEFAULT 0,
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resto_promotions_org ON resto_promotions(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_resto_promotions_org_code
  ON resto_promotions(org_id, lower(code)) WHERE code IS NOT NULL;

-- ── Nhật ký áp mã (audit + đếm usage) ───────────────────────
CREATE TABLE IF NOT EXISTS resto_promo_redemptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  promo_id        uuid NOT NULL REFERENCES resto_promotions(id) ON DELETE CASCADE,
  order_id        uuid NOT NULL REFERENCES resto_orders(id) ON DELETE CASCADE,
  customer_id     uuid,
  code            text,
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resto_promo_redemptions_org ON resto_promo_redemptions(org_id);
CREATE INDEX IF NOT EXISTS idx_resto_promo_redemptions_promo ON resto_promo_redemptions(org_id, promo_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_resto_promo_redemptions_order
  ON resto_promo_redemptions(org_id, order_id);

-- ── Sổ điểm thưởng (earn/redeem/adjust, points có dấu) ───────
CREATE TABLE IF NOT EXISTS resto_loyalty_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  customer_id   uuid NOT NULL REFERENCES resto_customers(id) ON DELETE CASCADE,
  order_id      uuid,
  type          text NOT NULL CHECK (type IN ('earn','redeem','adjust')),
  points        numeric(14,2) NOT NULL,               -- earn:+ redeem:- adjust:±
  balance_after numeric(14,2) NOT NULL,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resto_loyalty_ledger_org ON resto_loyalty_ledger(org_id);
CREATE INDEX IF NOT EXISTS idx_resto_loyalty_ledger_cust ON resto_loyalty_ledger(org_id, customer_id);

-- ── ALTER cấu hình: bật loyalty + tỷ lệ tích/đổi ────────────
ALTER TABLE resto_settings ADD COLUMN IF NOT EXISTS loyalty_enabled    boolean NOT NULL DEFAULT false;
ALTER TABLE resto_settings ADD COLUMN IF NOT EXISTS loyalty_earn_pct   numeric(5,2) NOT NULL DEFAULT 0;   -- % chi tiêu → điểm (1 điểm = 1đ)
ALTER TABLE resto_settings ADD COLUMN IF NOT EXISTS loyalty_min_redeem numeric(14,2) NOT NULL DEFAULT 0;  -- điểm tối thiểu mỗi lần đổi

-- ── ALTER đơn: gắn khách + khuyến mãi ───────────────────────
ALTER TABLE resto_orders ADD COLUMN IF NOT EXISTS customer_id    uuid;
ALTER TABLE resto_orders ADD COLUMN IF NOT EXISTS promo_id       uuid;
ALTER TABLE resto_orders ADD COLUMN IF NOT EXISTS promo_code     text;
ALTER TABLE resto_orders ADD COLUMN IF NOT EXISTS promo_discount numeric(14,2) NOT NULL DEFAULT 0;
