/**
 * SOUL-SALE 1A — contract.ts
 * Mirror structural-typing các shape host SuperCitadel v11.4.0 mà module cần —
 * KHÔNG import từ host (pattern Kế Toán 10A / Soul-Inventory). Build độc lập 100%;
 * cắm vào repo thật thì host inject db/auth/gate/audit khớp shape là chạy.
 *
 * executeAction — dry-run→confirm cho MỌI write action:
 *   - sensitive && confirm !== true → trả preview (KHÔNG chạy handler), audit 'dryrun'
 *   - confirm === true              → chạy thật trong transaction, audit 'ok'/'error'
 */
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { z } from 'zod';
import { ssActionAudit } from './schema.js';

/** Db — chấp nhận cả postgres-js (host) lẫn pglite (test) qua structural typing. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, any, any>;

export interface Ctx {
  orgId: string;
  userId: string;
  roles?: string[];
  now?: Date;
  /** host-adapter nối vào outbox; test bơm collector. Module KHÔNG tự spawn hạ tầng. */
  emit?: (topic: string, payload: Record<string, unknown>) => void | Promise<void>;
}

/* ---- Mirror host (chỉ field module dùng) ---- */
export interface HostJwtPayload { sub: string; org_id: string; roles?: string[] }
export type HostAuditSink = (entry: {
  org_id: string; user_id: string; module: string; action: string;
  payload?: unknown; result?: 'ok' | 'error' | 'dryrun'; message?: string;
}) => void | Promise<void>;

export type SecurityLevel = 1 | 2;

export interface ReadToolDef<P = unknown, R = unknown> {
  name: string;               // soulsale.resource.action (hyphen, 3 đoạn)
  description: string;
  permission: string;         // key trong PERMISSION_REGISTRY
  params: z.ZodType<P>;
  handler: (db: Db, ctx: Ctx, p: P) => Promise<R>;
  examples?: string[];
}

export interface WriteActionDef<P = unknown, R = unknown> {
  name: string;
  description: string;
  permission: string;
  securityLevel: SecurityLevel;
  sensitive: boolean;
  params: z.ZodType<P>;
  handler: (db: Db, ctx: Ctx, p: P) => Promise<R>;
  /** preview thật cho dry-run (đọc DB, KHÔNG ghi) — action nặng bắt buộc có. */
  preview?: (db: Db, ctx: Ctx, p: P) => Promise<Record<string, unknown>>;
  examples?: string[];
}

export interface DryRunPreview {
  dry_run: true;
  action: string;
  message: string;
  input: Record<string, unknown>;
  preview?: Record<string, unknown>;
  requires_security_level: SecurityLevel;
}

export interface ActionExecuteInput { confirm?: boolean; [k: string]: unknown }

async function writeAudit(db: Db, ctx: Ctx, action: string, result: 'ok' | 'error' | 'dryrun', input: unknown, message?: string) {
  try {
    await db.insert(ssActionAudit).values({
      orgId: ctx.orgId, actorUserId: ctx.userId, action, result,
      input: input as Record<string, unknown>, message: message ?? null,
    });
  } catch { /* audit không được làm vỡ nghiệp vụ */ }
}

export async function executeAction<P>(
  db: Db, ctx: Ctx, action: WriteActionDef<P>, rawInput: ActionExecuteInput,
  hostAudit?: HostAuditSink,
): Promise<unknown | DryRunPreview> {
  const { confirm, ...input } = rawInput ?? {};
  const parsed = action.params.parse(input) as P; // zod fail-fast trước mọi thứ

  if (action.sensitive && confirm !== true) {
    let previewData: Record<string, unknown> | undefined;
    if (action.preview) previewData = await action.preview(db, ctx, parsed);
    const preview: DryRunPreview = {
      dry_run: true,
      action: action.name,
      message: `Sắp thực hiện: ${action.description}. Kiểm tra thông số rồi xác nhận (confirm: true) để chạy thật.`,
      input: input as Record<string, unknown>,
      preview: previewData,
      requires_security_level: action.securityLevel,
    };
    await writeAudit(db, ctx, action.name, 'dryrun', input);
    await hostAudit?.({ org_id: ctx.orgId, user_id: ctx.userId, module: 'soul-sale', action: action.name, payload: input, result: 'dryrun' });
    return preview;
  }

  try {
    const result = await db.transaction(async (tx) => action.handler(tx as unknown as Db, ctx, parsed));
    await writeAudit(db, ctx, action.name, 'ok', input);
    await hostAudit?.({ org_id: ctx.orgId, user_id: ctx.userId, module: 'soul-sale', action: action.name, payload: input, result: 'ok' });
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await writeAudit(db, ctx, action.name, 'error', input, msg);
    await hostAudit?.({ org_id: ctx.orgId, user_id: ctx.userId, module: 'soul-sale', action: action.name, payload: input, result: 'error', message: msg });
    throw e;
  }
}
