import { and, asc, desc, eq, gte, lte, inArray, sql } from "drizzle-orm";
import type { Database } from "../lib/db.js";
import type { Ctx } from "../lib/context.js";
import * as Money from "../lib/money.js";
import { accounts } from "../schema/accounts.js";
import { journalEntries, journalLines } from "../schema/journals.js";
import { invoices, bills } from "../schema/documents.js";
import { contacts } from "../schema/contacts.js";
import type { AccountType } from "../types/index.js";

export interface LedgerRow {
  date: string;
  entryNo: string;
  memo: string | null;
  debit: string;
  credit: string;
  running: string;
}

export interface TrialBalanceRow {
  code: string;
  name: string;
  type: AccountType;
  debit: string;
  credit: string;
}

/**
 * ReportsService — mọi báo cáo tài chính đọc từ bút toán đã POSTED.
 * Tất cả đều scope theo org (tenant isolation) và tính bằng Money BigInt.
 */
export class ReportsService {
  constructor(private readonly db: Database) {}

  /**
   * Sổ cái một tài khoản (General Ledger) — liệt kê phát sinh + số dư luỹ kế.
   */
  async generalLedger(
    ctx: Ctx,
    accountCode: string,
    from?: string,
    to?: string,
  ): Promise<{
    account: { code: string; name: string };
    opening: string;
    rows: LedgerRow[];
    closing: string;
  }> {
    const [acc] = await this.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.orgId, ctx.orgId), eq(accounts.code, accountCode)))
      .limit(1);
    if (!acc) {
      return {
        account: { code: accountCode, name: "(không tìm thấy)" },
        opening: "0",
        rows: [],
        closing: "0",
      };
    }

    const conds = [
      eq(journalLines.orgId, ctx.orgId),
      eq(journalLines.accountId, acc.id),
      eq(journalEntries.status, "POSTED"),
    ];
    if (from) conds.push(gte(journalEntries.entryDate, from));
    if (to) conds.push(lte(journalEntries.entryDate, to));

    const lines = await this.db
      .select({
        date: journalEntries.entryDate,
        entryNo: journalEntries.entryNo,
        memo: journalLines.memo,
        entryMemo: journalEntries.memo,
        debit: journalLines.debit,
        credit: journalLines.credit,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(and(...conds))
      .orderBy(asc(journalEntries.entryDate), asc(journalEntries.entryNo));

    // Số dư đầu = openingBalance + phát sinh TRƯỚC khoảng from (nếu có from).
    let opening = acc.openingBalance;
    if (from) {
      const [prior] = await this.db
        .select({
          debit: sql<string>`COALESCE(SUM(${journalLines.debit}),0)`,
          credit: sql<string>`COALESCE(SUM(${journalLines.credit}),0)`,
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
        .where(
          and(
            eq(journalLines.orgId, ctx.orgId),
            eq(journalLines.accountId, acc.id),
            eq(journalEntries.status, "POSTED"),
            sql`${journalEntries.entryDate} < ${from}`,
          ),
        );
      const priorMove =
        acc.normalBalance === "DEBIT"
          ? Money.sub(prior?.debit ?? "0", prior?.credit ?? "0")
          : Money.sub(prior?.credit ?? "0", prior?.debit ?? "0");
      opening = Money.add(opening, priorMove);
    }

    let running = opening;
    const rows: LedgerRow[] = lines.map((l) => {
      const move =
        acc.normalBalance === "DEBIT"
          ? Money.sub(l.debit, l.credit)
          : Money.sub(l.credit, l.debit);
      running = Money.add(running, move);
      return {
        date: l.date,
        entryNo: l.entryNo,
        memo: l.memo ?? l.entryMemo,
        debit: l.debit,
        credit: l.credit,
        running,
      };
    });

    return {
      account: { code: acc.code, name: acc.name },
      opening,
      rows,
      closing: running,
    };
  }

  /**
   * Bảng cân đối số phát sinh (Trial Balance).
   * Với mỗi tài khoản: tổng phát sinh Nợ/Có trong kỳ.
   * Tổng cột Nợ PHẢI bằng tổng cột Có (kiểm chứng ghi kép).
   */
  async trialBalance(
    ctx: Ctx,
    from?: string,
    to?: string,
  ): Promise<{
    rows: TrialBalanceRow[];
    totalDebit: string;
    totalCredit: string;
    balanced: boolean;
  }> {
    const conds = [
      eq(journalLines.orgId, ctx.orgId),
      eq(journalEntries.status, "POSTED"),
    ];
    if (from) conds.push(gte(journalEntries.entryDate, from));
    if (to) conds.push(lte(journalEntries.entryDate, to));

    const agg = await this.db
      .select({
        code: accounts.code,
        name: accounts.name,
        type: accounts.type,
        debit: sql<string>`COALESCE(SUM(${journalLines.debit}),0)`,
        credit: sql<string>`COALESCE(SUM(${journalLines.credit}),0)`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
      .where(and(...conds))
      .groupBy(accounts.code, accounts.name, accounts.type)
      .orderBy(asc(accounts.code));

    let totalDebit = "0";
    let totalCredit = "0";
    const rows: TrialBalanceRow[] = agg.map((r) => {
      totalDebit = Money.add(totalDebit, r.debit);
      totalCredit = Money.add(totalCredit, r.credit);
      return {
        code: r.code,
        name: r.name,
        type: r.type as AccountType,
        debit: r.debit,
        credit: r.credit,
      };
    });

    return {
      rows,
      totalDebit,
      totalCredit,
      balanced: Money.compare(totalDebit, totalCredit) === 0,
    };
  }

  /**
   * Báo cáo kết quả kinh doanh (P&L / Income Statement).
   * Lãi/Lỗ = Tổng Doanh thu (INCOME) - Tổng Chi phí (EXPENSE) trong kỳ.
   */
  async profitAndLoss(
    ctx: Ctx,
    from?: string,
    to?: string,
  ): Promise<{
    income: Array<{ code: string; name: string; amount: string }>;
    expense: Array<{ code: string; name: string; amount: string }>;
    totalIncome: string;
    totalExpense: string;
    netProfit: string;
  }> {
    const tb = await this.trialBalance(ctx, from, to);

    const income: Array<{ code: string; name: string; amount: string }> = [];
    const expense: Array<{ code: string; name: string; amount: string }> = [];
    let totalIncome = "0";
    let totalExpense = "0";

    for (const r of tb.rows) {
      if (r.type === "INCOME") {
        // Doanh thu số dư Có → phát sinh Có - Nợ.
        const amt = Money.sub(r.credit, r.debit);
        income.push({ code: r.code, name: r.name, amount: amt });
        totalIncome = Money.add(totalIncome, amt);
      } else if (r.type === "EXPENSE") {
        // Chi phí số dư Nợ → phát sinh Nợ - Có.
        const amt = Money.sub(r.debit, r.credit);
        expense.push({ code: r.code, name: r.name, amount: amt });
        totalExpense = Money.add(totalExpense, amt);
      }
    }

    return {
      income,
      expense,
      totalIncome,
      totalExpense,
      netProfit: Money.sub(totalIncome, totalExpense),
    };
  }

  /**
   * Bảng cân đối kế toán (Balance Sheet) tại một thời điểm.
   * Tài sản = Nợ phải trả + Vốn chủ sở hữu (+ Lãi/Lỗ trong kỳ).
   */
  async balanceSheet(
    ctx: Ctx,
    asOf?: string,
  ): Promise<{
    assets: Array<{ code: string; name: string; amount: string }>;
    liabilities: Array<{ code: string; name: string; amount: string }>;
    equity: Array<{ code: string; name: string; amount: string }>;
    totalAssets: string;
    totalLiabilities: string;
    totalEquity: string;
    retainedEarnings: string;
    balanced: boolean;
  }> {
    // Lấy toàn bộ tài khoản + số dư tính đến asOf.
    const allAccounts = await this.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.orgId, ctx.orgId), eq(accounts.isPostable, true)))
      .orderBy(asc(accounts.code));

    const assets: Array<{ code: string; name: string; amount: string }> = [];
    const liabilities: Array<{ code: string; name: string; amount: string }> =
      [];
    const equity: Array<{ code: string; name: string; amount: string }> = [];
    let totalAssets = "0";
    let totalLiabilities = "0";
    let totalEquity = "0";

    for (const acc of allAccounts) {
      const conds = [
        eq(journalLines.orgId, ctx.orgId),
        eq(journalLines.accountId, acc.id),
        eq(journalEntries.status, "POSTED"),
      ];
      if (asOf) conds.push(lte(journalEntries.entryDate, asOf));

      const [agg] = await this.db
        .select({
          debit: sql<string>`COALESCE(SUM(${journalLines.debit}),0)`,
          credit: sql<string>`COALESCE(SUM(${journalLines.credit}),0)`,
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
        .where(and(...conds));

      const move =
        acc.normalBalance === "DEBIT"
          ? Money.sub(agg?.debit ?? "0", agg?.credit ?? "0")
          : Money.sub(agg?.credit ?? "0", agg?.debit ?? "0");
      const balance = Money.add(acc.openingBalance, move);

      if (Money.isZero(balance)) continue;

      const item = { code: acc.code, name: acc.name, amount: balance };
      if (acc.type === "ASSET") {
        assets.push(item);
        totalAssets = Money.add(totalAssets, balance);
      } else if (acc.type === "LIABILITY") {
        liabilities.push(item);
        totalLiabilities = Money.add(totalLiabilities, balance);
      } else if (acc.type === "EQUITY") {
        equity.push(item);
        totalEquity = Money.add(totalEquity, balance);
      }
    }

    // Lãi/lỗ chưa phân phối = doanh thu - chi phí (đưa vào vốn chủ).
    const pnl = await this.profitAndLoss(ctx, undefined, asOf);
    const retainedEarnings = pnl.netProfit;
    const equityWithPnl = Money.add(totalEquity, retainedEarnings);

    return {
      assets,
      liabilities,
      equity,
      totalAssets,
      totalLiabilities,
      totalEquity: equityWithPnl,
      retainedEarnings,
      balanced:
        Money.compare(
          totalAssets,
          Money.add(totalLiabilities, equityWithPnl),
        ) === 0,
    };
  }

  /**
   * Tổng quan tài chính nhanh (Dashboard) cho Tiểu Tâm trả lời tức thì.
   */
  async dashboard(
    ctx: Ctx,
    from?: string,
    to?: string,
  ): Promise<{
    cash: string;
    receivables: string;
    payables: string;
    revenue: string;
    expense: string;
    profit: string;
  }> {
    const balanceOf = async (code: string): Promise<string> => {
      const [acc] = await this.db
        .select()
        .from(accounts)
        .where(and(eq(accounts.orgId, ctx.orgId), eq(accounts.code, code)))
        .limit(1);
      if (!acc) return "0";
      const conds = [
        eq(journalLines.orgId, ctx.orgId),
        eq(journalLines.accountId, acc.id),
        eq(journalEntries.status, "POSTED"),
      ];
      if (to) conds.push(lte(journalEntries.entryDate, to));
      const [agg] = await this.db
        .select({
          debit: sql<string>`COALESCE(SUM(${journalLines.debit}),0)`,
          credit: sql<string>`COALESCE(SUM(${journalLines.credit}),0)`,
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
        .where(and(...conds));
      const move =
        acc.normalBalance === "DEBIT"
          ? Money.sub(agg?.debit ?? "0", agg?.credit ?? "0")
          : Money.sub(agg?.credit ?? "0", agg?.debit ?? "0");
      return Money.add(acc.openingBalance, move);
    };

    const pnl = await this.profitAndLoss(ctx, from, to);
    // Tiền = 111 + 112.
    const cash = Money.add(await balanceOf("111"), await balanceOf("112"));

    return {
      cash,
      receivables: await balanceOf("131"),
      payables: await balanceOf("331"),
      revenue: pnl.totalIncome,
      expense: pnl.totalExpense,
      profit: pnl.netProfit,
    };
  }

  /* ================================================================ */
  /* GEM 1: BÁO CÁO TUỔI NỢ (Aging) — tinh hoa từ 1A                   */
  /* ================================================================ */
  /**
   * Chia công nợ còn lại theo số ngày quá hạn tính từ hạn thanh toán
   * (dueDate, hoặc docDate nếu không đặt hạn), nhóm theo đối tác.
   * type='sales' → phải thu (invoices); type='purchase' → phải trả (bills).
   * Buckets: current (chưa tới hạn) · 1-30 · 31-60 · 61-90 · >90 ngày.
   */
  async aging(
    ctx: Ctx,
    type: "sales" | "purchase" = "sales",
    asOf?: string,
  ): Promise<{
    asOf: string;
    type: "sales" | "purchase";
    parties: Array<{
      contactId: string | null;
      buckets: Record<string, string>;
      total: string;
    }>;
    totals: Record<string, string>;
    grandTotal: string;
  }> {
    const at = asOf ?? new Date().toISOString().slice(0, 10);
    const DAY = 86_400_000;
    const daysBetween = (a: string, b: string) =>
      Math.floor((Date.parse(a) - Date.parse(b)) / DAY);
    const bucketOf = (overdue: number) =>
      overdue <= 0
        ? "current"
        : overdue <= 30
          ? "d1_30"
          : overdue <= 60
            ? "d31_60"
            : overdue <= 90
              ? "d61_90"
              : "d90_plus";
    const emptyBuckets = () => ({
      current: "0",
      d1_30: "0",
      d31_60: "0",
      d61_90: "0",
      d90_plus: "0",
    });

    // Lấy chứng từ POSTED, còn công nợ (total > amountPaid).
    const rows =
      type === "sales"
        ? await this.db
            .select({
              contactId: invoices.contactId,
              total: invoices.total,
              paid: invoices.amountPaid,
              dueDate: invoices.dueDate,
              docDate: invoices.docDate,
            })
            .from(invoices)
            .where(
              and(
                eq(invoices.orgId, ctx.orgId),
                eq(invoices.status, "POSTED"),
              ),
            )
        : await this.db
            .select({
              contactId: bills.contactId,
              total: bills.total,
              paid: bills.amountPaid,
              dueDate: bills.dueDate,
              docDate: bills.docDate,
            })
            .from(bills)
            .where(
              and(eq(bills.orgId, ctx.orgId), eq(bills.status, "POSTED")),
            );

    const byParty = new Map<
      string,
      { contactId: string | null; buckets: Record<string, string>; total: string }
    >();
    const totals = emptyBuckets() as Record<string, string>;
    let grandTotal = "0";

    for (const r of rows) {
      const outstanding = Money.sub(r.total, r.paid);
      if (Money.compare(outstanding, "0") <= 0) continue;
      const due = r.dueDate ?? r.docDate;
      const overdue = daysBetween(at, due);
      const key = bucketOf(overdue);
      const partyKey = r.contactId ?? "__none__";
      let p = byParty.get(partyKey);
      if (!p) {
        p = { contactId: r.contactId, buckets: emptyBuckets() as Record<string, string>, total: "0" };
        byParty.set(partyKey, p);
      }
      p.buckets[key] = Money.add(p.buckets[key]!, outstanding);
      p.total = Money.add(p.total, outstanding);
      totals[key] = Money.add(totals[key]!, outstanding);
      grandTotal = Money.add(grandTotal, outstanding);
    }

    const parties = [...byParty.values()].sort(
      (a, b) => Money.compare(b.total, a.total),
    );
    return { asOf: at, type, parties, totals, grandTotal };
  }

  /* ================================================================ */
  /* GEM 2: CÔNG NỢ THEO ĐỐI TÁC (Outstanding) — tinh hoa từ accpro   */
  /* ================================================================ */
  /** Tổng công nợ còn lại của từng đối tác (gộp mọi hoá đơn). */
  async outstandingByParty(
    ctx: Ctx,
    type: "sales" | "purchase" = "sales",
  ): Promise<{
    type: "sales" | "purchase";
    parties: Array<{ contactId: string | null; outstanding: string; count: number }>;
    grandTotal: string;
  }> {
    const rows =
      type === "sales"
        ? await this.db
            .select({
              contactId: invoices.contactId,
              total: invoices.total,
              paid: invoices.amountPaid,
            })
            .from(invoices)
            .where(and(eq(invoices.orgId, ctx.orgId), eq(invoices.status, "POSTED")))
        : await this.db
            .select({
              contactId: bills.contactId,
              total: bills.total,
              paid: bills.amountPaid,
            })
            .from(bills)
            .where(and(eq(bills.orgId, ctx.orgId), eq(bills.status, "POSTED")));

    const byParty = new Map<string, { contactId: string | null; outstanding: string; count: number }>();
    let grandTotal = "0";
    for (const r of rows) {
      const out = Money.sub(r.total, r.paid);
      if (Money.compare(out, "0") <= 0) continue;
      const key = r.contactId ?? "__none__";
      let p = byParty.get(key);
      if (!p) {
        p = { contactId: r.contactId, outstanding: "0", count: 0 };
        byParty.set(key, p);
      }
      p.outstanding = Money.add(p.outstanding, out);
      p.count += 1;
      grandTotal = Money.add(grandTotal, out);
    }
    const parties = [...byParty.values()].sort((a, b) => Money.compare(b.outstanding, a.outstanding));
    return { type, parties, grandTotal };
  }

  /* ================================================================ */
  /* GEM 3: TỰ-AUDIT TOÀN VẸN SỔ (Integrity) — tinh hoa từ 1A          */
  /* ================================================================ */
  /**
   * 3 kiểm tra, tất cả phải ok thì sổ mới lành:
   *  (1) Σ Nợ toàn sổ (POSTED) = Σ Có toàn sổ;
   *  (2) mỗi bút toán POSTED cân;
   *  (3) không có dòng GL mồ côi (trỏ tới bút toán/tài khoản không tồn tại trong org).
   */
  async integrityCheck(
    ctx: Ctx,
  ): Promise<{ ok: boolean; checks: Array<{ name: string; ok: boolean; detail: string }> }> {
    const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

    // (1) Global balanced (chỉ tính bút toán POSTED).
    const [g] = await this.db
      .select({
        d: sql<string>`COALESCE(SUM(${journalLines.debit}),0)`,
        c: sql<string>`COALESCE(SUM(${journalLines.credit}),0)`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(and(eq(journalLines.orgId, ctx.orgId), eq(journalEntries.status, "POSTED")));
    const gd = g?.d ?? "0";
    const gc = g?.c ?? "0";
    checks.push({
      name: "global_balanced",
      ok: Money.compare(gd, gc) === 0,
      detail: `Σ Nợ ${Money.formatVND(gd)} vs Σ Có ${Money.formatVND(gc)}`,
    });

    // (2) Mỗi bút toán cân.
    const perEntry = await this.db
      .select({
        entryId: journalLines.entryId,
        d: sql<string>`COALESCE(SUM(${journalLines.debit}),0)`,
        c: sql<string>`COALESCE(SUM(${journalLines.credit}),0)`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(and(eq(journalLines.orgId, ctx.orgId), eq(journalEntries.status, "POSTED")))
      .groupBy(journalLines.entryId);
    const unbalanced = perEntry.filter((v) => Money.compare(v.d, v.c) !== 0);
    checks.push({
      name: "every_entry_balanced",
      ok: unbalanced.length === 0,
      detail: `${unbalanced.length} bút toán lệch / ${perEntry.length} bút toán`,
    });

    // (3) Không dòng GL mồ côi.
    const acctIds = new Set(
      (await this.db.select({ id: accounts.id }).from(accounts).where(eq(accounts.orgId, ctx.orgId))).map((a) => a.id),
    );
    const entryIds = new Set(
      (await this.db.select({ id: journalEntries.id }).from(journalEntries).where(eq(journalEntries.orgId, ctx.orgId))).map((e) => e.id),
    );
    const glRows = await this.db
      .select({ accountId: journalLines.accountId, entryId: journalLines.entryId })
      .from(journalLines)
      .where(eq(journalLines.orgId, ctx.orgId));
    const orphans = glRows.filter((r) => !acctIds.has(r.accountId) || !entryIds.has(r.entryId));
    checks.push({
      name: "no_orphan_gl",
      ok: orphans.length === 0,
      detail: `${orphans.length} dòng GL mồ côi`,
    });

    return { ok: checks.every((c) => c.ok), checks };
  }

  /* ================================================================ */
  /* GEM VN: SAO KÊ CÔNG NỢ THEO ĐỐI TÁC (Statement of Account)        */
  /* ================================================================ */
  /**
   * Sao kê công nợ 1 đối tác: liệt kê phát sinh trên TK phải thu/phải trả
   * (131/331) có contactId = đối tác, theo thời gian, kèm số dư lũy kế.
   */
  async statementOfAccount(
    ctx: Ctx,
    contactId: string,
    from = "1970-01-01",
    to = new Date().toISOString().slice(0, 10),
  ): Promise<{
    contact: { id: string; name: string } | null;
    opening: string;
    rows: Array<{ date: string; entryNo: string; memo: string; debit: string; credit: string; balance: string }>;
    closing: string;
  }> {
    const [contact] = await this.db
      .select({ id: contacts.id, name: contacts.name })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.orgId, ctx.orgId)))
      .limit(1);
    if (!contact) return { contact: null, opening: "0", rows: [], closing: "0" };

    // Số dư đầu kỳ (trước from).
    const [openRow] = await this.db
      .select({
        d: sql<string>`COALESCE(SUM(${journalLines.debit}),0)`,
        c: sql<string>`COALESCE(SUM(${journalLines.credit}),0)`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(
        and(
          eq(journalLines.orgId, ctx.orgId),
          eq(journalLines.contactId, contactId),
          eq(journalEntries.status, "POSTED"),
          sql`${journalEntries.entryDate} < ${from}`,
        ),
      );
    let balance = Money.sub(openRow?.d ?? "0", openRow?.c ?? "0");
    const opening = balance;

    const rows = await this.db
      .select({
        date: journalEntries.entryDate,
        entryNo: journalEntries.entryNo,
        memo: journalLines.memo,
        entryMemo: journalEntries.memo,
        debit: journalLines.debit,
        credit: journalLines.credit,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(
        and(
          eq(journalLines.orgId, ctx.orgId),
          eq(journalLines.contactId, contactId),
          eq(journalEntries.status, "POSTED"),
          gte(journalEntries.entryDate, from),
          lte(journalEntries.entryDate, to),
        ),
      )
      .orderBy(asc(journalEntries.entryDate), asc(journalEntries.entryNo));

    const out = rows.map((r) => {
      balance = Money.add(balance, Money.sub(r.debit, r.credit));
      return {
        date: r.date,
        entryNo: r.entryNo,
        memo: r.memo ?? r.entryMemo ?? "",
        debit: r.debit,
        credit: r.credit,
        balance,
      };
    });
    return { contact, opening, rows: out, closing: balance };
  }

  /* ================================================================ */
  /* GEM VN: NHẮC HẠN CÔNG NỢ (Due Reminders)                          */
  /* ================================================================ */
  /**
   * Danh sách hoá đơn còn công nợ, phân nhóm: quá hạn / sắp tới hạn (trong N
   * ngày) / còn hạn. Cho Tiểu Tâm chủ động nhắc. type=sales phải thu, purchase phải trả.
   */
  async dueReminders(
    ctx: Ctx,
    type: "sales" | "purchase" = "sales",
    soonDays = 7,
    asOf?: string,
  ): Promise<{
    asOf: string;
    type: "sales" | "purchase";
    overdue: Array<{ docNo: string; contactId: string | null; dueDate: string; outstanding: string; daysOverdue: number }>;
    dueSoon: Array<{ docNo: string; contactId: string | null; dueDate: string; outstanding: string; daysUntilDue: number }>;
    totalOverdue: string;
    totalDueSoon: string;
  }> {
    const at = asOf ?? new Date().toISOString().slice(0, 10);
    const DAY = 86_400_000;
    const daysBetween = (a: string, b: string) => Math.floor((Date.parse(a) - Date.parse(b)) / DAY);

    const rows =
      type === "sales"
        ? await this.db
            .select({ docNo: invoices.docNo, contactId: invoices.contactId, total: invoices.total, paid: invoices.amountPaid, dueDate: invoices.dueDate, docDate: invoices.docDate })
            .from(invoices)
            .where(and(eq(invoices.orgId, ctx.orgId), eq(invoices.status, "POSTED")))
        : await this.db
            .select({ docNo: bills.docNo, contactId: bills.contactId, total: bills.total, paid: bills.amountPaid, dueDate: bills.dueDate, docDate: bills.docDate })
            .from(bills)
            .where(and(eq(bills.orgId, ctx.orgId), eq(bills.status, "POSTED")));

    const overdue: any[] = [];
    const dueSoon: any[] = [];
    let totalOverdue = "0";
    let totalDueSoon = "0";
    for (const r of rows) {
      const outstanding = Money.sub(r.total, r.paid);
      if (Money.compare(outstanding, "0") <= 0) continue;
      const due = r.dueDate ?? r.docDate;
      const diff = daysBetween(due, at); // >0 còn hạn, <0 quá hạn
      if (diff < 0) {
        overdue.push({ docNo: r.docNo, contactId: r.contactId, dueDate: due, outstanding, daysOverdue: -diff });
        totalOverdue = Money.add(totalOverdue, outstanding);
      } else if (diff <= soonDays) {
        dueSoon.push({ docNo: r.docNo, contactId: r.contactId, dueDate: due, outstanding, daysUntilDue: diff });
        totalDueSoon = Money.add(totalDueSoon, outstanding);
      }
    }
    overdue.sort((a, b) => b.daysOverdue - a.daysOverdue);
    dueSoon.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
    return { asOf: at, type, overdue, dueSoon, totalOverdue, totalDueSoon };
  }
}
