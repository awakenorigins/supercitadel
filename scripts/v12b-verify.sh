#!/bin/bash
# V12b ④ verify — trial-balance-misa 8 cột
set -u
API=http://127.0.0.1:3011/api/v1
JWT=$(curl -s -X POST $API/auth/login -H 'content-type: application/json' -d "{\"token\":\"$1\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["jwt"])')
echo "JWT_LEN=${#JWT}"
curl -s "$API/ke-toan-10a/reports/trial-balance-misa?from=${1:-2026-07-01}&to=${2:-2026-07-31}" -H "Authorization: Bearer $JWT" | python3 "$(dirname "$0")/v12b-verify.py"
