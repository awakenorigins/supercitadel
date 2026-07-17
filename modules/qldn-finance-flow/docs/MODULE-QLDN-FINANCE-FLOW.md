# Module QLDN Finance Flow

## Giới thiệu

`qldn-finance-flow` là lớp workflow tài chính cho QLDN V1A: đề nghị chi/tạm ứng, công tác phí, duyệt thanh toán vật tư, thu/xóa nợ khách hàng và duyệt bảng lương generic. Module này **không** đúc lại sổ cái, phiếu thu/chi, hóa đơn hay công nợ kế toán lõi; các chứng từ đó được tái sử dụng từ `ke-toan-10a` qua soft UUID reference và outbox event.

## Chức năng

| Chức năng | Endpoint | Ghi chú |
|---|---|---|
| Đề nghị thanh toán/tạm ứng | `/api/v1/qldn-finance-flow/payment-requests` | Beat 5-6 bổ sung routes/services |
| Giải ngân và soft-ref phiếu chi Kế Toán 10A | `/api/v1/qldn-finance-flow/disbursements` | Không tạo cash voucher mới |
| Tạm ứng và quyết toán công tác phí | `/api/v1/qldn-finance-flow/advances` | Hỗ trợ thiếu chi thêm / thừa khấu trừ lương |
| Báo cáo công nợ NCC và kế hoạch thanh toán | `/api/v1/qldn-finance-flow/supplier-debts` | Dùng kế toán lõi cho hóa đơn/số dư |
| Bảng kê công nợ khách, nhắc nợ, xóa nợ | `/api/v1/qldn-finance-flow/customer-debts` | Nhắc 1 ngày / 3 ngày qua event |
| Luồng duyệt bảng lương generic | `/api/v1/qldn-finance-flow/payroll-runs` | Song song, không đụng payroll engine `modules/qldn` |

## Hướng dẫn sử dụng

Ở Beat 4 module chỉ cung cấp manifest, migration và Drizzle schema. Routes/UI sẽ được đăng ký trong Beat 5-6. Khi sử dụng ở tầng service sau này, mọi truy vấn phải lọc `org_id`; mọi ghi nhận kế toán thật phải emit event hoặc soft-ref sang `ketoan10a.payments`, `ketoan10a.receipts`, `ketoan10a.advances`, `ketoan10a.invoices`, `ketoan10a.bills`, `ketoan10a.journal_entries`.

## Ví dụ

- **"Tiểu Tâm, tạo đề nghị thanh toán 12 triệu cho hóa đơn vật tư công trường A, trình kế toán trưởng rồi giám đốc duyệt."** → Tạo `qfi_payment_requests`, đính chứng từ và khởi tạo workflow.
- **"Tiểu Tâm, kiểm tra các bảng kê công nợ khách hàng quá hạn và nhắc nợ lần 1 cho khoản chậm 1 ngày."** → Lọc `qfi_customer_debt_statements`, tạo `qfi_debt_collection_actions` và emit nhắc nợ.

## Changelog

- `1.0.0` — Beat 4: thêm manifest, 23 bảng `qfi_`, Drizzle schema, PGlite schema tests và tài liệu khung.
