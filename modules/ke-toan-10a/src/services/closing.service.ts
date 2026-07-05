import { and, eq, gte, lte, sql, inArray } from "drizzle-orm";
import type { Database } from "../lib/db.js";
import type { Ctx } from "../lib/context.js";
import * as Money from "../lib/money.js";
import { writeAudit } from "../lib/audit.js";
import { InvalidStateError, NotFoundError } from "../lib/errors.js";
import { accounts } from "../schema/accounts.js";
import { journalEntries, journalLines } from "../schema/journals.js";
import { fiscalYears } from "../schema/fiscal.js";
import { LedgerService } from "./ledger.service.js";

export interface ClosingResult {
  fiscalYear: string;
  totalIncome: string;
  totalExpense: string;
  netResult: string;
  isProfit: boolean;
  entries: string[]; // entry IDs của các bút toán kết chuyển
}

/**
 * ClosingService — Bút toán kết chuyển cuối kỳ (chuẩn kế toán VN, tinh hoa
 * bổ sung theo TT133). Cuối niên độ, kết chuyển doanh thu & chi phí về TK 911
 * (Xác định kết quả kinh doanh), rồi kết chuyển lãi/lỗ về 421.
 *
 * Trình tự:
 *   1. Nợ [511,515,711...] / Có 911   (kết chuyển doanh thu)
 *   2. Nợ 911 / Có [632,635,641,642,811,821...]  (kết chuyển chi phí)
 *   3. Lãi: Nợ 911 / Có 421   ·   Lỗ: Nợ 421 / Có 911
 * Sau đó khóa kỳ.
 */
export class ClosingService {
  private ledger: LedgerService;
  constructor(private readonly db: Database) {
    this.ledger = new LedgerService(db);
  }

  /** Số dư từng TK theo loại trong kỳ (chỉ POSTED). */
  private async balancesByType(
    ctx: Ctx,
    type: "INCOME" | "EXPENSE",
    from: string,
    to: string,
  ): Promise<Array<{ id: string; code: string; balance: string }>> {
    const rows = await this.db
      .select({
        id: accounts.id,
        code: accounts.code,
        debit: sql<string>`COALESCE(SUM(${journalLines.debit}),0)`,
        credit: sql<string>`COALESCE(SUM(${journalLines.credit}),0)`,
      })
      .from(journalLines)
      .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(
        and(
          eq(journalLines.orgId, ctx.orgId),
          eq(accounts.type, type),
          eq(journalEntries.status, "POSTED"),
          gte(journalEntries.entryDate, from),
          lte(journalEntries.entryDate, to),
        ),
      )
      .groupBy(accounts.id, accounts.code);

    return rows
      .map((r) => {
        // Doanh thu dư Có (credit - debit); chi phí dư Nợ (debit - credit).
        const bal =
          type === "INCOME"
            ? Money.sub(r.credit, r.debit)
            : Money.sub(r.debit, r.credit);
        return { id: r.id, code: r.code, balance: bal };
      })
      .filter((r) => Money.compare(r.balance, "0") !== 0);
  }

  /** Kết chuyển cuối kỳ + khóa niên độ. */
  async closeFiscalYear(ctx: Ctx, fiscalYearId: string): Promise<ClosingResult> {
    const [fy] = await this.db
      .select()
      .from(fiscalYears)
      .where(and(eq(fiscalYears.id, fiscalYearId), eq(fiscalYears.orgId, ctx.orgId)))
      .limit(1);
    if (!fy) throw new NotFoundError("năm tài chính", fiscalYearId);
    if (fy.isClosed) throw new InvalidStateError(`Niên độ ${fy.name} đã khóa`);

    const acc911 = await this.requireAcc(ctx, "911");
    const acc421 = await this.requireAcc(ctx, "421");
    const income = await this.balancesByType(ctx, "INCOME", fy.startDate, fy.endDate);
    const expense = await this.balancesByType(ctx, "EXPENSE", fy.startDate, fy.endDate);

    const totalIncome = Money.sum(income.map((r) => r.balance));
    const totalExpense = Money.sum(expense.map((r) => r.balance));
    const net = Money.sub(totalIncome, totalExpense);
    const isProfit = Money.compare(net, "0") >= 0;
    const entryIds: string[] = [];
    const closeDate = fy.endDate;

    // 1. Kết chuyển doanh thu: Nợ [income] / Có 911.
    if (Money.compare(totalIncome, "0") > 0) {
      const e = await this.ledger.createEntry(ctx, {
        entryDate: closeDate,
        memo: `Kết chuyển doanh thu cuối kỳ ${fy.name}`,
        sourceType: "MANUAL",
        post: true,
        lines: [
          ...income.map((r) => ({ accountId: r.id, debit: r.balance })),
          { accountId: acc911.id, credit: totalIncome },
        ],
      });
      entryIds.push(e.id);
    }

    // 2. Kết chuyển chi phí: Nợ 911 / Có [expense].
    if (Money.compare(totalExpense, "0") > 0) {
      const e = await this.ledger.createEntry(ctx, {
        entryDate: closeDate,
        memo: `Kết chuyển chi phí cuối kỳ ${fy.name}`,
        sourceType: "MANUAL",
        post: true,
        lines: [
          { accountId: acc911.id, debit: totalExpense },
          ...expense.map((r) => ({ accountId: r.id, credit: r.balance })),
        ],
      });
      entryIds.push(e.id);
    }

    // 3. Kết chuyển KQKD về 421.
    const absNet = Money.abs(net);
    if (Money.compare(absNet, "0") > 0) {
      const e = await this.ledger.createEntry(ctx, {
        entryDate: closeDate,
        memo: isProfit
          ? `Kết chuyển lãi cuối kỳ ${fy.name} vào 421`
          : `Kết chuyển lỗ cuối kỳ ${fy.name} vào 421`,
        sourceType: "MANUAL",
        post: true,
        lines: isProfit
          ? [
              { accountId: acc911.id, debit: absNet },
              { accountId: acc421.id, credit: absNet },
            ]
          : [
              { accountId: acc421.id, debit: absNet },
              { accountId: acc911.id, credit: absNet },
            ],
      });
      entryIds.push(e.id);
    }

    // Khóa niên độ.
    await this.db
      .update(fiscalYears)
      .set({ isClosed: true, closedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(fiscalYears.id, fiscalYearId), eq(fiscalYears.orgId, ctx.orgId)));

    await writeAudit(this.db, ctx, {
      action: "closing.close_period",
      entityType: "fiscal_year",
      entityId: fiscalYearId,
      detail: { fiscalYear: fy.name, netResult: net, isProfit, entries: entryIds },
    });

    return {
      fiscalYear: fy.name,
      totalIncome,
      totalExpense,
      netResult: net,
      isProfit,
      entries: entryIds,
    };
  }

  private async requireAcc(ctx: Ctx, code: string) {
    const [a] = await this.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.orgId, ctx.orgId), eq(accounts.code, code)))
      .limit(1);
    if (!a)
      throw new NotFoundError(
        "tài khoản",
        `${code} (cần cho kết chuyển — chạy /setup để seed đủ TK)`,
      );
    return a;
  }
}
