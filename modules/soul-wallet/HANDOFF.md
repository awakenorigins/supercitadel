# HANDOFF — Soul-Wallet 1A

## Trạng thái: HOÀN THÀNH, sẵn sàng cài
- Nguồn: `modules/soul-wallet/` (chuẩn plug-and-play thế hệ soul-*: src standalone + server 2 file wiring + WIRING.patch).
- Chất lượng: 134/134 test (4 suite, PGlite role non-superuser), typecheck 0 lỗi (module + services/api đã wire + apps/web build pass), audit-manifests 11/11, audit-module-docs 11/11, WIRING.patch verify `git apply --check` sạch trên HEAD 37aa789.

## Quyết định thiết kế cần biết khi bảo trì
1. **Owner-scope**: mọi bảng có owner_user_id; helper `own(t, ctx)` là LUẬT — thêm query mới phải đi qua nó.
2. **createTx defensive**: tự default `status='posted'` + `vnd()` normalize — KHÔNG tin caller đã qua Zod (bug thật đã bắt trong build: caller nội bộ bỏ status → ledger bị skip lặng lẽ).
3. **Snapshot = ranged rebuild** từ ngày sớm nhất bị chạm (đúng cả backdate); invariant test #19 suite import-reports khóa chặt `ranged == full`.
4. **6 Hũ mapping** nằm ở `JAR_CATEGORY` trong budget.service — đổi mapping chỉ sửa 1 chỗ + GUIDE.
5. **Debt cash-flow**: gắn ví → income/expense (đúng dòng tiền, không phải P&L). Đã ghi rõ giới hạn trong GUIDE.
6. **Nightly**: `runSoulWalletScheduledAll` tự quét distinct (org, owner) từ sw_accounts — host không cần giữ danh sách chủ ví.

## Việc kế tiếp (đề xuất)
- v1.1: OCR hóa đơn (ảnh → tx draft), PDF sao kê, thêm preset bank (VPB, TPB, Sacombank).
- v1.2: multi-currency (cột currency đã chờ), danh mục đầu tư có giá thị trường.
- v2: bank sync qua open-banking khi VN có API ổn; chia sẻ "ví chung gia đình" (owner group).
- Live acceptance trên deploy thật sau khi cài (checklist docs/ACCEPTANCE.md §Live).
