import { and, asc, eq, gte, lte, inArray, sql } from "drizzle-orm";
import type { Database } from "../lib/db.js";
import type { Ctx } from "../lib/context.js";
import * as Money from "../lib/money.js";
import { accounts } from "../schema/accounts.js";
import { journalEntries, journalLines } from "../schema/journals.js";
import { invoices, bills } from "../schema/documents.js";

const DEFAULT_FROM = "1970-01-01";
const today = () => new Date().toISOString().slice(0, 10);

/** Phân loại hoạt động cho Lưu chuyển tiền tệ theo mã TK đối ứng. */
function activityOf(code: string): "operating" | "investing" | "financing" {
  // Đầu tư: TSCĐ, XDCB, đầu tư tài chính.
  if (/^(21|22|24|228|221|222)/.test(code)) return "investing";
  // Tài chính: vốn chủ, vay nợ, cổ tức.
  if (/^(41|44|34[13]|411|421)/.test(code)) return "financing";
  // Còn lại: hoạt động kinh doanh.
  return "operating";
}

/**
 * VietnamService — báo cáo & sổ sách tuân thủ chế độ kế toán VN (TT133):
 *  - Báo cáo lưu chuyển tiền tệ (LCTT, mẫu B03) — phương pháp trực tiếp.
 *  - Tờ khai thuế GTGT (01/GTGT) + Bảng kê hóa đơn mua/bán.
 *  - Sổ nhật ký chung (S03a), Sổ quỹ tiền mặt (S07).
 */
export class VietnamService {
  constructor(private readonly db: Database) {}

  /* ============ LƯU CHUYỂN TIỀN TỆ (LCTT / B03) ============ */
  /**
   * Phương pháp trực tiếp: phân loại biến động tiền (111, 112) theo TK đối ứng.
   * Trả về dòng tiền thuần theo 3 hoạt động + số dư đầu/cuối kỳ.
   */
  async cashFlowStatement(
    ctx: Ctx,
    from = DEFAULT_FROM,
    to = today(),
  ): Promise<{
    from: string;
    to: string;
    operating: string;
    investing: string;
    financing: string;
    netCashFlow: string;
    openingCash: string;
    closingCash: string;
  }> {
    // Xác định các TK tiền (111, 112).
    const cashAccs = await this.db
      .select({ id: accounts.id, code: accounts.code })
      .from(accounts)
      .where(and(eq(accounts.orgId, ctx.orgId), inArray(accounts.code, ["111", "112"])));
    const cashIds = new Set(cashAccs.map((a) => a.id));
    if (cashIds.size === 0) {
      return { from, to, operating: "0", investing: "0", financing: "0", netCashFlow: "0", openingCash: "0", closingCash: "0" };
    }

    // Lấy mọi dòng của các bút toán POSTED có chạm tiền, trong kỳ.
    const rows = await this.db
      .select({
        entryId: journalLines.entryId,
        accountId: journalLines.accountId,
        code: accounts.code,
        type: accounts.type,
        debit: journalLines.debit,
        credit: journalLines.credit,
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
      );

    // Gom theo bút toán.
    const byEntry = new Map<string, typeof rows>();
    for (const r of rows) {
      const arr = byEntry.get(r.entryId) ?? [];
      arr.push(r);
      byEntry.set(r.entryId, arr);
    }

    let operating = "0";
    let investing = "0";
    let financing = "0";
    for (const [, lines] of byEntry) {
      const cashLines = lines.filter((l) => cashIds.has(l.accountId));
      if (cashLines.length === 0) continue;
      // Biến động tiền thuần của bút toán (Nợ tăng, Có giảm).
      const cashDelta = Money.sub(
        Money.sum(cashLines.map((l) => l.debit)),
        Money.sum(cashLines.map((l) => l.credit)),
      );
      if (Money.compare(cashDelta, "0") === 0) continue;
      // TK đối ứng lớn nhất (không phải tiền) quyết định phân loại.
      const counters = lines.filter((l) => !cashIds.has(l.accountId));
      let bestCode = "000";
      let bestAmt = "-1";
      for (const c of counters) {
        const amt = Money.add(c.debit, c.credit);
        if (Money.compare(amt, bestAmt) > 0) {
          bestAmt = amt;
          bestCode = c.code;
        }
      }
      const act = activityOf(bestCode);
      if (act === "operating") operating = Money.add(operating, cashDelta);
      else if (act === "investing") investing = Money.add(investing, cashDelta);
      else financing = Money.add(financing, cashDelta);
    }

    const netCashFlow = Money.add(Money.add(operating, investing), financing);

    // Số dư tiền đầu kỳ = tổng biến động trước `from`.
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
          inArray(journalLines.accountId, [...cashIds]),
          eq(journalEntries.status, "POSTED"),
          sql`${journalEntries.entryDate} < ${from}`,
        ),
      );
    const openingCash = Money.sub(openRow?.d ?? "0", openRow?.c ?? "0");
    const closingCash = Money.add(openingCash, netCashFlow);

