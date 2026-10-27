# QLDN Procurement

Beat 12 mở module `qldn-procurement` với supplier master duy nhất toàn hệ.

## Scope Beat 12
- `qpr_suppliers` là master NCC lifecycle; `ketoan10a.contacts(type=VENDOR/BOTH)` chỉ là đối tác kế toán/công nợ, liên thông mềm qua `accounting_contact_id`/event.
- 3-NCC: PR từ 2.000.000đ trở lên phải có ít nhất 3 `qpr_supplier_quotes` từ 3 supplier khác nhau trước submit.
- Threshold workflow: dùng definition `vanhanh.qt-mua-hang-de-ban`; ngưỡng 20.000.000đ thêm GĐ tài chính theo QT mua hàng để bán. Service phân loại route 2tr/5tr/20tr để UI/Beat 13 dùng tiếp.
- PR approved tạo PO idempotent; goods receipt chỉ emit event cho inventory tham chiếu, không ghi bảng inventory.

## HR Plus backfill note
`qhr_training_vendor_proposals.vendor_ref` có thể nullable soft-ref sang `qpr_suppliers.id` ở Beat sau. Beat 12 chỉ ghi contract liên thông, không sửa `qldn-hr-plus` để tránh phá module đã pass.

## Beat 13 — module complete
- **Routes** `buildQldnProcurementRoutes` mount tại `/api/v1/qldn-procurement` (loader built-in, gate module active/rent). Permission check theo `PERMISSION_REGISTRY` (staff không có `qldn-procurement.*` → 403).
- **Supplier lifecycle:** đánh giá định kỳ cập nhật rating trung bình; score <5 hoặc `finalDecision=terminate` → supplier `suspended`/`terminated` + emit `qldn-procurement.supplier.suspended`. NCC không-active bị chặn ở: tạo PO từ PR approved, gửi PO (`/purchase-orders/:id/send`), mời thầu, award thầu (409).
- **PO lifecycle:** approved → sent (`purchase-order.sent`) → nhận hàng partial (`partially_received`) → nhận đủ → `closed` + `purchase-order.closed`. PO closed/cancelled/rejected chặn nhận thêm hàng (409). Mỗi GR emit `goods-receipt.recorded` kèm `poStatus`.
- **Đấu thầu mua (QT 4):** bid project → submit workflow `vanhanh.qt-dau-thau` 4 cấp (KTT→GĐKD→P.TGĐ→TGĐ), ngưỡng ≥20tr thêm GĐTC = 5 cấp. Duyệt xong mới được mời thầu; award chọn winner (`won`), loại bidder khác (`rejected`), tự sinh PR/PO nối NCC thắng + emit `bid.awarded`. Reject workflow → bid `rejected`.
- **QT 12 DV vận hành:** `qpr_procurement_requests` submit workflow `vanhanh.qt-thue-dv-mua-thiet-bi`; nghiệm thu `qpr_service_acceptances` — `result=issue` bắt buộc `issueDesc`, emit `service-acceptance.signed`.
- **UI** `apps/web/app/qldn-procurement/page.tsx`: 4 tab (NCC & Đánh giá / Mua hàng & PO / Đấu thầu / DV & Nghiệm thu), quick actions, submit/send inline, ModuleLocked gate.
- **Tests:** `tests/procurement.pglite.test.ts` (service + migration 15 bảng) và `tests/routes.pglite.test.ts` (API 403/3-NCC/threshold/GR partial-full/suspended block/bid award/org isolation).

## Giới thiệu
Supplier master toàn hệ, báo giá 3-NCC, đề nghị mua hàng, PO, nhận hàng và đấu thầu mua. Mọi dữ liệu được cô lập theo tổ chức và module được nạp qua manifest loader.

## Chức năng
| Chức năng | Endpoint | Quyền |
|---|---|---|
| Kiểm tra module | `GET /api/v1/qldn-procurement/health` | Đăng nhập |
| Danh sách nghiệp vụ | `GET /api/v1/qldn-procurement/...` | `qldn-procurement.supplier.read` |
| Thao tác nghiệp vụ | `POST /api/v1/qldn-procurement/...` | `qldn-procurement.supplier.write` |

## Hướng dẫn sử dụng
Mở module từ catalog, chọn nhóm nghiệp vụ, tạo hoặc cập nhật hồ sơ rồi theo dõi trạng thái. API luôn lấy `org_id` từ JWT; không truyền tổ chức thay người dùng. Các thao tác nhạy cảm yêu cầu permission tương ứng trong manifest.

## Ví dụ
- **"Cho tôi xem danh sách nghiệp vụ QLDN — Procurement"** → Tiểu Tâm gọi endpoint danh sách với quyền đọc.
- **"Tạo hồ sơ mới và cho tôi biết trạng thái"** → Tiểu Tâm kiểm quyền, gọi endpoint tạo và trả về mã hồ sơ.

## Changelog
- 1.0.0 — Hoàn thiện module, manifest, loader, tài liệu và audit Beat 18.
