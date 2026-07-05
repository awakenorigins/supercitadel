# SUPERCITADEL Build — State (nền Citadel V7A, repo NachaFromMars/supercitadel)
## Mạch SUPERCITADEL-R10 (Outbox foundation — 2026-07-05)
- Phase A: thêm migration `0011_outbox_events`, Drizzle schema, `@citadel/core/outbox` với `emitEvent(tx, ...)` bắt buộc transaction; API dispatcher interval an toàn, exact+wildcard subscriber, notification + WS broadcast, admin endpoints `/api/v1/outbox/stats` và `/api/v1/outbox/events`; emit thật từ accounting/om/hr; v10 test cover rollback/commit atomicity, handler throw retry, wildcard, notification row, org isolation/staff 403.
- Phase B: manifest v2 hỗ trợ `events.emits` exact và `events.subscribes` exact hoặc `module.*`; loader auto-wire built-in module event handlers; notification dogfood contract `server/events.ts`; `docs/MODULE-FORGE-GUIDE.md` nâng v2.1 có mục Sự kiện Outbox cho module kho/ngoài.
- Phase C: release mục tiêu `v10.0.0`; gates: typecheck/test/build, acceptance-v7a, audit-buttons, audit-manifests, audit-module-docs, deploy live, verify-r10, tổng nghiệm thu verify-r8/r85/r9/r10.

## Mạch SUPERCITADEL-R9 (Module Loader FULL strict — 2026-07-05)
- Phase A: `packages/core/src/manifest.ts` định nghĩa manifest schema v2 + `validateManifest()` strict; 7 manifest module migrated sang permission format `module.resource.action`; audit-manifests PASS.
- Phase B: `services/api/src/modules/loader.ts` đọc `modules/*/manifest.json`, validate strict, reject manifest lỗi/dependsOn lỗi/missing route builder mà không crash API; catalog sinh từ manifest; endpoint owner-only `GET /api/v1/modules/loader-status`; test v9 cover loaded/rejected/dependsOn/catalog.
- Phase C: `docs/MODULE-FORGE-GUIDE.md` nâng lên v2 (schema v2, strict loader, lỗi thường gặp, verify); README highlight loader strict; CI thêm gate `audit-manifests` trước docs/buttons/secret; release mục tiêu `v9.0.0`.
- Gate R9 yêu cầu trước release: `pnpm -r typecheck`, `pnpm -r test`, `pnpm -r build`, `acceptance-v7a 9/9`, `audit-buttons`, `audit-manifests`, `audit-module-docs`, deploy live và verify-r9.

## Mạch SUPERCITADEL-R8.5 (RBAC permission registry + dry-run Tiểu Tâm — 2026-07-05)
- Phase A: `packages/core/src/permissions.ts` thêm registry quyền `module.resource.action`, metadata securityLevel/sensitive, wildcard role permissions và helper `hasPermission/requiredSecurityLevel/permissionsForRole`; API thêm `requirePermission()` + `GET /api/v1/permissions`; hard gate đổi role đi qua registry. Commit `c41c1a8`.
- Phase B: Tiểu Tâm action registry gắn `permission/securityLevel/sensitive`; `executeAction()` check module + RBAC + securityLevel, action sensitive tự dry-run trả `preview/pendingAction`; confirm chạy thật, audit đủ `tieu_tam.action_dryrun` + `tieu_tam.action`. Test v8_5 cover staff denied, no-write dry-run, confirm exactly one row, cross-org. Commit `65a2d72`.
- Phase C: Web Settings hiển thị quyền theo module từ `/permissions`; chat sheet render amber preview card với Xác nhận/Hủy; audit-buttons 0 nút chết. Commit `8d09304`.
- Phase D verify live: `scripts/verify-r85.py` chạy trên `https://supercitadel.62.146.238.213.sslip.io` PASS 7/7 — owner login, `/permissions` shape, staff forbidden 403 PERMISSION_DENIED, Tiểu Tâm tạo phiếu thu dry-run preview + confirm tạo thật, audit logs có cả dry-run/action. Docs cập nhật SECURITY/API; release `r8.5.0`.
- Verify quality trước release: Phase A/B/C đã PASS typecheck/test/build/acceptance 9/9; Phase D secret scan diff sạch; CI GitHub Actions cần success theo head commit.
- Tiếp theo: R9 = Module Loader FULL strict (manifest sai chuẩn = từ chối nạp); R10 = outbox nền cho module kho anh Nấng cắm vào.

