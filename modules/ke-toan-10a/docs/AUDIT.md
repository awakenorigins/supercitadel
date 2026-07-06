# KẾ TOÁN 10A — BÁO CÁO AUDIT & BÀN GIAO

Module `ke-toan-10a` (`@citadel/module-ke-toan-10a`) — thế hệ 10, đóng gói
plug-and-play theo contract SuperCitadel §4 **+ chuẩn v8.5** (RBAC permission
registry + Tiểu Tâm dry-run). Mọi con số dưới đây là kết quả **chạy thật**
trong môi trường build, không phải mô tả lý thuyết.

## 1. KẾT QUẢ KIỂM ĐỊNH (208/208 xanh)

| Bộ test | Phạm vi | Kết quả |
|---|---|---|
| `tests/run.ts` (unit) | Money BigInt · posting rules · validate | **36 PASS** |
| `tests/integration.ts` | 18 bảng end-to-end: sổ kép, hóa đơn+thuế, knock-off, đảo, tạm ứng, định kỳ, hạn mức, đối chiếu NH, dimensions, TSCĐ+khấu hao, FX, ngân sách, kết chuyển, VN reports, **chart TT200 + tùy biến JSON + idempotent** | **90 PASS** |
| `tests/http.ts` | Toàn tuyến Hono qua contract host (gate/audit/reverseGate), **POST /setup 2 chuẩn** | **25 PASS** |
| `tests/tieu-tam.ts` | Mô phỏng `executeAction` v8.5: RBAC wildcard, chặn lớp bảo mật, **dry-run KHÔNG ghi DB → confirm ghi thật**, audit 2 lớp, 17 action đủ trường, regex không giẫm module cũ | **26 PASS** |
| `server/k10a.pglite.test.ts` | Postgres-in-WASM (harness repo) — seed 2 chuẩn, nghiệp vụ lõi, khấu hao, BVA, integrity, cách ly tenant | **13 PASS** |
| `tests/store-flow.ts` | Vòng đời Cửa hàng: chưa mua 403 MODULE_INACTIVE (kể cả export) → mua+setup chạy full → tắt 403 → **bật lại data nguyên vẹn** (chuẩn nghiệm thu #8) → Tiểu Tâm store-gated + hook realtime bắn đúng | **18 PASS** |

Kèm theo: `tsc --noEmit` strict (src + server) **0 lỗi** · build `dist/` 52 file JS + d.ts · dist smoke (routes/tools/bridge/PERMS 16/ACTIONS 40 import chạy).

## 2. GATE CI CỦA REPO — CHẠY THẬT, PASS

`scripts/audit-module-docs.mts` (bản gốc v8.5, không sửa) chạy trên gói:

```
✓ ke-toan-10a: giáo trình đầy đủ (docs/GUIDE.md)
[audit-module-docs] 1/1 module PASS
```

(H1 · đủ 5 mục Giới thiệu/Chức năng/Hướng dẫn sử dụng/Ví dụ/Changelog · bảng
Chức năng có cột Endpoint · 5 ví dụ hỏi Tiểu Tâm đúng định dạng.)


## 2b. TƯƠNG THÍCH R9/R10 (strict loader + manifest v2) — AUDIT LẠI, PASS

Repo HEAD (v9.0.0 + v10.0.0) đổi contract: loader strict đọc manifest v2, catalog/mount tự động, gate `audit-manifests.mts`. 10A đã audit lại và chỉnh:

| Điểm R9/R10 | Trạng thái 10A |
|---|---|
| Manifest v2: permissions dạng `module.resource.action`, phải TỒN TẠI trong `PERMISSION_REGISTRY` | ✅ 16 quyền dotted; `credit.limit_set` → **`credit.limit-set`** (regex cấm gạch dưới) — sửa đồng bộ bridge + registry snippet |
| Trường `tools` không thuộc schema v2 (warning) · thiếu `engine` | ✅ Bỏ `tools` khỏi manifest (danh mục nằm trong GUIDE/TIEU-TAM) · thêm `engine: "^1.0.0"` |
| Gate `scripts/audit-manifests.mts` (script gốc + validator gốc + registry đã append 16 quyền như mối nối 1) | ✅ **`[manifest] OK ke-toan-10a v1.0.0 · PASSED 1/1`** — chạy thật |
| Catalog hardcode bị bỏ; mount qua map `builders` trong `loader.ts` | ✅ INTEGRATION viết lại: 1 import + 1 entry builder (`reverseGate: d.cancelGate`); catalog/loader-status tự động |
| **v10.0.1** — trường `group` mới (chuỗi ≤40) quyết định nhóm Cửa hàng | ✅ Thêm `"group": "Tài chính"`; gate v10.0.1 chạy lại: `[manifest] OK ke-toan-10a v1.0.0` |
| Outbox R10 (`events` optional trong manifest) | ✅ v1.0.0 không khai events (hợp lệ); realtime qua `deps.publish`; lộ trình `emitEvent` in-tx ghi rõ cho 10A.1 |
| `tieu-tam/actions.ts`, `deploy.sh`, `audit-module-docs.mts`, khuôn TieuTamAction | ✅ Không đổi ở R9/R10 — cầu v8.5 của 10A dùng nguyên |

## 3. CHECKLIST CONTRACT §4 + v8.5

- [x] `manifest.json` — id/name/version/tier **paid**/priceOm **700**/icon/description/permissions/**tools 15 tên khớp code thật**/routes/docs
- [x] Migration SQL thuần idempotent, **schema `ketoan10a` riêng**, mọi bảng `org_id NOT NULL` + index; psql & PGlite chạy thẳng
- [x] Service thuần `(ctx, params)` không biết Hono; lỗi `KetoanError` → `AppError`
- [x] `buildKeToan10aRoutes({db, requireAuth, gate, audit, reverseGate, publish?})` — mọi query lọc org; 56+ endpoint
- [x] `server/` re-export + exports `./server/*.js` đúng convention repo; deps trùng version workspace (drizzle ^0.36 · hono ^4.6 · postgres ^3.4 · xlsx 0.18.5 · pglite ^0.2)
- [x] **v8.5**: 17 `TieuTamAction` đủ `permission/securityLevel/sensitive`; 16 entry `KE_TOAN_10A_PERMISSIONS` sẵn để append registry; dry-run→confirm đã test
- [x] FE `web/page.tsx` bám 1:1 trang accounting repo (field đã đối chiếu API thật); *chưa typecheck trong workspace Next — chạy `pnpm --filter web typecheck` sau khi copy (khai báo trung thực)*
- [x] `docs/GUIDE.md` PASS gate · `docs/INTEGRATION.md` 7 mối nối + tour + lệnh verify
- [x] Chuẩn #8: test tự động chứng minh tắt/bật không mất dữ liệu

## 4. KHÔNG ĐÈ MODULE NÀO (kể cả kế toán cũ)

| Chiều | Kế Toán cũ | 10A |
|---|---|---|
| id catalog | `accounting` | `ke-toan-10a` |
| Bảng | `acc_*` (public) | schema **`ketoan10a`** |
| API | `/api/v1/accounting` | `/api/v1/ke-toan-10a` |
| FE | `/accounting` | `/ke-toan-10a` |
| Tools/Actions | `accounting.*` / `acc.*` | `ke_toan_10a.*` / `k10a.*` |

Regex lệnh nhanh của 10A **bắt buộc chữ "10a"** trong câu — module cũ giữ nguyên hành vi.

## 5. AN TOÀN & SẠCH IP
- 0 secret trong source (quét sk-/ghp_/AKIA/PRIVATE KEY/password=)
- 0 tham chiếu repo ngoài trong code; LICENSE độc quyền Nacha (9 lần ghi nhận)
- Tenant isolation kiểm bằng test 2 org ở cả PG thật lẫn PGlite

## 6. GIỚI HẠN TRUNG THỰC
- FE cần typecheck trong workspace Next sau khi copy (gói không chứa Next).
- E-invoice VN (Viettel/VNPT SDK), lương, kho vật lý: ngoài phạm vi — để module riêng.
- `web/page.tsx` dùng `window.prompt` cho thu tiền nhanh (đúng pattern trang accounting hiện tại của repo) — có thể nâng thành sheet form khi redesign R2 chạm tới.
