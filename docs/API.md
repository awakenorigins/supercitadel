# SUPERCITADEL — API Reference (nền Citadel V7A)

Base: `http://<host>:3001`  ·  Auth: `Authorization: Bearer <jwt>` (lấy từ /auth/login)

## Auth
| Method | Path | Body | Mô tả |
|---|---|---|---|
| GET | /health | — | Liveness |
| GET | /ready | — | Readiness (check DB), 503 nếu DB down |
| POST | /api/v1/auth/login | `{token}` | Token 13 ký tự → `{jwt,user,firstLogin}` (rate-limit 5/phút/IP) |
| GET | /api/v1/me | — | Thông tin user + `securityLevel` + `needsUpgrade` |
| GET | /api/v1/permissions | — | R8.5 permission registry + quyền của user hiện tại + `securityLevel` |

## Bảo mật lũy tiến lớp 2 (V7A P1)
| Method | Path | Body | Mô tả |
|---|---|---|---|
| POST | /api/v1/me/bind-email | `{email}` | Gắn email → lên lớp 2 |
| POST | /api/v1/me/bind-phone | `{phone}` | Gắn SĐT VN → lên lớp 2 |
| PATCH | /api/v1/users/:id/role | `{role}` | Đổi role (owner+, đòi lớp 2) |

Hành động nhạy cảm (chi Om > 1000 · đổi role · hủy phiếu đã thu) ở lớp 1 → `403` kèm hướng dẫn tiếng Việt. R8.5 thêm permission registry: thiếu quyền → `403` kèm `PERMISSION_DENIED`.

## Audit log (V7A P1)
| Method | Path | Body | Mô tả |
|---|---|---|---|
| GET | /api/v1/audit-logs?action=&limit= | — | Chỉ owner/super_admin; LUÔN filter org từ JWT; limit ≤ 200 |

## Tiểu Tâm
| POST | /api/v1/tieu-tam/chat | `{message,userName?,orgName?,facts?,confirm?,pendingAction?}` | Reply JSON (stub/live); action sensitive trả dry-run preview trước khi chạy thật |
| POST | /api/v1/tieu-tam/chat/stream | `{message}` | SSE: event `token`/`tool`/`suggestions`/`energy`/`done` |
| GET | /api/v1/tieu-tam/state | — | `{mood,energy,status,statusLabel,statusMessage,engine,theme,betaMode}` |
| PATCH | /api/v1/tieu-tam/engine | `{engine}` | Đổi bộ não stub-a/stub-b/openai/anthropic — trí nhớ nguyên vẹn (audit) |
| GET | /api/v1/tieu-tam/memories | — | Trí nhớ của mình (org+user scope, limit ≤ 100) |
| DELETE | /api/v1/tieu-tam/memories/:id | — | Quên một mảnh trí nhớ (cross-org/user → 404, audit) |

### Tiểu Tâm dry-run / confirm flow (R8.5)
1. Client gửi lệnh nhạy cảm, ví dụ `POST /api/v1/tieu-tam/chat` body `{ "message": "tạo phiếu thu 50000 cho Anh Ba" }`.
2. Server không ghi DB ngay; response có `toolCalls[0].result.dryRun=true`, `preview` và `pendingAction:{name,params}`; audit `tieu_tam.action_dryrun`.
3. Client hiển thị card xem trước và gửi xác nhận: `{ "message":"xác nhận", "confirm": true, "pendingAction": <pendingAction> }`.
4. Server kiểm tra module + permission + securityLevel lần nữa rồi thực thi đúng 1 lần; audit `tieu_tam.action`.
5. Nếu role không đủ quyền, action trả `ok:false` tiếng Việt hoặc HTTP gate trả `403`; không tạo dữ liệu.

## Cửa hàng vật phẩm + Kho chứa (V7A P3)
| Method | Path | Body | Mô tả |
|---|---|---|---|
| GET | /api/v1/store/items | — | Catalog vật phẩm (food/decor/boost, giá Om, effect) |
| POST | /api/v1/store/items/:code/buy | — | Mua — trừ Om thật trong transaction; thiếu tiền → 409 |
| GET | /api/v1/inventory-items | — | Kho của tôi (join catalog, info đầy đủ, org+user isolation) |
| POST | /api/v1/inventory-items/:id/use | — | Sử dụng → hiệu ứng thật: food +energy · boost hồi 100% · decor đổi theme; không sở hữu → 404 |

## Chat
| GET | /api/v1/chat/rooms | — | Phòng của tôi |
| POST | /api/v1/chat/rooms | `{name,isGroup,memberIds}` | Tạo phòng |
| GET | /api/v1/chat/rooms/:id/messages | — | Tin nhắn |
| POST | /api/v1/chat/rooms/:id/messages | `{body}` | Gửi (→ WS broadcast) |
| PUT | /api/v1/chat/rooms/:id/read | — | Đánh dấu đã đọc |

## CRM
| GET/POST | /api/v1/crm/contacts | `{name,phone?,tag?}` | Danh bạ |
| GET/POST | /api/v1/crm/deals | `{title,valueVnd,stage}` | Deal |
| PATCH | /api/v1/crm/deals/:id/stage | `{stage}` | Đổi stage (lead/quote/negotiation/won/lost) |
| GET | /api/v1/crm/stats | — | `{openDeals,totalValueVnd}` |

