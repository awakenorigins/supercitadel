# Soul-Restaurant — Quản lý Nhà hàng cho SuperCitadel

> Từ mở bàn, gửi bếp đến tách bill và tự trừ kho — vận hành cả quán bằng một câu tiếng Việt với Tiểu Tâm.

**v1.2.0** · 42 năng lực (17 tra cứu + 25 thao tác) · 30 intents Việt/Anh · 43 HTTP routes · 22 bảng RLS fail-closed · 21 quyền · 38 events · **bảng điều khiển sống 100% (mọi năng lực = 1 nút thật)** · smoke test **126/126** (PGlite).

## Làm được gì

- **Sàn**: khu vực + bàn, sơ đồ trạng thái thời gian thực, chuyển bàn, gộp bàn.
- **Menu**: món/danh mục/trạm bếp, nhóm tùy chọn (size/topping/phụ thu, min–max), combo (chặn combo lồng), báo hết món 1 câu.
- **Đơn**: tại bàn / mang về / giao đi, gọi món khớp tên mờ, hủy món có lý do + dấu vết đã-gửi-bếp, giảm giá %/tiền.
- **Bếp**: KOT tách theo trạm, KDS FIFO + tuổi phiếu, luồng trạng thái chỉ tiến, lên món đồng bộ.
- **Tiền**: BigInt fixed-point; phí phục vụ + VAT gộp/cộng ngoài; tách bill phân bổ giảm giá tỷ lệ — bill cuối nhận dư, Σ bill == Σ đơn; thanh toán đa phương thức, tiền thối không bẩn doanh thu; "tính tiền bàn 5" một câu tự tạo bill → thu → đóng đơn → thả bàn.
- **Đặt bàn**: chống trùng khung giờ, seat = mở đơn một chạm, no-show/hủy có dấu vết.
- **Báo cáo**: doanh thu ngày/khoảng, theo phương thức, theo loại đơn, top món.
- **Bảng điều khiển (v1.2)**: mọi năng lực (42) là một nút thật, render động từ catalog — không nút chết; có endpoint `GET /capabilities` + demo HTML bấm được. Dashboard tổng quan vận hành thời gian thực.
- **Ra món theo lượt (v1.2)**: `fire_course` gửi bếp từng course theo trình tự phục vụ.
- **Khuyến mãi (v1.1)**: voucher có mã, happy-hour theo khung giờ, đơn tối thiểu, trần giảm, giới hạn lượt/khách; giảm KM gộp vào giảm giá nên tách bill vẫn đúng.
- **Khách thân thiết (v1.1)**: hồ sơ khóa theo SĐT, tích điểm % chi tiêu khi đóng đơn, đổi điểm trả tiền (1 điểm = 1đ), điều chỉnh điểm tay có vết.
- **Trừ kho tự động**: recipe theo SKU Soul-Inventory, event `resto.stock.deduct_requested` (combo bung thành phần) — không import chéo (luật ⑤).

## Cấu trúc

```
manifest.json / manifest.module.json   # mặt cắt ① — nguồn sự thật
migrations/ 0000..0003                  # ④ 22 bảng + FORCE RLS fail-closed
src/
  db/schema.ts                          # Drizzle schema
  lib/money.ts · codes.ts               # BigInt tiền/lượng · mã DH/BILL/KOT/RSV
  validation/schemas.ts                 # ⑦ Zod tại biên (31 schema)
  services/ (12 file)                   # …·customer·promotion·loyalty·console(dashboard)
  tools/index.ts                        # ⑥ registry 42 năng lực
  ui-catalog.ts                         # nguồn nút cho bảng điều khiển (audit 1:1)
web/ RestaurantConsole.tsx · api-client.ts · soul-restaurant-console.html  # bảng điều khiển sống 100%
  intents.ts                            # 20 intents cho Tiểu Tâm
  routes.ts                             # 31 endpoints (DI, không khóa Hono)
  contract.ts · index.ts                # mirror host · ② lifecycle
server/host-adapter.ts · tieu-tam-actions.ts  # bind SuperCitadel
tests/smoke.test.ts                     # 95 checks PGlite
docs/ TOOLS·GUIDE·TUTORIAL·INSTALL·EVENTS      # ⑧ giáo trình Tiểu Tâm
scripts/audit.mjs → AUDIT_REPORT.md
WIRING.patch                            # 4 điểm chạm host
```

## Bắt đầu nhanh

```bash
npm install && npm run typecheck && npm run test && npm run audit
# cắm vào host: docs/INSTALL.md + WIRING.patch
```

## Giá trên cửa hàng

Mua vĩnh viễn **1.000 Ôm** · Thuê **150 Ôm/30 ngày** · Dùng thử **7 ngày**.

## Roadmap v1.3

In bếp vật lý ESC/POS · hóa đơn điện tử (NĐ 70/2025) · tích hợp GrabFood/ShopeeFood · thuế suất theo món (`tax_rate` đã reserved) · đặt bàn auto-hold + đặt cọc · nghe `kho.stock.low` tự báo hết món · refund có kiểm soát · tỷ giá đổi điểm tùy biến · đa chi nhánh 1 org.
