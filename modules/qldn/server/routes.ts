/**
 * QLDN V1A — Hono route factory (F1 skeleton).
 * Mount: /api/v1/qldn (loader đọc từ manifest.routes).
 * F2+: timesheets, payroll, commission, payout, forecast.
 */
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { AppError, type JwtPayload } from '@citadel/core';
import {
  listPeriods, createPeriod, closePeriod,
  listPolicyParams, createPolicyParams, effectivePolicyParams,
  listEmployees, createEmployee, updateEmployee,
} from './service.js';

declare module 'hono' { interface ContextVariableMap { auth: JwtPayload } }
const orgOf = (c: any) => (c.get('auth') as JwtPayload).orgId;
type AuditFn = (c: Context, e: { action: string; resource?: string; resourceId?: string; detail?: unknown }) => Promise<void>;

export function buildQldnRoutes(deps: { db: any; requireAuth: MiddlewareHandler; gate?: MiddlewareHandler; audit?: AuditFn }) {
  const r = new Hono();
  r.onError((err, c) => err instanceof AppError
    ? c.json(err.toJSON(), err.status as 400)
    : (console.error('[qldn]', err), c.json({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống' } }, 500)));
  r.use('*', deps.requireAuth);
  if (deps.gate) r.use('*', deps.gate);

  r.get('/health', (c) => c.json({ module: 'qldn', ok: true, version: '1.0.0' }));

  // ── Kỳ lương ──
  r.get('/periods', async (c) => c.json({ periods: await listPeriods(deps.db, orgOf(c)) }));
  r.post('/periods', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const period = await createPeriod(deps.db, orgOf(c), b);
    await deps.audit?.(c, { action: 'qldn.period.create', resource: 'period', resourceId: period.id, detail: { code: period.code } });
    return c.json({ period }, 201);
  });
  r.post('/periods/:id/close', async (c) => {
    const period = await closePeriod(deps.db, orgOf(c), c.req.param('id'));
    await deps.audit?.(c, { action: 'qldn.period.close', resource: 'period', resourceId: period.id });
    return c.json({ period });
  });

  // ── Tham số chính sách (BHXH/thuế/giảm trừ — version hóa) ──
  r.get('/policy-params', async (c) => c.json({ policyParams: await listPolicyParams(deps.db, orgOf(c)) }));
  r.get('/policy-params/effective', async (c) => {
    const date = c.req.query('date') ?? new Date().toISOString().slice(0, 10);
    return c.json({ policyParams: await effectivePolicyParams(deps.db, orgOf(c), date), date });
  });
  r.post('/policy-params', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const row = await createPolicyParams(deps.db, orgOf(c), b);
    await deps.audit?.(c, { action: 'qldn.policy.create', resource: 'policy_params', resourceId: row.id, detail: { effectiveFrom: row.effectiveFrom } });
    return c.json({ policyParams: row }, 201);
  });

  // ── Nhân viên (F1 cơ bản) ──
  r.get('/employees', async (c) => c.json({ employees: await listEmployees(deps.db, orgOf(c), c.req.query('status')) }));
  r.post('/employees', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const employee = await createEmployee(deps.db, orgOf(c), b);
    await deps.audit?.(c, { action: 'qldn.employee.create', resource: 'employee', resourceId: employee.id, detail: { fullName: employee.fullName } });
    return c.json({ employee }, 201);
  });
  r.patch('/employees/:id', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const employee = await updateEmployee(deps.db, orgOf(c), c.req.param('id'), b);
    await deps.audit?.(c, { action: 'qldn.employee.update', resource: 'employee', resourceId: employee.id });
    return c.json({ employee });
  });

  return r;
}
