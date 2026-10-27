import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { AppError, Errors, ROLE_RANK, type JwtPayload, type Role } from '@citadel/core';
import { companyModuleRequests } from '@citadel/db';

declare module 'hono' { interface ContextVariableMap { auth: JwtPayload; } }
const orgOf = (c: any) => (c.get('auth') as JwtPayload).orgId;
type AuditFn = (c: Context, e: { action: string; resource?: string; resourceId?: string; detail?: unknown }) => Promise<void>;

const requiredPayload = ['business','departments','workflow','painPoints','mustHave'];
function validateBody(body: any) {
  const companyName = String(body.company_name ?? body.companyName ?? body?.payload?.companyName ?? '').trim();
  if (!companyName) throw Errors.validation('Thiếu tên công ty', 'company_name');
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : body;
  for (const k of requiredPayload) {
    const v = payload?.[k];
    if (typeof v === 'string' && v.trim()) continue;
    if (Array.isArray(v) && v.length) continue;
    throw Errors.validation(`Thiếu thông tin bắt buộc: ${k}`, k);
  }
  if (!body.termsAccepted && !body.terms_accepted_at) throw Errors.validation('Cần chấp nhận điều khoản beta', 'terms');
  return { companyName, payload };
}

function present(r: any) {
  return {
    id: r.id,
    orgId: r.orgId,
    companyName: r.companyName,
    payload: r.payload,
    status: r.status,
    termsAcceptedAt: r.termsAcceptedAt,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
  };
}

function requireManager(c: Context) {
  const role = c.get('auth').role as Role;
  if (ROLE_RANK[role] < ROLE_RANK.manager) throw Errors.forbidden('Cần quyền manager trở lên để xem hồ sơ Module Company');
}

export function buildCompanyModuleRoutes(deps: { db: any; requireAuth: MiddlewareHandler; audit?: AuditFn }) {
  const r = new Hono();
  r.onError((err, c) => err instanceof AppError ? c.json(err.toJSON(), err.status as 400) : (console.error('[company-module]', err), c.json({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống' } }, 500)));
  r.use('*', deps.requireAuth);

  r.post('/requests', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { companyName, payload } = validateBody(body);
    const [row] = await deps.db.insert(companyModuleRequests).values({
      orgId: orgOf(c),
      companyName,
      payload,
      termsAcceptedAt: body.terms_accepted_at ? new Date(body.terms_accepted_at) : new Date(),
      createdBy: c.get('auth').sub,
    }).returning();
    await deps.audit?.(c, { action: 'company_module.request', resource: 'company_module_request', resourceId: row.id, detail: { companyName } });
    return c.json({ ok: true, request: present(row), message: `Em đã nhận Mod Module Company của ${companyName} 🏢✨` }, 201);
  });

  r.get('/requests', async (c) => {
    requireManager(c);
    const rows = await deps.db.select().from(companyModuleRequests).where(eq(companyModuleRequests.orgId, orgOf(c))).orderBy(desc(companyModuleRequests.createdAt));
    return c.json({ requests: rows.map(present) });
  });

  r.get('/requests/:id', async (c) => {
    requireManager(c);
    const [row] = await deps.db.select().from(companyModuleRequests).where(and(eq(companyModuleRequests.orgId, orgOf(c)), eq(companyModuleRequests.id, c.req.param('id'))));
    if (!row) throw Errors.notFound('Không tìm thấy hồ sơ Module Company');
    return c.json({ request: present(row) });
  });
  return r;
}
