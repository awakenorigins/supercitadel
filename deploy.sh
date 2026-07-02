#!/usr/bin/env bash
set -e
echo "════ Citadel V2 — Deploy ════"
if [ ! -f .env ]; then
  cp .env.example .env
  SECRET=$(head -c32 /dev/urandom | base64 | tr -d '/+=' | head -c40)
  sed -i "s/change_me_to_a_long_random_string/$SECRET/" .env
  echo "✓ Created .env (random JWT_SECRET)"
fi
echo "→ docker compose up (build)…"
docker compose up -d --build
echo "→ Đợi Postgres…"
until docker compose exec -T postgres pg_isready -U citadel >/dev/null 2>&1; do sleep 2; done
echo "→ Migrate core + tất cả module…"
docker compose exec -T postgres psql -U citadel -d citadel -f /dev/stdin < packages/db/migrations/0002_org_modules.sql 2>/dev/null || true
docker compose exec -T postgres psql -U citadel -d citadel -f /dev/stdin < packages/db/migrations/0003_super_admin.sql 2>/dev/null || true
docker compose exec -T api sh -c "pnpm --filter @citadel/db exec tsx src/migrate.ts" || true
# module migrations
for m in chat notification crm om inventory hr; do
  for mig in modules/$m/migrations/*.sql; do
    docker compose exec -T postgres psql -U citadel -d citadel -f /dev/stdin < "$mig" 2>/dev/null || true
  done
  echo "  ✓ migrated $m"
done
echo "→ Seed demo…"
docker compose exec -T api sh -c "pnpm --filter @citadel/db exec tsx src/seed.ts" || true
echo ""
echo "════ XONG ════"
echo "Web : http://localhost:3000  (/chat · /crm)"
echo "API : http://localhost:3001/health"
echo "→ Copy 2 TOKEN seed in ra để đăng nhập test."
