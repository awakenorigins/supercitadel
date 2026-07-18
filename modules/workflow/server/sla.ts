import { and, eq, lt } from 'drizzle-orm';
import { emitEvent } from '@citadel/core';
import { wfSteps } from './schema.js';

export async function scanWorkflowSla(db: any, orgId: string, now = new Date()): Promise<number> {
  return db.transaction(async (tx: any) => {
    const rows = await tx.select().from(wfSteps).where(and(eq(wfSteps.orgId, orgId), eq(wfSteps.status, 'active'), lt(wfSteps.slaDeadline, now as any)));
    let n = 0;
    for (const s of rows) {
      const meta = (s.metadata ?? {}) as any;
      if (meta.slaExpiredNotified) continue;
      await tx.update(wfSteps).set({ metadata: { ...meta, slaExpiredNotified: true, slaExpiredAt: now.toISOString() } }).where(and(eq(wfSteps.id, s.id),eq(wfSteps.orgId,orgId)));
      await emitEvent(tx, { orgId, topic: 'workflow.step.expired', payload: { stepId: s.id, instanceId: s.instanceId, stepOrder: s.stepOrder, slaDeadline: s.slaDeadline } });
      n++;
    }
    return n;
  });
}

export function startWorkflowSlaScanner(db: any, listActiveOrgIds: () => Promise<string[]>, opts?: { intervalMs?: number }) {
  const intervalMs = opts?.intervalMs ?? 60_000;
  const tick = async () => {
    let orgIds: string[] = [];
    try { orgIds = await listActiveOrgIds(); } catch (e) { console.error('[workflow][sla] không lấy được org active', e); return; }
    for (const orgId of orgIds) {
      try { const n = await scanWorkflowSla(db, orgId); if (n) console.log(`[workflow][sla] org ${orgId}: expired=${n}`); }
      catch (e) { console.error(`[workflow][sla] org ${orgId} lỗi`, e); }
    }
  };
  const timer = setInterval(() => { tick().catch((e) => console.error('[workflow][sla] tick lỗi', e)); }, intervalMs);
  (timer as any).unref?.();
  return { stop: () => clearInterval(timer), tick };
}
