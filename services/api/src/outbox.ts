import { Hono, type MiddlewareHandler } from 'hono';
import { and, eq, isNotNull, isNull, gte, sql } from 'drizzle-orm';
import { AppError, type JwtPayload, validateOutboxTopic } from '@citadel/core';
import { outboxEvents } from '@citadel/db';
import { publishEvent } from '@citadel/module-chat/server/emit.js';
import { eventHandlers as notificationEventHandlers } from '@citadel/module-notification/server/events.js';

type DB = any;
export type OutboxHandler = (event: any, deps: { db: DB }) => Promise<void> | void;
const subscribers: { pattern: string; handler: OutboxHandler }[] = [];
let dispatcherStarted = false;
const match = (pattern: string, topic: string) => pattern.endsWith('.*') ? topic.startsWith(pattern.slice(0, -1)) : pattern === topic;

export function subscribeOutbox(topicPattern: string, handler: OutboxHandler) {
  if (!validateOutboxTopic(topicPattern)) throw new Error(`Topic subscribe sai format: ${topicPattern}`);
  subscribers.push({ pattern: topicPattern, handler });
}

export async function dispatchOutboxOnce(db: DB, limit = 20) {
  const events = await db.transaction(async (tx: DB) => {
    const rows = await tx.select().from(outboxEvents)
      .where(and(isNull(outboxEvents.dispatchedAt), sql`${outboxEvents.attempts} < 5`))
      .orderBy(outboxEvents.createdAt).limit(limit).for('update', { skipLocked: true } as any);
    return rows;
  });
  for (const ev of events) {
    const handlers = subscribers.filter((s) => match(s.pattern, ev.topic)).map((s) => s.handler);
    try {
      for (const h of handlers) await h(ev, { db });
      await db.update(outboxEvents).set({ dispatchedAt: new Date(), lastError: null }).where(eq(outboxEvents.id, ev.id));
    } catch (e: any) {
      await db.update(outboxEvents).set({ attempts: (ev.attempts ?? 0) + 1, lastError: String(e?.message ?? e).slice(0, 2000) }).where(eq(outboxEvents.id, ev.id));
      console.error('[outbox] handler lỗi nhưng dispatcher vẫn sống', ev.topic, e?.message ?? e);
    }
  }
  return { claimed: events.length };
}

export function registerBuiltinOutboxSubscribers(db: DB) {
  if ((globalThis as any).__citadelOutboxBuiltin) return;
  (globalThis as any).__citadelOutboxBuiltin = true;
  for (const [topic, handler] of Object.entries(notificationEventHandlers)) subscribeOutbox(topic, handler as OutboxHandler);
  subscribeOutbox('accounting.*', async (ev) => { await publishEvent({ type: 'module:event' as any, orgId: ev.orgId, payload: { topic: ev.topic, payload: ev.payload }, ts: Date.now() }); });
  subscribeOutbox('om.*', async (ev) => { await publishEvent({ type: 'module:event' as any, orgId: ev.orgId, payload: { topic: ev.topic, payload: ev.payload }, ts: Date.now() }); });
  subscribeOutbox('hr.*', async (ev) => { await publishEvent({ type: 'module:event' as any, orgId: ev.orgId, payload: { topic: ev.topic, payload: ev.payload }, ts: Date.now() }); });
}

export function startOutboxDispatcher(db: DB) {
  if (dispatcherStarted || process.env.CITADEL_DISABLE_OUTBOX === '1') return;
  dispatcherStarted = true;
  setInterval(() => dispatchOutboxOnce(db).catch((e) => console.error('[outbox] dispatcher loop lỗi', e)), 2_000).unref?.();
}

export function buildOutboxRoutes(deps: { db: DB; requireAuth: MiddlewareHandler }) {
  const r = new Hono();
  r.use('*', deps.requireAuth);
  r.use('*', async (c, next) => {
    const a = c.get('auth') as JwtPayload;
    if (!['owner','super_admin'].includes(a.role)) throw new AppError('FORBIDDEN' as any, 'Chỉ owner được xem outbox', 403);
    await next();
  });
  r.get('/events', async (c) => {
    const a = c.get('auth') as JwtPayload;
    const status = c.req.query('status') ?? 'pending';
    const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 50)));
    const conds: any[] = [eq(outboxEvents.orgId, a.orgId)];
    if (status === 'pending') conds.push(isNull(outboxEvents.dispatchedAt), sql`${outboxEvents.attempts} < 5`);
    else if (status === 'failed') conds.push(isNull(outboxEvents.dispatchedAt), gte(outboxEvents.attempts, 5));
    else if (status === 'dispatched') conds.push(isNotNull(outboxEvents.dispatchedAt));
    const events = await deps.db.select().from(outboxEvents).where(and(...conds)).orderBy(outboxEvents.createdAt).limit(limit);
    return c.json({ events });
  });
  r.get('/stats', async (c) => {
    const a = c.get('auth') as JwtPayload;
    const [row] = await deps.db.select({
      pending: sql<number>`count(*) filter (where dispatched_at is null and attempts < 5)::int`,
      failed: sql<number>`count(*) filter (where dispatched_at is null and attempts >= 5)::int`,
      dispatched: sql<number>`count(*) filter (where dispatched_at is not null)::int`,
    }).from(outboxEvents).where(eq(outboxEvents.orgId, a.orgId));
    return c.json({ stats: row });
  });
  return r;
}
