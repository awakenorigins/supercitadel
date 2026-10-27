#!/usr/bin/env bash
# Test end-to-end: import xlsx qua API live -> check invoice persist sau refresh (GET lai tu DB)
set -e
B=https://supercitadel.62.146.238.213.sslip.io
curl -sk -X POST $B/api/v1/auth/login -H 'Content-Type: application/json' -d '{"token":"V8OWNERFULL01"}' > /tmp/login.json
AUTH_HEADER="Authorization: Bearer $(python3 -c 'import json;print(json.load(open("/tmp/login.json"))["jwt"])')"

echo "--- BEFORE: invoice count:"
curl -sk $B/api/v1/accounting/invoices -H "$AUTH_HEADER" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["invoices"]))'

echo "--- IMPORT /tmp/test-import.xlsx:"
curl -sk -X POST $B/api/v1/accounting/import/invoices.xlsx -H "$AUTH_HEADER" -F "file=@/tmp/test-import.xlsx" | head -c 500
echo

echo "--- AFTER (refresh simulation — GET lai tu DB):"
curl -sk $B/api/v1/accounting/invoices -H "$AUTH_HEADER" | python3 -c '
import sys,json
inv=json.load(sys.stdin)["invoices"]
print("count:", len(inv))
for i in inv[:5]: print(" ", i.get("invoiceNo"), "|", i.get("partyName"), "|", i.get("grandTotal"), "|", i.get("status"))'
