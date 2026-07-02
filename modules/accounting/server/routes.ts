import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { AppError, type JwtPayload } from '@citadel/core';
import { seedChart, listAccounts, createJournal, createInvoice, listInvoices, createPayment, listPayments, cancelVoucher, listVouchers, voucherType } from './service.js';
import { generalLedger, trialBalance, profitLoss, partyOutstanding, accountBalance } from './reports.js';
declare module 'hono' { interface ContextVariableMap { auth: JwtPayload; } }
const orgOf = (c: any) => (c.get('auth') as JwtPayload).orgId;
const q = (c: any, k: string, dft: string) => c.req.query(k) ?? dft;
const today = () => new Date().toISOString().slice(0, 10);

type AuditFn = (c: Context, e: { action: string; resource?: string; resourceId?: string; detail?: unknown }) => Promise<void>;

export function buildAccountingRoutes(deps: {
  db: any; requireAuth: MiddlewareHandler; gate?: MiddlewareHandler;
  audit?: AuditFn;
  /** Gate nhạy cảm (V7A P1): hủy phiếu thu/chi (tiền đã vào sổ) đòi bảo mật lớp 2. */
  cancelGate?: (c: Context, kind: string) => Promise<void>;
}) {
  const r = new Hono();
  r.onError((err, c) => err instanceof AppError ? c.json(err.toJSON(), err.status as 400) : (console.error('[acc]', err), c.json({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống' } }, 500)));
  r.use('*', deps.requireAuth);
  if (deps.gate) r.use('*', deps.gate);

  r.post('/chart/seed', async (c) => c.json({ accounts: await seedChart(deps.db, orgOf(c)) }, 201));
  r.get('/accounts', async (c) => c.json({ accounts: await listAccounts(deps.db, orgOf(c)) }));
  r.get('/accounts/:number/balance', async (c) => c.json(await accountBalance(deps.db, orgOf(c), c.req.param('number'))));

  r.post('/journal', async (c) => { const b = await c.req.json().catch(() => ({})); return c.json({ voucher: await createJournal(deps.db, orgOf(c), b) }, 201); });
  r.get('/vouchers', async (c) => c.json({ vouchers: await listVouchers(deps.db, orgOf(c)) }));
  r.post('/vouchers/:id/cancel', async (c) => {
    const id = c.req.param('id');
    const kind = await voucherType(deps.db, orgOf(c), id);
    await deps.cancelGate?.(c, kind);
    const voucher = await cancelVoucher(deps.db, orgOf(c), id);
    await deps.audit?.(c, { action: 'acc.voucher.cancel', resource: 'voucher', resourceId: id, detail: { voucherType: kind } });
    return c.json({ voucher });
  });

  r.post('/invoices', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const invoice = await createInvoice(deps.db, orgOf(c), b);
    await deps.audit?.(c, { action: 'acc.invoice.create', resource: 'invoice', resourceId: invoice.id, detail: { type: invoice.invoiceType, grandTotal: invoice.grandTotal } });
    return c.json({ invoice }, 201);
  });
  r.get('/invoices', async (c) => c.json({ invoices: await listInvoices(deps.db, orgOf(c), c.req.query('type')) }));

  r.post('/payments', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const payment = await createPayment(deps.db, orgOf(c), b);
    await deps.audit?.(c, { action: 'acc.payment.create', resource: 'payment', resourceId: payment.id, detail: { type: payment.paymentType, amount: payment.amount } });
    return c.json({ payment }, 201);
  });
  r.get('/payments', async (c) => c.json({ payments: await listPayments(deps.db, orgOf(c)) }));

  r.get('/reports/general-ledger', async (c) => c.json(await generalLedger(deps.db, orgOf(c), q(c, 'account', '111'), q(c, 'from', '1970-01-01'), q(c, 'to', today()))));
  r.get('/reports/trial-balance', async (c) => c.json(await trialBalance(deps.db, orgOf(c), q(c, 'from', '1970-01-01'), q(c, 'to', today()))));
  r.get('/reports/profit-loss', async (c) => c.json(await profitLoss(deps.db, orgOf(c), q(c, 'from', '1970-01-01'), q(c, 'to', today()))));
  r.get('/reports/outstanding', async (c) => c.json(await partyOutstanding(deps.db, orgOf(c), (c.req.query('type') as any) ?? 'sales')));
  return r;
}
