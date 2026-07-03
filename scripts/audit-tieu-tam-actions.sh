#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE:-https://supercitadel.62.146.238.213.sslip.io}"
TOKEN="${DEMO_TOKEN:-${CITADEL_OWNER_TOKEN:-V8OWNERFULL01}}"
TMP="${TMPDIR:-/tmp}/r6-login.json"
curl -fsS "$BASE/api/v1/auth/login" -H 'content-type: application/json' -d "{"token":"$TOKEN"}" > "$TMP"
AUTH="Authorization: Bearer $(python3 - <<'PY2' "$TMP"
import json,sys
print(json.load(open(sys.argv[1]))['jwt'])
PY2
)"
post(){ curl -fsS "$BASE/api/v1/tieu-tam/chat" -H 'content-type: application/json' -H "$AUTH" -d "{"message":"$1"}"; echo; }
get(){ curl -fsS "$BASE$1" -H "$AUTH"; echo; }
post "Tạo phiếu thu 200000 cho Cà Phê Sáng"
get "/api/v1/accounting/payments"
get "/api/v1/audit-logs?limit=20"
post "Thêm khách hàng Chị Hoa số điện thoại 0901234567"
get "/api/v1/crm/contacts"
post "Thêm 20 kg cà phê hạt vào kho"
get "/api/v1/inventory/items"
post "Cho Minh check-in"
get "/api/v1/hr/attendance"
post "Số dư ví Om?"
get "/api/v1/tieu-tam/state"
