#!/bin/bash
# V12b test data: 1 phiếu thu tháng 6 (kỳ trước) + 1 phiếu thu & 1 phiếu chi tháng 7 (trong kỳ)
set -u
API=http://127.0.0.1:3011/api/v1
JWT=$(curl -s -X POST $API/auth/login -H 'content-type: application/json' -d "{\"token\":\"$1\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["jwt"])')
H="Authorization: Bearer $JWT"
echo "== receipt T6 (5tr, Nợ 111/Có 511) =="
curl -s -X POST "$API/ke-toan-10a/receipts" -H "$H" -H 'content-type: application/json' -d '{"docDate":"2026-06-15","counterAccountCode":"511","amount":"5000000","description":"V12b test thu T6"}' | head -c 200; echo
echo "== receipt T7 (3tr, Nợ 112/Có 131) =="
curl -s -X POST "$API/ke-toan-10a/receipts" -H "$H" -H 'content-type: application/json' -d '{"docDate":"2026-07-05","counterAccountCode":"131","cashAccountCode":"112","amount":"3000000","description":"V12b test thu T7"}' | head -c 200; echo
echo "== payment T7 (1.2tr, Nợ 642/Có 111) =="
curl -s -X POST "$API/ke-toan-10a/payments" -H "$H" -H 'content-type: application/json' -d '{"docDate":"2026-07-08","counterAccountCode":"642","amount":"1200000","description":"V12b test chi T7"}' | head -c 200; echo
