# Soul-Inventory — Giáo Trình Module Quản Lý Kho

## Giới thiệu

Soul-Inventory là module Quản lý Kho (Inventory/WMS) đầy đủ nghiệp vụ bán lẻ, phân phối và sản xuất cho SuperCitadel: danh mục vật tư, nhập/xuất/chuyển kho theo chứng từ VN (PNK 01-VT, PXK 02-VT), lot/serial/expiry với FEFO/FIFO picking, Multi-UoM (thùng↔lon) + barcode, BOM lắp ráp/tháo dỡ backflush, giữ hàng (reservation), kiểm kê, reorder min-max, landed cost, scrap, giá vốn bình quân, thẻ kho S10-DN, ABC-XYZ, stock aging, nhập/xuất Excel. Automation v2.1 chỉ ĐỀ XUẤT (không tự tạo đơn): dự báo nhu cầu (MA/SES), safety stock + reorder point động, EOQ, chiếu tồn tương lai (ngày hết hàng), phát hiện hàng chết. Tiểu Tâm thao tác toàn bộ bằng tiếng Việt với dry-run→confirm cho mọi hành động ghi sổ.

Route gốc: `/api/v1/soul-inventory`. Bảng dữ liệu dùng tiền tố `kho_` (21 bảng, RLS fail-closed, không đụng module `inventory` cũ).

## Chức năng

| Nghiệp vụ | Endpoint | Quyền |
|---|---|---|
| Thêm/sửa vật tư | `POST /api/v1/soul-inventory/items` | kho.item.write |
| Tra cứu tồn kho | `GET /api/v1/soul-inventory/stock` | kho.stock.read |
| Nhập kho (PNK) | `POST /api/v1/soul-inventory/stock/receive` | kho.stock.write |
| Xuất kho (PXK) | `POST /api/v1/soul-inventory/stock/issue` | kho.stock.write |
| Chuyển kho | `POST /api/v1/soul-inventory/stock/transfer` | kho.stock.write |
| Cảnh báo tồn thấp | `GET /api/v1/soul-inventory/stock/low-alerts` | kho.stock.read |
| Cảnh báo cận hạn (expiry) | `GET /api/v1/soul-inventory/stock/expiry-alerts` | kho.stock.read |
| Thẻ kho S10-DN | `GET /api/v1/soul-inventory/stock/card/:sku` | kho.stock.read |
| Tổng quan kho | `GET /api/v1/soul-inventory/summary` | kho.stock.read |
| Giữ hàng (reservation) | `POST /api/v1/soul-inventory/reservations` | kho.reservation.write |
| Kiểm kê | `POST /api/v1/soul-inventory/stocktakes` | kho.stocktake.write |
| Quy cách đóng gói (UoM) | `POST /api/v1/soul-inventory/uoms` | kho.item.write |
| Tra barcode | `GET /api/v1/soul-inventory/barcode/:code` | kho.stock.read |
| Định mức BOM | `POST /api/v1/soul-inventory/boms` | kho.item.write |
| Lắp ráp/tháo dỡ | `POST /api/v1/soul-inventory/assembly` | kho.stock.write |
| Quy tắc đặt hàng lại | `POST /api/v1/soul-inventory/reorder-rules` | kho.item.write |
| Gợi ý đặt hàng | `GET /api/v1/soul-inventory/reorder-suggestions` | kho.stock.read |
| Gợi ý soạn hàng FEFO/FIFO | `POST /api/v1/soul-inventory/picking-suggest` | kho.stock.read |
| Phân bổ landed cost | `POST /api/v1/soul-inventory/landed-costs` | kho.stock.write |
| Hủy hàng (scrap) | `POST /api/v1/soul-inventory/scrap` | kho.stock.write |
| Phân tích ABC | `POST /api/v1/soul-inventory/abc-analysis` | kho.stocktake.write |
| Analytics (aging/cycle count) | `GET /api/v1/soul-inventory/analytics` | kho.stock.read |
| Nhập Excel danh mục/tồn | `POST /api/v1/soul-inventory/excel/import-items` | kho.item.write |
| Xuất Excel tồn/thẻ kho | `GET /api/v1/soul-inventory/excel/export-stock` | kho.stock.read |
| Tham số bổ sung hàng | `POST /api/v1/soul-inventory/replenish-params` | kho.item.write |
| Gợi ý bổ sung thông minh | `GET /api/v1/soul-inventory/replenish-suggestions` | kho.stock.read |
| Chiếu tồn tương lai | `GET /api/v1/soul-inventory/projected` | kho.stock.read |
| Phát hiện hàng chết | `GET /api/v1/soul-inventory/dead-stock` | kho.stock.read |
| Phân tích XYZ | `POST /api/v1/soul-inventory/xyz-analysis` | kho.stocktake.write |
| Chạy automation đêm | `POST /api/v1/soul-inventory/automation/run` | kho.stocktake.write |

