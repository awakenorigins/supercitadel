import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../lib/db.js";
import type { Ctx } from "../lib/context.js";
import * as Money from "../lib/money.js";
import { writeAudit } from "../lib/audit.js";
import { resolveDocNumber } from "../lib/docnumber.js";
import { resolveDocCurrency, mulRate } from "../lib/currency.js";
import {
  InvalidStateError,
  NotFoundError,
  ValidationError,
} from "../lib/errors.js";
import { invoices, type Invoice } from "../schema/documents.js";
import { contacts } from "../schema/contacts.js";
import { LedgerService } from "./ledger.service.js";
import { AccountsService } from "./accounts.service.js";

export interface CreateInvoiceInput {
  docDate: string;
  dueDate?: string;
  contactId: string;
  /** Hoặc truyền subtotal trực tiếp, hoặc lines để tự tính. */
  subtotal?: string;
  lines?: Array<{ description: string; qty: number; rate: string }>;
  /** Thuế suất GTGT (%), mặc định 0. */
  taxRate?: string;
  description?: string;
  /** Mã TK ghi đè (mặc định 131/511/3331). */
  receivableAccountCode?: string;
  revenueAccountCode?: string;
  taxAccountCode?: string;
  post?: boolean;
  /** Cho phép vượt hạn mức tín dụng của khách (mặc định false → chặn nếu vượt). */
  allowExceedCredit?: boolean;
  /** V12 ⑤: số chứng từ nhập tay (tùy chọn) — được check trùng per-org. */
  docNo?: string;
  /** V12 ⑥: đa tiền tệ — subtotal/lines là NGUYÊN TỆ khi currency ≠ VND. */
  currency?: string;
  exchangeRate?: string;
  rateNote?: string;
  rateDate?: string;
}

/**
 * InvoicesService — Hoá đơn bán hàng.
 * Bút toán khi ghi sổ:
 *   Nợ 131 (tổng thanh toán)
 *     Có 511 (tiền hàng)
 *     Có 3331 (thuế GTGT đầu ra) — nếu có thuế.
 */
export class InvoicesService {
  private ledger: LedgerService;
  private acc: AccountsService;

  constructor(private readonly db: Database) {
    this.ledger = new LedgerService(db);
    this.acc = new AccountsService(db);
  }

