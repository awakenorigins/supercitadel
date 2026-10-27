# AUDIT REPORT — Soul-Wallet 1A (build 2026-07-06)

Nguyên tắc phiên build: **mọi gate chạy thật, mọi lệch chuẩn khai ra — không tick chay.** Môi trường: clone SuperCitadel HEAD `37aa789` (R11.5), Node 22, pnpm 9.15.9, test trên PGlite (Postgres in-process) với role `citadel_app` **non-superuser** để RLS có hiệu lực thật.

## 1. Kết quả gate (nguyên văn)
| Gate | Kết quả |
|---|---|
| `scripts/audit-manifests.mts` | `[manifest] OK soul-wallet v1.0.0` · `PASSED 11/11` |
| `scripts/audit-module-docs.mts` | `✓ soul-wallet: giáo trình đầy đủ` · `11/11 module PASS` |
| Module `tsc --noEmit` | 0 errors |
| `tests/smoke-core` | **28/28** |
| `tests/smoke-discipline` | **39/39** |
| `tests/smoke-import-reports` | **37/37** |
| `tests/smoke-bridge` | **30/30** |
| `pnpm --filter @citadel/api typecheck` (SAU khi wire 3 file + package.json) | 0 errors |
| `pnpm --filter @citadel/web build` (có trang /soul-wallet) | PASS — `/soul-wallet 9.19 kB` trong route list |
| `git apply --check WIRING.patch` trên worktree HEAD nguyên bản | OK |
| Clean-room (giải nén zip thư mục trắng → npm i → npm test) | **134/134** |

## 2. Bug thật bắt được TRONG build (giá trị nhất phiên này)
**Ledger bị skip lặng lẽ khi caller nội bộ bỏ qua Zod.** `createTx` ban đầu đọc `input.status === 'posted'` — Zod default `posted` chỉ sống ở biên; service/test gọi trực tiếp không truyền `status` → điều kiện false → **không ghi ledger/snapshot/summary**, trong khi DB default vẫn ghi tx `posted` → sổ có giao dịch mà số dư không đổi (lỗ hổng integrity im lặng, không ném lỗi). Phát hiện nhờ 5 test budget fail chụm (spent=0) + probe. **Vá:** defensive normalize ngay trong service (`status = input.status ?? 'posted'`, `vnd(amount)`, normalize splits) — không tin caller. Bài học đã ghi vào HANDOFF; toàn suite xanh lại 134/134.

## 3. Deviation so với plan/feedback (có chủ đích, khai đủ)
1. **`apps/api` không tồn tại — host API là `services/api`.** Cả hai bản feedback đối tác đều chỉ sai đường dẫn wiring. Đã wire đúng vào `services/api/src/{modules/loader.ts, index.ts, tieu-tam/actions.ts}` theo mẫu soul-inventory THẬT trong HEAD (khác cả patch "tài liệu" của soul-inventory vốn mô tả `tool-registry.ts`/`routes/index.ts` — thực tế HEAD đăng ký tools ở `index.ts` và mount qua BUILDERS của loader).
2. **`scripts/audit-tieu-tam-actions.sh` là script bắn site LIVE** (login bằng token demo vào deploy) — không chạy được trong môi trường build offline. Gate thay thế tương đương: api typecheck sau wire (0 lỗi) + smoke-bridge 30/30 (shape action host, execute thật, audit hook). Bước live giữ trong `docs/ACCEPTANCE.md §B`.
3. **Migrations 2 file thay vì 3 như plan** (0000 gồm cả 4 bảng summary; 0001 RLS phủ trọn 25 bảng một chỗ) — tránh cảnh RLS file đứng trước bảng summary.
4. **Bỏ dep `@citadel/core` khỏi package.json module.** Soul-inventory khai dep này nhưng grep toàn bộ src/server/tests **không import** — vestigial, và `workspace:*` làm `npm i` standalone chết. Contract mirror (structural typing) là cơ chế thay thế; bằng chứng: api typecheck 0 lỗi sau wire.
5. **Mapping 6 Hũ v1:** PLAY=Giải trí, EDU=Giáo dục, GIVE=Từ thiện, LTS=Tiết kiệm & Đầu tư, **FFA spent luôn 0** (nạp tay), **NEC = tổng chi − 4 hũ kia** (floor 0). Ghi ở GUIDE + JAR_CATEGORY một chỗ trong budget.service. Test khóa số: PLAY 2.5tr, NEC không dính Giải trí.
6. **Nợ gắn ví = dòng tiền (income/expense), không phải P&L kế toán.** Khai thẳng trong GUIDE §Giới hạn; ai cần P&L thật → Kế Toán 10A.
7. **`sw.budget.upsert` kiêm nhánh `six_jars_income`** để giữ đúng 13 write-action như manifest mô tả thay vì đẻ action 14.
8. **Nightly per (org, owner):** ví cá nhân nên cron phải chạy theo CHỦ VÍ — `runSoulWalletScheduledAll` tự `SELECT DISTINCT org_id, owner_user_id FROM sw_accounts`, host không phải nuôi danh sách (khác pattern soul-inventory chỉ per-org).
9. **Route nội bộ prefix `/wallet`** (adapter strip khi mount `/api/v1/soul-wallet`) — mirror y pattern `/inventory` của soul-inventory. Tổng 49 endpoint.
10. **FE page ship 2 nơi:** đã copy sẵn vào `apps/web/app/soul-wallet/page.tsx` trong WIRING.patch (dạng new-file) VÀ giữ bản gốc tại `web/app/soul-wallet/page.tsx` trong module để đóng gói độc lập.

## 4. Giới hạn v1 khai trước (không để khách tự phát hiện)
Không bank-sync tự động · VND-only (cột currency chờ v2) · đầu tư theo dõi tay · OCR hóa đơn/PDF sao kê phase 2 · FFA không tự tính spent · dòng nợ gắn ví tính vào thu-chi tháng (cash-flow view).

## 5. Điểm kiểm chứng độc lập nhanh (cho reviewer)
```bash
cd modules/soul-wallet && npm i && npm run typecheck && npm test   # kỳ vọng 134/134
grep -rn "own(" src/services | wc -l                               # mọi query scope (org, owner)
grep -n "reversal_of\|DELETE FROM sw_transactions" -r src migrations # có đảo, không có delete tx
```
