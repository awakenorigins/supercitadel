# Soul-Sale 1A — TOOLS.md (bề mặt Tiểu Tâm)

> Sinh tự động từ `src/registry/` — 23 read tools + 34 write actions. Action **L2 (nhạy cảm)** theo protocol dry-run→confirm: gọi không `confirm` → nhận `{dry_run:true, preview}`; gọi lại kèm `confirm:true` để thực thi.

## Read tools (23)

### `soulsale.customer.search`
- **Permission:** `soulsale.customer.read`
- **Mô tả:** Tìm khách hàng theo tên (bỏ dấu được), mã, hoặc SĐT; lọc theo loại (person/company/agency/retailer)
- **Tham số:** `q?: string`, `kind?: enum(person|company|agency|retailer|distributor)`, `limit?: number`
- **Câu nói mẫu:** “tìm khách tên Hoa Mai” · “có khách nào SĐT 0911222333 không”

### `soulsale.customer.profile`
- **Permission:** `soulsale.customer.read`
- **Mô tả:** Hồ sơ 360° một khách: thông tin, liên hệ, địa chỉ, hồ sơ kênh, hạn mức, chuỗi cấp trên
- **Tham số:** `customerId: string`
- **Câu nói mẫu:** “xem hồ sơ khách KH-0001”

### `soulsale.customer.history`
- **Permission:** `soulsale.customer.read`
- **Mô tả:** Lịch sử mua hàng + RFM (recency/frequency/monetary) + hoạt động gần nhất của khách
- **Tham số:** `customerId: string`
- **Câu nói mẫu:** “khách này mua bao nhiêu lần rồi, tổng bao nhiêu tiền”

### `soulsale.customer.duplicate-check`
- **Permission:** `soulsale.customer.read`
- **Mô tả:** Kiểm tra khả năng trùng khách theo SĐT/email/tên (trả ứng viên kèm điểm tin cậy)
- **Tham số:** `phone?: string`, `email?: string`, `name?: string`
- **Câu nói mẫu:** “SĐT 0909xxx đã có trong hệ thống chưa”

### `soulsale.agency.tree`
- **Permission:** `soulsale.channel.read`
- **Mô tả:** Cây kênh phân phối (NPP → đại lý → shop) dạng lồng nhau; truyền rootId để xem một nhánh
- **Tham số:** `rootId?: string`
- **Câu nói mẫu:** “vẽ cây đại lý của công ty” · “tuyến dưới của NPP Miền Nam gồm ai”

### `soulsale.retailer.by-agency`
- **Permission:** `soulsale.channel.read`
- **Mô tả:** Danh sách shop/điểm bán thuộc một đại lý (trực tiếp hoặc cả tuyến dưới)
- **Tham số:** `agencyCustomerId: string`, `includeSub?: boolean`
- **Câu nói mẫu:** “NPP Cửu Long có bao nhiêu shop”

### `soulsale.pipeline.summary`
- **Permission:** `soulsale.deal.read`
- **Mô tả:** Tổng quan pipeline: số deal, tổng tiền, giá trị có trọng số theo từng stage
- **Tham số:** `pipelineCode?: string`
- **Câu nói mẫu:** “pipeline tháng này thế nào”

### `soulsale.deal.health`
- **Permission:** `soulsale.deal.read`
- **Mô tả:** Danh sách deal theo sức khỏe (hot/warm/cold/at_risk) — tự tính lại trước khi trả
- **Tham số:** `health?: enum(hot|warm|cold|at_risk)`, `limit?: number`
- **Câu nói mẫu:** “deal nào đang nguy cơ rớt” · “liệt kê deal hot”

### `soulsale.activity.timeline`
- **Permission:** `soulsale.deal.read`
- **Mô tả:** Dòng thời gian hoạt động (call/meet/note/task) của một lead/deal/khách/đơn
- **Tham số:** `refType: enum(lead|deal|customer|order)`, `refId: string`, `limit?: number`
- **Câu nói mẫu:** “lịch sử chăm sóc deal DL-0001”