  async create(ctx: Ctx, input: CreateInvoiceInput): Promise<Invoice> {
    // Tính subtotal + chuẩn hoá lines (multi-line hoặc subtotal trực tiếp).
    let subtotal: string;
    let lines: Array<{ description: string; qty: number; rate: string; amount: string }> = [];
    if (input.lines && input.lines.length > 0) {
      lines = input.lines.map((l) => ({
        description: l.description,
        qty: l.qty,
        rate: l.rate,
        amount: Money.multiply(l.rate, String(l.qty)),
      }));
      subtotal = Money.sum(lines.map((l) => l.amount));
    } else if (input.subtotal) {
      subtotal = input.subtotal;
    } else {
      throw new ValidationError("Cần truyền subtotal hoặc lines cho hoá đơn");
    }
    if (Money.compare(subtotal, "0") <= 0) {
      throw new ValidationError("Tiền hàng phải lớn hơn 0");
    }
    const taxRate = input.taxRate ?? "0";
    // V12 ⑥: tính thuế/tổng ở NGUYÊN TỆ rồi quy đổi VND để hạch toán.
    const taxAmountOC = Money.taxOf(subtotal, taxRate);
    const totalOC = Money.add(subtotal, taxAmountOC);
    const cur = resolveDocCurrency(totalOC, input, input.docDate);
    const isFx = cur.currency !== "VND";
    const subtotalVND = isFx ? mulRate(subtotal, cur.exchangeRate) : subtotal;
    const taxAmount = isFx ? mulRate(taxAmountOC, cur.exchangeRate) : taxAmountOC;
    // Tổng VND = subtotal + tax (VND) để bút toán luôn cân từng đồng.
    const total = Money.add(subtotalVND, taxAmount);
    subtotal = subtotalVND;

    // Kiểm tra hạn mức tín dụng của khách (nếu có đặt và không override).
    if (input.contactId && !input.allowExceedCredit) {
      const [contact] = await this.db
        .select({ creditLimit: contacts.creditLimit })
        .from(contacts)
        .where(and(eq(contacts.id, input.contactId), eq(contacts.orgId, ctx.orgId)))
        .limit(1);
      if (contact && Money.compare(contact.creditLimit, "0") > 0) {
        const rows = await this.db
          .select({ t: invoices.total, p: invoices.amountPaid })
          .from(invoices)
          .where(and(eq(invoices.orgId, ctx.orgId), eq(invoices.contactId, input.contactId), eq(invoices.status, "POSTED")));
        let outstanding = "0";
        for (const r of rows) {
          const o = Money.sub(r.t, r.p);
          if (Money.compare(o, "0") > 0) outstanding = Money.add(outstanding, o);
        }
        const afterThis = Money.add(outstanding, total);
        if (Money.compare(afterThis, contact.creditLimit) > 0) {
          throw new InvalidStateError(
            `Vượt hạn mức tín dụng: công nợ hiện tại ${Money.formatVND(outstanding)} + hóa đơn ${Money.formatVND(total)} = ${Money.formatVND(afterThis)} > hạn mức ${Money.formatVND(contact.creditLimit)}. Truyền allowExceedCredit=true để bỏ qua.`,
          );
        }
      }
    }

    const receivable = await this.acc.requireByCode(
      ctx,
      input.receivableAccountCode ?? "131",
    );
    const revenue = await this.acc.requireByCode(
      ctx,
      input.revenueAccountCode ?? "511",
    );
    const hasTax = Money.compare(taxAmount, "0") > 0;
    const taxAcc = hasTax
      ? await this.acc.requireByCode(ctx, input.taxAccountCode ?? "3331")
      : null;

    const year = new Date(input.docDate).getFullYear();
    const post = input.post ?? true;

    const invoice = await this.db.transaction(async (tx) => {
      const txDb = tx as unknown as Database;
      const docNo = await resolveDocNumber(txDb, ctx, "INVOICE", {
        year,
        docDate: input.docDate,
        manualDocNo: input.docNo,
        checkDup: async (no) => {
          const dup = await tx
            .select({ id: invoices.id })
            .from(invoices)
            .where(and(eq(invoices.orgId, ctx.orgId), eq(invoices.docNo, no)))
            .limit(1);
          return dup.length > 0;
        },
      });
      const [row] = await tx
        .insert(invoices)
        .values({
          orgId: ctx.orgId,
          docNo,
          docDate: input.docDate,
          dueDate: input.dueDate,
          contactId: input.contactId,
          receivableAccountId: receivable.id,
          revenueAccountId: revenue.id,
          taxAccountId: taxAcc?.id,
          subtotal,
          taxRate,
          taxAmount,
          total,
          currency: cur.currency,
          exchangeRate: cur.exchangeRate,
          amountOC: totalOC,
          rateNote: cur.rateNote,
          rateDate: cur.rateDate,
          description: input.description,
          lines: lines as never,
          status: "DRAFT",
          createdBy: ctx.actor,
        })
        .returning();
      return row!;
    });

    await writeAudit(this.db, ctx, {
      action: "invoice.create",
      entityType: "invoice",
      entityId: invoice.id,
      detail: { docNo: invoice.docNo, total },
    });

    if (post) return this.post(ctx, invoice.id);
    return invoice;
  }

