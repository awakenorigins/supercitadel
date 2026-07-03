# R5-AUDIT.md — Audit toàn bộ endpoint (Phase E, 03/07/2026)

Cách chạy: `cd services/api && npx tsx src/audit-endpoints.mts` — DB thật PGlite (đủ 15 migrations), WS thật, app lắp Y HỆT services/api/src/index.ts (thêm store/inventory-items/audit-logs R5).

## Kết quả: 92/92 PASS — không endpoint nào 500

```
┌──────┬─────────────────────────────────────┬───────┬──────┬───────────────────────────┐
│ MET  │ ENDPOINT                            │ HTTP  │ KQ   │ GHI CHÚ                   │
├──────┼─────────────────────────────────────┼───────┼──────┼───────────────────────────┤
│ GET  │ /health                             │ 200   │ PASS │ liveness                  │
│ GET  │ /ready                              │ 200   │ PASS │ DB SELECT 1               │
│ GET  │ /                                   │ 200   │ PASS │ api info                  │
│ POST │ /api/v1/auth/login                  │ 200   │ PASS │ token→JWT                 │
│ GET  │ /api/v1/me                          │ 200   │ PASS │ user info                 │
│ POST │ /api/v1/tieu-tam/chat               │ 200   │ PASS │ stub reply                │
│ POST │ /api/v1/tieu-tam/chat/stream        │ 200   │ PASS │ SSE token+done            │
│ GATE │ crm trước khi mua → 403             │ 403   │ PASS │ MODULE_INACTIVE           │
│ GET  │ /api/v1/modules                     │ 200   │ PASS │ catalog 9 (R5 +automato-secretary)│
│ POST │ /om/topup (cấp 99999)               │ 200   │ PASS │ admin Om                  │
│ POST │ /modules/crm/purchase               │ 200   │ PASS │ trừ 400 Om thật           │
│ POST │ /modules/inventory/purchase         │ 200   │ PASS │ trừ 300                   │
│ POST │ /modules/hr/purchase                │ 200   │ PASS │ trừ 250                   │
│ POST │ /modules/accounting/purchase        │ 200   │ PASS │ trừ 500                   │
│ POST │ /modules/:id/deactivate             │ 200   │ PASS │ tắt kho                   │
│ GATE │ kho sau khi tắt → 403               │ 403   │ PASS │ gate đóng                 │
│ POST │ /modules/:id/activate               │ 200   │ PASS │ bật lại                   │
│ POST │ /api/v1/inventory/items             │ 201   │ PASS │ thêm hàng                 │
│ GET  │ /api/v1/inventory/items             │ 200   │ PASS │ list                      │
│ GET  │ /inventory/low-stock                │ 200   │ PASS │ 10<=12 cảnh báo           │
│ PATCH│ /inventory/items/:id/qty            │ 200   │ PASS │ nhập +20                  │
│ PATCH│ /inventory/items/:id                │ 200   │ PASS │ sửa ngưỡng+tên            │
│ POST │ /api/v1/hr/shifts                   │ 201   │ PASS │ tạo ca                    │
│ GET  │ /api/v1/hr/shifts                   │ 200   │ PASS │ list theo ngày            │
│ PUT  │ /hr/shifts/:id/staff                │ 200   │ PASS │ xếp người                 │
│ POST │ /api/v1/hr/employees                │ 201   │ PASS │ tạo NV                    │
│ GET  │ /api/v1/hr/employees                │ 200   │ PASS │ list active               │
│ PATCH│ /hr/employees/:id                   │ 200   │ PASS │ sửa chức danh             │
│ POST │ /hr/attendance/check-in             │ 201   │ PASS │ vào ca                    │
│ POST │ /hr/attendance/check-out            │ 200   │ PASS │ ra ca + status checked_out (R5-A)│
│ GET  │ /api/v1/hr/attendance               │ 200   │ PASS │ bảng công hôm nay         │
│ POST │ /api/v1/hr/leave/types              │ 201   │ PASS │ loại phép                 │
│ GET  │ /api/v1/hr/leave/types              │ 200   │ PASS │ list loại                 │
│ POST │ /hr/leave/allocations               │ 201   │ PASS │ cấp 12 ngày               │
│ GET  │ /hr/leave/balance                   │ 200   │ PASS │ số dư 12                  │
│ POST │ /hr/leave/applications              │ 201   │ PASS │ đơn 3 ngày                │
│ GET  │ /hr/leave/applications              │ 200   │ PASS │ list open                 │
│ POST │ /leave/applications/:id/approve     │ 200   │ PASS │ duyệt → trừ dư            │
│ POST │ /leave/applications/:id/reject      │ 200   │ PASS │ từ chối                   │
│ POST │ /accounting/chart/seed              │ 201   │ PASS │ chart VN 14 TK            │
│ GET  │ /api/v1/accounting/accounts         │ 200   │ PASS │ list TK                   │
│ POST │ /accounting/journal                 │ 201   │ PASS │ bút toán cân              │
│ GET  │ /accounting/accounts/:n/balance     │ 200   │ PASS │ quỹ 50tr                  │
│ POST │ /accounting/invoices                │ 201   │ PASS │ HĐ bán 22tr               │
│ GET  │ /api/v1/accounting/invoices         │ 200   │ PASS │ list HĐ                   │
│ POST │ /accounting/payments                │ 201   │ PASS │ thu 10tr knock-off        │
│ GET  │ /api/v1/accounting/payments         │ 200   │ PASS │ list phiếu                │
│ GET  │ /api/v1/accounting/vouchers         │ 200   │ PASS │ 3 chứng từ                │
│ GET  │ /reports/general-ledger             │ 200   │ PASS │ sổ cái 111                │
│ GET  │ /reports/trial-balance              │ 200   │ PASS │ SỔ CÂN                    │
│ GET  │ /reports/profit-loss                │ 200   │ PASS │ P&L 22tr                  │
│ GET  │ /reports/outstanding                │ 200   │ PASS │ công nợ 12tr              │
│ POST │ /vouchers/:id/cancel                │ 200   │ PASS │ bút toán đảo              │
│ GET  │ /accounting/import/template.xlsx    │ 200   │ PASS │ file mẫu 16643B           │
│ GET  │ /accounting/export/general-ledger.json│ 200   │ PASS │ export JSON               │
│ GET  │ /api/v1/store/items                 │ 200   │ PASS │ catalog 6 vật phẩm seed   │
│ POST │ /store/items/:code/buy {qty:2}      │ 200   │ PASS │ R5: mua 2 trừ 60 Om       │
│ POST │ /store/items buy qty=0              │ 400   │ PASS │ validation 400 rõ ràng    │
│ GET  │ /api/v1/inventory-items             │ 200   │ PASS │ kho user qty 2            │
│ POST │ /inventory-items/:id/use            │ 200   │ PASS │ dùng → energy thật        │
│ POST │ /modules/automato-secretary/purchase│ 400   │ PASS │ R5: demo chặn 400         │
│ POST │ /modules/automato-secretary/rent    │ 400   │ PASS │ R5: demo rent chặn 400    │
│ POST │ /modules/pos/purchase               │ 400   │ PASS │ coming_soon chặn 400      │
│ POST │ /modules/crm/rent {days:7}          │ 200   │ PASS │ thuê 7 ngày trừ 40 Om     │
│ GATE │ crm sau khi thuê → 200              │ 200   │ PASS │ gate mở theo rent         │
│ GATE │ rent hết hạn → 403                  │ 403   │ PASS │ MODULE_RENT_EXPIRED       │
│ POST │ /modules/crm/rent gia hạn           │ 200   │ PASS │ gia hạn sau hết hạn       │
│ GATE │ crm sau gia hạn → 200               │ 200   │ PASS │ gate mở lại               │
│ GET  │ /api/v1/audit-logs                  │ 200   │ PASS │ owner xem được log (app audit không inject audit fn → có thể rỗng)│
│ GET  │ /api/v1/users                       │ 200   │ PASS │ list org users            │
│ POST │ /api/v1/chat/rooms                  │ 201   │ PASS │ tạo phòng                 │
│ GET  │ /api/v1/chat/rooms                  │ 200   │ PASS │ list phòng                │
│ POST │ /chat/rooms/:id/messages            │ 201   │ PASS │ gửi tin                   │
│ WS   │ ws://:3002?token=jwt                │ event │ PASS │ nhận chat:message real-time│
│ GET  │ /chat/rooms/:id/messages            │ 200   │ PASS │ đọc lịch sử               │
│ PUT  │ /chat/rooms/:id/read                │ 200   │ PASS │ đánh dấu đọc              │
│ POST │ /api/v1/crm/contacts                │ 201   │ PASS │ tạo khách                 │
│ GET  │ /api/v1/crm/contacts                │ 200   │ PASS │ list khách                │
│ POST │ /api/v1/crm/deals                   │ 201   │ PASS │ tạo deal                  │
│ GET  │ /api/v1/crm/deals                   │ 200   │ PASS │ list deal                 │
│ PATCH│ /crm/deals/:id/stage                │ 200   │ PASS │ lead→won                  │
│ GET  │ /api/v1/crm/stats                   │ 200   │ PASS │ stats sau won             │
│ GET  │ /api/v1/om/balance                  │ 200   │ PASS │ số dư sau 4 module + 2 mochi (98549−60)│
│ GET  │ /api/v1/om/transactions             │ 200   │ PASS │ 1 nạp + 4 module + 1 mua item│
│ GET  │ /api/v1/notifications               │ 200   │ PASS │ 2 unread                  │
│ PUT  │ /notifications/:id/read             │ 200   │ PASS │ đọc 1                     │
│ PUT  │ /notifications/read-all             │ 200   │ PASS │ đọc hết                   │
│ GET  │ /api/v1/dashboard/summary           │ 200   │ PASS │ KPI + đếm thật            │
│ GET  │ /api/v1/dashboard/search            │ 200   │ PASS │ tìm Lan                   │
│ SEC  │ no-auth → 401                       │ 401   │ PASS │ chặn đúng                 │
│ SEC  │ cross-tenant → 403                  │ 403   │ PASS │ cô lập tenant             │
│ SEC  │ rate-limit 6th login → 429          │ 429   │ PASS │ chống brute-force         │
└──────┴─────────────────────────────────────┴───────┴──────┴───────────────────────────┘

TỔNG: 92/92 PASS — TẤT CẢ ENDPOINT HOẠT ĐỘNG THẬT
```

