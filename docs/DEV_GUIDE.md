# SUPERCITADEL — Hướng Dẫn Phát Triển

## Stack
pnpm monorepo + turbo · Hono (API) · ws (realtime) · Drizzle + Postgres/pgvector · Next.js 15 (web) · TypeScript.

## Cấu trúc
```
packages/  core (types+env)  db (schema+migration)  tieu-tam (AI engine+tools)
services/  api (Hono gateway)  ws (WebSocket + /internal/publish)
modules/   chat  notification  crm  om   (mỗi module: manifest + schema + service + routes [+tools])
apps/web   Next.js
```

## Chạy local (không Docker)
```bash
corepack enable && pnpm install
# cần Postgres chạy + DATABASE_URL, JWT_SECRET
pnpm --filter @citadel/db migrate && pnpm --filter @citadel/db exec tsx src/seed.ts
pnpm --filter @citadel/api dev   # :3001
pnpm --filter @citadel/ws dev    # :3002
pnpm --filter @citadel/web dev   # :3000
```

## Thêm module mới (theo khuôn đã chứng minh)
1. `modules/<id>/` : manifest.json + server/{schema,service,routes}.ts + migrations/*.sql
2. routes export `build<Module>Routes({ db, requireAuth })` — deps injection, KHÔNG import api internals.
3. (tuỳ) `server/tools.ts` export tools → đăng ký vào `toolRegistry` trong api index để Tiểu Tâm dùng.
4. Mount vào `services/api/src/index.ts`. Mỗi sub-app cần `onError` riêng.

## Quy ước quan trọng
- pnpm ONLY (npm không hiểu `workspace:*`).
- Mọi bảng tenant-scoped có `org_id`; KHÔNG bao giờ tin org từ body — đọc từ JWT.
- Route '/' khớp '/prefix' (KHÔNG '/prefix/').
- LLM: `LLM_MODE=stub` (mặc định) ↔ `live` (cắm key) — cùng interface `LlmProvider`.

## Test
```bash
pnpm -r typecheck   # type toàn workspace
pnpm -r test        # unit/integration (PGlite, real ws)
```
Verify pattern: PGlite (DB), Hono `app.request()` (HTTP), real WebSocket 2-socket.

## CI
`.github/workflows/ci.yml`: install → typecheck → test → web build.

## Behavior Rule: Sai → Báo → Chờ (V12 ⑩, 10/07/2026)
Tiểu Tâm in-app khi phát hiện dữ liệu/bút toán/chứng từ có dấu hiệu sai (lệch số, trùng, thiếu, định khoản bất thường, sổ không cân):
1. **THÔNG BÁO** ngay — nói rõ sai ở đâu, vì sao nghi sai, ảnh hưởng gì.
2. **ĐỀ XUẤT** cách xử lý.
3. **ĐỢI người dùng quyết định** — tuyệt đối KHÔNG tự đảo bút toán, tự sửa số, tự xóa dữ liệu kế toán khi chưa được xác nhận. Ngoại lệ duy nhất: thao tác người dùng vừa yêu cầu tường minh trong lượt chat.

Rule được inject trong `packages/tieu-tam/src/adapters.ts` → `renderSystemPrompt()` (áp dụng mọi engine: opus/sonnet/gpt-5.5). Liên quan: debt chain V12 ⑨ cũng theo tinh thần này — tiền trả dư ghi `unallocated`, không tự hạch toán phần thừa.
