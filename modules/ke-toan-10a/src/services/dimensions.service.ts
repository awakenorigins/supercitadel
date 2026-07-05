import { and, asc, eq, gte, lte, sql, isNotNull } from "drizzle-orm";
import type { Database } from "../lib/db.js";
import type { Ctx } from "../lib/context.js";
import * as Money from "../lib/money.js";
import { writeAudit } from "../lib/audit.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { costCenters, type CostCenter } from "../schema/dimensions.js";
import { accounts } from "../schema/accounts.js";
import { journalEntries, journalLines } from "../schema/journals.js";

export type CostCenterType = "DEPARTMENT" | "PROJECT" | "BRANCH" | "PRODUCT" | "OTHER";

export interface CreateCostCenterInput {
  name: string;
  code?: string;
  type?: CostCenterType;
  parentId?: string;
}

/**
 * DimensionsService — kế toán theo bộ phận/dự án (accounting dimensions).
 * Gắn cost_center_id vào dòng bút toán rồi phân tích lãi/lỗ theo chiều.
 */
export class DimensionsService {
  constructor(private readonly db: Database) {}

  async create(ctx: Ctx, input: CreateCostCenterInput): Promise<CostCenter> {
    if (!input.name?.trim()) throw new ValidationError("Thiếu tên bộ phận/dự án");
    const code = input.code ?? (await this.autoCode(ctx, input.type ?? "DEPARTMENT"));
    const [row] = await this.db
      .insert(costCenters)
      .values({
        orgId: ctx.orgId,
        code,
        name: input.name,
        type: input.type ?? "DEPARTMENT",
        parentId: input.parentId,
      })
      .returning();
    await writeAudit(this.db, ctx, {
      action: "cost_center.create",
      entityType: "cost_center",
      entityId: row!.id,
      detail: { code, name: input.name },
    });
    return row!;
  }

  async list(ctx: Ctx): Promise<CostCenter[]> {
    return this.db
      .select()
      .from(costCenters)
      .where(eq(costCenters.orgId, ctx.orgId))
      .orderBy(asc(costCenters.code));
  }

  async findByCode(ctx: Ctx, code: string): Promise<CostCenter | null> {
    const [row] = await this.db
      .select()
      .from(costCenters)
      .where(and(eq(costCenters.orgId, ctx.orgId), eq(costCenters.code, code)))
      .limit(1);
    return row ?? null;
  }

  async findByName(ctx: Ctx, name: string): Promise<CostCenter | null> {
    const [row] = await this.db
      .select()
      .from(costCenters)
      .where(and(eq(costCenters.orgId, ctx.orgId), sql`lower(${costCenters.name}) = lower(${name})`))
      .limit(1);
    return row ?? null;
  }

  async requireByCodeOrName(ctx: Ctx, key: string): Promise<CostCenter> {
    const byCode = await this.findByCode(ctx, key);
    if (byCode) return byCode;
    const byName = await this.findByName(ctx, key);
    if (byName) return byName;
    throw new NotFoundError("bộ phận/dự án", key);
  }

  /**
   * Báo cáo lãi/lỗ theo bộ phận/dự án: gom doanh thu (INCOME) và chi phí
   * (EXPENSE) của các dòng bút toán POSTED có gắn cost_center_id, trong kỳ.
   */
  async profitByCostCenter(
    ctx: Ctx,
    from = "1970-01-01",
    to = new Date().toISOString().slice(0, 10),
  ): Promise<{
    from: string;
    to: string;
    rows: Array<{ costCenterId: string; code: string; name: string; income: string; expense: string; profit: string }>;
    unassigned: { income: string; expense: string };
  }> {
    const rows = await this.db
      .select({
        ccId: journalLines.costCenterId,
        type: accounts.type,
        debit: sql<string>`COALESCE(SUM(${journalLines.debit}),0)`,
        credit: sql<string>`COALESCE(SUM(${journalLines.credit}),0)`,
      })
      .from(journalLines)
      .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(
        and(
          eq(journalLines.orgId, ctx.orgId),
          eq(journalEntries.status, "POSTED"),
          gte(journalEntries.entryDate, from),
          lte(journalEntries.entryDate, to),
          sql`${accounts.type} IN ('INCOME','EXPENSE')`,
        ),
      )
      .groupBy(journalLines.costCenterId, accounts.type);

    const map = new Map<string, { income: string; expense: string }>();
    let unIncome = "0";
    let unExpense = "0";
    for (const r of rows) {
      const incomeAmt = Money.sub(r.credit, r.debit); // doanh thu dư Có
      const expenseAmt = Money.sub(r.debit, r.credit); // chi phí dư Nợ
      if (!r.ccId) {
        if (r.type === "INCOME") unIncome = Money.add(unIncome, incomeAmt);
        else unExpense = Money.add(unExpense, expenseAmt);
        continue;
      }
      const cur = map.get(r.ccId) ?? { income: "0", expense: "0" };
      if (r.type === "INCOME") cur.income = Money.add(cur.income, incomeAmt);
      else cur.expense = Money.add(cur.expense, expenseAmt);
      map.set(r.ccId, cur);
    }

    const ccList = await this.list(ctx);
    const ccInfo = new Map(ccList.map((c) => [c.id, c]));
    const out = [...map.entries()].map(([ccId, v]) => {
      const cc = ccInfo.get(ccId);
      return {
        costCenterId: ccId,
        code: cc?.code ?? "?",
        name: cc?.name ?? "(đã xóa)",
        income: v.income,
        expense: v.expense,
        profit: Money.sub(v.income, v.expense),
      };
    });
    out.sort((a, b) => (Money.compare(b.profit, a.profit) > 0 ? 1 : -1));

    return { from, to, rows: out, unassigned: { income: unIncome, expense: unExpense } };
  }

  private async autoCode(ctx: Ctx, type: CostCenterType): Promise<string> {
    const prefix = { DEPARTMENT: "BP", PROJECT: "DA", BRANCH: "CN", PRODUCT: "SP", OTHER: "CC" }[type];
    const existing = await this.db
      .select({ code: costCenters.code })
      .from(costCenters)
      .where(eq(costCenters.orgId, ctx.orgId));
    let n = existing.length + 1;
    let code = `${prefix}${String(n).padStart(3, "0")}`;
    const set = new Set(existing.map((e) => e.code));
    while (set.has(code)) {
      n++;
      code = `${prefix}${String(n).padStart(3, "0")}`;
    }
    return code;
  }
}