## Mạch SUPERCITADEL-R1 (REBRAND + DESIGN SYSTEM V2 — mới nhất, 2026-07-03)
- **Rebrand**: tên hiển thị "SUPERCITADEL" toàn UI/docs (layout metadata, login, API `/` name, README, root package `supercitadel`); scope `@citadel/*` GIỮ NGUYÊN để không phá imports; localStorage keys `citadel.*` giữ để không logout người dùng cũ.
- **Design System V2** (`apps/web/app/globals.css`, học pattern Kiranism/shadcn-admin/Studio Admin/tremor — không thêm dependency): token hóa surface elevation (--void→--elev 6 lớp), typography scale (--fs-display→--fs-micro), radius/spacing scale, shadow 3 mức + glow tremor-style, motion tokens (--ease/--dur) + keyframes fade-up/scale-in/shimmer; nền off-black sâu hơn có radial gradient jade subtle; scrollbar styled; 3 theme jade/gold/sage vẫn đổi qua lib/theme.ts (ghi đè --jade/--jade-d/--jade-soft).
- **Shell V2** (`components/Shell.tsx`): desktop ≥1024px sidebar trái collapsible (icon-only khi thu, nhớ localStorage `citadel.sb`) — logo fox SUPERCITADEL, nav groups Tổng quan/Nghiệp vụ (Kế toán·CRM·Kho·Nhân sự)/Kinh tế (Om·Cửa hàng·Kho đồ)/Tiểu Tâm (energy dot theo status)/Hệ thống, user footer avatar+org; topbar sticky breadcrumb + search + bell badge + energy pill Tiểu Tâm (mở sheet SSE); mobile <1024px giữ bottom nav 5 mục V7A nguyên; Tiểu Tâm sheet SSE nguyên logic, desktop neo góc phải như chat dock.
- **Home V2** (`app/home/page.tsx`): KPI grid 4 thẻ (doanh thu hero glow+sparkline SVG thuần · deal mở từ `/crm/stats` · hàng sắp hết từ `/inventory/low-stock` · thành viên từ `/dashboard/summary`) — module tắt → hiện "Module tắt" thay vì vỡ; quick actions 4 nút; hoạt động gần đây = audit-logs THẬT (`/audit-logs?limit=6`, nhãn tiếng Việt theo action, staff không quyền → empty state lịch sự); khu Tiểu Tâm chào theo mood thật từ `/tieu-tam/state` + nút mở chat.
- Icon mới: book/target/panel/fox (stroke 1.6 nhất quán). Backend KHÔNG đổi (chỉ đổi string tên API `/`).
- Verify R1: typecheck 13/13 PASS · pnpm -r test 12/12 xanh · next build production PASS · audit-buttons 0 nút chết.
- **Còn lại cho R2**: redesign từng trang nghiệp vụ (accounting/crm/inventory/hr/om/modules/items/settings/chat/tieu-tam) theo design system V2 — data tables, form sheets, charts; command palette cmd+k; desktop layout rộng hơn cho bảng.

## Mạch V7A-P6 (NGHIỆM THU CUỐI — VẬN HÀNH VỮNG — mới nhất, 2026-07-03)
- **9/9 chuẩn §09 PASS** — script nghiệm thu tự động `scripts/acceptance-v7a.mts` (chạy: `cd services/api && pnpm exec tsx ../../scripts/acceptance-v7a.mts`; có `--secret-only` cho CI gate):

| # | Chuẩn §09 | Kết quả | Bằng chứng |
|---|---|---|---|
| 1 | Đổi model AI → trí nhớ/nhân cách nhất quán | ✅ PASS | v7a-p2 (swap stub-a→stub-b qua PATCH /engine, cùng bộ câu, fact+persona nhất quán) |
| 2 | Cross-org mọi ngả → chặn + ghi vết | ✅ PASS | v7a-p6: audit-logs/memories/kho vật phẩm/accounting export/JWT giả/?orgId đều chặn, audit ghi vết đủ |
| 3 | Vật phẩm xem info + use hiệu ứng thật | ✅ PASS | v7a-p3 29 ✓ (food +energy đúng amount, recharge 100, decor đổi theme bền) |
| 4 | 100% nút và màn hình sống | ✅ PASS | audit-buttons 0 nút chết + next build 15/15 routes (P5) |
| 5 | Token → dùng trong 30 giây; nhạy cảm đòi lớp 2 | ✅ PASS | v7a-p6: login→/me→topup đo thời gian thật <30s; chi Om>1000 lớp 1→403 VN; bind email→lớp 2→200 |
| 6 | Beta mode bật/tắt đúng | ✅ PASS | v7a-p2: BETA_MODE=false hao -2/-5 + kiệt sức từ chối việc nặng; true không bao giờ cạn |
| 7 | M0 Kế Toán đủ + docs + Excel | ✅ PASS | v7a-p4 37 ✓ (4 .xlsx + JSON + import validate) · audit-module-docs 7/7 |
| 8 | Tạm tắt module → không gãy | ✅ PASS | v7a-p6: deactivate accounting → mọi route 403 MODULE_INACTIVE (kể cả export); module khác 200; activate lại data nguyên; audit đủ |
| 9 | 0 bí mật trong code | ✅ PASS | secret-scan 0 hit trên 144 file source (sk-/ghp_/github_pat_/AKIA/PRIVATE KEY/password=) |