## Hướng dẫn sử dụng

1. **Kích hoạt module:** vào Cửa hàng Module → mua/thuê Soul-Inventory (mua 1.000 Ôm / thuê 30 ngày 150 Ôm / trial 7 ngày). Gate `requireModule('soul-inventory')` mở khi org active.
2. **Lập danh mục:** thêm vật tư (`POST /items` — SKU, đơn vị, ngưỡng tồn thấp, theo dõi lot/serial/expiry nếu cần), khai quy cách UoM (thùng = 24 lon) và barcode.
3. **Nhập – Xuất – Chuyển:** mọi hành động ghi sổ đều nhạy cảm → Tiểu Tâm chạy **dry-run trước** (xem trước thông số), người dùng xác nhận mới ghi thật. Xuất kho có guard tồn khả dụng, bắt buộc chọn lot/serial nếu item có theo dõi; hệ thống gợi ý FEFO (hết hạn trước xuất trước).
4. **Sản xuất & chi phí:** khai BOM rồi lắp ráp/tháo dỡ (tự trừ nguyên liệu, tính giá vốn thành phẩm); phân bổ landed cost vào giá vốn; hủy hàng hỏng qua scrap.
5. **Kiểm kê & phân tích:** chạy phiên kiểm kê chốt lệch; ABC-XYZ + stock aging + cycle count để biết hàng nào đáng tiền; báo cáo thẻ kho S10-DN và tổng quan.
6. **Automation đêm:** host tự chạy `runScheduledTasks` per-org mỗi đêm (~02:00) — cập nhật dự báo nhu cầu, reorder point động, cảnh báo bổ sung hàng và hàng chết. Chỉ đề xuất, không tự tạo đơn.
7. **Bảo mật:** 7 hành động ghi sổ lớn (nhập/xuất/chuyển/kiểm kê/lắp ráp/hủy/landed cost) là lớp 2 — cần xác thực cấp 2. Dữ liệu mỗi tổ chức cô lập theo org_id (app-level) + RLS fail-closed trên cả 21 bảng (defense-in-depth).

## Ví dụ

- **"Nhập 5 thùng Coca lô L2607 hạn 31/12 vào kho A"** → Tiểu Tâm gọi `kho.stock.receive` → dry-run xem trước (quy đổi 5 thùng = 120 lon, lô L2607) → xác nhận → tạo PNK, tồn + giá vốn bình quân tự cập nhật.
- **"Xuất 30 lon Coca bán cho khách"** → Tiểu Tâm gọi `kho.stock.issue` → gợi ý FEFO lô cận hạn trước → dry-run → xác nhận → tạo PXK, trừ tồn.
- **"Kho còn gì sắp hết hàng?"** → Tiểu Tâm gọi `kho.stock.low_alerts` → trả danh sách vật tư dưới ngưỡng + gợi ý số lượng đặt lại.
- **"Lắp 10 giỏ quà Tết từ BOM"** → Tiểu Tâm gọi `kho.assembly.execute` → dry-run kiểm tra đủ nguyên liệu → xác nhận → trừ nguyên liệu, nhập thành phẩm kèm giá vốn.
- **"Hàng nào nằm chết trong kho 3 tháng nay?"** → Tiểu Tâm gọi `kho.analytics.dead_stock` → trả danh sách hàng không phát sinh xuất + giá trị tồn đọng.

## Changelog

- **2.1.0** (2026-07-06): Tích hợp SuperCitadel R11.4 qua host-adapter (loader + catalog + PERMISSION_REGISTRY 8 quyền kho.* + Tiểu Tâm 13 read tools + 16 write actions dry-run→confirm + cron automation per-org do host điều phối). AUTOMATION LAYER: dự báo MA/SES, reorder point động, EOQ, ABC-XYZ, projected inventory, dead stock. Namespace `kho_` (21 bảng) để cùng tồn tại với module `inventory` cũ.
- **2.0.0**: UoM/barcode, BOM lắp ráp/tháo dỡ, reorder min-max, landed cost, scrap, ABC + cycle count, stock aging, Excel import/export, số chứng từ tự động.
- **1.1.0**: Lot/serial/expiry, FEFO/FIFO picking, giá vốn bình quân, thẻ kho S10-DN.
- **1.0.0**: Nền tảng kho: items, nhập/xuất/chuyển, reservation, stocktake, cảnh báo tồn thấp, RLS fail-closed.
