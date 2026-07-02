import { Hono, type MiddlewareHandler } from 'hono';
import { AppError, type JwtPayload } from '@citadel/core';
import { listShifts, createShift, assignStaff } from './service.js';
import { listEmployees, createEmployee, updateEmployee, checkIn, checkOut, attendanceByDate } from './service-v2.js';
import { listLeaveTypes, createLeaveType, allocateLeave, leaveBalance, applyLeave, listApplications, decideLeave } from './leave.js';
declare module 'hono' { interface ContextVariableMap { auth: JwtPayload; } }
const orgOf = (c: any) => (c.get('auth') as JwtPayload).orgId;
export function buildHrRoutes(deps: { db: any; requireAuth: MiddlewareHandler; gate?: MiddlewareHandler }) {
  const r = new Hono();
  r.onError((err, c) => err instanceof AppError ? c.json(err.toJSON(), err.status as 400) : (console.error('[hr]', err), c.json({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống' } }, 500)));
  r.use('*', deps.requireAuth);
  if (deps.gate) r.use('*', deps.gate);
  r.get('/shifts', async (c) => c.json({ shifts: await listShifts(deps.db, orgOf(c), c.req.query('date')) }));
  r.post('/shifts', async (c) => { const b = await c.req.json().catch(() => ({})); return c.json({ shift: await createShift(deps.db, orgOf(c), b) }, 201); });
  r.put('/shifts/:id/staff', async (c) => { const b = await c.req.json().catch(() => ({})); return c.json({ shift: await assignStaff(deps.db, orgOf(c), c.req.param('id'), Array.isArray(b.staff) ? b.staff : []) }); });

  // ── HR v2: Employees ──
  r.get('/employees', async (c) => c.json({ employees: await listEmployees(deps.db, orgOf(c), c.req.query('status')) }));
  r.post('/employees', async (c) => { const b = await c.req.json().catch(() => ({})); return c.json({ employee: await createEmployee(deps.db, orgOf(c), b) }, 201); });
  r.patch('/employees/:id', async (c) => { const b = await c.req.json().catch(() => ({})); return c.json({ employee: await updateEmployee(deps.db, orgOf(c), c.req.param('id'), b) }); });

  // ── HR v2: Attendance ──
  r.post('/attendance/check-in', async (c) => { const b = await c.req.json().catch(() => ({})); return c.json({ attendance: await checkIn(deps.db, orgOf(c), b) }, 201); });
  r.post('/attendance/check-out', async (c) => { const b = await c.req.json().catch(() => ({})); return c.json({ attendance: await checkOut(deps.db, orgOf(c), b) }); });
  r.get('/attendance', async (c) => c.json({ attendance: await attendanceByDate(deps.db, orgOf(c), c.req.query('date') ?? new Date().toISOString().slice(0, 10)) }));

  // ── HR v2: Leave ──
  r.get('/leave/types', async (c) => c.json({ types: await listLeaveTypes(deps.db, orgOf(c)) }));
  r.post('/leave/types', async (c) => { const b = await c.req.json().catch(() => ({})); return c.json({ type: await createLeaveType(deps.db, orgOf(c), b) }, 201); });
  r.post('/leave/allocations', async (c) => { const b = await c.req.json().catch(() => ({})); return c.json({ allocation: await allocateLeave(deps.db, orgOf(c), b) }, 201); });
  r.get('/leave/balance', async (c) => {
    const employeeId = c.req.query('employeeId') ?? '';
    const year = Number(c.req.query('year') ?? new Date().getUTCFullYear());
    return c.json({ balance: await leaveBalance(deps.db, orgOf(c), employeeId, year) });
  });
  r.post('/leave/applications', async (c) => { const b = await c.req.json().catch(() => ({})); return c.json({ application: await applyLeave(deps.db, orgOf(c), b) }, 201); });
  r.get('/leave/applications', async (c) => c.json({ applications: await listApplications(deps.db, orgOf(c), c.req.query('status')) }));
  r.post('/leave/applications/:id/approve', async (c) => c.json({ application: await decideLeave(deps.db, orgOf(c), c.req.param('id'), true, (c.get('auth') as JwtPayload).sub) }));
  r.post('/leave/applications/:id/reject', async (c) => c.json({ application: await decideLeave(deps.db, orgOf(c), c.req.param('id'), false, (c.get('auth') as JwtPayload).sub) }));

  return r;
}
