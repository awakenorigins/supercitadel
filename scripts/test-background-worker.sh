#!/bin/bash
# Test worker nền: ARM automato → KHÔNG gọi API position/UI trong 90s → soi log backend
# xem có tick/entry mới sinh trong lúc "web tắt" không. Ghi /tmp/bgworker.txt
read -r JWT < /root/.openclaw/workspace/.jwt.txt
B="http://127.0.0.1:3011/api/v1/soul-trade/trade/bots/RSI"
H="Authorization: Bearer $JWT"
{
echo "== $(date -u +%H:%M:%S) start bot + arm automato"
curl -s -X POST "$B/start" -H "$H" -o /dev/null -w "start: %{http_code}\n"
curl -s -X POST "$B/automato/arm" -H "$H" -o /dev/null -w "arm: %{http_code}\n"
echo "== log ngay sau arm:"
curl -s "$B/automato/log?limit=3" -H "$H" | python3 -c "
import sys,json
d=json.load(sys.stdin)
rows=d if isinstance(d,list) else d.get('log',d.get('entries',[]))
for e in rows[:3]: print(' ', e.get('created_at',''), e.get('kind',''), str(e.get('message',''))[:70])"
echo "== NGỦ 90 GIÂY — KHÔNG gọi bất kỳ API automato nào (giả lập tắt web)"
sleep 90
echo "== $(date -u +%H:%M:%S) tỉnh dậy, soi log:"
curl -s "$B/automato/log?limit=10" -H "$H" | python3 -c "
import sys,json,datetime
d=json.load(sys.stdin)
rows=d if isinstance(d,list) else d.get('log',d.get('entries',[]))
for e in rows[:10]: print(' ', e.get('created_at',''), e.get('kind',''), str(e.get('message',''))[:70])"
echo "== position hiện tại:"
curl -s "$B/automato/position" -H "$H" | python3 -c "
import sys,json
p=json.load(sys.stdin)
print('  phase:', p.get('phase'), '| openPosition:', bool(p.get('openPosition')), '| pnlPct:', p.get('pnlPct'))
op=p.get('openPosition')
if op: print('  entry:', op.get('entry'), 'side:', op.get('side'), 'openedAt:', op.get('openedAt'), 'updatedAt:', op.get('updatedAt'))"
echo "== docker log api (automato worker):"
docker logs supercitadellab-api-1 --since 3m 2>&1 | grep -i "automato\|worker\|tick" | tail -5
echo "== dọn: disarm + stop"
curl -s -X POST "$B/automato/disarm" -H "$H" -o /dev/null -w "disarm: %{http_code}\n"
} > /tmp/bgworker.txt 2>&1
echo FINISHED >> /tmp/bgworker.txt
