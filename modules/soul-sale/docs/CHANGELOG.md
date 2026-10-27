# Soul-Sale 1A — CHANGELOG

## 1.0.0 — 2026-07-06
- Phát hành lần đầu cho SuperCitadel `>=11.4.0`.
- 38 bảng schema `soulsale` (prefix `ss_`), RLS fail-closed 100% bảng, `org_id` mọi dòng, tiền `numeric(18,0)` VND.
- Bề mặt Tiểu Tâm: 23 read tools + 34 write actions; 14 action L2 dry-run→confirm với preview đọc-không-ghi; audit `ss_action_audit` (dryrun/ok/error).
- Cây kênh closure table: move chống vòng (L2 kéo cả nhánh), merge chặn tuyến dưới, root-agency cho hoa hồng.
- Máy giá tầng: đích danh > segment > cấp đại lý > chung; bậc minQty; cửa sổ hiệu lực (khuyến mãi song song giá chuẩn); upsert theo scope-tuple.
- Cổng công nợ khi confirm đơn: khoá nợ chặn tuyệt đối; vượt hạn mức chặn kèm số liệu, override tường minh có log.
- Splitter: Excel header Việt linh hoạt, parseMoney chịu định dạng bẩn, match 3 tầng, case workflow, tách 5 dòng tiền + suspense, statement idempotent.
- Finance: chỉ tiêu 4 scope rollup, hoa hồng owner/agency idempotent, chốt kỳ nợ chuỗi opening/closing, revenue 4 chiều, sell-through.
- Automation 6 job/đêm + intelligence rule-based (churn, quét trùng, next-best).
- 14 events emit / 3 subscribe (inbox pattern). 102 test PGlite xanh, typecheck 0 lỗi.

### Giới hạn đã biết (V1)
Không POS; không e-invoice VN (đi qua module kế toán); chỉ VND; intelligence rule-based; đơn delivered/invoiced hủy bằng chứng từ đảo bên kế toán; debt aging quét top 100.
