# Soul-Manager — Quản lý Nhân sự cho SuperCitadel

Module HRM thu phí, plug-and-play theo hợp đồng Citadel 8 mặt cắt (§05), Tiểu Tâm thao tác được **mọi** nghiệp vụ bằng tiếng Việt. Nghiệp vụ chuẩn Việt Nam, đúng luật hiện hành 2026, **mọi con số pháp lý cấu hình được**.

## Năng lực

| Domain | Nội dung |
|---|---|
| Hồ sơ nhân viên | Mã tự sinh, CCCD/MST/BHXH, phòng ban, chức danh, quản lý trực tiếp, liên hệ khẩn cấp, hợp đồng |
| Cơ cấu tổ chức | Phòng ban phân cấp cha-con, chức danh, sơ đồ + headcount |
| Chấm công | Ca làm việc, check-in/out (tự tính muộn/sớm), OT 3 hệ số 150/200/300%, bảng công tháng |
| Nghỉ phép | 12 ngày phép năm + 1 ngày/5 năm thâm niên (BLLĐ 2019), guard số dư phía SQL, duyệt/từ chối |
| **Bảng lương** | BHXH 8% + BHYT 1,5% + BHTN 1%, **trần đóng effective-dated** (20× tham chiếu / 20× LTT vùng), sàn LTT vùng, luật ≥14 ngày không đóng BH, **thuế TNCN lũy tiến 5 bậc** (Luật 109/2025/QH15), giảm trừ 15,5tr/6,2tr, **OT phần phụ trội miễn thuế**, phiếu lương kèm giải thích tiếng Việt |
| Tuyển dụng | Vị trí tuyển, pipeline 6 stage ứng viên |
| Đào tạo | Khóa học, ghi danh, hoàn thành kèm điểm |

## Cấu trúc

```
soul-manager/
├── manifest.json          # ① nguồn sự thật
├── migrations/            # 0000 DDL 18 bảng · 0001 FORCE RLS · 0002 backfill hr cũ
├── src/
│   ├── index.ts           # ② lifecycle hooks + public API
│   ├── money.ts           # decimal BigInt — không Number() cho tiền
│   ├── config.ts          # chính sách pháp lý VN 2026 (default, override qua policy)
│   ├── db/schema.ts       # ④ 18 bảng org_id + timestamps
│   ├── validation/        # ⑦ Zod tại biên
│   ├── services/          # 8 service: org/employee/attendance/leave/payroll/report/recruitment/training
│   ├── tools/             # ⑥ 8 read tools + 10 write actions
│   ├── intents.ts         # patterns Việt/Anh cho Tiểu Tâm
│   └── routes.ts          # 18 routes framework-neutral
├── docs/                  # ⑧ GUIDE · TUTORIAL · TOOLS · EVENTS
├── tests/                 # payroll (54 checks) + smoke PGlite (76 checks)
└── scripts/audit.mjs      # audit hợp đồng 8 mặt cắt
```

## Cài vào SuperCitadel (3 bước)

1. Copy thư mục vào `packages/modules/soul-manager`, thêm workspace `@citadel/module-soul-manager`.
2. Host gọi `onInstall({ db, bus })` (chạy 3 migrations — idempotent, backfill hr cũ tự nhận diện) rồi `onActivate({ db, bus, registry })` để đăng ký 18 tools + intents.
3. Bind `createHrRoutes()` vào Hono với middleware chuẩn (auth → rbac → tenant-rls). **Kết nối DB bằng role KHÔNG superuser** — RLS chỉ có hiệu lực thật với role thường.

## Test & Audit

```bash
npm run typecheck      # TypeScript strict, 0 lỗi
npm run test:payroll   # engine lương — 54 checks số pháp lý cụ thể
npm run test:smoke     # PGlite + role citadel_app — 76 checks golden path + RLS
npm run audit          # hợp đồng 8 mặt cắt → AUDIT_REPORT.md
```

## Store

Mua vĩnh viễn **1.800 Ôm** · Thuê 30 ngày **250 Ôm** · Dùng thử **7 ngày**.
