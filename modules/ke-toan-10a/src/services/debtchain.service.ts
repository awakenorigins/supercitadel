import { and, asc, desc, eq } from "drizzle-orm";
import type { Database } from "../lib/db.js";
import type { Ctx } from "../lib/context.js";
import * as Money from "../lib/money.js";
import { writeAudit } from "../lib/audit.js";
import { resolveDocCurrency } from "../lib/currency.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { invoices, bills } from "../schema/documents.js";
import { debtChains, type DebtChain } from "../schema/debtchains.js";
import { contacts } from "../schema/contacts.js";
import { LedgerService } from "./ledger.service.js";
import { AccountsService } from "./accounts.service.js";

export interface SettleChainInput {
  /** "sales" = khách trả tiền (cấn 131) · "purchase" = mình trả NCC (cấn 331). */
  type: "sales" | "purchase";
  contactId: string;
  /** Số tiền nhận/trả — NGUYÊN TỆ nếu có currency ≠ VND. */
  amount: string;
  docDate?: string;
  /** TK tiền (mặc định 111). */
  cashAccountCode?: string;
  memo?: string;
  /** Đa tiền tệ tại NGÀY THANH TOÁN (Q1: kể cả đa tiền tệ). */
  currency?: string;
  exchangeRate?: string;
  rateNote?: string;
}

export interface ChainLink {
  docId: string;
  docNo: string;
  docDate: string;
  applied: string;
  remainingAfter: string;
}

/**
 * V12 ⑨ — DebtChainService: XÁC THỰC trả tiền → TỰ ĐỘNG hạch toán cấn trừ
 * chính xác CẢ CHUỖI công nợ (Q1 anh Nắng chốt 10/07/2026).
 *
 * Luồng: 1 lần thanh toán từ đối tác → phân bổ FIFO vào các hóa đơn POSTED
 * còn nợ (cũ nhất trước) → cập nhật amountPaid từng hóa đơn → sinh MỘT bút
 * toán gộp (thu: Nợ tiền / Có 131 per-hóa-đơn; chi: Nợ 331 per-hóa-đơn / Có tiền)
 * → lưu chain + links để tra soát. Tiền thừa (trả dư) ghi vào unallocated,
 * KHÔNG tự hạch toán phần thừa — báo để người dùng quyết (behavior rule ⑩).
 */
export class DebtChainService {
  private ledger: LedgerService;
  private acc: AccountsService;
  constructor(private readonly db: Database) {
    this.ledger = new LedgerService(db);
    this.acc = new AccountsService(db);
  }

