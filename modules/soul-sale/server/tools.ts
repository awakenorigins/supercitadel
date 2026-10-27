/** SOUL-SALE 1A — server/tools.ts: map 23 read tools sang shape ToolDef của host (Tiểu Tâm toolRegistry).
 *  RLS: mỗi handler chạy trong withOrg() → transaction đã set app.current_org_id (khớp FORCE RLS). */
import { sql } from 'drizzle-orm';
import type { Db } from '../src/contract.js';
import { readTools } from '../src/registry/reads.js';

export interface HostToolCtx { db: Db; orgId: string; userId: string }
export interface HostToolDef {
  name: string; module: string; description: string; requiresPermission: string;
  parameters: unknown; examples: string[];
  handler: (input: unknown, ctx: HostToolCtx) => Promise<unknown>;
}

const withOrg = <T>(db: Db, orgId: string, fn: (tx: Db) => Promise<T>): Promise<T> =>
  (db as any).transaction(async (tx: any) => {
    await tx.execute(sql`select set_config('app.current_org_id', ${orgId}, true)`);
    return fn(tx as Db);
  });

export const soulSaleTools: HostToolDef[] = readTools.map((t) => ({
  name: t.name,
  module: 'soul-sale',
  description: t.description,
  requiresPermission: t.permission,
  parameters: t.params,
  examples: t.examples ?? [],
  handler: async (input, ctx) => {
    const params = t.params.parse(input ?? {});
    return withOrg(ctx.db, ctx.orgId, (tx) => t.handler(tx, { orgId: ctx.orgId, userId: ctx.userId }, params));
  },
}));
