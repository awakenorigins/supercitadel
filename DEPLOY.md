# DEPLOY — SUPERCITADEL (R8+)

Hướng dẫn deploy SUPERCITADEL — business OS đầy đủ (9+ module, Tiểu Tâm 2 engine, theme, module company).

## ⚡ Production (khuyến nghị)
```bash
cp .env.example .env      # điền JWT_SECRET + DB_PASSWORD thật + CORS_ORIGIN=https://domain-cua-ban
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```
- Prod overlay KHÔNG expose Postgres/Redis; API/WS/Web chỉ bind 127.0.0.1 — public qua Caddy/Nginx (80/443).
- API tự fail-fast nếu JWT_SECRET/DB_PASSWORD còn default khi NODE_ENV=production.
- Health: `GET /health`.

## 🧪 Dev/demo nhanh

## Việc cần làm (chạy đúng thứ tự)
1. Giải nén file zip này (nếu chưa).
2. Chạy: `bash deploy.sh`
3. Script sẽ tự: tạo .env (JWT secret ngẫu nhiên) → `docker compose up -d --build` → migrate → seed → in ra 2 token đăng nhập.
4. Báo lại cho người dùng:
   - URL web: `http://<địa-chỉ-server>:3000` (trang chat ở `/chat`)
   - URL API health: `http://<địa-chỉ-server>:3001/health`
   - 2 TOKEN mà seed in ra (để đăng nhập 2 phiên test chat real-time).

## Yêu cầu hệ thống
- Docker + Docker Compose (v2). Mở port 3000, 3001, 3002.

## Nếu lỗi
- `docker compose logs api` / `docker compose logs web` để xem log.
- Migrate lại: `docker compose exec api pnpm --filter @citadel/db exec tsx src/migrate.ts`

## LLM (Tiểu Tâm)
- Mặc định `LLM_MODE=stub` — Tiểu Tâm trả lời sẵn, KHÔNG cần API key, vẫn demo được.
- Khi có key: sửa `.env` (`LLM_MODE=live` + `OPENAI_API_KEY=...`) rồi `docker compose restart api`.
