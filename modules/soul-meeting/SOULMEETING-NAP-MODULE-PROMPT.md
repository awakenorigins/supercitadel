# NẠP MODULE — SOUL-MEETING 1A (prompt cho AI agent tích hợp)

Mày là agent tích hợp module vào SuperCitadel ≥ v11.8. Làm ĐÚNG THỨ TỰ,
mỗi gate phải CHẠY THẬT và XANH mới sang bước sau. Không tick chay.

## 0. Tiền đề
- Node 22 + pnpm 9. Repo host tại `<REPO>`. Zip module đã có.
- Postgres 16 (prod) — CI dùng PGlite nên KHÔNG cần Postgres để chạy gate module.

## 1. Copy module
```bash
unzip soul-meeting-1a.zip -d <REPO>/modules/
ls <REPO>/modules/soul-meeting/manifest.json   # phải thấy
```

## 2. Gate #1 — module standalone (trước khi đụng host)
```bash
cd <REPO>/modules/soul-meeting && npm i
for t in core prep live harvest recording report bridge; do npm run test:$t || exit 1; done
npx tsc --noEmit -p tsconfig.json
```
KỲ VỌNG: 38/27/22/35/20/23/24 = **189 pass / 0 fail** + tsc im lặng.

## 3. Wiring host — 5 điểm (hoặc `git apply WIRING.patch`)
1. `packages/core/src/permissions.ts`: thêm block 14 dòng `p('sm.…')` (copy từ WIRING.patch, sau block Soul-Wallet) + thêm `'sm.*'` vào mảng role `manager`.
2. `services/api/package.json` → dependencies: `"@citadel/module-soul-meeting": "workspace:*"`.
3. `services/api/src/modules/loader.ts`: import `buildSoulMeetingRoutes` + entry builders:
   `'soul-meeting': (d) => buildSoulMeetingRoutes({ db: d.db, requireAuth: d.requireAuth, gate: d.requireModule(d.db, 'soul-meeting'), audit: d.audit } as any),`
4. `services/api/src/index.ts`: import `soulMeetingTools, startSoulMeetingNightlyAutomation`; sau dòng register wallet tools thêm
   `try { soulMeetingTools(getDb()).forEach((t: any) => toolRegistry.register(t as any)); } catch (e) { /* idempotent */ }`
   và sau `startSoulWalletNightlyAutomation(getDb());` thêm `startSoulMeetingNightlyAutomation(getDb());`
5. `services/api/src/tieu-tam/actions.ts`: import `soulMeetingTieuTamActions` + `defs.push(...(soulMeetingTieuTamActions() as unknown as TieuTamAction[]));`

```bash
cd <REPO> && pnpm install
ls services/api/node_modules/@citadel/ | grep module-soul-meeting   # PHẢI có symlink
```

## 4. Gate #2 — typecheck host 3 tầng
```bash
npx tsc --noEmit -p packages/core/tsconfig.json      # 0 lỗi
npx tsc --noEmit -p services/api/tsconfig.json       # xem LƯU Ý baseline
cp modules/soul-meeting/web/app/soul-meeting/page.tsx apps/web/app/soul-meeting/page.tsx
pnpm --filter @citadel/web exec tsc --noEmit          # 0 lỗi
```
**LƯU Ý baseline v11.8**: `services/api` có sẵn **4 lỗi** tại
`packages/tieu-tam/src/adapters.ts` (MessageContent) TRƯỚC khi cắm module.
Gate = *không có lỗi nào ngoài 4 dòng đó*. Nếu host đã fix → phải 0 lỗi tuyệt đối.

## 5. Migrate DB (prod/staging)
```bash
psql "$DATABASE_URL" -f modules/soul-meeting/migrations/0000_init.sql
psql "$DATABASE_URL" -f modules/soul-meeting/migrations/0001_rls.sql
```
Idempotent-check: chạy lại 0000 sẽ lỗi CREATE TABLE tồn tại — bình thường,
dùng migration runner của host nếu có.

## 6. Bật module + smoke tay
- Bật `soul-meeting` cho org test (bảng module-subscription của host).
- `GET /api/v1/soul-meeting/settings` (Bearer JWT) → 200 settings mặc định.
- `POST /api/v1/soul-meeting/types/seed` → 6 loại.
- Hỏi Tiểu Tâm: "tuần này họp gì" → phải gọi `sm.meetings_week`.
- (Tuỳ chọn ASR) chạy `scripts/asr-worker-reference/worker.py`, tiêm caps —
  xem README trong thư mục đó. **Worker là tham khảo, untested-by-CI.**

## 7. Troubleshooting
| Triệu chứng | Nguyên nhân → Fix |
|---|---|
| tsc: `Cannot find module '@citadel/module-soul-meeting/...'` | Quên điểm wiring 5.2 (package.json dep) hoặc chưa `pnpm install` → symlink chưa có |
| 4 lỗi `adapters.ts MessageContent` | Baseline host v11.8 có sẵn — không phải module (AUDIT_REPORT §3.1) |
| Route 404 dưới /api/v1/soul-meeting | loader.ts thiếu entry HOẶC module chưa bật cho org (gate requireModule) |
| Manifest validate fail | Kiểm `group`, `engine:"^1.0.0"`, perms dotted không dấu `_`/`:` — manifest kèm sẵn đã chuẩn v11 |
| `ASR_UNAVAILABLE` | Đúng thiết kế khi chưa tiêm caps.asr — không phải bug |
| Test PGlite lỗi import | Chạy test bằng `npx tsx` từ THƯ MỤC MODULE (`tsx -e` không resolve relative import) |
| Nhắc lịch bắn lặp | Kiểm reschedule có reset `reminded_1/2` không; nightly chỉ chạy 1 tiến trình |
| Excel tải về hỏng | Dùng GET `/actions/export.xlsx` (binary), đừng decode tay từ route JSON |

## 8. Definition of Done
- [ ] Gate #1: 189/189 + module tsc 0 lỗi (log dán vào báo cáo)
- [ ] 5 điểm wiring áp đủ, symlink `module-soul-meeting` tồn tại
- [ ] Gate #2: core 0 · api 0 lỗi MỚI · web 0
- [ ] 2 migration chạy trên DB đích
- [ ] Page hiện tại /soul-meeting, ModuleLocked khi org chưa bật
- [ ] Tiểu Tâm thấy 32 tool `sm.*`; action sensitive có preview trước confirm
- [ ] Nightly log `[soul-meeting] nightly: N org, 0 lỗi` sau khởi động
- [ ] Báo cáo tích hợp ghi rõ mọi lệch (nếu có) — không giấu
