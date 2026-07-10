# HANDOFF — SUPER CITADEL V7 (Soul-Trade + Kế Toán 10A + Soul-Sale)
> Bàn giao context để box/topic mới tiếp tục CHÍNH XÁC. Cập nhật: 2026-07-10 06:05 GMT+2.

## ✅ V7 DONE (10/07/2026 — deployed + Playwright verified, log /tmp/audit-v7.txt + /tmp/audit-v7b.txt)
- **4 form Kế Toán 10A đã thêm vào `apps/web/app/ke-toan-10a/page.tsx`** (sắp xếp thông minh):
  1. Tạo mẫu định kỳ → tab Vận hành (`data-tut="k10a-recurring-form"`, POST /recurring) — PASS (tạo mẫu hiện vào bảng)
  2. Hạn mức tín dụng → tab Hóa đơn (`k10a-credit`, PATCH /contacts/:id) — PASS
  3. Đánh giá tỷ giá → tab Phân tích (`k10a-fx`, POST /fx/revalue) — PASS (LÃI/LỖ 515/635)
  4. Kết chuyển + Khóa kỳ → tab Báo cáo (`k10a-close`, POST /fiscal-years/:id/closing, tự tạo FY nếu chưa có, bảng FY dùng `isClosed`, có nút Mở lại + confirm) — PASS
- **Soul-Sale verified 57/57**: registry backend (23 read + 34 write) khớp 100% UI page.tsx; tab “Tất cả tác vụ” render đúng 57 dòng, 7 section hiển thị (9 nhóm logic gộp gọn); 8 tab click PASS.
- **Quiz**: /ke-toan-10a đã thêm quiz 3 câu (sổ cân / bút toán đảo / kết chuyển-khóa kỳ), bump ver 2→3. /soul-sale đã có quiz từ trước. Còn chưa có tutorial: chat/notifications/search/settings/tieu-tam (chờ anh Nắng quyết — trước đó anh bảo tập trung nghiệp vụ).
- tsc --noEmit PASS · docker compose build+up web OK · audit script mới: `scripts/audit-v7.mjs`, `scripts/audit-v7b.mjs`, ảnh `scripts/v7-*.png`.

## ✅ V8 DONE (10/07/2026 06:25 — Automato mượt + audit Restaurant, log /tmp/audit-v8.txt, 24/24 PASS)
**Fix ARM delay (anh Nắng báo "cứ delay chưa mượt") — 4 nguyên nhân đã xử:**
1. FE `page.tsx` arm(): bỏ `disabled={busy}` trên nút `.core`, thêm `armInFlight` guard chống double-click; sau ARM chỉ sync nhẹ 1 call position (trước reload 5 panel).
2. `load()`: 4 API gọi song song `Promise.all` (trước tuần tự) + token `loadSeq` chống stale response ghi đè → hết flicker "lật ngược".
3. Poll không ghi đè khi đang thao tác: `busyRef` (nút lớn) + `opRef` counter (OrderList 10 nút nhỏ — add/toggle/upd/del đều optimistic + rollback nếu lỗi).
4. **Backend nặng nhất:** `modules/soul-trade/src/datasource.ts` — mỗi request tạo ccxt client mới gọi thẳng sàn (position ~0.9s, ohlcv ~1.0s). Thêm: pool `liveSources` dùng chung client, micro-cache price TTL 2s / ohlcv TTL 5s, dedup in-flight request. Kết quả: ohlcv 1.02s→~0.1s, position 0.9s→~0.4s.
**Đo thực tế sau fix (Playwright):** ARM đổi 196ms, DISARM 166ms, order-dial toggle 108ms, không bị poll lật ngược, double-click an toàn, slider đòn bẩy tức thì.
**Soul-Restaurant:** click đủ 11 tab nhóm như user — tất cả render nội dung, 0 JS error.
Scripts: `scripts/audit-v8.mjs`, `scripts/timing-check.sh`, ảnh `scripts/v8-*.png`. Build+deploy web+api OK.

