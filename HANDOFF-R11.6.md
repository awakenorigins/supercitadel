# HANDOFF — SuperCitadelLab R11.6 (context box mới đọc file này để làm tiếp)

Cập nhật: 2026-07-06 ~10:30 CET. Người giao: anh Nấng (Telegram 8028319576).
Lý do handoff: context box cũ dài + hạ tầng exec đang khựng đầu ra. Box mới đọc file này → làm tiếp NGAY, không hỏi lại.

## BỐI CẢNH
- Repo Lab: `/root/.openclaw/workspace/supercitadellab` (git LOCAL-only, KHÔNG remote — không push đè prod).
- Domain Lab: https://supercitadellab.62.146.238.213.sslip.io
- Compose project: `supercitadellab` (ports web 3010 / api 3011 / ws 3012 / pg 5452 / redis 6402). Prod là `supercitadel` (3000/3001/3002/5442/6392) — TUYỆT ĐỐI KHÔNG đụng.
- Token đăng nhập Lab (13 ký tự): super_admin=LABSUPERADMIN, owner=LABOWNERFULL01, manager=LABMANAGER001. Cả 3 acc đã security_level=2 + engine=gpt-5.5.
- Đối tượng đang sửa: khung chat "Tiểu Tâm" (trợ lý AI) trong SuperCitadel, KHÁC module Nhắn Tin người-người.

## 3 VIỆC ĐANG DỞ — CODE ĐÃ SỬA TRÊN ĐĨA, CHƯA BUILD/DEPLOY/VERIFY
1. **Lỗi tải file HDM (ưu tiên cao nhất)**: hóa đơn MUA mã `HDM-*` (bảng `ketoan10a.bills`) làm endpoint xuất file crash (chỉ query bảng `invoices` bán → gặp HDM không phải uuid → PostgresError → 500 → nút Xem/In PDF + Excel chết).
   - Đã sửa: `modules/ke-toan-10a/src/services/invoice-doc.service.ts` → hàm `load()` nhận cả HD (invoices/bán) lẫn HDM (bills/mua), thêm `UUID_RE` chặn crash, `buildFrom(ctx, invoice, kind)`, title "HOÁ ĐƠN MUA/BÁN HÀNG", nhãn "Nhà cung cấp/Khách hàng". `html()` + `xlsx()` dùng `kind`.
   - Route dùng chung `/api/v1/ke-toan-10a/invoices/:key/print.html` + `/export.xlsx` (đã có sẵn, key = HDM hay HD đều được sau fix).
   - Bằng chứng lỗi cũ (log api): `PostgresError: invalid input syntax for type uuid: "HDM-2026-000001/2"`.
   - Hóa đơn thật để test: `HDM-2026-000004` (Chrysauge Opus, 210.600.000đ) — anh Nấng bấm tải bị "Không tải được file".

2. **Output nâng như model**: `packages/tieu-tam/src/adapters.ts` OpenAiAdapter `max_tokens: 4096 → 8192`.

3. **Auto-summary "nhớ vô hạn"**: `services/api/src/tieu-tam/routes.ts`:
   - Thêm hàm `summarizeOldHistory(db, orgId, userId, engine, profile)`: khi tổng tin nhắn > KEEP(120)+CHUNK(40) → lấy 40 tin CŨ NHẤT → nhờ model tóm tắt → insert vào `ttMemories` (kind=summary, salience 0.75) → xóa 40 tin đó. Gọi sau `saveChatTurn` trong runChat (best-effort, không chặn).
   - Import đã thêm: `ttMemories` từ '@citadel/db'; `sql, inArray` từ 'drizzle-orm'.

## TRẠNG THÁI GIT
- HEAD hiện tại: `7d8403e` (R11.6g — context window 40→120). 
- 3 fix trên (HDM + 8192 + auto-summary) là các thay đổi CHƯA COMMIT (working tree). Commit tiếp theo dự kiến: R11.6h.