### `soulsale.quote.status`
- **Permission:** `soulsale.quote.read`
- **Mô tả:** Trạng thái báo giá; expiringDays=N liệt kê báo giá sắp hết hạn trong N ngày
- **Tham số:** `status?: string`, `expiringDays?: number`, `limit?: number`
- **Câu nói mẫu:** “báo giá nào sắp hết hạn tuần này”

### `soulsale.order.search`
- **Permission:** `soulsale.order.read`
- **Mô tả:** Tìm đơn hàng theo mã/khách/trạng thái/kỳ (YYYY-MM)
- **Tham số:** `q?: string`, `customerId?: string`, `status?: string`, `period?: string`, `limit?: number`
- **Câu nói mẫu:** “đơn tháng 7 của NPP Cửu Long” · “đơn nào đang on_hold”

### `soulsale.revenue.summary`
- **Permission:** `soulsale.report.read`
- **Mô tả:** Tổng hợp doanh thu (đơn đã xác nhận) theo kỳ/nhân viên/kênh/đại lý gốc
- **Tham số:** `period?: string`, `groupBy?: enum(period|owner|channel|agency)`
- **Câu nói mẫu:** “doanh thu tháng 6 theo nhân viên” · “kênh nào bán mạnh nhất”

### `soulsale.target.progress`
- **Permission:** `soulsale.target.read`
- **Mô tả:** Tiến độ chỉ tiêu kỳ: đạt/mục tiêu/%, gap — rollup tươi trước khi trả
- **Tham số:** `period: string`, `scope?: enum(user|agency|territory|org)`
- **Câu nói mẫu:** “ai đạt chỉ tiêu tháng này” · “NPP Cửu Long chạy được bao nhiêu % target”

### `soulsale.price.check`
- **Permission:** `soulsale.price.read`
- **Mô tả:** Tra giá áp dụng cho khách/sản phẩm/số lượng tại một thời điểm (kèm nguồn rule)
- **Tham số:** `productCode: string`, `customerId?: string`, `qty?: number`, `at?: string`
- **Câu nói mẫu:** “giá NPK cho đại lý cấp 2 là bao nhiêu” · “mua 100 thùng thì giá nào”

### `soulsale.credit.check`
- **Permission:** `soulsale.finance.read`
- **Mô tả:** Kiểm tra công nợ: hạn mức, đang nợ, còn khả dụng, có bị khoá không; extraAmount để thử đơn mới
- **Tham số:** `customerId: string`, `extraAmount?: string`
- **Câu nói mẫu:** “khách này còn mua chịu được bao nhiêu”

### `soulsale.debt.summary`
- **Permission:** `soulsale.finance.read`
- **Mô tả:** Công nợ: chi tiết một khách (kèm 3 snapshot gần nhất) hoặc top khách nợ nhiều nhất
- **Tham số:** `customerId?: string`, `topN?: number`
- **Câu nói mẫu:** “ai đang nợ nhiều nhất” · “công nợ của Shop Hoa Mai”

### `soulsale.sellthrough.summary`
- **Permission:** `soulsale.channel.read`
- **Mô tả:** Sell-in (công ty bán vào tuyến) vs sell-out (đại lý khai qua Splitter) + gap tồn kênh
- **Tham số:** `agencyCustomerId: string`, `period?: string`
- **Câu nói mẫu:** “hàng đẩy xuống NPP đã bán ra được bao nhiêu”

### `soulsale.sales.forecast`
- **Permission:** `soulsale.report.read`
- **Mô tả:** Dự báo doanh số: pipeline có trọng số theo tháng + run-rate 3 tháng (rule-based, minh bạch)
- **Tham số:** `months?: number`
- **Câu nói mẫu:** “tháng sau dự kiến về được bao nhiêu”

