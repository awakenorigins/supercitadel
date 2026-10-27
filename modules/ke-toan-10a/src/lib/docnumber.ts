import { and, eq, sql } from "drizzle-orm";
import type { Database } from "./db.js";
import { docCounters } from "../schema/audit.js";
import type { Ctx } from "./context.js";

/** Tiền tố số chứng từ theo loại. */
const PREFIX: Record<string, string> = {
  RECEIPT: "PT", // Phiếu thu
  PAYMENT: "PC", // Phiếu chi
  INVOICE: "HD", // Hoá đơn bán
  BILL: "HDM", // Hoá đơn mua
  JOURNAL: "BT", // Bút toán
};

/**
 * Sinh số chứng từ tuần tự, an toàn với concurrency.
 * Dùng UPSERT + atomic increment để không bao giờ trùng số trong cùng org.
 * Định dạng: <PREFIX>-<YEAR>-<000123>.
 *
 * LƯU Ý: hàm này phải chạy TRONG cùng transaction với việc tạo chứng từ,
 * nếu không sẽ có khoảng trống số khi transaction rollback.
 */
export async function nextDocNumber(
  db: Database,
  ctx: Ctx,
  docType: keyof typeof PREFIX,
  year: number = new Date().getFullYear(),
): Promise<string> {
  // Atomic upsert: nếu chưa có counter thì tạo với giá trị 1, có rồi thì +1.
  const rows = await db
    .insert(docCounters)
    .values({ orgId: ctx.orgId, docType, year, counter: 1 })
    .onConflictDoUpdate({
      target: [docCounters.orgId, docCounters.docType, docCounters.year],
      set: { counter: sql`${docCounters.counter} + 1`, updatedAt: new Date() },
    })
    .returning({ counter: docCounters.counter });

  const counter = rows[0]?.counter ?? 1;
  const prefix = PREFIX[docType] ?? docType;
  const seq = counter.toString().padStart(6, "0");
  return `${prefix}-${year}-${seq}`;
}

/** Xem giá trị counter hiện tại mà không tăng (phục vụ báo cáo). */
export async function peekDocNumber(
  db: Database,
  ctx: Ctx,
  docType: keyof typeof PREFIX,
  year: number = new Date().getFullYear(),
): Promise<number> {
  const rows = await db
    .select({ counter: docCounters.counter })
    .from(docCounters)
    .where(
      and(
        eq(docCounters.orgId, ctx.orgId),
        eq(docCounters.docType, docType),
        eq(docCounters.year, year),
      ),
    )
    .limit(1);
  return rows[0]?.counter ?? 0;
}
