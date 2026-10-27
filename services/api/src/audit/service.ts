// Audit log service (V7A P1 — G8): ghi vết "ai làm gì lúc nào" cho thao tác nhạy cảm.
// Best-effort: KHÔNG BAO GIỜ throw — audit lỗi không được làm gãy nghiệp vụ chính.
import { auditLogs } from '@citadel/db';
import type { Context } from 'hono';

export interface AuditEntry {
  orgId: string;
  userId?: string | null;
  action: string;          // vd: 'auth.login', 'module.purchase', 'om.topup', 'acc.invoice.create'
  resource?: string;       // vd: 'module', 'invoice', 'leave_application'
  resourceId?: string;
  detail?: unknown;        // jsonb tự do
  ip?: string;
}

export async function logAudit(db: any, e: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      orgId: e.orgId,
      userId: e.userId ?? null,
      action: e.action,
      resource: e.resource ?? null,
      resourceId: e.resourceId ? String(e.resourceId).slice(0, 80) : null,
      detail: e.detail ?? null,
      ip: e.ip ?? null,
    });
  } catch (err) {
    console.error('[audit] write failed', (err as Error).message);
  }
}

export function ipOf(c: Context): string | undefined {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? undefined;
}

/** Tạo audit fn gắn context Hono — dùng truyền vào module deps (module không import ngược services/api). */
export function makeAudit(db: any) {
  return async (c: Context, e: Omit<AuditEntry, 'orgId' | 'userId' | 'ip'>) => {
    const auth = c.get('auth') as { sub: string; orgId: string } | undefined;
    if (!auth) return;
    await logAudit(db, { ...e, orgId: auth.orgId, userId: auth.sub, ip: ipOf(c) });
  };
}
export type AuditFn = ReturnType<typeof makeAudit>;
