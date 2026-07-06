# API-SPEC.md — REST API Kế Toán 10A

Base path: `/api/v1/ke-toan-10a` · Auth: host `requireAuth` (JWT → `c.get('auth').orgId`).
`org_id` LUÔN từ auth, không bao giờ từ body. Response: `{ok:true,...}` hoặc `{error:{code,message}}`.

## Health & Setup
| Method | Path | Quyền | Mô tả |
|--------|------|-------|-------|
| GET | `/health` | (không) | Module sống |
| GET | `/health/integrity` | read | **Tự-audit toàn vẹn sổ** → {ok, checks[]} |
| POST | `/setup` | write | Seed 31 TK TT133 (idempotent) |

## Tài khoản `/accounts`
| GET | `/accounts?type=ASSET` | read | Danh sách TK |
| GET | `/accounts/:code/balance?asOf=` | read | Số dư TK |
| POST | `/accounts` | write | Tạo TK {code,name,type} |

## Đối tác `/contacts`
| GET | `/contacts?type=CUSTOMER&search=` | read | Danh sách |
| POST | `/contacts` | write | {name,type,taxCode?,phone?} |

## Phiếu thu `/receipts` · Phiếu chi `/payments`
| GET | `/receipts` · `/payments` | read | 50 gần nhất |
| POST | `/receipts` | write | {docDate,counterAccountCode,amount,post} |
| POST | `/receipts/:id/void` | void | Hủy (đảo bút toán, reverseGate) |
| POST | `/payments` · `/payments/:id/void` | write/void | Tương tự |

## Hoá đơn bán `/invoices`
| GET | `/invoices` | read | Danh sách |
| POST | `/invoices` | write | {docDate,dueDate?,contactId,subtotal\|lines[],taxRate,post} |
| POST | `/invoices/:id/payment` | write | Thu tiền {amount,cashAccountCode?} |

## Hoá đơn mua `/bills` (GEM)
| GET | `/bills` | read | Danh sách |
| POST | `/bills` | write | {docDate,contactId,subtotal\|lines[],taxRate,expenseAccountCode?,post} |
| POST | `/bills/:id/payment` | write | Trả tiền {amount,cashAccountCode?} |

## Bút toán `/journals`
| GET | `/journals/:id` | read | {entry,lines} |
| POST | `/journals` | write | {entryDate,memo,lines[],post} (Σ Nợ=Σ Có) |
| POST | `/journals/:id/reverse` | void | Đảo (reverseGate) |

## Năm tài chính `/fiscal-years` (GEM)
| GET | `/fiscal-years` | read | Danh sách kỳ |
| POST | `/fiscal-years` | write | {name,startDate,endDate} |
| POST | `/fiscal-years/:id/close` | void | **Khóa kỳ** (reverseGate) |
| POST | `/fiscal-years/:id/reopen` | void | Mở kỳ (reverseGate) |

## Báo cáo `/reports`
| GET | `/reports/general-ledger?account=&from=&to=` | read | Sổ cái + lũy kế |
| GET | `/reports/trial-balance?from=&to=` | read | Cân đối phát sinh |
| GET | `/reports/profit-loss?from=&to=` | read | KQKD |
| GET | `/reports/balance-sheet?asOf=` | read | Cân đối kế toán |
| GET | `/reports/dashboard?from=&to=` | read | Tổng quan |
| GET | `/reports/aging?type=sales\|purchase&asOf=` | read | **Tuổi nợ** (GEM) |
| GET | `/reports/outstanding?type=sales\|purchase` | read | **Công nợ theo đối tác** (GEM) |

## Excel `/export` `/import` (GEM)
| GET | `/export/general-ledger.xlsx?from=&to=` | read | Sổ cái .xlsx |
| GET | `/export/trial-balance.xlsx` | read | Cân đối .xlsx |
| GET | `/export/profit-loss.xlsx` | read | KQKD .xlsx |
| GET | `/export/invoices.xlsx` | read | Hoá đơn .xlsx |
| GET | `/import/template.xlsx` | read | File mẫu nhập |
| POST | `/import/invoices.xlsx` | write | Nhập hoá đơn (validate từng dòng, lỗi→không ghi gì) |

