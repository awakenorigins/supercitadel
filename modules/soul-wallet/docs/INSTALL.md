# Cài đặt Soul-Wallet 1A vào SuperCitadel

Yêu cầu: SuperCitadel ≥ v10.0.1 (đã test trên HEAD 37aa789 / R11.5), Node 22, pnpm 9, PostgreSQL 16.

## 1. Chép module
```bash
cp -r soul-wallet <repo>/modules/soul-wallet
```

## 2. Áp WIRING.patch (6 file host)
```bash
cd <repo>
git apply modules/soul-wallet/WIRING.patch
```
Patch chạm: `packages/core/src/permissions.ts` (18 quyền sw.* + manager 'sw.*'), `services/api/src/{modules/loader.ts, index.ts, tieu-tam/actions.ts}`, `services/api/package.json` (dep workspace), `apps/web/app/soul-wallet/page.tsx` (FE). Nếu HEAD đã trôi và patch conflict → mở patch, chèn tay từng hunk (mỗi hunk chỉ 1-2 dòng cạnh mốc soul-inventory).

## 3. Link workspace
```bash
pnpm install --no-frozen-lockfile
```

## 4. Migrations
```bash
psql "$DATABASE_URL" -f modules/soul-wallet/migrations/0000_init.sql
psql "$DATABASE_URL" -f modules/soul-wallet/migrations/0001_rls.sql
```
Idempotent theo hướng an toàn: bảng đã tồn tại thì dừng — không DROP gì của ai.

## 5. Verify build
```bash
pnpm --filter @citadel/api typecheck
pnpm --filter @citadel/web build
cd modules/soul-wallet && npm i && npm test   # 134/134
```

## 6. Restart API + kích hoạt module
Restart service API. Trong store SuperCitadel: mua/thuê **Soul-Wallet 1A** cho org (gate `requireModule('soul-wallet')` mở route + action).

## 7. Khởi tạo dữ liệu người dùng
Người dùng vào `/soul-wallet` — FE tự gọi `POST /categories/seed` (idempotent). Hoặc bảo Tiểu Tâm: "Tạo ví tiền mặt 5 triệu".

## 8. Nghiệm thu sống
Chạy checklist trong `docs/ACCEPTANCE.md` (ghi chi → số dư → đảo → 6 hũ → nợ → import → reconcile → báo cáo).

## Gỡ (nếu cần)
`git apply -R modules/soul-wallet/WIRING.patch` + xóa thư mục module. Dữ liệu `sw_*` giữ nguyên trong DB (chủ động DROP nếu thật sự muốn xóa — module không bao giờ tự xóa dữ liệu tiền).