  async post(ctx: Ctx, invoiceId: string): Promise<Invoice> {
    const invoice = await this.getById(ctx, invoiceId);
    if (invoice.status !== "DRAFT") {
      throw new InvalidStateError(
        `Hoá đơn đã ở trạng thái ${invoice.status}`,
      );
    }

    const lines = [
      {
        accountId: invoice.receivableAccountId,
        debit: invoice.total,
        contactId: invoice.contactId,
        memo: invoice.description ?? undefined,
      },
      {
        accountId: invoice.revenueAccountId,
        credit: invoice.subtotal,
        memo: invoice.description ?? undefined,
      },
    ];
    if (invoice.taxAccountId && Money.compare(invoice.taxAmount, "0") > 0) {
      lines.push({
        accountId: invoice.taxAccountId,
        credit: invoice.taxAmount,
        memo: "Thuế GTGT đầu ra",
      } as (typeof lines)[number]);
    }

    const entry = await this.ledger.createEntry(ctx, {
      entryDate: invoice.docDate,
      memo: `Hoá đơn bán ${invoice.docNo}`,
      sourceType: "INVOICE",
      sourceId: invoice.id,
      post: true,
      lines,
    });

    const [updated] = await this.db
      .update(invoices)
      .set({ status: "POSTED", journalEntryId: entry.id, updatedAt: new Date() })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, ctx.orgId)))
      .returning();

    await writeAudit(this.db, ctx, {
      action: "invoice.post",
      entityType: "invoice",
      entityId: invoiceId,
      detail: { journalEntryId: entry.id },
    });
    return updated!;
  }

  /**
   * Ghi nhận thu tiền hoá đơn (một phần hoặc toàn bộ).
   * Sinh bút toán Nợ tiền / Có 131, đồng thời cập nhật amountPaid.
   */
  async recordPayment(
    ctx: Ctx,
    invoiceId: string,
    amount: string,
    cashAccountCode = "111",
    docDate?: string,
  ): Promise<Invoice> {
    const invoice = await this.getById(ctx, invoiceId);
    if (invoice.status !== "POSTED") {
      throw new InvalidStateError("Chỉ thu tiền hoá đơn đã ghi sổ");
    }
    const remaining = Money.sub(invoice.total, invoice.amountPaid);
    if (Money.compare(amount, remaining) > 0) {
      throw new ValidationError(
        `Số tiền thu (${Money.formatVND(amount)}) vượt công nợ còn lại (${Money.formatVND(remaining)})`,
      );
    }

    const cashAcc = await this.acc.requireByCode(ctx, cashAccountCode);

    await this.ledger.createEntry(ctx, {
      entryDate: docDate ?? new Date().toISOString().slice(0, 10),
      memo: `Thu tiền hoá đơn ${invoice.docNo}`,
      sourceType: "INVOICE",
      sourceId: invoice.id,
      post: true,
      lines: [
        { accountId: cashAcc.id, debit: amount },
        {
          accountId: invoice.receivableAccountId,
          credit: amount,
          contactId: invoice.contactId,
        },
      ],
    });

    const newPaid = Money.add(invoice.amountPaid, amount);
    const [updated] = await this.db
      .update(invoices)
      .set({ amountPaid: newPaid, updatedAt: new Date() })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, ctx.orgId)))
      .returning();

    await writeAudit(this.db, ctx, {
      action: "invoice.payment",
      entityType: "invoice",
      entityId: invoiceId,
      detail: { amount, totalPaid: newPaid },
    });
    return updated!;
  }

  /**
   * V12: LỊCH SỬ HOẠT ĐỘNG HOÁ ĐƠN (feedback anh Nắng mục 6) — toàn bộ bút toán
   * liên quan hóa đơn (ghi sổ ban đầu, từng lần thu tiền, credit note) theo thời gian:
   * ngày · số CT · nội dung · số tiền · còn lại sau từng bước.
   */
  async activity(ctx: Ctx, invoiceId: string): Promise<{
    invoice: { docNo: string; docDate: string; total: string; amountPaid: string; remaining: string; status: string };
    events: Array<{ date: string; entryNo: string; kind: string; memo: string | null; amount: string; remainingAfter: string }>;
  }> {
    const invoice = await this.getById(ctx, invoiceId);
    const { journalEntries, journalLines } = await import("../schema/journals.js");
    const { asc } = await import("drizzle-orm");
    const entries = await this.db
      .select({
        id: journalEntries.id,
        date: journalEntries.entryDate,
        entryNo: journalEntries.entryNo,
        memo: journalEntries.memo,
        createdAt: journalEntries.createdAt,
      })
      .from(journalEntries)
      .where(and(
        eq(journalEntries.orgId, ctx.orgId),
        eq(journalEntries.sourceType, "INVOICE"),
        eq(journalEntries.sourceId, invoiceId),
        eq(journalEntries.status, "POSTED"),
      ))
      .orderBy(asc(journalEntries.createdAt));
    const events: Array<{ date: string; entryNo: string; kind: string; memo: string | null; amount: string; remainingAfter: string }> = [];
    let remaining = invoice.total;
    for (const e of entries) {
      const [sum] = await this.db
        .select({ amt: sql<string>`COALESCE(SUM(${journalLines.debit}),0)` })
        .from(journalLines)
        .where(and(eq(journalLines.orgId, ctx.orgId), eq(journalLines.entryId, e.id)));
      const amount = sum?.amt ?? "0";
      const isCreation = (e.memo ?? "").startsWith("Hóa đơn") || (e.memo ?? "").startsWith("Hoá đơn");
      const isPayment = (e.memo ?? "").includes("Thu tiền");
      const isCredit = (e.memo ?? "").includes("điều chỉnh") || (e.memo ?? "").includes("Credit");
      const kind = isPayment ? "THU_TIEN" : isCredit ? "DIEU_CHINH" : isCreation ? "GHI_SO" : "KHAC";
      if (kind === "THU_TIEN" || kind === "DIEU_CHINH") remaining = Money.sub(remaining, amount);
      events.push({ date: e.date, entryNo: e.entryNo, kind, memo: e.memo, amount, remainingAfter: kind === "GHI_SO" ? invoice.total : remaining });
    }
    return {
      invoice: {
        docNo: invoice.docNo, docDate: invoice.docDate, total: invoice.total,
        amountPaid: invoice.amountPaid, remaining: Money.sub(invoice.total, invoice.amountPaid), status: invoice.status,
      },
      events,
    };
  }

  /**
   * Hoá đơn điều chỉnh giảm (Credit Note) — hàng bán bị trả lại / giảm giá.
   * Bút toán ngược phần điều chỉnh: Nợ 511 (giảm DT) + Nợ 3331 (giảm thuế)
   *   / Có 131 (giảm phải thu). Giảm `total` của hoá đơn gốc tương ứng.
   * amount = số tiền hàng (chưa thuế) bị điều chỉnh giảm.
   */
  async createCreditNote(
    ctx: Ctx,
    invoiceId: string,
    amount: string,
    reason?: string,
  ): Promise<Invoice> {
    const inv = await this.getById(ctx, invoiceId);
    if (inv.status !== "POSTED") {
      throw new InvalidStateError("Chỉ điều chỉnh hoá đơn đã ghi sổ");
    }
    if (Money.compare(amount, "0") <= 0) {
      throw new ValidationError("Số tiền điều chỉnh phải lớn hơn 0");
    }
    if (Money.compare(amount, inv.subtotal) > 0) {
      throw new ValidationError(
        `Số điều chỉnh (${Money.formatVND(amount)}) vượt tiền hàng gốc (${Money.formatVND(inv.subtotal)})`,
      );
    }
    const tax = Money.taxOf(amount, inv.taxRate);
    const grossCredit = Money.add(amount, tax);

    const lines: Array<{ accountId: string; debit?: string; credit?: string; memo?: string; contactId?: string }> = [
      { accountId: inv.revenueAccountId, debit: amount, memo: reason ?? "Điều chỉnh giảm doanh thu" },
    ];
    if (inv.taxAccountId && Money.compare(tax, "0") > 0) {
      lines.push({ accountId: inv.taxAccountId, debit: tax, memo: "Điều chỉnh giảm thuế GTGT" });
    }
    lines.push({
      accountId: inv.receivableAccountId,
      credit: grossCredit,
      contactId: inv.contactId ?? undefined,
      memo: reason ?? "Điều chỉnh giảm công nợ",
    });

    await this.ledger.createEntry(ctx, {
      entryDate: new Date().toISOString().slice(0, 10),
      memo: `Điều chỉnh giảm hoá đơn ${inv.docNo}${reason ? ` — ${reason}` : ""}`,
      sourceType: "INVOICE",
      sourceId: inv.id,
      post: true,
      lines,
    });

    // Giảm total/subtotal/taxAmount của hoá đơn gốc (phản ánh giá trị bán thực).
    const [updated] = await this.db
      .update(invoices)
      .set({
        subtotal: Money.sub(inv.subtotal, amount),
        taxAmount: Money.sub(inv.taxAmount, tax),
        total: Money.sub(inv.total, grossCredit),
        updatedAt: new Date(),
      })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, ctx.orgId)))
      .returning();

    await writeAudit(this.db, ctx, {
      action: "invoice.credit_note",
      entityType: "invoice",
      entityId: invoiceId,
      detail: { amount, tax, grossCredit, reason },
    });
    return updated!;
  }

  async getById(ctx: Ctx, id: string): Promise<Invoice> {
    const [inv] = await this.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.orgId, ctx.orgId)))
      .limit(1);
    if (!inv) throw new NotFoundError("hoá đơn", id);
    return inv;
  }

  /** Tra hoá đơn theo docNo (VD "HD-2026-000001") hoặc id. */
  async getByDocNoOrId(ctx: Ctx, key: string): Promise<Invoice> {
    const [byId] = await this.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, ctx.orgId), eq(invoices.docNo, key)))
      .limit(1);
    if (byId) return byId;
    return this.getById(ctx, key);
  }

  async list(ctx: Ctx, limit = 50): Promise<Invoice[]> {
    return this.db
      .select()
      .from(invoices)
      .where(eq(invoices.orgId, ctx.orgId))
      .orderBy(desc(invoices.docDate), desc(invoices.createdAt))
      .limit(limit);
  }
}
