# HANDOFF — Fix Soul-Wallet endpoints + Soul-Sale UI + mobile nav (R11.6k)

> Box mới đọc file này rồi làm. Chỉ đụng **Lab** (`supercitadellab-*`), TUYỆT ĐỐI KHÔNG đụng prod (`supercitadel-*` — 5 service healthy, không restart/build). Repo: `/root/.openclaw/workspace/supercitadellab`. HEAD hiện tại: `34d02f7` (R11.6j). Lab: api `127.0.0.1:3011`, web `127.0.0.1:3010`, DB `127.0.0.1:5452` (user/db `citadellab`, pass = `.env` `DB_PASSWORD`). Domain ngoài: https://supercitadellab.62.146.238.213.sslip.io

## Feedback từ anh Nấng (21:13 06/07)
1. Các endpoint trong module Soul-Wallet KHÔNG hoạt động (tab không load).
2. Soul-Sale "cũng lỗi không dùng được".
3. Ảnh chụp mobile: bottom nav CHE MẤT NÚT (form "Hũ mục tiêu" trang /soul-wallet bị che nút bấm).

## CHẨN ĐOÁN ĐÃ XONG (test thật 26 endpoint bằng token, kết quả đầy đủ: `/tmp/ep_results.txt`)
Token: `POST /api/v1/auth/login {"token":"***"}` → jwt ở field `"jwt"`. Script sẵn: `/tmp/getjwt.py` (tạo `/tmp/jwt_LABMANAGER001`), test toàn bộ: `/tmp/test_all_endpoints.py`.

**Soul-Sale: 10/10 endpoint OK (200 + data thật)** — backend KHÔNG có lỗi. `/health`, `/pipeline/summary`, `/intel/next-best`, `/agency-tree`, `/customers`, `/orders`, `/debt/summary`, `/import/batches`, `/leads`, `POST /tools/soulsale.customer.search` đều sống. → Lỗi anh Nấng thấy ở Soul-Sale = UI/hiển thị (nút bị che / trang trông như chết vì data rỗng), KHÔNG phải endpoint.

**Soul-Wallet: 10/18 OK, 8 endpoint 404:**
| FE gọi (404) | Ghi chú |
|---|---|
| `GET /api/v1/soul-wallet/health` | có thể module không đăng ký /health |
| `GET .../tx?limit=10` | tab Sổ tiền không load |
| `GET .../recurring` | tab Định kỳ |
| `GET .../runway` | dự báo runway |
| `GET .../reports/donut` | biểu đồ |
| `GET .../reports/candles` | biểu đồ |
| `GET .../reports/waterfall` | biểu đồ |
| `GET .../reports/heatmap` | biểu đồ |

10 endpoint OK: `/categories/seed` (seeded 31), `/accounts`, `/categories`, `/budgets/status`, `/goals`, `/debts`, `/debts/aging`, `/reports/executive`...

**NGUYÊN NHÂN:** FE (`apps/web/app/soul-wallet/page.tsx`) gọi path LỆCH với path backend đăng ký trong `modules/soul-wallet/src/routes.ts`. Lưu ý: host-adapter strip prefix `/wallet` — route module `'/wallet/tx/list'` → public `/api/v1/soul-wallet/tx/list`.

