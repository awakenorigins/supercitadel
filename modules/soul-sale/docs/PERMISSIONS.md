# Soul-Sale 1A — PERMISSIONS.md

21 permission dotted-notation, prefix `soulsale.`. Nạp vào `packages/core/src/permissions.ts` bằng khối trong `integration/permissions-block.ts` (NẠP-MODULE Beat 2) và thêm `'soulsale.*'` vào wildcard role `manager`.

| Permission | Level | Sensitive | Cấp quyền cho |
|---|---|---|---|
| `soulsale.customer.read` | 1 | — | Tìm/hồ sơ/lịch sử/kiểm trùng khách |
| `soulsale.customer.write` | 2 | ✔ | Tạo/sửa; **gộp khách (L2)** |
| `soulsale.channel.read` | 1 | — | Cây kênh, điểm bán theo đại lý, sell-through |
| `soulsale.channel.write` | 2 | ✔ | Tạo đại lý/điểm bán, gán khu vực; **chuyển tuyến (L2)** |
| `soulsale.lead.read` | 1 | — | Danh sách lead (REST `/leads`) |
| `soulsale.lead.write` | 1 | — | Ghi nhận/gán/loại/convert lead |
| `soulsale.deal.read` | 1 | — | Pipeline summary, deal health, timeline hoạt động |
| `soulsale.deal.write` | 1 | — | Tạo/di chuyển deal, ghi hoạt động |
| `soulsale.quote.read` | 1 | — | Trạng thái/sắp hết hạn báo giá |
| `soulsale.quote.write` | 1 | — | Tạo/chốt báo giá |
| `soulsale.order.read` | 1 | — | Tìm đơn hàng |
| `soulsale.order.write` | 2 | ✔ | Tạo đơn; **confirm/cancel/hold-toggle (L2)** |
| `soulsale.finance.read` | 1 | — | Credit check, công nợ, preview hoa hồng |
| `soulsale.finance.write` | 2 | ✔ | **Thu tiền, hạn mức, khoá nợ, plan+post hoa hồng, chốt kỳ (L2)**; gán điều khoản (L1) |
| `soulsale.price.read` | 1 | — | Tra giá áp dụng |
| `soulsale.price.write` | 2 | ✔ | **Đặt rule giá (L2)** |
| `soulsale.target.read` | 1 | — | Tiến độ chỉ tiêu |
| `soulsale.target.write` | 1 | — | Giao chỉ tiêu |
| `soulsale.import.read` | 1 | — | Trạng thái batch, case đối soát |
| `soulsale.import.write` | 2 | ✔ | Nạp/đối soát/resolve; **chốt batch + hủy batch (L2)** |
| `soulsale.report.read` | 1 | — | Doanh thu, forecast, churn, next-best, automation |

**Nguyên tắc:** đọc = level 1; ghi đụng tiền/cấu trúc kênh/chốt sổ = level 2 sensitive → Tiểu Tâm bắt buộc dry-run→confirm. Wildcard gợi ý: `owner` = tất cả; `manager` = `soulsale.*`; `staff` = mọi `*.read` + `lead.write`, `deal.write`, `quote.write`.
