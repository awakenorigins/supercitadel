# Kế Toán 10A — Module Kế Toán Hoàn Chỉnh cho SuperCitadel

> Thế hệ thứ 10 của dòng module kế toán Nacha: sổ kép BigInt bất biến, chart
> **TT133/TT200/tùy biến JSON**, đủ 4 tầng nghiệp vụ (cốt lõi · tuân thủ VN ·
> vận hành · phân tích), **Tiểu Tâm điều khiển 100%** theo chuẩn v8.5
> (RBAC permission + dry-run→confirm), kèm **trang FE**, **PGlite test** và
> **store-flow test** — mua trên Cửa hàng, kích hoạt là chạy trơn tru ngay.

[![Tests](https://img.shields.io/badge/tests-208%2F208%20pass-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-strict%200%20lỗi-blue)]()
[![Host](https://img.shields.io/badge/SuperCitadel-v8.5%20RBAC%20%2B%20dry--run-orange)]()
[![Chuẩn](https://img.shields.io/badge/kế%20toán-TT133%20%7C%20TT200-orange)]()
[![Docs gate](https://img.shields.io/badge/audit--module--docs-PASS-brightgreen)]() [![Manifest gate](https://img.shields.io/badge/audit--manifests%20R10-OK-brightgreen)]()

---

## Vì sao 10A?

9A đã là backend kế toán mạnh nhất dòng (18 bảng · 40 action · 15 tool · 12 báo
cáo). **10A = 9A + toàn bộ lớp tích hợp host** để đúng nghĩa *plug-and-play trên
Cửa hàng Module*:

| Mảnh mới trong 10A | Ý nghĩa với khách |
|---|---|
| **Cầu Tiểu Tâm v8.5** — 17 action `k10a.*` mang `permission/securityLevel/sensitive` + JSON-schema | Ra lệnh tiếng Việt → thẻ **xem trước** (dry-run) → Xác nhận → ghi sổ thật; staff/manager phân quyền tự động; audit đủ 2 lớp |
| **Chart TT133 (34 TK) / TT200 (~52 TK) / JSON tùy biến** + `POST /setup` idempotent | SME hay DN lớn đều dùng được; FE tự seed lần đầu — mua xong mở trang là chạy |
| **Trang FE `web/page.tsx`** (5 tab: Sổ quỹ · Hóa đơn · Vận hành · Phân tích · Báo cáo) | Đúng design system repo (Shell, chip, dt, SVG chart); có nút Dữ liệu mẫu + anchors tour |
| **Lớp `server/`** + manifest chuẩn host + `docs/GUIDE.md` **PASS gate `audit-module-docs.mts` thật** | Copy vào `modules/ke-toan-10a/` là pnpm nhận; CI giáo trình xanh ngay |
| **PGlite smoke test** (Postgres-in-WASM) làm `pnpm test` mặc định | `pnpm -r test` của repo xanh mà không cần Postgres ngoài |
| **Store-flow test 18 ca** | Chứng minh chuẩn nghiệm thu #8: chưa mua 403 → mua chạy full → tắt 403 → bật lại data nguyên; Tiểu Tâm cũng bị gate y hệt |
| **Realtime hook (tùy chọn)** | Khấu hao/định kỳ/đối chiếu/chặn hạn mức bắn event `publish` — host nối ws là có thông báo |
| **Độc lập tuyệt đối** — schema Postgres `ketoan10a` | Không đụng `acc_*`/`k1a_`/`tt_acct_`/`a4_`/`accpro_`; chạy song song mọi module kế toán khác |

## Năng lực nghiệp vụ (kế thừa nguyên vẹn từ dòng 5A→9A)

- **Cốt lõi:** tiền `numeric(20,2)` BigInt · sổ bất biến (hủy = bút toán đảo) · Σ Nợ = Σ Có cưỡng bức 2 tầng · phiếu thu/chi · bút toán tay nhiều dòng · hóa đơn bán/mua nhiều dòng + thuế GTGT · công nợ knock-off chặn thu vượt · credit/debit note · đa tiền tệ.
- **Tuân thủ VN:** kết chuyển 911→421 + khóa niên độ · Lưu chuyển tiền tệ · Tờ khai GTGT + bảng kê · sổ TT133 (NKC, sổ quỹ) · sao kê công nợ · nhắc hạn thanh toán.
- **Vận hành:** tạm ứng/đặt cọc 3 loại + cấn trừ · giao dịch định kỳ tự sinh (bắt kịp kỳ bỏ lỡ) · nhập CSV danh mục · hạn mức tín dụng chặn hóa đơn vượt.
- **Phân tích:** đối chiếu ngân hàng (import sao kê → auto-match ±7 ngày → rule engine) · bộ phận/dự án (dimensions) + lãi lỗ theo chiều · TSCĐ + khấu hao đường thẳng (TK 214 contra) · đánh giá lại tỷ giá 515/635 · dự toán ngân sách vs thực tế.
- **Đầu ra:** 12 báo cáo · xuất Excel .xlsx · tự-audit toàn vẹn sổ · 56+ endpoint · 40 action HTTP (automation) · 15 tool đọc + 17 action Tiểu Tâm.

## Chạy thử 60 giây (standalone)

```bash
npm install
export KETOAN10A_DB_URL="postgres://user:pass@localhost:5432/ketoan10a"
npx tsx src/lib/migrate.ts     # tạo schema ketoan10a + 18 bảng
npm run test:full              # 195 test PG thật (unit/integration/http/tieu-tam/store-flow)
npm test                       # 13 test PGlite — KHÔNG cần Postgres
```

## Gắn vào SuperCitadel

Đọc **`docs/INTEGRATION.md`** — 7 mối nối v8.5 (catalog · mount+reverseGate+publish · permission registry · tieu-tam actions · deploy.sh · FE page · tour) kèm lệnh kiểm chứng. Giáo trình người dùng: **`docs/GUIDE.md`** (đã PASS gate CI repo).

## Cấu trúc gói

```
manifest.json          # chuẩn host: id ke-toan-10a · paid · 700 Om · 15 tools · docs
migrations/0000_init.sql  # SQL thuần idempotent — psql/PGlite chạy thẳng
server/                # lớp convention repo: routes/tools/service/schema/seed/tieu-tam-actions (+ PGlite test)
src/                   # engine đầy đủ (schema Drizzle · 13 services · actions · tools · bridge)
web/page.tsx           # trang FE — copy vào apps/web/app/ke-toan-10a/
tests/                 # run · integration · http · tieu-tam · store-flow (PG thật)
docs/                  # GUIDE (gate PASS) · INTEGRATION · API-SPEC · TIEU-TAM · AUDIT · …
dist/                  # build sẵn ESM + d.ts
```

## Bản quyền

Toàn bộ mã nguồn là công trình nguyên gốc, thuộc sở hữu độc quyền của **Nacha**.
Xem `LICENSE`. Không chứa code sao chép từ dự án ngoài; chỉ hấp thụ *ý tưởng*
đã ghi nhận trong tài liệu thiết kế.