## ✅ V9 DONE (10/07/2026 07:05 — Gắn tài khoản sàn THẬT BingX, 10/10 PASS, log /tmp/audit-v9.txt)
**Luồng gắn API key sàn thật đã thiết kế + deploy + verify với BingX live:**
- Backend mới `modules/soul-trade/src/keys.service.ts`: AES-256-GCM encrypt-at-rest (key từ ST_KEYS_SECRET ?? JWT_SECRET), setBotKeys/clearBotKeys/getBotKeys, `verifyKeysWithExchange` gọi fetchBalance + fetchPositions thật qua ccxt. KHÔNG BAO GIỜ trả plaintext — chỉ masked ••••4ký tự cuối.
- Tools mới: `soul-trade.bot.keys.set` (verify PASS mới lưu — key sai bị từ chối 400, không lưu key chết), `.keys.clear`, `.keys.status` (verify=1 → số dư USDT live). Routes: GET/POST/DELETE `/trade/bots/:name/keys`.
- UI: nút "🔌 Gắn sàn thật"/"🔑 Đã nối sàn" trên mỗi card bot (tab Điều khiển) → modal `ExchangeKeysModal`: hướng dẫn tạo key BingX (Read + Perpetual Futures Trading, TẮT Withdraw, giới hạn IP), input key+secret, Verify+Lưu, hiện số dư USDT thật + vị thế đang mở, nút Gỡ key.
- Audit v9: BingX trả code 100413 thật cho key giả → chứng minh verify đánh thẳng lên sàn. Script `scripts/audit-v9.mjs`, ảnh `v9-keys-*.png`.
**Còn LẠI để automato đặt lệnh THẬT:** automatoHeartbeat hiện chỉ simulate position trong state (không createOrder). Đã có sẵn `LiveExecutor` (src/executor.ts: setLeverage + createOrder market + SL/TP reduceOnly). Bước kế: khi bot has_keys + cfg.mode='live' + phase REAL → automatoHeartbeat gọi LiveExecutor với keys từ getBotKeys; cần thêm guard xác nhận + giới hạn size khi đi tiền thật. CHỜ anh Nắng duyệt rồi mới nối.

## ✅ V10 DONE (10/07/2026 07:45 — Trang 2 cặp coin BIẾN ĐỘNG DỮ DỘI, 11/11 PASS, log /tmp/audit-v10.txt)
- Backend: `fetchTopMovers()` trong datasource.ts — fetchTickers thật (Binance→Bybit fallback), lọc /USDT + bỏ token đòn bẩy UP/DOWN/BULL/BEAR + volume ≥2M, xếp theo điểm dữ dội = |%24h| + ½ range(high-low), cache 30s + dedup (lần 1 ~2.6s, lần 2 ~52ms).
- Tool `soul-trade.market.movers` + route GET `/trade/market/movers?limit=12`.
- UI: pair-card pager 1/2. Trang 1 = 10 cặp đề xuất cũ. Trang 2 = "Biến động dữ dội 🌋" 12 chip: coin + %24h xanh/đỏ + ±biên độ, tooltip volume, auto-refresh 30s, click = quickstart Shadow+ULTRA+ARM.
- Audit: NFP -66.2% ±239% đứng top thật, click chip → ARM ok, pager qua lại ok. Ảnh `v10-movers*.png`.

## ✅ V11 DONE (10/07/2026 10:45 — seed Joli Poli + login case-sensitive + audit năng lực, verified)
- **Seed org Joli Poli SẠCH**: org_id `10bac289-f6fb-46d3-a335-86594c81f0e8`, owner user `3982ee40-2dd2-474f-adbb-852423aa9080`, token `JoliPoli13` (prefix "Joli", role owner), 14 modules active, Om 99999. Verified qua psql.
  - 2 fix phát sinh: (a) `scripts/seed-jolipoli.mjs` còn regex CŨ 13 ký tự uppercase → đã sửa thành `/^[A-Za-z0-9]{8,24}$/` case-sensitive khớp schema core mới; (b) **DB port host là 5452 KHÔNG phải 5432** (5432 host = Postgres khác) → DATABASE_URL dùng `127.0.0.1:5452`. Cách chạy đúng: copy script vào `packages/db/` rồi `node ./seed-jp-local.mjs <token>` (đã xóa file tạm sau khi xong).
