#!/usr/bin/env bash
set -e
JWT="$(cat /root/.openclaw/workspace/.jwt.txt)"
BASE="https://supercitadellab.62.146.238.213.sslip.io/api/v1/soul-trade"
BOT="${1:-RSI}"
auth=(-H "Authorization: Bearer $JWT" -H "Content-Type: application/json")
jqget() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }

echo "=== clean: xoá hết order cũ ==="
IDS=$(curl -s "$BASE/trade/bots/$BOT/automato/orders" "${auth[@]}" | python3 -c "import sys,json;[print(o['id']) for o in json.load(sys.stdin).get('orders',[])]" 2>/dev/null || true)
for id in $IDS; do curl -s -X DELETE "$BASE/trade/bots/$BOT/automato/orders/$id" "${auth[@]}" >/dev/null; done

echo "=== add 3 lệnh: BTC long 10x, ETH short 5x, SOL auto 20x ==="
O1=$(curl -s -X POST "$BASE/trade/bots/$BOT/automato/orders" "${auth[@]}" -d '{"symbol":"BTC/USDT","side":"long","leverage":10,"tp_pct":0.5,"sl_pct":0.3,"risk_pct":1,"sim_capital":1000}' | jqget "d['id']")
O2=$(curl -s -X POST "$BASE/trade/bots/$BOT/automato/orders" "${auth[@]}" -d '{"symbol":"ETH/USDT","side":"short","leverage":5,"tp_pct":0.5,"sl_pct":0.3,"risk_pct":1,"sim_capital":1000}' | jqget "d['id']")
O3=$(curl -s -X POST "$BASE/trade/bots/$BOT/automato/orders" "${auth[@]}" -d '{"symbol":"SOL/USDT","side":"auto","leverage":20,"tp_pct":0.5,"sl_pct":0.3,"risk_pct":1,"sim_capital":1000}' | jqget "d['id']")
echo "orders: $O1 $O2 $O3"

echo "=== arm cả 3 ==="
for id in $O1 $O2 $O3; do curl -s -X POST "$BASE/trade/bots/$BOT/automato/orders/$id/arm" "${auth[@]}" >/dev/null; done

echo "=== test min 0,1%: thử set TP=0 (phải bị chặn về 0.1) ==="
curl -s -X POST "$BASE/trade/bots/$BOT/automato/orders/$O1" "${auth[@]}" -d '{"tp_pct":0}' | jqget "'tp_pct sau khi set 0 = '+str(d.get('tp_pct'))"

echo "=== đợi 22s (KHÔNG mở UI) cho worker nền tick ==="
sleep 22

echo "=== trạng thái 3 lệnh (mỗi lệnh có mở vị thế không?) ==="
curl -s "$BASE/trade/bots/$BOT/automato/orders" "${auth[@]}" | python3 -c "
import sys,json
d=json.load(sys.stdin)
opened=0
for o in d.get('orders',[]):
    p=o.get('openPosition')
    st='LIVE '+o['side']+' pnl='+format(p.get('pnlPct',0),'.3f')+'%' if p else o.get('uiPhase','?')
    if p: opened+=1
    print(f\"  slot{o['slot']} {o['symbol']:9} {o['side']:5} {o['leverage']:>3}x TP{o['tp_pct']} SL{o['sl_pct']} armed={o['armed']} -> {st}\")
print(f'RESULT: {opened}/{len(d.get(\"orders\",[]))} lệnh đã mở vị thế nền')
"
