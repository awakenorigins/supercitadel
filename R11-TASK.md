# SUPERCITADEL R11 — NẠP MODULE NGOÀI ĐẦU TIÊN: KẾ TOÁN 10A (audit từng bước)

Repo: /root/.openclaw/workspace/supercitadel · Live: https://supercitadel.62.146.238.213.sslip.io (docker compose -p supercitadel; KHÔNG sửa /etc/caddy/Caddyfile).
Gói module đã giải nén + audit tĩnh vòng 1 PASS: /root/.openclaw/workspace/module-audits/ke-toan-10a/module-ke-toan-10a/

LỆNH ANH NẤNG (msg 10278): "đây là module đầu tiên, audit kỹ, xem đã tương thích nạp vào chưa, nếu rồi thì nạp vào, audit từng bước, audit sau khi nạp, kiểm tra xem Tiểu Tâm có hoàn toàn hiểu và thao tác toàn diện tất cả chức năng của Module Kế Toán 10A này được chưa? Nếu Mua và Bật lên thì sao, GIÁ BÁN 1000 Om, GIÁ THUÊ 150 Om = 30 ngày."

KẾT QUẢ AUDIT TĨNH VÒNG 1 (đã làm, main session):
- Manifest v2 hợp lệ strict loader (16 permissions module.resource.action, group Tài chính, engine ^1.0.0). LƯU Ý: priceOm trong gói = 700 → PHẢI ĐỔI 1000 theo lệnh anh Nấng.
- Contract đúng khuôn: server/{routes,service,schema,seed,tools,tieu-tam-actions}.ts là façade re-export từ src/; builder buildKeToan10aRoutes(deps) nhận db/requireAuth/gate/audit/reverseGate; schema Postgres riêng `ketoan10a` (KHÔNG đụng acc_*); org isolation dùng orgOf(c) từ JWT.
- 17 write-action k10a.* (permission/securityLevel/sensitive sẵn, khuôn dry-run R8.5) + 15 read-tools + detectK10aAction (regex đòi chữ "10a" — không giẫm acc.*).
- Deps: hono/drizzle-orm/xlsx/postgres/zod — ĐỀU đã có trong monorepo (KHÔNG dep mới). @hono/node-server ^1.19.14 vs host ^1.13.0 — chỉ dùng cho standalone server.ts, KHÔNG cần cho tích hợp (bỏ qua, không nâng).
- Secret scan sạch, không exec/curl/eval độc.
- Docs 12 file; INTEGRATION.md viết cho HEAD v10.0.1, 6 mối nối — ĐÂY LÀ NGUỒN CHÍNH. WIRING.patch là bản CŨ (tên 6A, catalog hardcode) — BỎ QUA.
- Tests trong gói: k10a.pglite.test.ts (PGlite 13 case) + tests/{run,integration,http,tieu-tam,store-flow}.ts.
- Migration: modules/ke-toan-10a/migrations/0000_init.sql SQL thuần idempotent tự tạo schema ketoan10a.

QUY TẮC BẤT DI:
- Commit sau mỗi phase, prefix "SUPERCITADEL-R11:". typecheck + pnpm -r test + build PASS trước commit. KHÔNG dependency mới. KHÔNG print/commit secret.
- KHÔNG đụng logic modules/inventory (module Kho hàng cũ) — không liên quan gói này.
- AUDIT KỸ TỪNG BƯỚC: sau mỗi mối nối chạy gate tương ứng ngay, evidence thật. Test cũ toàn bộ phải xanh.
- Update R11-STATE.json sau mỗi phase. Resume = git log + R11-STATE.json.
- Push: set -a; source ~/.config/tt-github/env; set +a; git -c credential.helper='!f() { echo "username=x-access-token"; echo "password=$GH_TOKEN"; }; f' push https://github.com/NachaFromMars/supercitadel.git master:main
- JWT live: /tmp/seed.txt = raw token → POST /api/v1/auth/login {token:raw} → field 'jwt'. Staff: /tmp/r85_staff_token.txt. Login rate-limit 429 nếu gọi dồn dập → spacing ~65s.
- Lệnh dài (pnpm -r test, docker build): nohup ghi log file + poll. Shell trả rỗng → canary pwd, chết thật thì update STATE + dừng sạch.

