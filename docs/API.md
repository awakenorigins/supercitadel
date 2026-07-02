# Citadel V2 — API Reference

Base: `http://<host>:3001`  ·  Auth: `Authorization: Bearer <jwt>` (lấy từ /auth/login)

## Auth
| Method | Path | Body | Mô tả |
|---|---|---|---|
| GET | /health | — | Liveness |
| GET | /ready | — | Readiness (check DB), 503 nếu DB down |
| POST | /api/v1/auth/login | `{token}` | Token 13 ký tự → `{jwt,user,firstLogin}` |
| GET | /api/v1/me | — | Thông tin user hiện tại |

## Tiểu Tâm
| POST | /api/v1/tieu-tam/chat | `{message,userName?,orgName?,facts?}` | Reply JSON (stub/live) |
| POST | /api/v1/tieu-tam/chat/stream | `{message}` | SSE: event `token`/`tool`/`suggestions`/`done` |

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

## Users
| GET | /api/v1/users | — | Thành viên org (cho tạo chat) |

## WebSocket
Kết nối: `ws://<host>:3002?token=<jwt>`. Nhận event org-scoped: `chat:message`, `notification`, ...
Mọi response lỗi: `{error:{code,message,field?}}`.
