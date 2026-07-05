# ACTIONS.md — Catalog 20 Actions + 6 AI Tools

Ký hiệu: 🖊️ ghi (write, cần xác nhận) · 👁️ đọc (read, an toàn).
Gọi action: `POST /api/v1/ke-toan-10a/actions/:id`. Tool: host gọi qua toolRegistry.

---

## 20 ACTIONS (Tiểu Tâm ghi/điều khiển)

### Chứng từ thu/chi
| ID | Kind | Tham số chính | Mẫu |
|----|:----:|---------------|-----|
| `ketoan.tao_phieu_thu` | 🖊️ | soTien, taiKhoanDoiUng(511), taiKhoanTien(111), lyDo | "Thu 5tr bán hàng" |
| `ketoan.tao_phieu_chi` | 🖊️ | soTien, taiKhoanDoiUng(642), taiKhoanTien(111), lyDo | "Chi 300k VPP" |

### Hoá đơn
| ID | Kind | Tham số chính | Mẫu |
|----|:----:|---------------|-----|
| `ketoan.tao_hoa_don` | 🖊️ | tenKhachHang, tienHang, thueSuat | "HĐ An Phát 10tr thuế 8%" |
| `ketoan.tao_hoa_don_mua` | 🖊️ | tenNhaCungCap, tienHang, thueSuat, taiKhoanChiPhi(156) | "Nhập 5tr từ Hưng Thịnh" |
| `ketoan.thu_tien_hoa_don` | 🖊️ | maHoaDon, soTien, taiKhoanTien(111) | "Thu 10tr HĐ ...001" |

### Bút toán & báo cáo
| ID | Kind | Tham số | Mẫu |
|----|:----:|---------|-----|
| `ketoan.tao_but_toan` | 🖊️ | dienGiai, dong[] | "Kết chuyển lãi lỗ" |
| `ketoan.tong_quan` | 👁️ | tuNgay?, denNgay? | "Tình hình tài chính" |
| `ketoan.bao_cao_lai_lo` | 👁️ | tuNgay?, denNgay? | "Lãi lỗ quý này" |
| `ketoan.can_doi_ke_toan` | 👁️ | denNgay? | "Cân đối kế toán" |
| `ketoan.can_doi_phat_sinh` | 👁️ | tuNgay?, denNgay? | "Cân đối phát sinh" |
| `ketoan.xem_so_cai` | 👁️ | maTaiKhoan | "Sổ cái 111" |
| `ketoan.so_du_tai_khoan` | 👁️ | maTaiKhoan | "Còn bao nhiêu tiền" |

### Công nợ & kiểm soát (GEM MỚI)
| ID | Kind | Tham số | Mẫu |
|----|:----:|---------|-----|
| `ketoan.tuoi_no` | 👁️ | loai(sales/purchase) | "Ai nợ quá hạn" |
| `ketoan.cong_no_doi_tac` | 👁️ | loai(sales/purchase) | "Công nợ theo đối tác" |
| `ketoan.kiem_tra_so` | 👁️ | — | "Sổ có cân không" |
| `ketoan.khoa_ky` | 🖊️ | ten, tuNgay, denNgay, khoaLuon | "Khóa sổ 2025" |

### Danh mục
| ID | Kind | Tham số | Mẫu |
|----|:----:|---------|-----|
| `ketoan.tao_tai_khoan` | 🖊️ | ma, ten, loai | "Thêm TK 154" |
| `ketoan.them_doi_tac` | 🖊️ | ten, loai, sdt?, maSoThue? | "Thêm khách Minh Anh" |
| `ketoan.danh_sach_phieu_thu` | 👁️ | soLuong? | "Các phiếu thu gần đây" |
| `ketoan.danh_sach_phieu_chi` | 👁️ | soLuong? | "Liệt kê phiếu chi" |

---

## 6 AI TOOLS (Tiểu Tâm đọc — đăng ký toolRegistry)

| Tool | Mô tả | Input |
|------|-------|-------|
| `ke_toan_10a.cash_position` | Tiền hiện có (111+112) | — |
| `ke_toan_10a.trial_balance` | Cân đối số phát sinh, sổ có cân không | — |
| `ke_toan_10a.profit_loss` | Doanh thu/chi phí/lãi lỗ | from?, to? |
| `ke_toan_10a.aging` | Công nợ theo tuổi nợ | type(sales/purchase) |
| `ke_toan_10a.outstanding` | Tổng công nợ theo đối tác | type(sales/purchase) |
| `ke_toan_10a.integrity` | Tự-audit toàn vẹn sổ | — |

---

## Định dạng kết quả action
```json
{ "ok": true, "message": "Câu tiếng Việt tự nhiên", "data": { ... } }
```
Lỗi: `{ "ok": false, "message": "...", "error": "VALIDATION_ERROR|NOT_FOUND|INVALID_STATE|INVALID_PARAMS|UNKNOWN_ACTION" }`

## Nạp catalog động
`GET /api/v1/ke-toan-10a/actions` → `{ ok, actions: [{ id, title, description, examples, kind, parameters(JSON Schema) }] }`

---

## 🇻🇳 ACTIONS TUÂN THỦ VN (7A mới)

