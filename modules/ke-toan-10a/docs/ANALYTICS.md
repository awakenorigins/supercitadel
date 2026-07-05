# ANALYTICS.md — Phân tích nâng cao (Tầng 2 / 10A)

> Tầng 10A bổ sung 5 năng lực phân tích – kiểm soát nâng cao: đối chiếu ngân hàng,
> kế toán theo bộ phận/dự án, đánh giá lại tỷ giá, TSCĐ + khấu hao, dự toán ngân sách.
> Mỗi năng lực có action + (tool nếu đọc) cho Tiểu Tâm.

---

## 1. Đối chiếu ngân hàng (Bank Reconciliation)

Quy trình 3 bước tự động hoá việc khớp sổ với sao kê ngân hàng:

1. **Nhập sao kê** (`importStatement`) — CSV cột `date, description, amount [, reference]`. `amount` dương = tiền vào, âm = tiền ra. Mỗi dòng lưu trạng thái `UNMATCHED`.
2. **Tự khớp** (`autoMatch`) — khớp dòng sao kê với bút toán đã ghi trên TK tiền gửi: cùng số tiền tuyệt đối + chênh ngày ≤ tolerance (mặc định 7 ngày). Không khớp trùng một bút toán hai lần.
3. **Áp quy tắc** (`applyRules`) — dòng còn lại: nếu `description` chứa `matchText` của quy tắc → sinh chứng từ tự động (tiền vào: Nợ 112/Có [đối ứng]; tiền ra: Nợ [đối ứng]/Có 112) theo độ ưu tiên.

**Báo cáo đối chiếu** (`reconciliationReport`): số dư sổ (GL) vs tổng biến động sao kê, số dòng đã/chưa khớp, cờ `reconciled`.

- **Endpoint:** `POST /bank/import?account=112` · `POST /bank/auto-match` · `POST /bank/apply-rules` · `POST /bank/rules` · `GET /bank/transactions` · `GET /bank/reconciliation`
- **Action:** `ketoan.doi_chieu_ngan_hang` (chạy khớp + quy tắc + báo cáo) · **Tool:** `ke_toan_10a.bank_reconciliation`
- *Tiểu Tâm:* "Đối chiếu ngân hàng tài khoản 112"

---

## 2. Kế toán theo bộ phận / dự án (Dimensions)

Gắn `cost_center_id` (chiều phân tích) vào dòng bút toán để phân tích lãi/lỗ theo
từng bộ phận, dự án, chi nhánh hay sản phẩm.

| Loại | Tiền tố mã |
|------|-----------|
| DEPARTMENT (bộ phận) | BP |
| PROJECT (dự án) | DA |
| BRANCH (chi nhánh) | CN |
| PRODUCT (sản phẩm) | SP |
| OTHER | CC |

**Báo cáo lãi/lỗ theo chiều** (`profitByCostCenter`): gom doanh thu (INCOME) và chi phí
(EXPENSE) của các dòng đã gắn chiều, tính lợi nhuận từng bộ phận + phần chưa phân bổ.

- **Endpoint:** `POST /cost-centers` · `GET /cost-centers` · `GET /reports/profit-by-cost-center`
- **Action:** `ketoan.tao_bo_phan` · `ketoan.lai_lo_bo_phan` · **Tool:** `ke_toan_10a.profit_by_dimension`
- *Tiểu Tâm:* "Tạo dự án Website 2026", "Bộ phận nào lời nhất"

---

## 3. Đánh giá lại tỷ giá (FX Revaluation)

Đánh giá lại số dư gốc ngoại tệ cuối kỳ theo TT133. Giá trị mới VND =
`foreignAmount × newRate`. Chênh lệch so với giá trị sổ ghi vào lãi/lỗ tỷ giá:

| TK | Tăng giá trị phía normal | Giảm giá trị phía normal |
|----|--------------------------|--------------------------|
| Dư Nợ (tiền/phải thu) | **LÃI** → Có 515 | **LỖ** → Nợ 635 |
| Dư Có (phải trả) | **LỖ** → Nợ 635 | **LÃI** → Có 515 |

Chiều điều chỉnh chính tài khoản xác định theo `normalBalance`; bút toán luôn cân.

- **Endpoint:** `POST /fx/revalue` { accountCode, foreignCurrency, foreignAmount, newRate }
- **Action:** `ketoan.danh_gia_ty_gia` · *Tiểu Tâm:* "Đánh giá lại 131 số dư 1000 USD tỷ giá 24500"

---

## 4. Tài sản cố định + khấu hao (Fixed Assets)

Khấu hao **đường thẳng**: khấu hao tháng = `(nguyên giá − giá trị thanh lý) / số tháng`.
Chạy khấu hao **bắt kịp** mọi tháng chưa ghi (từ sau kỳ gần nhất hoặc từ ngày bắt đầu)
tới kỳ chỉ định. Mỗi kỳ ghi **Nợ [642/641] / Có 214**; lũy kế tối đa = nguyên giá − thanh lý,
khi đạt sẽ chuyển trạng thái `FULLY_DEPRECIATED`.

Khi tạo TSCĐ có thể ghi bút toán mua: **Nợ 211 / Có [tiền/phải trả]**.

- **Endpoint:** `POST /assets` · `GET /assets` · `POST /assets/depreciation`
- **Action:** `ketoan.tao_tscd` · `ketoan.chay_khau_hao` · **Tool:** `ke_toan_10a.assets`
- *Tiểu Tâm:* "Mua máy tính 30 triệu khấu hao 36 tháng", "Chạy khấu hao tháng này"

---

## 5. Dự toán ngân sách (Budgeting)

Đặt dự toán cả năm theo tài khoản (và bộ phận/dự án tùy chọn). So sánh với **thực tế**
lấy từ sổ cái (INCOME dư Có, EXPENSE dư Nợ) trong năm → chênh lệch, % đã dùng, cờ vượt.

- **Endpoint:** `POST /budgets` · `GET /budgets` · `GET /reports/budget-vs-actual`
- **Action:** `ketoan.dat_ngan_sach` · `ketoan.ngan_sach_thuc_te` · **Tool:** `ke_toan_10a.budget_status`
- *Tiểu Tâm:* "Đặt ngân sách 642 năm 2026 là 500 triệu", "Khoản nào vượt ngân sách"

> `setBudget` là **upsert** (theo năm + TK + bộ phận), xử lý NULL bộ phận thủ công để
> tránh nhân đôi dòng.

---

## Tổng kết bổ sung 10A (Tầng 2)

- **+8 actions** (40 tổng): tao_bo_phan, lai_lo_bo_phan, doi_chieu_ngan_hang, tao_tscd, chay_khau_hao, dat_ngan_sach, ngan_sach_thuc_te, danh_gia_ty_gia
- **+4 tools** (15 tổng): profit_by_dimension, bank_reconciliation, assets, budget_status
- **+5 nhóm bảng**: cost_centers, bank_transactions, bank_rules, fixed_assets, budgets; **+1 cột** journal_lines: `cost_center_id`
- **+1 TK hệ thống**: 214 (Hao mòn TSCĐ) → **33 tài khoản**

## Hoàn tất lộ trình

Với Tầng 2, module đã hấp thụ trọn bộ khuyến nghị từ advisory (Tầng 1 vận hành ở 8A + Tầng 2 phân tích ở 10A). Các mảng nằm NGOÀI phạm vi (kho/POS, bảng lương, HĐĐT nhà cung cấp) được khuyến nghị tách module riêng — xem `KeToan7A-Absorption-Advisory.md`.
