# SOULWALLET-NAP-MODULE-PROMPT — Prompt nạp module cho AI Agent

> Dán nguyên văn cho AI agent (Claude/Tiểu Tâm DevOps) có quyền chạy lệnh trên repo SuperCitadel. Agent làm đúng 8 beat, **mỗi beat phải chạy lệnh thật và dán output** — cấm tick chay. Gặp lỗi → tra bảng Troubleshooting trước khi hỏi người.

**Bối cảnh:** Nạp module `soul-wallet` (Ví Cá Nhân, v1.0.0) vào SuperCitadel ≥ v10.0.1. Gói gồm: `soul-wallet/` (module standalone) + `WIRING.patch` (git-diff authentic, 6 file host). Dữ liệu module scope (org_id, owner_user_id) — ví cá nhân per-user.

---

## BEAT 1 — Trinh sát
```bash
cd <repo> && git log --oneline -1 && cat package.json | grep packageManager
ls services/api/src/modules/loader.ts services/api/src/tieu-tam/actions.ts packages/core/src/permissions.ts
```
Đọc trong gói: `README.md`, `docs/INSTALL.md`, `AUDIT_REPORT.md §3` (deviations). Xác nhận: host API nằm ở **services/api** (KHÔNG phải apps/api). Báo cáo: HEAD hash + pnpm version.

## BEAT 2 — Module standalone phải sống trước khi cắm
```bash
cp -r soul-wallet <repo>/modules/soul-wallet
cd <repo>/modules/soul-wallet && npm i && npm run typecheck && npm test
```
**Gate:** typecheck 0 lỗi + `28+39+37+30 = 134/134`. Fail ở đây = gói hỏng, DỪNG, báo người.

## BEAT 3 — Áp WIRING.patch
```bash
cd <repo> && git apply --check modules/soul-wallet/WIRING.patch && git apply modules/soul-wallet/WIRING.patch
git status --short | grep -v '^??'
```
Kỳ vọng 6 file: `packages/core/src/permissions.ts`, `services/api/{package.json, src/modules/loader.ts, src/index.ts, src/tieu-tam/actions.ts}`, `apps/web/app/soul-wallet/page.tsx` (new). **Nếu conflict** (HEAD đã trôi): mở patch, chèn TAY từng hunk — mỗi hunk 1-2 dòng đặt NGAY CẠNH dòng soul-inventory tương ứng (import cạnh import, BUILDERS entry cạnh entry, defs.push cạnh defs.push, registry block sw.* sau block kho, `'sw.*'` vào mảng manager).

## BEAT 4 — Link workspace + typecheck host
```bash
pnpm install --no-frozen-lockfile
pnpm --filter @citadel/api typecheck
```
**Gate:** 0 lỗi. Đây là bằng chứng contract mirror khớp host.

## BEAT 5 — Migrations
```bash
psql "$DATABASE_URL" -f modules/soul-wallet/migrations/0000_init.sql
psql "$DATABASE_URL" -f modules/soul-wallet/migrations/0001_rls.sql
psql "$DATABASE_URL" -c "\dt sw_*" | tail -5
```
**Gate:** 25 bảng `sw_*` hiện diện. Migration không DROP gì — chạy trên DB có dữ liệu vẫn an toàn.

## BEAT 6 — Audit registry + build web
```bash
cd <repo> && ./modules/soul-wallet/node_modules/.bin/tsx scripts/audit-manifests.mts
./modules/soul-wallet/node_modules/.bin/tsx scripts/audit-module-docs.mts
pnpm --filter @citadel/web build 2>&1 | grep soul-wallet
```
**Gate:** manifest PASS toàn bộ (soul-wallet OK) + docs PASS + route `/soul-wallet` trong build output.

