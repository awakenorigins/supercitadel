import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Database } from "../lib/db.js";
import type { Ctx } from "../lib/context.js";
import * as Money from "../lib/money.js";
import { writeAudit } from "../lib/audit.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { bankTransactions, bankRules, type BankTransaction, type BankRule } from "../schema/bank.js";
import { journalEntries, journalLines } from "../schema/journals.js";
import { parseCsv } from "./import.service.js";
import { AccountsService } from "./accounts.service.js";
import { LedgerService } from "./ledger.service.js";

const DAY = 86_400_000;
const daysApart = (a: string, b: string) => Math.abs((Date.parse(a) - Date.parse(b)) / DAY);

/**
 * BankService — đối chiếu ngân hàng.
 *  1. importStatement: nhập sao kê (CSV) → dòng UNMATCHED (amount +vào/−ra).
 *  2. autoMatch: khớp với bút toán đã ghi trên TK tiền gửi (cùng số tiền, gần ngày).
 *  3. applyRules: dòng còn lại → sinh chứng từ theo quy tắc phân loại.
 *  4. reconciliationReport: số dư sổ vs sao kê, danh sách chưa khớp.
 */
export class BankService {
  private acc: AccountsService;
  private ledger: LedgerService;
  constructor(private readonly db: Database) {
    this.acc = new AccountsService(db);
    this.ledger = new LedgerService(db);
  }

