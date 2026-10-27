-- ============================================================
-- SOUL-MANAGER — Migration 0002_backfill_legacy (TÙY CHỌN)
-- Hút dữ liệu từ module HR CŨ của SuperCitadel (nếu tồn tại) sang
-- Soul-Manager. Idempotent: chạy lại không nhân đôi (đối chiếu legacy_id).
-- Chuẩn fail-closed: CHẠY BẰNG ROLE MIGRATION (bypass RLS có chủ đích,
-- một lần, có log NOTICE).
--
-- Hình dạng legacy giả định (module "hr" cũ):
--   departments(id uuid, org_id uuid, name text)
--   employees(id uuid, org_id uuid, full_name text, code text,
--             base_salary numeric, hire_date date, department_id uuid)
-- Nếu schema cũ khác, sửa mapping tại đây trước khi chạy — migration
-- sẽ báo lỗi tường minh thay vì im lặng sai.
-- ============================================================
DO $$
BEGIN
  -- ── Phòng ban cũ ──────────────────────────────────────────
  IF to_regclass('public.departments') IS NOT NULL THEN
    INSERT INTO sm_departments (org_id, code, name)
    SELECT d.org_id,
           'LEGACY-' || left(d.id::text, 8),
           d.name
    FROM departments d
    WHERE NOT EXISTS (
      SELECT 1 FROM sm_departments h
      WHERE h.org_id = d.org_id AND h.code = 'LEGACY-' || left(d.id::text, 8)
    );
    RAISE NOTICE 'Soul-Manager backfill: departments cũ đã hút.';
  ELSE
    RAISE NOTICE 'Soul-Manager backfill: không có bảng departments cũ — bỏ qua.';
  END IF;

  -- ── Nhân viên cũ ──────────────────────────────────────────
  IF to_regclass('public.employees') IS NULL THEN
    RAISE NOTICE 'Soul-Manager backfill: không có bảng employees cũ — bỏ qua.';
    RETURN;
  END IF;

  INSERT INTO sm_employees
    (org_id, code, full_name, base_salary, hire_date, status,
     contract_type, department_id, metadata)
  SELECT e.org_id,
         COALESCE(NULLIF(e.code, ''), 'LEGACY-' || left(e.id::text, 8)),
         e.full_name,
         COALESCE(e.base_salary, 0)::numeric,
         COALESCE(e.hire_date, CURRENT_DATE),
         'active',
         'indefinite',
         hd.id,
         jsonb_build_object('legacy_id', e.id, 'source', 'hr.employees')
  FROM employees e
  LEFT JOIN sm_departments hd
    ON hd.org_id = e.org_id
   AND hd.code = 'LEGACY-' || left(e.department_id::text, 8)
  WHERE NOT EXISTS (
    SELECT 1 FROM sm_employees h
    WHERE h.org_id = e.org_id
      AND (h.metadata->>'legacy_id')::uuid = e.id
  );

  RAISE NOTICE 'Soul-Manager backfill: employees cũ đã hút — hoàn tất.';
END $$;
