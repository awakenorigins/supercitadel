import { and, desc, eq } from "drizzle-orm";
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
import { bills, type Bill } from "../schema/documents.js";
import { LedgerService } from "./ledger.service.js";
import { AccountsService } from "./accounts.service.js";
import type { InvoiceLine } from "../types/index.js";

export interface CreateBillInput {
  docDate: string;
  dueDate?: string;
  contactId: string;
  /** Hoặc truyền subtotal trực tiếp, hoặc lines để tính. */
  subtotal?: string;
  lines?: Array<{ description: string; qty: number; rate: string }>;
  taxRate?: string;
  description?: string;
  /** Mã TK ghi đè (mặc định 331/156/1331). */
  payableAccountCode?: string;
  expenseAccountCode?: string;
  taxAccountCode?: string;
  post?: boolean;
  /** V12 ⑤: số chứng từ nhập tay (tùy chọn) — được check trùng per-org. */
  docNo?: string;
  /** V12 ⑥: đa tiền tệ — subtotal/lines là NGUYÊN TỆ khi currency ≠ VND. */
  currency?: string;
  exchangeRate?: string;
  rateNote?: string;
  rateDate?: string;
}

/**
 * BillsService — Hoá đơn mua hàng (công nợ phải trả).
 * Bút toán khi ghi sổ:
 *   Nợ [TK chi phí/hàng] (tiền hàng) + Nợ 1331 (thuế GTGT vào)
 *     Có 331 (tổng phải trả).
 * (Hoàn thiện phần 5A mới có schema mà chưa có service.)
 */
export class BillsService {
  private ledger: LedgerService;
  private acc: AccountsService;

  constructor(private readonly db: Database) {
    this.ledger = new LedgerService(db);
    this.acc = new AccountsService(db);
  }

  /** Tính subtotal + chuẩn hoá lines. */
  private computeLines(input: CreateBillInput): {
    subtotal: string;
    lines: InvoiceLine[];
  } {
    if (input.lines && input.lines.length > 0) {
      const lines: InvoiceLine[] = input.lines.map((l) => {
        const amount = Money.multiply(l.rate, String(l.qty));
        return { description: l.description, qty: l.qty, rate: l.rate, amount };
      });
      const subtotal = Money.sum(lines.map((l) => l.amount));
      return { subtotal, lines };
    }
    if (!input.subtotal) {
      throw new ValidationError("Cần truyền subtotal hoặc lines cho hoá đơn mua");
    }
    return { subtotal: input.subtotal, lines: [] };
  }