    return { from, to, operating, investing, financing, netCashFlow, openingCash, closingCash };
  }

  /* ============ TỜ KHAI THUẾ GTGT (01/GTGT) ============ */
  /**
   * Tổng hợp thuế GTGT đầu ra (hóa đơn bán) và đầu vào (hóa đơn mua) trong kỳ,
   * kèm bảng kê từng hóa đơn. Thuế phải nộp = đầu ra − đầu vào (âm = còn khấu trừ).
   */
  async vatDeclaration(
    ctx: Ctx,
    from = DEFAULT_FROM,
    to = today(),
  ): Promise<{
    from: string;
    to: string;
    output: { taxableRevenue: string; outputVat: string; invoices: Array<{ docNo: string; date: string; subtotal: string; tax: string }> };
    input: { taxablePurchase: string; inputVat: string; bills: Array<{ docNo: string; date: string; subtotal: string; tax: string }> };
    vatPayable: string;
    carryForward: string;
  }> {
    const salesRows = await this.db
      .select({ docNo: invoices.docNo, date: invoices.docDate, subtotal: invoices.subtotal, tax: invoices.taxAmount })
      .from(invoices)
      .where(and(eq(invoices.orgId, ctx.orgId), eq(invoices.status, "POSTED"), gte(invoices.docDate, from), lte(invoices.docDate, to)))
      .orderBy(asc(invoices.docDate));
    const billRows = await this.db
      .select({ docNo: bills.docNo, date: bills.docDate, subtotal: bills.subtotal, tax: bills.taxAmount })
      .from(bills)
      .where(and(eq(bills.orgId, ctx.orgId), eq(bills.status, "POSTED"), gte(bills.docDate, from), lte(bills.docDate, to)))
      .orderBy(asc(bills.docDate));

    const taxableRevenue = Money.sum(salesRows.map((r) => r.subtotal));
    const outputVat = Money.sum(salesRows.map((r) => r.tax));
    const taxablePurchase = Money.sum(billRows.map((r) => r.subtotal));
    const inputVat = Money.sum(billRows.map((r) => r.tax));
    const diff = Money.sub(outputVat, inputVat);
    const vatPayable = Money.compare(diff, "0") > 0 ? diff : "0";
    const carryForward = Money.compare(diff, "0") < 0 ? Money.abs(diff) : "0";

    return {
      from,
      to,
      output: { taxableRevenue, outputVat, invoices: salesRows },
      input: { taxablePurchase, inputVat, bills: billRows },
      vatPayable,
      carryForward,
    };
  }

  /* ============ SỔ NHẬT KÝ CHUNG (S03a) ============ */
  /** Liệt kê mọi bút toán POSTED theo thứ tự thời gian (mẫu sổ nhật ký chung). */
  async generalJournal(
    ctx: Ctx,
    from = DEFAULT_FROM,
    to = today(),
  ): Promise<Array<{ date: string; entryNo: string; memo: string; code: string; name: string; debit: string; credit: string }>> {
    const rows = await this.db
      .select({
        date: journalEntries.entryDate,
        entryNo: journalEntries.entryNo,
        memo: journalLines.memo,
        entryMemo: journalEntries.memo,
        code: accounts.code,
        name: accounts.name,
        debit: journalLines.debit,
        credit: journalLines.credit,
        lineNo: journalLines.lineNo,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
      .where(
        and(
          eq(journalLines.orgId, ctx.orgId),
          eq(journalEntries.status, "POSTED"),
          gte(journalEntries.entryDate, from),
          lte(journalEntries.entryDate, to),
        ),
      )
      .orderBy(asc(journalEntries.entryDate), asc(journalEntries.entryNo), asc(journalLines.lineNo));

    return rows.map((r) => ({
      date: r.date,
      entryNo: r.entryNo,
      memo: r.memo ?? r.entryMemo ?? "",
      code: r.code,
      name: r.name,
      debit: r.debit,
      credit: r.credit,
    }));
  }

  /* ============ SỔ QUỸ TIỀN MẶT (S07) ============ */
  /** Biến động TK 111 với số dư lũy kế (mẫu sổ quỹ tiền mặt). */
  async cashBook(
    ctx: Ctx,
    from = DEFAULT_FROM,
    to = today(),
  ): Promise<{ opening: string; rows: Array<{ date: string; entryNo: string; memo: string; receipt: string; payment: string; balance: string }>; closing: string }> {
    const [acc] = await this.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.orgId, ctx.orgId), eq(accounts.code, "111")))
      .limit(1);
    if (!acc) return { opening: "0", rows: [], closing: "0" };

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
          eq(journalLines.accountId, acc.id),
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
        memo: journalEntries.memo,
        debit: journalLines.debit,
        credit: journalLines.credit,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(
        and(
          eq(journalLines.orgId, ctx.orgId),
          eq(journalLines.accountId, acc.id),
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
        memo: r.memo ?? "",
        receipt: r.debit,
        payment: r.credit,
        balance,
      };
    });

    return { opening, rows: out, closing: balance };
  }
}