- Test mới `services/api/src/v7a-p6.test.ts` (**36 checks ✓**, vào `pnpm test`): (a) chuẩn #2 cross-org MỌI NGẢ qua HTTP thật — JWT thật + requireAuth thật, audit-logs/tt memories/kho vật phẩm/accounting export rỗng cho org B/JWT sửa chữ ký 401/?orgId=A bị BỎ QUA; (b) chuẩn #5 đo thời gian THẬT token→login→/me→topup <30s + sensitive gate 403 tiếng Việt→bind email→pass; (c) chuẩn #8 deactivate accounting→403 MODULE_INACTIVE mọi route kể cả export, om/notifications/tieu-tam/store vẫn 200, activate lại chart còn nguyên, audit deactivate/activate, core module không tắt được (400)
- Vận hành: deploy.sh thêm migrate module **accounting** (thiếu từ P0 — loop cũ chỉ 6 module); docker-compose.yml api thêm env `BETA_MODE` + `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` pass-through (.env.example đã có sẵn cả 3); migrations 0004-0006 chạy qua `migrate.ts` (runner đọc cả thư mục, đã có sẵn trong deploy.sh)
- CI ci.yml thêm 3 gate sau test: audit-module-docs · audit-buttons · secret-scan (`acceptance-v7a.mts --secret-only`)
- docs/API.md bổ sung đầy đủ P1-P5: audit-logs, bind-email/phone + users/:id/role, tieu-tam state/engine/memories (GET+DELETE), store items + inventory-items use, accounting export 4 .xlsx + JSON + import
- Fix flake test hr-v2 (lệch ngày local vs UTC lúc nửa đêm: `new Date()` ở 00:1x CEST = ngày hôm trước theo UTC của service dateStr) — anchor mọi mốc giờ vào cùng thời điểm lateTime, today theo UTC
- Verify: typecheck **13/13 PASS** · `pnpm -r test` **12/12 packages xanh** (v7a-p1→p6: 17+16+29+37+17+36 asserts) · acceptance **9/9 PASS, 0 FAIL, 0 MANUAL** · secret-scan 0 hit

