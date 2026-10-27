# Soul-Wallet — Acceptance

## A. Gates offline (đã chạy trong phiên build — kết quả THẬT)
| Gate | Lệnh | Kết quả |
|---|---|---|
| Manifest | `tsx scripts/audit-manifests.mts` (root) | `[manifest] OK soul-wallet v1.0.0 — PASSED 11/11` |
| Giáo trình | `tsx scripts/audit-module-docs.mts` (root) | `✓ soul-wallet — 11/11 module PASS` |
| Typecheck module | `npm run typecheck` (module) | 0 errors |
| Test core | `npm run test:core` | 28/28 (RLS thật, org+owner isolation, đảo bút toán) |
| Test discipline | `npm run test:discipline` | 39/39 (6 Hũ, goals, nợ+aging+lãi, recurring, rules, anomaly, runway) |
| Test import+reports | `npm run test:import` | 37/37 (dup-hash liên phiên, reconcile, invariant rebuild==ranged, 8 báo cáo, charts, export) |
| Test bridge | `npm run test:bridge` | 30/30 (25 defs, golden path qua handler, Zod biên, adapter host, 49 route, intents) |
| API host (đã wire) | `pnpm --filter @citadel/api typecheck` | 0 errors |
| Web build | `pnpm --filter @citadel/web build` | pass, route `/soul-wallet` 9.19 kB |
| WIRING.patch | `git apply --check` trên worktree HEAD sạch | OK |
| Clean-room | giải nén zip vào thư mục trắng → npm i → npm test | 134/134 (xem AUDIT_REPORT) |

## B. Live acceptance (chạy trên deploy thật SAU khi cài — checklist)
1. Login user thường → `GET /api/v1/soul-wallet/accounts` khi CHƯA kích hoạt module → bị gate chặn đúng thông điệp mua/thuê.
2. Kích hoạt module → FE `/soul-wallet` mở, tự seed danh mục.
3. Tạo ví tiền mặt 5.000.000 → ghi chi 320.000 → `GET /accounts/:id/balance` = 4.680.000.
4. Đảo giao dịch vừa ghi → balance về 5.000.000; `GET /audit` thấy cả create + reverse.
5. Nói với Tiểu Tâm "chia 6 hũ từ 20 triệu" → nhận DRY-RUN → confirm → `GET /budgets/status` đủ 6 hũ đúng tỷ lệ.
6. User B cùng org gọi `GET /accounts` → KHÔNG thấy ví user A.
7. Import file sao kê VCB mẫu → preview đúng số dòng/trùng → commit → balance khớp tay tính.
8. `POST /scheduled/run` → recurring đến hạn sinh giao dịch, `sw.debt.due` bắn cho khoản sắp hạn.
9. `GET /reports/narrate` trả đoạn tiếng Việt số liệu khớp dashboard.

Ghi chú: `scripts/audit-tieu-tam-actions.sh` của repo là script bắn vào site live — thuộc bước B, không chạy được trong môi trường build offline (đã ghi trong AUDIT_REPORT).
