# SUPERCITADEL R9 + R10 — MODULE LOADER FULL STRICT + OUTBOX (brief đầy đủ, dùng cho resume — CHẠY TỚI FINAL R10)

Repo: /root/.openclaw/workspace/supercitadel · Next.js apps/web (CSS tokens DS v2, KHÔNG tailwind) · Hono API services/api + modules/* · pnpm monorepo.
Live: https://supercitadel.62.146.238.213.sslip.io (docker compose -p supercitadel; KHÔNG sửa /etc/caddy/Caddyfile).
GitHub: NachaFromMars/supercitadel (main). Release mới nhất: v8.5.0.

LỆNH ANH NẤNG (msg 10259, 05/07/2026): "Tiến hành tới final R10 luôn, đảm bảo update luôn cả github, release, audit kỹ chắc chắn tất cả hoàn hảo, đầy đủ chỉnh chu."
DIRECTIVE R8 (còn hiệu lực): module_loader R9 = "FULL tự động + STRICT validate — sai chuẩn manifest = từ chối nạp". R10 = outbox — NỀN để module kho anh Nấng tự build cắm vào.

QUY TẮC BẤT DI:
- Commit sau MỖI phase, prefix "SUPERCITADEL-R9:" hoặc "SUPERCITADEL-R10:". typecheck + pnpm -r test + build PASS trước commit.
- KHÔNG thêm dependency mới. KHÔNG commit/print secret.
- KHÔNG ĐỤNG logic modules/inventory (anh Nấng tự build module kho riêng) — manifest inventory được chuẩn hóa field như mọi module, KHÔNG đổi logic server/schema.
- AUDIT KỸ: mọi claim có bằng chứng chạy thật (test output, curl live, CI conclusion, GitHub API). Không đoán, không chốt sớm.
- Resume = git log + R9-R10-STATE.json → phase kế. Update STATE sau mỗi phase.
- Push: set -a; source ~/.config/tt-github/env; set +a; git -c credential.helper='!f() { echo "username=x-access-token"; echo "password=$GH_TOKEN"; }; f' push https://github.com/NachaFromMars/supercitadel.git master:main
- Curl live JWT: file trung gian /tmp/*.json. Tag release: GitHub từ chối "r8.5.0" trước đây → dùng vX.Y.Z (v9.0.0, v10.0.0).

BỐI CẢNH CODE (khảo sát 05/07):
- 7 modules có manifest.json (accounting/chat/crm/hr/inventory/notification/om): id, name, version, tier, priceOm, icon, description, permissions (dạng cũ "accounting:read"), routes, docs.
- services/api/src/modules/catalog.ts = catalog HARDCODE "khớp manifest từng module" (nguồn sự thật trùng lặp — mồi lệch).
- services/api/src/index.ts import route builders TĨNH từng module (buildXxxRoutes) — chưa có loader tự động.
- R8.5 đã có PERMISSION_REGISTRY (module.resource.action) + requirePermission trong packages/core + middleware.
- MODULE-FORGE-GUIDE.md (docs/) mô tả contract module plug-and-play 6 bước — R9 phải làm contract này THẬT + STRICT.
- audit-module-docs.mts gate docs 7/7; acceptance-v7a.mts 9/9.

════════════════════════════════════════════
## R9 — MODULE LOADER FULL STRICT
════════════════════════════════════════════

### Phase R9-A — Manifest schema chuẩn + validator (packages/core)
1. `packages/core/src/manifest.ts`: type `ModuleManifest` chuẩn v2 — bắt buộc: id (^[a-z][a-z0-9-]*$), name, version (semver), tier (core|paid|demo|custom), priceOm (number ≥0), icon, description, routes (prefix ^/api/v1/), docs (path), permissions (array key khớp PERMISSION_REGISTRY format module.resource.action — MIGRATE 7 manifest từ dạng cũ "accounting:read" sang dạng mới, thêm entry tương ứng vào PERMISSION_REGISTRY nếu thiếu); optional: dependsOn (array module id), engine (semver range API contract, vd "^1.0.0").
2. `validateManifest(raw): { ok: true, manifest } | { ok: false, errors: string[] }` — pure function, message lỗi tiếng Việt rõ ràng từng field. STRICT: field lạ không khai báo → warning list; field bắt buộc thiếu/sai kiểu/sai format → error → từ chối.
3. Unit test manifest.test.ts: valid pass, từng loại lỗi bị bắt đúng (id hoa, version rác, tier lạ, priceOm âm, permissions sai format, dependsOn không tồn tại — check ở loader).
4. Cập nhật 7 manifest.json theo schema v2 (chỉ data — không đổi logic module). Commit.

### Phase R9-B — Loader FULL tự động (services/api)
1. `services/api/src/modules/loader.ts`: đọc thư mục modules/* lúc boot → parse manifest.json → validateManifest STRICT:
   - Manifest lỗi → TỪ CHỐI NẠP module đó: log lỗi tiếng Việt rõ (module nào, field nào, vì sao), ghi vào danh sách `rejectedModules`, KHÔNG crash server, các module hợp lệ vẫn chạy.
   - dependsOn: module phụ thuộc module bị reject/không tồn tại → cũng reject kèm lý do dây chuyền.
   - Hợp lệ → build catalog TỰ ĐỘNG từ manifest (XÓA catalog hardcode trong catalog.ts — 1 nguồn sự thật duy nhất), mount route builder. Route builders vẫn import tĩnh (Node ESM + tsc — KHÔNG dùng dynamic require rủi ro), nhưng map { moduleId → builder } tập trung 1 chỗ trong loader; manifest quyết định module nào ĐƯỢC mount. Module có manifest nhưng thiếu builder trong map → reject "chưa đăng ký route builder".
2. Endpoint `GET /api/v1/modules/loader-status` (owner+): loaded[] (id, version, routes) + rejected[] (id, errors) — để admin thấy module nào bị từ chối vì sao.
3. Boot log tiếng Việt gọn: "✅ Nạp 7 module · ❌ Từ chối 0".
4. Test v9.test.ts: (a) loader nạp đủ 7 module thật, catalog === manifest data; (b) manifest hỏng (fixture tmp hoặc inject) → bị reject đúng lý do + server các module khác vẫn 200; (c) dependsOn dây chuyền; (d) loader-status đúng shape + staff 403; (e) catalog cũ không còn hardcode (mọi field từ manifest).
5. Script gate `scripts/audit-manifests.mts`: validate 7 manifest + permissions khớp PERMISSION_REGISTRY → exit 1 nếu fail. Thêm vào CI ci.yml sau audit-module-docs. Commit.

### Phase R9-C — MODULE-FORGE-GUIDE update + verify + release R9
1. docs/MODULE-FORGE-GUIDE.md: cập nhật contract theo schema v2 + STRICT rules + ví dụ manifest chuẩn + bảng lỗi thường gặp (cho AI/dev ngoài forge module — và cho module kho anh Nấng sau này).
2. STATE.md thêm mạch R9. README highlight loader strict.
3. Full verify: pnpm -r typecheck/test/build · acceptance 9/9 · audit-buttons · audit-manifests · audit-module-docs.
4. Deploy live + verify-r9.py THẬT: GET /modules catalog đủ 7 từ manifest, loader-status owner 200/staff 403, mọi module route sống (accounting/crm/hr/om 200), nghiệp vụ cũ không gãy (login + chat + 1 action).
5. Secret scan → commit → push → release v9.0.0 ("R9 — Module Loader FULL strict") → CHỜ CI Actions SUCCESS thật. Update STATE.

════════════════════════════════════════════
## R10 — OUTBOX (nền cho module kho anh Nấng cắm vào)
════════════════════════════════════════════
Mục tiêu: event outbox pattern chuẩn — nghiệp vụ ghi event TRONG CÙNG transaction với data; dispatcher đọc outbox → phát cho subscriber (WS/notification/module khác). Module kho anh Nấng sau này chỉ cần subscribe event + emit event theo contract, KHÔNG đụng core.

### Phase R10-A — Outbox core
1. Migration mới packages/db: bảng `outbox_events` (id uuid pk default, org_id uuid NOT NULL, topic varchar(64) NOT NULL — format module.entity.verb vd accounting.invoice.created, payload jsonb NOT NULL, created_at timestamptz default now(), dispatched_at timestamptz NULL, attempts int default 0, last_error text NULL; index (dispatched_at, created_at) partial WHERE dispatched_at IS NULL + index org_id).
2. `packages/core/src/outbox.ts` (hoặc packages/db): `emitEvent(tx, { orgId, topic, payload })` — GHI TRONG TRANSACTION đang mở của nghiệp vụ (tham số tx bắt buộc — không tự mở connection); validate topic format.
3. Dispatcher trong services/api (KHÔNG service mới — chạy interval trong process API, setInterval ~2s): claim batch (SELECT ... WHERE dispatched_at IS NULL ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED trong tx) → gọi handlers đăng ký theo topic pattern (exact + wildcard module.*) → thành công đánh dấu dispatched_at; lỗi → attempts+1 + last_error, retry backoff (bỏ qua tới lượt sau; attempts ≥ 5 → để nguyên, hiện trong dead-letter view). Graceful: lỗi handler KHÔNG giết dispatcher.
4. Registry subscriber: `subscribeOutbox(topicPattern, handler)` — wire 2 subscriber THẬT chứng minh flow: (a) notification: accounting.invoice.created → tạo notification "Hóa đơn mới X đ cho Y" cho org; (b) WS broadcast qua publishEvent chat/emit sẵn có (topic tt.* hoặc module event → đẩy realtime).
5. Emit event thật từ nghiệp vụ hiện có (TRONG transaction): accounting createInvoice → accounting.invoice.created; createPayment → accounting.payment.created; om spend/topup → om.wallet.spent/topped_up; hr checkIn → hr.attendance.checked_in. (KHÔNG emit từ inventory — module kho anh Nấng tự làm sau theo contract.)
6. API admin: GET /api/v1/outbox/events?status=pending|failed|dispatched (owner+, org-scoped, limit ≤100) — quan sát + debug; GET /outbox/stats (đếm theo status).
7. Test v10.test.ts: emit trong tx rollback → KHÔNG có event (atomicity!); commit → có; dispatcher dispatch đúng handler + notification row thật; handler throw → attempts tăng + last_error + KHÔNG dispatched + không giết dispatcher; wildcard subscribe; org isolation API; staff 403. Commit.

### Phase R10-B — Contract cho module ngoài + manifest hook
1. Manifest v2 thêm optional `events: { emits: string[], subscribes: string[] }` — validator check format topic; loader đọc subscribes → auto-wire vào registry (module khai báo trong manifest + export handler theo contract `server/events.js` export `eventHandlers: Record<topic, handler>`). Chứng minh bằng notification module dùng đúng contract này (dogfood).
2. docs/MODULE-FORGE-GUIDE.md: mục "Sự kiện Outbox" — cách module ngoài emit/subscribe, contract file events.js, quy tắc topic, atomicity, retry semantics. Đây là phần anh Nấng cần để cắm module kho.
3. Test: module manifest khai subscribes → handler được gọi khi event phát. Commit.

### Phase R10-C — FINAL verify + docs + release R10 (CHỈNH CHU TOÀN CỤC)
1. Full gates: pnpm -r typecheck/test/build · acceptance 9/9 · audit-buttons · audit-manifests · audit-module-docs · secret scan.
2. Deploy live (migration outbox vào DB live qua migrate runner) + verify-r10.py THẬT: tạo hóa đơn qua API → poll outbox stats/notification xuất hiện trong ≤10s → WS/notification nhận; GET /outbox/events owner 200 + staff 403; regression: login/chat/dry-run R8.5/permissions vẫn PASS.
3. Docs final: STATE.md mạch R10, README cập nhật kiến trúc (loader strict + outbox + bảng release đến v10), docs/API.md endpoints mới, SECURITY.md nếu chạm.
4. Push → release v10.0.0 ("R10 — Outbox foundation") → CI SUCCESS thật.
5. TỔNG NGHIỆM THU CUỐI (audit kỹ toàn hệ): chạy lại verify-r8.py + verify-r85.py + verify-r9.py + verify-r10.py trên live — TẤT CẢ PASS; GitHub main HEAD = commit cuối, releases v9.0.0 + v10.0.0 tồn tại (check API), CI xanh. Ghi bảng evidence vào R9-R10-STATE.json, status=done.

BÁO CÁO CUỐI: bảng phase × evidence, link 2 release, CI runs, rủi ro còn lại, những gì chừa cho module kho anh Nấng.
