# AUDIT REPORT — Soul-Meeting 1A (build 2026-07-11)

Nguyên tắc: mọi gate CHẠY THẬT, mọi lệch so mapping/khuôn ghi tại đây.

## 1. Gates đã chạy (output thật trong build log)
| Gate | Kết quả |
|---|---|
| tests/smoke-core (Beat 1) | **38/38** |
| tests/smoke-prep (Beat 2) | **27/27** |
| tests/smoke-live (Beat 3) | **22/22** |
| tests/smoke-harvest (Beat 4) | **35/35** |
| tests/smoke-recording (Beat 5) | **20/20** |
| tests/smoke-report (Beat 6) | **23/23** |
| tests/smoke-bridge (Beat 7) | **24/24** |
| **Tổng suites** | **189/189** |
| `tsc --noEmit` module | ✅ 0 lỗi |
| `tsc` packages/core (sau wiring) | ✅ 0 lỗi |
| `tsc` services/api (sau wiring) | ✅ **0 lỗi MỚI** (xem §3.1) |
| `pnpm --filter @citadel/web exec tsc --noEmit` (sau copy page) | ✅ 0 lỗi |
| Clean-room unzip trắng → npm i → 7 suites + tsc | ✅ (log ở cuối build) |

## 2. Lệch so MAPPING v1.1 (chủ động, có lý do)
1. **+1 bảng `smeet_audit`** (20 thay vì 19): audit riêng per-module đúng khuôn Soul-Wallet, không mượn bảng host.
2. **rrule-lite tự viết thay rrule.js**: bỏ dependency; hỗ trợ đúng tập SME cần (daily/weekly byDays/monthly byMonthday≤28, until/count), offset +07:00 cố định. Monthday 29–31 CHẶN từ validate để không trôi tháng thiếu.
3. **+`updateParticipant`** (vote_weight/required/note): lỗ thiết kế lộ khi viết smoke-live Beat 3 — chair/secretary/creator auto-add weight 0, HĐTV cần chỉnh %vốn sau khi add. Vá service + schema trước khi test tiếp.
4. **+perm `sm.actionitem.read`** (manifest 13→14): bridge B4 bắt tool `sm.actions_list` mang perm chưa khai. Tách đọc/ghi việc đúng POLP thay vì hạ tool xuống perm ghi.
5. **ICS + Excel binary đi qua adapter GET riêng** (`/meetings/:id/ics`, `/actions/export.xlsx`): giữ MinimalContext json-only đúng khuôn wallet; route module vẫn có bản JSON base64 (`/actions/export-xlsx`).
6. **ASR = optional capability + sidecar tham khảo**: `scripts/asr-worker-reference/` là **docs-only, untested-by-CI** (Python/GPU ngoài phạm vi gate Node). Hợp đồng `SmCaps.asr` được test bằng mock cả success/fail/retry (smoke-recording 20/20). Thiếu caps → `ASR_UNAVAILABLE`, trạng thái giữ nguyên.
7. **Retention không xóa file**: file thuộc kho host → nightly chỉ trả `purge_candidates`; host cron tự xóa. Tránh module với tay ra ngoài ranh giới dữ liệu của mình.

## 3. Phát hiện về HOST v11.8 (không phải lỗi module)
1. **Baseline tsc dirty có sẵn**: `services/api` typecheck fail 4 lỗi tại `packages/tieu-tam/src/adapters.ts` (`MessageContent` vs `string`, dòng 43/44/53/64) **trên bản pristine chưa vá gì** (đã kiểm bằng cách restore backup 4 file rồi chạy lại — vẫn 4 lỗi). Gate của module: *không thêm lỗi mới* — đạt (diff lỗi = 0). Đề xuất fix host: adapters nhận `MessageContent` thì flatten text parts trước khi đưa vào chỗ cần `string`.
2. **Wiring thực tế cần 5 điểm, không phải 4**: docs nội bộ trước đây ghi 4 (permissions / loader / index / tieu-tam-actions). Điểm 5 là **`services/api/package.json` dependency `"@citadel/module-soul-meeting": "workspace:*"`** — thiếu nó pnpm không symlink, tsc báo `Cannot find module`. Đã gồm trong WIRING.patch.
3. Host resolve `@citadel/*` qua **workspace symlink trong `services/api/node_modules`**, không phải tsconfig paths — root repo thậm chí không có `node_modules` tổng.

## 4. Lệch so khuôn Soul-Wallet (nâng cấp có chủ đích)
1. **TT execute Zod-parse**: wallet để `parameters` mở và KHÔNG parse trong execute (route mới parse) → đường Tiểu Tâm nhận raw params. Soul-Meeting parse `inputSchema` ngay trong execute: sai/thiếu → `ok:false` + "Thiếu/sai tham số: <fields>" tiếng Việt (bridge C1), không nổ lỗi DB khó hiểu. Shape `parameters` giữ nguyên khuôn (`type:object, properties:{}, additionalProperties:true`) — thỏa normalizeParams.
2. **Events qua đường Tiểu Tâm dùng noopBus** — GIỮ NGUYÊN precedent wallet (đã cân nhắc: emit từ TT cần outbox tx-aware của host, ngoài phạm vi 1A). Event vẫn bắn đủ qua HTTP route + nightly. Ghi rõ trong GUIDE §13.
3. Loader entry của soul-meeting có kèm `emit` hook rỗng? KHÔNG — bản chốt dùng đúng chữ ký wallet (`db/requireAuth/gate/audit`), emit để host nối sau qua deps khi cần (adapter nhận `emit?` optional).

## 5. Bug tự bắt & fix trong build (bằng test, không phải may)
1. **Harvest logic**: điều kiện `keyword && (bullet || @owner)` bỏ sót dòng bullet chỉ có @owner → sửa thành bullet+(keyword ∨ @owner); non-bullet cần cả hai. (smoke-harvest E1/E5)
2. **Similarity 0.556 < 0.6 miss trùng thật** ("Soạn hợp đồng thuê kho *trước ngày 25/07*" vs bản gốc): thêm containment (inter/min, guard tập nhỏ ≥3 token), lấy max với Jaccard. (E3)
3. **DECISION regex** không xuyên prefix `- [speaker]` của transcript → mở rộng regex. (smoke-recording E3)
4. **Query string vs Zod**: `limit`/`overdue_only` qua query là string → thêm coerce/union-transform; đồng thời test gọi service trực tiếp phải truyền đủ field có `.default()` (tsc bắt). (bridge A4/A8)
5. **numeric(9,4)** trả `'40.0000'` → assert bằng `Number()` thay so string. (smoke-live A1)

## 6. Giới hạn 1A (biết & chấp nhận)
- Diarization (tách người nói) chưa có — worker gán 1 speaker, module cho rename bulk.
- Cast ballot qua UI web chưa có nút per-participant (làm qua Tiểu Tâm/API); page 1A tập trung mở/đóng + đọc kết quả.
- `pass_basis='total'` với công ty nhập weight không chuẩn 100 tổng → mẫu số là Σweight thực nhập (đã document, không đoán hộ).
- Reminder gửi lại toàn bộ participants ở mốc 2 (không diff ai đã ack) — chấp nhận cho 1A.

## 7. Ranh giới kiến trúc (giữ đúng luật fortress)
- KHÔNG import module khác; Soul-Sale chỉ chạm qua `external_ref` + `caps.contacts` optional.
- KHÔNG import `@citadel/core`; contract.ts structural mirror.
- RLS FORCE trên 20 bảng + mọi query lọc `org_id` app-level (defense-in-depth).
- Biên bản published bất biến ở tầng service (MINUTES_IMMUTABLE), không dựa UI.
