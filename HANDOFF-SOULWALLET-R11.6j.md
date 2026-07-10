# HANDOFF — Soul-Wallet R11.6j + Lab volume-mount (box mới tiếp tục)

> Bàn giao cho box mới. Chỉ đụng **Lab** (supercitadellab-*), TUYỆT ĐỐI không đụng prod (supercitadel-*, 5 service Up nhiều giờ). Repo: `/root/.openclaw/workspace/supercitadellab`. Lab DB: `127.0.0.1:5452`, user `citadellab`, db `citadellab`, password = `.env` `DB_PASSWORD`. Web Lab `127.0.0.1:3010`, api Lab `127.0.0.1:3011`.

## Bối cảnh
- HEAD trước khi làm Soul-Wallet: `8bd3eef` (R11.6i = đã gắn xong module Soul-Sale).
- Đang gắn tiếp **module Soul-Wallet 1.0** (Ví Cá Nhân) tại `modules/soul-wallet/`.
- **NGUYÊN NHÂN chuyển box:** VPS quá tải do build Docker liên tục (api Lab bake code vào image → mỗi sửa phải `docker build` lại ~2-3 phút) → kênh trả output exec chập chờn, không đọc được kết quả để làm bước tiếp an toàn.

## VIỆC 1 (ưu tiên, làm TRƯỚC) — Chuyển Lab api sang VOLUME MOUNT (bind mount source)
Mục tiêu: api Lab đọc source thẳng từ đĩa host (không bake) → sửa code chỉ cần `docker restart supercitadellab-api-1` (2s), KHÔNG build lại → hết quá tải.

Cách làm an toàn:
1. Đọc `docker-compose.yml` (hoặc file compose Lab đang dùng — kiểm `docker inspect supercitadellab-api-1` xem com.docker.compose.project.config_files). Api hiện chạy `CMD [tsx src/index.ts]`, KHÔNG có mount source.
2. Thêm cho **service api (và web nếu muốn)** trong compose Lab:
   - `volumes:` bind mount repo root → thư mục app trong container (khớp WORKDIR trong Dockerfile api, thường `/app`). Ví dụ: `- ./:/app` + giữ `- /app/node_modules` (anonymous volume để không đè node_modules trong image).
   - Đảm bảo command vẫn là `tsx src/index.ts` (hoặc `tsx watch src/index.ts` để tự reload).
3. CHỈ sửa compose Lab, prod compose để nguyên. Merge cẩn thận, không clobber (inspect trước, giữ các field env/ports/depends_on cũ).
4. `docker compose -p supercitadellab up -d api` (không --build). Verify api healthy + loader log "Nạp N module · Từ chối 0".
5. Test: sửa 1 dòng log nhỏ trong source → `docker restart supercitadellab-api-1` → thấy đổi mà KHÔNG build → PASS.

## VIỆC 2 — Hoàn tất Soul-Wallet (Beat 4→8)
Sau khi có volume mount, mỗi sửa chỉ restart, rất nhanh.

**Trạng thái đã xong (an toàn trên đĩa):**
- ✅ Beat 1 — trinh sát: pnpm 9, host ở services/api.
- ✅ Beat 2 — module standalone: **134/134 test** (28+39+37+30) + typecheck 0 lỗi. (`cd modules/soul-wallet && pnpm test && npx tsc --noEmit`)
- ✅ Beat 3 — WIRING (patch gốc conflict do đã có soul-sale ở cùng 6 file → đã wire TAY):
  - `packages/core/src/permissions.ts`: chèn 18 permission `sw.*` (block "Soul-Wallet") sau block soulsale.* + thêm `'sw.*'` vào wildcard role manager. ĐÃ XONG.
  - `services/api/package.json`: thêm dep `"@citadel/module-soul-wallet": "workspace:*"`. ĐÃ XONG.
  - `services/api/src/modules/loader.ts`: import `buildSoulWalletRoutes` + builder `'soul-wallet': (d) => buildSoulWalletRoutes({ db, requireAuth, gate: d.requireModule(d.db,'soul-wallet'), audit })`. ĐÃ XONG.
  - `services/api/src/index.ts`: import + `soulWalletTools(getDb()).forEach(register)` + `startSoulWalletNightlyAutomation(getDb())`. ĐÃ XONG.
  - `services/api/src/tieu-tam/actions.ts`: import + `defs.push(...(soulWalletTieuTamActions() as unknown as TieuTamAction[]))`. ĐÃ XONG.
  - FE: `apps/web/app/soul-wallet/page.tsx` copy từ `modules/soul-wallet/web/app/soul-wallet/page.tsx`. ĐÃ XONG.

