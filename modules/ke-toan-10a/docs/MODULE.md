# MODULE.md — Kế Toán 10A (bản đồ để Tiểu Tâm hấp thụ)

> Nạp file này vào ngữ cảnh Tiểu Tâm khi module được cắm vào. Nó cho Tiểu Tâm
> biết module làm gì, có action/tool nào, khi nào gọi, gọi thế nào — để AI
> điều khiển 100% mọi tác vụ kế toán bằng tiếng Việt.

---

## 1. Danh tính

| Thuộc tính | Giá trị |
|------------|---------|
| **ID** | `ke-toan-10a` |
| **Tên** | Kế Toán 10A |
| **API prefix** | `/api/v1/ke-toan-10a` |
| **Permissions** | `ke-toan-10a:read` · `ke-toan-10a:write` · `ke-toan-10a:void` |
| **Cổng actions (ghi)** | `POST /api/v1/ke-toan-10a/actions/:id` |
| **AI tools (đọc)** | Đăng ký sẵn vào toolRegistry: `ke_toan_10a.*` |
| **Health** | `GET /api/v1/ke-toan-10a/health` |
| **Tự-audit sổ** | `GET /api/v1/ke-toan-10a/health/integrity` |
| **Chuẩn** | TT133 · VND · đa tiền tệ |

---

## 2. Module giải quyết việc gì

Toàn bộ **kế toán tài chính** cho doanh nghiệp:
- **Tiền vào/ra**: phiếu thu, phiếu chi.
- **Mua & bán**: hoá đơn bán (phải thu), hoá đơn mua (phải trả), nhiều dòng hàng.
- **Công nợ**: theo dõi từng hoá đơn + **gộp theo đối tác** + **tuổi nợ**.
- **Sổ kép**: tự sinh bút toán Nợ/Có, luôn cân, bất biến.
- **Báo cáo**: 7 loại (lãi lỗ, cân đối, sổ cái, dashboard, tuổi nợ, công nợ...).
- **Excel**: xuất sổ sách, nhập hoá đơn.
- **Niên độ**: khóa kỳ sau quyết toán.
- **Tự-audit**: chứng minh sổ lành bất kỳ lúc nào.

Module tự đảm bảo nguyên tắc ghi kép (Σ Nợ = Σ Có). Tiểu Tâm không cần lo toán.

---

## 3. Khi nào gọi gì (bảng tra nhanh)

| Người dùng nói về... | Dùng |
|----------------------|------|
| thu tiền, khách trả tiền | action `ketoan.tao_phieu_thu` |
| chi tiền, mua sắm, thanh toán | action `ketoan.tao_phieu_chi` |
| xuất hoá đơn, bán hàng | action `ketoan.tao_hoa_don` |
| nhập hàng, mua hàng của NCC | action `ketoan.tao_hoa_don_mua` |
| khách trả tiền hoá đơn | action `ketoan.thu_tien_hoa_don` |
| lãi/lỗ, kết quả kinh doanh | action `ketoan.bao_cao_lai_lo` / tool `ke_toan_10a.profit_loss` |
| tình hình tài chính, tổng quan | action `ketoan.tong_quan` |
| còn bao nhiêu tiền | action `ketoan.so_du_tai_khoan` (111) / tool `ke_toan_10a.cash_position` |
| **ai nợ quá hạn, tuổi nợ** | action `ketoan.tuoi_no` / tool `ke_toan_10a.aging` |
| **công nợ tổng theo đối tác** | action `ketoan.cong_no_doi_tac` / tool `ke_toan_10a.outstanding` |
| **sổ có cân không, kiểm tra sổ** | action `ketoan.kiem_tra_so` / tool `ke_toan_10a.integrity` |
| **khóa sổ, năm tài chính** | action `ketoan.khoa_ky` |
| **kết chuyển lãi lỗ cuối năm** | action `ketoan.ket_chuyen_cuoi_ky` |
| **lưu chuyển tiền tệ, dòng tiền** | action `ketoan.luu_chuyen_tien_te` / tool `ke_toan_10a.cash_flow` |
| **tờ khai thuế GTGT** | action `ketoan.to_khai_gtgt` / tool `ke_toan_10a.vat_declaration` |
| **sao kê công nợ của [ai]** | action `ketoan.sao_ke_cong_no` |
| **ai sắp/quá hạn** | action `ketoan.nhac_han` / tool `ke_toan_10a.due_reminders` |
| **hàng bán trả lại, điều chỉnh giảm HĐ** | action `ketoan.hoa_don_dieu_chinh` |
| **khách đặt cọc / ứng NCC / tạm ứng NV** | action `ketoan.tam_ung` / tool `ke_toan_10a.advances` |
| **cấn trừ tiền cọc vào hóa đơn** | action `ketoan.ap_tam_ung` |
| **trả lại hàng đã mua (debit note)** | action `ketoan.dieu_chinh_mua` |
| **đặt lịch thu/chi định kỳ** | action `ketoan.dat_dinh_ky` / chạy `ketoan.chay_dinh_ky` / tool `ke_toan_10a.recurring_due` |
| **nhập TK/đối tác từ CSV** | endpoint `/import/accounts.csv`, `/import/contacts.csv` |
| **đặt hạn mức nợ cho khách** | action `ketoan.dat_han_muc` |
| **đối chiếu ngân hàng (nhập sao kê + khớp)** | endpoint `/bank/import`, action `ketoan.doi_chieu_ngan_hang` / tool `ke_toan_10a.bank_reconciliation` |
| **kế toán theo bộ phận/dự án** | action `ketoan.tao_bo_phan` + `ketoan.lai_lo_bo_phan` / tool `ke_toan_10a.profit_by_dimension` |
| **đánh giá lại tỷ giá cuối kỳ (515/635)** | action `ketoan.danh_gia_ty_gia` |
| **tài sản cố định + khấu hao** | action `ketoan.tao_tscd` + `ketoan.chay_khau_hao` / tool `ke_toan_10a.assets` |
| **dự toán ngân sách vs thực tế** | action `ketoan.dat_ngan_sach` + `ketoan.ngan_sach_thuc_te` / tool `ke_toan_10a.budget_status` |
| bảng cân đối kế toán | action `ketoan.can_doi_ke_toan` |
| sổ cái | action `ketoan.xem_so_cai` |
| thêm khách/NCC | action `ketoan.them_doi_tac` |
| thêm tài khoản | action `ketoan.tao_tai_khoan` |
| bút toán tổng hợp | action `ketoan.tao_but_toan` |