### `soulsale.churn.risk-list`
- **Permission:** `soulsale.report.read`
- **Mô tả:** Khách có nguy cơ rời bỏ (im ắng lâu so với nhịp mua) — điểm 0..100
- **Tham số:** `limit?: number`
- **Câu nói mẫu:** “khách nào lâu rồi không quay lại”

### `soulsale.intel.next-best`
- **Permission:** `soulsale.report.read`
- **Mô tả:** Việc nên làm ngay: chốt báo giá sắp hết hạn, nhắc nợ, gộp khách trùng, gọi lại khách sắp rời bỏ
- **Tham số:** `limit?: number`
- **Câu nói mẫu:** “hôm nay đội sale nên làm gì trước”

### `soulsale.import.batch-status`
- **Permission:** `soulsale.import.read`
- **Mô tả:** Tình trạng batch bảng kê: số dòng theo trạng thái, số case đối soát còn mở
- **Tham số:** `batchId?: string`, `period?: string`, `limit?: number`
- **Câu nói mẫu:** “file bảng kê tháng 6 xử lý tới đâu rồi”

### `soulsale.reconciliation.exceptions`
- **Permission:** `soulsale.import.read`
- **Mô tả:** Danh sách case đối soát (thiếu khách/match mờ/trùng dòng/lệch tiền) cần con người xử lý
- **Tham số:** `batchId?: string`, `status?: enum(open|resolved|voided)`, `limit?: number`
- **Câu nói mẫu:** “còn dòng nào chưa khớp được khách”

### `soulsale.commission.preview`
- **Permission:** `soulsale.finance.read`
- **Mô tả:** Xem trước hoa hồng một kỳ theo các plan đang bật (chưa ghi sổ)
- **Tham số:** `period: string`, `planCode?: string`
- **Câu nói mẫu:** “hoa hồng tháng 6 của đội sale khoảng bao nhiêu”

## Write actions (34)

### `soulsale.customer.create`
- **Permission:** `soulsale.customer.write` · **Security level:** 1
- **Mô tả:** Tạo khách hàng mới (person/company/agency/retailer/distributor)
- **Tham số:** `kind: enum(person|company|agency|retailer|distributor)`, `name: string`, `phone?: string`, `email?: string`, `taxCode?: string`, `segmentCode?: string`, `ownerUserId?: string`, `note?: string`
- **Câu nói mẫu:** “tạo khách mới tên Chị Út, SĐT 0988...”

### `soulsale.customer.update`
- **Permission:** `soulsale.customer.write` · **Security level:** 1
- **Mô tả:** Cập nhật thông tin khách (tên/SĐT/email/segment/ghi chú/người phụ trách)
- **Tham số:** `customerId: string`, `name?: string`, `phone?: string`, `email?: string`, `taxCode?: string`, `segmentCode?: string`, `ownerUserId?: string`, `note?: string`
- **Câu nói mẫu:** “đổi SĐT khách KH-0002 thành 0909...”

### `soulsale.customer.merge` 🔒 L2
- **Permission:** `soulsale.customer.write` · **Security level:** 2 · **dry-run→confirm bắt buộc**
- **Mô tả:** Gộp khách trùng: dồn toàn bộ giao dịch/liên hệ về khách đích, khách nguồn đánh dấu merged (không xoá)
- **Tham số:** `sourceId: string`, `targetId: string`
- **Câu nói mẫu:** “gộp KH-0009 vào KH-0002”

### `soulsale.agency.create`
- **Permission:** `soulsale.channel.write` · **Security level:** 1
- **Mô tả:** Tạo đại lý/NPP (kèm cấp, tuyến trên, khu vực, người quản lý)
- **Tham số:** `name: string`, `level?: number`, `parentAgencyCustomerId?: string`, `territoryCode?: string`, `phone?: string`, `email?: string`, `taxCode?: string`, `managerUserId?: string`, `discountTier?: string`, `segmentCode?: string`
- **Câu nói mẫu:** “mở đại lý cấp 2 ở Quận 7 thuộc NPP Miền Nam”

