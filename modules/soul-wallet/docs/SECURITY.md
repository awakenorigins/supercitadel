# Soul-Wallet — Security Model

## Cách ly 2 chiều (điểm khác biệt so với module org-scope)
Dữ liệu scope theo **(org_id, owner_user_id)**. Hai hàng rào:
1. **App-level (hàng rào CHÍNH):** mọi query trong services đi qua helper `own(t, ctx)` = `org_id = ctx.orgId AND owner_user_id = ctx.ownerId`. `ctx` do adapter dựng TỪ JWT (`auth.orgId`, `auth.sub`) — client không có chỗ khai org/owner. Đã test: user cùng org không thấy/không ghi được ví của nhau (smoke-core #22-23), org khác mù hoàn toàn (#20-21).
2. **RLS (giáp lớp 2, fail-closed):** ENABLE + FORCE + policy `tenant_isolation` theo `current_setting('app.current_org_id')::uuid` trên cả 25 bảng. Thực tế host hiện chạy role BYPASSRLS và chưa set session var → lớp này ngủ; adapter của module vẫn `set_config` trong mọi org-tx, nên nếu vận hành chuyển role thường là RLS sống ngay không đổi code. Test module chạy role `citadel_app` non-superuser → RLS được chứng minh THẬT trên PGlite.

## Quyền (18 entry PERMISSION_REGISTRY, dotted, group "Tài chính")
Write đụng tiền = lớp 2 + sensitive: account/tx/budget/debt/goal/recurring.write, import.run, export.sensitive → Tiểu Tâm bắt buộc dry-run→confirm; route qua RBAC host. `contact.write`, `rule.write` lớp 1. Role `manager` được cấp `sw.*`; `owner` sẵn `*`; `staff` KHÔNG có gì (ví cá nhân của ai người nấy dùng theo user, không theo chức danh).

## Bất biến chống gian lận sổ
- Số dư chỉ derive từ ledger; không endpoint nào set số dư trực tiếp.
- Không DELETE giao dịch/bút toán — chỉ đảo (`reversal_of`), gốc giữ `reversed`.
- `sw_audit_entries` ghi mọi mutation kể cả dry-run (`is_dryrun`), kể cả reconcile (before/after).
- doc_no tuần tự per (org, owner, năm) — upsert nguyên tử, không nhảy số do race.
- Tiền `numeric(18,0)` + BigInt thuần trong code — không float ở bất kỳ đâu.
- Import: preview bắt buộc trước commit; commit idempotent-chặn (`IMPORT_ALREADY_COMMITTED`); mọi tx import truy vết `import_row_id`.

## Bề mặt còn lại (nói thẳng)
- Attachment chỉ lưu metadata — an toàn nội dung file thuộc tầng storage của host.
- Export CSV/XLSX là dữ liệu nhạy cảm → gác bằng quyền riêng `sw.export.sensitive` (lớp 2) + audit mỗi lần xuất.
- Event payload mang org_id + owner_user_id nhưng KHÔNG mang số dư tổng — consumer muốn số phải có quyền gọi API.
