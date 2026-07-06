# SUPERCITADEL R4 — LỘT SÂU trang nghiệp vụ (brief đầy đủ, dùng cho cả resume)

Repo: /root/.openclaw/workspace/supercitadel · Next.js apps/web (KHÔNG tailwind — CSS tokens DS v2 trong apps/web/app/globals.css) · API Hono services/api · pnpm.
Live: https://supercitadel.62.146.238.213.sslip.io (docker compose -p supercitadel; KHÔNG sửa /etc/caddy/Caddyfile).
Design refs: /root/.openclaw/workspace/design-refs/ — ĐỌC INDEX.md trước, đọc source .tsx thật của component trước khi port, dịch tailwind→CSS tokens, giữ motion + a11y, KHÔNG thêm dependency mới (không framer-motion).

Bối cảnh: R3 xong (landing, rental, OwnedBar, switch). Anh Nấng chê trang nghiệp vụ vẫn "dàn hàng dọc" — form full-width + khoảng trống chết bên phải (xem ảnh Kế toán). Lệnh R4: "Lột thêm đi, xong hết hoàn chỉnh, tự audit lại, update git, xuất link".

QUY TẮC: commit sau MỖI phase (prefix "SUPERCITADEL-R4:"), typecheck + build pass trước commit. Resume = đọc git log, làm tiếp phase kế.

## Phase A — Layout 2 cột cho trang nghiệp vụ (desktop ≥1100px, mobile giữ 1 cột)
Pattern chung: grid 2 cột (main 1fr + aside ~360-400px). Áp cho:
1. /accounting: trái = tabs Thu Chi/Công nợ/Báo cáo + form phiếu; phải = panel "Sổ gần đây" (list phiếu mới nhất + số dư 111/112 dạng KPI mini + trạng thái trial-balance badge balanced). KPI cards có icon + tăng/giảm màu.
2. /crm: trái = kanban (giữ); phải = panel thống kê pipeline (tổng deal, giá trị từng stage — bar mini SVG) + khách mới nhất. Nếu kanban cần full width thì panel stats nằm TRÊN dạng stat-row 4 ô có icon.
3. /inventory: trái = bảng hàng; phải = panel cảnh báo sắp hết (low-stock list đỏ/vàng) + tổng SKU/tổng tồn.
4. /hr: trái = tab chấm công/ca/nghỉ phép; phải = panel hôm nay (ai đang làm ca, ai nghỉ, đơn chờ duyệt badge).
5. /om: trái = lịch sử giao dịch; phải = wallet card to đẹp (port ý tưởng kokonutui currency-transfer — số dư lớn, gradient border, nút nạp/chi) + thống kê thu/chi tháng.
6. /modules: giữ grid card nhưng nâng card: icon lớn hơn, giá nổi bật, switch + badge thuê hàng đầu card.

## Phase B — Component polish toàn cục
1. OwnedBar chip v2: icon module (Icon.tsx có sẵn bộ icon) + hover glow accent + tooltip CSS thuần hiện hạn thuê/trạng thái; chip active có ring nhẹ.
2. Sidebar v2: active item có indicator bar trượt (CSS transition trên ::before), hover icon tint accent, user card dưới cùng đẹp hơn (avatar gradient + role badge).
3. Empty states: component EmptyState.tsx (SVG illustration inline nhỏ — vẽ tay đơn giản: hộp/tờ giấy/kính lúp theo ngữ cảnh) + headline + subtext + CTA nút hành động. Thay mọi chỗ "Chưa có ..." trần.
4. Table polish: header sticky, row hover accent-tint, zebra nhẹ, cell số dùng .mono, badge trạng thái pill nhất quán.
5. Skeleton shimmer đã có → đảm bảo mọi fetch panel mới dùng.
6. Dark depth: thêm token --s0/--s1/--s2/--s3 phân tầng nếu chưa đủ, panel aside dùng tầng khác main để có chiều sâu.

## Phase C — Landing + Home nâng thêm 1 nấc
1. Landing: thêm section "3 bước bắt đầu" (step 1-2-3 có số to + line nối), section testimonial/quote giả lập 2-3 card, marquee logo module (CSS animation marquee từ magicui concept). Hero thêm 2 badge nhỏ "Beta mở — miễn phí" + "Backend thật 100%".
2. /home: hero KPI 4 ô có icon + delta màu; khối "Việc cần chú ý" (low-stock, đơn nghỉ chờ duyệt, deal sắp đóng — fetch từ API sẵn có, cache nhẹ); quick actions grid (tạo phiếu thu, thêm khách, thêm hàng, tạo ca — link thẳng trang + query mở form nếu tiện).

## Phase D — SELF-AUDIT (bắt buộc, không tin build log)
1. pnpm -r typecheck · pnpm -r test · pnpm --filter @citadel/web build · npx tsx scripts/audit-buttons.mts (0 nút chết) · npx tsx scripts/acceptance-v7a.mts (9/9).
2. Deploy: docker compose -p supercitadel up -d --build web api ws
3. VERIFY DEPLOY THẬT: docker inspect supercitadel-web-1 --format '{{.Created}}' phải MỚI HƠN thời điểm commit cuối; curl landing + 1 trang app grep marker class MỚI trong JS chunk.
4. Screenshot audit: node scripts/shot-r3.mjs (sửa thành shot-r4.mjs chụp thêm /crm /inventory /hr /om) → xem từng ảnh (image tool hoặc đọc pixel dimensions + gửi cho parent xem) → layout 2 cột hiện đúng, không vỡ.
5. Endpoint spot-check: login demo → GET modules/accounting/crm/inventory/hr 200.

## Phase E — Git + Release + Báo cáo
1. Push: set -a; source ~/.config/tt-github/env; set +a; git -c credential.helper='!f() { echo "username=x-access-token"; echo "password=$GH_TOKEN"; }; f' push https://github.com/NachaFromMars/supercitadel.git master:main
2. Release r4.1.0 qua GitHub API (POST /repos/NachaFromMars/supercitadel/releases, Bearer $GH_TOKEN, name "R4 — Lột Sâu: Business pages 2-col + polish"). KHÔNG print token.
3. Báo cáo cuối: phases xong, verify results, link live + link release, đường dẫn screenshots.
