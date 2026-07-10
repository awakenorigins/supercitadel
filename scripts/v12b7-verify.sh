#!/bin/bash
# V12b ⑦ verify — TSCĐ phân bổ khấu hao multi-TK 627/641/642
# Usage: bash v12b7-verify.sh <org-token>
set -u
API=http://127.0.0.1:3011/api/v1
curl -s -X POST $API/auth/login -H 'content-type: application/json' -d "{\"token\":\"$1\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["jwt"])' > /tmp/v12b7-jwt.txt
read -r TOK < /tmp/v12b7-jwt.txt
H="Authorization: Bearer $TOK"
CT="content-type: application/json"

echo "== T1: tạo TSCĐ 120tr / 12 tháng, phân bổ 627=50% 641=30% 642=20% =="
curl -s -X POST "$API/ke-toan-10a/assets" -H "$H" -H "$CT" -d '{"name":"May CNC dung chung V12b7","cost":"120000000","usefulLifeMonths":12,"startDate":"2026-07-01","allocations":[{"code":"627","percent":50},{"code":"641","percent":30},{"code":"642","percent":20}]}' | python3 -c 'import sys,json; d=json.load(sys.stdin); a=d.get("asset"); print("  code:",a["code"],"| allocations:",a["allocations"]) if a else print("  ERR:",d)'

echo "== T2: tổng % != 100 → phải bị chặn =="
curl -s -X POST "$API/ke-toan-10a/assets" -H "$H" -H "$CT" -d '{"name":"Sai pct","cost":"1000000","usefulLifeMonths":12,"startDate":"2026-07-01","allocations":[{"code":"627","percent":50},{"code":"641","percent":30}]}' | head -c 200

echo; echo "== T3: TK trùng → phải bị chặn =="
curl -s -X POST "$API/ke-toan-10a/assets" -H "$H" -H "$CT" -d '{"name":"Trung TK","cost":"1000000","usefulLifeMonths":12,"startDate":"2026-07-01","allocations":[{"code":"627","percent":50},{"code":"627","percent":50}]}' | head -c 200

echo; echo "== T4: chạy khấu hao tháng 7 → bút toán phải có 3 dòng Nợ 627/641/642 (5tr/3tr/2tr) + Có 214 (10tr) =="
curl -s -X POST "$API/ke-toan-10a/assets/depreciation" -H "$H" -H "$CT" -d '{"asOf":"2026-07-01"}' | python3 -c 'import sys,json; d=json.load(sys.stdin); print("  posted:",d["posted"],"assets:",d["assets"])'

echo "== T5: soi sổ nhật ký chung → dòng khấu hao đúng phân bổ =="
curl -s "$API/ke-toan-10a/reports/general-journal?from=2026-07-01&to=2026-07-31" -H "$H" | python3 -c '
import sys, json
d = json.load(sys.stdin)
for e in d["rows"]:
    if "Khấu hao" in (e.get("memo") or ""):
        print("  ", e["entryNo"], e["memo"])
        for l in e["lines"]:
            side = "Nợ " + l["accountCode"] if float(l["debit"])>0 else "  Có " + l["accountCode"]
            amt = l["debit"] if float(l["debit"])>0 else l["credit"]
            print("     ", side, amt)
'
echo "== T6: sổ vẫn cân =="
curl -s "$API/ke-toan-10a/reports/trial-balance-misa?from=2026-07-01&to=2026-07-31" -H "$H" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("  balanced:",d["balanced"])'
