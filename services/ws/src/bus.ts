// Event bus — pub/sub over org-scoped channels.
// Dev: in-memory. Prod: swap to Redis with same interface (REDIS_URL).
import { EventEmitter } from 'node:events';
import type { WsEvent } from '@citadel/core';

export interface EventBus {
  publish(orgId: string, ev: WsEvent): Promise<void>;
  subscribe(orgId: string, fn: (ev: WsEvent) => void): () => void;
}

/** In-memory bus — single-process only. Fine for dev & single-node deploy. */
export class MemoryBus implements EventBus {
  private emitter = new EventEmitter();
  constructor() { this.emitter.setMaxListeners(0); }
  async publish(orgId: string, ev: WsEvent): Promise<void> {
    this.emitter.emit(`org:${orgId}`, ev);
  }
  subscribe(orgId: string, fn: (ev: WsEvent) => void): () => void {
    const ch = `org:${orgId}`;
    this.emitter.on(ch, fn);
    return () => this.emitter.off(ch, fn);
  }
}

/** Factory — Redis when REDIS_URL set AND ioredis available; else memory.
 *  (Redis path kept thin; wired fully when scaling beyond one node.) */
export function createBus(): EventBus {
  // For now always memory; Redis adapter is a drop-in with same interface.
  // Marked for re-verify on multi-node deploy (RPI risk R5).
  return new MemoryBus();
}
