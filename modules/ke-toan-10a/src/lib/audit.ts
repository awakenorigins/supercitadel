import type { Database } from "./db.js";
import type { Ctx } from "./context.js";
import { auditLog } from "../schema/audit.js";

/**
 * Ghi một dòng audit log. Gọi sau mỗi hành động thay đổi dữ liệu tài chính.
 * Không bao giờ throw ra ngoài để tránh làm hỏng transaction chính —
 * lỗi ghi log chỉ được cảnh báo.
 */
export async function writeAudit(
  db: Database,
  ctx: Ctx,
  params: {
    action: string;
    entityType: string;
    entityId?: string;
    detail?: unknown;
  },
): Promise<void> {
  try {
    await db.insert(auditLog).values({
      orgId: ctx.orgId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      actor: ctx.actor,
      source: ctx.source,
      detail: params.detail as never,
    });
  } catch (err) {
    // Không chặn nghiệp vụ vì lỗi log; chỉ cảnh báo.
    console.warn("[ketoan10a] ghi audit log thất bại:", err);
  }
}
