#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE:-https://supercitadel.62.146.238.213.sslip.io}"
TOKEN="${DEMO_TOKEN:-${CITADEL_OWNER_TOKEN:-V8OWNERFULL01}}"
TMP="${TMPDIR:-/tmp}/r6-login.json"

python3 - <<'PY' "$BASE" "$TOKEN" "$TMP"
import json, sys, urllib.request
base, token, out = sys.argv[1:4]
req = urllib.request.Request(
    base + '/api/v1/auth/login',
    data=json.dumps({'token': token}).encode(),
    headers={'content-type': 'application/json'},
)
with urllib.request.urlopen(req, timeout=20) as r:
    data = json.load(r)
open(out, 'w').write(json.dumps(data))
PY
AUTH="Authorization: Bearer $(python3 - <<'PY' "$TMP"
import json,sys
print(json.load(open(sys.argv[1]))['jwt'])
PY
)"
post(){
  python3 - <<'PY' "$BASE" "$AUTH" "$1"
import json, sys, urllib.request
base, auth, message = sys.argv[1:4]
req = urllib.request.Request(
    base + '/api/v1/tieu-tam/chat',
    data=json.dumps({'message': message}).encode(),
    headers={'content-type': 'application/json', 'Authorization': auth.split(' ', 1)[1]},
)
try:
    with urllib.request.urlopen(req, timeout=60) as r:
        print(r.read().decode())
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print(body)
    raise SystemExit(e.code)
PY
}
get(){ curl -fsS "$BASE$1" -H "$AUTH"; echo; }
post "Tạo phiếu thu 200000 cho Cà Phê Sáng"
get "/api/v1/accounting/payments"
get "/api/v1/audit-logs?limit=20"
post "Thêm khách hàng Chị Hoa số điện thoại 0901234567"
get "/api/v1/crm/contacts"
post "Thêm 20 kg cà phê hạt vào kho"
get "/api/v1/inventory/items"
post "Cho Minh check-in" || true
get "/api/v1/hr/attendance"
post "Số dư ví Om?"
get "/api/v1/tieu-tam/state"
