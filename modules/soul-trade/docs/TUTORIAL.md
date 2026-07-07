# Soul-Trade — Tutorial (đi từng bước)

Giả sử module đã cài (xem `INTEGRATION.md`) và host chạy ở `http://localhost:3001`.
Thay `$TOKEN` bằng JWT của bạn. Module mount ở `/api/v1/soul-trade`.

## 0. Chuẩn bị
```bash
API=http://localhost:3001/api/v1/soul-trade
H="-H Authorization:Bearer $TOKEN -H Content-Type:application/json"
```

## 1. Tạo một bot paper (không cần key)
```bash
curl $H -X POST $API/trade/bots -d '{
  "name":"main","exchange":"bybit","market_type":"swap",
  "symbols":["BTC/USDT:USDT"],"strategy":"rsi_ema","mode":"paper"
}'
# → { "id":"…","name":"main" }
```
Xem lại:
```bash
curl $H $API/trade/bots
# → [ { "name":"main","exchange":"bybit","strategy":"rsi_ema","mode":"paper","status":"idle","equity":0,… } ]
```

## 2. Backtest trên dữ liệu THẬT
```bash
curl $H -X POST $API/trade/backtest -d '{
  "strategy":"donchian_breakout","symbol":"BTC/USDT:USDT",
  "timeframe":"1h","exchange":"binance","candles":1500
}'
# → { "metrics":{ "numTrades":…, "winRate":…, "profitFactor":…, "maxDrawdown":…, "sharpe":… }, "trades":… }
```
Không có mạng? đổi `"exchange":"synthetic"`.

## 3. Walk-forward (chống overfit)
```bash
curl $H -X POST $API/trade/walkforward -d '{
  "strategy":"donchian_breakout","symbol":"BTC/USDT:USDT","exchange":"binance",
  "candles":2000,"is_bars":500,"oos_bars":150,"grid":{"channel":[10,20,30]}
}'
# → { "aggregate":{ "windows":10,"oos_total_return":…,"oos_trades":…,"oos_win_rate":…,"oos_max_drawdown":… },
#     "windows":[ { "window":1,"best_params":{"channel":20},"oos_return":… }, … ] }
```
Chỉ tin `aggregate.oos_*` — đó là hiệu suất bạn KHÔNG tối ưu lên.

## 4. Gắn não riêng + agent + local model
Cập nhật bot để chạy 2 agent, một con dùng model local (Ollama):
```bash
curl $H -X POST $API/trade/bots -d '{
  "name":"ai-bot","exchange":"bybit","symbols":["BTC/USDT:USDT"],"strategy":"rsi_ema","mode":"paper",
  "llm":{ "agents":[
    { "name":"signal-agent","enabled":true,"role":"technical analyst",
      "systemPrompt":"Judge trend + momentum.","llm":{"model":"cc/claude-sonnet-4-6"} },
    { "name":"risk-agent","enabled":true,"role":"risk manager",
      "systemPrompt":"Veto in dangerous volatility.","llm":{"baseUrl":"http://localhost:11434/v1","model":"llama3.1"} }
  ]}
}'
```

## 5. Chạy một lượt đánh giá (ghi trí nhớ)
```bash
curl $H -X POST $API/trade/bots/ai-bot/evaluate -d '{ "use_agents": true }'
# → { "symbol":"BTC/USDT:USDT","finalAction":"long|short|flat","sizeMult":…,"note":"… · agents long(0.7)","decisionId":"…" }
```

## 6. Đọc trí nhớ, phân tích, hồi tưởng
```bash
# các lượt gần đây (trí nhớ)
curl $H "$API/trade/bots/ai-bot/memory?limit=10"

# phân tích tổng lượt trade
curl $H $API/trade/bots/ai-bot/analytics
# → { "total_trades":…,"win_rate":…,"profit_factor":…,"total_pnl":…,"avg_r":…,"turns_by_action":{…} }

# đóng góp từng agent
curl $H $API/trade/bots/ai-bot/agents
# → [ { "name":"signal-agent","votes":…,"agreement":0.83 }, … ]

# hồi tưởng ngữ nghĩa: tình huống tương tự trong quá khứ
curl $H "$API/trade/bots/ai-bot/recall?query=BTC%20breakout%20strong%20uptrend&limit=5"
# → [ { "symbol":…,"final_action":…,"note":…,"similarity":0.89,"created_at":… }, … ]
```

## 7. Bật/dừng bot
```bash
curl $H -X POST $API/trade/bots/ai-bot/start
curl $H -X POST $API/trade/bots/ai-bot/stop
```

## 8. Bảo Tiểu Tâm làm thay (tiếng Việt)
- "Tạo bot scalp trên bybit chiến lược donchian cặp BTC chế độ paper"
- "Backtest donchian trên BTC khung 1h 1500 nến của binance"
- "Bot ai-bot thắng bao nhiêu %?"  ·  "Agent nào của ai-bot tốt nhất?"
- "ai-bot trước đây gặp tình huống BTC breakout tăng mạnh chưa?"  → recall
- "Chạy bot ai-bot"  ·  "Dừng bot ai-bot lại"

## 9. Lên live
Tạo bot `mode:"live"` kèm key (Read + Trade). `LiveExecutor` đặt lệnh thật + SL/TP reduce-only.
Backtest + walk-forward + paper trước đã. Xem `GUIDE.md §8–9`.
