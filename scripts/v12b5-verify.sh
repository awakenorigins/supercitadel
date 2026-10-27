#!/bin/bash
# V12b ⑤ verify — số chứng từ tùy chỉnh: format per-org + manual docNo + check trùng
set -u
API=http://127.0.0.1:3011/api/v1
curl -s -X POST $API/auth/login -H 'content-type: application/json' -d "{\"token\":\"$1\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["jwt"])' > /tmp/v12b5-jwt.txt
read -r TOK < /tmp/v12b5-jwt.txt
H="Authorization: Bearer $TOK"
CT="content-type: application/json"

echo "== T1: GET settings mặc định =="
curl -s "$API/ke-toan-10a/settings/doc-numbers" -H "$H" | python3 -c 'import sys,json; d=json.load(sys.stdin); [print(" ", t["docType"], "setting:", t["setting"], "counter:", t["counter"]) for t in d["types"]]'

echo "== T2: PUT format tùy chỉnh RECEIPT: PTX{yy}{month}/{seq} pad=4 =="
curl -s -X PUT "$API/ke-toan-10a/settings/doc-numbers" -H "$H" -H "$CT" -d '{"docType":"RECEIPT","prefix":"PTX","pad":4,"format":"{prefix}{yy}{month}/{seq}"}'

echo; echo "== T3: tạo phiếu thu auto → docNo phải theo format mới =="
curl -s -X POST "$API/ke-toan-10a/receipts" -H "$H" -H "$CT" -d '{"docDate":"2026-07-10","counterAccountCode":"511","amount":"111000","reason":"V12b5 test format"}' | python3 -c 'import sys,json; print("  docNo:", json.load(sys.stdin)["receipt"]["docNo"])'

echo "== T4: tạo phiếu thu docNo TAY = PT-TAY-001 =="
curl -s -X POST "$API/ke-toan-10a/receipts" -H "$H" -H "$CT" -d '{"docDate":"2026-07-10","counterAccountCode":"511","amount":"222000","reason":"V12b5 test manual","docNo":"PT-TAY-001"}' | python3 -c 'import sys,json; print("  docNo:", json.load(sys.stdin)["receipt"]["docNo"])'

echo "== T5: tạo TRÙNG PT-TAY-001 → phải bị chặn =="
curl -s -X POST "$API/ke-toan-10a/receipts" -H "$H" -H "$CT" -d '{"docDate":"2026-07-10","counterAccountCode":"511","amount":"333000","reason":"V12b5 test dup","docNo":"PT-TAY-001"}' | head -c 250

echo; echo "== T6: docNo ký tự bậy → phải bị chặn =="
curl -s -X POST "$API/ke-toan-10a/receipts" -H "$H" -H "$CT" -d '{"docDate":"2026-07-10","counterAccountCode":"511","amount":"444000","docNo":"PT @@@ ###"}' | head -c 250

echo; echo "== T7: format thiếu {seq} → phải bị chặn =="
curl -s -X PUT "$API/ke-toan-10a/settings/doc-numbers" -H "$H" -H "$CT" -d '{"docType":"PAYMENT","format":"{prefix}-{year}"}' | head -c 250

echo; echo "== T8: reset RECEIPT về mặc định =="
curl -s -X PUT "$API/ke-toan-10a/settings/doc-numbers" -H "$H" -H "$CT" -d '{"docType":"RECEIPT","prefix":"PT","pad":6,"format":"{prefix}-{year}-{seq}"}' | head -c 150
echo
