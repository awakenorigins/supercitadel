# Module QLDN Finance Flow

## Giới thiệu

`qldn-finance-flow` là lớp workflow tài chính cho QLDN V1A, tái sử dụng `workflow` và soft-ref sang `ke-toan-10a`; không đúc lại sổ cái/phiếu thu chi/hóa đơn lõi. Module gom 5 cụm: duyệt chi, tạm ứng/công tác phí, vật tư/NCC, công nợ khách và payroll flow.

## Chức năng

| Chức năng | Endpoint | Ghi chú |
|---|---|---|
| Duyệt chi / đề nghị thanh toán | `/api/v1/qldn-finance-flow/payment-requests` | Submit workflow, approved tạo disbursement idempotent |
| Tạm ứng & công tác phí | `/api/v1/qldn-finance-flow/advances` | Settle thiếu/thừa qua payment request hoặc payroll deduction |
| Vật tư / nhà cung cấp | `/api/v1/qldn-finance-flow/material-receipts`, `/supplier-debt/reconcile`, `/payment-plans` | Báo cáo nhận vật tư, đối chiếu công nợ NCC, kế hoạch thanh toán |
| Công nợ khách hàng | `/api/v1/qldn-finance-flow/statements`, `/collection-actions`, `/reminders/due`, `/writeoffs/submit` | Nhắc nợ và trình xóa nợ |
| Payroll flow | `/api/v1/qldn-finance-flow/payroll/runs`, `/payslips/:id` | Duyệt bảng lương generic, tạo lệnh chi và payslip ACL |

## Hướng dẫn sử dụng

1. Bật module `workflow`, `ke-toan-10a`, rồi bật `qldn-finance-flow` trong catalog.
2. Người có quyền `qldn-finance-flow.payment-request.write` tạo đề nghị chi và submit.
3. Duyệt qua module Workflow. Khi `workflow.instance.approved` phát ra, handler của module tự execute đúng entity type.
4. Mọi endpoint lấy `orgId` từ JWT; không truyền org từ client. Payslip chỉ cho chính chủ hoặc C&B/KTT/GĐ/owner.

## Bảng dữ liệu

23 bảng prefix `qfi_`: payment requests/documents/disbursements/cash receipt requests; material receipt reports/lines; supplier debt reports/lines/payment plans; advances/travel advances/travel expense claims/documents/payroll deductions; customer debt statements/lines/collection actions/writeoffs; payroll runs/lines/salary payment orders/payslip flows/payroll feedback. Mọi bảng có `org_id` và index org.

## Permissions

Manifest và registry đăng ký: `qldn-finance-flow.payment-request.read/write/approve/pay`, `advance.read/write/approve/settle`, `debt.read/write/approve/pay`, `payroll-flow.read/write/approve/pay`.

## Events

Subscribes exact: `workflow.instance.approved`, `workflow.instance.rejected`. Approved handler xử lý `qfi_payment_request`, `qfi_travel_advance`, `qfi_supplier_payment_plan`, `qfi_debt_writeoff`, `qfi_payroll_run`; retry idempotent cho disbursement và salary payment order.

## API endpoints

- `GET/POST /payment-requests`, `GET /payment-requests/:id`, `POST /payment-requests/:id/submit`, `GET /payment-requests/:id/disbursement`
- `GET/POST /advances`, `POST /advances/submit`, `POST /advances/:id/settle`
- `GET/POST/PATCH /material-receipts`, `POST /supplier-debt/reconcile`, `POST /payment-plans`, `POST /payment-plans/:id/submit`
- `GET/POST /statements`, `POST /collection-actions`, `GET /reminders/due`, `POST /writeoffs/submit`
- `POST /payroll/runs`, `POST /payroll/runs/:id/submit`, `POST /payroll/runs/:id/approve-execute`, `GET /payslips/:id`

## Ví dụ

- **“Tiểu Tâm, tạo đề nghị thanh toán 12 triệu cho hóa đơn vật tư công trường A, trình KTT rồi giám đốc duyệt.”** → Tạo `qfi_payment_requests`, submit workflow, khi approved tạo giải ngân.
- **“Tiểu Tâm, kiểm tra công nợ khách sắp đến hạn 3 ngày và tạo nhắc nợ lần 1.”** → Lọc `/reminders/due`, tạo `qfi_debt_collection_actions`.

## Changelog

- `1.0.0` — Beat 4-6: 23 bảng `qfi_`, services, workflow events, Hono routes, UI dashboard, docs và PGlite route smoke.
