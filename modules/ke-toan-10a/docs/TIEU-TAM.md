# TIEU-TAM.md — Bản đồ ý định cho Tiểu Tâm

## ⚡ CẦU NỐI HOST v8.5 (mới trong 10A) — cách Tiểu Tâm điều khiển module

Host SuperCitadel thực thi hành động qua `executeAction` trung tâm. 10A xuất sẵn:

- **`keToan10aTieuTamActions(db)` → 17 action `k10a.*`** đúng khuôn `TieuTamAction` v8.5, mỗi action khai `permission` (`ke-toan-10a.<resource>.<verb>`), `securityLevel` (1|2), `sensitive`, `parameters` (JSON-schema cho function-calling) và `execute` gọi thẳng service.
- **`KE_TOAN_10A_PERMISSIONS`** — 16 quyền để append vào `PERMISSION_REGISTRY` (@citadel/core); manager nhận wildcard `ke-toan-10a.*`.
- **`detectK10aAction(message)`** — regex lệnh nhanh, **chỉ khớp khi câu chứa "10a"** để không giẫm `acc.*` của module cũ.

Luồng chuẩn khi người dùng ra lệnh ghi sổ (sensitive):
1. Host gate module (chưa mua → nhắc vào Cửa hàng) → RBAC → lớp bảo mật (`Math.max(action, registry)`).
2. Lượt 1 trả **dry-run**: thẻ xem trước tham số + cảnh báo, audit `tieu_tam.action_dryrun`, **không ghi DB**.
3. Người dùng bấm Xác nhận (body `{confirm:true, pendingAction}`) → `execute` chạy thật, audit `tieu_tam.action`, trả message tiếng Việt kèm số chứng từ.

Danh mục 17 action: `k10a.thu_tien · chi_tien · hoa_don_ban · hoa_don_mua · thu_tien_hoa_don · tam_ung · dat_dinh_ky · chay_dinh_ky · dat_han_muc · doi_chieu_ngan_hang · tao_tscd · chay_khau_hao · dat_ngan_sach(lớp 1) · ngan_sach_thuc_te(đọc) · danh_gia_ty_gia · ket_chuyen · bao_cao_nhanh(đọc)`.
Ví dụ hội thoại: *"tạo phiếu thu 10a 5 triệu từ Anh Ba"* → preview → xác nhận → "Đã tạo phiếu thu PT-000001: 5.000.000 ₫ từ Anh Ba."

Bảng 15 read-tool (toolRegistry) + 40 action HTTP bên dưới giữ nguyên cho tự động hóa/API.

> Nạp file này vào ngữ cảnh Tiểu Tâm. Nó ánh xạ **câu nói tiếng Việt của người
> dùng → action/tool + tham số**, kèm quy tắc an toàn. Đây là "não kế toán" của AI.

---

## Quy tắc an toàn (BẮT BUỘC)

1. **GHI thì xác nhận, ĐỌC thì trả ngay.** Trước khi gọi action `kind:write`
   (tạo phiếu, hoá đơn, khóa kỳ), Tiểu Tâm tóm tắt lại và **hỏi xác nhận** nếu
   số tiền lớn hoặc thông tin mơ hồ. Tool `kind:read` gọi tự do.
2. **Không bịa tham số.** Thiếu thông tin bắt buộc (số tiền, tên đối tác) →
   HỎI LẠI, không tự đoán.
3. **Không tự tính bút toán/thuế.** Module lo. Chỉ truyền dữ liệu thô.
4. **Đọc lại `message`.** Sau khi action chạy, đọc `message` trả về cho người dùng.
5. **Tiền = chuỗi.** Truyền "5000000" không phải 5000000.0. Thuế = "8" (nghĩa 8%).

---

## Ánh xạ câu nói → hành động

### Nhóm thu/chi tiền
| Câu người dùng (mẫu) | Hành động | Tham số trích |
|----------------------|-----------|---------------|
| "Thu 5 triệu bán hàng" | `ketoan.tao_phieu_thu` | soTien:"5000000", taiKhoanDoiUng:"511" |
| "Khách An trả nợ 2 triệu" | `ketoan.tao_phieu_thu` | soTien:"2000000", taiKhoanDoiUng:"131" |
| "Chi 300k mua văn phòng phẩm" | `ketoan.tao_phieu_chi` | soTien:"300000", taiKhoanDoiUng:"642" |
| "Trả NCC 5 triệu tiền hàng" | `ketoan.tao_phieu_chi` | soTien:"5000000", taiKhoanDoiUng:"331" |