### `soulsale.retailer.create`
- **Permission:** `soulsale.channel.write` · **Security level:** 1
- **Mô tả:** Tạo shop/điểm bán lẻ (gắn vào đại lý tuyến trên nếu có)
- **Tham số:** `name: string`, `parentAgencyCustomerId?: string`, `shopType?: string`, `territoryCode?: string`, `phone?: string`, `email?: string`, `segmentCode?: string`
- **Câu nói mẫu:** “thêm Shop Hoa Mai vào tuyến đại lý C2 Quận 7”

### `soulsale.agency.move` 🔒 L2
- **Permission:** `soulsale.channel.write` · **Security level:** 2 · **dry-run→confirm bắt buộc**
- **Mô tả:** Chuyển tuyến một node kênh (đại lý/shop) sang cha mới — kéo theo toàn bộ tuyến dưới, ảnh hưởng rollup doanh số & hoa hồng
- **Tham số:** `customerId: string`, `newParentId: nullable`
- **Câu nói mẫu:** “chuyển Shop Hướng Dương lên thẳng NPP”

### `soulsale.territory.assign`
- **Permission:** `soulsale.channel.write` · **Security level:** 1
- **Mô tả:** Gán khu vực (territory) cho đại lý/shop — tạo territory nếu chưa có
- **Tham số:** `customerId: string`, `territoryCode: string`, `territoryName?: string`
- **Câu nói mẫu:** “gán đại lý này vào khu vực Mekong”

### `soulsale.lead.create`
- **Permission:** `soulsale.lead.write` · **Security level:** 1
- **Mô tả:** Ghi nhận lead mới (nguồn: facebook/tiktok/zalo/showroom/referral/campaign/import/other) — tự chấm điểm
- **Tham số:** `source: enum(facebook|tiktok|zalo|showroom|referral|campaign|import|other)`, `name: string`, `phone?: string`, `email?: string`, `note?: string`, `ownerUserId?: string`
- **Câu nói mẫu:** “có khách hỏi qua Zalo tên Anh Bảy, lưu lead”

### `soulsale.lead.assign`
- **Permission:** `soulsale.lead.write` · **Security level:** 1
- **Mô tả:** Gán lead cho nhân viên phụ trách (lead mới chuyển sang working)
- **Tham số:** `leadId: string`, `ownerUserId: string`
- **Câu nói mẫu:** “giao lead này cho bạn Linh”

### `soulsale.lead.disqualify`
- **Permission:** `soulsale.lead.write` · **Security level:** 1
- **Mô tả:** Loại lead kèm lý do (SĐT ảo, không nhu cầu, spam...)
- **Tham số:** `leadId: string`, `reason: string`
- **Câu nói mẫu:** “bỏ lead này, số ảo”

### `soulsale.lead.convert`
- **Permission:** `soulsale.lead.write` · **Security level:** 1
- **Mô tả:** Convert lead → khách + deal; tự nhận diện SĐT trùng để tái dùng khách có sẵn, không tạo trùng
- **Tham số:** `leadId: string`, `dealTitle?: string`, `amount?: string`, `customerId?: string`, `customerKind?: enum(person|company)`
- **Câu nói mẫu:** “lead Anh Bảy chốt rồi, convert giúp”

### `soulsale.deal.create`
- **Permission:** `soulsale.deal.write` · **Security level:** 1
- **Mô tả:** Tạo cơ hội bán hàng (deal) trong pipeline
- **Tham số:** `title: string`, `customerId?: string`, `amount?: string`, `pipelineCode?: string`, `stageName?: string`, `expectedClose?: string`, `ownerUserId?: string`
- **Câu nói mẫu:** “tạo deal 30 triệu cho khách KH-0005, dự kiến chốt 20/07”

