#!/bin/bash
# V12b ⑥ verify — đa tiền tệ: phiếu thu/chi/HĐ nguyên tệ → quy đổi VND hạch toán
# Usage: bash v12b6-verify.sh <org-token>
set -u
API=http://127.0.0.1:3011/api/v1
curl -s -X POST $API/auth/login -H 'content-type: application/json' -d "{\"token\":\"$1\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["jwt"])' > /tmp/v12b6-jwt.txt
read -r TOK < /tmp/v12b6-jwt.txt
H="Authorization: Bearer $TOK"
CT="content-type: application/json"

echo "== T1: phiếu thu USD 100 @ 25400 → amount phải = 2,540,000 VND =="
curl -s -X POST "$API/ke-toan-10a/receipts" -H "$H" -H "$CT" -d '{"docDate":"2026-07-10","counterAccountCode":"511","amount":"100","currency":"USD","exchangeRate":"25400","rateNote":"TGNH VCB 10/07","reason":"V12b6 test USD"}' | python3 -c 'import sys,json; r=json.load(sys.stdin)["receipt"]; print("  docNo:",r["docNo"],"| amount(VND):",r["amount"],"| OC:",r["amountOC"],r["currency"],"@",r["exchangeRate"],"| note:",r["rateNote"],"| rateDate:",r["rateDate"])'

echo "== T2: phiếu thu VND thường → currency=VND, rate=1, amountOC=amount =="
curl -s -X POST "$API/ke-toan-10a/receipts" -H "$H" -H "$CT" -d '{"docDate":"2026-07-10","counterAccountCode":"511","amount":"500000","reason":"V12b6 test VND"}' | python3 -c 'import sys,json; r=json.load(sys.stdin)["receipt"]; print("  docNo:",r["docNo"],"| amount:",r["amount"],"| cur:",r["currency"],"rate:",r["exchangeRate"],"OC:",r["amountOC"])'

echo "== T3: USD KHÔNG có tỷ giá → phải bị chặn =="
curl -s -X POST "$API/ke-toan-10a/receipts" -H "$H" -H "$CT" -d '{"docDate":"2026-07-10","counterAccountCode":"511","amount":"100","currency":"USD"}' | head -c 200

echo; echo "== T4: tỷ giá âm → phải bị chặn =="
curl -s -X POST "$API/ke-toan-10a/receipts" -H "$H" -H "$CT" -d '{"docDate":"2026-07-10","counterAccountCode":"511","amount":"100","currency":"USD","exchangeRate":"-5"}' | head -c 200

echo; echo "== T5: phiếu chi EUR 50 @ 27123.456789 → check round BigInt (6 lẻ bị chặn? 27123.456789 có 6 lẻ) =="
curl -s -X POST "$API/ke-toan-10a/payments" -H "$H" -H "$CT" -d '{"docDate":"2026-07-10","counterAccountCode":"642","amount":"50","currency":"EUR","exchangeRate":"27123.456789","reason":"V12b6 test EUR"}' | python3 -c 'import sys,json; d=json.load(sys.stdin); r=d.get("payment"); print("  amount(VND):",r["amount"],"| OC:",r["amountOC"],r["currency"]) if r else print("  ERR:",d)'

echo "== T6: HĐ bán USD subtotal 1000, thuế 10% @ 25000 → total = 27,500,000 VND, amountOC = 1100 USD =="
CID=$(curl -s -X POST "$API/ke-toan-10a/contacts" -H "$H" -H "$CT" -d '{"name":"V12b6 FX Customer","type":"CUSTOMER"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["contact"]["id"])')
curl -s -X POST "$API/ke-toan-10a/invoices" -H "$H" -H "$CT" -d "{\"docDate\":\"2026-07-10\",\"contactId\":\"$CID\",\"subtotal\":\"1000\",\"taxRate\":\"10\",\"currency\":\"USD\",\"exchangeRate\":\"25000\",\"rateNote\":\"test\"}" | python3 -c 'import sys,json; d=json.load(sys.stdin); r=d.get("invoice"); print("  subtotal:",r["subtotal"],"tax:",r["taxAmount"],"total:",r["total"],"| OC:",r["amountOC"],r["currency"]) if r else print("  ERR:",d)'

echo "== T7: sổ vẫn cân sau các bút toán FX =="
curl -s "$API/ke-toan-10a/reports/trial-balance-misa?from=2026-07-01&to=2026-07-31" -H "$H" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("  balanced:",d["balanced"],"| periodDebit:",d["totals"]["periodDebit"],"= periodCredit:",d["totals"]["periodCredit"])'
