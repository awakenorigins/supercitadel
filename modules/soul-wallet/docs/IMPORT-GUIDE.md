# Soul-Wallet — Import Sao Kê

## Flow 3 bước (không bao giờ ghi thẳng)
1. `POST /import` (file base64 + preset + ví nhận) → parse + băm dup + chạy rule gợi ý → `{job_id, total, ready, duplicates, errors}`.
2. `POST /import/preview` → soi từng dòng: parsed, gợi ý danh mục, dòng nào trùng/lỗi và vì sao.
3. `POST /import/commit {skip_duplicates:true}` → dòng pending thành giao dịch posted (link `import_row_id` truy vết 2 chiều), emit `sw.import.completed`.

## Preset cột (dò header thông minh: lowercase + bỏ dấu, quét 20 dòng đầu, khớp ≥2 hint)
| Preset | Ngày | Ghi nợ (chi) | Ghi có (thu) | Nội dung | Tham chiếu |
|---|---|---|---|---|---|
| vcb | Ngày giao dịch | Số tiền ghi nợ | Số tiền ghi có | Nội dung chi tiết | Số tham chiếu |
| tcb | Ngày (giao dịch) | (Số tiền) ghi nợ | (Số tiền) ghi có | Mô tả/Diễn giải | Mã giao dịch |
| mb | Ngày giao dịch/GD | Ghi nợ | Ghi có | Nội dung/Diễn giải | Số tham chiếu |
| acb | Ngày hiệu lực | Ghi nợ | Ghi có | Mô tả | Số giao dịch |
| bidv | Ngày GD | Phát sinh nợ | Phát sinh có | Diễn giải | Số CT |
| generic | date/ngay | debit/no | credit/co | memo/description/noi dung | ref |

`generic` chấp nhận cả 1 cột `amount` duy nhất: âm = chi, dương = thu.

## Nhai dữ liệu bẩn
- Tiền VN: "1.234.567", "1,234,567", " 1 234 567 ₫", "1234567 VND" → 1234567. Không đọc được → dòng đánh dấu `error`, không chặn cả file.
- Ngày: `dd/mm/yyyy`, `dd-mm-yyyy`, `yyyy-mm-dd`, Date object, **Excel serial** (>20000) — đều về ISO.
- Dòng trống bỏ qua; header rác phía trên (tên ngân hàng, "SAO KÊ...") tự nhảy qua.

## Chống trùng (dup-hash)
`sha1(account_id | ngày | ±số tiền | memo chuẩn hóa: bỏ dấu, lowercase, chỉ a-z0-9, cắt 40 ký tự)`.
- Trùng TRONG file → dòng sau đánh `skipped`.
- Trùng LIÊN PHIÊN → so với mọi `sw_import_rows` đã `committed` cùng (org, owner) → `dup_of_tx` trỏ giao dịch cũ.
- `skip_duplicates:false` khi commit sẽ ghi cả dòng trùng (dùng khi cố ý — hiếm).

Giới hạn v1: chưa OCR PDF/ảnh sao kê (phase 2); file .xls đời cổ nên convert .xlsx trước.
