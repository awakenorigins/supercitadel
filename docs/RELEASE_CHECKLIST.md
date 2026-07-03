# SUPERCITADEL — RELEASE CHECKLIST (R8)

> Release CHỈ được tạo khi TẤT CẢ gate dưới đây PASS. CI xanh là điều kiện cần.

## 1. Code gates (CI tự chạy)
- [ ] `pnpm install --frozen-lockfile` PASS
- [ ] `pnpm -r typecheck` PASS
- [ ] `pnpm -r test` PASS
- [ ] `pnpm --filter web build` PASS
- [ ] Gate giáo trình module (`audit-module-docs.mts`) PASS
- [ ] Gate 100% nút sống (`audit-buttons.mts`) PASS
- [ ] Secret scan (`acceptance-v7a.mts --secret-only`) PASS

## 2. Deploy verify (thật, không đoán)
- [ ] `docker compose -p supercitadel up -d --build` xong, container `Created` > commit time
- [ ] Marker code mới có trong container (grep JS chunk / source)
- [ ] Site live trả 200 + login hoạt động
- [ ] Migration mới đã vào DB live (`\d <bảng mới>`)
- [ ] Endpoint mới test end-to-end trên live (curl/playwright)
- [ ] Screenshot UI thay đổi (playwright) nếu có FE

## 3. Security gates
- [ ] Diff không chứa secret/API key (scan trước push)
- [ ] `.env` vẫn untracked
- [ ] CORS production vẫn khoá (nếu đổi index.ts phải test lại)
- [ ] Không thêm dependency mới không cần thiết

## 4. Release
- [ ] Commit prefix đúng round (`SUPERCITADEL-R<n>:`)
- [ ] Push `master:main` bằng credential trong `~/.config/tt-github/env`
- [ ] Tạo GitHub release tag `r<x>.<y>.<z>` — body liệt kê thay đổi theo round + commit hash
- [ ] Cập nhật README badge + "Điểm nổi bật theo release"
- [ ] Cập nhật R<n>-STATE.json status=done, gỡ cron watcher
