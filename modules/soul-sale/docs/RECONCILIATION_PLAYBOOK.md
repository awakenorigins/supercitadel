# Soul-Sale 1A — RECONCILIATION_PLAYBOOK.md (sổ tay đối soát Splitter)

## Vòng đời batch
`uploaded` → (`batch-reconcile`) → `reconciling` (còn case) / `ready` (0 case) → (`split-confirm` L2) → `confirmed`; hoặc (`batch-void` L2) → `void`. Batch đã `confirmed` KHÔNG hủy được — sai thì làm batch điều chỉnh kỳ sau.

## Tầng match khách (mỗi dòng)
| Ưu tiên | Căn cứ | Confidence | Kết quả |
|---|---|---|---|
| 1 | `ma_khach` = code | 1.00 | ok |
| 2 | SĐT chuẩn hoá trùng | 0.90 | ok |
| 3 | Tên bỏ dấu trùng khớp | 0.80 | ok |
| 4 | Tên chứa/được chứa | 0.60 | case `low_confidence` |
| — | Không tìm thấy | — | case `missing_customer` |

## Loại case & cách xử lý (`import.row-resolve`)
- `missing_customer` → tạo khách rồi `action:"match"` kèm `customerId`, hoặc `action:"void"` nếu dòng rác.
- `low_confidence` → đúng người thì `action:"accept"`; sai thì `match` khách khác hoặc `void`.
- `duplicate` (trùng SĐT/tên + tiền + ngày trong batch) → thường `void` dòng sau; nếu thật sự 2 giao dịch → `accept`.
- `amount_mismatch` (doanh thu âm) → kiểm tra file gốc; hợp lệ (hoàn hàng) thì `accept`, sai thì `void`.

## Tách dòng tiền khi confirm
`revenue / ship / deposit / discount / debt` = tổng các dòng `ok|resolved`; `suspense` = tổng doanh thu các dòng còn `exception` (bằng 0 khi confirm vì bắt buộc 0 case mở; hiển thị ở preview để thấy sức nặng case). Confirm ghi `ss_agency_statements` (uq theo batch — idempotent) và emit `soulsale.reconciliation.completed`.
