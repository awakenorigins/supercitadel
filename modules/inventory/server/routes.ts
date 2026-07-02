import { Hono, type MiddlewareHandler } from 'hono';
import { AppError, type JwtPayload } from '@citadel/core';
import { listItems, createItem, adjustQty, lowStock, updateItem } from './service.js';
declare module 'hono' { interface ContextVariableMap { auth: JwtPayload; } }
const orgOf = (c: any) => (c.get('auth') as JwtPayload).orgId;
export function buildInventoryRoutes(deps: { db: any; requireAuth: MiddlewareHandler; gate?: MiddlewareHandler }) {
  const r = new Hono();
  r.onError((err, c) => err instanceof AppError ? c.json(err.toJSON(), err.status as 400) : (console.error('[inv]', err), c.json({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống' } }, 500)));
  r.use('*', deps.requireAuth);
  if (deps.gate) r.use('*', deps.gate);
  r.get('/items', async (c) => c.json({ items: await listItems(deps.db, orgOf(c)) }));
  r.post('/items', async (c) => { const b = await c.req.json().catch(() => ({})); return c.json({ item: await createItem(deps.db, orgOf(c), b) }, 201); });
  r.patch('/items/:id/qty', async (c) => { const b = await c.req.json().catch(() => ({})); return c.json({ item: await adjustQty(deps.db, orgOf(c), c.req.param('id'), Number(b.delta ?? 0)) }); });
  r.patch('/items/:id', async (c) => { const b = await c.req.json().catch(() => ({})); return c.json({ item: await updateItem(deps.db, orgOf(c), c.req.param('id'), b) }); });
  r.get('/low-stock', async (c) => c.json({ items: await lowStock(deps.db, orgOf(c)) }));
  return r;
}
