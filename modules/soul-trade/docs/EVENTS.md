# Soul-Trade — Events

Module phát sự kiện qua `host.bus.emit(name, payload)` (outbox của host nếu có; không thì
no-op, không chặn nghiệp vụ). Đăng ký ở phía host giống các module khác.

## Lifecycle
| Event | Khi nào | Payload |
|---|---|---|
| `trade.module.installed` | sau khi chạy migrations (`onInstall`) | `{ version }` |
| `trade.module.activated` | sau khi đăng ký tool/intent (`onActivate`) | `{}` |
| `trade.module.disabled` | khi tắt module (`onDisable`) | `{}` |
| `trade.module.removed` | khi gỡ module (`onRemove`) | `{}` |

## Nghiệp vụ (khai báo trong `manifest.json#events.emits`)
| Event | Khi nào | Payload gợi ý |
|---|---|---|
| `trade.bot.created` | tạo bot mới | `{ org_id, bot, exchange, strategy, mode }` |
| `trade.turn.evaluated` | chạy xong một lượt đánh giá | `{ org_id, bot, symbol, final_action, size_mult }` |
| `trade.trade.opened` | mở vị thế (paper/live) | `{ org_id, bot, symbol, direction, entry, size }` |
| `trade.trade.closed` | đóng vị thế | `{ org_id, bot, symbol, pnl, r, reason }` |

> `BotRunner` (src/runner.ts) PHÁT các event này qua `cfg.onEvent` mỗi tick:
> `turn` → `trade.turn.evaluated`, `open` → `trade.trade.opened`, `close` → `trade.trade.closed`,
> cộng thêm `kill_switch` và `error`. Host nối `onEvent` vào `bus.emit` (một dòng — xem
> INTEGRATION §6); lõi module giữ thuần để test offline.

## Gợi ý subscriber
- **notification module** → đẩy fill/kill-switch vào chat.
- **ws service** → phát realtime lên dashboard `/soul-trade` (feed hoạt động).
- **analytics rollup** → cập nhật số liệu tổng khi `trade.trade.closed`.

## Nối vào ws (realtime dashboard)
Trong background worker, sau mỗi lượt:
```ts
await bus.emit('trade.turn.evaluated', { org_id, bot: bot.name, symbol, final_action, size_mult });
// ws service (Redis pub/sub) phát cho client đang mở /soul-trade
```
