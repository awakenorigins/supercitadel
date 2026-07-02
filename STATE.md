# Citadel Build — State: V7A — Repo chuẩn hóa từ nền V8 (2026-07-02)
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