## Phase A — Copy + giá + registry quyền
1. Copy gói: /root/.openclaw/workspace/module-audits/ke-toan-10a/module-ke-toan-10a/ → modules/ke-toan-10a/ (TRỪ: package-lock.json, .env.example, web/ — web/page.tsx copy riêng → apps/web/app/ke-toan-10a/page.tsx; node_modules nếu có thì bỏ). Giữ nguyên src/, server/, docs/, migrations/, seed/, tests/, manifest.json, package.json, README.
2. GIÁ THEO LỆNH ANH NẤNG: manifest.json priceOm 700 → **1000**. Thuê 30 ngày phải = **150 Om** — RENT_PLANS chung là % (30 ngày = 25% → 250 Om ≠ 150) → thêm cơ chế override per-module: manifest v2 field optional `rentPlans?: Record<string, number>` (giá Om tuyệt đối theo ngày, vd {"30": 150}) — validate trong packages/core/src/manifest.ts (key phải là số ngày hợp lệ 7/30/90, value integer > 0); services/api/src/modules/routes.ts rent flow: nếu manifest có rentPlans[days] → dùng giá đó, không thì % như cũ; FE modules page hiện giá thuê đúng từ API (kiểm field trả về — orgState/catalog cần expose rentPlans hoặc rentPriceOm resolved). Test case: rent 30 ngày module ke-toan-10a trừ đúng 150 Om; module khác vẫn theo %.
3. Registry quyền: thêm 16 entry KE_TOAN_10A vào PERMISSION_REGISTRY (packages/core/src/permissions.ts) theo INTEGRATION.md mục 1 (level 2 + sensitive cho 13 action ghi nhạy cảm; budget.set/budget.read/report.read theo bảng trong docs). ROLE_PERMISSIONS: manager thêm 'ke-toan-10a.*'; staff thêm 'ke-toan-10a.report.read'.
4. pnpm install (workspace nhận modules/ke-toan-10a). Gates: pnpm --filter @citadel/core test + audit-manifests (PHẢI 8/8 OK gồm ke-toan-10a) + typecheck toàn repo. AUDIT: chạy test PGlite của module (pnpm --filter @citadel/module-ke-toan-10a test) 13/13. Commit "SUPERCITADEL-R11: Phase A copy module + pricing 1000/150 + permissions".

## Phase B — Wire loader + Tiểu Tâm actions + tools
1. loader.ts: import buildKeToan10aRoutes từ '@citadel/module-ke-toan-10a/server/routes.js' + entry builders map 'ke-toan-10a' theo INTEGRATION.md mục 2 (reverseGate: d.cancelGate).
2. tieu-tam/actions.ts: import keToan10aTieuTamActions + detectK10aAction theo INTEGRATION.md mục 3; defs.push(...); detectAction() đầu hàm thêm detectK10aAction. KIỂM: action k10a.* qua executeAction phải ăn đúng gate module active + RBAC + securityLevel + dry-run→confirm của host (KHÔNG bypass).
3. Read-tools: INTEGRATION.md mục 4 — đăng ký keToan10aTools vào toolRegistry của index.ts (đúng chỗ crmTools).
4. deploy.sh: thêm ke-toan-10a vào loop migrate.
5. docs gate: audit-module-docs phải PASS 8/8 (GUIDE.md của module đủ 5 mục — kiểm, thiếu thì bổ theo format host).
6. Gates: typecheck + FULL pnpm -r test (cũ + module mới) + build + audit-manifests + audit-module-docs + audit-buttons. Chạy tests/integration.ts + tests/tieu-tam.ts + tests/store-flow.ts của module trong context monorepo. Commit "SUPERCITADEL-R11: Phase B wire loader + tieu-tam actions + tools".

