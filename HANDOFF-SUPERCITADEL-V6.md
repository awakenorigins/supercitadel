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
- **Seed org Joli Poli SẠCH**: org_id `10bac289-f6fb-46d3-a335-86594c81f0e8`, owner user `3982ee40-2dd2-474f-adbb-852423aa9080`, token `<ORG_TOKEN>` (prefix "Joli", role owner), 14 modules active, Om 99999. Verified qua psql.
  - 2 fix phát sinh: (a) `scripts/seed-jolipoli.mjs` còn regex CŨ 13 ký tự uppercase → đã sửa thành `/^[A-Za-z0-9]{8,24}$/` case-sensitive khớp schema core mới; (b) **DB port host là 5452 KHÔNG phải 5432** (5432 host = Postgres khác) → DATABASE_URL dùng `127.0.0.1:5452`. Cách chạy đúng: copy script vào `packages/db/` rồi `node ./seed-jp-local.mjs <token>` (đã xóa file tạm sau khi xong).
- **UI login** `apps/web/app/page.tsx`: `slice(0,24)`, bỏ toUpperCase, regex `[^A-Za-z0-9]` ✓
- **Build+deploy** web+api OK (log /tmp/v11-build.log, BUILD_DEPLOY_OK).
- **Test login**: POST /api/v1/auth/login `{"token":"<ORG_TOKEN>"}` → JWT + role owner + đúng org ✓ · `JOLIPOLI13` (sai case) → 401 UNAUTHORIZED ✓ (case-sensitive chuẩn) · web landing 200 ✓
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

## ✅ V11D DONE (10/07/2026 13:50 — GitHub release v11.8.0 + full tài liệu)
- Repo MỚI: https://github.com/NachaFromMars/supercitadellab (public, push master:main) — TÁCH RÔI repo gốc supercitadel (bản thật không bị đè).
- Release: https://github.com/NachaFromMars/supercitadellab/releases/tag/v11.8.0 (curl 200 ✓) — notes đầy đủ v11.6→v11.8.
- Tài liệu mới: `CHANGELOG.md` (lịch sử lab đầy đủ) + `README.md` update (banner LAB + badge v11.8.0 + release notes v11.6x/v11.7x/v11.8.0). Docs cũ giữ nguyên (MODULE-FORGE-GUIDE, API, DEV_GUIDE, USER_GUIDE, SECURITY...).
- Bảo mật: `.env.lab.backup` PURGED khỏi toàn bộ git history (filter-branch + reflog expire + gc — commit cũ affa622 thành orphan, không reachable từ HEAD); secret scan tracked files sạch (chỉ còn token lab demo LABOWNERFULL01 vốn public + regex scanner). .gitignore thêm _incoming/, shots-ss/, *.png audit, *.xlsx.
- Topics repo: ai-assistant, business-os, erp, hono, multi-tenant, nextjs, postgresql, trading-bot, vietnamese.
- Commit v11.8.0: 66 files (Tiểu Tâm fixes + payroll Excel + downloadUrl pattern + seed script + scripts audit v7-v11).
- Cách push lần sau: `set -a; source ~/.config/tt-github/env; set +a; git -c credential.helper='!f() { echo "username=x-access-token"; echo "password=$GH_TOKEN"; }; f' push https://github.com/NachaFromMars/supercitadellab.git master:main` · release qua `gh_manager.py create-release --repo NachaFromMars/supercitadellab` (PHẢI có prefix owner, không là 404).

