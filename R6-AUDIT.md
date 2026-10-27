# R6-AUDIT.md — Tiểu Tâm Sonnet 4.6 + Action Layer (Phase C, 03/07/2026 22:19 VN)

Môi trường: site LIVE https://supercitadel.62.146.238.213.sslip.io · token owner V8OWNERFULL01 · script `scripts/audit-tt-live.sh`

## 0. Engine
| Kiểm tra | Kết quả |
|---|---|
| GET /tieu-tam/state → engine | **sonnet-4.6** (mặc định, luôn active) ✅ |
| Chat mode | **live** (LLM thật qua proxy, không stub) ✅ |

## 1. Ra lệnh tiếng Việt → Tiểu Tâm thực thi THẬT (verify DB sau mỗi lệnh)

| # | Lệnh | Action executed | Verify DB qua API | KQ |
|---|---|---|---|---|
| 1 | "Tạo phiếu thu 200000 cho Cà Phê Sáng" | acc.create_receipt (module accounting) | GET /accounting/payments → `receive · Cà Phê Sáng · 200000` | ✅ PASS |
| 2 | "Thêm khách hàng Chị Hoa số điện thoại 0901234567" | crm.add_contact (module crm) | GET /crm/contacts → `Chị Hoa · 0901234567` | ✅ PASS |
| 3 | "Thêm 20 kg cà phê hạt vào kho" | inv.add_item (module inventory) | GET /inventory/items → `cà phê hạt · 20 · kg` | ✅ PASS |
| 4 | "Số dư ví Om của mình là bao nhiêu?" | om.balance (đọc) | Reply "98.134 Om" khớp ví thật | ✅ PASS |

## 2. Audit trail
GET /audit-logs?action=tieu_tam.action → đủ 4 bản ghi đúng thứ tự thời gian:
```
15:19:07 acc.create_receipt → 15:19:09 crm.add_contact → 15:19:10 inv.add_item → 15:19:11 om.balance
```
✅ Mọi hành động của Tiểu Tâm đều có vết audit, org-scoped từ JWT.

## 3. An toàn
- Executor filter orgId từ JWT (không nhận org từ body) ✅
- Module gate: action check isModuleActive trước khi chạy ✅
- Key LLM chỉ nằm trong .env (untracked) — secret scan diff trước push: 0 lộ ✅
- Tool-calling giới hạn 1 vòng, max 5 calls/lượt ✅

## Kết luận
**Tiểu Tâm với engine Sonnet 4.6 THẬT SỰ thực hiện nghiệp vụ trong Citadel thay người dùng** — phiếu thu vào sổ GL thật, khách vào CRM thật, hàng vào kho thật, số dư đọc thật, đủ audit trail. 4/4 lệnh PASS.
