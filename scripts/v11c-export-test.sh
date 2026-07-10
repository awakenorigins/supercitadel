#!/bin/bash
# V11C test: API export.xlsx + tool hr.payroll.export_excel qua chat
read -r JWT < /root/.openclaw/workspace/.jwt.txt
Y=$(date +%Y); M=$(date +%-m)
echo "== 0. org cũ có payslip kỳ nào? =="
docker exec supercitadellab-postgres-1 psql -U citadellab -d citadellab -tAc "SELECT p.year, p.month, p.status, count(s.id) FROM hr_payroll_periods p LEFT JOIN hr_payslips s ON s.period_id=p.id GROUP BY 1,2,3 ORDER BY 1,2 LIMIT 5" 2>/dev/null || echo "(bảng khác tên — thử schema)"
echo "== 1. API export.xlsx trực tiếp =="
for TRY in "$Y $M" "2026 6" "2025 12"; do
  set -- $TRY
  CODE=$(curl -s -o /tmp/v11c-payroll.xlsx -w '%{http_code}' "http://127.0.0.1:3011/api/v1/soul-manager/payroll/export.xlsx?year=$1&month=$2" -H "Authorization: Bearer $JWT")
  SIZE=$(wc -c < /tmp/v11c-payroll.xlsx)
  echo "kỳ $2/$1 → HTTP $CODE, $SIZE bytes"
  if [ "$CODE" = "200" ]; then file -b /tmp/v11c-payroll.xlsx; break; fi
  head -c 200 /tmp/v11c-payroll.xlsx; echo
done
echo "== 2. Tiểu Tâm chat gọi tool export =="
curl -s -m 120 -X POST http://127.0.0.1:3011/api/v1/tieu-tam/chat -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' -d "{\"message\":\"Xuất file bảng lương excel kỳ $M/$Y cho anh\"}" | head -c 700; echo
