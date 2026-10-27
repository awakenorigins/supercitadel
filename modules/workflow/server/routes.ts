import { Hono, type Context, type MiddlewareHandler, type Next } from 'hono';
import { and, asc, desc, eq } from 'drizzle-orm';
import { AppError, Errors, hasPermission, type JwtPayload, type Permission, type Role } from '@citadel/core';
import { wfApprovalActions, wfDefinitions, wfInstances, wfProcedureRollouts, wfComplianceTests, wfSteps } from './schema.js';
import { approve, createDefinition, delegate, getInstance, listDefinitions, listInstances, reject, returnStep, start, updateDefinition } from './service.js';

type AuditFn = (c: Context, e: { action: string; resource?: string; resourceId?: string; detail?: unknown }) => Promise<void>;
declare module 'hono' { interface ContextVariableMap { auth: JwtPayload } }
const orgOf = (c: Context) => (c.get('auth') as JwtPayload).orgId;
const actorOf = (c: Context) => (c.get('auth') as JwtPayload).sub;
function permit(perm: Permission) { return async (c: Context, next: Next) => { const auth = c.get('auth') as JwtPayload; if (!hasPermission(auth.role as Role, perm)) throw Errors.forbidden(`Bạn không có quyền ${perm} (PERMISSION_DENIED)`); await next(); }; }
function ownerOnly() { return async (c: Context, next: Next) => { const role = (c.get('auth') as JwtPayload).role; if (!['owner','super_admin'].includes(role)) throw Errors.forbidden('Chỉ owner được quản trị workflow'); await next(); }; }

