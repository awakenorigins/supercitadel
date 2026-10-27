/**
 * Ngữ cảnh thực thi (Execution Context).
 * Mọi service của Kế Toán 10A đều nhận `Ctx` làm tham số đầu tiên.
 * Đây là ranh giới bảo mật: orgId luôn đến từ JWT đã verify, KHÔNG từ body request.
 */
export interface Ctx {
  /** ID tổ chức (tenant) — lấy từ JWT `org_id` của SuperCitadel. */
  orgId: string;
  /** ID người dùng thực hiện — hoặc "tieu-tam" nếu do AI. */
  actor: string;
  /** Nguồn hành động, phục vụ audit log. */
  source: "web" | "api" | "tieu-tam";
}

/** Tạo context cho Tiểu Tâm (khi AI thay mặt user gọi action). */
export function tieuTamCtx(orgId: string, actor = "tieu-tam"): Ctx {
  return { orgId, actor, source: "tieu-tam" };
}

/** Tạo context từ request web/api đã xác thực. */
export function userCtx(
  orgId: string,
  userId: string,
  source: "web" | "api" = "api",
): Ctx {
  return { orgId, actor: userId, source };
}
