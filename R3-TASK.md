# SUPERCITADEL R3 — Task brief (dùng cho resume khi subagent chết)

Repo: /root/.openclaw/workspace/supercitadel (Next.js apps/web + Hono services/api + modules/*, pnpm, KHÔNG tailwind — CSS tokens trong apps/web/app/globals.css DS v2).
Live: https://supercitadel.62.146.238.213.sslip.io (docker compose -p supercitadel, ports localhost 3000/3001/3002; KHÔNG sửa /etc/caddy/Caddyfile — host block đã có).
Subagent gốc: taskName supercitadel_r3, run fd5ea56e (spawn 06:07 CEST 03/07). Commit R3 có prefix "SUPERCITADEL-R3:".

QUY TẮC: commit sau MỖI phase, typecheck+build pass trước commit. Resume = đọc git log xem phase nào xong rồi làm tiếp phase kế.

## Phase A — Backend THUÊ module
- Migration: ALTER TABLE org_modules ADD COLUMN rented_until timestamptz NULL
- POST /api/v1/modules/:id/rent {days:7|30|90} — giá ceil(priceOm × 0.10/0.25/0.60), trừ ví Om thật, rented_until = GREATEST(now(), COALESCE(rented_until,now())) + days, status active, audit module.rent
- GET /modules trả rentedUntil + rentDaysLeft
- Gate requireModule: qua khi active VÀ (purchased HOẶC rented_until>now()); hết hạn → 403 MODULE_RENT_EXPIRED
- Test v8-rent.test.ts

## Phase B — UI Store + Switch + OwnedBar
- modules/page.tsx: toggle switch (CSS thuần, tham khảo originui) + confirm khi tắt
- Nút "Thuê" mở sheet 3 gói 7/30/90 + phí + ngày hết hạn → confirm → rent → refresh
- Badge thuê: "Thuê · còn X ngày" (vàng >3d, đỏ ≤3d) + nút Gia hạn
- components/OwnedBar.tsx: bar chip module sở hữu 🟢active/⚪inactive/🟡rent còn hạn/🔴rent ≤3d, click chip = activate/gia hạn/đi tới route; gắn vào Shell.tsx
- ModuleGate: nút "Bật lại ngay" khi purchased/rented nhưng inactive; "Gia hạn" khi RENT_EXPIRED
- Fix hr/page.tsx POST shifts .catch(()=>{}) nuốt lỗi

## Phase C — Lột xác UI (đọc design-refs/INDEX.md trước, port tailwind→CSS tokens, không thêm dep framer-motion)
- Landing public tại / (chưa login): hero animated bg (particles/grid CSS-canvas thuần), aurora text, CTA "Vào dùng thử ngay" (DEMO_TOKEN flow) + form token cũ, bento 6 features, number-ticker stats (IntersectionObserver + rAF), footer. Đã login → redirect /home
- /home: KPI number-ticker, sparkline SVG thuần, bento, blur-fade stagger
- Micro-interactions: transitions 150-250ms, hover lift+glow, skeleton shimmer, button press scale .97 — tất cả globals.css

## Phase D — Verify
pnpm -r typecheck · pnpm -r test · pnpm --filter @citadel/web build · npx tsx scripts/audit-buttons.mts (0 nút chết)

## Phase E — Deploy + Release
1. docker compose -p supercitadel up -d --build
2. Migration rental vào DB live (psql < migration hoặc migrate.ts)
3. Verify live: landing 200, login V8OWNERFULL01, GET modules có rentedUntil, POST rent trừ Om đúng
4. Push: set -a; source ~/.config/tt-github/env; set +a; git -c credential.helper='!f() { echo "username=x-access-token"; echo "password=$GH_TOKEN"; }; f' push https://github.com/NachaFromMars/supercitadel.git master:main
5. Release r3.1.0 qua GitHub API (POST /repos/NachaFromMars/supercitadel/releases, Bearer $GH_TOKEN). KHÔNG print token.
6. Báo kết quả vào Telegram topic (delivery của cron/subagent tự lo).
