// Notification routes — Hono, deps injection (db, requireAuth) per the proven chat pattern.
import { Hono, type MiddlewareHandler } from 'hono';
import { AppError, type JwtPayload } from '@citadel/core';
import { listNotifications, markNotifRead, markAllRead } from './service.js';

declare module 'hono' {
  interface ContextVariableMap { auth: JwtPayload; }
}
const orgOf = (c: any) => (c.get('auth') as JwtPayload).orgId;

export function buildNotificationRoutes(deps: { db: any; requireAuth: MiddlewareHandler }) {
  const r = new Hono();
  r.onError((err, c) => {
    if (err instanceof AppError) return c.json(err.toJSON(), err.status as 400);
    console.error('[notif] unhandled', err);
    return c.json({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống' } }, 500);
  });
  r.use('*', deps.requireAuth);

  r.get('/', async (c) => {
    const auth = c.get('auth') as JwtPayload;
    const unread = c.req.query('unread') === 'true';
    return c.json({ notifications: await listNotifications(deps.db, orgOf(c), auth.sub, unread) });
  });
  r.put('/:id/read', async (c) => {
    const auth = c.get('auth') as JwtPayload;
    return c.json(await markNotifRead(deps.db, orgOf(c), auth.sub, c.req.param('id')));
  });
  r.put('/read-all', async (c) => {
    const auth = c.get('auth') as JwtPayload;
    return c.json(await markAllRead(deps.db, orgOf(c), auth.sub));
  });
  return r;
}
