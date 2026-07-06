// GET /api/v1/audit-logs — chỉ owner/super_admin, tenant isolation tuyệt đối (luôn filter org từ JWT).
import { Hono, type MiddlewareHandler } from 'hono';
import { and, eq, desc } from 'drizzle-orm';
import { AppError, Errors, ROLE_RANK, type JwtPayload, type Role } from '@citadel/core';
import { auditLogs } from '@citadel/db';

declare module 'hono' { interface ContextVariableMap { auth: JwtPayload; } }

export function buildAuditRoutes(deps: { db: any; requireAuth: MiddlewareHandler }) {
  const r = new Hono();
  r.onError((err, c) => err instanceof AppError ? c.json(err.toJSON(), err.status as 400) : (console.error('[audit]', err), c.json({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống' } }, 500)));
  r.use('*', deps.requireAuth);

  r.get('/', async (c) => {
    const auth = c.get('auth');
    if (ROLE_RANK[auth.role as Role] < ROLE_RANK.owner)
      throw Errors.forbidden('Chỉ chủ tổ chức mới xem được nhật ký hoạt động');
    const orgId = auth.orgId; // NEVER trust org from query
    const action = c.req.query('action');
    const limit = Math.min(Number(c.req.query('limit') ?? 50) || 50, 200);
    const where = action
      ? and(eq(auditLogs.orgId, orgId), eq(auditLogs.action, action))
      : eq(auditLogs.orgId, orgId);
    const logs = await deps.db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt)).limit(limit);
    return c.json({ logs });
  });

  return r;
}