  async settle(ctx: Ctx, input: SettleChainInput): Promise<{
    chain: DebtChain;
    links: ChainLink[];
    allocated: string;
    unallocated: string;
  }> {
    if (Money.compare(input.amount, "0") <= 0) {
      throw new ValidationError("Số tiền thanh toán phải lớn hơn 0");
    }
    const [contact] = await this.db
      .select({ id: contacts.id, name: contacts.name })
      .from(contacts)
      .where(and(eq(contacts.id, input.contactId), eq(contacts.orgId, ctx.orgId)))
      .limit(1);
    if (!contact) throw new NotFoundError(`đối tác ${input.contactId}`);

    const docDate = input.docDate ?? new Date().toISOString().slice(0, 10);
    // Đa tiền tệ tại ngày thanh toán: quy đổi VND rồi cấn trừ bằng VND.
    const cur = resolveDocCurrency(input.amount, input, docDate);
    const cashAcc = await this.acc.requireByCode(ctx, input.cashAccountCode ?? "111");

    // Lấy chứng từ còn nợ theo FIFO (docDate cũ nhất trước, rồi docNo).
    const isSales = input.type === "sales";
    const docs = isSales
      ? await this.db
          .select()
          .from(invoices)
          .where(and(eq(invoices.orgId, ctx.orgId), eq(invoices.contactId, input.contactId), eq(invoices.status, "POSTED")))
          .orderBy(asc(invoices.docDate), asc(invoices.docNo))
      : await this.db
          .select()
          .from(bills)
          .where(and(eq(bills.orgId, ctx.orgId), eq(bills.contactId, input.contactId), eq(bills.status, "POSTED")))
          .orderBy(asc(bills.docDate), asc(bills.docNo));

    // Phân bổ FIFO.
    let remaining = cur.amountVND;
    const links: ChainLink[] = [];
    const perDocCredit: Array<{ accountId: string; amount: string }> = [];
    for (const d of docs) {
      if (Money.compare(remaining, "0") <= 0) break;
      const outstanding = Money.sub(d.total, d.amountPaid);
      if (Money.compare(outstanding, "0") <= 0) continue;
      const applied = Money.compare(remaining, outstanding) >= 0 ? outstanding : remaining;
      remaining = Money.sub(remaining, applied);
      links.push({
        docId: d.id,
        docNo: d.docNo,
        docDate: d.docDate,
        applied,
        remainingAfter: Money.sub(outstanding, applied),
      });
      perDocCredit.push({
        accountId: isSales ? (d as typeof invoices.$inferSelect).receivableAccountId : (d as typeof bills.$inferSelect).payableAccountId,
        amount: applied,
      });
    }

    if (links.length === 0) {
      throw new ValidationError(
        `Đối tác "${contact.name}" không còn chứng từ nào có công nợ — không có gì để cấn trừ`,
      );
    }
    const allocated = Money.sub(cur.amountVND, remaining);

    // MỘT bút toán gộp cho cả chuỗi.
    const memo =
      input.memo ??
      `${isSales ? "Thu" : "Trả"} tiền cấn trừ chuỗi ${links.length} chứng từ — ${contact.name}` +
        (cur.currency !== "VND" ? ` (${cur.amountOC} ${cur.currency} @ ${cur.exchangeRate})` : "");
    // Gộp credit/debit per TK công nợ (thường cùng 131/331 → 1 dòng, giữ per-doc contactId).
    const entry = await this.ledger.createEntry(ctx, {
      entryDate: docDate,
      memo,
      sourceType: "MANUAL",
      post: true,
      lines: isSales
        ? [
            { accountId: cashAcc.id, debit: allocated },
            ...perDocCredit.map((p) => ({ accountId: p.accountId, credit: p.amount, contactId: input.contactId })),
          ]
        : [
            ...perDocCredit.map((p) => ({ accountId: p.accountId, debit: p.amount, contactId: input.contactId })),
            { accountId: cashAcc.id, credit: allocated },
          ],
    });

    // Cập nhật amountPaid từng chứng từ.
    for (const l of links) {
      if (isSales) {
        const doc = docs.find((d) => d.id === l.docId)! as typeof invoices.$inferSelect;
        await this.db
          .update(invoices)
          .set({ amountPaid: Money.add(doc.amountPaid, l.applied), updatedAt: new Date() })
          .where(and(eq(invoices.id, l.docId), eq(invoices.orgId, ctx.orgId)));
      } else {
        const doc = docs.find((d) => d.id === l.docId)! as typeof bills.$inferSelect;
        await this.db
          .update(bills)
          .set({ amountPaid: Money.add(doc.amountPaid, l.applied), updatedAt: new Date() })
          .where(and(eq(bills.id, l.docId), eq(bills.orgId, ctx.orgId)));
      }
    }

    const [chain] = await this.db
      .insert(debtChains)
      .values({
        orgId: ctx.orgId,
        chainType: input.type,
        contactId: input.contactId,
        docDate,
        totalAmount: cur.amountVND,
        unallocated: remaining,
        currency: cur.currency,
        exchangeRate: cur.exchangeRate,
        amountOC: cur.amountOC,
        rateNote: cur.rateNote,
        cashAccountId: cashAcc.id,
        journalEntryId: entry.id,
        memo,
        links: links as never,
        linkCount: links.length,
      })
      .returning();

    await writeAudit(this.db, ctx, {
      action: "debtchain.settle",
      entityType: "debt_chain",
      entityId: chain!.id,
      detail: { type: input.type, allocated, unallocated: remaining, linkCount: links.length },
    });

    return { chain: chain!, links, allocated, unallocated: remaining };
  }

  /** Xem trước phân bổ FIFO mà KHÔNG hạch toán (cho UI confirm trước khi xác thực). */
  async preview(ctx: Ctx, input: SettleChainInput): Promise<{
    links: ChainLink[];
    allocated: string;
    unallocated: string;
    amountVND: string;
  }> {
    if (Money.compare(input.amount, "0") <= 0) {
      throw new ValidationError("Số tiền thanh toán phải lớn hơn 0");
    }
    const docDate = input.docDate ?? new Date().toISOString().slice(0, 10);
    const cur = resolveDocCurrency(input.amount, input, docDate);
    const isSales = input.type === "sales";
    const docs = isSales
      ? await this.db
          .select()
          .from(invoices)
          .where(and(eq(invoices.orgId, ctx.orgId), eq(invoices.contactId, input.contactId), eq(invoices.status, "POSTED")))
          .orderBy(asc(invoices.docDate), asc(invoices.docNo))
      : await this.db
          .select()
          .from(bills)
          .where(and(eq(bills.orgId, ctx.orgId), eq(bills.contactId, input.contactId), eq(bills.status, "POSTED")))
          .orderBy(asc(bills.docDate), asc(bills.docNo));
    let remaining = cur.amountVND;
    const links: ChainLink[] = [];
    for (const d of docs) {
      if (Money.compare(remaining, "0") <= 0) break;
      const outstanding = Money.sub(d.total, d.amountPaid);
      if (Money.compare(outstanding, "0") <= 0) continue;
      const applied = Money.compare(remaining, outstanding) >= 0 ? outstanding : remaining;
      remaining = Money.sub(remaining, applied);
      links.push({ docId: d.id, docNo: d.docNo, docDate: d.docDate, applied, remainingAfter: Money.sub(outstanding, applied) });
    }
    return { links, allocated: Money.sub(cur.amountVND, remaining), unallocated: remaining, amountVND: cur.amountVND };
  }

  async list(ctx: Ctx, contactId?: string): Promise<DebtChain[]> {
    const conds = [eq(debtChains.orgId, ctx.orgId)];
    if (contactId) conds.push(eq(debtChains.contactId, contactId));
    return this.db
      .select()
      .from(debtChains)
      .where(and(...conds))
      .orderBy(desc(debtChains.docDate))
      .limit(100);
  }
}
