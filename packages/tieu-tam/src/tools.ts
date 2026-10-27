// Tool system — modules register tools; Tiểu Tâm invokes them with RBAC enforcement.
// A "tool" is a capability a module exposes to the AI (e.g. crm.query_records).
import { ROLE_RANK, type Role, type Permission } from '@citadel/core';

export interface ToolContext {
  orgId: string;
  userId: string;
  role: Role;
  permissions: Set<Permission>;
}

export interface ToolDef<I = any, O = any> {
  /** Unique name, convention `<module>.<action>` e.g. "crm.query_records". */
  name: string;
  module: string;
  description: string;
  /** Required permission to invoke, or minimum role. */
  requiresPermission?: Permission;
  requiresRole?: Role;
  handler: (input: I, ctx: ToolContext) => Promise<O>;
}

export class ToolDeniedError extends Error {
  constructor(public tool: string, reason: string) {
    super(`Tool "${tool}" bị từ chối: ${reason}`);
    this.name = 'ToolDeniedError';
  }
}

export class ToolRegistry {
  private tools = new Map<string, ToolDef>();

  register(def: ToolDef): void {
    if (this.tools.has(def.name)) throw new Error(`Tool "${def.name}" đã đăng ký`);
    this.tools.set(def.name, def);
  }

  list(): ToolDef[] {
    return [...this.tools.values()];
  }

  /** Tools the given context is allowed to see/use (for AI tool-routing). */
  listAllowed(ctx: ToolContext): ToolDef[] {
    return this.list().filter((t) => this.canUse(t, ctx));
  }

  private canUse(t: ToolDef, ctx: ToolContext): boolean {
    if (t.requiresRole && ROLE_RANK[ctx.role] < ROLE_RANK[t.requiresRole]) return false;
    if (t.requiresPermission && !ctx.permissions.has(t.requiresPermission)) return false;
    return true;
  }

  /** Invoke with enforcement. Throws ToolDeniedError if not permitted. */
  async invoke<O = unknown>(name: string, input: unknown, ctx: ToolContext): Promise<O> {
    const t = this.tools.get(name);
    if (!t) throw new ToolDeniedError(name, 'không tồn tại');
    if (t.requiresRole && ROLE_RANK[ctx.role] < ROLE_RANK[t.requiresRole])
      throw new ToolDeniedError(name, `cần quyền ${t.requiresRole}`);
    if (t.requiresPermission && !ctx.permissions.has(t.requiresPermission))
      throw new ToolDeniedError(name, `thiếu quyền ${t.requiresPermission}`);
    return (await t.handler(input, ctx)) as O;
  }
}

/** Shared singleton registry; modules register on load. */
export const toolRegistry = new ToolRegistry();
