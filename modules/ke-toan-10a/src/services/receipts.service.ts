import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../lib/db.js";
import type { Ctx } from "../lib/context.js";
import * as Money from "../lib/money.js";
import { writeAudit } from "../lib/audit.js";
import { resolveDocNumber } from "../lib/docnumber.js";
import { resolveDocCurrency } from "../lib/currency.js";
import {
  InvalidStateError,
  NotFoundError,
  ValidationError,
} from "../lib/errors.js";
import { receipts, type Receipt } from "../schema/documents.js";
import { LedgerService } from "./ledger.service.js";
import { AccountsService } from "./accounts.service.js";

export interface CreateReceiptInput {
  docDate: string; // YYYY-MM-DD
  /** Mã TK tiền nhận (mặc định 111 nếu bỏ trống). */
  cashAccountCode?: string;
  /** Mã TK đối ứng (bắt buộc): 131, 511, 711... */
  counterAccountCode: string;
  amount: string;
  reason?: string;
  payerName?: string;
  contactId?: string;
  /** Ghi sổ ngay hay để nháp. Mặc định true. */
  post?: boolean;
  /** V12 ⑤: số chứng từ nhập tay (tùy chọn) — được check trùng per-org. */
  docNo?: string;
  /** V12 ⑥: đa tiền tệ — amount ở trên là NGUYÊN TỆ khi có currency ≠ VND. */
  currency?: string;
  exchangeRate?: string;
  rateNote?: string;
  rateDate?: string;
}

/**
 * ReceiptsService — Phiếu thu.
 * Bút toán khi ghi sổ: Nợ [TK tiền] / Có [TK đối ứng].
 */
export class ReceiptsService {
  private ledger: LedgerService;
  private acc: AccountsService;

  constructor(private readonly db: Database) {
    this.ledger = new LedgerService(db);
    this.acc = new AccountsService(db);
  }

  async create(ctx: Ctx, input: CreateReceiptInput): Promise<Receipt> {
    if (Money.compare(input.amount, "0") <= 0) {
      throw new ValidationError("Số tiền phiếu thu phải lớn hơn 0");
    }
    // V12 ⑥: input.amount = nguyên tệ; hạch toán bằng VND quy đổi.
    const cur = resolveDocCurrency(input.amount, input, input.docDate);

    const cashAcc = await this.acc.requireByCode(
      ctx,
      input.cashAccountCode ?? "111",
    );
    const counterAcc = await this.acc.requireByCode(
      ctx,
      input.counterAccountCode,
    );

    const year = new Date(input.docDate).getFullYear();
    const post = input.post ?? true;

    const receipt = await this.db.transaction(async (tx) => {
      const txDb = tx as unknown as Database;
      const docNo = await resolveDocNumber(txDb, ctx, "RECEIPT", {
        year,
        docDate: input.docDate,
        manualDocNo: input.docNo,
        checkDup: async (no) => {
          const dup = await tx
            .select({ id: receipts.id })
            .from(receipts)
            .where(and(eq(receipts.orgId, ctx.orgId), eq(receipts.docNo, no)))
            .limit(1);
          return dup.length > 0;
        },
      });

      const [row] = await tx
        .insert(receipts)
        .values({
          orgId: ctx.orgId,
          docNo,
          docDate: input.docDate,
          cashAccountId: cashAcc.id,
          counterAccountId: counterAcc.id,
          contactId: input.contactId,
          amount: cur.amountVND,
          currency: cur.currency,
          exchangeRate: cur.exchangeRate,
          amountOC: cur.amountOC,
          rateNote: cur.rateNote,
          rateDate: cur.rateDate,
          reason: input.reason,
          payerName: input.payerName,
          status: "DRAFT",
          createdBy: ctx.actor,
        })
        .returning();

      return row!;
    });

    await writeAudit(this.db, ctx, {
      action: "receipt.create",
      entityType: "receipt",
      entityId: receipt.id,
      detail: { docNo: receipt.docNo, amount: input.amount },
    });

    if (post) {
      return this.post(ctx, receipt.id);
    }
    return receipt;
  }

  /** Ghi sổ phiếu thu → sinh bút toán Nợ tiền / Có đối ứng. */
  async post(ctx: Ctx, receiptId: string): Promise<Receipt> {
    const receipt = await this.getById(ctx, receiptId);
    if (receipt.status !== "DRAFT") {
      throw new InvalidStateError(
        `Phiếu thu đã ở trạng thái ${receipt.status}, không ghi sổ lại được`,
      );
    }

    const entry = await this.ledger.createEntry(ctx, {
      entryDate: receipt.docDate,
      memo: receipt.reason ?? `Phiếu thu ${receipt.docNo}`,
      sourceType: "RECEIPT",
      sourceId: receipt.id,
      post: true,
      lines: [
        {
          accountId: receipt.cashAccountId,
          debit: receipt.amount,
          memo: receipt.reason ?? undefined,
          contactId: receipt.contactId ?? undefined,
        },
        {
          accountId: receipt.counterAccountId,
          credit: receipt.amount,
          memo: receipt.reason ?? undefined,
          contactId: receipt.contactId ?? undefined,
        },
      ],
    });

    const [updated] = await this.db
      .update(receipts)
      .set({
        status: "POSTED",
        journalEntryId: entry.id,
        updatedAt: new Date(),
      })
      .where(and(eq(receipts.id, receiptId), eq(receipts.orgId, ctx.orgId)))
      .returning();

    await writeAudit(this.db, ctx, {
      action: "receipt.post",
      entityType: "receipt",
      entityId: receiptId,
      detail: { journalEntryId: entry.id },
    });
    return updated!;
  }

  /** Huỷ phiếu thu đã ghi sổ (đảo bút toán). */
  async void(ctx: Ctx, receiptId: string): Promise<Receipt> {
    const receipt = await this.getById(ctx, receiptId);
    if (receipt.status !== "POSTED" || !receipt.journalEntryId) {
      throw new InvalidStateError("Chỉ huỷ được phiếu thu đã ghi sổ");
    }
    await this.ledger.reverseEntry(ctx, receipt.journalEntryId);
    const [updated] = await this.db
      .update(receipts)
      .set({ status: "VOIDED", updatedAt: new Date() })
      .where(and(eq(receipts.id, receiptId), eq(receipts.orgId, ctx.orgId)))
      .returning();
    await writeAudit(this.db, ctx, {
      action: "receipt.void",
      entityType: "receipt",
      entityId: receiptId,
    });
    return updated!;
  }

  async getById(ctx: Ctx, id: string): Promise<Receipt> {
    const [r] = await this.db
      .select()
      .from(receipts)
      .where(and(eq(receipts.id, id), eq(receipts.orgId, ctx.orgId)))
      .limit(1);
    if (!r) throw new NotFoundError("phiếu thu", id);
    return r;
  }

  async list(ctx: Ctx, limit = 50): Promise<Receipt[]> {
    return this.db
      .select()
      .from(receipts)
      .where(eq(receipts.orgId, ctx.orgId))
      .orderBy(desc(receipts.docDate), desc(receipts.createdAt))
      .limit(limit);
  }
}
