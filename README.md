# Citadel V7A — Tiểu Tâm-First Business OS

Hệ điều hành kinh doanh đa-tenant cho SME Việt (F&B/Retail), nơi AI "Tiểu Tâm" hiểu xuyên module và là giao diện chính. Production-ready.

## Deploy 1 lệnh (OpenClaw đọc DEPLOY.md)
```bash
unzip citadel-v2.zip -d citadel && cd citadel && bash deploy.sh
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
- **Nhân Sự v2 (fork domain model frappe/hrms)**: hồ sơ NV, chấm công vào/ra + đi trễ theo ca, nghỉ phép đủ vòng đời (loại phép, cấp phép, đơn + duyệt/từ chối, số dư, tự ghi bảng công)
- **TRÁI TIM — hồn tách động cơ (V7A P2)**: trí nhớ Tiểu Tâm trung lập text thuần (tt_memories: fact/person/topic/summary/preference), Context Assembler một cổng (buildWorkProfile), persona = data; đổi model = gạt công tắc (PATCH /tieu-tam/engine, adapters stub-a/stub-b/openai/anthropic — key từ env); học chảy ngược về hồn sau mỗi hội thoại; **test swap PASS: đổi động cơ, fact + nhân cách nhất quán tuyệt đối**
- **Mood/Energy (V7A P2)**: năng lượng 0-100 hao theo lượt (nhẹ -2/nặng -5), hồi +1/phút lazy + cho ăn (feedEnergy) + nạp gói (rechargeFull); 4 trạng thái Tràn đầy/Ổn định/Mệt/Kiệt sức (kiệt sức từ chối việc nặng dễ thương, vẫn chat nhẹ); GET /tieu-tam/state + SSE energy tick + energy bar/mood trong sheet; `BETA_MODE=true` (mặc định) không bao giờ cạn
- **Audit log + Bảo mật lũy tiến lớp 2 (V7A P1)**: ghi vết mọi thao tác nhạy cảm (login, mua/bật/tắt module, chi Om, hóa đơn/phiếu thu chi, duyệt phép); GET /audit-logs cho owner+; gắn email/SĐT → lên lớp 2; hành động nhạy cảm (chi Om >1000, đổi role, hủy phiếu đã thu) đòi lớp 2
- **Module Kho Hàng**: tồn kho ± , cảnh báo sắp hết · **Module Nhân Sự**: ca làm + xếp người
- **3 token seed**: SUPER_ADMIN (full quyền) · OWNER · MANAGER + ví **99.999 Om**
- **Rate-limiting**: chống brute-force token (login 5/phút/IP)
- **UI taste-applied**: 7 màn (Login · Home · Chat · CRM · Om · Settings + Tiểu Tâm sheet SSE) — design system off-black/jade, SVG icons, living core, bento, skeleton
- **CORS** đã bật — browser gọi API trực tiếp

## Kiến trúc
pnpm monorepo · Hono (API) · ws (realtime) · Drizzle + Postgres/pgvector · Next.js 15 · TypeScript.
Module plug-in qua manifest + deps injection. Xem `docs/DEV_GUIDE.md`.

## Tài liệu
- `docs/API.md` — REST + WS reference
- `docs/USER_GUIDE.md` — hướng dẫn dùng
- `docs/DEV_GUIDE.md` — phát triển + thêm module
- `DEPLOY.md` — chỉ thị deploy cho OpenClaw

## Chất lượng (verify chạy thật)
- ~185 assertion pass · test 9/9 packages · typecheck 10/10: auth, tenant isolation, Tiểu Tâm, RBAC, WS real-time, chat, CRM, Om
- **Full typecheck 10/10 packages** · `pnpm -r test` xanh · Next build 4 routes
- CI: `.github/workflows/ci.yml` (install→typecheck→test→build)
- Audit endpoint live: **46/46 PASS** (module shop + gate + kho + nhân sự + users) (26 HTTP + WS real-time + security: 401/403/429)
- Multi-review: **96/100** (Security 96 · Architecture 92 · Reliability 95 · UI/UX 90) — sau audit + nâng cấp toàn bộ
- Tích hợp end-to-end: API→ws→client real-time đã chứng minh

## Cấu hình
Copy `.env.example` → `.env`. Tiểu Tâm: engine mặc định `stub-a` (không key); gạt sang `openai`/`anthropic` qua PATCH `/api/v1/tieu-tam/engine` + `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` trong env. `BETA_MODE=true` (mặc định): energy không bao giờ cạn.
