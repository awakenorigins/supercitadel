# Soul-Sale 1A — IMPORT_FORMAT.md (định dạng bảng kê Splitter)

Splitter nhận **Excel (.xlsx, sheet đầu tiên)** hoặc **rows JSON**. Header tiếng Việt LINH HOẠT — có dấu/không dấu, hoa/thường, khoảng trắng — map bằng regex sau khi bỏ dấu:

| Cột chuẩn hoá | Header chấp nhận (ví dụ) | Kiểu |
|---|---|---|
| `ngay` | Ngày, Date | text/ngày |
| `ma_khach` | Mã khách, Mã KH, Customer code | mã KH-xxxx (match 1.0) |
| `ten_nguoi_mua` | Tên người mua, Người mua, Khách hàng, Buyer | text |
| `ten_shop` | Tên shop, Shop, Cửa hàng | text |
| `sdt` | SĐT, Số điện thoại, Phone | chuẩn hoá 84→0, bỏ chấm/cách |
| `san_pham` | Sản phẩm, SKU, Product | text |
| `so_luong` | Số lượng, SL, Qty | số |
| `doanh_thu` | Doanh thu, Thành tiền, Revenue, Tiền hàng | tiền |
| `phi_ship` | Phí ship, Ship, Vận chuyển | tiền |
| `coc` | Cọc, Đặt cọc, Deposit | tiền |
| `chiet_khau` | Chiết khấu, CK, Discount | tiền |
| `cong_no` | Công nợ, Nợ, Debt | tiền |
| `ghi_chu` | Ghi chú, Note | text |

**Quy tắc tiền (`parseMoney`)**: nhận `5.000.000`, `5,000,000`, `5000000đ`, khoảng trắng; ngoặc đơn = số âm `(500.000)` → `-500000`; ô trống/`—` → `0`. Lưu nguyên đồng VND, không thập phân.

**Bất biến**: dòng gốc lưu nguyên văn vào `ss_import_raw_rows` (jsonb) — không sửa, không xoá; mọi xử lý diễn ra trên bản chuẩn hoá `ss_import_rows`. Batch có mã `IB-YYYYMM-xxxx` theo kỳ khai báo.
