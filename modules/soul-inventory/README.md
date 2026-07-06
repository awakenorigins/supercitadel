# @citadel/module-soul-inventory — Soul-Inventory v2.1 · Quản lý Kho + Automation

> **Module kho FINAL cho SuperCitadel** — plug-and-play theo hợp đồng Citadel
> 8 mặt cắt. Đầy đủ nghiệp vụ CẢ bán lẻ/phân phối LẪN sản xuất/lắp ráp,
> hấp thụ tinh hoa Odoo stock / ERPNext / InvenTree / Medusa + 7 patterns
> từ module Kế Toán 10A (dry-run→confirm, contract mirror, WIRING.patch...).

**Store:** Mua vĩnh viễn **1.000 Ôm** · Thuê **150 Ôm / 30 ngày** · Trial 7 ngày

## Năng lực (29 định nghĩa cho Tiểu Tâm)

### Nền tảng (v1.x)
- **Danh mục**: SKU, ĐVT, định mức, barcode, **theo dõi lô / serial / hạn dùng**
- **Tồn 3 lớp**: stocked / reserved / incoming — available = stocked − reserved
- **Nhập–Xuất–Chuyển** với sổ bất biến, số phiếu tự động **PNK- / PXK-**
- **Giá vốn bình quân gia quyền** tự tính phía SQL
- **Đặt giữ hàng** create/release/fulfill, guard khả dụng atomic
- **Cảnh báo kép**: tồn thấp + lô cận hạn (FEFO)
- **Kiểm kê 05-VT** 2 bước xem lệch → chốt (KK-)
- **Thẻ kho S10-DN**, tổng quan kho, **backfill hệ cũ một lệnh**

### AUTOMATION v2.1 ⭐⭐
- **Safety stock + reorder point ĐỘNG**: z(service level)×stddev×√lead_time — tự cập nhật theo nhu cầu thật
- **EOQ**: lượng đặt tối ưu cân bằng chi phí đặt vs lưu kho
- **Demand forecasting**: moving average + exponential smoothing (SES đệ quy phía SQL) — không ML nặng
- **Projected inventory**: days_to_stockout + risk (high = ngắn hơn lead time)
- **ABC-XYZ matrix 9 ô** kèm chiến lược từng nhóm (AX = tự động hóa mạnh...)
- **Dead stock detection**: hàng ế N ngày + vốn đọng
- **runScheduledTasks(ctx)**: host cron gọi — pipeline minh bạch có log, KHÔNG chạy ngầm, KHÔNG tự tạo đơn

### Mới v2.0 ⭐
- **Multi-UoM**: 1 thùng = 24 lon — nhập/xuất theo quy cách, đơn giá tự quy về gốc, barcode riêng từng quy cách
- **FEFO/FIFO picking suggestion**: kế hoạch xuất lô nào trước, đủ/thiếu bao nhiêu
- **BOM + lắp ráp/tháo dỡ**: backflush nguyên liệu, giá vốn thành phẩm tự tính, max_buildable, LSX-/LTD-
- **Reorder rules min-max**: gợi ý đặt hàng về max, kèm NCC + lead time
- **Landed cost**: phân bổ phí vận chuyển/thuế NK vào giá vốn (by_value/by_qty), LC-
- **Scrap**: hủy hàng hỏng có sổ + giá trị thiệt hại, SCR-
- **ABC analysis** (Pareto 80/15/5) + **cycle counting** theo lớp + **stock aging**
- **Excel I/O**: nhập danh mục + tồn đầu kỳ (header Việt/Anh, báo lỗi từng dòng), xuất báo cáo tồn + thẻ kho
- **Barcode workflow**: quét mã item hoặc mã quy cách → tự hiểu factor
- **Dry-run→confirm protocol**: 8 actions nhạy cảm preview trước, xác nhận mới ghi; message tiếng Việt trả sẵn
- **Contract mirror + WIRING.patch**: build độc lập 100%, gắn host bằng một lệnh git apply

## Tuân thủ hợp đồng Citadel (8 mặt cắt)

| # | Mặt cắt | Hiện thực |
|---|---|---|
| ① | Manifest | id soul-inventory, semver 2.0.0, 8 permissions, 23 tools kind+sensitive+securityLevel, store pricing, conflicts ["inventory"] |
| ② | Vòng đời | onInstall (5 migrations) / onActivate / onDisable / onRemove(dropData opt-in) |
| ③ | Quyền | kho.<resource>.<action> — mọi tool gắn quyền |
| ④ | Dữ liệu | **21 bảng** đều org_id (+index); **FORCE RLS fail-closed** không fallback |
| ⑤ | Event bus | **26 events** kho.* payload luôn org_id |
| ⑥ | Tool chuẩn | name + kind + permission + securityLevel + sensitive + Zod inputSchema + docs + handler + message() |
| ⑦ | Biên canh gác | Zod parse tại tool handler lẫn route; **15 mã lỗi** máy đọc |
| ⑧ | Tự tài liệu | README + GUIDE + **TUTORIAL 19 bài** + TOOLS (giáo trình 29 định nghĩa) + EVENTS + CHANGELOG |

## Cấu trúc

```
soul-inventory/
├── manifest.json               ① 23 tools, store 1000/150 Ôm
├── WIRING.patch                gắn host một lệnh git apply
├── README.md  CHANGELOG.md     ⑧
├── docs/
│   ├── GUIDE.md                cài 3 bước, dry-run protocol, golden path 16 bước, FAQ
│   ├── TUTORIAL.md             17 bài học + checklist onboarding
│   ├── TOOLS.md                giáo trình 23 định nghĩa + 13 mã lỗi
│   └── EVENTS.md               24 events
├── migrations/                 0000→0006: 21 bảng + FORCE RLS + backfill + automation
├── src/
│   ├── index.ts                lifecycle ② · MODULE_ID='soul-inventory'
│   ├── contract.ts             mirror host types + executeAction dry-run protocol
│   ├── tools/index.ts          13 read + 16 write ⑥
│   ├── intents.ts              28 intents Việt/Anh
│   ├── routes.ts               33 routes /inventory/*
│   ├── db/schema.ts            Drizzle 21 bảng
│   ├── validation/schemas.ts   Zod ⑦ (24 schemas)
│   └── services/               14 services: catalog stock lot reservation stocktake
│                               report uom bom reorder picking landed_cost scrap
│                               analytics excel docnumber automation
└── tests/                      smoke 34 + v11 27 + v2 53 + v21 34 = 148 checks, PGlite non-superuser
```

## Bắt đầu nhanh

```bash
npm install
npm run test:smoke && npm run test:v11 && npm run test:v2 && npm run test:v21   # 148 checks Postgres thật
npm run audit                                                # 8 mặt cắt -> AUDIT_REPORT.md
```

Tích hợp: **docs/GUIDE.md** (3 bước hoặc git apply WIRING.patch).
Dạy Tiểu Tâm: manifest → TOOLS → TUTORIAL → EVENTS → intents.

## Nguồn gốc & license

Nền port logic **Medusa Inventory** (MIT, clean-room). v2 hấp thụ nghiệp vụ từ **Odoo stock** (removal strategies, landed cost, scrap, reorder), **ERPNext** (UoM conversion, valuation), **InvenTree** (BOM/build) — toàn bộ viết lại clean-room trên chuẩn Citadel fail-closed. Dry-run protocol + contract mirror + WIRING.patch hấp thụ từ module Kế Toán 10A nội bộ. Code theo license SuperCitadel.
