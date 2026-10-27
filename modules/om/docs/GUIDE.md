# Ví Om (om)

## Giới thiệu
Module Ví Om (free, mặc định) là tiền tệ nội bộ của Citadel — ledger append-only chính xác tuyệt đối. Om dùng để mua module trong Cửa hàng và mua vật phẩm cho Tiểu Tâm (đồ ăn hồi năng lượng, theme trang trí). Chi Om lớn hơn 1.000 đòi bảo mật lớp 2 (đã gắn email/SĐT).

## Chức năng
| Tên | Endpoint | Quyền cần | Mô tả |
|---|---|---|---|
| Số dư | GET /api/v1/om/balance | om:read | Số Om hiện tại của tổ chức (tính từ ledger) |
| Lịch sử giao dịch | GET /api/v1/om/transactions | om:read | Nạp/chi theo thời gian, lý do từng dòng |
| Nạp Om | POST /api/v1/om/topup | om:topup | Cộng Om vào ví (audit om.topup) |
| Chi Om | POST /api/v1/om/spend | om:read + bảo mật lớp 2 nếu > 1.000 | Trừ Om, chặn thiếu tiền (số dư không bao giờ âm) |

## Hướng dẫn sử dụng
1. Mở trang **Om** (/om) — thấy số dư + lịch sử nạp/chi.
2. Nạp Om bằng nút **Nạp** (demo: nạp tự do; production: cổng thanh toán).
3. Om tự trừ khi mua module (Cửa hàng /modules) hoặc mua vật phẩm cho Tiểu Tâm — thiếu tiền bị chặn với thông báo "Không đủ Om (cần X, có Y)".
4. Chi Om > 1.000 lần đầu sẽ được yêu cầu gắn email/SĐT (bảo mật lớp 2) trong Settings.

## Ví dụ (hỏi Tiểu Tâm)
- **"Ví còn bao nhiêu Om?"** → Tiểu Tâm đọc balance và các giao dịch gần nhất.
- **"Mua module Kế Toán hết bao nhiêu?"** → 500 Om — vào Cửa hàng Module bấm Mua, Om trừ thật từ ledger.

## Changelog
- 1.1.0 (V7A P1/P3): Gate bảo mật lớp 2 cho chi > 1.000; vòng kinh tế vật phẩm (store items trừ Om thật).
- 1.0.0: Ledger balance/topup/spend/guard.
