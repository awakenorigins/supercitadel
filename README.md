# SUPERCITADEL — Tiểu Tâm-First Business OS

**SUPERCITADEL** (nền Citadel V7A — 9/9 nghiệm thu PASS) là hệ điều hành kinh doanh đa-tenant cho SME Việt (F&B/Retail), nơi AI "Tiểu Tâm" hiểu xuyên module và là giao diện chính. Production-ready.

> Rebrand R1: tên hiển thị/UI/docs là **SUPERCITADEL**; scope package nội bộ giữ `@citadel/*` để không phá imports.

## Deploy 1 lệnh (OpenClaw đọc DEPLOY.md)
```bash
git clone https://github.com/NachaFromMars/supercitadel && cd supercitadel && bash deploy.sh
```
Web `:3000` (/chat /crm) · API `:3001` (/health /ready) · WS `:3002`

## Tính năng
- **Auth V2.1**: token 13 ký tự (argon2id) → JWT, đa tenant, RBAC 3 vai trò
- **Tiểu Tâm**: trợ lý AI tiếng Việt, hiểu xuyên module, Generative UI, **chạy không cần key** (stub) — cắm key qua .env
- **Chat real-time**: nhóm/cá nhân, WebSocket, tenant-isolated
- **CRM**: contacts, deals, pipeline 5 stage, stats; Tiểu Tâm đọc được qua tool
- **Ví Om**: ledger economy (balance/nạp/chi/guard)
- **Notification · Dashboard · Search**
- **Cửa hàng Module THẬT**: mua bằng Om (trừ tiền ledger), bật/tắt, gate 403 khi chưa kích hoạt; nhóm Kinh doanh (CRM) · Vận hành (Kho) · Nhân sự (Ca)
- **Kế Toán (fork domain model ERPNext Accounts)**: sổ cái kép GL bất biến, chart TK chuẩn VN, hóa đơn bán/mua, thu chi knock-off công nợ, hủy = bút toán đảo, báo cáo lãi lỗ/cân đối thử/công nợ
- **Excel Connect Kế Toán (V7A P4)**: export 4 báo cáo .xlsx thật (sổ cái GL · hóa đơn · cân đối thử · lãi lỗ, header tiếng Việt, org isolation) + `/export/general-ledger.json` cho AI làm việc trên bảng tính + import hóa đơn từ Excel (validate tại cửa từng dòng, lỗi tiếng Việt kèm số dòng, GL vẫn cân sau import); web /accounting có nút Xuất Excel + Nhập hóa đơn từ Excel
- **Giáo Trình Module = Tiểu Tâm (V7A P4, quy chuẩn ⑧)**: mỗi module (7/7) có `docs/GUIDE.md` chuẩn (Giới thiệu · Chức năng · Hướng dẫn sử dụng · Ví dụ · Changelog) viết đúng theo code thật; Tiểu Tâm đọc giáo trình (cache, không đọc lại mỗi request) → trả lời câu hỏi "làm sao/hướng dẫn" TỪ DOCS THẬT, không bịa; gate `scripts/audit-module-docs.mts` (CI) đảm bảo mọi module đủ chuẩn
- **Nhân Sự v2 (fork domain model frappe/hrms)**: hồ sơ NV, chấm công vào/ra + đi trễ theo ca, nghỉ phép đủ vòng đời (loại phép, cấp phép, đơn + duyệt/từ chối, số dư, tự ghi bảng công)
- **TRÁI TIM — hồn tách động cơ (V7A P2)**: trí nhớ Tiểu Tâm trung lập text thuần (tt_memories: fact/person/topic/summary/preference), Context Assembler một cổng (buildWorkProfile), persona = data; đổi model = gạt công tắc (PATCH /tieu-tam/engine, adapters stub-a/stub-b/openai/anthropic — key từ env); học chảy ngược về hồn sau mỗi hội thoại; **test swap PASS: đổi động cơ, fact + nhân cách nhất quán tuyệt đối**
- **Mood/Energy (V7A P2)**: năng lượng 0-100 hao theo lượt (nhẹ -2/nặng -5), hồi +1/phút lazy + cho ăn (feedEnergy) + nạp gói (rechargeFull); 4 trạng thái Tràn đầy/Ổn định/Mệt/Kiệt sức (kiệt sức từ chối việc nặng dễ thương, vẫn chat nhẹ); GET /tieu-tam/state + SSE energy tick + energy bar/mood trong sheet; `BETA_MODE=true` (mặc định) không bao giờ cạn
- **VÒNG KINH TẾ KHÉP KÍN (V7A P3)**: Ví Om → Cửa hàng vật phẩm (GET /store/items + POST /store/items/:code/buy — trừ Om thật trong transaction, chặn thiếu tiền) → Kho chứa (/inventory-items — info đầy đủ, tenant-isolated) → Sử dụng → hiệu ứng THẬT: đồ ăn hồi energy Tiểu Tâm (trả trước/sau), Pin Sạc Đầy hồi 100%, theme decor đổi màu giao diện ngay (jade/gold/sage); trang web /items + section Vật phẩm trong Cửa hàng; audit store.item_purchase + item.use
- **NHÀ CỦA TIỂU TÂM (V7A P5 — G9)**: trang riêng `/tieu-tam` — avatar cáo SVG sống theo mood (tràn đầy nhún nhảy · ổn định thở · mệt chậm · kiệt sức ngủ gật z z z), energy bar lớn animate theo trạng thái, cho ăn tại chỗ từ kho vật phẩm (energy tăng real-time), trí nhớ "Em nhớ gì về mình" (GET/DELETE /tieu-tam/memories — xóa là em quên hẳn, audit đầy đủ), engine switcher dropdown (đổi bộ não — trí nhớ nguyên vẹn), nút mở chat sheet; nav giữa botnav dẫn thẳng về nhà em
- **Audit log + Bảo mật lũy tiến lớp 2 (V7A P1)**: ghi vết mọi thao tác nhạy cảm (login, mua/bật/tắt module, chi Om, hóa đơn/phiếu thu chi, duyệt phép); GET /audit-logs cho owner+; gắn email/SĐT → lên lớp 2; hành động nhạy cảm (chi Om >1000, đổi role, hủy phiếu đã thu) đòi lớp 2
- **Module Kho Hàng**: tồn kho ± , cảnh báo sắp hết · **Module Nhân Sự**: ca làm + xếp người
- **3 token seed**: SUPER_ADMIN (full quyền) · OWNER · MANAGER + ví **99.999 Om**
- **Rate-limiting**: chống brute-force token (login 5/phút/IP)
- **UI SUPERCITADEL Design System V2 (R1)**: desktop sidebar collapsible + topbar (breadcrumb/search/bell/energy pill Tiểu Tâm) · mobile bottom nav + sheet SSE — off-black elevation layers, jade primary, KPI cards glow/sparkline kiểu tremor, motion tokens (fade-up/scale-in/shimmer), 3 theme jade/gold/sage đổi bằng vật phẩm decor
- **CORS** đã bật — browser gọi API trực tiếp

