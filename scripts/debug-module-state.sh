#!/usr/bin/env bash
set -e
B=https://supercitadel.62.146.238.213.sslip.io
TOK="V8OWNERFULL01"
JWT=$(curl -sk -X POST $B/api/v1/auth/login -H 'Content-Type: application/json' -d "{\"token\":\"$TOK\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["jwt"])')
echo "--- modules state (owner):"
curl -sk $B/api/v1/modules -H "Authorization: Bearer $JWT" | python3 -c '
import sys,json
for m in json.load(sys.stdin)["modules"]: print(m["id"], "| purchased:", m["purchased"], "| active:", m["active"])'
echo "--- accounting gate (owner):"
curl -sk -o /dev/null -w '%{http_code}\n' $B/api/v1/accounting/accounts -H "Authorization: Bearer $JWT"
echo "--- org_modules table:"
docker exec supercitadel-postgres-1 psql -U citadel -d citadel -c "SELECT org_id, module_key, active FROM org_modules ORDER BY module_key;" 2>&1 | head -15
echo "--- orgs:"
docker exec supercitadel-postgres-1 psql -U citadel -d citadel -c "SELECT id, name FROM orgs;" 2>&1 | head -6
echo "--- recent audit:"
curl -sk "$B/api/v1/audit-logs?limit=12" -H "Authorization: Bearer $JWT" | python3 -c '
import sys,json
d=json.load(sys.stdin)
for l in (d.get("logs") or d.get("items") or [])[:12]:
    print(str(l.get("createdAt",""))[:19], l.get("action"), l.get("resource") or "", l.get("resourceId") or "")'
