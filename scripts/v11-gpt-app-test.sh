#!/bin/bash
TOK="JoliPoli"
TOK="${TOK}13"
JWT=$(curl -s -X POST http://127.0.0.1:3011/api/v1/auth/login -H 'Content-Type: application/json' -d "{\"token\":\"$TOK\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).jwt')
for i in 1 2; do
  echo "=== gpt-5.5 attempt $i ==="
  curl -s -m 120 -X POST http://127.0.0.1:3011/api/v1/tieu-tam/chat -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' -d "{\"message\":\"Em đang chạy model nào? Trả lời 1 câu thôi ($i)\"}" | head -c 600; echo; echo
done
