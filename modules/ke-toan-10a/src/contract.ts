/**
 * ============================================================
 * CONTRACT — Ranh giới giữa Kế Toán 10A và host SuperCitadel
 * ============================================================
 *
 * Các kiểu ở đây MIRROR contract thật của SuperCitadel (@citadel/core,
 * @citadel/tieu-tam). Nhờ structural typing của TypeScript, chúng TƯƠNG THÍCH
 * với kiểu thật của host — module tự typecheck/test độc lập được, mà khi cắm
 * vào repo thật, host tiêm `db/requireAuth/gate/audit` của mình vào là chạy.
 *
 * Khi wiring vào repo thật: KHÔNG cần đổi gì trong module. Host inject
 * dependencies qua `buildKeToan10aRoutes({...})`. Xem docs/INTEGRATION.md.
 */
import type { Context, MiddlewareHandler } from "hono";

export type { Context, MiddlewareHandler };

/**
 * Payload JWT mà host gắn vào `c.get('auth')` sau requireAuth.
 * Tối thiểu cần `orgId` (tenant) và `sub` (user id). Khớp @citadel/core.
 */
export interface JwtPayload {
  orgId: string;
  sub?: string;
  userId?: string;
  securityLevel?: number;
  [k: string]: unknown;
}

/**
 * Lỗi ứng dụng chuẩn. Cấu trúc `.toJSON()` + `.status` khớp AppError của
 * @citadel/core để `r.onError` trả đúng HTTP status + body.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
  toJSON() {
    return { error: { code: this.code, message: this.message, detail: this.detail } };
  }
}

/** Hàm ghi audit do host tiêm (ghi chung 1 nơi với toàn hệ thống). */
export type AuditFn = (
  c: Context,
  e: { action: string; resource?: string; resourceId?: string; detail?: unknown },
) => Promise<void>;

/**
 * Định nghĩa AI tool (đọc dữ liệu) đăng ký vào toolRegistry của host để
 * Tiểu Tâm gọi. Khớp ToolDef của @citadel/tieu-tam.
 */
export interface ToolDef {
  name: string;
  module: string;
  description: string;
  requiresPermission?: string;
  parameters?: Record<string, unknown>;
  handler: (input: any, ctx: { orgId: string; userId?: string }) => Promise<unknown>;
}

/**
 * Dependencies host tiêm khi mount module. `db` là Drizzle instance dùng chung
 * pool của core; `requireAuth`/`gate` là middleware host; `audit` là sink chung.
 */
export interface ModuleDeps {
  db: any;
  requireAuth: MiddlewareHandler;
  gate?: MiddlewareHandler;
  audit?: AuditFn;
  /** Gate nhạy cảm: đảo/hủy phiếu thu-chi (tiền đã vào sổ) đòi bảo mật lớp 2. */
  reverseGate?: (c: Context, kind: string) => Promise<void>;
  /**
   * Realtime (tùy chọn): host tiêm hàm đẩy event tới ws-service
   * (POST /internal/publish). Module bắn khi: chạy khấu hao, sinh định kỳ,
   * đối chiếu NH xong, hóa đơn bị chặn vì vượt hạn mức. Lỗi được nuốt im lặng.
   */
  publish?: (event: { type: string; orgId: string; payload?: unknown }) => Promise<void>;
}

/** Lấy orgId từ auth context (nguồn tenant duy nhất, đã verify). */
export const orgOf = (c: Context): string =>
  (c.get("auth") as unknown as JwtPayload).orgId;

/** Lấy user id từ auth context (cho audit). */
export const userOf = (c: Context): string | undefined => {
  const a = c.get("auth") as unknown as JwtPayload;
  return a.sub ?? a.userId;
};
