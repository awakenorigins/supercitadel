import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../lib/db.js";
import type { Ctx } from "../lib/context.js";
import * as Money from "../lib/money.js";
import { writeAudit } from "../lib/audit.js";
import { nextDocNumber } from "../lib/docnumber.js";
import {
  InvalidStateError,
  NotFoundError,
  ValidationError,
} from "../lib/errors.js";
import { payments, type Payment } from "../schema/documents.js";
import { LedgerService } from "./ledger.service.js";
import { AccountsService } from "./accounts.service.js";

export interface CreatePaymentInput {
  docDate: string;
  /** Mã TK tiền chi (mặc định 111). */
  cashAccountCode?: string;
  /** Mã TK đối ứng (bắt buộc): 331, 642, 641... */
  counterAccountCode: string;
  amount: string;
  reason?: string;
  payeeName?: string;
  contactId?: string;
  post?: boolean;
}

/**
 * PaymentsService — Phiếu chi.
 * Bút toán khi ghi sổ: Nợ [TK đối ứng] / Có [TK tiền].
 */
export class PaymentsService {
  private ledger: LedgerService;
  private acc: AccountsService;

  constructor(private readonly db: Database) {
    this.ledger = new LedgerService(db);
    this.acc = new AccountsService(db);
  }

  async create(ctx: Ctx, input: CreatePaymentInput): Promise<Payment> {
    if (Money.compare(input.amount, "0") <= 0) {
      throw new ValidationError("Số tiền phiếu chi phải lớn hơn 0");
    }

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

    const payment = await this.db.transaction(async (tx) => {
      const txDb = tx as unknown as Database;
      const docNo = await nextDocNumber(txDb, ctx, "PAYMENT", year);

      const [row] = await tx
        .insert(payments)
        .values({
          orgId: ctx.orgId,
          docNo,
          docDate: input.docDate,
          cashAccountId: cashAcc.id,
          counterAccountId: counterAcc.id,
          contactId: input.contactId,
          amount: input.amount,
          reason: input.reason,
          payeeName: input.payeeName,
          status: "DRAFT",
          createdBy: ctx.actor,
        })
        .returning();
      return row!;
    });

    await writeAudit(this.db, ctx, {
      action: "payment.create",
      entityType: "payment",
      entityId: payment.id,
      detail: { docNo: payment.docNo, amount: input.amount },
    });

    if (post) {
      return this.post(ctx, payment.id);
    }
    return payment;
  }

  /** Ghi sổ phiếu chi → sinh bút toán Nợ đối ứng / Có tiền. */
  async post(ctx: Ctx, paymentId: string): Promise<Payment> {
    const payment = await this.getById(ctx, paymentId);
    if (payment.status !== "DRAFT") {
      throw new InvalidStateError(
        `Phiếu chi đã ở trạng thái ${payment.status}, không ghi sổ lại được`,
      );
    }

    const entry = await this.ledger.createEntry(ctx, {
      entryDate: payment.docDate,
      memo: payment.reason ?? `Phiếu chi ${payment.docNo}`,
      sourceType: "PAYMENT",
      sourceId: payment.id,
      post: true,
      lines: [
        {
          accountId: payment.counterAccountId,
          debit: payment.amount,
          memo: payment.reason ?? undefined,
          contactId: payment.contactId ?? undefined,
        },
        {
          accountId: payment.cashAccountId,
          credit: payment.amount,
          memo: payment.reason ?? undefined,
          contactId: payment.contactId ?? undefined,
        },
      ],
    });

    const [updated] = await this.db
      .update(payments)
      .set({
        status: "POSTED",
        journalEntryId: entry.id,
        updatedAt: new Date(),
      })
      .where(and(eq(payments.id, paymentId), eq(payments.orgId, ctx.orgId)))
      .returning();

    await writeAudit(this.db, ctx, {
      action: "payment.post",
      entityType: "payment",
      entityId: paymentId,
      detail: { journalEntryId: entry.id },
    });
    return updated!;
  }

  async void(ctx: Ctx, paymentId: string): Promise<Payment> {
    const payment = await this.getById(ctx, paymentId);
    if (payment.status !== "POSTED" || !payment.journalEntryId) {
      throw new InvalidStateError("Chỉ huỷ được phiếu chi đã ghi sổ");
    }
    await this.ledger.reverseEntry(ctx, payment.journalEntryId);
    const [updated] = await this.db
      .update(payments)
      .set({ status: "VOIDED", updatedAt: new Date() })
      .where(and(eq(payments.id, paymentId), eq(payments.orgId, ctx.orgId)))
      .returning();
    await writeAudit(this.db, ctx, {
      action: "payment.void",
      entityType: "payment",
      entityId: paymentId,
    });
    return updated!;
  }

  async getById(ctx: Ctx, id: string): Promise<Payment> {
    const [p] = await this.db
      .select()
      .from(payments)
      .where(and(eq(payments.id, id), eq(payments.orgId, ctx.orgId)))
      .limit(1);
    if (!p) throw new NotFoundError("phiếu chi", id);
    return p;
  }

  async list(ctx: Ctx, limit = 50): Promise<Payment[]> {
    return this.db
      .select()
      .from(payments)
      .where(eq(payments.orgId, ctx.orgId))
      .orderBy(desc(payments.docDate), desc(payments.createdAt))
      .limit(limit);
  }
}
