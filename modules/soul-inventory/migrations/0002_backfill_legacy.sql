-- ============================================================
-- SOUL-INVENTORY — Migration 0002_backfill_legacy (TÙY CHỌN)
-- Hút dữ liệu từ bảng inventory_items CŨ của SuperCitadel (nếu tồn tại)
-- sang Soul-Inventory. Idempotent: chạy lại không nhân đôi.
-- Chiến lược port từ R9 nhưng viết lại theo chuẩn fail-closed:
--   - CHẠY BẰNG ROLE MIGRATION (bypass RLS có chủ đích, một lần, có log)
--   - Mỗi org cũ: seed KHO-CHINH nếu chưa có
--   - inventory_items.qty > 0 → kho_items + kho_stock_levels + movement 'initial_backfill'
-- ============================================================
DO $$
BEGIN
  IF to_regclass('public.inventory_items') IS NULL THEN
    RAISE NOTICE 'Soul-Inventory backfill: không có bảng inventory_items cũ — bỏ qua.';
    RETURN;
  END IF;

  -- 1) Kho mặc định cho mọi org có hàng cũ
  INSERT INTO kho_locations (org_id, code, name, is_default)
  SELECT DISTINCT i.org_id, 'KHO-CHINH', 'Kho chính', true
  FROM inventory_items i
  WHERE NOT EXISTS (
    SELECT 1 FROM kho_locations l WHERE l.org_id = i.org_id AND l.code = 'KHO-CHINH'
  );

  -- 2) Item cũ → kho_items (SKU = LEGACY-<id ngắn> nếu thiếu sku)
  INSERT INTO kho_items (org_id, sku, name, unit, min_stock, metadata)
  SELECT i.org_id,
         COALESCE(NULLIF(i.sku, ''), 'LEGACY-' || left(i.id::text, 8)),
         i.name,
         COALESCE(NULLIF(i.unit, ''), 'cái'),
         COALESCE(i.low_threshold, 0)::numeric,
         jsonb_build_object('legacy_id', i.id, 'source', 'inventory_items')
  FROM inventory_items i
  WHERE NOT EXISTS (
    SELECT 1 FROM kho_items k
    WHERE k.org_id = i.org_id
      AND (k.metadata->>'legacy_id')::uuid = i.id
  );

  -- 3) Tồn cũ > 0 → stock level + ledger backfill (đúng một lần)
  INSERT INTO kho_stock_levels (org_id, item_id, location_id, stocked)
  SELECT k.org_id, k.id, l.id, GREATEST(i.qty, 0)::numeric
  FROM inventory_items i
  JOIN kho_items k ON k.org_id = i.org_id AND (k.metadata->>'legacy_id')::uuid = i.id
  JOIN kho_locations l ON l.org_id = i.org_id AND l.code = 'KHO-CHINH'
  WHERE i.qty <> 0
    AND NOT EXISTS (
      SELECT 1 FROM kho_stock_levels s
      WHERE s.org_id = k.org_id AND s.item_id = k.id AND s.location_id = l.id AND s.lot_id IS NULL
    );

  INSERT INTO kho_movements (org_id, item_id, location_id, type, delta, ref_type, ref_id, note)
  SELECT k.org_id, k.id, l.id, 'adjust', GREATEST(i.qty, 0)::numeric,
         'migration', 'soul_inventory_backfill',
         'Backfill từ inventory_items.qty cũ sang Soul-Inventory'
  FROM inventory_items i
  JOIN kho_items k ON k.org_id = i.org_id AND (k.metadata->>'legacy_id')::uuid = i.id
  JOIN kho_locations l ON l.org_id = i.org_id AND l.code = 'KHO-CHINH'
  WHERE i.qty <> 0
    AND NOT EXISTS (
      SELECT 1 FROM kho_movements m
      WHERE m.org_id = k.org_id AND m.item_id = k.id
        AND m.ref_type = 'migration' AND m.ref_id = 'soul_inventory_backfill'
    );

  RAISE NOTICE 'Soul-Inventory backfill: hoàn tất.';
END $$;
