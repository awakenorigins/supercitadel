# Changelog — @citadel/module-soul-inventory

Theo [Keep a Changelog](https://keepachangelog.com/), semver.

## [2.1.0] — 2026-07-05 · "Automation Layer"

### Added — tự động hóa (AN TOÀN: chỉ tính toán + đề xuất)
- **4 bảng mới** (FORCE RLS): `kho_demand_stats` (avg/stddev/cv theo ngày), `kho_forecasts` (MA/SES), `kho_replenish_params` (service level, lead time, SS/ROP/EOQ cache), `kho_automation_runs` (log minh bạch mỗi lần chạy).
- **Safety stock + reorder point động**: z-score nội suy tuyến tính theo service level, SS = z×stddev×√lead_time, ROP = demand×lead_time + SS — tự cập nhật mỗi lần automation chạy.
- **EOQ**: √(2×annual_demand×order_cost/(unit_cost×holding_pct)).
- **Forecast MA + SES**: SES đệ quy WITH RECURSIVE phía SQL (α=0.3), horizon cấu hình.
- **kho.replenish.suggest**: gợi ý bổ hàng theo ROP động, order_basis EOQ/về-điểm-đặt, days_of_cover.
- **kho.forecast.projected**: days_to_stockout + risk high/medium/low (high = ngắn hơn lead time).
- **kho.xyz.run**: XYZ theo cv (X≤0.5, Y≤1.0, Z>1.0) + ma trận ABC-XYZ 9 ô kèm chiến lược.
- **kho.analytics.dead_stock**: hàng không xuất N ngày + tied_value.
- **kho.automation.run / runScheduledTasks(ctx)**: pipeline stats→forecast→ROP→cảnh báo; export cho host cron; ghi log + event `kho.automation.ran`.
- **6 routes** automation; **6 intents** Việt/Anh; cột `xyz_class` trên items.

### Deferred (để lần sau — theo yêu cầu tránh rủi ro)
- Auto-TẠO đơn mua (spam risk kiểu ERPNext) — hiện chỉ đề xuất.
- Holt-Winters/Croston (cần nhiều dữ liệu, dễ sai với SME) — chỉ MA + SES.
- Cron nội bộ tự chạy ngầm — chỉ expose hàm cho host gọi.
- Auto-scrap hết hạn — vẫn cần người xác nhận.

### Fixed (audit bắt trong quá trình build)
- Thiếu `WITH RECURSIVE` cho CTE SES tự tham chiếu.
- Cast alias trong ORDER BY (projectedInventory, deadStockDetection) — lặp biểu thức đầy đủ.
- `round(double precision, int)` không tồn tại: `sqrt(int)` trả double → cast `::numeric` trước round; bỏ CASE match text numeric mong manh, thay bằng nội suy z-score.

### Changed
- Tools 23 → **29** (13 read + 16 write). Intents 22 → **28**. Routes 28 → **33** (manifest). Bảng 17 → **21**. Events 24 → **26**. Migrations 5 → **7**. Test 114 → **148**.

## [2.0.0] — 2026-07-05 · "Soul-Inventory FINAL"

### Added — nghiệp vụ
- **Multi-UoM** (`kho_item_uoms`): 1 quy cách = factor × đơn vị gốc; nhập/xuất nhận field `uom`, đơn giá tự quy về gốc; barcode riêng từng quy cách.
- **FEFO/FIFO picking suggestion** (`kho.picking.suggest`): kế hoạch xuất từng lô (expiry NULLS LAST / received_at), fulfilled/shortage, KHÔNG ghi DB.
- **BOM + assembly** (`kho_boms`, `kho_bom_lines`, `kho_assembly_orders`): định mức + scrap_pct, lắp ráp backflush nguyên liệu + giá vốn thành phẩm = Σ(NL×avg_cost)/qty, tháo dỡ hoàn NL, max_buildable, lệnh LSX-/LTD-.
- **Reorder rules** (`kho_reorder_rules`): min-max per item (+location), NCC + lead time; gợi ý đặt = max − available − incoming.
- **Landed cost** (`kho_landed_costs` + lines): phân bổ by_value/by_qty vào phiếu nhập, dòng cuối nhận phần dư, avg_cost cập nhật; LC-.
- **Scrap** (`kho.stock.scrap`): hủy hàng hỏng guard khả dụng, movement 'scrap', loss_value theo avg_cost, lô hết tồn tự consumed; SCR-.
- **ABC analysis**: Pareto theo giá trị xuất N ngày (cum_before pattern — item đầu luôn A), ghi abc_class; **cycle count suggestion** A/30d B/60d C/120d; **stock aging** bucket 0-30/31-60/61-90/>90.
- **Excel I/O** (SheetJS): importItems + importOpeningStock (header Việt/Anh, Excel date serial, per-row results), exportStockReport + exportStockCard.
- **Barcode lookup**: khớp barcode item HOẶC barcode quy cách (trả kèm factor).
- **Doc numbers** (`kho_doc_counters`): PNK/PXK/KK/LSX/LTD/LC/SCR tuần tự theo org, atomic INSERT ON CONFLICT.
- **Cost layers** (`kho_cost_layers`): nền FIFO valuation cho tương lai (item.valuation_method 'avg'|'fifo').

### Added — kiến trúc (hấp thụ Kế Toán 10A)
- **Dry-run→confirm protocol**: KhoToolDefinition thêm `sensitive` + `securityLevel` (1|2); 8 actions nhạy cảm; `executeAction` trong contract.ts: chưa confirm → preview + audit 'dryrun', confirm → chạy + audit 'ok'/'error'.
- **Message tiếng Việt trả sẵn**: mọi action trả `{ok, message, data}` — Tiểu Tâm đọc lại, không tự soạn số.
- **Contract mirror** (`src/contract.ts`): structural typing phản chiếu host types — build độc lập, cắm là chạy.
- **WIRING.patch**: gắn host một lệnh, 4 điểm chạm.
- **Audit sink**: nhận HostAuditSink từ host, mọi action ghi audit chung.

### Changed
- Tools 11 → **23** (10 read + 13 write). Intents 11 → **22**. Routes 12 → **28**. Bảng 8 → **17**. Events 15 → **24**.
- `receiveStock`/`issueStock`: nhận `uom`, mọi phiếu có doc_no.
- manifest 2.0.0: tools khai kind + sensitive + securityLevel; store giữ 1.000/150 Ôm.

### Fixed
- ABC edge case ít item: phân lớp theo cum_before thay vì cum — item giá trị lớn nhất luôn lớp A.
- Postgres type inference: COALESCE(unit_cost::numeric, 0) trong landed cost weight.
- ORDER BY alias có cast trong cycle count — lặp biểu thức đầy đủ.
- UTF-8 đứt byte trong docs (heredoc nuốt \xe1 đầu ký tự tiếng Việt) — vá binary + chuyển sang ghi docs bằng python.

## [1.1.0] — 2026-07-04 · "Soul-Inventory"
- kho_lots (lot/serial/expiry), avg_cost, backfill legacy, thẻ kho S10-DN, summary, tách 5 read/6 write, store entry. Test 61, audit 115/115.

## [1.0.0] — 2026-07-04 (nền "Kho")
- 7 bảng chuẩn ④, FORCE RLS, 8 tools, 8 intents, 14 events, docs ⑧, smoke 34/34, audit 95/95.