## VIỆC CẦN LÀM
1. **Dò path backend thật:** `grep -oE "'/wallet[a-zA-Z0-9/:._-]*'" modules/soul-wallet/src/routes.ts | sort -u` (53 dòng). Map 8 path FE lỗi → path đúng (vd FE gọi `/tx` nhưng backend có thể là `/tx/list`; FE `/reports/donut` backend có thể `/reports/charts/donut` v.v. — PHẢI đối chiếu thật, không đoán).
2. **Sửa FE** `apps/web/app/soul-wallet/page.tsx` cho khớp path backend (KHÔNG sửa module src — module đã pass 134/134 test). Nếu backend thật sự thiếu endpoint FE cần (vd `/health`) → bỏ call đó ở FE hoặc thêm route alias trong `modules/soul-wallet/server/host-adapter.ts` (app.get('/health'...) như soul-sale làm).
3. **Fix bottom nav che nút (mobile):** thêm `paddingBottom: 96` (hoặc `calc(96px + env(safe-area-inset-bottom))`) vào container nội dung chính của CẢ HAI trang: `apps/web/app/soul-wallet/page.tsx` + `apps/web/app/soul-sale/page.tsx`. (Ảnh anh Nấng: form "Hũ mục tiêu" bị bottom nav che.)
4. **Rebuild web:** `docker builder prune -f` trước; load < 5 mới build (`cat /proc/loadavg`); `docker compose -p supercitadellab up -d --build web`; nếu container không recreate thì thêm `up -d --no-build web`. Web build từng fail vì prop mismatch — Shell KHÔNG nhận prop `active`, ModuleLocked dùng `id`/`name` (đã fix rồi, chỉ lưu ý nếu sửa thêm).
5. **Verify:** chạy lại `python3 /tmp/test_all_endpoints.py` (sau khi cập nhật path trong script cho khớp path đúng) → kỳ vọng 26/26 OK (hoặc 25/26 nếu bỏ /health). Verify `/soul-wallet` + `/soul-sale` trả 200 trên cả `127.0.0.1:3010` lẫn domain ngoài.
6. **Soul-Sale UI:** trang + backend sống; sau khi fix padding + rebuild, mở lại xem còn gì "không dùng được" — nếu còn, hỏi anh Nấng cụ thể thao tác nào lỗi (nút nào, tab nào) trước khi đoán mò.
7. **Commit `R11.6k`** (message: fix 8 path FE Soul-Wallet + mobile padding 2 module + ghi chú Soul-Sale backend 10/10 OK). Verify prod nguyên vẹn TRƯỚC commit: `docker ps --filter "name=supercitadel-" | grep -v lab` → 5/5 Up.
8. **Báo anh Nấng** (telegram topic 10474) số liệu thật: bảng endpoint trước/sau, ảnh hoặc xác nhận UI hết che nút.

## Bối cảnh vận hành QUAN TRỌNG
- **Gateway OpenClaw đang bệnh:** sau mỗi restart chỉ sống ~1-2 phút rồi kênh trả output đứt (exec/message không phản hồi). Anh Nấng đã restart nhiều lần. Nếu box mới cũng bị: làm việc theo NHỊP NGẮN (1 lệnh nhỏ/lần, output bé), ghi kết quả ra file rồi đọc bằng read tool, tránh build khi load cao, và đề xuất anh Nấng `systemctl restart openclaw` nếu đứt hẳn. Nghi leak sau ~2 ngày uptime — có thể đề xuất anh Nấng cho restart VPS nếu tái diễn.
- Lịch sử: R11.6i = gắn Soul-Sale (commit 8bd3eef), R11.6j = gắn Soul-Wallet (commit 34d02f7, fail-closed ownerId, 25 bảng sw_*, acceptance 5tr→4.68tr→5tr PASS). Cả 2 module backend đã nghiệm thu sống PASS — đừng đập đi làm lại, chỉ fix FE path + UI.
- Org test: `a9f16130-0d72-47eb-878e-2c286b17423b` (manager d64991e9). Nếu anh Nấng login user/org KHÁC → check `org_modules` đã active soul-wallet + soul-sale cho org đó chưa; thiếu thì insert active+purchased (xem HANDOFF-SOULWALLET-R11.6j.md có lệnh mẫu).
- Volume-mount Lab (việc treo từ trước, làm nếu còn thời gian): bind `./`→`/app` + anonymous volume `/app/node_modules` cho api Lab trong compose → sửa code chỉ cần restart, khỏi build. Chỉ compose Lab, prod nguyên.
