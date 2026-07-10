#!/bin/bash
# V11 chat smoke test: login → POST /tieu-tam/chat với cả 2 engine
set -e
TOK="JoliPoli"
TOK="${TOK}13"
JWT=$(curl -s -X POST http://127.0.0.1:3011/api/v1/auth/login -H 'Content-Type: application/json' -d "{\"token\":\"$TOK\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).jwt')
echo "JWT_LEN=${#JWT}"
for ENGINE in opus-4.6 gpt-5.5; do
  echo "=== engine: $ENGINE ==="
  curl -s -X PATCH http://127.0.0.1:3011/api/v1/tieu-tam/engine -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' -d "{\"engine\":\"$ENGINE\"}" | head -c 200; echo
  curl -s -m 90 -X POST http://127.0.0.1:3011/api/v1/tieu-tam/chat -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' -d '{"message":"Chào em, giới thiệu ngắn gọn em có thể giúp gì?"}' | head -c 500; echo; echo
done
