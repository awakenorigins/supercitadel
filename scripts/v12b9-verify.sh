#!/bin/bash
# V12b ⑨ verify — chuỗi công nợ tự động: FIFO + đa tiền tệ + bút toán gộp
# Usage: bash v12b9-verify.sh <org-token>
set -u
API=http://127.0.0.1:3011/api/v1
curl -s -X POST $API/auth/login -H 'content-type: application/json' -d "{\"token\":\"$1\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["jwt"])' > /tmp/v12b9-jwt.txt
read -r TOK < /tmp/v12b9-jwt.txt
H="Authorization: Bearer $TOK"
CT="content-type: application/json"

echo "== Setup: tạo khách hàng + 3 hóa đơn (T5: 1tr, T6: 2tr, T7: 3tr) =="
CID=$(curl -s -X POST "$API/ke-toan-10a/contacts" -H "$H" -H "$CT" -d '{"name":"V12b9 Chain Customer","type":"CUSTOMER"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["contact"]["id"])')
echo "  contactId: $CID"
for X in '2026-05-10|1000000' '2026-06-10|2000000' '2026-07-05|3000000'; do
  D="${X%%|*}"; A="${X##*|}"
  curl -s -X POST "$API/ke-toan-10a/invoices" -H "$H" -H "$CT" -d "{\"docDate\":\"$D\",\"contactId\":\"$CID\",\"subtotal\":\"$A\",\"taxRate\":\"0\"}" | python3 -c 'import sys,json; r=json.load(sys.stdin).get("invoice"); print("  HD:", r["docNo"], r["docDate"], r["total"]) if r else print("  ERR", json.load(sys.stdin))'
done

echo "== T1: PREVIEW trả 2.5tr → phải phân bổ FIFO: HD1 1tr full + HD2 1.5tr (chưa hạch toán) =="
curl -s -X POST "$API/ke-toan-10a/debt-chains/preview" -H "$H" -H "$CT" -d "{\"type\":\"sales\",\"contactId\":\"$CID\",\"amount\":\"2500000\"}" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("  allocated:",d["allocated"],"unallocated:",d["unallocated"]); [print("   ",l["docNo"],l["docDate"],"applied:",l["applied"],"còn lại:",l["remainingAfter"]) for l in d["links"]]'

echo "== T2: SETTLE 2.5tr → hạch toán thật cả chuỗi =="
curl -s -X POST "$API/ke-toan-10a/debt-chains/settle" -H "$H" -H "$CT" -d "{\"type\":\"sales\",\"contactId\":\"$CID\",\"amount\":\"2500000\",\"docDate\":\"2026-07-10\"}" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("  chain:",d["chain"]["id"][:8],"allocated:",d["allocated"],"unallocated:",d["unallocated"],"links:",len(d["links"]))'

echo "== T3: SETTLE tiếp bằng USD 200 @ 25000 (= 5tr VND) → cấn nốt HD2 (0.5tr) + HD3 (3tr), thừa 1.5tr unallocated =="
curl -s -X POST "$API/ke-toan-10a/debt-chains/settle" -H "$H" -H "$CT" -d "{\"type\":\"sales\",\"contactId\":\"$CID\",\"amount\":\"200\",\"currency\":\"USD\",\"exchangeRate\":\"25000\",\"rateNote\":\"test FX chain\",\"docDate\":\"2026-07-10\"}" | python3 -c 'import sys,json; d=json.load(sys.stdin); c=d.get("chain"); print("  allocated:",d["allocated"],"unallocated(thừa):",d["unallocated"],"| cur:",c["currency"],"OC:",c["amountOC"],"@",c["exchangeRate"]) if c else print("  ERR:",d)'

echo "== T4: settle nữa khi hết nợ → phải bị chặn =="
curl -s -X POST "$API/ke-toan-10a/debt-chains/settle" -H "$H" -H "$CT" -d "{\"type\":\"sales\",\"contactId\":\"$CID\",\"amount\":\"100000\"}" | head -c 220

echo; echo "== T5: kiểm tra hóa đơn đã paid đủ =="
curl -s "$API/ke-toan-10a/invoices" -H "$H" | python3 -c '
import sys,json
for i in json.load(sys.stdin)["invoices"]:
    if "V12b9" in str(i.get("description") or "") or True:
        pass
' 2>/dev/null
curl -s "$API/ke-toan-10a/reports/outstanding?type=sales" -H "$H" | python3 -c 'import sys,json; d=json.load(sys.stdin); m=[p for p in d["parties"] if p["contactId"]=="'"$CID"'"]; print("  outstanding của khách chain:", m[0]["outstanding"] if m else "0 (sạch nợ ✓)")'

echo "== T6: sổ vẫn cân + bút toán gộp trong nhật ký =="
curl -s "$API/ke-toan-10a/reports/trial-balance-misa?from=2026-05-01&to=2026-07-31" -H "$H" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("  balanced:",d["balanced"])'
curl -s "$API/ke-toan-10a/reports/general-journal?from=2026-07-10&to=2026-07-10" -H "$H" | python3 -c '
import sys,json
for e in json.load(sys.stdin)["rows"]:
    if "cấn trừ chuỗi" in (e.get("memo") or ""):
        print("  ", e["entryNo"], "|", e["memo"][:70])
        for l in e["lines"]: print("     ", "Nợ" if float(l["debit"])>0 else "  Có", l["accountCode"], l["debit"] if float(l["debit"])>0 else l["credit"])
'
echo "== T7: list chains =="
curl -s "$API/ke-toan-10a/debt-chains?contactId=$CID" -H "$H" | python3 -c 'import sys,json; [print("  ",c["docDate"],c["chainType"],"total:",c["totalAmount"],"links:",c["linkCount"],"unalloc:",c["unallocated"]) for c in json.load(sys.stdin)["chains"]]'