## Om
| GET | /api/v1/om/balance | — | Số dư |
| GET | /api/v1/om/transactions | — | Lịch sử |
| POST | /api/v1/om/topup | `{amount}` | Nạp |

## Notification / Dashboard
| GET | /api/v1/notifications?unread=true | — | Thông báo |
| PUT | /api/v1/notifications/read-all | — | Đọc hết |
| GET | /api/v1/dashboard/summary | — | KPI Home |
| GET | /api/v1/dashboard/search?q= | — | Tìm kiếm |

## Modules (Cửa hàng)
| GET | /api/v1/modules | — | Catalog 7 module + trạng thái org |
| POST | /api/v1/modules/:id/purchase | — | Mua bằng Om (trừ thật) → auto bật |
| POST | /api/v1/modules/:id/activate | — | Bật (paid phải mua trước) |
| POST | /api/v1/modules/:id/deactivate | — | Tắt (core không tắt được) |

API module bị gate: chưa bật → 403 MODULE_INACTIVE.

## Kho Hàng (module)
| GET/POST | /api/v1/inventory/items | `{name,unit,qty,lowThreshold}` | Hàng hóa |
| PATCH | /inventory/items/:id/qty | `{delta}` | Nhập/xuất (floor 0) |
| GET | /api/v1/inventory/low-stock | — | Sắp hết |

## Nhân Sự & Ca v2 (module — fork domain model frappe/hrms)
| GET/POST | /api/v1/hr/shifts | `{name,shiftDate,startTime,endTime,staff[]}` | Ca làm |
| PUT | /hr/shifts/:id/staff | `{staff[]}` | Xếp người |
| GET/POST | /api/v1/hr/employees | `{fullName,roleTitle,phone,joinedDate}` | Hồ sơ nhân viên |
| PATCH | /hr/employees/:id | `{fullName?,roleTitle?,status?}` | Sửa hồ sơ |
| POST | /hr/attendance/check-in | `{employeeId,shiftId?}` | Vào ca (late nếu sau giờ ca, 1 lần/ngày) |
| POST | /hr/attendance/check-out | `{employeeId}` | Ra ca → tính working_hours |
| GET | /api/v1/hr/attendance?date= | — | Bảng chấm công (join tên) |
| GET/POST | /api/v1/hr/leave/types | `{name,daysPerYear,isPaid}` | Loại phép |
| POST | /hr/leave/allocations | `{employeeId,leaveTypeId,year,days}` | Cấp phép năm |
| GET | /hr/leave/balance?employeeId=&year= | — | Số dư từng loại |
| POST/GET | /api/v1/hr/leave/applications | `{employeeId,leaveTypeId,fromDate,toDate,halfDay?,reason?}` | Đơn nghỉ (chặn sớm nếu thiếu dư) |
| POST | /leave/applications/:id/approve | — | Duyệt → trừ dư + ghi attendance on_leave |
| POST | /leave/applications/:id/reject | — | Từ chối (không trừ) |

## Kế Toán (module — fork domain model ERPNext Accounts)
| POST | /accounting/chart/seed | — | Khởi tạo 14 TK chuẩn VN (idempotent) |
| GET | /api/v1/accounting/accounts | — | Hệ tài khoản |
| GET | /accounting/accounts/:number/balance | — | Số dư TK (theo root_type) |
| POST | /accounting/journal | `{postingDate,lines:[{accountNumber,debit?,credit?}]}` | Bút toán tay (Σ Nợ = Σ Có) |
| GET | /api/v1/accounting/vouchers | — | Chứng từ |
| POST | /accounting/vouchers/:id/cancel | — | Hủy = bút toán ĐẢO (GL bất biến) |
| POST/GET | /api/v1/accounting/invoices | `{invoiceType,partyName,lines:[{description,qty,rate}]}` | HĐ bán (Nợ131/Có511) · mua (Nợ642/Có331) |
| POST/GET | /api/v1/accounting/payments | `{paymentType,partyName,amount,invoiceId?}` | Thu/chi + knock-off công nợ |
| GET | /reports/general-ledger?account=&from=&to= | — | Sổ cái + dư lũy kế |
| GET | /reports/trial-balance | — | Cân đối thử |
| GET | /reports/profit-loss | — | Lãi lỗ kỳ |
| GET | /reports/outstanding?type= | — | Công nợ theo đối tác |

### Excel connect (V7A P4)
| GET | /accounting/export/general-ledger.xlsx?account=&from=&to= | — | Sổ cái .xlsx (header tiếng Việt) |
| GET | /accounting/export/invoices.xlsx | — | Hóa đơn .xlsx |
| GET | /accounting/export/trial-balance.xlsx | — | Cân đối thử .xlsx (dòng TỔNG + cờ SỔ CÂN/LỆCH) |
| GET | /accounting/export/profit-loss.xlsx | — | Lãi lỗ .xlsx |
| GET | /accounting/export/general-ledger.json | — | Cùng data dạng JSON cho AI (columns+entries+sumDebit/sumCredit/balanced) |
| POST | /accounting/import/invoices.xlsx | multipart `file` hoặc `{fileBase64}` | Import hóa đơn — validate từng dòng, lỗi tiếng Việt kèm số dòng, không tạo rác |

## Users
| GET | /api/v1/users | — | Thành viên org (cho tạo chat) |

## WebSocket
Kết nối: `ws://<host>:3002?token=<jwt>`. Nhận event org-scoped: `chat:message`, `notification`, ...
Mọi response lỗi: `{error:{code,message,field?}}`.
