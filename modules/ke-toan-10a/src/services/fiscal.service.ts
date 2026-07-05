import { and, asc, desc, eq, lte, gte } from "drizzle-orm";
import type { Database } from "../lib/db.js";
import type { Ctx } from "../lib/context.js";
import { writeAudit } from "../lib/audit.js";
import { InvalidStateError, NotFoundError, ValidationError } from "../lib/errors.js";
import { fiscalYears, type FiscalYear } from "../schema/fiscal.js";

/**
 * FiscalService — năm tài chính + khóa kỳ (tinh hoa chắt từ ACC4A).
 * Sau khi quyết toán, khóa kỳ để chặn hạch toán/sửa số của kỳ đã đóng.
 */
export class FiscalService {
  constructor(private readonly db: Database) {}

  async create(
    ctx: Ctx,
    input: { name: string; startDate: string; endDate: string },
  ): Promise<FiscalYear> {
    if (!input.name?.trim()) throw new ValidationError("Thiếu tên năm tài chính");
    if (input.startDate >= input.endDate) {
      throw new ValidationError("Ngày bắt đầu phải trước ngày kết thúc");
    }
    const [row] = await this.db
      .insert(fiscalYears)
      .values({
        orgId: ctx.orgId,
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
      })
      .returning();
    await writeAudit(this.db, ctx, {
      action: "fiscal.create",
      entityType: "fiscal_year",
      entityId: row!.id,
      detail: { name: input.name },
    });
    return row!;
  }

  async list(ctx: Ctx): Promise<FiscalYear[]> {
    return this.db
      .select()
      .from(fiscalYears)
      .where(eq(fiscalYears.orgId, ctx.orgId))
      .orderBy(desc(fiscalYears.startDate));
  }

  async close(ctx: Ctx, id: string): Promise<FiscalYear> {
    const [row] = await this.db
      .update(fiscalYears)
      .set({ isClosed: true, closedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(fiscalYears.id, id), eq(fiscalYears.orgId, ctx.orgId)))
      .returning();
    if (!row) throw new NotFoundError("năm tài chính", id);
    await writeAudit(this.db, ctx, {
      action: "fiscal.close",
      entityType: "fiscal_year",
      entityId: id,
    });
    return row;
  }

  async reopen(ctx: Ctx, id: string): Promise<FiscalYear> {
    const [row] = await this.db
      .update(fiscalYears)
      .set({ isClosed: false, closedAt: null, updatedAt: new Date() })
      .where(and(eq(fiscalYears.id, id), eq(fiscalYears.orgId, ctx.orgId)))
      .returning();
    if (!row) throw new NotFoundError("năm tài chính", id);
    await writeAudit(this.db, ctx, {
      action: "fiscal.reopen",
      entityType: "fiscal_year",
      entityId: id,
    });
    return row;
  }

  /**
   * Chặn hạch toán vào kỳ đã khóa. Gọi trước khi ghi bất kỳ bút toán nào.
   * Trả về fiscal year phủ ngày (nếu có). Không có kỳ nào phủ = cho phép (chưa thiết lập kỳ).
   */
  async assertPeriodOpen(ctx: Ctx, postingDate: string): Promise<FiscalYear | null> {
    const [fy] = await this.db
      .select()
      .from(fiscalYears)
      .where(
        and(
          eq(fiscalYears.orgId, ctx.orgId),
          lte(fiscalYears.startDate, postingDate),
          gte(fiscalYears.endDate, postingDate),
        ),
      )
      .limit(1);
    if (fy && fy.isClosed) {
      throw new InvalidStateError(
        `Kỳ kế toán ${fy.name} đã khóa — không thể hạch toán vào ${postingDate}`,
      );
    }
    return fy ?? null;
  }
}
