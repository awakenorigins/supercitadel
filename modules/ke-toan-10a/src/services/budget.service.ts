import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Database } from "../lib/db.js";
import type { Ctx } from "../lib/context.js";
import * as Money from "../lib/money.js";
import { writeAudit } from "../lib/audit.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { budgets, type Budget } from "../schema/budgets.js";
import { accounts } from "../schema/accounts.js";
import { journalEntries, journalLines } from "../schema/journals.js";
import { AccountsService } from "./accounts.service.js";

export interface SetBudgetInput {
  fiscalYear: string;
  accountCode: string;
  amount: string;
  costCenterId?: string;
}

/**
 * BudgetService — dự toán ngân sách theo tài khoản/năm, so sánh với thực tế
 * (số phát sinh trên sổ) để tính chênh lệch và % đã dùng.
 */
export class BudgetService {
  private acc: AccountsService;
  constructor(private readonly db: Database) {
    this.acc = new AccountsService(db);
  }

  /** Đặt/cập nhật ngân sách (upsert theo năm + TK + bộ phận). */
  async setBudget(ctx: Ctx, input: SetBudgetInput): Promise<Budget> {
    if (Money.compare(input.amount, "0") < 0) throw new ValidationError("Ngân sách không âm");
    const account = await this.acc.requireByCode(ctx, input.accountCode);

    // Tìm bản ghi hiện có (xử lý NULL cost_center thủ công để upsert đúng).
    const existing = await this.db
      .select()
      .from(budgets)
      .where(
        and(
          eq(budgets.orgId, ctx.orgId),
          eq(budgets.fiscalYear, input.fiscalYear),
          eq(budgets.accountId, account.id),
          input.costCenterId
            ? eq(budgets.costCenterId, input.costCenterId)
            : sql`${budgets.costCenterId} IS NULL`,
        ),
      )
      .limit(1);

    let row: Budget;
    if (existing[0]) {
      const [updated] = await this.db
        .update(budgets)
        .set({ amount: input.amount, updatedAt: new Date() })
        .where(and(eq(budgets.id, existing[0].id), eq(budgets.orgId, ctx.orgId)))
        .returning();
      row = updated!;
    } else {
      const [inserted] = await this.db
        .insert(budgets)
        .values({
          orgId: ctx.orgId,
          fiscalYear: input.fiscalYear,
          accountId: account.id,
          costCenterId: input.costCenterId,
          amount: input.amount,
        })
        .returning();
      row = inserted!;
    }
    await writeAudit(this.db, ctx, {
      action: "budget.set",
      entityType: "budget",
      entityId: row.id,
      detail: { fiscalYear: input.fiscalYear, accountCode: input.accountCode, amount: input.amount },
    });
    return row;
  }

  async list(ctx: Ctx, fiscalYear: string): Promise<Budget[]> {
    return this.db
      .select()
      .from(budgets)
      .where(and(eq(budgets.orgId, ctx.orgId), eq(budgets.fiscalYear, fiscalYear)));
  }

  /**
   * So sánh dự toán vs thực tế cho một năm. Thực tế = số phát sinh ròng trên
   * sổ (INCOME dư Có, EXPENSE dư Nợ, còn lại theo số dư thường) trong năm.
   */
  async budgetVsActual(
    ctx: Ctx,
    fiscalYear: string,
  ): Promise<{
    fiscalYear: string;
    rows: Array<{
      accountCode: string;
      accountName: string;
      budget: string;
      actual: string;
      variance: string;
      usedPct: number;
      overBudget: boolean;
    }>;
    totalBudget: string;
    totalActual: string;
  }> {
    const from = `${fiscalYear}-01-01`;
    const to = `${fiscalYear}-12-31`;
    const budgetRows = await this.list(ctx, fiscalYear);
    if (budgetRows.length === 0) {
      return { fiscalYear, rows: [], totalBudget: "0", totalActual: "0" };
    }

    // Gom ngân sách theo TK (cộng các bộ phận nếu có nhiều dòng).
    const byAccount = new Map<string, string>();
    for (const b of budgetRows) {
      byAccount.set(b.accountId, Money.add(byAccount.get(b.accountId) ?? "0", b.amount));
    }

    // Thực tế theo TK trong năm.
    const actualRows = await this.db
      .select({
        accountId: journalLines.accountId,
        code: accounts.code,
        name: accounts.name,
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
        ),
      )
      .groupBy(journalLines.accountId, accounts.code, accounts.name, accounts.type);

    const actualByAcc = new Map<string, { code: string; name: string; actual: string }>();
    for (const r of actualRows) {
      const actual =
        r.type === "INCOME"
          ? Money.sub(r.credit, r.debit)
          : r.type === "EXPENSE"
            ? Money.sub(r.debit, r.credit)
            : Money.sub(r.debit, r.credit);
      actualByAcc.set(r.accountId, { code: r.code, name: r.name, actual });
    }

    // Lấy thông tin TK cho các dòng ngân sách (kể cả khi chưa phát sinh).
    const accInfo = new Map<string, { code: string; name: string }>();
    for (const [accId, info] of actualByAcc) accInfo.set(accId, { code: info.code, name: info.name });
    const missing = [...byAccount.keys()].filter((id) => !accInfo.has(id));
    if (missing.length > 0) {
      const rows = await this.db
        .select({ id: accounts.id, code: accounts.code, name: accounts.name })
        .from(accounts)
        .where(and(eq(accounts.orgId, ctx.orgId), inArray(accounts.id, missing)));
      for (const r of rows) accInfo.set(r.id, { code: r.code, name: r.name });
    }

    let totalBudget = "0";
    let totalActual = "0";
    const rows = [...byAccount.entries()].map(([accId, budget]) => {
      const actualInfo = actualByAcc.get(accId);
      const actual = actualInfo?.actual ?? "0";
      const info = accInfo.get(accId) ?? { code: "?", name: "?" };
      const variance = Money.sub(budget, actual); // dương = còn ngân sách
      const usedPct = Money.compare(budget, "0") > 0 ? Math.round((Number(actual) / Number(budget)) * 100) : 0;
      totalBudget = Money.add(totalBudget, budget);
      totalActual = Money.add(totalActual, actual);
      return {
        accountCode: info.code,
        accountName: info.name,
        budget,
        actual,
        variance,
        usedPct,
        overBudget: Money.compare(actual, budget) > 0,
      };
    });
    rows.sort((a, b) => b.usedPct - a.usedPct);

    return { fiscalYear, rows, totalBudget, totalActual };
  }
}
