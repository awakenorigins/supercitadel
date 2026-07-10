#!/usr/bin/env bash
set -e
# SuperCitadelLab — deploy sandbox riêng, project name + volume + network tách biệt bản gốc.
P=supercitadellab
echo "════ SUPERCITADELLAB — Deploy (sandbox) ════"
if [ ! -f .env ]; then echo "✗ thiếu .env Lab"; exit 1; fi
echo "→ docker compose -p $P up (build)…"
docker compose -p $P up -d --build
echo "→ Đợi Postgres Lab…"
until docker compose -p $P exec -T postgres pg_isready -U citadellab >/dev/null 2>&1; do sleep 2; done
echo "→ Migrate core + tất cả module (DB Lab: citadellab)…"
docker compose -p $P exec -T postgres psql -U citadellab -d citadellab -f /dev/stdin < packages/db/migrations/0002_org_modules.sql 2>/dev/null || true
docker compose -p $P exec -T postgres psql -U citadellab -d citadellab -f /dev/stdin < packages/db/migrations/0003_super_admin.sql 2>/dev/null || true
docker compose -p $P exec -T api sh -c "pnpm --filter @citadel/db exec tsx src/migrate.ts" || true
for m in chat notification crm om inventory hr accounting ke-toan-10a soul-manager soul-meeting soul-inventory; do
  for mig in modules/$m/migrations/*.sql; do
    case "$mig" in *backfill*) echo "  ↳ bỏ qua $mig (backfill thủ công)"; continue;; esac
    docker compose -p $P exec -T postgres psql -U citadellab -d citadellab -f /dev/stdin < "$mig" 2>/dev/null || true
  done
  echo "  ✓ migrated $m"
done
echo "→ Seed demo (token Lab riêng)…"
docker compose -p $P exec -T \
  -e CITADEL_SUPER_ADMIN_TOKEN=LABSUPERADMIN \
  -e CITADEL_OWNER_TOKEN=LABOWNERFULL01 \
  -e CITADEL_MANAGER_TOKEN=LABMANAGER001 \
  api sh -c "CITADEL_SUPER_ADMIN_TOKEN=LABSUPERADMIN CITADEL_OWNER_TOKEN=LABOWNERFULL01 CITADEL_MANAGER_TOKEN=LABMANAGER001 pnpm --filter @citadel/db exec tsx src/seed.ts" || true
echo ""
echo "════ XONG (Lab) ════"
echo "Web (local) : http://localhost:3010"
echo "API (local) : http://localhost:3011/health"
echo "Public      : https://supercitadellab.62.146.238.213.sslip.io"
echo "Token: super_admin=LABSUPERADMIN · owner=LABOWNERFULL01 · manager=LABMANAGER001"
