# SUPERCITADEL R6 — Tiểu Tâm SONNET 4.6 luôn-active + ACTION LAYER thực thi nhiệm vụ module (brief đầy đủ, dùng cho resume)

Repo: /root/.openclaw/workspace/supercitadel · Next.js apps/web (CSS tokens, KHÔNG tailwind) · Hono API services/api + packages/tieu-tam · pnpm.
Live: https://supercitadel.62.146.238.213.sslip.io (docker compose -p supercitadel; KHÔNG sửa /etc/caddy/Caddyfile).
QUY TẮC: commit sau MỖI phase (prefix "SUPERCITADEL-R6:"), typecheck+build pass trước commit. Resume = đọc git log → phase kế. KHÔNG thêm dependency mới. KHÔNG BAO GIỜ commit/print API key.

Lệnh anh Nấng (msg 9470): (1) Gắn model Sonnet 4.6 cho Tiểu Tâm SẴN LUÔN LUÔN ACTIVE; trong option chọn Model của Tiểu Tâm thấy sonnet 4.6 + các tùy chọn khác. (2) Audit sau khi gắn: ra lệnh cho Tiểu Tâm và Tiểu Tâm THẬT SỰ thực hiện nhiệm vụ trong Citadel, nhất là nhiệm vụ trong các Module — thay người dùng làm.

## Hạ tầng có sẵn (đã thăm dò)
- packages/tieu-tam/src/adapters.ts: engine registry ADAPTERS {stub-a, stub-b, openai, anthropic}; OpenAiAdapter hardcode api.openai.com; AnthropicAdapter hardcode api.anthropic.com.
- services/api/src/tieu-tam/routes.ts: GET state (engine), PATCH /engine (ENGINE_NAMES validate, audit engine_change).
- Proxy LLM nội bộ OpenAI-compatible: http://100.65.135.62:20131/v1 (đã test 401 khi thiếu key = sống). Model: `cc/claude-sonnet-4-6`. API key lấy từ ~/.openclaw/openclaw.json path models.providers.claudekkg.apiKey — dùng lệnh python3/jq để COPY vào supercitadel/.env, KHÔNG echo ra log/console/commit.
- FE: apps/web/app/tieu-tam/page.tsx + sheet Tiểu Tâm trong settings (tìm engine selector hiện có).

