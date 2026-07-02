# Citadel Build — State: V7A — Repo chuẩn hóa từ nền V8 (2026-07-02)
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
