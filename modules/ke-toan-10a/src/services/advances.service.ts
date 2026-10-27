import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../lib/db.js";
import type { Ctx } from "../lib/context.js";
import * as Money from "../lib/money.js";
import { writeAudit } from "../lib/audit.js";
import { nextDocNumber } from "../lib/docnumber.js";
import { InvalidStateError, NotFoundError, ValidationError } from "../lib/errors.js";
import { advances, type Advance } from "../schema/advances.js";
import { invoices } from "../schema/documents.js";
import { bills } from "../schema/documents.js";
import { LedgerService } from "./ledger.service.js";
import { AccountsService } from "./accounts.service.js";

export type AdvanceType = "CUSTOMER_DEPOSIT" | "SUPPLIER_ADVANCE" | "EMPLOYEE_ADVANCE";

export interface CreateAdvanceInput {
  type: AdvanceType;
  docDate: string;
  amount: string;
  contactId?: string;
  partyName?: string;
  cashAccountCode?: string; // mặc định 111
  /** TK đối ứng ghi đè (mặc định theo loại: 131/331/141). */
  partyAccountCode?: string;
  description?: string;
}

/** TK đối ứng mặc định theo loại ứng trước. */
const DEFAULT_PARTY_ACC: Record<AdvanceType, string> = {
  CUSTOMER_DEPOSIT: "131", // khách trả trước (dư Có 131)
  SUPPLIER_ADVANCE: "331", // ứng trước NCC (dư Nợ 331)
  EMPLOYEE_ADVANCE: "141", // tạm ứng nhân viên
};

/**
 * AdvancesService — tạm ứng / đặt cọc / trả trước.
 * Bút toán khi ghi sổ:
 *   - CUSTOMER_DEPOSIT: Nợ [tiền] / Có 131  (khách đặt cọc)
 *   - SUPPLIER_ADVANCE: Nợ 331 / Có [tiền]  (ứng trước NCC)
 *   - EMPLOYEE_ADVANCE: Nợ 141 / Có [tiền]  (tạm ứng nhân viên)
 * "Áp" (apply) khoản ứng vào hóa đơn = phân bổ: giảm công nợ còn lại của hóa đơn
 * (phần netting đã xảy ra sẵn trên 131/331 nên không sinh bút toán mới).
 */
export class AdvancesService {
  private ledger: LedgerService;
  private acc: AccountsService;
  constructor(private readonly db: Database) {
    this.ledger = new LedgerService(db);
    this.acc = new AccountsService(db);
  }

  async create(ctx: Ctx, input: CreateAdvanceInput): Promise<Advance> {
    if (Money.compare(input.amount, "0") <= 0) {
      throw new ValidationError("Số tiền ứng phải lớn hơn 0");
    }
    const cash = await this.acc.requireByCode(ctx, input.cashAccountCode ?? "111");
    const partyCode = input.partyAccountCode ?? DEFAULT_PARTY_ACC[input.type];
    const party = await this.acc.requireByCode(ctx, partyCode);
    const year = new Date(input.docDate).getFullYear();

    const adv = await this.db.transaction(async (tx) => {
      const txDb = tx as unknown as Database;
      const docNo = await nextDocNumber(txDb, ctx, "ADV", year);
      const [row] = await tx
        .insert(advances)
        .values({
          orgId: ctx.orgId,
          docNo,
          docDate: input.docDate,
          type: input.type,
          contactId: input.contactId,
          partyName: input.partyName,
          cashAccountId: cash.id,
          partyAccountId: party.id,
          amount: input.amount,
          description: input.description,
          status: "DRAFT",
          createdBy: ctx.actor,
        })
        .returning();
      return row!;
    });

    // Bút toán.
    const isInflow = input.type === "CUSTOMER_DEPOSIT";
    const lines = isInflow
      ? [
          { accountId: cash.id, debit: input.amount },
          { accountId: party.id, credit: input.amount, contactId: input.contactId },
        ]
      : [
          { accountId: party.id, debit: input.amount, contactId: input.contactId },
          { accountId: cash.id, credit: input.amount },
        ];
    const entry = await this.ledger.createEntry(ctx, {
      entryDate: input.docDate,
      memo: `${this.label(input.type)} ${adv.docNo}`,
      sourceType: "MANUAL",
      post: true,
      lines,
    });

    const [updated] = await this.db
      .update(advances)
      .set({ status: "POSTED", journalEntryId: entry.id, updatedAt: new Date() })
      .where(and(eq(advances.id, adv.id), eq(advances.orgId, ctx.orgId)))
      .returning();

    await writeAudit(this.db, ctx, {
      action: "advance.create",
      entityType: "advance",
      entityId: adv.id,
      detail: { type: input.type, amount: input.amount },
    });
    return updated!;
  }