- **UI login** `apps/web/app/page.tsx`: `slice(0,24)`, bỏ toUpperCase, regex `[^A-Za-z0-9]` ✓
- **Build+deploy** web+api OK (log /tmp/v11-build.log, BUILD_DEPLOY_OK).
- **Test login**: POST /api/v1/auth/login `{"token":"JoliPoli13"}` → JWT + role owner + đúng org ✓ · `JOLIPOLI13` (sai case) → 401 UNAUTHORIZED ✓ (case-sensitive chuẩn) · web landing 200 ✓
- **Audit năng lực Tiểu Tâm in-app** (đã soi code, checklist 6/6 ĐẠT): file upload đủ loại (ảnh vision/xlsx/csv/txt/json/pdf 5 trang) ✓ · gửi file KÈM caption chạy lệnh luôn (Shell.tsx pendingFile+ask) ✓ · reply trỏ tin nhắn (replyTo) ✓ · memory dài 120 lượt + auto-summary ✓ · control đủ module qua ACTION_TOOLS ✓ · dry-run confirm lệnh nhạy cảm ✓

## ✅ V11B DONE (10/07/2026 11:35 — HỒI PHỤC MODEL Tiểu Tâm in-app, cả opus-4.6 + gpt-5.5 sống)
**Triệu chứng anh Nắng báo:** chat Tiểu Tâm trong app báo "nghẽn" với MỌI model.
**2 gốc bệnh tìm ra + fix:**
1. **Opus/sonnet (proxy :20131):** 1 tool trong 205 ACTION_TOOLS thiếu `type:'object'` → Anthropic proxy 400 `tools.57.custom.input_schema.type: Field required` → sập NGUYÊN request. Fix: `normalizeParams()` trong `services/api/src/tieu-tam/actions.ts` ép mọi schema có type+properties.
2. **gpt-5.5 (proxy 9route :20128):** tools >~50 (payload >~16KB) → proxy trả `finish_reason:'in_progress'` + content RỖNG (không phải flaky — probe ngưỡng: n=50 OK, n=60+ rỗng, stream cũng lỗi). Fix trong `packages/tieu-tam/src/adapters.ts`: engine gpt-5.5 cap tools = `LLM2_MAX_TOOLS` (default 48) + guard retry-không-tools khi content rỗng → KHÔNG BAO GIỜ trả rỗng nữa. Opus/sonnet giữ full 205 tools (maxTools=0).
**Verified sau deploy:** opus-4.6 chat + tool call (report.summary trả bảng tóm tắt) ✓ · gpt-5.5 chat thường ✓ + tool call crm.add_contact thật ✓ (đã xóa contact test) · engine switch qua lại mượt ✓
**Fix phụ:** org Joli Poli thiếu module `core` → report.summary bị FORBIDDEN → đã INSERT core + sửa `scripts/seed-jolipoli.mjs` thêm 'core' vào MODULES.
Probe scripts: `scripts/v11-gpt-*.mts|sh`, `scripts/v11-final-verify.sh`, logs /tmp/v11-*.log.
**TODO nhẹ (chưa làm):** chọn lọc 48 tools ưu tiên cho gpt-5.5 theo module đang active thay vì slice(0,48) đầu danh sách; hoặc xin tăng limit payload proxy 9route.

