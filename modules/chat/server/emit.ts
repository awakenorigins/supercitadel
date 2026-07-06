// Emit bridge — api publishes WS events to the ws service via internal HTTP.
import type { WsEvent } from '@citadel/core';

const WS_INTERNAL = process.env.WS_INTERNAL_URL ?? 'http://ws:3002';

export async function publishEvent(ev: WsEvent): Promise<void> {
  try {
    await fetch(`${WS_INTERNAL}/internal/publish`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ev),
    });
  } catch (e) {
    console.error('[chat.emit] publish failed (non-fatal)', (e as Error).message);
  }
}