## Phase A — Engine Sonnet 4.6 luôn-active
1. packages/tieu-tam/src/adapters.ts: sửa OpenAiAdapter nhận baseUrl (env LLM_BASE_URL, default https://api.openai.com) — hoặc thêm class ProxyAdapter. Thêm engine 'sonnet-4.6' vào ADAPTERS: OpenAI-compatible chat completions với baseUrl = env LLM_BASE_URL, model = env LLM_MODEL (default 'cc/claude-sonnet-4-6'), key = env LLM_API_KEY. max_tokens hợp lý (2048), temperature 0.7.
2. ENGINE_NAMES thêm 'sonnet-4.6'. Default engine cho soul state MỚI = 'sonnet-4.6' (tìm nơi khởi tạo tt_soul_state / setEngine default). Với org demo hiện có: migration hoặc seed update đổi engine hiện tại → 'sonnet-4.6'.
3. .env / .env.example: thêm LLM_BASE_URL, LLM_API_KEY, LLM_MODEL (example để trống + comment). docker-compose.yml: pass 3 env này vào service api. LLM_MODE=live khi có LLM_API_KEY (hoặc thêm nhánh: engine sonnet-4.6 hoạt động khi LLM_API_KEY set, bất kể LLM_MODE).
4. Trên máy (KHÔNG commit): ghi vào supercitadel/.env: LLM_BASE_URL=http://100.65.135.62:20131/v1, LLM_MODEL=cc/claude-sonnet-4-6, LLM_API_KEY=<copy từ ~/.openclaw/openclaw.json models.providers.claudekkg.apiKey bằng python3, không in ra>. LLM_MODE=live.
5. FE engine selector (trang /tieu-tam hoặc settings sheet): hiện danh sách engine gồm "Sonnet 4.6 ⭐ (mặc định)" + stub-a/stub-b/openai/anthropic; PATCH /engine khi chọn; badge "đang active" cạnh engine hiện tại.
6. Test: adapter sonnet-4.6 đăng ký đúng, PATCH engine sonnet-4.6 OK, default state mới = sonnet-4.6 (test không gọi mạng thật — mock/skip network).

## Phase B — ACTION LAYER: Tiểu Tâm thực thi nhiệm vụ module
Mục tiêu: chat với Tiểu Tâm ra lệnh tiếng Việt → Tiểu Tâm GỌI HÀNH ĐỘNG THẬT vào module (ghi DB thật) thay user.
1. packages/tieu-tam/src/actions.ts MỚI: định nghĩa ACTION REGISTRY — mỗi action: name, mô tả tiếng Việt, JSON schema params, requiredModule, executor(db, orgId, userId, params). Actions tối thiểu:
   - acc.create_receipt / acc.create_payment (phiếu thu/chi: partyName, amount, note) → tái dùng createJournal/createPayment từ modules/accounting service
   - acc.create_invoice (bán/mua, partyName, qty, rate, description)
   - crm.add_contact (name, phone?) · crm.add_deal (title, value, contactName?) · crm.move_deal (dealTitle, stage)
   - inv.add_item (name, qty, unit?, threshold?) · inv.adjust_qty (itemName, delta)
   - hr.check_in (employeeName) · hr.check_out (employeeName) · hr.create_shift (name, date, start, end)
   - om.balance () → đọc số dư
   - report.summary () → dashboard summary
   Executor LUÔN filter orgId từ JWT (hiến pháp #1), check requireModule active (dùng cùng logic gate — nếu module tắt trả lỗi nhắc bật), và audit log action 'tieu_tam.action' detail {action, params}.
2. Wire vào chat flow (services/api/src/tieu-tam/routes.ts + packages/tieu-tam): khi engine là LLM live (sonnet-4.6/openai/anthropic) → gửi kèm tools (OpenAI function-calling format, build từ ACTION REGISTRY) trong request; nếu response có tool_calls → execute từng action qua registry → append kết quả (role tool) → gọi LLM lần 2 để tổng hợp câu trả lời tiếng Việt tự nhiên "Em đã tạo phiếu thu 200.000đ cho Cà Phê Sáng ✓". Giới hạn 1 vòng tool (không loop vô hạn), max 5 tool calls/lượt.
3. Stub engines: intent detect hiện có giữ nguyên (fallback), nhưng nếu message match pattern hành động rõ (regex "tạo phiếu thu ... cho ...") → thực thi action thật luôn qua registry (để demo được cả khi không có LLM key).
4. System prompt (renderSystemPrompt): thêm đoạn — Tiểu Tâm là thư ký điều hành của org trong SUPERCITADEL, có quyền thực hiện nghiệp vụ thay người dùng qua tools; luôn xác nhận kết quả bằng số liệu thật; nếu module chưa bật thì hướng dẫn bật.
5. FE trang/sheet Tiểu Tâm: render action results đẹp (card nhỏ "✓ Đã tạo phiếu thu PT-xxxx · 200.000đ"); disclaimer nhỏ "Tiểu Tâm có thể thao tác dữ liệu thật".
6. Test actions: registry executor tạo phiếu thu → GL entries thật + audit log; crm.add_contact → contact trong DB; hr.check_in/out → attendance; module tắt → lỗi nhắc bật (không 500). Test tool-call flow với mock LLM response chứa tool_calls (không gọi mạng).

## Phase C — AUDIT THẬT: ra lệnh cho Tiểu Tâm qua API live
1. Deploy trước (compose up -d --build web api), migration nếu có.
2. Script scripts/audit-tieu-tam-actions.sh (bash + curl, pattern /tmp/login.json như scripts/test-excel-import.sh — LƯU Ý exec tool mangle cú pháp `VAR=$(...)` có chữ JWT/TOKEN, dùng file trung gian): login owner → POST /api/v1/tieu-tam/chat lần lượt:
   - "Tạo phiếu thu 200000 cho Cà Phê Sáng" → verify: GET payments/vouchers có phiếu mới + audit log tieu_tam.action
   - "Thêm khách hàng Chị Hoa số điện thoại 0901234567" → GET crm/contacts có Chị Hoa
   - "Thêm 20 kg cà phê hạt vào kho" → GET inventory/items
   - "Cho Minh check-in" (seed có nhân viên) → GET hr/attendance
   - "Số dư ví Om?" → reply chứa số dư thật
   - GET /tieu-tam/state → engine = sonnet-4.6, mode live
3. Nếu LLM proxy lỗi/timeout → retry 1 lần; nếu vẫn lỗi ghi rõ trong báo cáo (fallback stub vẫn phải thực thi action pattern-match được).
4. Ghi kết quả R6-AUDIT.md: bảng lệnh → action executed → DB verify → PASS/FAIL.
5. pnpm -r typecheck · test · build · audit-buttons · acceptance 9/9.

## Phase D — Deploy final + verify + release
1. docker compose -p supercitadel up -d --build web api ws. Verify THẬT: docker inspect web/api Created > commit time; curl live /api/v1/tieu-tam/state engine sonnet-4.6; JS chunk có marker engine selector mới.
2. Push: set -a; source ~/.config/tt-github/env; set +a; git -c credential.helper='!f() { echo "username=x-access-token"; echo "password=$GH_TOKEN"; }; f' push https://github.com/NachaFromMars/supercitadel.git master:main
3. Release r6.1.0 "R6 — Tiểu Tâm Sonnet 4.6 + Action Layer" qua GitHub API Bearer $GH_TOKEN (KHÔNG print token).
4. QUÉT AN TOÀN trước push: git diff origin/main..HEAD | grep -i "sk-\|api.key.*=.*[A-Za-z0-9]\{20\}" — đảm bảo 0 secret trong commit (key chỉ nằm trong .env không tracked).
5. Báo cáo cuối: phases, kết quả audit lệnh Tiểu Tâm (bảng), link live + release.
