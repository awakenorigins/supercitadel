-- V7A P2 — TRÁI TIM: hồn tách động cơ (G1) + mood/energy (G2)
-- 1) tt_memories: kho trí nhớ TRUNG LẬP của Tiểu Tâm — text thuần, không định dạng provider nào (hiến pháp #8)
-- 2) tt_soul_state: mood + energy + engine per (org, user) — đổi model = gạt công tắc, hồn giữ nguyên

CREATE TABLE IF NOT EXISTS tt_memories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id     uuid,
  kind        varchar(16) NOT NULL CHECK (kind IN ('fact','person','topic','summary','preference')),
  content     text NOT NULL,
  salience    real NOT NULL DEFAULT 0.5,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tt_memories_org_user_idx ON tt_memories(org_id, user_id);

CREATE TABLE IF NOT EXISTS tt_soul_state (
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  mood        varchar(24) NOT NULL DEFAULT 'vui',
  energy      real NOT NULL DEFAULT 100,
  engine      varchar(24) NOT NULL DEFAULT 'stub-a',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);
