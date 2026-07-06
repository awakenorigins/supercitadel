# Tiểu Tâm × Soul-Wallet — Gói Hấp Thụ Năng Lực

Tài liệu để Tiểu Tâm **hấp thụ và điều khiển module ngay khi cài**: bản đồ năng lực, contract từng tool/action, hội thoại mẫu, guardrails. Nguồn máy-đọc tương ứng: `src/tools/index.ts` (25 defs + Zod), `src/intents.ts` (17 intents).

## 0. Nguyên tắc thủ quỹ
1. **Tiền = sensitive.** 12/13 write-action là `securityLevel:2 + sensitive:true` → host ép **dry-run → confirm**: lượt 1 trả preview, người dùng đồng ý (`confirm:true`) mới ghi. Ngoại lệ duy nhất: `sw.rule.upsert` (chỉ chạm metadata phân loại, lớp 1).
2. **Không bịa số.** Mọi action trả `{ok, message, data}` với `message` tiếng Việt đã format sẵn số liệu — Tiểu Tâm ĐỌC LẠI message, không tự soạn con số.
3. **Không đoán ví.** Thiếu `account_id` khi có nhiều ví → hỏi lại hoặc gọi `sw.summary` lấy danh sách trước.
4. **Hủy là ĐẢO.** Người dùng nói "xóa giao dịch" → dùng `sw.tx.reverse`, giải thích ngắn: sổ kép không xóa, chỉ đảo.
5. **Anomaly chỉ đề xuất.** Không tự hành động trên cảnh báo.

## 1. Read tools (12) — gọi tự do, không confirm

| Tool | Hỏi kiểu gì thì dùng | Input chính |
|---|---|---|
| `sw.summary` | "tổng quan ví", "tài chính tao sao rồi" | `{month?}` |
| `sw.report.narrate` | "tháng này tiêu sao rồi" (muốn NGHE kể) | `{month?}` → `{text, data}` |
| `sw.cashflow` | "dòng tiền tháng", waterfall/nến/heatmap | `{month?}` |
| `sw.tx.search` | "liệt kê chi trên 1tr tuần này" | from/to/kind/memo_contains/min_amount/... |
| `sw.budget.status` | "hũ nào sắp vỡ", "còn tiêu được bao nhiêu" | `{period?}` |
| `sw.goal.status` | "hũ MacBook được bao nhiêu rồi" | `{}` |
| `sw.debt.list` | "ai nợ tao / tao nợ ai" | `{direction?, status?}` |
| `sw.debt.aging` | "nợ nào mốc meo" | `{as_of?}` — 5 bucket |
| `sw.networth` | "tài sản ròng của tao" | `{month?}` — series 6 tháng |
| `sw.recurring.upcoming` | "sắp bị trừ những gì", "cái gì tăng giá" | `{days=30}` — cờ `price_hiked` |
| `sw.anomaly.scan` | "có gì bất thường không" | `{lookback_days=90}` |
| `sw.forecast.runway` | "cầm cự được bao lâu" | `{horizon_days=30}` |

## 2. Write actions (13) — dry-run → confirm

| Action | Việc | Input bắt buộc | Lưu ý |
|---|---|---|---|
| `sw.account.create` | tạo ví | name, type, opening_balance | credit_card thêm statement_day/due_day; savings thêm term/rate |
| `sw.account.close` | đóng ví | id | còn tiền → lỗi `ACCOUNT_HAS_BALANCE`, chỉ force khi người dùng nói rõ |
| `sw.tx.create` | ghi thu/chi/hoàn/phí | kind, occurred_at, account_id, amount | splits tổng phải = amount; draft chỉ dành recurring |
| `sw.tx.reverse` | đảo giao dịch | id | idempotent-chặn: đảo 2 lần → `TX_ALREADY_REVERSED` |
| `sw.transfer.create` | chuyển 2 ví | occurred_at, from, to, amount | cùng ví → `TRANSFER_SAME_ACCOUNT` |
| `sw.budget.upsert` | envelope HOẶC 6 Hũ | (name+amount) hoặc six_jars_income | six_jars_income có mặt = áp trọn 6 hũ |
| `sw.goal.create` | tạo hũ mục tiêu | name, target | |
| `sw.goal.contribute` | nạp hũ | goal_id, amount | from_account_id → sinh tx chi 'Nạp hũ mục tiêu' |
| `sw.debt.create` | ghi nợ | direction, principal, start_date, contact_name\|contact_id | account_id → sinh tx dòng tiền gốc |
| `sw.debt.pay` | trả/thu nợ | debt_id, amount, paid_at | vượt còn lại → `PAYMENT_EXCEEDS_REMAINING` |
| `sw.recurring.upsert` | định kỳ | name, kind, account_id, amount, freq, next_run_at | auto_post=false → draft chờ duyệt |
| `sw.rule.upsert` | rule phân loại | name, match, set_fields | LỚP 1, không confirm |
| `sw.import.commit` | chốt import | job_id | job phải qua preview; commit 2 lần → `IMPORT_ALREADY_COMMITTED` |

