# CITADEL — PHƯƠNG ÁN FORK MODULE TỪ HỆ SINH THÁI OPEN-SOURCE
*Deepdive thực hiện 10/06/2026 — clone & phân tích mã nguồn thật, không nói chay.*

## 1. KẾT QUẢ DEEPDIVE ERPNEXT (đã clone, đã đo)

| Số liệu đo được | Giá trị | Ý nghĩa cho Citadel |
|---|---|---|
| DocTypes module `accounts` | **192** | Kế toán thật phức tạp gấp ~30 lần module Om hiện tại |
| DocTypes module `stock` | **78** | Kho "thật" = batch, serial, warehouse, valuation… |
| DocTypes `manufacturing` / `crm` / `selling` | 49 / 29 / 19 | CRM Citadel (5 bảng) ≈ 17% bề mặt CRM ERPNext |
| File Python / JS | **2.712 / 630** | Code lõi là Python trên Frappe framework |
| Field trong DocType `Item` | **132** (Citadel `inventory_items`: 7) | ~80% field là tính năng SME Việt chưa cần ngay (asset, batch, manufacturing) |
| HR | **Đã tách khỏi ERPNext** → repo riêng `frappe/hrms` (13 module: leave, attendance, payroll, taxation…) | Nguồn thiết kế cho module Nhân Sự |
| CRM mới | Tách sang `frappe/crm` (frontend Vue/TS) | Tham khảo UI patterns |

**Phát hiện giá trị nhất — pattern Stock Ledger Entry (SLE):** ERPNext KHÔNG lưu tồn kho bằng cột `qty`. Mọi biến động là một dòng ledger bất biến: `item / warehouse / posting_date / voucher / actual_qty / valuation_rate / qty_after_transaction`. Tồn kho = tổng ledger. Đây chính xác là pattern `om_ledger` Citadel đã dùng cho ví Om → **port sang Kho Hàng là bước tiến hóa tự nhiên nhất** (audit trail, không bao giờ lệch số, tính giá vốn FIFO/Moving Average được).

## 2. SỰ THẬT KỸ THUẬT VỀ "FORK"

ERPNext = Python + Frappe framework + MariaDB. Citadel = TypeScript + Hono + Postgres. **Không thể copy code Python vào Citadel.** "Fork" với ERPNext nghĩa là 1 trong 3 chiến lược:

| Chiến lược | Cách làm | Khi nào dùng |
|---|---|---|
| **A. Port domain model** | Lấy DocType JSON schema + business logic (vd `stock_ledger.py`) làm **bản thiết kế**, viết lại bằng TS trong kiến trúc module Citadel | Nguồn là Python/PHP nhưng domain model xuất sắc (ERPNext, hrms) |
| **B. Fork code thật** | Clone repo JS/TS, cắt lấy service layer, bọc vào pattern `build{Module}Routes` của Citadel | Nguồn cùng stack (Node/TS) + license cho phép |
| **C. Bridge API** | Chạy nguồn như service song song, Citadel gọi REST/MCP | Cần ngay tính năng khổng lồ (kế toán thuế VN đầy đủ) — đánh đổi: phá trải nghiệm Tiểu Tâm-first, vận hành 2 hệ |

**Khuyến nghị: A là chủ lực, B cho repos TS chọn lọc, C chỉ khi khách yêu cầu kế toán chuẩn thuế gấp.** Lý do: linh hồn Citadel là Tiểu Tâm hiểu mọi module qua tool-calls thống nhất — bridge sang hệ ngoài làm gãy điều đó.

## 3. BẢN ĐỒ NGUỒN FORK ↔ MODULE CITADEL

