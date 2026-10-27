// CRM routes — Hono, deps injection (db, requireAuth) per proven pattern.
import { Hono, type MiddlewareHandler } from 'hono';
import { AppError, type JwtPayload } from '@citadel/core';
import { createContact, listContacts, createDeal, listDeals, moveDealStage, crmStats } from './service.js';

declare module 'hono' { interface ContextVariableMap { auth: JwtPayload; } }
const orgOf = (c: any) => (c.get('auth') as JwtPayload).orgId;

export function buildCrmRoutes(deps: { db: any; requireAuth: MiddlewareHandler; gate?: MiddlewareHandler }) {
  const r = new Hono();
  r.onError((err, c) => {
    if (err instanceof AppError) return c.json(err.toJSON(), err.status as 400);
    console.error('[crm] unhandled', err);
    return c.json({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống' } }, 500);
  });
  r.use('*', deps.requireAuth);
  if (deps.gate) r.use('*', deps.gate);

  r.get('/contacts', async (c) => c.json({ contacts: await listContacts(deps.db, orgOf(c)) }));
  r.post('/contacts', async (c) => { const b = await c.req.json().catch(()=>({})); return c.json({ contact: await createContact(deps.db, orgOf(c), b) }, 201); });
  r.get('/deals', async (c) => c.json({ deals: await listDeals(deps.db, orgOf(c)) }));
  r.post('/deals', async (c) => { const b = await c.req.json().catch(()=>({})); return c.json({ deal: await createDeal(deps.db, orgOf(c), b) }, 201); });
  r.patch('/deals/:id/stage', async (c) => { const b = await c.req.json().catch(()=>({})); return c.json({ deal: await moveDealStage(deps.db, orgOf(c), c.req.param('id'), String(b.stage ?? '')) }); });
  r.get('/stats', async (c) => c.json(await crmStats(deps.db, orgOf(c))));
  return r;
}
