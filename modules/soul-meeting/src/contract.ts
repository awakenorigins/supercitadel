/**
 * SOUL-MEETING 1A — contract.ts
 * Contract mirror (pattern Kế Toán 10A → Soul-Wallet 1A): phản chiếu structural
 * typing các type host cần dùng — KHÔNG import từ host. Build độc lập 100%;
 * cắm vào repo thật, host inject db/auth/gate/audit khớp shape là chạy.
 * Host đổi shape (breaking) → tsc báo ngay tại điểm wiring.
 */

/** Mirror JwtPayload của host — chỉ field module dùng */
export interface HostJwtPayload {
  sub: string;
  org_id: string;
  roles?: string[];
}

/** Mirror shape db (Drizzle instance hoặc transaction) */
export interface HostDb {
  execute(query: unknown): Promise<unknown>;
  select(...args: unknown[]): unknown;
  insert(...args: unknown[]): unknown;
  update(...args: unknown[]): unknown;
  delete(...args: unknown[]): unknown;
  transaction<T>(fn: (tx: HostDb) => Promise<T>): Promise<T>;
}

/** Mirror event bus host — topic 3 đoạn `sm.entity.verb` */
export interface HostEventBus {
  emit(topic: string, payload: Record<string, unknown>): unknown;
}

/** Mirror audit hook của host */
export type HostAuditFn = (entry: {
  action: string;
  resource?: string;
  resourceId?: string;
  detail?: unknown;
}) => Promise<void> | void;

/** Mirror context host truyền vào execute() của Tiểu Tâm action */
export interface HostActionCtx {
  db: HostDb;
  orgId: string;
  userId: string;
  audit?: HostAuditFn;
}

/** Mirror shape action def trong registry Tiểu Tâm của host.
 *  Dry-run→confirm là việc của HOST: sensitive && !confirm → host trả preview,
 *  KHÔNG gọi execute. Module chỉ cần khai sensitive/securityLevel đúng. */
export interface HostTieuTamActionDef {
  name: string;
  description: string;
  requiredModule: string;
  permission: string;
  securityLevel: 1 | 2;
  sensitive: boolean;
  parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  execute(ctx: HostActionCtx, params: Record<string, unknown>): Promise<unknown>;
}

/** Mirror shape read tool trong toolRegistry của host */
export interface HostToolDef {
  name: string;
  module: string;
  description: string;
  requiresPermission?: string;
  handler(input: unknown, ctx: { orgId: string; userId?: string }): Promise<unknown>;
}