## Phase C — FE + tour
1. apps/web/app/ke-toan-10a/page.tsx từ gói web/page.tsx; pnpm --filter web typecheck + build; sửa import/token CSS nếu lệch (KHÔNG tailwind, CSS tokens DS v2).
2. Tutorial.tsx thêm tour '/ke-toan-10a' theo INTEGRATION.md mục 6.
3. Kiểm Cửa hàng: card Kế Toán 10A nhóm Tài chính, giá 1000 Om, nút thuê hiện 150 Om/30 ngày. audit-buttons 0 nút chết. Commit "SUPERCITADEL-R11: Phase C FE page + tour".

## Phase D — Deploy + AUDIT SAU NẠP trên live (trọng tâm lệnh anh Nấng)
1. Deploy: docker compose -p supercitadel up -d --build api web (nohup+poll). Migration 0000_init.sql của module áp DB live (qua deploy flow/migrate runner — verify bảng schema ketoan10a tồn tại thật).
2. verify-r11.py — kịch bản audit sau nạp ĐẦY ĐỦ trên live:
   a. Loader: GET /modules/loader-status (owner) → ke-toan-10a v1.0.0 trong loaded, rejected không có nó.
   b. Catalog: GET /modules → card đúng giá 1000 Om, group Tài chính.
   c. CHƯA MUA: gọi route module → 403 MODULE_INACTIVE; Tiểu Tâm action k10a → từ chối module chưa bật.
   d. MUA: nạp Om đủ → POST purchase 1000 Om → trừ đúng 1000, purchased=true, audit log; route module 200.
   e. Seed + nghiệp vụ qua API: setup TT133, tạo phiếu thu/chi, hóa đơn nhiều dòng + thuế, thu tiền knock-off, thử thu vượt nợ (phải chặn), Excel export.
   f. TIỂU TÂM TOÀN DIỆN: qua /tieu-tam/chat lần lượt các lệnh tự nhiên (đòi chữ 10a): "tạo phiếu thu 10a 2 triệu từ Anh Ba" → dry-run preview → confirm → vào sổ; phiếu chi; hóa đơn; thu tiền hóa đơn; hỏi số dư/báo cáo qua read-tools (ít nhất 5 read-tool khác nhau: số dư quỹ, công nợ, tuổi nợ, KQKD, cân đối thử); action nhạy cảm phải ra preview trước; staff gọi action bị RBAC chặn từ chối tiếng Việt.
   g. THUÊ: org test 2 (hoặc reset) → rent 30 ngày → trừ đúng **150 Om** → active với rentedUntil ≈ +30 ngày; hết logic thuê module khác vẫn % cũ (spot-check qua API pricing hiển thị).
   h. TẮT/BẬT: deactivate → 403 MODULE_INACTIVE mọi route module; activate lại → data nguyên vẹn.
   i. Regression: verify-r10.py + verify-r85.py vẫn PASS (spacing 65s tránh 429).
3. Screenshot Playwright: Cửa hàng card 10A (giá 1000/thuê 150) + trang /ke-toan-10a sau seed + 1 thẻ dry-run confirm trong chat. Lưu shots/.
4. Đánh giá "Tiểu Tâm hiểu toàn diện": đối chiếu 17 action + 15 tool với docs/ACTIONS.md + TIEU-TAM.md của module — bảng coverage action nào test rồi/kết quả; ghi vào R11-STATE.json + báo cáo.
5. Secret scan → commit "SUPERCITADEL-R11: Phase D live verify + shots" → push → release v11.0.0 "R11 — Module ngoài đầu tiên: Kế Toán 10A (1000 Om / thuê 150 Om 30 ngày)" → CHỜ CI Actions SUCCESS thật. STATE.md mạch R11 + README bảng release. Update R11-STATE.json status=done.

BÁO CÁO CUỐI: bảng 6 mối nối × evidence + bảng coverage 17 action/15 tool + kết quả mua/thuê/tắt-bật + link release + CI + rủi ro còn lại.