## ✅ V12a DONE (10/07/2026 16:50 — K10A feedback đợt 1: 3 tính năng đã rõ, verified log /tmp/v12-verify.log)
**Theo feedback anh Nắng 14:10 + quyết định 14:32 (Q1-Q5). Full triage: K10A-Feedback-Trage-10-07.html**
1. **Sổ Nhật ký chung** (mục 12): `reports.service.ts generalJournal()` + route GET `/reports/general-journal?from&to` + tool `ke_toan_10a.general_journal` + UI card tab Báo cáo (date range + bảng form S03a: ngày/số CT/diễn giải/TK Nợ Có/số tiền, dòng đầu mỗi bút toán có border đậm). VERIFIED: trả đúng bút toán Nợ 131/Có 511.
2. **UI định khoản thu/chi** (mục 1): dropdown TK tiền (111/112) + TK đối ứng (thu: 511/131/711/121/411/341 · chi: 642/641/627/331/334/133/156/211) + hiển thị live "Định khoản: Nợ X / Có Y" + flash message kèm định khoản. VERIFIED: receipt 112/131 tạo OK.
3. **Lịch sử hoạt động hóa đơn** (mục 6): `invoices.service.ts activity()` + route GET `/invoices/:id/activity` + nút 📜 mỗi dòng HĐ → card lịch sử: ngày/số CT/loại (Ghi sổ/Thu tiền/Điều chỉnh)/nội dung/số tiền/**còn lại sau từng bước**. VERIFIED: HĐ 216k → GHI_SO 216k → THU_TIEN 216k → remaining 0.
- tsc PASS (k10a + web EXIT=0), build+deploy OK.
**QUYẾT ĐỊNH ĐÃ CHỐT (14:32):** Q1 chuỗi công nợ: xác thực trả tiền → TỰ ĐỘNG hạch toán cả chuỗi · Q2+Q3 source Misa đã tải (xem dưới) · Q4 số CT: cả hai (format tùy chỉnh + sửa tay check trùng) · Q5 đa tiền tệ toàn hệ thống tầng core, VND gốc.
**CÒN LẠI (làm tiếp theo thứ tự):** ④ cân đối phát sinh 8 cột chuẩn Misa (đợi soi mẫu từ MISA-JSC đã tải) → ⑤ số chứng từ tùy chỉnh → ⑥ đa tiền tệ core (packages/core Money + per-doc currency/rate/note) → ⑦ TSCĐ phân bổ multi-TK 627/641/642 → ⑧ TT99 (tra cứu + trình duyệt) → ⑨ chuỗi công nợ (thiết kế schema chain + auto-cấn trừ khi xác thực) → ⑩ behavior rule "sai→báo→chờ".
**MISA SOURCE:** đã tải về `~/Super-Manager-Module/Joli-Poli-Misa/` (misa-installer.bin 1.52GB + MISA-JSC/{MISA KYSO, MISA SME 2026} — crawler drive-crawl.py dùng cookie minhfrommars, ~870MB+/1045+ files, có BC26_AC_2014.xls + MISA_Config_Template.xls). Cron watcher báo khi xong.

## ✅ V12b-④ DONE (10/07/2026 17:25 — Cân đối phát sinh 8 cột chuẩn Misa, verified /tmp/v12b-verify-out.log)
- **MISA tải xong CẢ 2 link**: MISA-JSC 869MB/1117 files (SME 2026 798MB + KYSO 72MB), log có CRAWL_DONE, watcher cron 729d1624 đã xóa. Path thật: `/root/.openclaw/workspace/Super-Manager-Module/Joli-Poli-Misa/` (KHÔNG phải ~/Super-Manager-Module). ⚠️ Filename bị crawler dính suffix " Binary More info (Alt + →)" — tìm file bằng grep/sed strip suffix.
- **Soi mẫu Misa**: Report/ReportTemplate/*.mrt (Stimulsoft XML) + Template/Resources/viVI.json ("BẢNG CÂN ĐỐI TÀI KHOẢN" frmCreateReportFinanceDetail/F01) → layout 8 cột: dư đầu Nợ/Có · PS kỳ Nợ/Có · lũy kế đầu năm Nợ/Có · dư cuối Nợ/Có.
- **Backend**: `trialBalanceMisa()` trong reports.service.ts — 3 aggregate song song (prior/period/accum), openNet debit-basis, dựng cây cha-con qua parentId + rollup đệ quy, split Nợ/Có theo dấu, totals CHỈ cộng level 0 (tránh đếm trùng cha-con), balanced check 3 cặp cột. Route GET `/reports/trial-balance-misa?from&to` + tool `ke_toan_10a.trial_balance_misa`.
- **UI**: card "Bảng cân đối tài khoản (8 cột chuẩn Misa)" tab Báo cáo (`data-tut="k10a-tbmisa"`) — header 2 tầng colSpan, TK cha in đậm + nền nhạt, con thụt lề theo level, dòng TỔNG CỘNG, chip CÂN/LỆCH.
- **Verified thật**: org Joli Poli setup TT133 (33 TK) + 3 chứng từ test (thu T6 5tr 111/511 → dư đầu kỳ T7 đúng 5tr; thu T7 3tr 112/131; chi T7 1.2tr 642/111) → 8 cột đúng từng số, balanced=true; void 2 phiếu thu → vẫn cân (7.2tr PS gồm bút toán đảo). Lưu ý: void payment bị chặn reverseGate lớp 2 (đúng thiết kế) → **còn 1 phiếu chi test PC-2026-000001 1.2tr trong org Joli Poli chưa void được** — dọn sau hoặc để làm data demo.
- tsc PASS cả 2 (EXIT=0), build+deploy web+api OK (/tmp/v12b-build.log BUILD_DEPLOY_OK). Scripts: `scripts/v12b-verify.sh|py`, `scripts/v12b-seed-test.sh`.

## ✅ V12b-⑤ DONE (10/07/2026 18:25 — Số chứng từ tùy chỉnh, verified 8/8 /tmp/v12b5-verify-out.log)
- **MISA-AUDIT-FULL-V12.md** (844 dòng, agent mổ toàn kho theo lệnh anh Nắng "phẫu thuật Misa full"): bản đồ 1063 file, headers 48 ImportExcel, labels 50 .mrt, Tax/BC26+Config, dấu vết số CT (RefNo/RefDate/PostedDate, prefix PT/PC/NK/BH/UNC), đa tiền tệ (CurrencyID+ExchangeRate+AmountOC trên MỌI chứng từ), TS CĐ phân bổ nhiều dòng, COA versioning — DÙNG LÀM CĂN CỨ cho ⑥⑦⑧.
- **Schema mới** `doc_number_settings` (docsettings.ts + migration `0001_doc_number_settings.sql` ĐÃ CHẠY vào DB): per-org + per-loại, prefix/pad/format với placeholder `{prefix} {year} {yy} {month} {seq}`.
- **docnumber.ts nâng cấp**: `getDocNumberSetting/setDocNumberSetting` (validate placeholder, pad 1-10, phải có {seq}) + `resolveDocNumber` (docNo tay → validate `[A-Za-z0-9\-_/.]` max40 + CHECK TRÙNG per-org qua callback; không tăng counter khi nhập tay) + `nextDocNumber` render theo format custom. PREFIX thêm ADV=TU.
- **4 service** receipts/payments/invoices/bills: nhận `docNo?` optional, checkDup query đúng bảng per-org trong transaction.
- **Routes**: GET/PUT `/settings/doc-numbers` (list 6 loại + counter năm, upsert setting, audit log). Schemas thêm docNo vào receiptPaymentSchema + invoiceBillSchema.
- **UI**: tab Sổ quỹ thêm ô "Số CT tự nhập (bỏ trống = tự động)" (`data-tut="k10a-docno"`); tab Vận hành thêm card "Số chứng từ tùy chỉnh" (`k10a-docnum`): chọn loại + prefix + pad + format, bảng cấu hình + counter hiện tại.
- **Verified 8/8**: settings mặc định · PUT format PTX{yy}{month}/{seq} · auto → `PTX2607/0003` đúng format · tay `PT-TAY-001` OK · trùng bị chặn · ký tự bậy bị chặn · format thiếu {seq} bị chặn · reset mặc định OK. tsc PASS ×2, build+deploy OK (/tmp/v12b5-build.log).
- Script verify: `scripts/v12b5-verify.sh <token>` (⚠️ secret-mask guard: KHÔNG hardcode token trong script — truyền argv; không viết `JWT=$(...)`).
- ⚠️ Data test tồn đọng org Joli Poli: 2 phiếu thu test (PTX2607/0003 111k, PT-TAY-001 222k) + 1 phiếu chi PC-2026-000001 1.2tr (void bị chặn lớp 2) — chờ anh Nắng quyết dọn hay giữ làm demo.

## ✅ V12b-⑥ DONE (10/07/2026 19:20 — Đa tiền tệ tầng core áp K10A, verified 7/7 /tmp/v12b6-verify-out.log)
- **Chuẩn core** `packages/core/src/currency.ts` (export từ index): BASE_CURRENCY=VND, `DocCurrencyInfo/Input`, `resolveDocCurrency()` (VND→rate=1; ngoại tệ BẮT BUỘC rate>0 ≤6 số lẻ), `mulMoney()` BigInt round half-up không lệch float. Theo đúng pattern Misa CurrencyID+ExchangeRate+AmountOC (MISA-AUDIT-FULL-V12.md §6).
- **K10A mirror** `src/lib/currency.ts` (module standalone không dep @citadel/core — giữ đồng bộ logic với core khi sửa).
- **Schema**: `currencyColumns` (currency/exchangeRate/amountOC/rateNote/rateDate) spread vào receipts+payments+invoices+bills; migration `0002_multicurrency.sql` ĐÃ CHẠY (ADD COLUMN IF NOT EXISTS, default VND/1).
- **Services**: thu/chi — input.amount = NGUYÊN TỆ, hạch toán amountVND quy đổi; HĐ bán/mua — tính tax/total ở nguyên tệ rồi quy đổi từng thành phần (total VND = subtotalVND + taxVND để bút toán cân từng đồng), amountOC = totalOC. Routes schemas thêm currencyFields.
- **Verified 7/7**: USD 100@25400 → 2,540,000 VND đúng · VND thường rate=1 · USD thiếu rate bị chặn · rate âm bị chặn · EUR 50@27123.456789 → 1,356,172.84 (BigInt round chuẩn) · HĐ USD 1000+10% @25000 → 27,500,000 VND / OC 1100 USD · sổ vẫn CÂN sau FX. tsc PASS ×3 (core+k10a+web), build+deploy OK.
- Script: `scripts/v12b6-verify.sh <token>`. UI chưa có ô chọn tiền tệ (backend-first; thêm khi anh Nắng yêu cầu hoặc khi làm ⑧ chuỗi công nợ đa tiền tệ).
- ⚠️ Data test FX tồn đọng org Joli Poli: PT-2026-000004 (USD), PT-2026-000005, 1 phiếu chi EUR, 1 HĐ USD + contact "V12b6 FX Customer".

## ✅ V12b-⑦ DONE (10/07/2026 20:00 — TSCĐ phân bổ multi-TK, verified 6/6 /tmp/v12b7-verify-out.log)
- **Schema**: `fixed_assets.allocations` jsonb `[{accountId, code, percent}]` (migration `0003_asset_allocations.sql` ĐÃ CHẠY). Null = 100% vào expenseAccountId (backward compatible).
- **Service**: create validate tổng %=100, không âm, không trùng TK, max 10 dòng, resolve accountId từng TK. runDepreciation chia dep theo % — DÒNG CUỐI nhận phần dư làm tròn để Nợ=Có tuyệt đối.
- **Verified 6/6**: TSCĐ 120tr/12th phân bổ 627=50/641=30/642=20 → bút toán khấu hao đúng Nợ 627 5tr + Nợ 641 3tr + Nợ 642 2tr / Có 214 10tr · tổng % ≠20 bị chặn · TK trùng bị chặn · sổ vẫn cân. tsc PASS, build+deploy api OK.
- ⚠️ Lưu ý: seed TT133 KHÔNG có sẵn 627 (chuẩn TT133 gộp chi phí vào 642) — đã tạo thêm TK 627 vào org Joli Poli qua POST /accounts để test. Doanh nghiệp TT200 sẽ có đủ. Data test: TS0001 120tr + 1 bút toán khấu hao 10tr.
- Script: `scripts/v12b7-verify.sh <token>`.

## ✅ V12b-⑧ DONE (10/07/2026 21:40 — TT99 phương án A mức ②, anh Nắng duyệt msg 12045, verified thật)
- **CHART_TT99** trong `lib/chart-of-accounts.ts`: 125 TK (71 cấp 1 + cấp 2 phổ biến) theo TT99/2025/TT-BTC. Khác TT200: 112 "Tiền gửi không kỳ hạn" (có kỳ hạn→1281) · 155 "Sản phẩm" · 242 "Chi phí chờ phân bổ" · 3387 "Doanh thu chờ phân bổ" · BỎ 611 · THÊM 215x tài sản sinh học + 332 + 8211/8212. TT133 GIỮ NGUYÊN; TT200 deprecated (JSDoc @deprecated).
- `ChartStandard = "TT133"|"TT200"|"TT99"`, chartOf + seed.ts + routes /setup nhận standard TT99. Tờ trình: `TT99-ToTrinh.html`.
- **Verified thật**: sanity script (125 TK, 0 trùng, 0 parent mồ côi) · tạo org tạm tt99-test → POST /setup standard=TT99 trả created:125 · TK đặc trưng đúng tên (112/155/242/215/2151/332/1281/4211, 611 không tồn tại đúng chuẩn) · phiếu thu smoke + trial-balance-misa balanced trên chart TT99 · org tạm ĐÃ XÓA sạch (accounts/journal/receipts/counters/tokens/users/org). tsc PASS, build+deploy api OK.
- Công cụ chuyển đổi org cũ → TT99: ĐỂ ĐỢT SAU (anh Nắng chốt).

## ✅ V12b-⑨ DONE (10/07/2026 22:20 — Chuỗi công nợ tự động hạch toán, verified 7/7 /tmp/v12b9-verify-out.log)
- **Schema** `debt_chains` (debtchains.ts + migration `0004_debt_chains.sql` ĐÃ CHẠY): chainType sales/purchase, contactId, totalAmount VND, unallocated (tiền thừa), bộ đa tiền tệ (currency/exchangeRate/amountOC/rateNote), cashAccountId, journalEntryId, links jsonb per-doc.
- **Service** `debtchain.service.ts`: `preview()` (xem trước phân bổ FIFO KHÔNG hạch toán — cho UI confirm) + `settle()` (XÁC THỰC → phân bổ FIFO cũ nhất trước → update amountPaid từng HĐ → MỘT bút toán gộp Nợ tiền / Có 131 per-doc hoặc ngược lại cho purchase → lưu chain) + `list()`. Đa tiền tệ tại NGÀY THANH TOÁN (resolveDocCurrency). Tiền thừa → unallocated, KHÔNG tự hạch toán (behavior rule ⑩).
- **Routes**: POST `/debt-chains/preview`, POST `/debt-chains/settle`, GET `/debt-chains?contactId=`.
- **Verified 7/7**: 3 HĐ (1tr/2tr/3tr) → preview 2.5tr phân bổ đúng HĀ1 full + HĀ2 1.5tr · settle 2.5tr OK · settle USD 200@25000 cấn nốt 3.5tr + thừa 1.5tr unallocated đúng · hết nợ settle tiếp bị chặn · outstanding khách = 0 · bút toán gộp đúng từng dòng trong nhật ký · sổ cân. tsc PASS, build+deploy api OK.
- Script: `scripts/v12b9-verify.sh <token>`. Data test: kh
ách "V12b9 Chain Customer" + 3 HĐ paid đủ + 2 chains trong org Joli Poli.
- UI chưa có (backend-first) — gợi ý đợt sau: nút "Thu tiền cấn trừ chuỗi" tab Hóa đơn dùng preview→confirm→settle.

## ✅ V12b-⑩ DONE (10/07/2026 22:40 — Behavior rule "sai→báo→chờ" — V12 HOÀN TẤT 100%)
- **System prompt Tiểu Tâm in-app** (`packages/tieu-tam/src/adapters.ts` renderSystemPrompt, áp mọi engine opus/sonnet/gpt-5.5): phát hiện dữ liệu/bút toán sai → (1) THÔNG BÁO rõ sai đâu/vì sao/ảnh hưởng → (2) ĐỀ XUẤT cách xử → (3) ĐỢI người dùng quyết — KHÔNG tự đảo/sửa/xóa. Ngoại lệ: thao tác user vừa yêu cầu tường minh.
- Docs: `docs/DEV_GUIDE.md` mục "Behavior Rule: Sai → Báo → Chờ". Build+deploy api OK (rule có trong container, verified grep + API alive). Lưu ý: tsc package tieu-tam có 4 lỗi MessageContent PRE-EXISTING (không do rule — rule chỉ thêm 1 dòng parts.push string), prod build vẫn qua như trước.

## 🏁 V12 TỔNG KẾT (10/07/2026): ①②③ (V12a) + ④ cân đối 8 cột Misa + ⑤ số CT tùy chỉnh + ⑥ đa tiền tệ core + ⑦ TSCĐ multi-TK + ⑧ TT99 + ⑨ chuỗi công nợ + ⑩ behavior rule = **10/10 DONE**, tất cả deploy + test thật. Migrations 0001-0004 đã chạy. Scripts verify: v12b*-verify.sh. Audit Misa: MISA-AUDIT-FULL-V12.md. Tờ trình TT99: TT99-ToTrinh.html.
**Data test tồn đọng org Joli Poli (chờ anh Nắng quyết dọn/giữ):** phiếu thu PT-2026-000004/5 + PTX2607/0003 + PT-TAY-001 · phiếu chi PC-2026-000001 (1.2tr, void bị chặn lớp 2) + 1 phiếu chi EUR · HĐ USD + contact "V12b6 FX Customer" · TSCĐ TS0001 120tr + bút toán khấu hao · khách "V12b9 Chain Customer" + 3 HĐ paid + 2 chains · TK 627 thêm tay.

## ⏳ V12b ĐANG DỞ (lịch sử — ĐÃ XONG HẾT 10/10)
**Context:** anh Nắng feedback K10A 13 mục (triage đầy đủ: `K10A-Feedback-Trage-10-07.html`) + đã chốt Q1-Q5 (xem V12a phía trên). V12a (3 tính năng: nhật ký chung, UI định khoản thu/chi, lịch sử hóa đơn) ĐÃ deploy + verified. ZIP đã gửi anh (msg 12009).
**ĐANG CHẠY NỀN (không cần đụng):** crawler MISA `drive-crawl.py` tải `~/Super-Manager-Module/Joli-Poli-Misa/MISA-JSC/` (869MB+/1117+ files, 0 fail; MISA SME 2026 đủ Report/Template — form mẫu kế toán nằm đó; đang nốt MISA KYSO). Cron watcher `misa-download-watcher` (id 729d1624) tự báo group khi xong rồi tự xóa; nếu watcher lỗi thì check tay: `pgrep -f drive-crawl` + `du -sh .../MISA-JSC`.
**VIỆC CÒN LẠI THEO THỨ TỰ (đã chốt với anh Nắng):**
1. ~~④ Cân đối phát sinh 8 cột~~ ✅ DONE (xem V12b-④ phía trên)
1b. ④ **Cân đối phát sinh 8 cột chuẩn Misa** (dư đầu Nợ/Có + PS trong kỳ Nợ/Có + lũy kế + dư cuối, TK cha-con): soi mẫu trong `MISA-JSC/MISA SME 2026/Report/` + `Template/` (có BC26_AC_2014.xls, MISA_Config_Template.xls) rồi nâng `trialBalance()` trong `modules/ke-toan-10a/src/services/reports.service.ts`.
2. ~~⑤ Số chứng từ tùy chỉnh~~ ✅ DONE (xem V12b-⑤ phía trên).
3. ~~⑥ Đa tiền tệ TẦNG CORE~~ ✅ DONE (xem V12b-⑥ phía trên).
4. ~~⑦ TSCĐ phân bổ multi-TK~~ ✅ DONE (xem V12b-⑦ phía trên).
5. ~~⑧ TT99~~ ✅ DONE (xem V12b-⑧ phía trên).
6. ~~⑨ Chuỗi công nợ nhiều tầng~~ ✅ DONE (xem V12b-⑨ phía trên).
7. ⑩ **Behavior rule** "phát hiện sai → THÔNG BÁO → đợi quyết định, KHÔNG tự đảo/tự sửa" — cài vào system prompt Tiểu Tâm (`packages/tieu-tam/src/adapters.ts` renderSystemPrompt) + docs.
**LƯU Ý VẬN HÀNH:** kênh exec chập chờn từng đợt — lệnh dài dùng `nohup ... > /tmp/x.log 2>&1 &` rồi đọc log · message tool báo timeout ≠ gửi fail, KHÔNG retry ngay (lỗi spam 16:19-16:27 đã ghi memory) · DB host port **5452** · build: `docker compose build web api && docker compose up -d web api` · tsc check: `cd modules/ke-toan-10a && npx tsc --noEmit` + `cd apps/web && npx tsc --noEmit` · test JWT: script mẫu `scripts/v12-verify.sh` (login đọc /root/.openclaw/workspace/.jwt.txt — nếu hết hạn lấy mới qua POST /auth/login token <ORG_TOKEN>).

## ⏳ V11 ĐANG DỞ — LỊCH SỬ (đã hoàn thành ở trên, giữ lại để tham chiếu)
**ĐÃ XONG (committed, không làm lại):**
1. Opus 4.6 = model default Tiểu Tâm: DB `tt_soul_state` (ALTER default + UPDATE all rows → opus-4.6) ✓ · `packages/db/src/schema.ts` default('opus-4.6') ✓ · UI ENGINES `apps/web/app/tieu-tam/page.tsx` (opus mặc định, gpt-5.5 phụ) ✓
2. Token schema nới 8-24 ký tự A-Za-z0-9 (nhận <ORG_TOKEN>): `packages/core/src/index.ts` ✓
3. Script seed org sạch: `scripts/seed-jolipoli.mjs` (argv[2] = token). ĐÃ copy vào container api `/tmp/seed-jp.mjs` nhưng chạy fail vì cả host lẫn container không resolve được package `postgres` (pnpm store). ANH NẮNG CHỈ THỊ: KHÔNG đổi sang SQL thuần, giữ hướng script node — fix bằng cách chạy từ thư mục có dep (ví dụ `cd packages/db && node ../../scripts/seed-jolipoli.mjs <ORG_TOKEN>` vì packages/db/node_modules có postgres + @node-rs/argon2 symlink) hoặc copy script vào packages/db/.
**CÒN LẠI (làm theo thứ tự):**
1. Seed: `cd /root/.openclaw/workspace/supercitadellab/packages/db && DATABASE_URL='postgres://citadellab:<DB_PASSWORD trong .env>@127.0.0.1:5432/citadellab' node ../../scripts/seed-jolipoli.mjs <ORG_TOKEN>` → verify `SELECT id,name FROM orgs WHERE slug='joli-poli'` qua `docker exec supercitadellab-postgres-1 psql -U citadellab -d citadellab`
2. Nới UI login `apps/web/app/page.tsx`: đang `e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,13)` → đổi thành `e.target.value.replace(/[^A-Za-z0-9]/g,'').slice(0,24)` (token phân biệt hoa thường)
3. Rebuild+deploy: `docker compose build web api && docker compose up -d web api` (chạy nền ghi /tmp, kênh exec hay đứt)
4. Test login: POST `http://127.0.0.1:3011/api/v1/auth/login` body `{"token":"<ORG_TOKEN>"}` → phải trả JWT + role owner
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