### `soulsale.deal.move-stage`
- **Permission:** `soulsale.deal.write` · **Security level:** 1
- **Mô tả:** Chuyển deal sang stage khác; về "Thua" bắt buộc lostReason; stage Thắng/Thua chốt trạng thái
- **Tham số:** `dealId: string`, `stageName: string`, `lostReason?: string`, `amount?: string`
- **Câu nói mẫu:** “đẩy deal DL-0003 sang Báo giá”

### `soulsale.activity.log`
- **Permission:** `soulsale.deal.write` · **Security level:** 1
- **Mô tả:** Ghi hoạt động (call/meet/note/task/email/zalo) vào lead/deal/khách/đơn — nuôi điểm lead & health deal
- **Tham số:** `kind: enum(call|meet|note|task|email|zalo)`, `subject: string`, `content?: string`, `refType: enum(lead|deal|customer|order)`, `refId: string`, `dueAt?: string`, `doneAt?: string`
- **Câu nói mẫu:** “ghi lại: đã gọi khách, hẹn gặp thứ 5”

### `soulsale.quote.create`
- **Permission:** `soulsale.quote.write` · **Security level:** 1
- **Mô tả:** Tạo báo giá — dòng nào không truyền giá sẽ tự tra máy giá tầng theo khách
- **Tham số:** `customerId: string`, `dealId?: string`, `items: array`, `validUntil?: string`, `note?: string`
- **Câu nói mẫu:** “báo giá 10 thùng NPK cho đại lý Sông Tiền, hiệu lực tới 20/07”

### `soulsale.quote.close`
- **Permission:** `soulsale.quote.write` · **Security level:** 1
- **Mô tả:** Chốt báo giá: accepted hoặc rejected (rejected bắt buộc lý do)
- **Tham số:** `quoteId: string`, `outcome: enum(accepted|rejected)`, `reason?: string`
- **Câu nói mẫu:** “khách đồng ý báo giá BG-0002 rồi”

### `soulsale.order.create`
- **Permission:** `soulsale.order.write` · **Security level:** 1
- **Mô tả:** Tạo đơn nháp từ báo giá (giữ nguyên giá đã chốt) hoặc từ danh sách hàng; CHƯA chạm công nợ
- **Tham số:** `customerId?: string`, `fromQuoteId?: string`, `items?: array`, `paymentTermCode?: string`, `channel?: enum(b2b|b2c|agency|retailer)`, `territoryId?: string`
- **Câu nói mẫu:** “lên đơn từ báo giá BG-0002, công nợ NET15”

### `soulsale.order.confirm` 🔒 L2
- **Permission:** `soulsale.order.write` · **Security level:** 2 · **dry-run→confirm bắt buộc**
- **Mô tả:** Xác nhận đơn (draft/on_hold → confirmed) — QUA CỔNG CÔNG NỢ: khoá nợ chặn, vượt hạn mức chặn trừ khi đã duyệt vượt
- **Tham số:** `orderId: string`
- **Câu nói mẫu:** “xác nhận đơn SO-202607-0001”

### `soulsale.order.cancel` 🔒 L2
- **Permission:** `soulsale.order.write` · **Security level:** 2 · **dry-run→confirm bắt buộc**
- **Mô tả:** Hủy đơn (draft/confirmed/delivering/on_hold) kèm lý do — giữ nguyên bản ghi + log đảo, phát sự kiện cho kế toán; đơn đã giao/xuất hoá đơn phải đi đường chứng từ đảo
- **Tham số:** `orderId: string`, `reason: string`
- **Câu nói mẫu:** “hủy đơn SO-202607-0003, đại lý báo nhập nhầm”

### `soulsale.order.hold-toggle` 🔒 L2
- **Permission:** `soulsale.order.write` · **Security level:** 2 · **dry-run→confirm bắt buộc**
- **Mô tả:** Giữ đơn (kèm lý do) / thả đơn; overrideCredit=true để duyệt vượt hạn mức cho đơn đang kẹt cổng công nợ
- **Tham số:** `orderId: string`, `hold: boolean`, `reason?: string`, `overrideCredit?: boolean`
- **Câu nói mẫu:** “giữ đơn này lại, chờ đối chiếu kho” · “duyệt vượt hạn mức cho đơn SO-... rồi thả”

