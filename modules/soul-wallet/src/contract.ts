/**
 * SOUL-WALLET 1A — contract.ts
 * Contract mirror (hấp thụ pattern Kế Toán 10A → Soul-Inventory v2): phản chiếu
 * structural typing các type của host SuperCitadel mà module cần — KHÔNG import
 * từ host. TypeScript structural typing bảo đảm: build độc lập 100%, cắm vào
 * repo thật thì host inject db/auth/gate/audit khớp shape là chạy, không đổi
 * code module.
 *
 * Nếu host đổi shape (breaking), tsc sẽ báo ngay tại điểm wiring — fail sớm,
 * không fail ngầm lúc runtime.
 */

/** Mirror JwtPayload của host — chỉ các field module dùng */
export interface HostJwtPayload {
  sub: string;          // user id — chính là owner_user_id của ví
  org_id: string;
  roles?: string[];
}

/** Mirror shape db (Drizzle instance hoặc transaction) — module chỉ cần các method này */
export interface HostDb {
  execute(query: unknown): Promise<unknown>;
  select(...args: unknown[]): unknown;
  insert(...args: unknown[]): unknown;
  update(...args: unknown[]): unknown;
  delete(...args: unknown[]): unknown;
  transaction<T>(fn: (tx: HostDb) => Promise<T>): Promise<T>;
}

/** Mirror event bus của host — outbox topic 3 đoạn `sw.entity.verb` */
export interface HostEventBus {
  emit(topic: string, payload: Record<string, unknown>): unknown;
}

/** Mirror audit hook của host (services/api/src/... audit) */
export type HostAuditFn = (entry: {
  action: string;
  resource?: string;
  resourceId?: string;
  detail?: unknown;
}) => Promise<void> | void;

/** Mirror context mà host tieu-tam/actions.ts truyền vào execute() của action */
export interface HostActionCtx {
  db: HostDb;
  orgId: string;
  userId: string;
  audit?: HostAuditFn;
}

/** Mirror shape 1 action def trong registry Tiểu Tâm của host.
 *  Semantics dry-run→confirm: host thấy sensitive && !params.confirm
 *  → gọi execute ở chế độ preview (module tự trả preview, không ghi DB)
 *  hoặc host tự chặn tùy phiên bản — module LUÔN tôn trọng cờ confirm. */
export interface HostTieuTamActionDef {
  name: string;
  description: string;
  requiredModule: string;
  permission: string;
  securityLevel: 1 | 2;
  sensitive: boolean;
  parameters: { type: 'object'; properties: Record<string, unknown>; additionalProperties?: boolean };
  execute(ctx: HostActionCtx, params: Record<string, unknown>): Promise<unknown>;
}

/** Mirror shape 1 read-tool trong tool-registry Tiểu Tâm của host */
export interface HostTieuTamToolDef {
  name: string;
  description: string;
  requiredModule: string;
  permission: string;
  parameters: { type: 'object'; properties: Record<string, unknown>; additionalProperties?: boolean };
  execute(ctx: HostActionCtx, params: Record<string, unknown>): Promise<unknown>;
}
