# VIETNAM.md — Tính năng tuân thủ kế toán Việt Nam (7A)

> Tầng tuân thủ VN là điểm khác biệt lớn nhất của 7A so với 6A và các hệ ngoại
> các hệ kế toán khác. Mọi tính năng đều có action + tool để Tiểu Tâm điều khiển.

---

## 1. Bút toán kết chuyển cuối kỳ (911 → 421)

Cuối niên độ, kết chuyển doanh thu & chi phí về TK 911 (Xác định kết quả kinh
doanh), rồi kết chuyển lãi/lỗ về 421 — **nghiệp vụ bắt buộc** mà 6A còn thiếu.

**Trình tự tự động:**
1. Nợ [511, 515, 711…] / Có 911 — kết chuyển doanh thu
2. Nợ 911 / Có [632, 635, 641, 642, 811, 821…] — kết chuyển chi phí
3. Lãi: Nợ 911 / Có 421 · Lỗ: Nợ 421 / Có 911

Sau kết chuyển: các TK doanh thu/chi phí về 0, TK 911 về 0, lãi/lỗ nằm ở 421,
niên độ được khóa.

- **Endpoint:** `POST /fiscal-years/:id/closing`
- **Action:** `ketoan.ket_chuyen_cuoi_ky` { maNienDo }
- *Tiểu Tâm:* "Kết chuyển lãi lỗ cuối năm 2025"

---

## 2. Báo cáo lưu chuyển tiền tệ (LCTT / mẫu B03)

1 trong 4 báo cáo tài chính bắt buộc theo TT133. Phương pháp trực tiếp: phân loại
biến động TK tiền (111, 112) theo tài khoản đối ứng thành 3 hoạt động:
- **Kinh doanh** (HĐKD): đối ứng 5xx/6xx/7xx/8xx/131/331/133/156…
- **Đầu tư** (HĐĐT): đối ứng 21x/22x/24x (TSCĐ, XDCB, đầu tư TC)
- **Tài chính** (HĐTC): đối ứng 41x/44x/34x (vốn, vay, cổ tức)

Trả về: dòng tiền thuần từng hoạt động + số dư tiền đầu kỳ/cuối kỳ.

- **Endpoint:** `GET /reports/cash-flow?from=&to=`
- **Action:** `ketoan.luu_chuyen_tien_te` · **Tool:** `ke_toan_10a.cash_flow`

---

## 3. Tờ khai thuế GTGT (01/GTGT) + Bảng kê hóa đơn

Tổng hợp thuế GTGT đầu ra (hóa đơn bán) và đầu vào (hóa đơn mua) trong kỳ, kèm
bảng kê từng hóa đơn. Thuế phải nộp = đầu ra − đầu vào (âm = còn được khấu trừ).

Trả về:
- `output`: doanh thu chịu thuế, thuế đầu ra, **bảng kê** từng hóa đơn bán
- `input`: giá mua chịu thuế, thuế đầu vào, **bảng kê** từng hóa đơn mua
- `vatPayable` / `carryForward`

- **Endpoint:** `GET /reports/vat-declaration?from=&to=`
- **Action:** `ketoan.to_khai_gtgt` · **Tool:** `ke_toan_10a.vat_declaration`
- *Tiểu Tâm:* "Tờ khai thuế GTGT quý này"

---

## 4. Sổ sách chuẩn TT133

### Sổ nhật ký chung (S03a)
Liệt kê mọi bút toán POSTED theo thời gian: ngày, số CT, diễn giải, TK, Nợ, Có.
- **Endpoint:** `GET /reports/general-journal?from=&to=`

### Sổ quỹ tiền mặt (S07)
Biến động TK 111 với số dư lũy kế: ngày, số CT, thu, chi, tồn quỹ.
- **Endpoint:** `GET /reports/cash-book?from=&to=`

*(Sổ cái từng TK — dùng `GET /reports/general-ledger?account=`.)*

---

## 5. Hóa đơn điều chỉnh giảm (Credit Note)

Hàng bán bị trả lại / giảm giá. Bút toán ngược phần điều chỉnh:
**Nợ 511 (giảm DT) + Nợ 3331 (giảm thuế) / Có 131 (giảm phải thu)**.
Giảm `total` của hóa đơn gốc tương ứng (phản ánh giá bán thực).

- **Endpoint:** `POST /invoices/:id/credit-note` { amount, reason? }
- **Action:** `ketoan.hoa_don_dieu_chinh` { maHoaDon, soTien, lyDo? }
- *Tiểu Tâm:* "Khách trả lại 2 triệu hàng hóa đơn HD-...001"

---

## 6. Sao kê công nợ theo đối tác (Statement of Account)

Liệt kê phát sinh công nợ (TK 131/331) của một đối tác theo thời gian, kèm số dư
lũy kế — để đối chiếu/gửi khách.

- **Endpoint:** `GET /reports/statement/:contactId?from=&to=`
- **Action:** `ketoan.sao_ke_cong_no` { tenDoiTac }
- *Tiểu Tâm:* "Sao kê công nợ của An Phát 3 tháng qua"

---

## 7. Nhắc hạn công nợ (Due Reminders)

Danh sách hóa đơn còn công nợ, phân nhóm **quá hạn** / **sắp tới hạn** (trong N
ngày) — để Tiểu Tâm chủ động nhắc. Biến báo cáo tuổi nợ thành hành động.

- **Endpoint:** `GET /reports/due-reminders?type=sales|purchase&soonDays=7`
- **Action:** `ketoan.nhac_han` · **Tool:** `ke_toan_10a.due_reminders`
- *Tiểu Tâm:* "Khách nào sắp tới hạn?" / "Có hóa đơn nào quá hạn không?"

---

## Định hướng còn lại (chưa làm trong 7A — theo advisory)

- **Hóa đơn điện tử (HĐĐT)**: nên làm **adapter interface** + xuất dữ liệu chuẩn,
  để module connector đẩy sang Viettel/VNPT/MISA (cần SDK trả phí — không nhúng cứng).
- **Đối chiếu ngân hàng**, **giao dịch định kỳ**, **tạm ứng/trả trước**: Tầng 2.
- **Kế toán theo bộ phận/dự án** (dimensions), **TSCĐ + khấu hao**: Tầng 3.

Xem `KeToan6A-Upgrade-Advisory.md` để biết lộ trình đầy đủ.