## Kiến trúc
pnpm monorepo · Hono (API) · ws (realtime) · Drizzle + Postgres/pgvector · Next.js 15 · TypeScript.
Module plug-in qua manifest + deps injection. Xem `docs/DEV_GUIDE.md`.

## Tài liệu
- `docs/API.md` — REST + WS reference
- `docs/USER_GUIDE.md` — hướng dẫn dùng
- `docs/DEV_GUIDE.md` — phát triển + thêm module
- `DEPLOY.md` — chỉ thị deploy cho OpenClaw

## Nghiệm thu V7A (P6 — 9 chuẩn §09 spec v5.1)
**9/9 PASS** — chạy tự động bằng `scripts/acceptance-v7a.mts`:
```bash
cd services/api && pnpm exec tsx ../../scripts/acceptance-v7a.mts
# chỉ secret-scan (CI gate): thêm --secret-only
```
| # | Chuẩn | Kết quả |
|---|---|---|
| 1 | Đổi model AI → trí nhớ/nhân cách nhất quán tuyệt đối | ✅ (test swap v7a-p2) |
| 2 | Cross-org mọi ngả → chặn + ghi vết | ✅ (v7a-p6: HTTP thật, JWT giả/?orgId đều chặn) |
| 3 | Vật phẩm xem info + Sử dụng → hiệu ứng thật | ✅ (v7a-p3: 29 ✓) |
| 4 | 100% nút và màn hình sống | ✅ (audit-buttons 0 nút chết) |
| 5 | Token → dùng trong 30 giây; nhạy cảm đòi lớp 2 | ✅ (v7a-p6: đo thời gian thật) |
| 6 | Beta mode bật/tắt: tắt → energy hao/hồi/nhắc đúng | ✅ (v7a-p2: test cả 2 mode) |
| 7 | M0 Kế Toán đủ + tài liệu + Excel | ✅ (v7a-p4 + audit-module-docs 7/7) |
| 8 | Tạm tắt module → không gãy, quyền thu hồi sạch | ✅ (v7a-p6: 403 MODULE_INACTIVE, bật lại data nguyên) |
| 9 | Rà mã nguồn → 0 bí mật trong code | ✅ (secret-scan 0 hit / 144 file) |

CI gate (`.github/workflows/ci.yml`): typecheck → test → audit-module-docs → audit-buttons → secret-scan → web build.

## Chất lượng (verify chạy thật)
- V7A: typecheck **13/13** · `pnpm test` **12/12 packages xanh** (v7a-p1 17 asserts · v7a-p2 16 · v7a-p3 29 · v7a-p4 35 · v7a-p5 17 · v7a-p6 36 · soul 47…) · next build 15/15 routes · audit-buttons 0 nút chết · audit-module-docs 7/7 · **acceptance 9/9 PASS**
- ~185 assertion pass · test 9/9 packages · typecheck 10/10: auth, tenant isolation, Tiểu Tâm, RBAC, WS real-time, chat, CRM, Om
- **Full typecheck 10/10 packages** · `pnpm -r test` xanh · Next build 4 routes
- CI: `.github/workflows/ci.yml` (install→typecheck→test→build)
- Audit endpoint live: **46/46 PASS** (module shop + gate + kho + nhân sự + users) (26 HTTP + WS real-time + security: 401/403/429)
- Multi-review: **96/100** (Security 96 · Architecture 92 · Reliability 95 · UI/UX 90) — sau audit + nâng cấp toàn bộ
- Tích hợp end-to-end: API→ws→client real-time đã chứng minh

## Cấu hình
Copy `.env.example` → `.env`. Tiểu Tâm: engine mặc định `stub-a` (không key); gạt sang `openai`/`anthropic` qua PATCH `/api/v1/tieu-tam/engine` + `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` trong env. `BETA_MODE=true` (mặc định): energy không bao giờ cạn.