## Cổng Tiểu Tâm `/actions`
| GET | `/actions` | read | Catalog 20 actions + JSON Schema |
| POST | `/actions/:id` | (theo action) | Thực thi action |

## Mã HTTP
200 OK · 201 Created · 400 Validation · 401 Unauthorized · 403 Tenant · 404 NotFound · 409 InvalidState · 500 Internal.

## Ghi chú tiền
`numeric(20,2)` chuỗi ("5000000.00"). Toán BigInt (quy về xu). Thuế suất % dạng "8".

## 🇻🇳 Tuân thủ VN (7A)
| Method | Path | Quyền | Mô tả |
|--------|------|-------|-------|
| POST | `/fiscal-years/:id/closing` | void | **Kết chuyển cuối kỳ** (911→421) + khóa niên độ |
| GET | `/reports/cash-flow?from=&to=` | read | **Lưu chuyển tiền tệ** (LCTT/B03) |
| GET | `/reports/vat-declaration?from=&to=` | read | **Tờ khai GTGT** + bảng kê hóa đơn |
| GET | `/reports/general-journal?from=&to=` | read | **Sổ nhật ký chung** (S03a) |
| GET | `/reports/cash-book?from=&to=` | read | **Sổ quỹ tiền mặt** (S07) |
| GET | `/reports/statement/:contactId?from=&to=` | read | **Sao kê công nợ** đối tác |
| GET | `/reports/due-reminders?type=&soonDays=` | read | **Nhắc hạn công nợ** |
| POST | `/invoices/:id/credit-note` | write | **Hóa đơn điều chỉnh giảm** (credit note) |

## ⚙️ Chiều sâu vận hành (8A)
| Method | Path | Quyền | Mô tả |
|--------|------|-------|-------|
| POST | `/advances` | write | Tạo tạm ứng/đặt cọc |
| POST | `/advances/:id/apply` | write | Cấn trừ khoản ứng vào hóa đơn |
| GET | `/advances?type=` | read | Danh sách khoản ứng |
| POST | `/bills/:id/debit-note` | write | **Debit note** (điều chỉnh giảm mua) |
| POST | `/recurring` | write | Tạo mẫu định kỳ |
| POST | `/recurring/run` | write | Chạy mẫu định kỳ tới hạn |
| GET | `/recurring` | read | Danh sách mẫu định kỳ |
| POST | `/recurring/:id/toggle` | write | Bật/tắt mẫu |
| PATCH | `/contacts/:id` | write | Đặt hạn mức tín dụng / điều khoản |
| GET | `/contacts/:id/credit-status?amount=` | read | Trạng thái hạn mức |
| POST | `/import/accounts.csv` | write | Nhập TK từ CSV |
| POST | `/import/contacts.csv` | write | Nhập đối tác từ CSV |

## 📊 Phân tích nâng cao (10A / Tầng 2)
| Method | Path | Quyền | Mô tả |
|--------|------|-------|-------|
| POST | `/cost-centers` | write | Tạo bộ phận/dự án |
| GET | `/cost-centers` | read | Danh sách bộ phận/dự án |
| GET | `/reports/profit-by-cost-center` | read | Lãi/lỗ theo chiều |
| POST | `/bank/import?account=112` | write | Nhập sao kê (CSV) |
| POST | `/bank/auto-match` | write | Tự khớp sao kê với sổ |
| POST | `/bank/apply-rules` | write | Áp quy tắc sinh chứng từ |
| POST | `/bank/rules` | write | Thêm quy tắc phân loại |
| GET | `/bank/transactions` | read | Danh sách dòng sao kê |
| GET | `/bank/reconciliation` | read | Báo cáo đối chiếu |
| POST | `/assets` | write | Tạo TSCĐ |
| GET | `/assets` | read | Danh sách TSCĐ |
| POST | `/assets/depreciation` | write | Chạy khấu hao |
| POST | `/budgets` | write | Đặt ngân sách |
| GET | `/budgets` | read | Danh sách ngân sách |
| GET | `/reports/budget-vs-actual` | read | Dự toán vs thực tế |
| POST | `/fx/revalue` | write | Đánh giá lại tỷ giá |