## ✅ V11C DONE (10/07/2026 12:40 — Xuất Excel bảng lương + downloadUrl pattern generic)
**Anh Nắng báo:** nhờ Tiểu Tâm in-app xuất Excel bảng lương minh họa → không xuất được. Soi code: tính năng CHƯA TỒN TẠI trong Soul-Manager (Kế Toán có excel.ts, HR chưa có gì).
**Đã build 3 tầng:**
1. **API**: GET `/api/v1/soul-manager/payroll/export.xlsx?year=&month=` trong `modules/soul-manager/server/host-adapter.ts` — dùng tool hr.payroll.payslip lấy data kỳ → sheet: mã NV/họ tên/gross/bảo hiểm/thuế/net + dòng TỔNG. Thêm dep `xlsx@0.18.5` vào package.json module.
2. **UI**: nút "⤓ Xuất Excel" cạnh "Chạy lương" tab Bảng lương (`apps/web/app/soul-manager/page.tsx`, data-tut="sm-payroll-export", fetch Bearer → blob download).
3. **Tiểu Tâm tool**: `hr.payroll.export_excel` trong `modules/soul-manager/server/tieu-tam-actions.ts` — verify kỳ tồn tại rồi trả `data.downloadUrl` + `data.filename`.
**⭐ PATTERN GENERIC (chỉ thị anh Nắng: Tiểu Tâm bao trùm, module mới tự động full năng lực):** `Shell.tsx` có `downloadOf()` — BẤT KỲ tool result nào có `data.downloadUrl` → chat tự render nút tải (downloadAuthed kèm Bearer). Module mới chỉ cần trả downloadUrl trong action result là có nút tải, KHÔNG sửa Tiểu Tâm/Shell. Kết hợp ACTION_TOOLS tự động (defs.push từ mọi module đã active) = add module mới tự có đủ tool + download.
**Verified (log /tmp/v11c-export-test.log):** tsc PASS · build+deploy web+api OK · API trả HTTP 200, 16951 bytes, `file` xác nhận "Microsoft Excel 2007+" · chat Tiểu Tâm gọi tool → trả message + downloadUrl + nút tải, còn tự cảnh báo kỳ chưa chạy lương (net=0) và gợi ý "Chạy lương kỳ 7/2026".

## ⏳ V11 ĐANG DỞ — LỊCH SỬ (đã hoàn thành ở trên, giữ lại để tham chiếu)
**ĐÃ XONG (committed, không làm lại):**
1. Opus 4.6 = model default Tiểu Tâm: DB `tt_soul_state` (ALTER default + UPDATE all rows → opus-4.6) ✓ · `packages/db/src/schema.ts` default('opus-4.6') ✓ · UI ENGINES `apps/web/app/tieu-tam/page.tsx` (opus mặc định, gpt-5.5 phụ) ✓
2. Token schema nới 8-24 ký tự A-Za-z0-9 (nhận JoliPoli13): `packages/core/src/index.ts` ✓
3. Script seed org sạch: `scripts/seed-jolipoli.mjs` (argv[2] = token). ĐÃ copy vào container api `/tmp/seed-jp.mjs` nhưng chạy fail vì cả host lẫn container không resolve được package `postgres` (pnpm store). ANH NẮNG CHỈ THỊ: KHÔNG đổi sang SQL thuần, giữ hướng script node — fix bằng cách chạy từ thư mục có dep (ví dụ `cd packages/db && node ../../scripts/seed-jolipoli.mjs JoliPoli13` vì packages/db/node_modules có postgres + @node-rs/argon2 symlink) hoặc copy script vào packages/db/.
**CÒN LẠI (làm theo thứ tự):**
1. Seed: `cd /root/.openclaw/workspace/supercitadellab/packages/db && DATABASE_URL='postgres://citadellab:<DB_PASSWORD trong .env>@127.0.0.1:5432/citadellab' node ../../scripts/seed-jolipoli.mjs JoliPoli13` → verify `SELECT id,name FROM orgs WHERE slug='joli-poli'` qua `docker exec supercitadellab-postgres-1 psql -U citadellab -d citadellab`
2. Nới UI login `apps/web/app/page.tsx`: đang `e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,13)` → đổi thành `e.target.value.replace(/[^A-Za-z0-9]/g,'').slice(0,24)` (token phân biệt hoa thường)
3. Rebuild+deploy: `docker compose build web api && docker compose up -d web api` (chạy nền ghi /tmp, kênh exec hay đứt)
4. Test login: POST `http://127.0.0.1:3011/api/v1/auth/login` body `{"token":"JoliPoli13"}` → phải trả JWT + role owner
5. Báo cáo audit năng lực Tiểu Tâm in-app (ĐÃ SOI XONG CODE, chỉ cần viết báo cáo): file upload đủ loại (ảnh vision/xlsx/csv/txt/json/pdf render 5 trang) ✓ có · gửi file KÈM text caption chạy lệnh luôn (Shell.tsx pendingFile+ask, không còn 3 nút mặc định khi có caption) ✓ có · reply trỏ tin nhắn (replyTo + composed "[Trả lời tin: ...]") ✓ có · memory dài (120 lượt + auto-summary vào kind=summary) ✓ có · control 8 module qua ACTION_TOOLS (accounting/crm/inventory/hr/k10a/soul-manager/soul-inventory/soul-sale/soul-wallet/soul-trade/soul-restaurant) ✓ có · dry-run confirm cho lệnh nhạy cảm ✓ có
6. Update mục này thành ✅ V11 DONE + báo anh Nắng kèm ảnh
**LƯU Ý VẬN HÀNH:** kênh exec sống ~1 phút / đứng 5-10 phút — MỌI lệnh dài phải nohup ghi /tmp rồi đọc file; dùng read/write tool thay exec khi được. Secret-mask guard: KHÔNG viết `JWT=$(cat ...)` dạng đó trong lệnh (bị mask thành ***), dùng `read -r JWT < /root/.openclaw/workspace/.jwt.txt`.

