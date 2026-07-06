# Soul-Sale 1A — AGENCY_RETAILER_RULES.md (luật cây kênh)

**Mô hình**: khách `kind ∈ {distributor, agency, retailer}` có hồ sơ kênh (`ss_agency_profiles` cấp 1–5 / `ss_retailer_profiles`). Quan hệ tuyến lưu bằng **closure table** `ss_customer_relationships` (ancestor, descendant, depth; depth 0 = chính nó) — truy cả tuyến dưới/tuyến trên bằng 1 query, không đệ quy runtime.

Luật cứng:
1. **Chống vòng**: `agency.move` cấm chuyển một node xuống làm con của chính tuyến dưới nó (`CYCLE`).
2. **Move kéo cả nhánh**: chuyển node = ghép lại toàn bộ closure của subtree; vì ảnh hưởng rollup chỉ tiêu + hoa hồng agency nên là **L2** với preview số node bị kéo theo.
3. **Gốc tuyến** (`rootAgencyOf`) = tổ tiên xa nhất có hồ sơ agency — dùng chia hoa hồng `beneficiary: agency` và groupBy đại lý trong revenue summary.
4. **Merge bị chặn khi còn tuyến dưới** (`HAS_DOWNLINE`) — phải move con cái đi trước; khách nguồn sau merge thành `status=merged`, giữ row, biến khỏi search/cây, giao dịch & liên hệ repoint về khách đích.
5. **Territory** gán ở hồ sơ kênh; rollup chỉ tiêu scope `territory` đọc `order.territoryId` trước, fallback territory của khách.
6. **Sell-in vs sell-out**: sell-in = đơn công ty bán vào subtree; sell-out = statement đại lý khai qua Splitter (đã confirm). Gap dương = hàng tồn kênh/chưa khai.
