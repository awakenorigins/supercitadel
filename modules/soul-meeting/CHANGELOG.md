# CHANGELOG — Soul-Meeting

## 1.0.0 (1A) — 2026-07-11
Bản đầu, đủ vòng đời họp cho SME VN:
- 20 bảng `smeet_*` + FORCE RLS theo `org_id`; audit riêng `smeet_audit`.
- Loại họp template (6 mặc định, seed idempotent) — "Họp HĐTV/HĐQT" mang
  quorum `capital_pct` 65/65 (Luật DN 2020 Đ.58 — **ngưỡng config**, không hardcode).
- Họp: draft/scheduled→in_progress→completed|cancelled · hygiene "publish agenda
  mới được start" (bật/tắt) · reschedule reset nhắc · cost snapshot đ/người/giờ.
- Series định kỳ rrule-lite (weekly byDays / monthly byMonthday ≤28, until/count),
  sinh occurrence rolling idempotent, copy agenda+người+chủ trì.
- Người dự: nội bộ + khách ngoài free-text (ref mềm Soul-Sale qua caps.contacts),
  RSVP, check-in đúng giờ/muộn theo LỊCH+grace, vắng (có) phép, chỉnh %vốn sau add.
- Agenda: reorder, publish gate ≥1 mục, parking-lot khi đang họp, run 1-active.
- Tài liệu pre-read + read-receipt "ai chưa đọc"; checklist; ghi chú theo mục.
- Biểu quyết: headcount & capital_pct (%vốn điều lệ, quorum tuyệt đối Σ% dự họp),
  phiếu người vắng vô hiệu lúc đóng, re-cast, pass_basis attending/total.
- Quyết định: consensus/chair/vote (vote phải đóng); event `sm.decision.recorded`.
- Việc: batch chống trùng (Jaccard+containment, bỏ dấu), lịch sử, complete,
  carry-over → agenda "Rà soát việc kỳ trước", quá hạn.
- Biên bản: compile snapshot → render VN (HĐTV đủ mục Điều 60: tỷ lệ vốn, kết quả
  từng biểu quyết, chữ ký THƯ KÝ/CHỦ TỌA) → draft→pending→approve(CHỈ chủ tọa)
  →publish **bất biến** → sửa = version mới. Feedback 1 lượt/người + summary.
- Harvest việc/quyết định từ text & transcript (deterministic, KHÔNG ghi DB,
  dedup gắn duplicate_of) — dry-run tự nhiên cho Tiểu Tâm.
- Ghi âm: máy trạng thái uploaded→queued→transcribing→done|failed(retry),
  ASR qua caps (thiếu → ASR_UNAVAILABLE degrade sạch), sửa segment, rename speaker.
- Báo cáo: tuần (Thứ 2 VN), KPI (đúng giờ/điểm danh/biên bản/việc/**chi phí**),
  digest cá nhân, xuất Excel việc (base64 + GET binary + downloadUrl TT).
- ICS RFC5545 subset tự viết (escape/fold 74 octet/CRLF).
- Nightly per-org: series rolling, nhắc 2 mốc chống lặp (caps.notify), event
  quá hạn, retention trả purge_candidates (module không xóa file).
- Tiểu Tâm: 10 read tools + 22 write actions (sensitive⇒L2 dry-run host),
  18 intents; TT execute Zod-parse (nâng so khuôn wallet).
- Web 6 tab thuần CSS token; wiring host 5 điểm (WIRING.patch).