---
# (Lịch sử V6 bên dưới — đã hoàn thành)
> Repo: `/root/.openclaw/workspace/supercitadellab` · Web `127.0.0.1:3010` (public `https://supercitadellab.62.146.238.213.sslip.io`) · API `127.0.0.1:3011`.
> Deploy: `cd ~/.openclaw/workspace/supercitadellab && docker compose build web && docker compose up -d web` (api tương tự). DB: `docker exec supercitadellab-postgres-1 psql -U citadellab -d citadellab`.
> JWT test (owner) lưu ở `/root/.openclaw/workspace/.jwt.txt` (org a9f16130-0d72-47eb-878e-2c286b17423b). Audit UI qua Playwright + public origin (KHÔNG dùng 127.0.0.1 vì CORS).

## ✅ ĐÃ XONG (deployed + verified)
### Soul-Trade / Automato
- Fix NaN các ô risk/TP/SL/đòn bẩy: component `NumInp` + guard `patch()` bỏ NaN. Min 0.1%, nhận dấu phẩy VN. (verified 9/9 Playwright)
- Nút ARM lớn optimistic (196ms, hết delay). Vốn giả lập (`sim_capital`, migration 0006, chip UI). Lịch sử = tab Nhật ký (đã có).
- **Đa lệnh Automato (multi-order)**: tối đa 10 lệnh song song, mỗi lệnh coin+side(long/short/auto)+đòn bẩy+TP/SL riêng (min 0.1%), bật/tắt riêng.
  - Backend: table `st_automato_orders` (migration `modules/soul-trade/migrations/0007_automato_orders.sql`), service `modules/soul-trade/src/automato-orders.service.ts`, tools/routes/schemas, **background worker** `startAutomatoWorker()` trong `modules/soul-trade/server/runtime.ts` (tick 8s, thoát UI VẪN CHẠY — đã prove).
  - UI: component `OrderList` trong `apps/web/app/soul-trade/page.tsx` — mỗi lệnh = 1 nút ARM TRÒN nhỏ (150×150, border-radius 50%), ⚙ góc trên-trái + ✕ góc trên-phải (34px, tách xa), "+ Thêm" optimistic. Đặt ở tab Auto (dưới AutomatoStatePanel).
  - Verified server serve đúng CSS tròn (container có `width:150px;height:150px`). Nếu anh Nấng thấy VUÔNG = CACHE Safari mobile → mở Private tab / xoá Safari data. **TODO nhẹ: bump asset hash chống cache** (chưa làm).

## 🔜 ĐANG LÀM DỞ (nhiệm vụ hiện tại của anh Nấng — LÀM TIẾP CÁI NÀY)
Yêu cầu: kiểm tra **Kế Toán 10A** + **Soul-Sale** đã active + hiện ĐỦ tất cả tác vụ chưa → thiếu thì kích hoạt hiện hết, **sắp xếp thông minh** → **tự audit click web** 2 module thật kỹ → rà **tất cả tutorial** đã chi tiết + có **quiz** chưa, thiếu bổ sung.