### `soulsale.payment.record` 🔒 L2
- **Permission:** `soulsale.finance.write` · **Security level:** 2 · **dry-run→confirm bắt buộc**
- **Mô tả:** Ghi nhận tiền về (deposit/payment/refund) theo đơn hoặc theo khách — refund không được vượt số đã thu
- **Tham số:** `orderId?: string`, `customerId?: string`, `kind: enum(deposit|payment|refund)`, `amount: string`, `method?: enum(cash|bank|card|ewallet)`, `externalRef?: string`, `note?: string`
- **Câu nói mẫu:** “khách chuyển khoản 5 triệu cho đơn SO-202607-0001”

### `soulsale.payment.term-set`
- **Permission:** `soulsale.finance.write` · **Security level:** 1
- **Mô tả:** Gán điều khoản thanh toán mặc định cho khách (COD/DEP30/NET7/NET15/NET30)
- **Tham số:** `customerId: string`, `termCode: string`
- **Câu nói mẫu:** “cho đại lý này công nợ NET30”

### `soulsale.price.rule-set` 🔒 L2
- **Permission:** `soulsale.price.write` · **Security level:** 2 · **dry-run→confirm bắt buộc**
- **Mô tả:** Đặt/cập nhật rule giá (chung, theo segment, theo cấp đại lý, hoặc đích danh khách; bậc số lượng; cửa sổ hiệu lực) — ảnh hưởng mọi báo giá/đơn mới
- **Tham số:** `productCode: string`, `unitPrice: string`, `discountPct?: string`, `priceBookCode?: string`, `customerId?: string`, `segmentCode?: string`, `agencyLevel?: number`, `minQty?: number`, `validFrom?: string`, `validTo?: string`, `priority?: number`, `active?: boolean`
- **Câu nói mẫu:** “đặt giá NPK cho đại lý cấp 2 là 480k” · “khuyến mãi Urê 150k từ 01–30/06”

### `soulsale.credit.limit-set` 🔒 L2
- **Permission:** `soulsale.finance.write` · **Security level:** 2 · **dry-run→confirm bắt buộc**
- **Mô tả:** Đặt hạn mức công nợ cho khách (kèm điều khoản thanh toán nếu muốn)
- **Tham số:** `customerId: string`, `limitAmount: string`, `paymentTermCode?: string`
- **Câu nói mẫu:** “nâng hạn mức NPP Cửu Long lên 200 triệu”

### `soulsale.credit.hold-toggle` 🔒 L2
- **Permission:** `soulsale.finance.write` · **Security level:** 2 · **dry-run→confirm bắt buộc**
- **Mô tả:** Khoá/mở khoá công nợ một khách (khoá bắt buộc lý do) — khoá thì mọi đơn mới không xác nhận được
- **Tham số:** `customerId: string`, `hold: boolean`, `reason?: string`
- **Câu nói mẫu:** “khoá công nợ Shop X, quá hạn 2 kỳ”

### `soulsale.target.set`
- **Permission:** `soulsale.target.write` · **Security level:** 1
- **Mô tả:** Đặt chỉ tiêu doanh số theo kỳ cho nhân viên/đại lý/khu vực/toàn công ty (upsert)
- **Tham số:** `scope: enum(user|agency|territory|org)`, `scopeId?: string`, `period: string`, `targetAmount: string`
- **Câu nói mẫu:** “giao chỉ tiêu tháng 7 cho sale-A là 150 triệu”

