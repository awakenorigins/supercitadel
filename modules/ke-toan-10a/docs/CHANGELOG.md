# CHANGELOG — Kế Toán 10A

## 1.0.0 (10A) — Store-ready trên SuperCitadel v8.5
- **Cầu Tiểu Tâm v8.5**: `keToan10aTieuTamActions()` 17 action `k10a.*` đúng khuôn host (`permission`/`securityLevel`/`sensitive`/JSON-schema) — dry-run→confirm cho hành động nhạy cảm, RBAC theo registry, audit 2 lớp; `KE_TOAN_10A_PERMISSIONS` 16 quyền; `detectK10aAction` regex đòi "10a" (không giẫm module cũ).
- **Chart TT133/TT200/tùy biến**: `CHART_TT200` ~52 TK (superset mã dịch vụ), `seedChartOfAccounts(org, db, {standard|custom})`, `POST /setup` idempotent trả `{standard, created, total}` (hợp nhất route cũ).
- **Lớp host**: thư mục `server/` re-export theo convention repo + exports `./server/*.js`; `manifest.json` chuẩn (paid · 700 Om · 15 tools); `docs/GUIDE.md` **PASS `scripts/audit-module-docs.mts` thật**; `docs/INTEGRATION.md` 7 mối nối v8.5 + Tutorial tour.
- **FE `web/page.tsx`** 405 dòng: 5 tab, auto-setup lần đầu, SVG P&L, Excel blob download, đối chiếu NH dán CSV, TSCĐ/khấu hao, ngân sách/BVA, KPI + badge SỔ CÂN, nút Dữ liệu mẫu, data-tut anchors.
- **PGlite smoke 13 test** (`server/k10a.pglite.test.ts`) làm `npm test` mặc định — `pnpm -r test` repo xanh không cần Postgres ngoài.
- **Store-flow 18 test**: 403 MODULE_INACTIVE trước mua (kể cả export) → mua chạy full → tắt 403 → bật lại data nguyên (chuẩn #8) → Tiểu Tâm store-gated + dry-run.
- **Realtime hook tùy chọn** `deps.publish`: `k10a.depreciation.posted` · `k10a.recurring.generated` · `k10a.bank.rules_applied` · `k10a.credit_limit.blocked` (nuốt lỗi im lặng).
- Tổng kiểm: **208/208 test** (36 unit · 90 integration · 25 HTTP · 26 tiểu-tâm · 13 PGlite · 18 store-flow) · typecheck strict 0 lỗi (src+server) · build dist sạch.


## [1.0.0] — 2026-07-05

### Thế hệ 10A — Tầng phân tích nâng cao (kế thừa toàn bộ 8A + 7A + 6A + 5A)

**📊 Năng lực phân tích – kiểm soát mới (Tầng 2 theo advisory hấp thụ):**
- **Đối chiếu ngân hàng**: nhập sao kê CSV → tự khớp với sổ (cùng tiền + gần ngày) → áp quy tắc phân loại sinh chứng từ → báo cáo đối chiếu (số dư sổ vs sao kê, dòng chưa khớp).
- **Kế toán theo bộ phận/dự án (dimensions)**: gắn cost_center_id vào dòng bút toán, báo cáo lãi/lỗ theo từng bộ phận/dự án/chi nhánh.
- **Đánh giá lại tỷ giá**: revalue số dư gốc ngoại tệ cuối kỳ, ghi lãi/lỗ tỷ giá (Có 515 / Nợ 635) đúng chiều theo normalBalance.
- **TSCĐ + khấu hao đường thẳng**: quản lý tài sản, chạy khấu hao bắt kịp mọi kỳ (Nợ 642/Có 214), tự chốt FULLY_DEPRECIATED khi đủ.
- **Dự toán ngân sách**: đặt ngân sách năm theo TK, so sánh dự toán vs thực tế (từ sổ), cảnh báo vượt ngân sách; setBudget là upsert.

**Bổ sung TK hệ thống:** 214 (Hao mòn TSCĐ, contra-asset dư Có) → hệ thống **33 tài khoản**.

**AI mở rộng:** +8 actions (40 tổng) +4 tools (15 tổng) cho phân tích nâng cao.

**Schema:** +5 nhóm bảng (cost_centers, bank_transactions, bank_rules, fixed_assets, budgets), +1 cột journal_lines (cost_center_id).

**Kiểm thử:** 36 unit + 84 integration + 23 HTTP = **143 test, 100% pass**. Typecheck strict 0 lỗi. Bản build dist chạy đầy đủ tính năng Tầng 2. (Test đã bắt & sửa 1 bug thật: serialize mảng UUID trong truy vấn ngân sách → dùng inArray.)

**Kế thừa nguyên vẹn:** tầng vận hành 8A (tạm ứng, debit note, định kỳ, nhập CSV, hạn mức) + tuân thủ VN 7A (kết chuyển, LCTT, GTGT, sổ TT133, credit note, sao kê, nhắc hạn) + contract & gems 6A + nền BigInt 5A.

**License:** độc quyền, tác giả Nacha (NachaFromMars) — công trình nguyên gốc.

### Hoàn tất lộ trình advisory
Toàn bộ khuyến nghị Tầng 1 (vận hành) + Tầng 2 (phân tích) đã được hấp thụ. Các mảng ngoài phạm vi (kho/POS, bảng lương, HĐĐT) khuyến nghị tách module riêng.

---


## [1.0.0] — 2026-07-05

### Thế hệ 8A — Tầng chiều sâu vận hành (kế thừa toàn bộ 7A + VN)

**⚙️ Nghiệp vụ vận hành mới (Tầng 1 theo advisory hấp thụ):**
- **Tạm ứng / đặt cọc / trả trước** (3 loại): khách đặt cọc (Nợ tiền/Có 131), ứng trước NCC (Nợ 331/Có tiền), tạm ứng nhân viên (Nợ 141/Có tiền). Kèm cấn trừ (apply) vào hóa đơn.
- **Debit note** (điều chỉnh giảm mua): trả lại hàng đã mua / NCC giảm giá. Đối xứng credit note bên bán.
- **Giao dịch định kỳ**: mẫu tự sinh chứng từ (tiền thuê, lương, phí cố định) theo tần suất, bắt kịp kỳ bỏ lỡ.
- **Nhập CSV danh mục**: onboarding nhanh — nhập hệ thống TK + đối tác từ CSV, validate từng dòng.
- **Hạn mức tín dụng + điều khoản thanh toán**: chặn hóa đơn vượt hạn mức (override được), theo dõi công nợ vs hạn mức.

**AI mở rộng:** +6 actions (32 tổng) +3 tools (11 tổng) cho các nghiệp vụ vận hành.

**Schema:** +2 bảng (advances, recurring_templates), +2 cột contacts (credit_limit, payment_term_days).

**Kiểm thử:** 36 unit + 68 integration + 17 HTTP = **121 test, 100% pass**. Typecheck strict 0 lỗi. Bản build dist chạy với contract + tính năng 8A.

**Kế thừa nguyên vẹn từ 7A:** tầng tuân thủ VN (kết chuyển, LCTT, GTGT, sổ TT133, credit note, sao kê, nhắc hạn) + toàn bộ 6A (contract, gems) + nền 5A (BigInt, đa tiền tệ, immutable ledger).

**License:** độc quyền, tác giả Nacha (NachaFromMars) — công trình nguyên gốc.

### Định hướng bản sau (Tầng 2)
- Đối chiếu ngân hàng · kế toán theo bộ phận/dự án (dimensions) · đánh giá lại tỷ giá · TSCĐ + khấu hao · dự toán ngân sách.

---


## [1.0.0] — 2026-07-05

### Thế hệ 7A — Tầng tuân thủ kế toán Việt Nam (kế thừa toàn bộ 6A)

**🇻🇳 Tính năng tuân thủ VN mới (ưu tiên #1 theo advisory):**
- **Bút toán kết chuyển cuối kỳ** (911→421): kết chuyển doanh thu & chi phí, xác định lãi/lỗ, khóa niên độ. Hoàn thiện câu chuyện khóa kỳ của 6A.
- **Báo cáo lưu chuyển tiền tệ** (LCTT/B03, phương pháp trực tiếp): dòng tiền HĐKD/đầu tư/tài chính — đủ bộ 4 BCTC.
- **Tờ khai thuế GTGT** (01/GTGT) + bảng kê hóa đơn mua/bán: thuế đầu ra/vào, số phải nộp/khấu trừ.
- **Sổ sách TT133**: Sổ nhật ký chung (S03a), Sổ quỹ tiền mặt (S07).
- **Hóa đơn điều chỉnh giảm** (Credit Note): hàng bán trả lại/giảm giá, bút toán ngược.
- **Sao kê công nợ theo đối tác** (Statement of Account): phát sinh + số dư lũy kế.
- **Nhắc hạn công nợ** (Due Reminders): quá hạn / sắp tới hạn — Tiểu Tâm chủ động nhắc.

**AI mở rộng:** +6 actions (26 tổng) +3 tools (9 tổng) cho các tính năng VN.

**TK mới:** thêm 911 (Xác định kết quả kinh doanh) — 32 TK chuẩn TT133.

**Kiểm thử:** 36 unit + 49 integration + 13 HTTP = **98 test, 100% pass**. Typecheck strict 0 lỗi. Bản build dist chạy với contract + VN features.

**Kế thừa nguyên vẹn từ 6A:** contract SuperCitadel §4, tinh hoa 1A/3A/4A+/ACC4A (aging, integrity, outstanding, bills, Excel, multi-line, khóa kỳ, CHECK DB), nền 5A (BigInt, đa tiền tệ, immutable ledger).

### Định hướng bản sau (chưa làm)
- HĐĐT adapter (Viettel/VNPT/MISA — cần SDK trả phí, làm interface trước).
- Đối chiếu ngân hàng, giao dịch định kỳ, tạm ứng/trả trước.
- Kế toán theo bộ phận/dự án (dimensions), TSCĐ + khấu hao.

---


## [1.0.0] — 2026-07-04

### Nâng cấp lớn từ Kế Toán5A — chắt tinh hoa từ 4 module + đúng contract SuperCitadel

**TẦNG 0 — Contract alignment (cắm-là-chạy):**
- Chuyển sang `buildKeToan10aRoutes({db,requireAuth,gate,audit,reverseGate})` — host tiêm deps.
- Route prefix `/api/v1/ke-toan-10a`, permissions `ke-toan-10a:read/write/void`.
- `manifest`/`citadelModule` chuẩn (tier, priceOm, permissions, tools, routes).
- 6 AI tools (`ke_toan_10a.*`) đăng ký toolRegistry cho Tiểu Tâm đọc.
- Cổng `/actions` giữ nguyên 20 action ghi + JSON Schema cho LLM.
- `INTEGRATION.md` + `WIRING.patch` (5 mối nối, áp 1 phát).

**TẦNG 1 — Gem cao-rẻ:**
- **CHECK constraints tầng DB** (từ 1A): debit≥0, credit≥0, không đồng thời Nợ-Có.
- **Tự-audit toàn vẹn sổ** `/health/integrity` (từ 1A): Σ Nợ=Σ Có, mỗi bút toán cân, không mồ côi.
- **Báo cáo tuổi nợ (aging)** (từ 1A): buckets current/1-30/31-60/61-90/>90, theo đối tác.
- **Công nợ theo đối tác (outstanding)** (từ accpro): gộp mọi hoá đơn.
- **Hoàn thiện Hoá đơn mua (bills)**: 5A mới có schema → giờ có service đầy đủ + trả tiền.

**TẦNG 2 — Gem nghiệp vụ:**
- **Excel xuất/nhập .xlsx** (từ accpro): sổ cái, cân đối, KQKD, hoá đơn; nhập validate từng dòng.
- **Hoá đơn nhiều dòng** (từ acc4a): invoices + bills nhận lines[].
- **Năm tài chính + khóa kỳ** (từ ACC4A): assertPeriodOpen chặn hạch toán vào kỳ đã khóa.

**Giữ nguyên thế mạnh 5A:**
- Toán tiền BigInt (chính xác tuyệt đối), đa tiền tệ + tỷ giá.
- Thuế GTGT auto-tính (đầu ra 3331 + đầu vào 1331).
- 5 báo cáo gốc + dashboard. Immutable ledger reversal.

**Kiểm thử:** 36 unit + 31 integration + 13 HTTP = **80 test, 100% pass**. Typecheck strict 0 lỗi.

### Dự kiến bản sau
- Tài khoản đối ứng (214 hao mòn) + khấu hao TSCĐ.
- Bút toán kết chuyển & khóa sổ cuối kỳ tự động.
- Đối chiếu ngân hàng (import sao kê + tự khớp).
