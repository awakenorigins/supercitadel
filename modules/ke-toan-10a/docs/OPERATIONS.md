# OPERATIONS.md — Tính năng chiều sâu vận hành (8A)

> Tầng 8A bổ sung các nghiệp vụ vận hành phổ biến của DN Việt: tạm ứng/đặt cọc,
> điều chỉnh mua, giao dịch định kỳ, nhập CSV, hạn mức tín dụng. Mỗi tính năng có
> action + (tool nếu đọc) cho Tiểu Tâm điều khiển.

---

## 1. Tạm ứng / Đặt cọc / Trả trước (Advances)

Ba loại khoản ứng, mỗi loại sinh bút toán riêng:

| Loại | Bút toán | Dùng khi |
|------|----------|----------|
| `CUSTOMER_DEPOSIT` | Nợ [tiền] / Có 131 | Khách đặt cọc / trả tiền trước |
| `SUPPLIER_ADVANCE` | Nợ 331 / Có [tiền] | Ứng trước tiền cho NCC |
| `EMPLOYEE_ADVANCE` | Nợ 141 / Có [tiền] | Tạm ứng cho nhân viên |

**Áp khoản ứng vào hóa đơn** (cấn trừ công nợ): giảm công nợ còn lại của hóa đơn.
Phần netting đã xảy ra trên 131/331 nên không sinh bút toán mới.

- **Endpoint:** `POST /advances` · `POST /advances/:id/apply` · `GET /advances`
- **Action:** `ketoan.tam_ung` · `ketoan.ap_tam_ung` · **Tool:** `ke_toan_10a.advances`
- *Tiểu Tâm:* "Khách An đặt cọc 5 triệu", "Cấn trừ tiền cọc vào hóa đơn HD-...001"

---

## 2. Điều chỉnh giảm hóa đơn mua (Debit Note)

Trả lại hàng đã mua / NCC giảm giá. Bút toán ngược phần điều chỉnh:
**Nợ 331 (giảm phải trả) / Có [156/642] (giảm hàng/CP) + Có 1331 (giảm thuế đầu vào)**.
Giảm `total` hóa đơn mua gốc. (Đối xứng với credit note bên bán ở 7A.)

- **Endpoint:** `POST /bills/:id/debit-note` { amount, reason? }
- **Action:** `ketoan.dieu_chinh_mua` { maHoaDonMua, soTien, lyDo? }
- *Tiểu Tâm:* "Trả lại 2 triệu hàng hóa đơn mua BILL-...001"

---

## 3. Giao dịch định kỳ (Recurring)

Mẫu tự sinh chứng từ theo tần suất (DAILY/WEEKLY/MONTHLY/YEARLY): tiền thuê, lương,
phí cố định. Khi chạy `runDue`, sinh chứng từ cho **mọi kỳ đã tới** (bắt kịp nếu bỏ lỡ)
rồi dời hạn.

| Loại (`kind`) | Sinh ra |
|---------------|---------|
| `RECEIPT` | Phiếu thu |
| `PAYMENT` | Phiếu chi |
| `JOURNAL` | Bút toán tổng hợp |

- **Endpoint:** `POST /recurring` · `POST /recurring/run` · `GET /recurring` · `POST /recurring/:id/toggle`
- **Action:** `ketoan.dat_dinh_ky` · `ketoan.chay_dinh_ky` · **Tool:** `ke_toan_10a.recurring_due`
- *Tiểu Tâm:* "Đặt chi tiền thuê 10 triệu mỗi tháng", "Chạy giao dịch định kỳ tới hạn"

> Gợi ý tích hợp: host có thể gọi `POST /recurring/run` hàng ngày (cron) để tự động sinh.

---

## 4. Nhập CSV danh mục (Import)

Onboarding nhanh khi DN chuyển từ hệ cũ. Validate từng dòng, gom lỗi, bỏ qua bản ghi
đã tồn tại (idempotent theo mã/tên).

**Nhập tài khoản** — cột: `code, name, type` (type nhận ASSET/.../EXPENSE hoặc nhãn tiếng Việt).
**Nhập đối tác** — cột: `name, [type], [taxCode], [phone], [email], [creditLimit]`.

- **Endpoint:** `POST /import/accounts.csv` · `POST /import/contacts.csv` (body = nội dung CSV)
- Trả về: `{ created, skipped, errors[] }`

---

## 5. Hạn mức tín dụng + Điều khoản thanh toán (Credit Limit)

Đặt `creditLimit` (hạn mức công nợ) + `paymentTermDays` (điều khoản) cho khách.
Khi lập hóa đơn bán, nếu **công nợ hiện tại + hóa đơn mới > hạn mức** → **chặn**
(trừ khi truyền `allowExceedCredit=true`).

- **Endpoint:** `PATCH /contacts/:id` (đặt hạn mức) · `GET /contacts/:id/credit-status?amount=`
- **Action:** `ketoan.dat_han_muc` { tenKhachHang, hanMuc, soNgayDuocNo? }
- *Tiểu Tâm:* "Đặt hạn mức nợ khách An Phát 50 triệu, 30 ngày"
- Kiểm tra: `checkCreditLimit` trả `{ hasLimit, limit, currentOutstanding, afterThis, exceeded, available }`

---

## Tổng kết bổ sung 8A

- **+6 actions** (32 tổng): tam_ung, ap_tam_ung, dieu_chinh_mua, dat_dinh_ky, chay_dinh_ky, dat_han_muc
- **+3 tools** (11 tổng): advances, recurring_due (+ due_reminders kế thừa)
- **+2 bảng**: `advances`, `recurring_templates`; **+2 cột** contacts: `credit_limit`, `payment_term_days`

## Định hướng còn lại (Tầng 2 theo advisory)

Đối chiếu ngân hàng · kế toán theo bộ phận/dự án · đánh giá lại tỷ giá · TSCĐ + khấu hao · dự toán ngân sách. Xem `KeToan7A-Absorption-Advisory.md`.
