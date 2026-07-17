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
  listSalaryProfiles, createSalaryProfile, effectiveSalaryProfile,
} from './service.js';
import { parseOfficialWorkbook, parseInternalWorkbook, importEmployees } from './import.js';
import { parseOfficialBcc, parseInternalBcc, importBcc, listTimesheets } from './timesheet.js';
import { createPayrollRun, calculateRun, listRuns, listRunLines, getRun } from './payroll.js';
import {
  approveRun, createPayoutBatch, listPayoutBatches, markBatchStatus,
  generatePayslips, getPayslip, createContractorPayment, listContractorPayments,
} from './payout.js';

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

  // ── Hồ sơ lương (salary profiles — version hóa) ──
  r.get('/employees/:id/salary-profiles', async (c) =>
    c.json({ salaryProfiles: await listSalaryProfiles(deps.db, orgOf(c), c.req.param('id')) }));
  r.get('/employees/:id/salary-profiles/effective', async (c) => {
    const date = c.req.query('date') ?? new Date().toISOString().slice(0, 10);
    return c.json({ salaryProfile: await effectiveSalaryProfile(deps.db, orgOf(c), c.req.param('id'), date), date });
  });
  r.post('/salary-profiles', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const salaryProfile = await createSalaryProfile(deps.db, orgOf(c), b);
    await deps.audit?.(c, { action: 'qldn.salary_profile.create', resource: 'salary_profile', resourceId: salaryProfile.id, detail: { employeeId: salaryProfile.employeeId, effectiveFrom: salaryProfile.effectiveFrom } });
    return c.json({ salaryProfile }, 201);
  });

  // ── Import Excel nhân sự (multipart: official= file lương chính thức, internal= file LUONGNB) ──
  r.post('/employees/import', async (c) => {
    const body = await c.req.parseBody();
    const effectiveFrom = String(body['effectiveFrom'] ?? '').trim() || new Date().toISOString().slice(0, 10);
    const officialFile = body['official'];
    const internalFile = body['internal'];
    if (!(officialFile instanceof File) && !(internalFile instanceof File)) {
      throw new AppError('VALIDATION' as any, 'Cần ít nhất 1 file: official (Bảng thông tin) hoặc internal (LUONGNB)', 400);
    }
    const official = officialFile instanceof File ? parseOfficialWorkbook(Buffer.from(await officialFile.arrayBuffer())) : [];
    const internal = internalFile instanceof File ? parseInternalWorkbook(Buffer.from(await internalFile.arrayBuffer())) : [];
    const result = await importEmployees(deps.db, orgOf(c), { official, internal, effectiveFrom });
    await deps.audit?.(c, { action: 'qldn.employee.import', resource: 'employee', detail: { created: result.created, updated: result.updated, profiles: result.profilesCreated, unmatched: result.unmatchedInternal.length } });
    return c.json({ result }, 201);
  });

  // ── Chấm công: import BCC Excel (multipart: file= BCC, source= official|internal) ──
  r.post('/timesheets/import', async (c) => {
    const body = await c.req.parseBody();
    const file = body['file'];
    const source = String(body['source'] ?? 'official');
    if (!(file instanceof File)) throw new AppError('VALIDATION' as any, 'Thiếu file BCC (field "file")', 400);
    if (!['official', 'internal'].includes(source)) throw new AppError('VALIDATION' as any, 'source phải là official|internal', 400);
    const buf = Buffer.from(await file.arrayBuffer());
    const parsed = source === 'official' ? parseOfficialBcc(buf) : parseInternalBcc(buf);
    const result = await importBcc(deps.db, orgOf(c), parsed);
    await deps.audit?.(c, { action: 'qldn.timesheet.import', resource: 'timesheet', detail: { period: result.periodCode, source, created: result.created, updated: result.updated, unmatched: result.unmatched.length } });
    return c.json({ result }, 201);
  });
  r.get('/timesheets', async (c) => {
    const period = c.req.query('period');
    if (!period) throw new AppError('VALIDATION' as any, 'Thiếu query ?period=YYYY-MM', 400);
    return c.json(await listTimesheets(deps.db, orgOf(c), period));
  });

  // ── Bảng lương (payroll runs) ──
  r.get('/payroll/runs', async (c) => c.json({ runs: await listRuns(deps.db, orgOf(c), c.req.query('period')) }));
  r.post('/payroll/runs', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const run = await createPayrollRun(deps.db, orgOf(c), b);
    await deps.audit?.(c, { action: 'qldn.payroll.run_create', resource: 'payroll_run', resourceId: run.id, detail: { period: run.periodCode, scheme: run.scheme } });
    return c.json({ run }, 201);
  });
  r.post('/payroll/runs/:id/calculate', async (c) => {
    const result = await calculateRun(deps.db, orgOf(c), c.req.param('id'));
    await deps.audit?.(c, { action: 'qldn.payroll.calculate', resource: 'payroll_run', resourceId: c.req.param('id'), detail: { lines: result.lines, netTotal: result.totals.netPay, skipped: result.skipped.length } });
    return c.json({ result });
  });
  r.get('/payroll/runs/:id', async (c) => c.json({ run: await getRun(deps.db, orgOf(c), c.req.param('id')) }));
  r.get('/payroll/runs/:id/lines', async (c) => c.json({ lines: await listRunLines(deps.db, orgOf(c), c.req.param('id')) }));
  r.post('/payroll/runs/:id/approve', async (c) => {
    const auth = c.get('auth') as JwtPayload;
    const run = await approveRun(deps.db, orgOf(c), c.req.param('id'), auth.sub);
    await deps.audit?.(c, { action: 'qldn.payroll.approve', resource: 'payroll_run', resourceId: run.id });
    return c.json({ run });
  });

  // ── Chi lương (payout batch UNC) ──
  r.get('/payouts', async (c) => c.json({ batches: await listPayoutBatches(deps.db, orgOf(c), c.req.query('runId')) }));
  r.post('/payouts', async (c) => {
    const auth = c.get('auth') as JwtPayload;
    const b = await c.req.json().catch(() => ({}));
    const { batch, summary } = await createPayoutBatch(deps.db, orgOf(c), b, auth.sub);
    await deps.audit?.(c, { action: 'qldn.payout.create', resource: 'payout_batch', resourceId: batch.id, detail: summary });
    return c.json({ batch, summary }, 201);
  });
  r.post('/payouts/:id/status', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const batch = await markBatchStatus(deps.db, orgOf(c), c.req.param('id'), String(b?.status ?? ''));
    await deps.audit?.(c, { action: 'qldn.payout.status', resource: 'payout_batch', resourceId: batch.id, detail: { status: batch.status } });
    return c.json({ batch });
  });

  // ── Phiếu lương (payslips — snapshot bất biến) ──
  r.post('/payroll/runs/:id/payslips', async (c) => {
    const result = await generatePayslips(deps.db, orgOf(c), c.req.param('id'));
    await deps.audit?.(c, { action: 'qldn.payslip.generate', resource: 'payroll_run', resourceId: c.req.param('id'), detail: result });
    return c.json({ result }, 201);
  });
  r.get('/payslips/:employeeId/:period', async (c) =>
    c.json({ payslips: await getPayslip(deps.db, orgOf(c), c.req.param('employeeId'), c.req.param('period')) }));

  // ── CTV / gia công / công tác phí ──
  r.get('/contractors/payments', async (c) => c.json({ payments: await listContractorPayments(deps.db, orgOf(c), c.req.query('period')) }));
  r.post('/contractors/payments', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const payment = await createContractorPayment(deps.db, orgOf(c), b);
    await deps.audit?.(c, { action: 'qldn.contractor.payment', resource: 'contractor_payment', resourceId: payment.id, detail: { kind: payment.kind, net: payment.netAmount } });
    return c.json({ payment }, 201);
  });

  return r;
}
