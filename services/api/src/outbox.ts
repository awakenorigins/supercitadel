import { Hono, type MiddlewareHandler } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import { AppError, dispatchOutboxBatch, canViewOutboxFailure, type JwtPayload, type OutboxHandler as CoreHandler, validateOutboxTopic } from '@citadel/core';
import { outboxEvents } from '@citadel/db';
import { publishEvent } from '@citadel/module-chat/server/emit.js';
import { eventHandlers as notificationEventHandlers } from '@citadel/module-notification/server/events.js';
import { createPostgresOutboxStore } from './outbox-store.js';

type DB = any;
export type OutboxHandler = (event: any, deps: { db: DB }) => Promise<void> | void;
const subscribers: { pattern: string; handler: OutboxHandler }[] = [];
let dispatcherStarted = false;
const match = (pattern: string, topic: string) => pattern.endsWith('.*') ? topic.startsWith(pattern.slice(0, -1)) : pattern === topic;

export function subscribeOutbox(topicPattern: string, handler: OutboxHandler) {
  if (!validateOutboxTopic(topicPattern)) throw new Error(`Topic subscribe sai format: ${topicPattern}`);
  subscribers.push({ pattern: topicPattern, handler });
}

export async function dispatchOutboxOnce(db: DB, limit = 20, now = new Date()) {
  const handlers = new Map<string, CoreHandler>();
  // Resolve wildcard subscriptions after claim while retaining the shared retry/dead-letter engine.
  const store = createPostgresOutboxStore(db);
  const claimed = await store.claim(limit, now);
  for (const ev of claimed) handlers.set(ev.topic, async (event) => {
    const matched = subscribers.filter((s) => match(s.pattern, event.topic));
    if (!matched.length) throw new Error(`OUTBOX_HANDLER_MISSING: ${event.topic}`);
    for (const s of matched) await s.handler(event, { db });
  });
  const replayStore = { ...store, claim: async () => claimed };
  return dispatchOutboxBatch(replayStore, handlers, { limit, now });
}

export function registerBuiltinOutboxSubscribers() {
  if ((globalThis as any).__citadelOutboxBuiltin) return;
  (globalThis as any).__citadelOutboxBuiltin = true;
  for (const [topic, handler] of Object.entries(notificationEventHandlers)) subscribeOutbox(topic, handler as OutboxHandler);
  for (const pattern of ['accounting.*','om.*','hr.*']) subscribeOutbox(pattern, async (ev) => {
    await publishEvent({ type: 'module:event' as any, orgId: ev.orgId, payload: { topic: ev.topic, payload: ev.payload }, ts: Date.now() });
  });
}

export function startOutboxDispatcher(db: DB) {
  if (dispatcherStarted || process.env.CITADEL_DISABLE_OUTBOX === '1') return () => {};
  registerBuiltinOutboxSubscribers(); dispatcherStarted = true;
  const timer = setInterval(() => dispatchOutboxOnce(db).catch((e) => console.error('[outbox] dispatcher loop lỗi', e)), 2_000);
  timer.unref?.();
  return () => { clearInterval(timer); dispatcherStarted = false; };
}

export function buildOutboxRoutes(deps: { db: DB; requireAuth: MiddlewareHandler }) {
  const r = new Hono(); r.use('*', deps.requireAuth);
  r.get('/events', async (c) => {
    const a = c.get('auth') as JwtPayload;
    const status = c.req.query('status') ?? 'pending';
    const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 50)));
    const conds: any[] = [eq(outboxEvents.orgId, a.orgId)];
    if (status) conds.push(eq(outboxEvents.status, status));
    const events = await deps.db.select().from(outboxEvents).where(and(...conds)).orderBy(outboxEvents.createdAt).limit(limit);
    const visible = ['owner','super_admin'].includes(a.role) ? events : events.filter((e:any) => canViewOutboxFailure(e, a));
    return c.json({ events: visible });
  });
  r.get('/stats', async (c) => {
    const a = c.get('auth') as JwtPayload;
    if (!['owner','super_admin'].includes(a.role)) throw new AppError('FORBIDDEN' as any, 'Chỉ owner được xem thống kê outbox', 403);
    const [row] = await deps.db.select({
      pending: sql<number>`count(*) filter (where status = 'pending')::int`, failed: sql<number>`count(*) filter (where status = 'failed')::int`,
      processing: sql<number>`count(*) filter (where status = 'processing')::int`, dispatched: sql<number>`count(*) filter (where status = 'dispatched')::int`,
    }).from(outboxEvents).where(eq(outboxEvents.orgId, a.orgId));
    return c.json({ stats: row });
  });
  return r;
}