  async create(ctx: Ctx, input: CreateBillInput): Promise<Bill> {
    const { subtotal: subtotalRaw, lines } = this.computeLines(input);
    if (Money.compare(subtotalRaw, "0") <= 0) {
      throw new ValidationError("Tiền hàng phải lớn hơn 0");
    }
    const taxRate = input.taxRate ?? "0";
    // V12 ⑥: tính ở NGUYÊN TỆ rồi quy đổi VND để hạch toán.
    const taxAmountOC = Money.taxOf(subtotalRaw, taxRate);
    const totalOC = Money.add(subtotalRaw, taxAmountOC);
    const cur = resolveDocCurrency(totalOC, input, input.docDate);
    const isFx = cur.currency !== "VND";
    const subtotal = isFx ? mulRate(subtotalRaw, cur.exchangeRate) : subtotalRaw;
    const taxAmount = isFx ? mulRate(taxAmountOC, cur.exchangeRate) : taxAmountOC;
    const total = Money.add(subtotal, taxAmount);

    const payable = await this.acc.requireByCode(
      ctx,
      input.payableAccountCode ?? "331",
    );
    const expense = await this.acc.requireByCode(
      ctx,
      input.expenseAccountCode ?? "156",
    );
    const hasTax = Money.compare(taxAmount, "0") > 0;
    const taxAcc = hasTax
      ? await this.acc.requireByCode(ctx, input.taxAccountCode ?? "1331")
      : null;

    const year = new Date(input.docDate).getFullYear();
    const post = input.post ?? true;

    const bill = await this.db.transaction(async (tx) => {
      const txDb = tx as unknown as Database;
      const docNo = await resolveDocNumber(txDb, ctx, "BILL", {
        year,
        docDate: input.docDate,
        manualDocNo: input.docNo,
        checkDup: async (no) => {
          const dup = await tx
            .select({ id: bills.id })
            .from(bills)
            .where(and(eq(bills.orgId, ctx.orgId), eq(bills.docNo, no)))
            .limit(1);
          return dup.length > 0;
        },
      });
      const [row] = await tx
        .insert(bills)
        .values({
          orgId: ctx.orgId,
          docNo,
          docDate: input.docDate,
          dueDate: input.dueDate,
          contactId: input.contactId,
          payableAccountId: payable.id,
          expenseAccountId: expense.id,
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
      action: "bill.create",
      entityType: "bill",
      entityId: bill.id,
      detail: { docNo: bill.docNo, total },
    });

    if (post) return this.post(ctx, bill.id);
    return bill;
  }

  async post(ctx: Ctx, billId: string): Promise<Bill> {
    const bill = await this.getById(ctx, billId);
    if (bill.status !== "DRAFT") {
      throw new InvalidStateError(`Hoá đơn mua đã ở trạng thái ${bill.status}`);
    }

    const lines: Array<{
      accountId: string;
      debit?: string;
      credit?: string;
      memo?: string;
      contactId?: string;
    }> = [
      {
        accountId: bill.expenseAccountId,
        debit: bill.subtotal,
        memo: bill.description ?? undefined,
      },
    ];
    if (bill.taxAccountId && Money.compare(bill.taxAmount, "0") > 0) {
      lines.push({
        accountId: bill.taxAccountId,
        debit: bill.taxAmount,
        memo: "Thuế GTGT đầu vào",
      });
    }
    lines.push({
      accountId: bill.payableAccountId,
      credit: bill.total,
      contactId: bill.contactId ?? undefined,
      memo: bill.description ?? undefined,
    });

    const entry = await this.ledger.createEntry(ctx, {
      entryDate: bill.docDate,
      memo: `Hoá đơn mua ${bill.docNo}`,
      sourceType: "BILL",
      sourceId: bill.id,
      post: true,
      lines,
    });

    const [updated] = await this.db
      .update(bills)
      .set({ status: "POSTED", journalEntryId: entry.id, updatedAt: new Date() })
      .where(and(eq(bills.id, billId), eq(bills.orgId, ctx.orgId)))
      .returning();

    await writeAudit(this.db, ctx, {
      action: "bill.post",
      entityType: "bill",
      entityId: billId,
      detail: { journalEntryId: entry.id },
    });
    return updated!;
  }

  /** Ghi nhận trả tiền hoá đơn mua (một phần/toàn bộ). Nợ 331 / Có tiền. */
  async recordPayment(
    ctx: Ctx,
    billId: string,
    amount: string,
    cashAccountCode = "111",
    docDate?: string,
  ): Promise<Bill> {
    const bill = await this.getById(ctx, billId);
    if (bill.status !== "POSTED") {
      throw new InvalidStateError("Chỉ trả tiền hoá đơn mua đã ghi sổ");
    }
    const remaining = Money.sub(bill.total, bill.amountPaid);
    if (Money.compare(amount, remaining) > 0) {
      throw new ValidationError(
        `Số tiền trả (${Money.formatVND(amount)}) vượt công nợ còn lại (${Money.formatVND(remaining)})`,
      );
    }
    const cashAcc = await this.acc.requireByCode(ctx, cashAccountCode);

    await this.ledger.createEntry(ctx, {
      entryDate: docDate ?? new Date().toISOString().slice(0, 10),
      memo: `Trả tiền hoá đơn mua ${bill.docNo}`,
      sourceType: "BILL",
      sourceId: bill.id,
      post: true,
      lines: [
        {
          accountId: bill.payableAccountId,
          debit: amount,
          contactId: bill.contactId,
        },
        { accountId: cashAcc.id, credit: amount },
      ],
    });

    const newPaid = Money.add(bill.amountPaid, amount);
    const [updated] = await this.db
      .update(bills)
      .set({ amountPaid: newPaid, updatedAt: new Date() })
      .where(and(eq(bills.id, billId), eq(bills.orgId, ctx.orgId)))
      .returning();

    await writeAudit(this.db, ctx, {
      action: "bill.payment",
      entityType: "bill",
      entityId: billId,
      detail: { amount, totalPaid: newPaid },
    });
    return updated!;
  }

  async getById(ctx: Ctx, id: string): Promise<Bill> {
    const [b] = await this.db
      .select()
      .from(bills)
      .where(and(eq(bills.id, id), eq(bills.orgId, ctx.orgId)))
      .limit(1);
    if (!b) throw new NotFoundError("hoá đơn mua", id);
    return b;
  }

  /** Tra hoá đơn mua theo docNo (VD "BILL-2026-000001") hoặc id. */
  async getByDocNoOrId(ctx: Ctx, key: string): Promise<Bill> {
    const [byDoc] = await this.db
      .select()
      .from(bills)
      .where(and(eq(bills.orgId, ctx.orgId), eq(bills.docNo, key)))
      .limit(1);
    if (byDoc) return byDoc;
    return this.getById(ctx, key);
  }

  /**
   * Hoá đơn điều chỉnh giảm mua (Debit Note) — trả lại hàng đã mua / NCC giảm giá.
   * Bút toán ngược phần điều chỉnh: Nợ 331 (giảm phải trả)
   *   / Có [156/642] (giảm hàng/chi phí) + Có 1331 (giảm thuế đầu vào).
   * amount = tiền hàng (chưa thuế) điều chỉnh giảm.
   */
  async createDebitNote(ctx: Ctx, billId: string, amount: string, reason?: string): Promise<Bill> {
    const bill = await this.getById(ctx, billId);
    if (bill.status !== "POSTED") {
      throw new InvalidStateError("Chỉ điều chỉnh hoá đơn mua đã ghi sổ");
    }
    if (Money.compare(amount, "0") <= 0) {
      throw new ValidationError("Số tiền điều chỉnh phải lớn hơn 0");
    }
    if (Money.compare(amount, bill.subtotal) > 0) {
      throw new ValidationError(
        `Số điều chỉnh (${Money.formatVND(amount)}) vượt tiền hàng gốc (${Money.formatVND(bill.subtotal)})`,
      );
    }
    const tax = Money.taxOf(amount, bill.taxRate);
    const grossCredit = Money.add(amount, tax);

    const lines: Array<{ accountId: string; debit?: string; credit?: string; memo?: string; contactId?: string }> = [
      {
        accountId: bill.payableAccountId,
        debit: grossCredit,
        contactId: bill.contactId ?? undefined,
        memo: reason ?? "Điều chỉnh giảm công nợ phải trả",
      },
      { accountId: bill.expenseAccountId, credit: amount, memo: reason ?? "Điều chỉnh giảm hàng/chi phí" },
    ];
    if (bill.taxAccountId && Money.compare(tax, "0") > 0) {
      lines.push({ accountId: bill.taxAccountId, credit: tax, memo: "Điều chỉnh giảm thuế GTGT đầu vào" });
    }

    await this.ledger.createEntry(ctx, {
      entryDate: new Date().toISOString().slice(0, 10),
      memo: `Điều chỉnh giảm hoá đơn mua ${bill.docNo}${reason ? ` — ${reason}` : ""}`,
      sourceType: "BILL",
      sourceId: bill.id,
      post: true,
      lines,
    });

    const [updated] = await this.db
      .update(bills)
      .set({
        subtotal: Money.sub(bill.subtotal, amount),
        taxAmount: Money.sub(bill.taxAmount, tax),
        total: Money.sub(bill.total, grossCredit),
        updatedAt: new Date(),
      })
      .where(and(eq(bills.id, billId), eq(bills.orgId, ctx.orgId)))
      .returning();

    await writeAudit(this.db, ctx, {
      action: "bill.debit_note",
      entityType: "bill",
      entityId: billId,
      detail: { amount, tax, grossCredit, reason },
    });
    return updated!;
  }

  async list(ctx: Ctx, limit = 50): Promise<Bill[]> {
    return this.db
      .select()
      .from(bills)
      .where(eq(bills.orgId, ctx.orgId))
      .orderBy(desc(bills.docDate), desc(bills.createdAt))
      .limit(limit);
  }
}
