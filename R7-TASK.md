# SUPERCITADEL R7 — README/docs full update + MODULE COMPANY (brief đầy đủ, dùng cho resume)

Repo: /root/.openclaw/workspace/supercitadel · Next.js apps/web (CSS tokens DS v2 globals.css, KHÔNG tailwind) · Hono API services/api + modules/* · pnpm.
Live: https://supercitadel.62.146.238.213.sslip.io (docker compose -p supercitadel; KHÔNG sửa /etc/caddy/Caddyfile).
QUY TẮC: commit sau MỖI phase (prefix "SUPERCITADEL-R7:"), typecheck+build pass trước commit. KHÔNG thêm dependency mới. KHÔNG commit/print API key. Đọc design-refs/INDEX.md + source thật trước khi port UI. Resume = đọc git log → phase kế.

Lệnh anh Nấng (msg 9526): (1) update GitHub full — README + release + các file liên quan; (2) build Option + Module Company: chọn Add → menu điền thông tin công ty (chuẩn theo docs/Mo-Ta-Cong-Ty-Form.txt) → bảng chấp nhận điều khoản (tự soạn, beta) → Accept → Add → Popup Tiểu Tâm "đã nhận Mod Module Company của [tên công ty]" + Loading → CHỪA CHỖ để build module riêng gắn vào sau. Thiết kế tuyệt đối thông minh, đẹp, xịn, sang.

## Phase A — README + docs update
1. Viết lại README.md chuyên nghiệp (tiếng Việt, có badge shields git/release): giới thiệu SUPERCITADEL (pháo đài quản trị doanh nghiệp Việt), kiến trúc (Next.js + Hono + Postgres + Redis + WS, monorepo pnpm), 9 module catalog (core: chat/notification/om · paid: crm/inventory/hr/accounting · demo: automato-secretary · coming: pos), tính năng nổi bật theo release: v7a nền tảng → r3 rental+OwnedBar+landing → r4 2-col+polish → r5 tutorial+item confirm → r6 Tiểu Tâm Sonnet 4.6 action layer (13 actions, bảng ví dụ lệnh), beta open access, hướng dẫn deploy (deploy.sh + compose + env bảng đầy đủ gồm LLM_*), token seed, cấu trúc thư mục, script audit (audit-endpoints 92/92, acceptance 9/9, audit-buttons), link R5-AUDIT.md + R6-AUDIT.md.
2. docs/: đảm bảo Mo-Ta-Cong-Ty-Form.txt + pdf được nhắc trong README (mục Module Forge cho công ty riêng).
3. Commit + push.

## Phase B — Backend Module Company
1. Migration mới packages/db/migrations/0009_company_module.sql: bảng company_module_requests (id uuid pk, org_id uuid not null, company_name text not null, payload jsonb not null — toàn bộ form, status varchar(16) default 'received' — received|reviewing|building|delivered, terms_accepted_at timestamptz not null, created_by uuid, created_at timestamptz default now()); index org_id.
2. services/api: POST /api/v1/company-module/requests (requireAuth; validate company_name + payload các field bắt buộc; lưu; audit log 'company_module.request' detail {companyName}; trả request + message chào), GET /api/v1/company-module/requests (list của org, owner/manager+), GET /:id (chi tiết). Tenant isolation từ JWT.
3. Catalog GET /modules: thêm entry 'company-module' (name 'Module Company', icon building/briefcase, desc 'Module quản trị may đo riêng cho công ty của bạn — mô tả doanh nghiệp, đội Citadel forge và gắn thẳng vào pháo đài', tier 'custom', group 'May Đo Doanh Nghiệp', status 'open', priceOm 0 hiển thị 'Báo giá sau khi nhận hồ sơ'). FE nhận diện tier custom → nút "Add" thay Mua/Thuê.
4. Test: POST tạo request lưu đúng org + audit log, thiếu company_name → 400, GET list chỉ thấy org mình.

## Phase C — FE Module Company wizard (TRỌNG TÂM — đẹp xịn sang)
Đọc design-refs/INDEX.md trước; tham khảo originui stepper + form variants, kokonutui polish; port sang CSS tokens.
1. Card "Module Company 🏢" trong Cửa hàng nổi bật hơn card thường: viền gradient động (border-beam concept CSS thuần), badge "MAY ĐO", nút "＋ Add Module Company".
2. Bấm Add → mở WIZARD FULL-SHEET nhiều bước (component apps/web/components/CompanyModuleWizard.tsx), progress bar bước 1/5 → 5/5, transition mượt giữa bước, mỗi bước validate mới cho Tiếp:
   - Bước 1 · Thông tin chung: Tên công ty*, Kinh doanh gì*, Bán cho ai/thu tiền kiểu gì, Văn hóa/đặc thù, Tổng nhân viên, Số chi nhánh
   - Bước 2 · Phòng ban & phân quyền: textarea phòng ban (placeholder gợi ý "Kinh doanh: tìm khách, chốt đơn…"), Ai được thấy gì
   - Bước 3 · Vận hành ⭐: Một vòng công việc (textarea lớn, hint "kể như dặn nhân viên mới"), Điểm đau thủ công
   - Bước 4 · Dữ liệu & Module: Cần quản gì, Báo cáo muốn xem, tick module dùng chung (Kế toán/CRM/Kho/Nhân sự/Chat — checkbox pill đẹp), Việc giao Tiểu Tâm AI
   - Bước 5 · Ưu tiên: Tính năng PHẢI CÓ đợt đầu, Điều CẤM KỴ → Xem lại tóm tắt hồ sơ (summary card gọn từng khối)
3. Sau bước 5 → màn ĐIỀU KHOẢN BETA (tự soạn ~8-10 điều, giọng chuyên nghiệp thân thiện): dịch vụ may đo đang beta; hồ sơ dùng để thiết kế module; dữ liệu thuộc org, cô lập tenant, không chia sẻ; thời gian forge sẽ báo sau khi đội Citadel review; giá Om báo sau khi phân tích hồ sơ; có thể được liên hệ làm rõ; beta có thể thay đổi tính năng; chấp nhận = đồng ý cho xử lý hồ sơ. Checkbox "Tôi đã đọc và đồng ý" → nút Add mới sáng.
4. Bấm Add → POST request thật → xuất hiện POPUP TIỂU TÂM (tận dụng style widget Thư Ký R5): avatar 🦊, typing dots, "Em đã nhận Mod Module Company của [Tên Công Ty] 🏢✨" → thanh loading/progress "Đang khởi tạo hồ sơ forge…" → sau ~2.5s chuyển trạng thái "Hồ sơ đã vào hàng chờ — đội Citadel sẽ forge module riêng và gắn vào pháo đài của anh/chị. Em sẽ báo ngay khi sẵn sàng 💪" + card tóm tắt (tên công ty, số module tick, mã hồ sơ). CHỪA HOOK: component nhận prop/status từ API (received/reviewing/building/delivered) — phần build module thật làm round sau.
5. Trong Cửa hàng: nếu org đã có request → card Module Company hiện trạng thái "Hồ sơ [Tên]: Đã tiếp nhận ⏳" + nút xem chi tiết (sheet tóm tắt hồ sơ đã điền).
6. Mini-tour tutorial (data-tut) cho card mới nếu tiện.

## Phase D — Verify + deploy + push + release
1. pnpm -r typecheck · test · build · audit-buttons 0 · acceptance 9/9.
2. docker compose -p supercitadel up -d --build web api. Migration 0009 vào DB live. Verify THẬT: docker inspect Created > commit; test POST company-module request trên live (curl pattern /tmp/login.json — LƯU Ý exec mangle `VAR=$(...)` chứa JWT/TOKEN, dùng file trung gian); screenshot wizard (playwright script shot mở /modules click Add nếu được, ít nhất chụp card mới).
3. Secret scan diff → push master:main (set -a; source ~/.config/tt-github/env; set +a; git -c credential.helper='!f() { echo "username=x-access-token"; echo "password=$GH_TOKEN"; }; f' push https://github.com/NachaFromMars/supercitadel.git master:main).
4. Release r7.1.0 "R7 — Module Company wizard + README" (GitHub API, Bearer $GH_TOKEN, KHÔNG print token).
5. Báo cáo cuối: phases, verify, link live/release, screenshot paths.
