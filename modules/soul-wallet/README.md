# Soul-Wallet 1A — Ví Cá Nhân cho SuperCitadel

**Personal Finance Command Center**: đa ví · sổ kép mini không lệch số · ngân sách 6 Hũ · sổ nợ aging · recurring bắt tăng giá · import sao kê bank VN · rule tự phân loại · nến dòng tiền OHLC · anomaly + runway · 25 năng lực Tiểu Tâm (dry-run→confirm).

- **id:** `soul-wallet` · **version:** 1.0.0 · **engine:** ^1.0.0 · **group:** Tài chính
- **Giá:** mua 700 Ôm · thuê 100 Ôm/30 ngày · trial 7 ngày
- **Scope dữ liệu:** `(org_id, owner_user_id)` — ví CÁ NHÂN per-user trong org
- **Routes:** `/api/v1/soul-wallet` · **Bảng:** 25 bảng prefix `sw_`, RLS FORCE toàn bộ
- **Test:** 134/134 (4 suite) trên PGlite + role non-superuser (RLS thật) · typecheck 0 lỗi
- **Gates đã qua:** audit-manifests 11/11 · audit-module-docs 11/11 · api typecheck (wired) · web build (trang /soul-wallet)

## Cấu trúc
```
soul-wallet/
├─ manifest.json · manifest.module.json   # store + quyền + events
├─ migrations/ (0000_init, 0001_rls)      # 25 bảng + RLS FORCE
├─ src/
│  ├─ types.ts · contract.ts              # Ctx, money BigInt, mirror host (0 import host)
│  ├─ db/schema.ts · validation/schemas.ts
│  ├─ services/ (11 file)                 # ledger spine, tx, budget, debt, recurring, rule,
│  │                                      # import/export/reconcile, analytics, reports, scheduled
│  ├─ routes.ts (49 endpoint) · tools/ (25 defs) · intents.ts (17)
├─ server/ host-adapter.ts · tieu-tam-actions.ts   # 2 file wiring duy nhất
├─ web/app/soul-wallet/page.tsx           # FE dashboard 6 tab, SVG thuần
├─ tests/ (4 suite, 134 checks)
├─ docs/ (GUIDE, API, SCHEMA, TIEU-TAM-ACTIONS, IMPORT-GUIDE, SECURITY, INSTALL, ACCEPTANCE)
└─ WIRING.patch                           # git-diff authentic, apply sạch trên HEAD
```

## Chạy nhanh
```bash
cd modules/soul-wallet && npm i
npm run typecheck && npm test        # 134/134
```
Cài vào host: xem `docs/INSTALL.md`. Nạp bằng AI agent: `SOULWALLET-NAP-MODULE-PROMPT.md`.

## Nguyên tắc không nhân nhượng
Số dư luôn derive từ ledger · hủy = bút toán đảo · mọi mutation có audit (kể cả dry-run) · mọi query lọc (org, owner) từ JWT · tiền numeric(18,0) + BigInt, không float · Zod tại biên · module không import module khác — host inject db/bus/gate.

© Nacha — proprietary. Không tham chiếu repo ngoài trong source.