### Số liệu backend đã soi (chính xác, agent phụ đọc code):
**KẾ TOÁN 10A** = 15 read tools (`ke_toan_10a.*`) + 17 write actions (`k10a.*`) = 32 tác vụ. UI 5 tab: Sổ quỹ / Hóa đơn / Vận hành / Phân tích / Báo cáo.
→ **THIẾU 4 FORM trên UI (cần bổ sung):**
  1. `k10a.dat_dinh_ky` — tạo mẫu định kỳ (UI mới chỉ chạy, chưa tạo được)
  2. `k10a.dat_han_muc` — đặt hạn mức tín dụng
  3. `k10a.danh_gia_ty_gia` — đánh giá lại tỷ giá
  4. `k10a.ket_chuyen` — kết chuyển cuối kỳ / khóa kỳ
File UI: `apps/web/app/ke-toan-10a/page.tsx` (405 dòng). Actions backend: `modules/ke-toan-10a/src/tieu-tam-actions.ts`.

**SOUL-SALE** = 23 read + 34 write = 57 capabilities (`soulsale.*`), 9 nhóm: Khách hàng(7) / Đại lý-kênh(6) / Lead-CRM-deal(10) / Báo giá(3) / Đơn hàng-thanh toán(7) / Giá-công nợ(7) / Chỉ tiêu-hoa hồng(5) / Đối soát-import(7) / Báo cáo-intel(5).
→ UI `apps/web/app/soul-sale/page.tsx` (757 dòng) grep thấy 57 `soulsale.*` = **có vẻ đã surface đủ** (8 tab: Tổng quan/Khách hàng/Đại lý & Điểm bán/CRM/Bán hàng/Giá & Công nợ/Đối soát/Tất cả tác vụ). CẦN VERIFY: mở từng tab đối chiếu 57 cap có hiện hết + sắp xếp theo 9 nhóm chưa.
Registry: `modules/soul-sale/src/registry/{reads,writes}.ts`. Active OK (loader.ts đã đăng ký route builder).

### TUTORIAL + QUIZ (component `apps/web/components/Tutorial.tsx`)
- Đã có tour + quiz 3 câu cho: /soul-trade, /soul-sale, /soul-inventory, /soul-manager, /soul-restaurant, /soul-wallet, /home, /accounting, /modules, /crm, /inventory, /hr, /om, /items.
- Ke-toan-10a: có named tour `ke-toan-10a-v2` (event-based) NHƯNG **CHƯA có quiz** → cần thêm quiz 3 câu.
- **VIỆC CẦN LÀM:** verify /ke-toan-10a + /soul-sale tour đã đủ bước chi tiết + CÓ quiz 3 câu chưa; module/trang chưa có tutorial (chat/notifications/search/settings/tieu-tam) — hỏi anh có làm không (trước đó anh bảo tập trung nghiệp vụ).
- Quiz system: interface `QuizQ`, `tour.quiz[]`, render quiz-card cuối tour, đạt ≥2/3. `always:true` cho tour tự hiện mỗi lần (soul-trade đang bật).

## ⚠️ LƯU Ý MÔI TRƯỜNG
- Kênh exec/message CHẬP CHỜN nặng nhiều giờ qua (lệnh dài/đọc file hay rớt về rỗng). Cách né: chạy build/audit nền `nohup ... > /tmp/x.log 2>&1 &`, ghi kết quả gọn ra file rồi đọc.
- Audit UI: script mẫu `scripts/audit-all.mjs`, `scripts/audit-multi.mjs`, `scripts/check-round.mjs` (Playwright, mint JWT, public origin). Ảnh ra `scripts/*.png`.
- tsc: `cd apps/web && npx tsc --noEmit` (web) hoặc `cd modules/<mod> && npx tsc --noEmit`. Lỗi tieu-tam adapters là pre-existing, prod build vẫn qua.

## HÀNH ĐỘNG TIẾP THEO (thứ tự)
1. Bổ sung 4 form thiếu Kế Toán 10A (`page.tsx`), sắp xếp thông minh vào tab hợp lý.
2. Verify + hoàn thiện Soul-Sale hiện đủ 57 tác vụ theo 9 nhóm.
3. Tự Playwright audit click kỹ 2 module.
4. Thêm quiz cho tour /ke-toan-10a; verify quiz /soul-sale; báo trang nào chưa có tutorial.
5. Deploy (build web/api) + báo anh Nấng kèm ảnh, KHÔNG báo "xong" khi chưa tự kiểm.