## Mạch V7A-P5 (TRẢI NGHIỆM PREMIUM: khu vực riêng Tiểu Tâm + polish UI/UX + mobile — mới nhất)
- G9 "nơi chốn thực sự": trang `apps/web/app/tieu-tam/page.tsx` — khu vực riêng đầy đủ của Tiểu Tâm (không phải widget góc màn hình)
- Hero avatar CÁO SVG sống theo mood (vẽ tay theo design system, stroke jade, không dependency): tràn đầy = nhún nhảy tươi sáng + ring nhanh · ổn định = thở bình thường + mắt chớp · mệt = chậm ngả nhẹ + một mắt lười · kiệt sức = ngủ gật (mắt nhắm, miệng ngáp, "z z z" bay) — CSS keyframes trong globals.css (fox-*)
- Energy bar LỚN có % + màu theo trạng thái (jade/sky/amber/rose) + statusLabel + statusMessage tiếng Việt từ GET /state; fill animate `.tt-energy-fill` (cubic-bezier .7s) — cho ăn thấy thanh chạy mượt real-time
- Nút "Cho ăn" → sheet list đồ ăn/boost SỞ HỮU (từ /inventory-items filter food+boost), dùng ngay tại chỗ qua POST /inventory-items/:id/use — energy tăng thấy được, toast message thật từ API; kho trống → empty state + nút Đến Cửa hàng
- Trí nhớ "Em nhớ gì về mình": endpoint MỚI `GET /api/v1/tieu-tam/memories` (recall org+user — hiến pháp #1, limit ≤100) + `DELETE /api/v1/tieu-tam/memories/:id` (forget() mới trong packages/tieu-tam/memory.ts — user chỉ xóa trí nhớ của mình/org-level trong org mình, cross-org/cross-user → 404; audit `tieu_tam.memory_delete` kèm kind+content) — UI list badge kind tiếng Việt (Về mình/Chủ đề/Sở thích…) + nút xóa từng mảnh, message "Em đã quên chuyện đó rồi nha 🦊"
- Engine switcher: dropdown stub-a/stub-b/openai/anthropic gọi PATCH /engine sẵn có → toast "Đổi bộ não thành công, trí nhớ nguyên vẹn 🦊"; chú thích "đổi model = gạt công tắc, hồn giữ nguyên"
- Nút "Trò chuyện" mở Tiểu Tâm sheet SSE hiện có qua custom event `citadel:tt-chat` (Shell lắng nghe) — không duplicate sheet
- Nav: nút giữa (living core) botnav đổi từ mở-sheet → điều hướng /tieu-tam (vị trí trang trọng nhất app), active state theo path
- Polish §07: theme accent chuyển mượt (transition background/border/color .35s cho card/btn/chip/bub) — đổi theme decor không giật; toast animation trượt vào; mobile @480px (pg-h gọn, fox nhỏ lại); rà empty state + skeleton toàn app — các trang cũ đã đầy đủ từ trước (accounting/crm/hr/inventory/om/chat/notifications/search đều có skel + message tiếng Việt), trang mới /tieu-tam có đủ skeleton (hero+memories) + empty states + error toast
- Test mới services/api/src/v7a-p5.test.ts: **17 asserts** (GET /memories đúng scope user+org-level, KHÔNG lộ org khác 2 chiều, DELETE xóa thật + audit đúng resource/user, cross-org 404 + data còn nguyên, cross-user cùng org 404, chính chủ xóa được, org-level xóa được, id rác/uuid lạ 404 sạch, GET sau xóa phản ánh đúng, /state không vỡ)
- Verify: typecheck **13/13 PASS** · `pnpm -r test` **12/12 packages xanh** · `next build` production **15/15 routes** (/tieu-tam 4.53 kB) · audit-buttons **0 nút chết** · audit-module-docs **7/7 PASS**

## Mạch V7A-P4 (M0 KẾ ToÁn HOÀN THIỆN: Excel connect + tài liệu module = giáo trình Tiểu Tâm)
- G7 Excel connect (Kế Toán): thêm dep `xlsx` (SheetJS 0.18.5, pin version) vào modules/accounting + services/api; module mới `server/excel.ts`
- 4 endpoint export .xlsx THẬT (Content-Type `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, org isolation từ JWT): `/export/general-ledger.xlsx` (hệ Số CT/Ngày/TK Nợ/TK Có/Số tiền/Đối tác/Diễn giải từ GL), `/export/invoices.xlsx`, `/export/trial-balance.xlsx` (kèm dòng TỔNG + cờ SỔ CÂN/LỆCH), `/export/profit-loss.xlsx`
- Endpoint machine-friendly cho AI: `GET /export/general-ledger.json` — cùng data với .xlsx dạng JSON (columns + entries + sumDebit/sumCredit/balanced) — cầu "Claude trên Excel"
- Import: `POST /import/invoices.xlsx` (multipart field `file` hoặc JSON `{fileBase64}`) — parse xlsx, validate TẠI CỪA từng dòng (hiến pháp #4: loại bán/mua hợp lệ, đối tác bắt buộc, ngày hợp lệ ISO hoặc DD/MM/YYYY kiểu VN, số lượng/đơn giá > 0, TK phải tồn tại) — dòng lỗi trả danh sách lỗi tiếng Việt kèm SỐ DÒNG chính xác, KHÔNG tạo rác; dòng hợp lệ tạo invoice qua `createInvoice` hiện có (postGL tự động, Σ Nợ = Σ Có); audit `acc.import_invoices` kèm count created/errors
- Web /accounting: nút "Xuất Excel" (dropdown 4 báo cáo, download thật qua fetch+blob) + nút "Nhập hóa đơn từ Excel" (file input .xlsx → upload multipart → hiển thị N thành công/M lỗi kèm chi tiết từng dòng)
- G6 tài liệu module = giáo trình Tiểu Tâm (quy chuẩn ⑧): mỗi module trong modules/{accounting,chat,crm,hr,inventory,notification,om} có `docs/GUIDE.md` chuẩn thống nhất (Giới thiệu · Chức năng bảng endpoint+quyền+mô tả · Hướng dẫn sử dụng theo UI · Ví dụ hỏi Tiểu Tâm · Changelog) — nội dung viết ĐÚNG theo code thật (đọc routes thật, không bịa); accounting kỹ nhất (M0 mặc định)
- Manifest mỗi module thêm trường `"docs": "docs/GUIDE.md"`
- `packages/tieu-tam/src/docs.ts` mới: `loadModuleDoc(s)()` đọc + parse GUIDE.md (summary/steps/examples/raw), **cache Map — chỉ đọc file 1 lần/process**; `answerFromDocs()` token-overlap chọn module + ví dụ/bước khớp câu hỏi
- `assembler.ts` buildWorkProfile thêm `moduleDocs: ModuleDoc[]` vào WorkProfile (accounting LUÔN có trong docIds — M0 mặc định kể cả chưa mua module khác)
- `intent.ts` thêm intent `help` (từ khóa "làm sao/hướng dẫn/cách tạo…"); `adapters.ts` stub trả lời help TỪ GIÁO TRÌNH THẬT qua `answerFromDocs` (không bịa); live adapter system prompt thêm "Bản đồ năng lực" từ moduleDocs
- Gate quy chuẩn: `scripts/audit-module-docs.mts` — kiểm manifest.docs + file tồn tại + đủ 5 mục bắt buộc + bảng Chức năng có cột Endpoint + ≥ 2 ví dụ hỏi Tiểu Tâm; thiếu → exit 1 (CI gate) — **PASS 7/7 module**
- Test mới services/api/src/v7a-p4.test.ts: 35 asserts (export 4 xlsx + JSON đúng content-type/parse lại được/đúng số dòng/tổng tiền, org isolation export, import hợp lệ tạo invoice + GL cân, import mixed báo đúng số dòng lỗi không tạo rác, file rác/thiếu file không crash, audit acc.import_invoices, loadModuleDocs 7/7, answerFromDocs đúng module+bước thật, buildWorkProfile mang moduleDocs, engine stub + HTTP /tieu-tam/chat trả lời "làm sao tạo hóa đơn"/"xuất Excel" TỪ DOCS THẬT); typecheck 13/13 PASS; pnpm test 12/12 packages xanh; audit-module-docs 7/7 PASS; audit-buttons 0 nút chết

## Mạch V7A-P3 (VÒNG KINH TẾ KHÉP KÍN: item system + kho chứa + use effects + store vật phẩm — mới nhất)
- G3+G4 đóng "mắt xích đứt" spec §04: Ví NaraPoint (Om) → Cửa hàng → Kho chứa → Sử dụng → hiệu ứng THẬT thấy được
- Migration 0006: item_catalog (TOÀN CỤC không org_id — danh mục bán; code unique, category food/decor/boost CHECK, price, effect jsonb, icon, active) + user_items (org_id NOT NULL + user_id + item_code ref + qty>0 CHECK, unique (org,user,code) — tenant isolation hiến pháp #1) + tt_soul_state.theme (default 'jade')
- Seed 6 vật phẩm: Bánh Mochi (food 30 Om, feed +20) · Trà Ô Long (food 50, +35) · Hạt Dẻ Nướng (food 15, +10) · Pin Sạc Đầy (boost 120, recharge_full) · Theme Hổ Phách (decor 200, theme gold) · Theme Sage (decor 200, theme sage)
- Store mở rộng (G4): GET /api/v1/store/items (catalog) + POST /store/items/:code/buy — trừ Om THẬT qua ledger trong db.transaction (hiến pháp #5: chặn thiếu tiền 409 "Không đủ Om (cần X, có Y)", thiếu tiền → KHÔNG vào kho, số dư giữ nguyên), mua lại → gộp qty+1, audit store.item_purchase
- Kho chứa (G3): GET /api/v1/inventory-items (join catalog — info ĐẦY ĐỦ tên/mô tả/category/effect, LUÔN filter org+user) + POST /inventory-items/:id/use — hiệu ứng THẬT: feed_energy → feedEnergy() trả energyBefore/After + message "Tiểu Tâm ăn Bánh Mochi, năng lượng +20 (45→65) 🦊"; recharge_full → rechargeFull() = 100; decor → setTheme() lưu tt_soul_state.theme; trừ qty, hết → xóa row; use đồ không sở hữu / org khác → 404; audit item.use (kèm effect + energy trước/sau)
- packages/tieu-tam: SoulState + theme, setTheme() mới; GET /tieu-tam/state trả thêm theme
- Web: trang /items (grid vật phẩm sở hữu, tap → sheet info đầy đủ + nút Sử dụng → toast hiệu ứng + energy pill update + theme đổi màu NGAY); /modules thêm section "Vật phẩm" (icon/giá Om/mô tả/nút Mua + link Kho của tôi); lib/theme.ts (jade/gold/sage — đổi accent var toàn app, cache localStorage, Shell sync từ server); home thêm nút túi đồ → /items; icon mới bag/cake/leaf/battery/palette
- Test v7a-p3.test.ts: 29 asserts (catalog seed, thiếu tiền 409 + không vào kho, trừ Om chính xác tuyệt đối 4 lần mua, audit đúng org+user, tenant isolation kho + use 404, food +đúng amount BETA_MODE=false, recharge 100, decor theme lưu bền, qty giảm/xóa, vòng khép kín org B độc lập); typecheck 13/13; pnpm test 12/12 xanh; audit-buttons 0 nút chết

## Mạch V7A-P2 (TRÁI TIM: hồn tách động cơ + mood/energy)
- G1 hồn tách động cơ: migration 0005 tt_memories (kind fact/person/topic/summary/preference, salience, index org+user, CHECK kind) + tt_soul_state (mood/energy/engine per org+user, PK org+user)
- Memory Store (packages/tieu-tam/memory.ts): remember (dedupe cùng org+user+kind+content) / recall (ILIKE, tenant filter LUÔN) / getProfile; trí nhớ TEXT THUẦN — không format provider nào (hiến pháp #8)
- Học chảy ngược về hồn: extractFacts heuristic VN (tên user/dự án/sở thích) → learnFromMessage best-effort sau mỗi lượt chat
- Persona = DATA trung lập (persona.ts): xưng "em", tone, principles — adapter tự render, KHÔNG khắc vào prompt model nào
- Context Assembler (assembler.ts): buildWorkProfile(db, orgId, userId) — MỘT cổng duy nhất → {persona, memories, moduleMap, mood, energy, status, engine}
- EngineAdapter registry (adapters.ts): stub-a / stub-b (2 variant chứng minh swap) + openai + anthropic (key từ env, model qua OPENAI_MODEL/ANTHROPIC_MODEL); đổi model = gạt công tắc PATCH /api/v1/tieu-tam/engine (validate + audit tieu_tam.engine_change from/to)
- G2 energy (energy.ts): 0-100, nhẹ -2 / nặng -5 (nặng = intent nghiệp vụ), regen lazy +1/phút theo updated_at (không cron), feedEnergy(amount) + rechargeFull() hook sẵn cho P3
- 4 trạng thái: Tràn đầy >70 · Ổn định 30-70 · Mệt 10-30 (gợi ý nghỉ nhẹ nhàng) · Kiệt sức <10 (từ chối việc nặng "em mệt rồi, cho em nghỉ chút hoặc cho em ăn gì đó nha", vẫn chat nhẹ)
- BETA_MODE env (default true): energy hiển thị nhưng không bao giờ cạn/từ chối — test cả 2 mode
- API: GET /api/v1/tieu-tam/state {mood,energy,status,statusLabel,statusMessage,engine,betaMode}; SSE chat/stream thêm event `energy` tick đầu stream; buildTieuTamRoutes({db,requireAuth,audit}) deps-injection (legacy tieuTam stub giữ cho audit script cũ)
- Web Shell.tsx: Tiểu Tâm sheet + energy bar (màu theo trạng thái) + mood emoji + % — fetch /state khi mở, cập nhật live từ SSE energy event
- TEST SWAP (chuẩn nghiệm thu #1) PASS: remember facts ("tôi tên Khoa", "dự án Citadel tới bước Phase 2") qua stub-a → gạt sang stub-b → hỏi lại CÙNG bộ câu → fact "Khoa"/"Phase 2" NHẤT QUÁN tuyệt đối, persona xưng "em" không đổi, trí nhớ vẫn text thuần
- Test: soul.test.ts 47 asserts + v7a-p2.test.ts 16 asserts (swap qua HTTP + audit + SSE energy + kiệt sức + beta); typecheck 13/13; pnpm test 12/12 xanh

## Mạch V7A-P1 (Nền móng hardening)
- Audit log G8: migration 0004 chuẩn hóa audit_logs (user_id/resource/resource_id/detail/ip + index org+created); audit service best-effort (không gãy nghiệp vụ); ghi vết: auth.login, module purchase/activate/deactivate, om topup/spend, acc invoice/payment create + voucher cancel, hr leave approve/reject, security bind, user role change
- GET /api/v1/audit-logs: chỉ owner/super_admin, LUÔN filter org từ JWT (tenant isolation), filter ?action + limit ≤ 200
- Progressive security lớp 2 G5: users.email/phone/security_level; POST /me/bind-email + /me/bind-phone (validate format VN, nâng lớp 2); GET /me trả securityLevel + needsUpgrade (ví Om > 0 mà lớp < 2)
- Gate nhạy cảm: chi Om > 1000 (POST /om/spend mới) · đổi role (PATCH /users/:id/role mới, owner+) · hủy phiếu thu/chi → đòi lớp 2, 403 kèm hướng dẫn tiếng Việt
- Web Settings + mục "Bảo mật": hiện lớp hiện tại, banner needsUpgrade, form gắn email/SĐT gọi API thật, thông báo thành công/lỗi tiếng Việt
- G10 rà nút sống: scripts/audit-buttons.mts (quét onClick rỗng/TODO/href=#/button không handler) — 0 nút chết
- Test v7a-p1: 17 asserts (audit đúng org + không lộ org khác, staff 403, bind nâng lớp, gate 403 lớp 1/pass lớp 2, needsUpgrade); typecheck 13/13; pnpm test 12/12 packages xanh

## Mạch V7A-P0
- Fork nền V8 (/opt/NewCitadelV21) → repo citadel-v7a, loại node_modules/.env/dist, secret-scan sạch
- PLAN-V7A.md: gap analysis 10 điểm vs spec v5.1, lộ trình 7 phase, 9 chuẩn nghiệm thu
- Module M0 Kế Toán kế thừa nguyên vẹn (GL sổ kép, chart VN TT133, invoice, knock-off, báo cáo)

## Mạch V8
- HR rà lại: 28+3 edge PASS — đầy đủ scope; biên còn lại (ghi nhận, chưa làm): payroll, holiday list, cancel đơn đã duyệt hoàn dư
- CRM fix 3 lỗi "add không dùng được": nuốt lỗi → msg rõ + không đóng form khi lỗi; thiếu gate → ModuleLocked; thêm danh sách Khách hàng; parse "22,5/22tr"
- Accounting (192 doctypes → port 5 bảng): acc_accounts (chart VN TT133 rút gọn 14 TK) / acc_vouchers / acc_gl_entries (bất biến, CHECK Nợ XOR Có) / acc_invoices / acc_payments
- Engine: postGL transaction (Σ Nợ = Σ Có, chặn TK nhóm), invoice→GL tự động, payment knock-off (partly/paid, chặn vượt nợ), cancel = bút toán đảo (invoice đã thu → chặn; payment hủy → hoàn nợ)
- Reports từ GL: general-ledger lũy kế, trial-balance (balanced flag), profit-loss, party outstanding
- Catalog 8 module (+Kế Toán 500 Om nhóm Tài chính); web /accounting 3 tab (Thu Chi · Công nợ · Báo cáo, auto-seed chart); Tiểu Tâm +intent finance (đặt TRƯỚC revenue vì 'lãi' trùng)
- Test acc: 36 asserts; audit-endpoints 76/76; journey 41/41
# (lịch sử) V7 — HR v2 (FORK frappe/hrms)
## Mạch V7 (chốt fork Nhân sự)
- Deepdive hrms thật (clone): 118 doctypes; port 4 doctype lõi → 5 bảng (employees/attendance/leave_types/allocations/applications), migration 0002_hr_v2.sql
- Logic port: late_entry theo giờ ca, 1 attendance/người/ngày, working_hours khi check-out, phép paid phải allocate + đủ dư (chặn sớm lúc nộp + re-check lúc duyệt), duyệt → trừ used_days + markOnLeave từng ngày (không đè ngày có check-in), reject không trừ, không lương không cần allocation
- 14 endpoint mới (tổng HR: 17); Tiểu Tâm +2 intent (attendance/leave); web /hr 3 tab (Chấm công · Ca làm · Nghỉ phép)
- FIX deploy.sh: loop từng file migration (bug ambiguous redirect khiến 0002 không chạy)
- Test hr-v2: 23 asserts; audit-endpoints 61/61; user-journey 33/33
# (lịch sử) v6.1 — DÙNG ĐƯỢC THẬT (user-journey verified)
## Mạch v6.1 (feedback dùng thử của Mỗ)
- Kho: PATCH /items/:id (sửa tên/đơn vị/ngưỡng); UI form tạo đủ Tên/SL/Báo≤, nhãn rõ "báo khi ≤ X · sửa" (chạm sửa ngưỡng), chú thích "không phải giới hạn"; test qty→1000
- Nhân sự: UI form TẠO CA (tên/ngày/giờ) + nút Xếp người (prompt) + chạm chip gỡ người
- CRM: nút + Deal / + Khách với form mini (POST endpoints sẵn)
- user-journey.mts: 23/23 bước hành trình người-dùng-thật PASS (giữ trong repo)
- audit-endpoints: 47/47
# (lịch sử) v6 — MODULE ECONOMY HOÀN CHỈNH
## Mạch v6 (mới nhất)
- Module Registry: catalog 7 (chat/notif/om core · crm/inventory/hr paid · pos coming), org_modules table, purchase trừ Om THẬT, activate/deactivate, requireModule gate 403
- Module mới THẬT: inventory (items/qty/low-stock 6/6) + hr (shifts/staff 5/5)
- super_admin role (rank 100) + migration 0003 + seed v6: 3 token (SUPER_ADMIN/OWNER/MANAGER) + 99999 Om + data 6 module
- Web 12 routes: +/modules (shop mua/bật/tắt) +/inventory +/hr; nav CRM→Module; bút chì chat → modal tạo phòng thật (GET /users + POST rooms)
- CRM web: tap deal → PATCH stage thật (optimistic+rollback) — đóng gap cuối với prototype v5
- AUDIT 46/46 PASS (gate flow sống: 403→mua→200→tắt→403→bật→200)
## Mạch v2.1 (mới nhất — sau khi Mỗ deploy thấy thiếu màn)
- Web thêm /notifications (read/read-all UI thật) + /search (debounce 300ms) → 9 routes, NGANG prototype v5
- Home: chuông notif badge unread + nút search
- seed: + 3 notifications demo
- AUDIT ENDPOINT: scripts audit-endpoints.mts — 30/30 PASS (26 HTTP + WS + sec 401/403/429), giữ trong repo để chạy lại
- /api/v1/me xác nhận có trong api thật; tsconfig exclude *.mts
## Mạch AUDIT + UPGRADE (mới nhất)
- AUDIT: tìm 2 lỗi P0 (KHÔNG CORS → browser bị chặn; web Dockerfile COPY cú pháp invalid) + UI gap 35/100
- U.1: CORS (preflight 204 verify) + Dockerfile fix ✓
- U.2-U.7: UI tổng lực taste-applied — design system (globals.css tokens, 24 SVG icons, living core, avatar mesh), 7 trang: Login đẹp, Home (pulse+bento+data thật), Chat (style mới, real-time giữ), CRM (kanban), Om (wallet), Settings + **Tiểu Tâm sheet SSE stream** (tính năng chủ đạo, trước đó THIẾU)
- P2: notification test cố định 3/3 ✓
- Final: typecheck 10/10, test 9/9 packages, web build 7 routes ✓
## (lịch sử M0→M6 giữ nguyên bên dưới)
## Tất cả mạch xong
- M0 nền + M1 Auth/tenant → ZIP#1
- M2 Tiểu Tâm + M3 Chat → ZIP demo
- M4 notification/dashboard + M5 CRM/Om → ZIP trial
- M6 production: env validation, /ready, Dockerfiles multi-stage non-root healthcheck, CI GitHub Actions, docs (API/User/Dev), test cố định 6 package, multi-review 90/100 → ZIP FINAL (citadel-v2.zip)
## Chất lượng cuối
- Full typecheck 10/10 packages ✓
- pnpm -r test xanh (core/db/tieu-tam/ws/crm/om) ✓
- Next build 4 routes ✓
- Multi-review 90/100 (sửa 2 lỗi: dashboard onError, seed escape)
- ~165 assertion tổng, verify chạy thật suốt
## Hardening (đã làm — đóng điểm trừ review)
- Rate-limiting middleware (sliding window) — login chống brute-force, 8/8 test ✓
- Integration test (API→ws→client) vào CI — pnpm -r test 8 package xanh ✓
- Multi-review sau hardening: 94/100 (Security 96 · Arch 90 · Reliability 95)
## Nếu mở rộng tiếp (gợi ý, chưa làm)
- Redis bus cho multi-node | integration test vào CI | thêm module POS/Inventory/Finance theo khuôn | mobile Expo | LLM live integration thật
## Key (giữ nguyên)
- pnpm ONLY | esbuild@0.24.0 override | @types/node mọi pkg
- build*Routes({db,emit?,requireAuth}) deps injection | sub-app onError riêng | route '/' = '/prefix'
- LLM stub↔live cùng interface | org từ JWT không từ body
- deploy: bash deploy.sh