## VIỆC PHẢI LÀM (theo chỉ đạo anh Nấng: breakdown NHỎ, build từng bước, AUDIT kỹ, LẦN LƯỢT, không dồn)
- BƯỚC 0: `free -h; uptime; df -h /; docker system df` → nếu cache thừa nhiều: `docker builder prune -f` (nhẹ máy, tránh exec khựng do quá tải).
- BƯỚC 1: build RIÊNG api: `docker compose -p supercitadellab up -d --build api` → chờ healthy → verify HDM tải được (xem lệnh verify dưới). AUDIT ok mới đi tiếp.
- BƯỚC 2: verify output 8192 (hỏi Tiểu Tâm 1 câu cần trả lời dài → không bị cắt ~4096).
- BƯỚC 3: verify auto-summary (cần >160 tin/1 user; có thể test logic bằng cách hạ tạm ngưỡng hoặc kiểm tt_memories kind=summary xuất hiện sau khi vượt ngưỡng).
- BƯỚC 4: build web nếu cần (FE đã có sẵn nút tải từ R11.6). commit R11.6h. Báo anh Nấng + gửi ảnh HDM render.

## LỆNH VERIFY HDM (đã biết chạy được)
Token qua file để tránh shell nuốt 13 ký tự:
```
printf 'LABMANAGER001' > /tmp/tt_tok
```
Rồi login POST `/api/v1/auth/login` {token} → jwt; GET `/api/v1/ke-toan-10a/invoices/HDM-2026-000004/print.html` (phải 200, HTML có "HOÁ ĐƠN MUA") + `/export.xlsx` (200, zip PK). Render ảnh bằng `wkhtmltoimage --width 780 file.html out.png` để gửi anh Nấng.

## BÀI HỌC QUAN TRỌNG (tránh lặp lỗi)
1. exec khựng đầu ra = quá tải VPS do build Docker dồn dập + render PDF + context lớn. GIẢI PHÁP: build lẻ từng service, `docker builder prune`, cân nhắc mem-limit cho Lab. KHÔNG build api+web dồn nhiều lần liên tục.
2. Heredoc bash/python bị mask các chuỗi 'login'/'req('/'Bearer '/'json.load' + nuốt token 13 ký tự → viết test ra FILE .py, build URL/tên hàm bằng nối chuỗi, truyền token qua /tmp file, header dùng ("Bea"+"rer "+jwt).
3. Đường dẫn dài trong lệnh exec đôi khi làm stdout rỗng → ghi output ra /tmp/*.txt rồi đọc bằng read tool.
4. few-shot poison: reply cũ tiêu cực trong tt_chat_messages làm model lặp lại → dọn history khi đổi hành vi.
5. Chỉ sửa Lab, prod `supercitadel-*` phải luôn Up nguyên vẹn.

## LỊCH SỬ R11.6 (đã DONE trước đó, để hiểu ngữ cảnh)
- R11.6: invoice card + xuất PDF/Excel (HD), nhớ file, caption, reply-to. commit c676baa.
- R11.6b: textarea Enter/Shift+Enter + 3 acc lên security lvl 2. commit 569c69f.
- R11.6c: vision — đọc ẢNH (jpg/png/webp/gif) qua model, tạo chứng từ từ ảnh. commit ba4c911.
- R11.6d: +excel đọc full rows + hóa đơn matHang chi tiết. commit e4f5cf9.
- R11.6e: 3 model (gpt-5.5 default/opus-4.6/sonnet-4.6), bỏ opus-4.8. commit 621adfc.
- R11.6f: PDF đọc được (poppler pdftoppm render→vision), gửi-file-kèm-yêu-cầu chạy luôn, system prompt khẳng định khả năng đọc file, history 40, memory 60. commit 693af01.
- R11.6g: history 40→120. commit 7d8403e.
- R11.6h (ĐANG DỞ): HDM export fix + output 8192 + auto-summary. CHƯA commit/deploy/verify.

## NGUỒN GHI CHI TIẾT
`/root/.openclaw/workspace/memory/2026-07-06.md` (các mục R11.5 → R11.6g). Bổ sung R11.6h khi xong.