  /** Nhập sao kê. Cột CSV: date, description, amount (âm=chi) [, reference]. */
  async importStatement(
    ctx: Ctx,
    bankAccountCode: string,
    csv: string,
  ): Promise<{ imported: number; batch: string }> {
    const bank = await this.acc.requireByCode(ctx, bankAccountCode);
    const rows = parseCsv(csv);
    if (rows.length < 2) throw new ValidationError("CSV cần header + ≥1 dòng dữ liệu");
    const header = rows[0]!.map((h) => h.trim().toLowerCase());
    const idx = (n: string) => header.indexOf(n);
    const iDate = idx("date") >= 0 ? idx("date") : idx("ngày");
    const iDesc = idx("description") >= 0 ? idx("description") : idx("diễn giải");
    const iAmt = idx("amount") >= 0 ? idx("amount") : idx("số tiền");
    const iRef = idx("reference") >= 0 ? idx("reference") : idx("mã gd");
    if (iDate < 0 || iAmt < 0) throw new ValidationError("CSV sao kê cần cột: date, amount");

    const batch = `BATCH-${Date.now()}`;
    const values = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]!;
      const dateRaw = (r[iDate] ?? "").trim();
      const amtRaw = (r[iAmt] ?? "").replace(/[^\d.\-]/g, "");
      if (!dateRaw || !amtRaw) continue;
      values.push({
        orgId: ctx.orgId,
        bankAccountId: bank.id,
        txnDate: dateRaw,
        description: iDesc >= 0 ? (r[iDesc] ?? "").trim() : "",
        reference: iRef >= 0 ? (r[iRef] ?? "").trim() || null : null,
        amount: amtRaw,
        status: "UNMATCHED" as const,
        importBatch: batch,
      });
    }
    if (values.length === 0) throw new ValidationError("Không có dòng hợp lệ trong sao kê");
    await this.db.insert(bankTransactions).values(values);
    await writeAudit(this.db, ctx, {
      action: "bank.import",
      entityType: "bank_transaction",
      detail: { bankAccountCode, imported: values.length, batch },
    });
    return { imported: values.length, batch };
  }

  /** Khớp tự động dòng sao kê với bút toán đã ghi trên TK tiền gửi. */
  async autoMatch(
    ctx: Ctx,
    bankAccountCode: string,
    toleranceDays = 7,
  ): Promise<{ matched: number }> {
    const bank = await this.acc.requireByCode(ctx, bankAccountCode);
    const unmatched = await this.db
      .select()
      .from(bankTransactions)
      .where(
        and(
          eq(bankTransactions.orgId, ctx.orgId),
          eq(bankTransactions.bankAccountId, bank.id),
          eq(bankTransactions.status, "UNMATCHED"),
        ),
      );
    if (unmatched.length === 0) return { matched: 0 };

    // Các bút toán đã bị khớp rồi (loại trừ).
    const usedRows = await this.db
      .select({ id: bankTransactions.matchedEntryId })
      .from(bankTransactions)
      .where(and(eq(bankTransactions.orgId, ctx.orgId), eq(bankTransactions.status, "MATCHED")));
    const usedEntryIds = new Set(usedRows.map((r) => r.id).filter(Boolean) as string[]);

    // Các dòng bút toán trên TK tiền gửi.
    const bankLines = await this.db
      .select({
        entryId: journalLines.entryId,
        debit: journalLines.debit,
        credit: journalLines.credit,
        date: journalEntries.entryDate,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(
        and(
          eq(journalLines.orgId, ctx.orgId),
          eq(journalLines.accountId, bank.id),
          eq(journalEntries.status, "POSTED"),
        ),
      );

    let matched = 0;
    for (const bt of unmatched) {
      const inflow = Money.compare(bt.amount, "0") >= 0;
      const target = Money.abs(bt.amount);
      // inflow: tìm dòng Nợ = target; outflow: tìm dòng Có = target.
      const candidate = bankLines.find((l) => {
        if (usedEntryIds.has(l.entryId)) return false;
        const val = inflow ? l.debit : l.credit;
        if (Money.compare(val, target) !== 0) return false;
        return daysApart(l.date, bt.txnDate) <= toleranceDays;
      });
      if (candidate) {
        await this.db
          .update(bankTransactions)
          .set({ status: "MATCHED", matchedEntryId: candidate.entryId, updatedAt: new Date() })
          .where(and(eq(bankTransactions.id, bt.id), eq(bankTransactions.orgId, ctx.orgId)));
        usedEntryIds.add(candidate.entryId);
        matched++;
      }
    }
    if (matched > 0) {
      await writeAudit(this.db, ctx, { action: "bank.auto_match", entityType: "bank_transaction", detail: { bankAccountCode, matched } });
    }
    return { matched };
  }

  /** Sinh chứng từ cho dòng chưa khớp theo quy tắc phân loại. */
  async applyRules(ctx: Ctx, bankAccountCode: string): Promise<{ created: number }> {
    const bank = await this.acc.requireByCode(ctx, bankAccountCode);
    const rules = await this.db
      .select()
      .from(bankRules)
      .where(eq(bankRules.orgId, ctx.orgId))
      .orderBy(desc(bankRules.priority));
    if (rules.length === 0) return { created: 0 };

    const unmatched = await this.db
      .select()
      .from(bankTransactions)
      .where(
        and(
          eq(bankTransactions.orgId, ctx.orgId),
          eq(bankTransactions.bankAccountId, bank.id),
          eq(bankTransactions.status, "UNMATCHED"),
        ),
      );

    let created = 0;
    for (const bt of unmatched) {
      const desc = (bt.description ?? "").toLowerCase();
      const rule = rules.find((r) => desc.includes(r.matchText.toLowerCase()));
      if (!rule) continue;
      const inflow = Money.compare(bt.amount, "0") >= 0;
      const amt = Money.abs(bt.amount);
      const lines = inflow
        ? [
            { accountId: bank.id, debit: amt },
            { accountId: rule.counterAccountId, credit: amt },
          ]
        : [
            { accountId: rule.counterAccountId, debit: amt },
            { accountId: bank.id, credit: amt },
          ];
      const entry = await this.ledger.createEntry(ctx, {
        entryDate: bt.txnDate,
        memo: `Đối chiếu NH: ${bt.description}`,
        sourceType: "MANUAL",
        post: true,
        lines,
      });
      await this.db
        .update(bankTransactions)
        .set({ status: "MATCHED", matchedEntryId: entry.id, updatedAt: new Date() })
        .where(and(eq(bankTransactions.id, bt.id), eq(bankTransactions.orgId, ctx.orgId)));
      created++;
    }
    if (created > 0) {
      await writeAudit(this.db, ctx, { action: "bank.apply_rules", entityType: "bank_transaction", detail: { bankAccountCode, created } });
    }
    return { created };
  }

  async addRule(ctx: Ctx, matchText: string, counterAccountCode: string, priority = 0): Promise<BankRule> {
    if (!matchText?.trim()) throw new ValidationError("Thiếu chuỗi khớp (matchText)");
    const counter = await this.acc.requireByCode(ctx, counterAccountCode);
    const [row] = await this.db
      .insert(bankRules)
      .values({ orgId: ctx.orgId, matchText, counterAccountId: counter.id, priority })
      .returning();
    return row!;
  }

  async listTransactions(
    ctx: Ctx,
    bankAccountCode: string,
    status?: "UNMATCHED" | "MATCHED",
  ): Promise<BankTransaction[]> {
    const bank = await this.acc.requireByCode(ctx, bankAccountCode);
    const where = status
      ? and(eq(bankTransactions.orgId, ctx.orgId), eq(bankTransactions.bankAccountId, bank.id), eq(bankTransactions.status, status))
      : and(eq(bankTransactions.orgId, ctx.orgId), eq(bankTransactions.bankAccountId, bank.id));
    return this.db.select().from(bankTransactions).where(where).orderBy(asc(bankTransactions.txnDate));
  }

  /** Báo cáo đối chiếu: số dư sổ vs sao kê, số dòng khớp/chưa khớp. */
  async reconciliationReport(
    ctx: Ctx,
    bankAccountCode: string,
  ): Promise<{
    bankAccount: string;
    bookBalance: string;
    statementMovement: string;
    matchedCount: number;
    unmatchedCount: number;
    unmatched: Array<{ txnDate: string; description: string; amount: string }>;
    reconciled: boolean;
  }> {
    const bank = await this.acc.requireByCode(ctx, bankAccountCode);
    // Số dư sổ (GL) của TK tiền gửi.
    const [bal] = await this.db
      .select({
        d: sql<string>`COALESCE(SUM(${journalLines.debit}),0)`,
        c: sql<string>`COALESCE(SUM(${journalLines.credit}),0)`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(
        and(
          eq(journalLines.orgId, ctx.orgId),
          eq(journalLines.accountId, bank.id),
          eq(journalEntries.status, "POSTED"),
        ),
      );
    const bookBalance = Money.sub(bal?.d ?? "0", bal?.c ?? "0");

    const txns = await this.db
      .select({ status: bankTransactions.status, amount: bankTransactions.amount, txnDate: bankTransactions.txnDate, description: bankTransactions.description })
      .from(bankTransactions)
      .where(and(eq(bankTransactions.orgId, ctx.orgId), eq(bankTransactions.bankAccountId, bank.id)));

    const statementMovement = Money.sum(txns.map((t) => t.amount));
    const matchedCount = txns.filter((t) => t.status === "MATCHED").length;
    const unmatchedTxns = txns.filter((t) => t.status === "UNMATCHED");

    return {
      bankAccount: bankAccountCode,
      bookBalance,
      statementMovement,
      matchedCount,
      unmatchedCount: unmatchedTxns.length,
      unmatched: unmatchedTxns.map((t) => ({ txnDate: t.txnDate, description: t.description ?? "", amount: t.amount })),
      reconciled: unmatchedTxns.length === 0,
    };
  }
}