| Module Citadel | Nguồn fork tốt nhất | Stack | License | Chiến lược | Độ khó |
|---|---|---|---|---|---|
| **Kho Hàng v2** (ledger, multi-kho, giá vốn) | ERPNext `stock` (SLE + Item + Warehouse + Stock Entry) | Python | GPLv3 → port concept OK, không copy code | **A** | ●●○○ |
| **Kế toán** (module mới: thu-chi, công nợ, double-entry) | ERPNext `accounts` (thiết kế) + `ledgerstack-core` (engine double-entry Node, npm mới 2026) + Bigcapital (TS) | TS/Python | npm package: kiểm tra license khi dùng; ERPNext: port concept | **A + B** | ●●●○ |
| **Nhân Sự v2** (chấm công, nghỉ phép, lương) | `frappe/hrms` — 13 module: Leave policy, Attendance geolocation, Payroll | Python | GPLv3 → port concept | **A** | ●●●○ |
| **CRM v2** | `frappe/crm` (UI patterns) + Twenty (data model TS) | Vue/TS | Twenty = **BSL — cẩn trọng SaaS**; frappe/crm AGPL | **A** (model), tránh copy code Twenty | ●●○○ |
| **POS Nhà hàng** (module `pos` coming_soon) | **URY** (POS nhà hàng trên ERPNext: table ordering, KOT bếp) + TastyIgniter (online ordering, đặt bàn) | Python / PHP Laravel | URY: kiểm tra repo; TastyIgniter **MIT — thoải mái nhất** | **A** | ●●●○ |
| **Invoice/Báo giá** | idurar-erp-crm (MERN, 8.3k sao) | Node/React | **Fair-code: CẤM dùng làm SaaS cho bên thứ ba** → chỉ tham khảo cấu trúc, KHÔNG fork code | A (đọc tham khảo) | ●●○○ |
| **Đặt món online** | TastyIgniter ext-cart/ext-local | PHP | MIT | A | ●●○○ |

**Cảnh báo license cho SaaS Citadel:** GPLv3/AGPL — nếu *copy code* thì toàn bộ phần đó phải mở mã theo GPL; *port lại domain model bằng code tự viết* thì an toàn. Fair-code (idurar) cấm thẳng mô hình SaaS. MIT (TastyIgniter) tự do nhất. → Mặc định toàn bộ kế hoạch dùng **chiến lược A: học thiết kế, tự viết code TS** — sạch license, giữ kiến trúc.

## 4. ROADMAP 3 ĐỢT (mỗi đợt là 1 mạch StepForge tách biệt)

**Đợt 1 — Kho Ledger hóa (port SLE):** bảng `stock_ledger` (org/item/warehouse/voucher/actual_qty/qty_after/valuation_rate) thay cột `qty`; API giữ nguyên bề mặt (UI không đổi) + thêm `GET /inventory/items/:id/ledger` (lịch sử nhập xuất); giá vốn Moving Average. *Đây là nền cho kế toán sau này.*

**Đợt 2 — Nhân Sự v2 (port hrms tối giản):** `hr_employees` (hồ sơ), `hr_attendance` (check-in/out), `hr_leave` (đơn nghỉ + duyệt). Tiểu Tâm tool mới: `hr.who_is_working_today`, `hr.approve_leave`.

**Đợt 3 — POS Nhà hàng (port URY concept):** bàn → order → KOT gửi bếp (qua WS sẵn có!) → bill; trừ kho tự động qua stock_ledger đợt 1. Mở khóa module `pos` trong catalog.

Sau 3 đợt: cân nhắc module Kế toán (đợt 4) trên nền double-entry — lúc đó Om ledger + stock ledger + bill POS đã là 3 nguồn bút toán tự nhiên.

## 5. VIỆC KHÔNG NÊN LÀM
- Không chạy ERPNext/Frappe bench bên trong Citadel stack (2 framework, 2 DB, phá deploy 1-lệnh).
- Không copy nguyên code GPL/BSL/fair-code vào repo SaaS.
- Không port đủ 132 field của Item — SME Việt cần ~15 field; phần còn lại thêm khi có khách yêu cầu.
