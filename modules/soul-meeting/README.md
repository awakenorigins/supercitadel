# Soul-Meeting 1A — Cuộc Họp (SuperCitadel module)

Điều hành họp chuẩn SME Việt: **lịch + định kỳ + agenda kỷ luật + điểm danh +
biểu quyết theo %vốn (HĐTV/HĐQT) + biên bản versioned bất biến + việc cần làm
chống trùng + carry-over + KPI & chi phí họp + ghi âm/bóc băng ASR (sidecar)**.
Tiểu Tâm điều khiển được toàn bộ qua 10 read tools + 22 write actions.

- **Manifest**: id `soul-meeting` · group `Vận hành` · routes `/api/v1/soul-meeting` · 14 permissions `sm.*`
- **Gates thật (chạy, không tick chay)**: 7 suites **189/189** + `tsc --noEmit` module ✅ · host `packages/core` ✅ · host `services/api` **0 lỗi mới** (4 lỗi baseline v11.8 có sẵn ở `packages/tieu-tam/src/adapters.ts` — xem AUDIT_REPORT) · `@citadel/web` ✅ · clean-room ✅
- **Zero dep mới**: drizzle-orm / hono / xlsx / zod — đúng khuôn Soul-Wallet. Recurrence tự viết (rrule-lite), ICS tự viết (RFC5545 subset).

## Cấu trúc
```
migrations/           0000_init.sql (20 bảng) + 0001_rls.sql (FORCE RLS)
src/
  db/schema.ts        mirror 20 bảng smeet_*
  types.ts            SmCtx (db, orgId, userId, bus, caps?, now?) + SmError + SmCaps
  validation/         toàn bộ Zod (biên ⑦)
  services/           catalog · meeting(+series) · participant · agenda · prep
                      vote (quorum %vốn/headcount) · action (dedup+carryover)
                      minutes (Điều 60, immutable) · harvest · recording (ASR caps)
                      report (KPI+xlsx) · ics · scheduled (nhắc 2 mốc + retention)
  routes.ts           ~62 endpoint MinimalRouter (json-only, Zod tại biên)
  tools/index.ts      10 read tools + 22 write actions (message Việt sẵn)
  intents.ts          18 intent VN/EN
  contract.ts         structural mirror host (không import host)
server/
  host-adapter.ts     buildSoulMeetingRoutes (Hono, org-tx, caps, GET ics/xlsx binary)
                      soulMeetingTools · runSoulMeetingScheduledAll · nightly cron
  tieu-tam-actions.ts soulMeetingTieuTamActions (Zod-parse trong execute, downloadUrl Excel)
web/app/soul-meeting/page.tsx   6 tab (copy sang apps/web/app/soul-meeting/)
scripts/asr-worker-reference/   sidecar Python tham khảo (docs-only, untested-by-CI)
tests/                7 suites PGlite: core 38 · prep 27 · live 22 · harvest 35
                      · recording 20 · report 23 · bridge 24 = 189
WIRING.patch          5 điểm nối host (permissions/loader/index/tieu-tam/package.json)
```

## Chạy test
```bash
npm i   # hoặc pnpm i trong workspace
npm run test:core && npm run test:prep && npm run test:live && npm run test:harvest \
  && npm run test:recording && npm run test:report && npm run test:bridge
npx tsc --noEmit -p tsconfig.json
```

## Cắm vào SuperCitadel v11.8
1. Copy `modules/soul-meeting/` vào repo.
2. Áp `WIRING.patch` (hoặc làm tay 5 điểm — xem `SOULMEETING-NAP-MODULE-PROMPT.md`).
3. `pnpm install` (link workspace) → migrate SQL → typecheck 3 tầng → bật module cho org.
4. Copy `web/app/soul-meeting/page.tsx` → `apps/web/app/soul-meeting/page.tsx`.
5. (Tuỳ chọn) chạy ASR sidecar + tiêm `caps` — xem `scripts/asr-worker-reference/README.md`.

Chi tiết nghiệp vụ: `docs/GUIDE.md` · Tiểu Tâm: `docs/TIEU-TAM.md` · Lệch/quyết định: `AUDIT_REPORT.md`.

© Nacha — all rights reserved. Engine design tham khảo OSS MIT (4minitz, OpenSlides,
Meetily, cal.com); hành vi GPL (OpenProject, minutia) chỉ học, không copy code.
