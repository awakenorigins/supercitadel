# SuperCitadelLab — Sandbox

Bản clone nguyên mẫu của SuperCitadel (fork tại v11.5.0) để test ý tưởng, **cách ly hoàn toàn** với bản production đang chạy.

## Cách ly (không đụng bản gốc)
| Hạng mục | Production | Lab |
|---|---|---|
| Compose project | `supercitadel` | `supercitadellab` |
| Domain | supercitadel.62.146.238.213.sslip.io | supercitadellab.62.146.238.213.sslip.io |
| Web / API / WS (127.0.0.1) | 3000 / 3001 / 3002 | 3010 / 3011 / 3012 |
| Postgres / Redis (127.0.0.1) | 5442 / 6392 | 5452 / 6402 |
| Volume DB | supercitadel_pgdata | supercitadellab_pgdata_lab |
| Network | supercitadel_default | supercitadellab_default |
| DB name / user | citadel | citadellab |
| JWT_SECRET | (prod) | mới random riêng |
| Git | remote NachaFromMars/supercitadel | **local-only, KHÔNG remote** (không thể lỡ push đè) |

## Token đăng nhập Lab
- super_admin: `LABSUPERADMIN`
- owner: `LABOWNERFULL01`
- manager: `LABMANAGER001`

## Vận hành
```bash
cd ~/.openclaw/workspace/supercitadellab
bash deploy.sh                              # build + up + migrate + seed
docker compose -p supercitadellab ps        # trạng thái
docker compose -p supercitadellab down      # tắt (giữ data)
docker compose -p supercitadellab down -v   # tắt + xoá DATA Lab (an toàn, không đụng prod)
```

## Lưu ý
- Dùng chung LLM endpoint với prod (chỉ đọc, không ghi state) — có thể đổi trong `.env` nếu cần.
- Muốn kéo update từ prod về Lab: copy code mới vào rồi `bash deploy.sh` lại (migrations idempotent).