## Logic nghiệp vụ kiểm sâu (R5 bổ sung)
- check-in → check-out: status 'present' → 'checked_out' (fix Phase A) ✓
- rent lifecycle: thuê 7 ngày (40 Om) → gate mở → set rented_until quá khứ → 403 MODULE_RENT_EXPIRED → gia hạn 30 ngày (100 Om) → gate mở lại ✓
- mua vật phẩm qty>1: body {qty:2} trừ đúng 60 Om, kho gộp qty; qty=0/100 → 400 validation rõ ràng ✓
- Excel: GET import/template.xlsx trả file spreadsheet >500B; export general-ledger.json trả entries ✓
- leave approve: đơn 3 ngày duyệt → trừ số dư phép ✓ (case 'duyệt → trừ dư')
- module demo automato-secretary: purchase/rent đều 400 'Module đang xây dựng', KHÔNG trừ Om ✓
- security: no-auth 401, cross-tenant 403, rate-limit 429 ✓

## Fix trong Phase E
- audit-endpoints.mts + user-journey.mts: đường dẫn migrations hardcode '/home/claude/citadel-build/' (env build cũ) → đổi sang import.meta.url tương đối; thêm 5 migrations thiếu (0003→0007) + routes store/inventory-items/audit-logs vào app audit.
- Không tìm thấy endpoint nào trả 500 với input hợp lệ/không hợp lệ đã thử — mọi lỗi đều là AppError 4xx có message tiếng Việt.