export function buildWorkflowRoutes(deps: { db: any; requireAuth: MiddlewareHandler; gate?: MiddlewareHandler; audit?: AuditFn }) {
  const r = new Hono();
  r.onError((err, c) => err instanceof AppError ? c.json(err.toJSON(), err.status as 400) : (console.error('[workflow]', err), c.json({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống' } }, 500)));
  r.use('*', deps.requireAuth);
  if (deps.gate) r.use('*', deps.gate);
  r.get('/health', (c) => c.json({ module: 'workflow', ok: true, version: '1.0.0' }));

  r.get('/definitions', permit('workflow.definition.read'), async (c) => c.json({ definitions: await listDefinitions(deps.db, orgOf(c), { active: c.req.query('active') === undefined ? undefined : c.req.query('active') === 'true', domain: c.req.query('domain') }) }));
  r.post('/definitions', permit('workflow.definition.write'), async (c) => { const b = await c.req.json().catch(() => ({})); const row = await createDefinition(deps.db, orgOf(c), b); await deps.audit?.(c, { action: 'workflow.definition.create', resource: 'wf_definition', resourceId: row.id, detail: { code: row.code } }); return c.json({ definition: row }, 201); });
  r.get('/definitions/:id', permit('workflow.definition.read'), async (c) => { const [row] = await deps.db.select().from(wfDefinitions).where(and(eq(wfDefinitions.id, String(c.req.param('id'))), eq(wfDefinitions.orgId, orgOf(c)))); if (!row) throw Errors.notFound('Không tìm thấy definition'); return c.json({ definition: row }); });
  r.patch('/definitions/:id', permit('workflow.definition.write'), async (c) => { const b = await c.req.json().catch(() => ({})); const row = await updateDefinition(deps.db, orgOf(c), String(c.req.param('id')), b); await deps.audit?.(c, { action: 'workflow.definition.update', resource: 'wf_definition', resourceId: row.id }); return c.json({ definition: row }); });

  r.get('/instances', permit('workflow.instance.read'), async (c) => c.json({ instances: await listInstances(deps.db, orgOf(c), { status: c.req.query('status'), entityType: c.req.query('entityType') }) }));
  r.post('/instances/start', permit('workflow.instance.write'), async (c) => { const auth = c.get('auth') as JwtPayload; const b = await c.req.json().catch(() => ({})); const inst = await deps.db.transaction((tx: any) => start(tx, { orgId: orgOf(c), definitionCode: b.definitionCode, entityType: b.entityType, entityId: b.entityId, requestedBy: b.requestedBy ?? auth.sub, amount: b.amount, entityOrgId: b.entityOrgId ?? orgOf(c) })); await deps.audit?.(c, { action: 'workflow.instance.start', resource: 'wf_instance', resourceId: inst.id, detail: { definitionCode: b.definitionCode, entityType: b.entityType } }); return c.json({ instance: inst }, 201); });
  r.get('/instances/:id', permit('workflow.instance.read'), async (c) => { const instance = await getInstance(deps.db, orgOf(c), String(c.req.param('id'))); const steps = await deps.db.select().from(wfSteps).where(and(eq(wfSteps.orgId, orgOf(c)), eq(wfSteps.instanceId, instance.id))).orderBy(asc(wfSteps.stepOrder)); const actions = await deps.db.select().from(wfApprovalActions).where(and(eq(wfApprovalActions.orgId, orgOf(c)), eq(wfApprovalActions.instanceId, instance.id))).orderBy(desc(wfApprovalActions.actedAt)); return c.json({ instance, steps, actions }); });

  r.post('/steps/:id/approve', permit('workflow.step.approve'), async (c) => { const b = await c.req.json().catch(() => ({})); const row = await approve(deps.db, orgOf(c), { stepId: String(c.req.param('id')), actorUserId: b.actorUserId ?? actorOf(c), comment: b.comment, entityOrgId: orgOf(c) }); await deps.audit?.(c, { action: 'workflow.step.approve', resource: 'wf_step', resourceId: String(c.req.param('id')) }); return c.json({ result: row }); });
  r.post('/steps/:id/reject', permit('workflow.step.reject'), async (c) => { const b = await c.req.json().catch(() => ({})); const row = await reject(deps.db, orgOf(c), { stepId: String(c.req.param('id')), actorUserId: b.actorUserId ?? actorOf(c), comment: b.comment, entityOrgId: orgOf(c) }); await deps.audit?.(c, { action: 'workflow.step.reject', resource: 'wf_step', resourceId: String(c.req.param('id')) }); return c.json({ result: row }); });
  r.post('/steps/:id/return', permit('workflow.step.reject'), async (c) => { const b = await c.req.json().catch(() => ({})); const row = await returnStep(deps.db, orgOf(c), { stepId: String(c.req.param('id')), actorUserId: b.actorUserId ?? actorOf(c), comment: b.comment, entityOrgId: orgOf(c) }); await deps.audit?.(c, { action: 'workflow.step.return', resource: 'wf_step', resourceId: String(c.req.param('id')) }); return c.json({ result: row }); });
  r.post('/steps/:id/delegate', permit('workflow.step.delegate'), async (c) => { const b = await c.req.json().catch(() => ({})); const row = await delegate(deps.db, orgOf(c), { stepId: String(c.req.param('id')), actorUserId: b.actorUserId ?? actorOf(c), delegatedToUserId: b.delegatedToUserId, comment: b.comment, entityOrgId: orgOf(c) }); await deps.audit?.(c, { action: 'workflow.step.delegate', resource: 'wf_step', resourceId: String(c.req.param('id')), detail: { delegatedToUserId: b.delegatedToUserId } }); return c.json({ step: row }); });

  r.get('/admin/rollouts', ownerOnly(), permit('workflow.admin.manage'), async (c) => c.json({ rollouts: await deps.db.select().from(wfProcedureRollouts).where(eq(wfProcedureRollouts.orgId, orgOf(c))).orderBy(desc(wfProcedureRollouts.createdAt)) }));
  r.get('/admin/compliance-tests', ownerOnly(), permit('workflow.admin.manage'), async (c) => c.json({ tests: await deps.db.select().from(wfComplianceTests).where(eq(wfComplianceTests.orgId, orgOf(c))).orderBy(desc(wfComplianceTests.createdAt)) }));
  r.get('/admin/sla/expired', ownerOnly(), permit('workflow.admin.manage'), async (c) => c.json({ steps: await deps.db.select().from(wfSteps).where(and(eq(wfSteps.orgId, orgOf(c)), eq(wfSteps.status, 'active'))).orderBy(asc(wfSteps.slaDeadline)) }));
  return r;
}