**Nguyên tắc: dùng ACTION khi GHI (tạo/sửa), dùng TOOL khi chỉ ĐỌC (trả lời câu hỏi).**

---

## 4. Cách gọi

### Action (ghi) — qua HTTP hoặc invokeAction
```
POST /api/v1/ke-toan-10a/actions/ketoan.tao_phieu_thu
Body: { "soTien": "5000000", "taiKhoanDoiUng": "511", "lyDo": "Bán hàng" }
```
Mọi action trả:
```json
{ "ok": true, "message": "Câu tiếng Việt Tiểu Tâm đọc lại", "data": {...} }
```
**Tiểu Tâm chỉ cần đọc `message`** — đã viết sẵn tiếng Việt, format tiền chuẩn (VD "5.000.000 ₫").

### Tool (đọc) — host tự gọi qua toolRegistry
Tiểu Tâm chọn tool `ke_toan_10a.aging` → host chạy handler → trả dữ liệu JSON.

---

## 5. Quy tắc trích tham số (Tiểu Tâm cần nhớ)

Chọn tài khoản đối ứng theo ngữ cảnh:

| Ngữ cảnh | TK đối ứng |
|----------|-----------|
| Bán hàng, doanh thu | **511** |
| Khách trả nợ | **131** |
| Thu khác (lãi, thanh lý) | **711** |
| Trả nợ NCC | **331** |
| Chi phí quản lý (điện, nước, VPP, lương) | **642** |
| Chi phí bán hàng | **641** |
| Nhập hàng hóa (hoá đơn mua) | **156** |

TK tiền mặc định **111** (tiền mặt). "Chuyển khoản"/"ngân hàng" → **112**.
Thuế suất truyền phần trăm: `"8"` = 8%.

---

## 6. Tiểu Tâm KHÔNG cần làm

- Không tự tính bút toán Nợ/Có — module tự sinh.
- Không tự tính thuế — chỉ truyền `thueSuat`.
- Không tự kiểm cân đối — module tự kiểm, CHECK cả tầng DB.
- Không tự tạo đối tác trước — action tự tạo nếu chưa có (tìm theo tên).
- Không lo `org_id` — host đã gắn từ JWT qua requireAuth.

---

## 7. Xử lý lỗi

| error | Ý nghĩa | Tiểu Tâm nói |
|-------|---------|--------------|
| `VALIDATION_ERROR` | Dữ liệu không hợp lệ | Báo cụ thể, hỏi lại |
| `INVALID_PARAMS` | Thiếu tham số | Hỏi thông tin còn thiếu |
| `NOT_FOUND` | Không thấy TK/chứng từ | Gợi ý kiểm tra lại |
| `INVALID_STATE` | Sai trạng thái (VD kỳ đã khóa, phiếu đã ghi) | Giải thích lý do |

---

## 8. Hội thoại mẫu

**Bán hàng:**
> "Xuất hoá đơn cho An Phát 10 triệu thuế 8%" → `ketoan.tao_hoa_don` {tenKhachHang:"An Phát", tienHang:"10000000", thueSuat:"8"}
> → "Đã xuất hoá đơn HD-2026-000001 cho An Phát: tiền hàng 10.000.000 ₫, thuế 800.000 ₫, tổng 10.800.000 ₫."

**Nhập hàng:**
> "Nhập 5 triệu hàng từ Hưng Thịnh" → `ketoan.tao_hoa_don_mua` {tenNhaCungCap:"Hưng Thịnh", tienHang:"5000000"}

**Công nợ:**
> "Khách nào nợ nhiều nhất?" → tool `ke_toan_10a.outstanding` {type:"sales"}
> "Ai quá hạn?" → tool `ke_toan_10a.aging` {type:"sales"}

**Kiểm soát:**
> "Sổ có cân không?" → tool `ke_toan_10a.integrity`
> "Khóa sổ 2025" → `ketoan.khoa_ky` {ten:"2025", tuNgay:"2025-01-01", denNgay:"2025-12-31", khoaLuon:true}

---

## 9. Bảng tài khoản cốt lõi

| Mã | Tên | Loại |
|----|-----|------|
| 111/112 | Tiền mặt / Ngân hàng | Tài sản |
| 131 | Phải thu khách hàng | Tài sản |
| 156 | Hàng hóa | Tài sản |
| 1331 | Thuế GTGT được khấu trừ | Tài sản |
| 331 | Phải trả người bán | Nợ phải trả |
| 3331 | Thuế GTGT phải nộp | Nợ phải trả |
| 411/421 | Vốn / Lợi nhuận | Vốn chủ |
| 511/711 | Doanh thu / Thu khác | Doanh thu |
| 632/641/642 | Giá vốn / CP bán hàng / CP quản lý | Chi phí |

Đầy đủ 33 TK (gồm 911 xác định KQKD): xem [SCHEMA.md](SCHEMA.md). Tính năng tuân thủ VN: xem [VIETNAM.md](VIETNAM.md).
