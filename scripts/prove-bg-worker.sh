#!/usr/bin/env bash
# Chứng minh worker chạy NỀN: arm bot qua API, KHÔNG mở UI, đợi ~25s, xem log/state có tiến triển.
set -e
JWT="$(cat /root/.openclaw/workspace/.jwt.txt)"
BASE="https://supercitadellab.62.146.238.213.sslip.io/api/v1/soul-trade"
BOT="${1:-pnl-demo}"
auth=(-H "Authorization: Bearer $JWT")

echo "=== 1) ARM $BOT (server-side, không mở web) ==="
curl -s -X POST "$BASE/trade/bots/$BOT/automato/arm" "${auth[@]}" -H "Content-Type: application/json" --max-time 15 | head -c 200; echo

logcount () { curl -s "$BASE/trade/bots/$BOT/automato/log?limit=200" "${auth[@]}" --max-time 15 \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)"; }

B=$(logcount); echo "logs BEFORE = $B"
echo "=== đợi 25s, KHÔNG gọi /position (giả lập đã đóng tab) ==="
sleep 25
A=$(logcount); echo "logs AFTER = $A"

echo "=== log mới nhất ==="
curl -s "$BASE/trade/bots/$BOT/automato/log?limit=4" "${auth[@]}" --max-time 15 \
 | python3 -c "import sys,json;[print(x.get('at','?')[11:19], x.get('kind'), x.get('message','')[:60]) for x in json.load(sys.stdin)[:4]]" 2>/dev/null

if [ "$A" -gt "$B" ]; then echo "RESULT: PASS — worker tick nền, log tăng $B→$A dù không mở UI"; else echo "RESULT: (log không tăng — có thể đang scanning chưa vào lệnh; kiểm tra state)"; fi

echo "=== state hiện tại (uiPhase / sessionTrades) ==="
curl -s "$BASE/trade/bots/$BOT/automato" "${auth[@]}" --max-time 15 \
 | python3 -c "import sys,json; d=json.load(sys.stdin); c=d.get('config',d); s=c.get('state',{}); print('armed=',c.get('armed'),'uiPhase=',s.get('uiPhase'),'sessionTrades=',s.get('sessionTrades'),'openPos=',bool(s.get('openPosition')))" 2>/dev/null
