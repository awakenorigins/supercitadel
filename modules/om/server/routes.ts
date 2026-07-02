import { Hono, type MiddlewareHandler } from 'hono';
import { AppError, type JwtPayload } from '@citadel/core';
import { getBalance, listTransactions, topup } from './service.js';
declare module 'hono' { interface ContextVariableMap { auth: JwtPayload; } }
const orgOf = (c: any) => (c.get('auth') as JwtPayload).orgId;
export function buildOmRoutes(deps: { db: any; requireAuth: MiddlewareHandler }) {
  const r = new Hono();
  r.onError((err, c) => err instanceof AppError ? c.json(err.toJSON(), err.status as 400) : c.json({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống' } }, 500));
  r.use('*', deps.requireAuth);
  r.get('/balance', async (c) => c.json({ balance: await getBalance(deps.db, orgOf(c)) }));
  r.get('/transactions', async (c) => c.json({ transactions: await listTransactions(deps.db, orgOf(c)) }));
  r.post('/topup', async (c) => { const b = await c.req.json().catch(()=>({})); return c.json(await topup(deps.db, orgOf(c), Number(b.amount ?? 0))); });
  return r;
}
