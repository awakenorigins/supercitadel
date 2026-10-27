#!/bin/bash
# Đo latency API Automato — chạy nền ghi /tmp/timing.txt
JWT=$(cat /root/.openclaw/workspace/.jwt.txt)
BOT=$(curl -s http://127.0.0.1:3011/api/v1/soul-trade/trade/bots -H "Authorization: Bearer $JWT" | python3 -c "import sys,json;d=json.load(sys.stdin);print((d.get('bots') or d)[0]['name'])" 2>/dev/null)
{
echo "bot=$BOT"
for ep in arm disarm; do
  t=$(curl -s -o /dev/null -w "%{time_total}" -X POST "http://127.0.0.1:3011/api/v1/soul-trade/trade/bots/$BOT/automato/$ep" -H "Authorization: Bearer $JWT")
  echo "$ep: ${t}s"
done
for ep in "automato" "automato/position" "automato/analytics" "automato/log?limit=80" "automato/ohlcv?tf=1m&limit=80"; do
  t=$(curl -s -o /dev/null -w "%{time_total}" "http://127.0.0.1:3011/api/v1/soul-trade/trade/bots/$BOT/$ep" -H "Authorization: Bearer $JWT")
  echo "$ep: ${t}s"
done
} > /tmp/timing.txt 2>&1
echo DONE >> /tmp/timing.txt
