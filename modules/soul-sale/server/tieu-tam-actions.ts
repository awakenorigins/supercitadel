/** SOUL-SALE 1A — server/tieu-tam-actions.ts: map 34 write actions sang shape TieuTamAction của host (dry-run→confirm v8.5).
 *  RLS: executeAction chạy trong withOrg() → transaction đã set app.current_org_id (khớp FORCE RLS). */
import { sql } from 'drizzle-orm';
import type { Db, HostAuditSink, ActionExecuteInput } from '../src/contract.js';
import { executeAction } from '../src/contract.js';
import { writeActions } from '../src/registry/writes.js';

export interface TieuTamActionCtx {
  db: Db; orgId: string; userId: string;
  emit?: (topic: string, payload: Record<string, unknown>) => void | Promise<void>;
  audit?: HostAuditSink;
}
export interface TieuTamAction {
  name: string; description: string; requiredModule: string;
  permission: string; securityLevel: 1 | 2; sensitive: boolean;
  parameters: unknown; examples: string[];
  execute: (ctx: TieuTamActionCtx, input: ActionExecuteInput) => Promise<unknown>;
}

const withOrg = <T>(db: Db, orgId: string, fn: (tx: Db) => Promise<T>): Promise<T> =>
  (db as any).transaction(async (tx: any) => {
    await tx.execute(sql`select set_config('app.current_org_id', ${orgId}, true)`);
    return fn(tx as Db);
  });

export const soulSaleTieuTamActions: TieuTamAction[] = writeActions.map((a) => ({
  name: a.name,
  description: a.description,
  requiredModule: 'soul-sale',
  permission: a.permission,
  securityLevel: a.securityLevel,
  sensitive: a.sensitive,
  parameters: a.params,
  examples: a.examples ?? [],
  execute: (ctx, input) =>
    withOrg(ctx.db, ctx.orgId, (tx) =>
      executeAction(tx, { orgId: ctx.orgId, userId: ctx.userId, emit: ctx.emit }, a, input ?? {}, ctx.audit)),
}));
