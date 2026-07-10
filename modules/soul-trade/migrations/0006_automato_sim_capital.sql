-- SOUL-TRADE AUTOMATO — Vốn giả lập (paper capital) v1.3
-- Anh Nấng (09/07/2026): thêm option đặt VỐN GIẢ LẬP riêng cho Automato để dễ hình dung
-- kết quả P&L khi chạy mô phỏng (trước đây mượn bot.equity ?? 1000, không đặt riêng được).
ALTER TABLE st_automato_configs ADD COLUMN IF NOT EXISTS sim_capital numeric(16,2) NOT NULL DEFAULT 1000;
ALTER TABLE st_automato_configs DROP CONSTRAINT IF EXISTS st_automato_configs_sim_capital_check;
ALTER TABLE st_automato_configs ADD CONSTRAINT st_automato_configs_sim_capital_check CHECK (sim_capital >= 1);
