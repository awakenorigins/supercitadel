-- V7A P3 — VÒNG KINH TẾ KHÉP KÍN (G3 + G4): item system + kho chứa + use effects
-- 1) item_catalog: danh mục vật phẩm TOÀN CỤC (không org_id — là catalog bán, không phải dữ liệu tenant)
-- 2) user_items: sở hữu vật phẩm per (org, user) — tenant isolation bắt buộc (hiến pháp #1)
-- 3) tt_soul_state.theme: vật phẩm decor đổi giao diện — hiệu ứng thật thấy được

CREATE TABLE IF NOT EXISTS item_catalog (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        varchar(40) NOT NULL UNIQUE,
  name        varchar(80) NOT NULL,
  description text NOT NULL,
  category    varchar(12) NOT NULL CHECK (category IN ('food','decor','boost')),
  price       integer NOT NULL CHECK (price >= 0),
  effect      jsonb NOT NULL,           -- {"type":"feed_energy","amount":20} | {"type":"recharge_full"} | {"type":"decor","theme":"gold"}
  icon        varchar(24),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  item_code   varchar(40) NOT NULL REFERENCES item_catalog(code),
  qty         integer NOT NULL DEFAULT 1 CHECK (qty > 0),
  acquired_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_items_org_user_idx ON user_items(org_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_items_owner_code_uq ON user_items(org_id, user_id, item_code);

ALTER TABLE tt_soul_state ADD COLUMN IF NOT EXISTS theme varchar(24) NOT NULL DEFAULT 'jade';

-- Seed catalog (idempotent)
INSERT INTO item_catalog (code, name, description, category, price, effect, icon) VALUES
  ('mochi',        'Bánh Mochi',     'Bánh mochi dẻo thơm — món khoái khẩu của Tiểu Tâm. Cho ăn hồi 20 năng lượng.', 'food',  30,  '{"type":"feed_energy","amount":20}', 'cake'),
  ('tra-o-long',   'Trà Ô Long',     'Trà ô long hảo hạng, thơm dịu. Tiểu Tâm nhâm nhi hồi 35 năng lượng.',          'food',  50,  '{"type":"feed_energy","amount":35}', 'leaf'),
  ('hat-de',       'Hạt Dẻ Nướng',   'Túi hạt dẻ nướng nóng hổi — ăn vặt nhẹ, hồi 10 năng lượng.',                    'food',  15,  '{"type":"feed_energy","amount":10}', 'gift'),
  ('pin-sac-day',  'Pin Sạc Đầy',    'Nạp năng lượng tức thì — Tiểu Tâm hồi đầy 100% ngay lập tức.',                  'boost', 120, '{"type":"recharge_full"}',           'battery'),
  ('theme-ho-phach','Theme Hổ Phách','Khoác áo hổ phách ấm áp cho toàn giao diện — sắc vàng sang trọng.',             'decor', 200, '{"type":"decor","theme":"gold"}',    'palette'),
  ('theme-sage',   'Theme Sage',     'Tông xanh sage dịu mắt — giao diện thư thái như vườn trà sớm mai.',             'decor', 200, '{"type":"decor","theme":"sage"}',    'palette')
ON CONFLICT (code) DO NOTHING;
