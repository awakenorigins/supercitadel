import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { AppError, type JwtPayload } from '@citadel/core';
import { getBalance, listTransactions, topup, spend } from './service.js';
declare module 'hono' { interface ContextVariableMap { auth: JwtPayload; } }
const orgOf = (c: any) => (c.get('auth') as JwtPayload).orgId;

type AuditFn = (c: Context, e: { action: string; resource?: string; resourceId?: string; detail?: unknown }) => Promise<void>;

export function buildOmRoutes(deps: {
  db: any; requireAuth: MiddlewareHandler;
  audit?: AuditFn;
  /** Gate hành động nhạy cảm (V7A P1): chi Om > ngưỡng đòi bảo mật lớp 2 — throw 403 nếu chưa đủ. */
  sensitiveGate?: (c: Context, amount: number) => Promise<void>;
}) {
  const r = new Hono();
  r.onError((err, c) => err instanceof AppError ? c.json(err.toJSON(), err.status as 400) : c.json({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống' } }, 500));
  r.use('*', deps.requireAuth);
  r.get('/balance', async (c) => c.json({ balance: await getBalance(deps.db, orgOf(c)) }));
  r.get('/transactions', async (c) => c.json({ transactions: await listTransactions(deps.db, orgOf(c)) }));
  r.post('/topup', async (c) => {
    const b = await c.req.json().catch(()=>({}));
    const res = await topup(deps.db, orgOf(c), Number(b.amount ?? 0));
    await deps.audit?.(c, { action: 'om.topup', resource: 'om_ledger', resourceId: res.transaction?.id, detail: { amount: Number(b.amount ?? 0) } });
    return c.json(res);
  });
  // Chi Om (V7A P1) — chi > ngưỡng nhạy cảm đòi bảo mật lớp 2
  r.post('/spend', async (c) => {
    const b = await c.req.json().catch(()=>({}));
    const amount = Number(b.amount ?? 0);
    await deps.sensitiveGate?.(c, amount);
    const res = await spend(deps.db, orgOf(c), amount, String(b.reason ?? 'Chi Om'), b.module ? String(b.module) : undefined);
    await deps.audit?.(c, { action: 'om.spend', resource: 'om_ledger', resourceId: res.transaction?.id, detail: { amount, reason: b.reason } });
    return c.json(res);
  });
  return r;
}