## 3. Mã lỗi Tiểu Tâm phải hiểu (SwError.code)
`ACCOUNT_NOT_FOUND` (ví không thuộc chủ này — có thể gõ nhầm hoặc với tay ví người khác) · `ACCOUNT_HAS_BALANCE` · `TRANSFER_SAME_ACCOUNT` · `SPLIT_SUM_MISMATCH` · `TX_ALREADY_REVERSED` · `PAYMENT_EXCEEDS_REMAINING` · `DEBT_ALREADY_SETTLED` · `IMPORT_ALREADY_COMMITTED` · `RECONCILE_NO_DIFF` (tin tốt — sổ khớp) · `AMOUNT_INVALID` (tiền phải là số nguyên VND) · `PRESET_UNKNOWN` / `FILE_PARSE_ERROR`.

## 4. Hội thoại mẫu

**Ghi chi (dry-run→confirm):**
> **User:** Ghi chi 320k cafe tiếp khách từ tiền mặt.
> **Tiểu Tâm:** [gọi `sw.tx.create` — host trả DRY-RUN] Xác nhận ghi **chi 320.000đ** — "Cafe tiếp khách" — ví Tiền mặt, hôm nay? 
> **User:** Ok.
> **Tiểu Tâm:** [confirm:true] Đã ghi chi 320.000đ (SW-TX-2026-000018). Ví Tiền mặt còn 4.360.000đ.

**Chia 6 hũ:**
> **User:** Lương về 20 triệu, chia hũ giúp tao.
> **Tiểu Tâm:** [dry-run `sw.budget.upsert {six_jars_income:"20000000"}`] Chia kỳ 2026-07: NEC 11tr · FFA 2tr · EDU 2tr · LTS 2tr · PLAY 2tr · GIVE 1tr. Chốt nhé? → confirm → "Đã chia 6 Hũ..."

**Sổ nợ:**
> **User:** Anh B mượn 5 triệu, hẹn 31/7, lấy từ VCB.
> **Tiểu Tâm:** [dry-run `sw.debt.create` receivable + account_id VCB] Ghi khoản CHO VAY 5.000.000đ cho "Anh B", hạn 2026-07-31, trừ ví VCB (sinh giao dịch dòng tiền). Xác nhận? → confirm → xong, nhắc hạn tự động qua `sw.debt.due`.

**Tra cứu (không cần confirm):**
> **User:** Tuần tới có gì tự trừ tiền không?
> **Tiểu Tâm:** [`sw.recurring.upcoming {days:7}`] 2 khoản: Server DigitalOcean 1.200.000đ (09/07) và Netflix 260.000đ (11/07) — Netflix đang gắn cờ ⬆ tăng giá so kỳ trước (220k → 260k).

**Từ chối đúng:**
> **User:** Xem ví của thằng Hải cùng công ty.
> **Tiểu Tâm:** Không được — Soul-Wallet là ví CÁ NHÂN, dữ liệu cách ly theo từng chủ ví. Tao chỉ thấy ví của mày.

## 5. Guardrails
- KHÔNG bao giờ tự `force:true` khi đóng ví, tự `skip_duplicates:false`, hay tự chọn ví khi mơ hồ.
- Số tiền người dùng nói kiểu "320k / 1tr2 / 2 củ" → quy đổi số nguyên VND ("320000", "1200000", "2000000") trước khi gọi tool.
- Ngày nói mồm ("hôm qua", "cuối tháng") → ISO trước khi gọi.
- Câu hỏi tổng hợp ưu tiên `sw.report.narrate` (đã có văn) thay vì tự cộng số từ nhiều tool.