| ID | Kind | Tham số | Mẫu |
|----|:----:|---------|-----|
| `ketoan.ket_chuyen_cuoi_ky` | 🖊️ | maNienDo | "Kết chuyển lãi lỗ cuối năm 2025" |
| `ketoan.luu_chuyen_tien_te` | 👁️ | tuNgay?, denNgay? | "Báo cáo lưu chuyển tiền tệ" |
| `ketoan.to_khai_gtgt` | 👁️ | tuNgay?, denNgay? | "Tờ khai thuế GTGT quý này" |
| `ketoan.sao_ke_cong_no` | 👁️ | tenDoiTac | "Sao kê công nợ của An Phát" |
| `ketoan.nhac_han` | 👁️ | loai, soNgay? | "Khách nào sắp tới hạn" |
| `ketoan.hoa_don_dieu_chinh` | 🖊️ | maHoaDon, soTien, lyDo? | "Khách trả lại 2tr hàng HĐ ...001" |

## 🇻🇳 AI TOOLS VN (7A mới)

| Tool | Mô tả | Input |
|------|-------|-------|
| `ke_toan_10a.cash_flow` | Lưu chuyển tiền tệ (HĐKD/đầu tư/tài chính) | from?, to? |
| `ke_toan_10a.vat_declaration` | Thuế GTGT đầu ra/vào, phải nộp | from?, to? |
| `ke_toan_10a.due_reminders` | Hóa đơn quá hạn/sắp tới hạn | type(sales/purchase) |

**Tổng: 26 actions + 9 AI tools.** Chi tiết tính năng VN: xem [VIETNAM.md](VIETNAM.md).

---

## ⚙️ ACTIONS VẬN HÀNH (8A mới)

| ID | Kind | Tham số | Mẫu |
|----|:----:|---------|-----|
| `ketoan.tam_ung` | 🖊️ | loai, soTien, tenDoiTac? | "Khách An đặt cọc 5tr" |
| `ketoan.ap_tam_ung` | 🖊️ | maKhoanUng, maChungTu, soTien? | "Cấn trừ cọc vào HD-...001" |
| `ketoan.dieu_chinh_mua` | 🖊️ | maHoaDonMua, soTien, lyDo? | "Trả lại 2tr hàng BILL-...001" |
| `ketoan.dat_dinh_ky` | 🖊️ | ten, loai, tanSuat, soTien, taiKhoanDoiUng, batDau | "Chi tiền thuê 10tr mỗi tháng" |
| `ketoan.chay_dinh_ky` | 🖊️ | tinhDenNgay? | "Chạy định kỳ tới hạn" |
| `ketoan.dat_han_muc` | 🖊️ | tenKhachHang, hanMuc, soNgayDuocNo? | "Hạn mức khách An 50tr" |

## ⚙️ AI TOOLS VẬN HÀNH (8A mới)

| Tool | Mô tả | Input |
|------|-------|-------|
| `ke_toan_10a.advances` | Khoản tạm ứng/đặt cọc còn hiệu lực | type? |
| `ke_toan_10a.recurring_due` | Mẫu định kỳ tới hạn cần chạy | — |

**Tổng: 32 actions + 11 AI tools.** Chi tiết vận hành: xem [OPERATIONS.md](OPERATIONS.md).

---

## 📊 ACTIONS PHÂN TÍCH NÂNG CAO (10A / Tầng 2)

| ID | Kind | Tham số | Mẫu |
|----|:----:|---------|-----|
| `ketoan.tao_bo_phan` | 🖊️ | ten, loai, ma? | "Tạo dự án Website 2026" |
| `ketoan.lai_lo_bo_phan` | 📖 | tuNgay?, denNgay? | "Bộ phận nào lời nhất" |
| `ketoan.doi_chieu_ngan_hang` | 🖊️ | taiKhoan | "Đối chiếu ngân hàng 112" |
| `ketoan.tao_tscd` | 🖊️ | ten, nguyenGia, soThangKhauHao, ngayBatDau | "Mua máy 30tr khấu hao 36 tháng" |
| `ketoan.chay_khau_hao` | 🖊️ | denNgay? | "Chạy khấu hao tháng này" |
| `ketoan.dat_ngan_sach` | 🖊️ | nam, taiKhoan, soTien | "Ngân sách 642 năm 2026 500tr" |
| `ketoan.ngan_sach_thuc_te` | 📖 | nam? | "Khoản nào vượt ngân sách" |
| `ketoan.danh_gia_ty_gia` | 🖊️ | taiKhoan, ngoaiTe, soDuNgoaiTe, tyGiaMoi | "Đánh giá lại 131 1000 USD @24500" |

## 📊 AI TOOLS PHÂN TÍCH (10A / Tầng 2)

| Tool | Mô tả |
|------|-------|
| `ke_toan_10a.profit_by_dimension` | Lãi/lỗ theo bộ phận/dự án |
| `ke_toan_10a.bank_reconciliation` | Trạng thái đối chiếu ngân hàng |
| `ke_toan_10a.assets` | Danh sách TSCĐ, hao mòn, giá trị còn lại |
| `ke_toan_10a.budget_status` | Dự toán vs thực tế, cảnh báo vượt |

**Tổng: 40 actions + 15 AI tools.** Chi tiết Tầng 2: xem [ANALYTICS.md](ANALYTICS.md).
