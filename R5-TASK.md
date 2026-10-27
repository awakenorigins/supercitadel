# SUPERCITADEL R5 — Tutorial + Automato Thư Ký + polish theo feedback anh Nấng (brief đầy đủ, dùng cho resume)

Repo: /root/.openclaw/workspace/supercitadel · Next.js apps/web (KHÔNG tailwind — CSS tokens DS v2 globals.css) · Hono API services/api + modules/* · pnpm.
Live: https://supercitadel.62.146.238.213.sslip.io (docker compose -p supercitadel; KHÔNG sửa /etc/caddy/Caddyfile).
QUY TẮC: commit sau MỖI phase (prefix "SUPERCITADEL-R5:"), typecheck+build pass trước commit. Resume = đọc git log → làm tiếp phase kế. Design refs: đọc design-refs/INDEX.md + source thật trước khi port. Không thêm dependency mới.

Feedback gốc của anh Nấng (03/07 13:35, msg 9319) — 6 mục:

## Phase A — FIX BUG CHẤM CÔNG (nhỏ, làm trước)
1. Backend: checkOut trong modules/hr/server/service-v2.ts KHÔNG đổi status (vẫn 'present') → thêm status 'checked_out' khi check-out (migration nếu cần enum/text — cột status là varchar thì không cần migration, chỉ set value 'checked_out').
2. FE apps/web/app/hr/page.tsx: STATUS_VN thêm checked_out: 'Đã về'; hàng đã checkout hiện badge "Đã về" màu dim/jade thay vì "Có mặt"; nút Check-out biến mất sau khi checkout (đã có logic checkIn && !checkOut — giữ), thêm hiệu ứng flash xanh trên row khi check-in/out thành công.
3. Test hr: thêm case status sau checkout = 'checked_out'.
4. Kiểm luôn: sau checkout, panel "Hôm nay" aside không còn tính người đó là "đang làm ca".

## Phase B — VẬT PHẨM: popup xác nhận mua/dùng + hiệu ứng thành công
Trang /items (kho vật phẩm) + phần store items trong /modules:
1. Bấm Mua → popup/sheet xác nhận: tên vật phẩm + chọn SỐ LƯỢNG (stepper - / số / +, min 1) + tổng Om = qty × giá + nút Hủy/Xác nhận mua. API buy hiện tại nhận qty không? (xem services/api/src/items/routes.ts POST /items/:code/buy) — nếu chưa có qty thì thêm body {qty} backend, loop hoặc UPDATE qty trong 1 giao dịch, trừ Om đúng tổng.
2. Xác nhận → hiệu ứng thành công: nút biến ✓ + toast "Đã mua N × <tên> (−X Om)" + confetti-burst CSS nhẹ (vài chấm bay, CSS thuần, tôn trọng reduced-motion) + số Om ví update ticker.
3. Tương tự nút DÙNG vật phẩm: popup xác nhận (tên + mô tả hiệu ứng + Hủy/Dùng) → thành công: hiệu ứng glow + toast kết quả.

## Phase C — CỬA HÀNG MODULE: mục "Đang thuê" + module demo Automato Thư Ký
1. Trang /modules thêm SECTION/dải riêng "Đang thuê" (giữa "Đã sở hữu" và catalog): liệt kê module đang rent kèm ngày hết hạn + nút gia hạn. Nếu không thuê gì → không hiện section (không chiếm chỗ).
2. THÊM MODULE MỚI vào catalog (services/api/src/modules/catalog hoặc nơi define 8 module hiện tại — tìm nơi define pos coming_soon): id 'automato-secretary', name 'Automato Thư Ký', icon phù hợp (thêm icon robot/sparkle vào Icon.tsx nếu chưa có), desc 'Thư ký AI tự động — nhân viên ảo phụ trách công việc cho từng bộ phận', tier 'rent-only' HOẶC paid với rentOnly flag, priceOm ~800, group mới 'AI Automation', status 'demo'.
3. Hành vi FE khi bấm Thuê/chọn Automato Thư Ký (status demo):
   - Nút bấm → loading spinner ~1.5s (giả lập khởi tạo)
   - Popup CẢNH BÁO tam giác ⚠️: "Đây là thư ký auto — đang trong quá trình build. Tương lai sẽ có model LLM riêng." + nút "Đã hiểu"
   - Sau khi đóng popup → xuất hiện POPUP THƯ KÝ ở góc phải-dưới màn hình (floating widget đẹp, avatar robot + tên "Thư Ký số 1"): tự "tương tác" — hiện typing dots rồi nói "Em đang trong quá trình Khởi tạo... 🤖 Tương lai anh/chị có thể thêm nhiều nhân viên AI phụ trách toàn bộ hoặc từng bộ phận." + nút thu nhỏ/đóng. Widget này persist qua các trang (đặt trong Shell, state localStorage citadel.secretary.widget).
   - KHÔNG trừ Om thật cho module demo này (backend: status demo → rent/purchase trả 400 "Module đang xây dựng" hoặc cho phép nhưng 0 Om — CHỌN: chặn 400 + FE không gọi API thật, chỉ demo flow FE).
4. Backend catalog trả module mới trong GET /modules để FE render.

## Phase D — TUTORIAL HỆ THỐNG (như tutorial game, có tắt được)
1. Component Tutorial.tsx (Shell-level): tour từng bước overlay spotlight (highlight element + tooltip giải thích + nút Tiếp/Bỏ qua/Tắt hẳn).
   - Cách làm CSS thuần: overlay tối + cutout quanh element target (dùng box-shadow 0 0 0 9999px rgba(0,0,0,.7) trên element clone position hoặc outline + position từ getBoundingClientRect), tooltip card kế bên, mũi tên.
2. Nội dung tour lần đầu vào /home (sau login): ~6-8 bước:
   (1) Chào mừng SUPERCITADEL — pháo đài quản trị (2) Thanh Bar module sở hữu — trạng thái bật/tắt/thuê theo màu (3) Sidebar điều hướng nhóm nghiệp vụ (4) Ví Om — tiền tệ nội bộ, dùng mua/thuê module + vật phẩm (5) Cửa hàng Module — mua đứt hoặc thuê 7/30/90 ngày (6) Trang nghiệp vụ: Kế toán/CRM/Kho/Nhân sự — data thật (7) Tiểu Tâm AI + Automato Thư Ký tương lai (8) Kết: "Bắt đầu thôi!"
3. Tour theo trang (mini): lần đầu vào /accounting → 3 bước (tabs nghiệp vụ, nút Excel + file mẫu, panel sổ bên phải); /modules → 2 bước (mua/thuê + switch, thanh sở hữu). Các trang khác 1-2 bước tương tự nếu nhanh.
4. Trạng thái lưu localStorage citadel.tutorial (per-tour done/skip) + toggle "Hướng dẫn sử dụng" trong /settings: bật lại tour bất kỳ, và option "Tắt toàn bộ tutorial".
5. Nút "?" nhỏ ở header Shell → mở lại tour trang hiện tại.

## Phase E — AUDIT TOÀN BỘ LOGIC ENDPOINT + CẤU TRÚC (yêu cầu "kiểm tra thật kỹ")
1. Chạy script audit tự viết: duyệt TẤT CẢ route định nghĩa trong services/api + modules/*/server/routes.ts (grep .get/.post/.patch/.delete) → sinh danh sách endpoint đầy đủ → gọi từng cái với JWT owner trên LOCAL (127.0.0.1:3001): GET expect 200/4xx hợp lý, POST với body hợp lệ tối thiểu hoặc expect 400 validation rõ ràng (không 500).
2. Đặc biệt kiểm logic nghiệp vụ: check-in→check-out flow đủ trạng thái; rent hết hạn (set rented_until quá khứ) → gate 403 MODULE_RENT_EXPIRED + FE hiện Gia hạn; mua vật phẩm qty>1 trừ Om đúng; import Excel template tải được + import lại thành công; leave approve trừ ngày phép đúng.
3. Mọi 500 tìm thấy = bug → fix ngay + test.
4. Ghi kết quả vào R5-AUDIT.md: bảng endpoint × kết quả.
5. pnpm -r typecheck · pnpm -r test · build · audit-buttons 0 · acceptance 9/9.

## Phase F — DEPLOY + VERIFY THẬT + RELEASE
1. docker compose -p supercitadel up -d --build web api ws
2. VERIFY: docker inspect web Created > commit time; curl JS chunk có marker mới (tutorial/secretary class); screenshot playwright (sửa scripts/shot-r4.mjs → shot-r5.mjs, chụp thêm popup thư ký + tutorial bước 1 nếu chụp được bằng click).
3. Push: set -a; source ~/.config/tt-github/env; set +a; git -c credential.helper='!f() { echo "username=x-access-token"; echo "password=$GH_TOKEN"; }; f' push https://github.com/NachaFromMars/supercitadel.git master:main
4. Release r5.1.0 "R5 — Tutorial + Automato Thư Ký + UX confirm" qua GitHub API Bearer $GH_TOKEN. KHÔNG print token.
5. Báo cáo: phases, verify, link live + release, screenshots path.
