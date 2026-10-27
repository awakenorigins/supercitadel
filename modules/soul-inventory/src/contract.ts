/**
 * SOUL-INVENTORY v2.0 — contract.ts
 * Contract mirror (hấp thụ pattern Kế Toán 10A): phản chiếu structural typing
 * các type của host SuperCitadel v10.0.1 mà module cần — KHÔNG import từ host.
 * TypeScript structural typing bảo đảm: build độc lập 100%, cắm vào repo thật
 * thì host inject db/auth/gate/audit khớp shape là chạy, không đổi code module.
 *
 * Nếu host đổi shape (breaking), tsc sẽ báo ngay tại điểm wiring — fail sớm,
 * không fail ngầm lúc runtime.
 */

/** Mirror JwtPayload của host — chỉ các field module dùng */
export interface HostJwtPayload {
  sub: string;          // user id
  org_id: string;
  roles?: string[];
}

/** Mirror shape db (Drizzle instance hoặc transaction) — module chỉ cần execute/select/insert/update/delete */
export interface HostDb {
  execute(query: unknown): Promise<unknown>;
  select(...args: unknown[]): unknown;
  insert(...args: unknown[]): unknown;
  update(...args: unknown[]): unknown;
  delete(...args: unknown[]): unknown;
  transaction<T>(fn: (tx: HostDb) => Promise<T>): Promise<T>;
}

/** Mirror event bus của host */
export interface HostEventBus {
  emit(name: string, payload: Record<string, unknown>): void | Promise<void>;
}

/** Mirror audit sink của host — mọi action ghi về một chỗ audit chung */
export type HostAuditSink = (entry: {
  org_id: string;
  user_id: string;
  module: string;
  action: string;
  payload?: unknown;
  result?: 'ok' | 'error' | 'dryrun';
  message?: string;
}) => void | Promise<void>;

/** Mirror gate() của host — wrap handler với permission check */
export type HostGate = (permission: string) =>
  (handler: (...args: unknown[]) => unknown) => (...args: unknown[]) => unknown;

/** Deps host inject vào module lúc activate */
export interface HostModuleDeps {
  db: HostDb;
  bus: HostEventBus;
  audit?: HostAuditSink;
  registry?: {
    registerTool(moduleId: string, tool: unknown): void;
    registerIntent(moduleId: string, intent: unknown): void;
    unregisterModule(moduleId: string): void;
  };
}

/**
 * executeAction — dry-run→confirm protocol (hấp thụ Kế Toán 10A).
 * Host gọi hàm này cho MỌI write action của module:
 *   - action.sensitive && !input.confirm  → trả preview, KHÔNG chạy handler,
 *     audit 'dryrun'
 *   - input.confirm === true              → chạy thật, audit 'ok'/'error'
 * Tiểu Tâm đưa preview cho người dùng; người dùng đồng ý → gọi lại với
 * { ...input, confirm: true }.
 */
export interface ActionExecuteInput {
  confirm?: boolean;
  [key: string]: unknown;
}

export interface DryRunPreview {
  dry_run: true;
  action: string;
  message: string;
  input: Record<string, unknown>;
  requires_security_level: 1 | 2;
}

export async function executeAction(
  deps: { audit?: HostAuditSink },
  actor: { org_id: string; user_id: string },
  action: {
    name: string;
    sensitive: boolean;
    securityLevel: 1 | 2;
    description: string;
    handler: (ctx: unknown, input: unknown) => Promise<unknown>;
  },
  ctx: unknown,
  rawInput: ActionExecuteInput,
): Promise<unknown | DryRunPreview> {
  const { confirm, ...input } = rawInput;

  if (action.sensitive && confirm !== true) {
    const preview: DryRunPreview = {
      dry_run: true,
      action: action.name,
      message: `Sắp thực hiện: ${action.description}. Kiểm tra thông số rồi xác nhận (confirm: true) để chạy thật.`,
      input,
      requires_security_level: action.securityLevel,
    };
    await deps.audit?.({
      org_id: actor.org_id, user_id: actor.user_id,
      module: 'soul-inventory', action: action.name,
      payload: input, result: 'dryrun',
    });
    return preview;
  }

  try {
    const result = await action.handler(ctx, input);
    await deps.audit?.({
      org_id: actor.org_id, user_id: actor.user_id,
      module: 'soul-inventory', action: action.name,
      payload: input, result: 'ok',
      message: (result as { message?: string })?.message,
    });
    return result;
  } catch (e) {
    await deps.audit?.({
      org_id: actor.org_id, user_id: actor.user_id,
      module: 'soul-inventory', action: action.name,
      payload: input, result: 'error',
      message: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
