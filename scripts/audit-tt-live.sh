#!/usr/bin/env bash
# R6 Phase C — audit Tiểu Tâm action layer trên site LIVE
set -e
B=https://supercitadel.62.146.238.213.sslip.io
curl -sk -X POST $B/api/v1/auth/login -H 'Content-Type: application/json' -d '{"token":"V8OWNERFULL01"}' > /tmp/login.json
AUTH="Authorization: Bearer $(python3 -c 'import json;print(json.load(open("/tmp/login.json"))["jwt"])')"

echo "═══ 0. Engine state:"
curl -sk $B/api/v1/tieu-tam/state -H "$AUTH" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("engine:",d.get("engine"),"| mood:",d.get("mood"))'

chat() {
  echo "───────────────────────────────"
  echo "💬 LỆNH: $1"
  curl -sk -m 60 -X POST $B/api/v1/tieu-tam/chat -H "$AUTH" -H 'Content-Type: application/json' -d "{\"message\":\"$1\"}" | python3 -c '
import sys,json
try:
    d=json.load(sys.stdin)
    print("🤖 REPLY:", (d.get("reply") or d.get("text") or str(d))[:300])
    tc=d.get("toolCalls") or []
    for t in tc: print("   ⚙️ ACTION:", t.get("action") or t.get("name"), "→", str(t.get("result"))[:150])
    print("   mode:", d.get("mode"))
except Exception as e:
    print("PARSE ERR:", e)'
}

chat "Tạo phiếu thu 200000 cho Cà Phê Sáng"
chat "Thêm khách hàng Chị Hoa số điện thoại 0901234567"
chat "Thêm 20 kg cà phê hạt vào kho"
chat "Số dư ví Om của mình là bao nhiêu?"

echo "═══ VERIFY DB (qua API):"
echo "-- payments mới nhất:"
curl -sk "$B/api/v1/accounting/payments" -H "$AUTH" | python3 -c '
import sys,json
ps=json.load(sys.stdin).get("payments",[])
for p in ps[:3]: print("  ", p.get("paymentType"), p.get("partyName"), p.get("amount"))'
echo "-- contacts:"
curl -sk "$B/api/v1/crm/contacts" -H "$AUTH" | python3 -c '
import sys,json
cs=json.load(sys.stdin).get("contacts",[])
for c in cs[:4]: print("  ", c.get("name"), c.get("phone") or "")'
echo "-- inventory:"
curl -sk "$B/api/v1/inventory/items" -H "$AUTH" | python3 -c '
import sys,json
its=json.load(sys.stdin).get("items",[])
for i in its[:4]: print("  ", i.get("name"), i.get("qty"), i.get("unit") or "")'
echo "-- audit log tieu_tam.action:"
curl -sk "$B/api/v1/audit-logs?action=tieu_tam.action&limit=6" -H "$AUTH" | python3 -c '
import sys,json
ls=json.load(sys.stdin).get("logs",[])
for l in ls[:6]: print("  ", str(l.get("createdAt"))[:19], (l.get("detail") or {}).get("action"))'