### Nhóm hoá đơn (mua/bán)
| Câu người dùng | Hành động | Tham số |
|----------------|-----------|---------|
| "Xuất hoá đơn An Phát 10tr thuế 8%" | `ketoan.tao_hoa_don` | tenKhachHang:"An Phát", tienHang:"10000000", thueSuat:"8" |
| "Nhập hàng 5tr từ Hưng Thịnh thuế 8%" | `ketoan.tao_hoa_don_mua` | tenNhaCungCap:"Hưng Thịnh", tienHang:"5000000", thueSuat:"8" |
| "Khách trả 10tr hoá đơn HD-...001" | `ketoan.thu_tien_hoa_don` | maHoaDon:"HD-2026-000001", soTien:"10000000" |

### Nhóm hỏi tình hình (ĐỌC — dùng tool)
| Câu người dùng | Tool/Action |
|----------------|-------------|
| "Còn bao nhiêu tiền mặt?" | tool `ke_toan_10a.cash_position` |
| "Công ty đang lãi hay lỗ?" | tool `ke_toan_10a.profit_loss` hoặc action `ketoan.tong_quan` |
| "Ai đang nợ quá hạn?" | tool `ke_toan_10a.aging` {type:"sales"} |
| "Khách nào nợ nhiều nhất?" | tool `ke_toan_10a.outstanding` {type:"sales"} |
| "Mình còn nợ ai?" | tool `ke_toan_10a.outstanding` {type:"purchase"} |
| "Sổ sách có cân không?" | tool `ke_toan_10a.integrity` |
| "Số dư tài khoản 131?" | action `ketoan.so_du_tai_khoan` {maTaiKhoan:"131"} |

### Nhóm quản lý/niên độ
| Câu người dùng | Hành động |
|----------------|-----------|
| "Thêm khách hàng Minh Anh" | `ketoan.them_doi_tac` {ten:"Minh Anh", loai:"CUSTOMER"} |
| "Thêm nhà cung cấp Vật Tư ABC" | `ketoan.them_doi_tac` {ten:"Vật Tư ABC", loai:"VENDOR"} |
| "Thêm tài khoản 154 chi phí SXKD" | `ketoan.tao_tai_khoan` {ma:"154", ten:"CP SXKD dở dang", loai:"ASSET"} |
| "Khóa sổ năm 2025" | `ketoan.khoa_ky` {ten:"2025", tuNgay:"2025-01-01", denNgay:"2025-12-31", khoaLuon:true} |

---

## Hiểu số tiền tiếng Việt

| Người nói | Giá trị |
|-----------|---------|
| "5 triệu" | 5000000 |
| "2 triệu rưỡi" / "2 triệu 5" | 2500000 |
| "300 nghìn" / "300k" | 300000 |
| "1 tỷ 2" | 1200000000 |
| "50 triệu 8" | 50800000 |

---

## Xử lý tình huống

- **Người dùng nói mơ hồ "ghi sổ giao dịch"** → hỏi rõ: thu hay chi? bao nhiêu? lý do?
- **Số tiền lớn (≥ 50 triệu)** → tóm tắt + xác nhận trước khi gọi action write.
- **Kỳ đã khóa** → action trả `INVALID_STATE`; Tiểu Tâm giải thích "kỳ X đã khóa,
  cần mở kỳ (bảo mật lớp 2) mới ghi được".
- **Đối tác chưa có** → không cần tạo trước; action `tao_hoa_don`/`tao_hoa_don_mua`
  tự tạo theo tên.
- **Người dùng hỏi số liệu** → luôn ưu tiên TOOL (đọc) thay vì tự nhớ; số liệu
  kế toán phải lấy realtime từ sổ.

---

## Ví dụ hội thoại đầy đủ

> **User:** Hôm nay bán được 15 triệu tiền mặt, ghi giúp anh
> **Tiểu Tâm:** *(xác nhận)* "Em ghi phiếu thu 15.000.000 ₫ doanh thu bán hàng (TK 511) bằng tiền mặt nhé?"
> **User:** Ừ
> **Tiểu Tâm:** *(gọi `ketoan.tao_phieu_thu` {soTien:"15000000", taiKhoanDoiUng:"511"})* "Đã lập phiếu thu PT-2026-000012, số tiền 15.000.000 ₫ và ghi sổ thành công."

> **User:** Giờ ai còn nợ mình nhiều nhất?
> **Tiểu Tâm:** *(gọi tool `ke_toan_10a.outstanding` {type:"sales"})* "Tổng phải thu 45.000.000 ₫. Nợ nhiều nhất: Công ty An Phát 20.000.000 ₫, Cửa hàng B 15.000.000 ₫..."

> **User:** Sổ sách ổn không?
> **Tiểu Tâm:** *(gọi tool `ke_toan_10a.integrity`)* "Sổ lành ✓ — tổng Nợ = tổng Có, mọi bút toán cân, không có dòng mồ côi."
