#!/bin/bash
TOK="JoliPoli"
TOK="${TOK}13"
curl -s -X POST http://127.0.0.1:3011/api/v1/auth/login -H 'Content-Type: application/json' -d "{\"token\":\"$TOK\"}" > /tmp/v11-login.json
JWT=$(node -pe 'JSON.parse(require("fs").readFileSync("/tmp/v11-login.json","utf8")).jwt')
echo "JWT_LEN=${#JWT}"
echo "== gpt-5.5 tool call test (them khach hang) =="
curl -s -m 120 -X POST http://127.0.0.1:3011/api/v1/tieu-tam/chat -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' -d '{"message":"Thêm khách hàng tên Trần Test V11, sđt 0901234567"}' | head -c 500; echo
echo "== chuyen ve opus-4.6 =="
curl -s -X PATCH http://127.0.0.1:3011/api/v1/tieu-tam/engine -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' -d '{"engine":"opus-4.6"}' | head -c 150; echo
echo "== opus-4.6 chat + tool (tom tat) =="
curl -s -m 120 -X POST http://127.0.0.1:3011/api/v1/tieu-tam/chat -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' -d '{"message":"Tóm tắt nhanh dữ liệu tổ chức cho anh"}' | head -c 500; echo