### `soulsale.commission.plan-set` 🔒 L2
- **Permission:** `soulsale.finance.write` · **Security level:** 2 · **dry-run→confirm bắt buộc**
- **Mô tả:** Tạo/cập nhật plan hoa hồng (%, người hưởng: nhân viên phụ trách đơn hoặc đại lý gốc tuyến)
- **Tham số:** `code: string`, `name: string`, `ratePct: string`, `beneficiary: enum(owner|agency)`, `basis?: string`, `active?: boolean`
- **Câu nói mẫu:** “plan hoa hồng nhân viên 2% doanh thu”

### `soulsale.commission.post` 🔒 L2
- **Permission:** `soulsale.finance.write` · **Security level:** 2 · **dry-run→confirm bắt buộc**
- **Mô tả:** Ghi sổ hoa hồng một kỳ (idempotent — chạy lại không nhân đôi); xem trước bằng commission.preview
- **Tham số:** `period: string`, `planCode?: string`
- **Câu nói mẫu:** “chốt hoa hồng tháng 6”

### `soulsale.debt.snapshot-close` 🔒 L2
- **Permission:** `soulsale.finance.write` · **Security level:** 2 · **dry-run→confirm bắt buộc**
- **Mô tả:** Chốt kỳ công nợ: opening (kỳ trước) + phát sinh − đã thu = closing, lưu snapshot từng khách
- **Tham số:** `period: string`, `customerId?: string`
- **Câu nói mẫu:** “chốt công nợ tháng 6 toàn bộ khách”

### `soulsale.import.statement-upload`
- **Permission:** `soulsale.import.write` · **Security level:** 1
- **Mô tả:** Nạp bảng kê đại lý (Excel base64 hoặc rows JSON) — header tiếng Việt linh hoạt, tiền "1.234.567" tự hiểu
- **Tham số:** `sourceCustomerId: string`, `period: string`, `fileName?: string`, `fileBase64?: string`, `rows?: array`
- **Câu nói mẫu:** “nạp file bảng kê tháng 6 của NPP Đồng Tháp”

### `soulsale.import.batch-reconcile`
- **Permission:** `soulsale.import.write` · **Security level:** 1
- **Mô tả:** Đối soát batch: match khách (mã > SĐT > tên bỏ dấu), bắt dòng trùng/thiếu khách/lệch tiền thành case
- **Tham số:** `batchId: string`
- **Câu nói mẫu:** “đối soát batch IB-202606-0001”

### `soulsale.import.row-resolve`
- **Permission:** `soulsale.import.write` · **Security level:** 1
- **Mô tả:** Xử lý một dòng ngoại lệ: match (gán khách), accept (nhận ứng viên mờ), hoặc void (bỏ dòng)
- **Tham số:** `rowId: string`, `action: enum(match|accept|void)`, `customerId?: string`, `note?: string`
- **Câu nói mẫu:** “dòng 3 là Chị Chín Sa Đéc, gán vào khách vừa tạo”

### `soulsale.import.split-confirm` 🔒 L2
- **Permission:** `soulsale.import.write` · **Security level:** 2 · **dry-run→confirm bắt buộc**
- **Mô tả:** Chốt batch: tách dòng tiền (doanh thu/ship/cọc/CK/nợ) thành statement chính thức của đại lý — yêu cầu 0 case mở
- **Tham số:** `batchId: string`
- **Câu nói mẫu:** “chốt bảng kê tháng 6 của NPP Đồng Tháp”

### `soulsale.import.batch-void` 🔒 L2
- **Permission:** `soulsale.import.write` · **Security level:** 2 · **dry-run→confirm bắt buộc**
- **Mô tả:** Hủy batch chưa chốt (file sai kỳ/sai đại lý) — dòng & case chuyển voided, giữ raw để truy vết
- **Tham số:** `batchId: string`, `reason: string`
- **Câu nói mẫu:** “hủy batch này, file gửi nhầm kỳ”

---

**Quy ước chung:** tiền VND là chuỗi số nguyên (`"5000000"` = 5 triệu); `period` dạng `YYYY-MM`; mọi ID là UUID lấy từ tool search/profile tương ứng.
