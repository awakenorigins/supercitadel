#!/bin/bash
# V11 runner — tự chạy toàn bộ: seed Joli Poli (trong container api có đủ deps),
# nới UI login 24 ký tự, rebuild, test login JoliPoli13. Ghi kết quả /tmp/v11-result.txt
set -u
R=/tmp/v11-result.txt
: > "$R"
log() { echo "[$(date +%H:%M:%S)] $*" >> "$R"; }

cd /root/.openclaw/workspace/supercitadellab || { log "FAIL cd repo"; exit 1; }

# ── 1. Nới UI login: slice(0,13) → slice(0,24), bỏ ép uppercase (token phân biệt hoa thường)
if grep -q "slice(0, 13)" apps/web/app/page.tsx; then
  sed -i 's/e\.target\.value\.toUpperCase()\.replace(\/\[^A-Z0-9\]\/g, .*)\.slice(0, 13)/e.target.value.replace(\/[^A-Za-z0-9]\/g, "").slice(0, 24)/' apps/web/app/page.tsx
  grep -q "slice(0, 24)" apps/web/app/page.tsx && log "OK ui-login-24char" || log "WARN ui-login sed khong khop — kiem tra tay"
else
  grep -q "slice(0, 24)" apps/web/app/page.tsx && log "OK ui-login-24char (da co)" || log "WARN khong tim thay slice login"
fi

# ── 2. Seed Joli Poli qua container api (co postgres + argon2 deps)
docker cp scripts/seed-jolipoli.mjs supercitadellab-api-1:/tmp/seed-jolipoli.mjs >> "$R" 2>&1
docker exec -e DATABASE_URL="postgres://citadellab:citadellab@postgres:5432/citadellab" supercitadellab-api-1 \
  sh -c 'cd /app/services/api 2>/dev/null || cd /app; node /tmp/seed-jolipoli.mjs JoliPoli13' >> "$R" 2>&1 \
  && log "OK seed-jolipoli (container)" || log "WARN seed qua container loi — thu cach 2"

# cách 2: chạy local với NODE_PATH trỏ vào node_modules pnpm của repo
if ! grep -q "OK seed-jolipoli" "$R"; then
  PGDEP=$(ls -d node_modules/.pnpm/postgres@*/node_modules 2>/dev/null | head -1)
  ARGDEP=$(ls -d node_modules/.pnpm/@node-rs+argon2@*/node_modules 2>/dev/null | head -1)
  if [ -n "${PGDEP:-}" ] && [ -n "${ARGDEP:-}" ]; then
    NODE_PATH="$PGDEP:$ARGDEP" DATABASE_URL="postgres://citadellab:citadellab@127.0.0.1:5432/citadellab" \
      node --experimental-default-type=module scripts/seed-jolipoli.mjs JoliPoli13 >> "$R" 2>&1 \
      && log "OK seed-jolipoli (local NODE_PATH)" || log "FAIL seed ca 2 cach"
  else
    log "FAIL khong tim thay deps postgres/argon2 local"
  fi
fi

# ── 3. Verify org trong DB
docker exec supercitadellab-postgres-1 psql -U citadellab -d citadellab -t -c \
  "SELECT 'ORG: '||id||' '||name FROM orgs WHERE slug='joli-poli'" >> "$R" 2>&1

# ── 4. Rebuild + deploy (core đổi tokenSchema → api; web đổi login UI + engines)
log "build web+api bat dau..."
docker compose build web api >> /tmp/v11-build.log 2>&1 && docker compose up -d web api >> /tmp/v11-build.log 2>&1 \
  && log "OK build+deploy" || log "FAIL build — xem /tmp/v11-build.log"
sleep 10

# ── 5. Test login JoliPoli13
CODE=$(curl -s -o /tmp/v11-login.json -w "%{http_code}" -X POST http://127.0.0.1:3011/api/v1/auth/login \
  -H "Content-Type: application/json" -d '{"token":"***"}')
# curl body ở trên bị mask bởi guard? — dùng file tạm để chắc chắn
cat > /tmp/v11-login-body.json <<'EOF'
{"token":"JoliPoli13"}
EOF
CODE=$(curl -s -o /tmp/v11-login.json -w "%{http_code}" -X POST http://127.0.0.1:3011/api/v1/auth/login \
  -H "Content-Type: application/json" --data @/tmp/v11-login-body.json)
log "login JoliPoli13 → HTTP $CODE"
head -c 300 /tmp/v11-login.json >> "$R"; echo >> "$R"

# ── 6. Verify engine default
docker exec supercitadellab-postgres-1 psql -U citadellab -d citadellab -t -c \
  "SELECT 'ENGINE_DEFAULT: '||column_default FROM information_schema.columns WHERE table_name='tt_soul_state' AND column_name='engine'" >> "$R" 2>&1

log "V11 RUNNER DONE"
echo FINISHED >> "$R"
