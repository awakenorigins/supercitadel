# GUIDE — Soul-Meeting 1A (nghiệp vụ + vận hành)

## 1. Tư tưởng
Họp ở SME Việt thất thoát vì: không agenda, không ai chốt, việc nói rồi bay,
biên bản HĐTV làm tay sai luật, và **không ai thấy chi phí họp**. Module ép
kỷ luật nhẹ (hygiene bật/tắt), đo tiền, và để Tiểu Tâm làm thư ký.

## 2. Vòng đời một cuộc họp
```
(tạo từ loại họp → copy agenda+checklist, snapshot đơn giá)
draft/scheduled ── start (chặn nếu hygiene bật & agenda chưa publish) ──▶ in_progress
in_progress: run agenda 1-active · parking-lot · biểu quyết · quyết định · ghi chú
in_progress ── finish (đóng mục đang chạy, tính phút) ──▶ completed
draft/scheduled ── cancel(+lý do) ──▶ cancelled   (completed/cancelled = khóa)
```
Reschedule chỉ khi draft/scheduled, tự reset 2 cờ nhắc.

## 3. Họp định kỳ (series)
Rule tự viết (không rrule.js): `freq daily/weekly/monthly + interval + by_days
(MO..SU) | by_monthday (1..28) + until_date | max_count`, mốc giờ giữ theo
anchor, offset **+07:00 cố định**. Nightly sinh occurrence cửa sổ 35 ngày,
idempotent theo (series_id, start_at); occurrence copy agenda snapshot,
participants, chủ trì/thư ký. `by_monthday` chặn 29–31 để không "trôi" tháng thiếu.

## 4. Người dự & điểm danh
- Nội bộ: `user_id`. Khách ngoài: `external_name/email` + `external_ref`
  (id contact Soul-Sale — **ref mềm**, có `caps.contacts` thì gợi ý, không thì thôi).
- Check-in so **giờ LỊCH** `start_at + grace` (mặc định 5p): kịp → `present`,
  trễ → `late`. Vắng (có) phép set tay. Chủ trì/thư ký/creator auto-add —
  chỉnh `%vốn` sau bằng `POST /participants/update`.
- Role `informed` = nhận thông tin, **không được bỏ phiếu**, không tính điểm danh KPI.

## 5. Biểu quyết — toán quorum
`vote_weight` nhập là **% vốn điều lệ** của thành viên (tổng công ty = 100).
- `capital_pct`: quorum = Σ%vốn của người **dự họp** (present/late) ≥ ngưỡng
  (tuyệt đối — đúng Đ.58 "sở hữu từ 65% vốn điều lệ"). Pass: mẫu số
  `attending` = Σ%vốn dự họp (phiếu trắng coi như chống) | `total` = Σ%vốn đủ tư cách.
- `headcount`: như trên nhưng đếm đầu người.
- Phiếu chốt hợp lệ **tại thời điểm đóng**: người không present/late → phiếu
  vô hiệu (đếm `invalid_count`). Re-cast được khi vote còn mở.
- Ngưỡng nằm ở từng vote/loại họp — Điều lệ mỗi công ty mỗi khác, **không hardcode luật**.

## 6. Biên bản (Điều 60 LDN 2020)
`generate` compile snapshot (người+%vốn, agenda+ghi chú, từng biểu quyết:
hợp lệ/vô hiệu/tally/túc số/tỷ lệ/THÔNG QUA, quyết định, phân công, chi phí)
→ render Markdown VN, loại `capital_pct` theo form HĐTV + bảng ký THƯ KÝ/CHỦ TỌA.
Flow: `draft → submit → pending_approval → approve (CHỈ user == chair_user_id)
→ publish`. Loại không yêu cầu duyệt: publish thẳng từ draft.
**Published = bất biến** — sửa nữa là `generate` version mới. Reject kèm lý do,
quay về sửa được.

## 7. Việc cần làm
- Batch **chống trùng**: chuẩn hóa bỏ dấu → max(Jaccard, containment khi tập
  nhỏ ≥3 token) ≥ 0.6 so với việc **đang mở toàn org** → skip + báo trùng việc nào.
