#!/usr/bin/env bash
set -e
B=https://supercitadel.62.146.238.213.sslip.io
JWT=$(curl -sk -X POST $B/api/v1/auth/login -H 'Content-Type: application/json' -d '{"token":"V8OWNERFULL01"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["jwt"])')
for M in crm inventory hr accounting; do
  echo "$M → $(curl -sk -X POST "$B/api/v1/modules/$M/activate" -H "Authorization: Bearer $JWT" | head -c 80)"
done
echo "--- verify:"
curl -sk $B/api/v1/modules -H "Authorization: Bearer $JWT" | python3 -c '
import sys,json
for m in json.load(sys.stdin)["modules"]: print(m["id"], "active:", m["active"])'
echo "--- accounting endpoint:"
curl -sk -o /dev/null -w '%{http_code}\n' $B/api/v1/accounting/accounts -H "Authorization: Bearer $JWT"