## BEAT 7 — Restart + kích hoạt + smoke sống
Restart API service. Kích hoạt module cho org test (mua/thuê trong store, hoặc insert `org_modules` status active theo quy trình vận hành hiện có). Rồi:
```bash
TOKEN=<jwt user test>
curl -s -H "Authorization: Bearer $TOKEN" $BASE/api/v1/soul-wallet/categories/seed -X POST | head -c 200
curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Tiền mặt","type":"cash","opening_balance":"5000000"}' $BASE/api/v1/soul-wallet/accounts | head -c 300
curl -s -H "Authorization: Bearer $TOKEN" $BASE/api/v1/soul-wallet/accounts
```
**Gate:** seed trả `{seeded:>0}` lần đầu; tạo ví trả id; list thấy balance `5000000`. Thử thêm: ghi chi 320000 → balance 4680000 → reverse → 5000000.

## BEAT 8 — Tiểu Tâm live + Definition of Done
Chat với Tiểu Tâm bằng user đã kích hoạt: (a) "Tháng này tao tiêu sao rồi?" → nhận narrate 📊; (b) "Ghi chi 100k trà đá từ tiền mặt" → nhận **DRY-RUN preview**, trả lời đồng ý → nhận message "Đã ghi chi 100.000đ (SW-TX-...)". Chạy nốt checklist `docs/ACCEPTANCE.md §B` (9 mục, có mục user B cùng org không thấy ví user A).

**DEFINITION OF DONE — tick đủ mới được báo xong:**
- [ ] B2: 134/134 standalone
- [ ] B3: WIRING áp sạch (6 file)
- [ ] B4: api typecheck 0 lỗi
- [ ] B5: 25 bảng sw_*
- [ ] B6: audit-manifests + audit-module-docs PASS, web build có /soul-wallet
- [ ] B7: smoke curl 3 lệnh + chu trình chi→đảo đúng số
- [ ] B8: Tiểu Tâm dry-run→confirm chạy thật + ACCEPTANCE §B 9/9
- [ ] Dán toàn bộ output gate vào báo cáo bàn giao

---

## TROUBLESHOOTING — loader/registry từ chối module

| Triệu chứng | Nguyên nhân thường gặp | Xử lý |
|---|---|---|
| Loader báo `unknown module id 'soul-wallet'` / route 404 toàn bộ | BUILDERS entry chưa vào loader.ts (hunk B3 sót) | Chèn tay entry cạnh `'soul-inventory'` |
| API boot lỗi `Cannot find module '@citadel/module-soul-wallet/...'` | Thiếu dep trong services/api/package.json hoặc chưa `pnpm install` | Kiểm tra hunk package.json + chạy lại B4 |
| Manifest audit FAIL `permission ... not in registry` | Block sw.* chưa vào `packages/core/src/permissions.ts` | Áp lại hunk registry; nhớ CẢ `'sw.*'` trong manager |
| Manifest audit FAIL cú pháp quyền | Quyền phải **dotted 3 đoạn**, action slug dùng **gạch nối** không gạch dưới | So với 18 entry trong manifest.json gốc — đừng tự chế |
| Manifest audit FAIL thiếu field | v10.0.1 bắt buộc `group` ("Tài chính"), `engine`, `docs`, `rentPlans` | Không sửa manifest trừ khi audit script HEAD đòi field mới — khi đó thêm đúng field, ghi vào báo cáo |
| Route 402/403 dù đã cài | Module chưa active cho org (gate `requireModule`) | Kích hoạt trong store cho org test |
| Mọi request 200 nhưng data rỗng chéo user | Đúng thiết kế: ví CÁ NHÂN — mỗi `sub` (user) một két | Không phải bug; xem docs/SECURITY.md |
| `sw.tx.*` qua Tiểu Tâm không hỏi confirm | Host cũ chưa có dry-run protocol trong tieu-tam/actions | Nâng host ≥ v10.0.1 hoặc chấp nhận execute thẳng (ghi rủi ro vào báo cáo) |
| psql lỗi `relation sw_accounts already exists` | Migration chạy lần 2 | Bỏ qua 0000, chạy 0001 (RLS có DROP POLICY IF EXISTS, idempotent) |
| Web build fail tại /soul-wallet | Component Shell/ModuleGate đổi API ở HEAD mới | Sửa import trong page theo component hiện hành — page độc lập, không ảnh hưởng backend |
| Nightly không chạy | Host không giữ tiến trình / PM2 restart giờ khác | Gọi tay `POST /api/v1/soul-wallet/scheduled/run` bằng cron ngoài |
