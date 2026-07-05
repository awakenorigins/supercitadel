import { and, asc, eq, lte } from "drizzle-orm";
import type { Database } from "../lib/db.js";
import type { Ctx } from "../lib/context.js";
import { writeAudit } from "../lib/audit.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { recurringTemplates, type RecurringTemplate } from "../schema/recurring.js";
import { ReceiptsService } from "./receipts.service.js";
import { PaymentsService } from "./payments.service.js";
import { LedgerService } from "./ledger.service.js";

export type RecurringKind = "RECEIPT" | "PAYMENT" | "JOURNAL";
export type RecurringFreq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface CreateRecurringInput {
  name: string;
  kind: RecurringKind;
  frequency: RecurringFreq;
  interval?: number;
  /** Tham số dựng chứng từ (giống input của receipt/payment/journal). */
  payload: Record<string, unknown>;
  startDate: string;
  endDate?: string;
}

/** Cộng thêm 1 chu kỳ vào ngày (YYYY-MM-DD). */
function advanceDate(dateStr: string, freq: RecurringFreq, interval: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  if (freq === "DAILY") d.setUTCDate(d.getUTCDate() + interval);
  else if (freq === "WEEKLY") d.setUTCDate(d.getUTCDate() + 7 * interval);
  else if (freq === "MONTHLY") d.setUTCMonth(d.getUTCMonth() + interval);
  else d.setUTCFullYear(d.getUTCFullYear() + interval);
  return d.toISOString().slice(0, 10);
}

/**
 * RecurringService — mẫu giao dịch định kỳ (tiền thuê, lương, phí cố định...).
 * Khi chạy (runDue), sinh chứng từ cho mọi mẫu tới hạn (nextRunDate ≤ hôm nay),
 * lặp cho tới khi qua hạn hiện tại, rồi dời nextRunDate.
 */
export class RecurringService {
  private receipts: ReceiptsService;
  private payments: PaymentsService;
  private ledger: LedgerService;
  constructor(private readonly db: Database) {
    this.receipts = new ReceiptsService(db);
    this.payments = new PaymentsService(db);
    this.ledger = new LedgerService(db);
  }

  async create(ctx: Ctx, input: CreateRecurringInput): Promise<RecurringTemplate> {
    if (!input.name?.trim()) throw new ValidationError("Thiếu tên mẫu định kỳ");
    if (!input.payload || typeof input.payload !== "object") {
      throw new ValidationError("Thiếu tham số payload cho mẫu định kỳ");
    }
    const [row] = await this.db
      .insert(recurringTemplates)
      .values({
        orgId: ctx.orgId,
        name: input.name,
        kind: input.kind,
        frequency: input.frequency,
        interval: input.interval ?? 1,
        payload: input.payload as never,
        nextRunDate: input.startDate,
        endDate: input.endDate,
      })
      .returning();
    await writeAudit(this.db, ctx, {
      action: "recurring.create",
      entityType: "recurring_template",
      entityId: row!.id,
      detail: { name: input.name, kind: input.kind, frequency: input.frequency },
    });
    return row!;
  }

  async list(ctx: Ctx): Promise<RecurringTemplate[]> {
    return this.db
      .select()
      .from(recurringTemplates)
      .where(eq(recurringTemplates.orgId, ctx.orgId))
      .orderBy(asc(recurringTemplates.nextRunDate));
  }

  async setActive(ctx: Ctx, id: string, active: boolean): Promise<RecurringTemplate> {
    const [row] = await this.db
      .update(recurringTemplates)
      .set({ isActive: active, updatedAt: new Date() })
      .where(and(eq(recurringTemplates.id, id), eq(recurringTemplates.orgId, ctx.orgId)))
      .returning();
    if (!row) throw new NotFoundError("mẫu định kỳ", id);
    return row;
  }

  /** Sinh 1 chứng từ từ payload của mẫu, tại ngày chỉ định. */
  private async generateOne(ctx: Ctx, tpl: RecurringTemplate, runDate: string): Promise<string> {
    const payload = { ...(tpl.payload as Record<string, unknown>), docDate: runDate, post: true };
    if (tpl.kind === "RECEIPT") {
      const r = await this.receipts.create(ctx, payload as never);
      return r.id;
    }
    if (tpl.kind === "PAYMENT") {
      const p = await this.payments.create(ctx, payload as never);
      return p.id;
    }
    const entryPayload = { ...(tpl.payload as Record<string, unknown>), entryDate: runDate, sourceType: "MANUAL", post: true };
    const e = await this.ledger.createEntry(ctx, entryPayload as never);
    return e.id;
  }

  /**
   * Chạy mọi mẫu tới hạn. Với mỗi mẫu, sinh chứng từ cho từng kỳ đã tới
   * (bắt kịp nếu bỏ lỡ nhiều kỳ) cho tới khi nextRunDate > asOf.
   */
  async runDue(
    ctx: Ctx,
    asOf?: string,
  ): Promise<{ generated: number; templates: Array<{ id: string; name: string; count: number; entries: string[] }> }> {
    const today = asOf ?? new Date().toISOString().slice(0, 10);
    const dueTemplates = await this.db
      .select()
      .from(recurringTemplates)
      .where(
        and(
          eq(recurringTemplates.orgId, ctx.orgId),
          eq(recurringTemplates.isActive, true),
          lte(recurringTemplates.nextRunDate, today),
        ),
      );

    let generated = 0;
    const results: Array<{ id: string; name: string; count: number; entries: string[] }> = [];

    for (const tpl of dueTemplates) {
      let next = tpl.nextRunDate;
      let count = 0;
      const entries: string[] = [];
      let runCount = tpl.runCount;
      let lastRun = tpl.lastRunDate;

      // Bắt kịp mọi kỳ đã tới (giới hạn 60 kỳ/lần để an toàn).
      while (next <= today && (!tpl.endDate || next <= tpl.endDate) && count < 60) {
        const id = await this.generateOne(ctx, tpl, next);
        entries.push(id);
        count++;
        runCount++;
        lastRun = next;
        next = advanceDate(next, tpl.frequency, tpl.interval);
      }

      if (count > 0) {
        const stillActive = !tpl.endDate || next <= tpl.endDate;
        await this.db
          .update(recurringTemplates)
          .set({
            nextRunDate: next,
            lastRunDate: lastRun,
            runCount,
            isActive: stillActive,
            updatedAt: new Date(),
          })
          .where(and(eq(recurringTemplates.id, tpl.id), eq(recurringTemplates.orgId, ctx.orgId)));
        generated += count;
        results.push({ id: tpl.id, name: tpl.name, count, entries });
      }
    }

    if (generated > 0) {
      await writeAudit(this.db, ctx, {
        action: "recurring.run",
        entityType: "recurring_template",
        detail: { generated, templates: results.map((r) => ({ id: r.id, count: r.count })) },
      });
    }
    return { generated, templates: results };
  }
}