  /**
   * Áp khoản ứng vào hóa đơn (sales→CUSTOMER_DEPOSIT / purchase→SUPPLIER_ADVANCE).
   * Phân bổ: tăng amountPaid của hóa đơn + appliedAmount của khoản ứng.
   */
  async applyToInvoice(
    ctx: Ctx,
    advanceId: string,
    target: "invoice" | "bill",
    targetId: string,
    amount?: string,
  ): Promise<{ advance: Advance; applied: string }> {
    const adv = await this.getById(ctx, advanceId);
    if (adv.status !== "POSTED") throw new InvalidStateError("Khoản ứng chưa ghi sổ");
    const remaining = Money.sub(adv.amount, adv.appliedAmount);
    if (Money.compare(remaining, "0") <= 0) {
      throw new InvalidStateError("Khoản ứng đã áp hết");
    }

    const table = target === "invoice" ? invoices : bills;
    const [doc] = await this.db
      .select()
      .from(table)
      .where(and(eq(table.id, targetId), eq(table.orgId, ctx.orgId)))
      .limit(1);
    if (!doc) throw new NotFoundError(target === "invoice" ? "hóa đơn" : "hóa đơn mua", targetId);

    const docOutstanding = Money.sub((doc as any).total, (doc as any).amountPaid);
    if (Money.compare(docOutstanding, "0") <= 0) {
      throw new InvalidStateError("Hóa đơn đã thanh toán đủ");
    }
    let toApply: string;
    if (amount) {
      if (Money.compare(amount, remaining) > 0) throw new ValidationError("Vượt số ứng còn lại");
      if (Money.compare(amount, docOutstanding) > 0) throw new ValidationError("Vượt công nợ hóa đơn");
      toApply = amount;
    } else {
      // Áp tối đa: min(còn lại của khoản ứng, công nợ hóa đơn).
      toApply = Money.compare(remaining, docOutstanding) <= 0 ? remaining : docOutstanding;
    }

    await this.db
      .update(table)
      .set({ amountPaid: Money.add((doc as any).amountPaid, toApply), updatedAt: new Date() })
      .where(and(eq(table.id, targetId), eq(table.orgId, ctx.orgId)));

    const [updated] = await this.db
      .update(advances)
      .set({ appliedAmount: Money.add(adv.appliedAmount, toApply), updatedAt: new Date() })
      .where(and(eq(advances.id, advanceId), eq(advances.orgId, ctx.orgId)))
      .returning();

    await writeAudit(this.db, ctx, {
      action: "advance.apply",
      entityType: "advance",
      entityId: advanceId,
      detail: { target, targetId, applied: toApply },
    });
    return { advance: updated!, applied: toApply };
  }

  async getById(ctx: Ctx, id: string): Promise<Advance> {
    const [a] = await this.db
      .select()
      .from(advances)
      .where(and(eq(advances.id, id), eq(advances.orgId, ctx.orgId)))
      .limit(1);
    if (!a) throw new NotFoundError("khoản ứng", id);
    return a;
  }

  async list(ctx: Ctx, type?: AdvanceType, limit = 50): Promise<Advance[]> {
    const where = type
      ? and(eq(advances.orgId, ctx.orgId), eq(advances.type, type))
      : eq(advances.orgId, ctx.orgId);
    return this.db
      .select()
      .from(advances)
      .where(where)
      .orderBy(desc(advances.docDate), desc(advances.createdAt))
      .limit(limit);
  }

  private label(t: AdvanceType): string {
    return t === "CUSTOMER_DEPOSIT"
      ? "Khách đặt cọc"
      : t === "SUPPLIER_ADVANCE"
        ? "Ứng trước NCC"
        : "Tạm ứng nhân viên";
  }
}