- Carry-over sang họp chưa diễn ra: bản cũ → `carried_over` (khóa) + trỏ kỳ mới;
  kỳ mới nhận bản open gắn agenda **"Rà soát việc kỳ trước"** (sortOrder -1,
  detail liệt kê). Chạy lại = 0 (không nhân đôi).
- `overdue`: `due_date <` hôm nay & đang mở; nightly bắn `sm.actionitem.overdue`.

## 8. Harvest (bóc việc/quyết định)
Deterministic, offline, **không ghi DB**:
- Việc: dòng checkbox `[ ]`; bullet có (từ khóa giao việc **hoặc** @owner);
  dòng thường cần **cả hai**. Bóc `owner_hint` (@token | sau "giao …"),
  `due_hint` (ISO | dd/mm(/yyyy) → ISO).
- Quyết định: `Quyết định:|Chốt:|Kết luận:` (chịu prefix bullet + `[speaker]`).
- Mỗi việc đề xuất dò trùng → `duplicate_of`.
Transcript: segments được bullet-hóa `- [speaker] text` rồi đi cùng đường.
Luồng Tiểu Tâm: `sm.harvest_text` (xem trước) → user gật → `sm.create_actions_batch`.

## 9. Ghi âm & ASR
`register` (file_ref trỏ kho file host) → `transcribe` cần `caps.asr`
(sidecar Python — xem scripts/asr-worker-reference/). Máy trạng thái
uploaded→queued→transcribing→done|failed; failed re-request được, segments
ghi đè sạch. Sửa từng segment (lưu edited_by/at), rename speaker hàng loạt.
Retention: nightly trả `purge_candidates` (quá `audio_retention_days`) —
**file thuộc host**, module không xóa.

## 10. Báo cáo & chi phí
- Tuần: Thứ 2 00:00 VN → 7 ngày.
- KPI kỳ: on_time (actual_start ≤ lịch+5p), điểm danh (present+late / đủ tư cách,
  họp completed), % biên bản published, avg feedback, việc tạo/xong/%/quá hạn,
  **chi phí = phút thực × người dự × đơn giá/60** (đơn giá snapshot lúc tạo họp).
- Digest cá nhân: họp 7 ngày tới + việc mở của tôi (+cờ quá hạn).
- Excel việc: JSON base64 qua route, binary qua `GET /actions/export.xlsx`,
  Tiểu Tâm trả `downloadUrl` → Shell render nút tải.
- ICS: `GET /meetings/:id/ics` (UID ổn định, CANCELLED khi hủy).

## 11. Nhắc lịch (nightly / POST /scheduled/run)
2 mốc `remind_hours_1` (mặc định 24h) & `remind_hours_2` (1h). Cờ `reminded_1/2`
chống lặp; reschedule reset cờ. Có `caps.notify` thì gửi từng người (bỏ
`rsvp=declined`), không có thì chỉ đếm. Kèm: series rolling + overdue events
+ purge_candidates. Host cron đã nối `startSoulMeetingNightlyAutomation`.

## 12. Capabilities (degrade sạch)
| caps | thiếu thì |
|---|---|
| `asr.transcribe` | `ASR_UNAVAILABLE`, trạng thái giữ nguyên |
| `notify` | nhắc chỉ set cờ + đếm, không gửi |
| `contacts` | suggest khách ngoài trả `[]` |

## 13. Events (outbox)
`sm.meeting.scheduled|started|completed|cancelled`, `sm.vote.closed`,
`sm.decision.recorded`, `sm.actionitem.created|overdue`,
`sm.minutes.published`, `sm.recording.queued|transcribed` — đều mang `org_id`.
Lưu ý: đường Tiểu Tâm dùng noopBus (khuôn wallet) — event bắn qua HTTP route
& nightly.

## 14. Quyền (14, dotted — PERMISSION_REGISTRY)
đọc: `sm.meeting.read` `sm.actionitem.read` `sm.report.read` ·
ghi: `sm.meeting.write`* `sm.agenda.write` `sm.participant.write`*
`sm.decision.write`* `sm.vote.manage`* `sm.minutes.write`
`sm.minutes.approve`* `sm.minutes.publish`* `sm.actionitem.write`
`sm.recording.manage`* `sm.settings.manage`*  (* = level 2 sensitive).
Role `manager` được cấp `sm.*`.
