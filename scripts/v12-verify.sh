#!/bin/bash
# V12 verify: nhật ký chung + invoice activity + định khoản UI (API side)
read -r JWT < /root/.openclaw/workspace/.jwt.txt
B="http://127.0.0.1:3011/api/v1/ke-toan-10a"
H="Authorization: Bearer $JWT"
echo "== 1. Sổ nhật ký chung =="
curl -s "$B/reports/general-journal?from=2026-01-01&to=2026-12-31" -H "$H" | head -c 600; echo; echo
echo "== 2. Lấy 1 invoice để test activity =="
IID=$(curl -s "$B/invoices" -H "$H" | node -pe 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")); (d.invoices?.[0]?.id)||""')
echo "invoice id: $IID"
if [ -n "$IID" ]; then
  echo "== 3. Invoice activity =="
  curl -s "$B/invoices/$IID/activity" -H "$H" | head -c 600; echo
else
  echo "(chưa có invoice — tạo 1 cái test)"
  CT=$(curl -s -X POST "$B/contacts" -H "$H" -H 'Content-Type: application/json' -d '{"name":"Khach Test V12","type":"CUSTOMER"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).id')
  IV=$(curl -s -X POST "$B/invoices" -H "$H" -H 'Content-Type: application/json' -d "{\"docDate\":\"2026-07-10\",\"contactId\":\"$CT\",\"subtotal\":\"5000000\",\"taxRate\":\"8\",\"post\":true}")
  IID=$(echo "$IV" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).id')
  echo "created invoice: $IID"
  curl -s -X POST "$B/invoices/$IID/payment" -H "$H" -H 'Content-Type: application/json' -d '{"amount":"2000000"}' > /dev/null
  echo "== 3. Invoice activity (sau ghi sổ + thu 2tr) =="
  curl -s "$B/invoices/$IID/activity" -H "$H" | head -c 800; echo
fi
echo "== 4. Receipt với TK tùy chọn (112/131) =="
curl -s -X POST "$B/receipts" -H "$H" -H 'Content-Type: application/json' -d '{"docDate":"2026-07-10","cashAccountCode":"112","counterAccountCode":"131","amount":"1000000","reason":"Test dinh khoan V12","post":true}' | head -c 300; echo