**CÒN LÀM:**
1. **Fix audit blocker (fail-closed owner id)** — audit tĩnh (`_incoming/AUDIT-soul-wallet.md`) nêu: `modules/soul-wallet/server/host-adapter.ts` dòng ~65 `const ownerId = auth.sub ?? ''` và dòng ~93; `modules/soul-wallet/server/tieu-tam-actions.ts` dòng ~41 `ownerId: ctx.userId ?? ''`. Ví CÁ NHÂN → thiếu owner id phải THROW (401/INVALID_CONTEXT), KHÔNG để chuỗi rỗng. Sửa: nếu `!auth.sub` (hoặc `!ctx.userId`) → throw lỗi, không tạo ctx với ownerId ''.
   - (RLS org-only không owner: tác giả khai intentional trong docs/SECURITY.md, app-level `own()` là guard chính — GIỮ NGUYÊN, giống soul-manager/ke-toan. KHÔNG cần thêm owner vào RLS trừ khi anh Nấng yêu cầu.)
2. **Beat 4** — `pnpm install` (link workspace) → `cd services/api && npx tsc --noEmit` → chỉ được còn 4 lỗi pre-existing `adapters.ts` (MessageContent, từ R11.6c, KHÔNG phải của mình); 0 lỗi khác. (Vừa vá import thiếu buildSoulWalletRoutes ở loader — verify còn đó.)
3. **Beat 5** — migrations 25 bảng `sw_*`. Có 2 cách:
   - Viết runner giống soul-sale: `modules/soul-wallet/scripts/run-migrations.mts` (postgres-js, tách statement, tracker `public._soulwallet_migrations`). Cần thêm devDep `postgres` vào module + `pnpm install --filter`.
   - Hoặc chạy trực tiếp: `docker exec supercitadellab-postgres-1 psql -U citadellab -d citadellab -f -` với 2 file `migrations/0000_init.sql` rồi `0001_rls.sql` (copy file vào container hoặc pipe). LƯU Ý runner tự-viết: bug đã gặp ở soul-sale — fallback split theo `;\n` làm SÓT dòng ENABLE đầu tiên nếu đứng sau comment; 0001 mỗi câu 1 dòng. Verify sau: `select count(*) from information_schema.tables where table_schema='public' and table_name like 'sw_%'` = 25 (LƯU Ý: soul-wallet schema có thể là `public` prefix sw_, KHÔNG phải schema riêng — kiểm 0000_init.sql: nó CREATE TABLE sw_* không CREATE SCHEMA). Verify RLS: 0 bảng sw_* hở.
4. **Beat 6** — rebuild (nếu chưa volume-mount thì `docker compose -p supercitadellab up -d --build api web`; nếu đã mount chỉ restart). Trước build nặng: `docker builder prune -f` cho nhẹ. Verify loader "Từ chối 0", `/api/v1/soul-wallet/health` 200. Web build: page `/soul-wallet` compile (soul-wallet page.tsx dùng Shell/ModuleLocked/EmptyState/api — kiểm prop khớp Lab như đã fix cho soul-sale: Shell KHÔNG nhận `active`, ModuleLocked dùng `id`/`name`).
5. **Kích hoạt org** — `docker exec supercitadellab-postgres-1 psql -U citadellab -d citadellab -c "insert into org_modules(org_id,module_id,status,purchased) values('a9f16130-0d72-47eb-878e-2c286b17423b','soul-wallet','active',true) on conflict (org_id,module_id) do update set status='active',purchased=true;"`
6. **Beat 7-8 nghiệm thu sống** (token manager LABMANAGER001, login qua `POST /api/v1/auth/login {"token":"..."}` → jwt ở field `"jwt"`; org = a9f16130...; user = d64991e9...):
   - `POST /api/v1/soul-wallet/categories/seed` → `{seeded:>0}`
   - `POST /api/v1/soul-wallet/accounts {"name":"Tiền mặt","type":"cash","opening_balance":"5000000"}` → id
   - `GET /api/v1/soul-wallet/accounts` → balance 5000000
   - Ghi chi 320000 → balance 4680000 → reverse → 5000000
   - Verify Tiểu Tâm: `/tools` + `/actions` count (đọc `docs/TIEU-TAM-ACTIONS.md` — 12 read + 12 write = 24 defs; permission 18).
   - Tiểu Tâm dry-run→confirm: gọi 1 sw.tx.* action không confirm → preview; confirm → thật.
   - ACCEPTANCE §B `docs/ACCEPTANCE.md` (9 mục, có mục user B cùng org không thấy ví user A = owner isolation).
7. **Commit R11.6j** — message liệt kê đủ 8 beat + volume-mount change + fix owner fail-closed. Verify prod supercitadel-* 5/5 nguyên vẹn TRƯỚC commit.
8. **Báo anh Nấng** qua Telegram nhóm hiện tại (topic 10474) kèm số liệu thật.

## Lưu ý vận hành
- Nếu exec vẫn rớt output: `docker builder prune -f` + đợi load < 5 (cat /proc/loadavg) rồi mới build. Build LẺ từng service, không build cả stack.
- Prod (supercitadel-*, KHÔNG có "lab"): TUYỆT ĐỐI không restart/build.
- Audit report đầy đủ: `_incoming/AUDIT-soul-wallet.md`. Prompt nạp gốc: `modules/soul-wallet/SOULWALLET-NAP-MODULE-PROMPT.md`. ACCEPTANCE: `modules/soul-wallet/docs/ACCEPTANCE.md`.
- Đếm kỳ vọng: 25 bảng sw_*, 18 permission, 24 tool/action defs (12+12).
