# Changelog — Soul-Manager

## [1.0.0] — 2026-07-05

### Thêm mới
- 18 bảng Drizzle chuẩn mặt cắt ④ (org_id + index + timestamps), FORCE RLS fail-closed toàn bộ, không coalesce fallback.
- Engine bảng lương VN: lương ngày công, phụ cấp chịu/không chịu thuế, OT 150/200/300% (phần phụ trội miễn thuế TNCN), BHXH/BHYT/BHTN với trần đóng effective-dated (2,34tr → 2,53tr từ 01/7/2026) + sàn LTT vùng 2026, luật ≥14 ngày không lương không đóng BH, thuế TNCN lũy tiến 5 bậc theo Luật 109/2025/QH15, giảm trừ gia cảnh 15,5tr/6,2tr (NQ 110/2025).
- `src/money.ts`: số học decimal BigInt trên chuỗi — Hiến pháp #5, không Number() cho tiền.
- Nghỉ phép BLLĐ 2019: 12 ngày + thâm niên, guard số dư bằng UPDATE có điều kiện phía SQL.
- Chấm công: ca HC mặc định, muộn/sớm tự tính, guard trùng ngày (allow_update opt-in).
- Tuyển dụng pipeline 6 stage; Đào tạo enroll/complete idempotent.
- 8 read tools + 10 write actions cho Tiểu Tâm; 13 intents Việt/Anh; 18 routes.
- Migration 0002 backfill idempotent từ module `hr` cũ (departments/employees).
- Test: 54 checks engine lương + 76 checks smoke PGlite trên role non-superuser. Audit 8 mặt cắt tự động.

### Ghi chú pháp lý
Mọi tỷ lệ/mức trong `src/config.ts` là mặc định theo quy định hiện hành 07/2026 và **cấu hình được qua `hr_settings.policy`** — cập nhật khi pháp luật thay đổi, không sửa code.
