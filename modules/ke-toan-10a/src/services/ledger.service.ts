import { and, eq, inArray, lte, gte } from "drizzle-orm";
import type { Database } from "../lib/db.js";
import type { Ctx } from "../lib/context.js";
import * as Money from "../lib/money.js";
import { writeAudit } from "../lib/audit.js";
import { nextDocNumber } from "../lib/docnumber.js";
import {
  InvalidStateError,
  NotFoundError,
  UnbalancedEntryError,
  ValidationError,
} from "../lib/errors.js";
import { accounts } from "../schema/accounts.js";
import {
  journalEntries,
  journalLines,
  type JournalEntry,
} from "../schema/journals.js";
import { fiscalYears } from "../schema/fiscal.js";

/** Một dòng bút toán đầu vào. Chỉ được có debit HOẶC credit (> 0). */
export interface JournalLineInput {
  accountId: string;
  debit?: string; // mặc định "0"
  credit?: string; // mặc định "0"
  memo?: string;
  contactId?: string;
  costCenterId?: string; // bộ phận/dự án (dimension)
}

export interface PostJournalInput {
  entryDate: string; // YYYY-MM-DD
  memo?: string;
  lines: JournalLineInput[];
  sourceType?:
    | "RECEIPT"
    | "PAYMENT"
    | "INVOICE"
    | "BILL"
    | "MANUAL"
    | "OPENING";
  sourceId?: string;
  currency?: string;
  exchangeRate?: string;
  /** Nếu true: ghi sổ luôn (POSTED). Nếu false: lưu nháp (DRAFT). */
  post?: boolean;
}

/**
 * LedgerService — trái tim kế toán kép.
 * Chịu trách nhiệm tạo, kiểm tra cân đối, ghi sổ và đảo bút toán.
 */
export class LedgerService {
  constructor(private readonly db: Database) {}

  /**
   * Kiểm tra một tập dòng có cân không và chuẩn hoá.
   * Quy tắc: mỗi dòng chỉ Nợ hoặc Có; tổng Nợ = tổng Có; ít nhất 2 dòng.
   */
  static validateBalance(lines: JournalLineInput[]): {
    totalDebit: string;
    totalCredit: string;
  } {
    if (!lines || lines.length < 2) {
      throw new ValidationError("Bút toán phải có ít nhất 2 dòng (Nợ và Có)");
    }

    let totalDebit = "0";
    let totalCredit = "0";

    for (const [i, line] of lines.entries()) {
      const debit = line.debit ?? "0";
      const credit = line.credit ?? "0";

      const dPos = Money.compare(debit, "0") > 0;
      const cPos = Money.compare(credit, "0") > 0;

      if (Money.isNegative(debit) || Money.isNegative(credit)) {
        throw new ValidationError(
          `Dòng ${i + 1}: số tiền Nợ/Có không được âm`,
        );
      }
      if (dPos && cPos) {
        throw new ValidationError(
          `Dòng ${i + 1}: một dòng chỉ được ghi Nợ HOẶC Có, không cả hai`,
        );
      }
      if (!dPos && !cPos) {
        throw new ValidationError(`Dòng ${i + 1}: phải có số tiền Nợ hoặc Có`);
      }

      totalDebit = Money.add(totalDebit, debit);
      totalCredit = Money.add(totalCredit, credit);
    }

    if (Money.compare(totalDebit, totalCredit) !== 0) {
      throw new UnbalancedEntryError(totalDebit, totalCredit);
    }

    return { totalDebit, totalCredit };
  }

  /**
   * Tạo bút toán (nháp hoặc ghi sổ ngay).
   * Chạy trong transaction: sinh số + insert header + insert lines nguyên tử.
   */
  async createEntry(ctx: Ctx, input: PostJournalInput): Promise<JournalEntry> {
    const { totalDebit } = LedgerService.validateBalance(input.lines);

    // Chặn hạch toán vào kỳ đã khóa (tinh hoa từ ACC4A).
    await this.assertPeriodOpen(ctx, input.entryDate);

    // Kiểm tra mọi tài khoản tồn tại, thuộc org, và cho phép ghi (isPostable).
    await this.assertAccountsPostable(
      ctx,
      input.lines.map((l) => l.accountId),
    );

    const year = new Date(input.entryDate).getFullYear();

    const entry = await this.db.transaction(async (tx) => {
      const entryNo = await nextDocNumber(
        tx as unknown as Database,
        ctx,
        "JOURNAL",
        year,
      );

      const [header] = await tx
        .insert(journalEntries)
        .values({
          orgId: ctx.orgId,
          entryNo,
          entryDate: input.entryDate,
          memo: input.memo,
          status: input.post ? "POSTED" : "DRAFT",
          sourceType: input.sourceType ?? "MANUAL",
          sourceId: input.sourceId,
          totalAmount: totalDebit,
          currency: input.currency ?? "VND",
          exchangeRate: input.exchangeRate ?? "1",
          createdBy: ctx.actor,
        })
        .returning();

      if (!header) throw new InvalidStateError("Không tạo được bút toán");

      await tx.insert(journalLines).values(
        input.lines.map((line, idx) => ({
          orgId: ctx.orgId,
          entryId: header.id,
          accountId: line.accountId,
          debit: line.debit ?? "0",
          credit: line.credit ?? "0",
          memo: line.memo,
          contactId: line.contactId,
          costCenterId: line.costCenterId,
          lineNo: idx + 1,
        })),
      );

      return header;
    });

    await writeAudit(this.db, ctx, {
      action: input.post ? "journal.post" : "journal.create",
      entityType: "journal_entry",
      entityId: entry.id,
      detail: { entryNo: entry.entryNo, total: totalDebit },
    });

    return entry;
  }

  /** Ghi sổ một bút toán nháp (DRAFT → POSTED). */
  async postEntry(ctx: Ctx, entryId: string): Promise<JournalEntry> {
    const entry = await this.getEntry(ctx, entryId);
    if (entry.status !== "DRAFT") {
      throw new InvalidStateError(
        `Chỉ ghi sổ được bút toán ở trạng thái nháp (hiện tại: ${entry.status})`,
      );
    }
    const [updated] = await this.db
      .update(journalEntries)
      .set({ status: "POSTED", updatedAt: new Date() })
      .where(
        and(
          eq(journalEntries.id, entryId),
          eq(journalEntries.orgId, ctx.orgId),
        ),
      )
      .returning();

    await writeAudit(this.db, ctx, {
      action: "journal.post",
      entityType: "journal_entry",
      entityId: entryId,
    });
    return updated!;
  }

  /**
   * Đảo bút toán (reversal). Không sửa/xoá bút toán đã ghi sổ —
   * thay vào đó tạo bút toán ngược (đổi Nợ↔Có) để giữ dấu vết kiểm toán.
   */
  async reverseEntry(
    ctx: Ctx,
    entryId: string,
    reversalDate?: string,
  ): Promise<JournalEntry> {
    const original = await this.getEntry(ctx, entryId);
    if (original.status !== "POSTED") {
      throw new InvalidStateError("Chỉ đảo được bút toán đã ghi sổ");
    }

    const origLines = await this.db
      .select()
      .from(journalLines)
      .where(
        and(
          eq(journalLines.entryId, entryId),
          eq(journalLines.orgId, ctx.orgId),
        ),
      );

    const reversed = await this.db.transaction(async (tx) => {
      const year = new Date(reversalDate ?? original.entryDate).getFullYear();
      const entryNo = await nextDocNumber(
        tx as unknown as Database,
        ctx,
        "JOURNAL",
        year,
      );

      const [header] = await tx
        .insert(journalEntries)
        .values({
          orgId: ctx.orgId,
          entryNo,
          entryDate: reversalDate ?? original.entryDate,
          memo: `Đảo bút toán ${original.entryNo}`,
          status: "POSTED",
          sourceType: original.sourceType,
          sourceId: original.sourceId,
          totalAmount: original.totalAmount,
          currency: original.currency,
          exchangeRate: original.exchangeRate,
          reversalOf: original.id,
          createdBy: ctx.actor,
        })
        .returning();

      // Đảo Nợ ↔ Có.
      await tx.insert(journalLines).values(
        origLines.map((l, idx) => ({
          orgId: ctx.orgId,
          entryId: header!.id,
          accountId: l.accountId,
          debit: l.credit, // đảo
          credit: l.debit, // đảo
          memo: `Đảo: ${l.memo ?? ""}`.trim(),
          contactId: l.contactId,
          costCenterId: l.costCenterId,
          lineNo: idx + 1,
        })),
      );

      // CHUẨN KẾ TOÁN (immutable ledger): KHÔNG xoá/ẩn bút toán gốc.
      // Bút toán gốc giữ nguyên POSTED; bút toán đảo (cũng POSTED) có số
      // Nợ/Có ngược lại nên hai cái NÉT VỀ 0 khi tính số dư & cân đối.
      // Liên kết truy vết qua cột reversalOf trên bút toán đảo.
      // (Không đặt bản gốc = VOIDED, nếu không sẽ bị trừ hai lần.)

      return header!;
    });

    await writeAudit(this.db, ctx, {
      action: "journal.reverse",
      entityType: "journal_entry",
      entityId: original.id,
      detail: { reversalEntryId: reversed.id, reversalNo: reversed.entryNo },
    });

    return reversed;
  }

  /** Lấy 1 bút toán kèm kiểm tra org. */
  async getEntry(ctx: Ctx, entryId: string): Promise<JournalEntry> {
    const [entry] = await this.db
      .select()
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.id, entryId),
          eq(journalEntries.orgId, ctx.orgId),
        ),
      )
      .limit(1);
    if (!entry) throw new NotFoundError("bút toán", entryId);
    return entry;
  }

  /** Lấy chi tiết dòng của 1 bút toán. */
  async getEntryLines(ctx: Ctx, entryId: string) {
    await this.getEntry(ctx, entryId); // đảm bảo thuộc org
    return this.db
      .select()
      .from(journalLines)
      .where(
        and(
          eq(journalLines.entryId, entryId),
          eq(journalLines.orgId, ctx.orgId),
        ),
      )
      .orderBy(journalLines.lineNo);
  }

  /**
   * Chặn hạch toán vào kỳ kế toán đã khóa. Nếu có fiscal year phủ ngày và
   * đã khóa → ném lỗi. Không có kỳ nào phủ = cho phép (chưa thiết lập kỳ).
   */
  private async assertPeriodOpen(ctx: Ctx, postingDate: string): Promise<void> {
    const [fy] = await this.db
      .select({ name: fiscalYears.name, isClosed: fiscalYears.isClosed })
      .from(fiscalYears)
      .where(
        and(
          eq(fiscalYears.orgId, ctx.orgId),
          lte(fiscalYears.startDate, postingDate),
          gte(fiscalYears.endDate, postingDate),
        ),
      )
      .limit(1);
    if (fy && fy.isClosed) {
      throw new InvalidStateError(
        `Kỳ kế toán ${fy.name} đã khóa — không thể hạch toán vào ${postingDate}`,
      );
    }
  }

  /** Kiểm tra tài khoản tồn tại, thuộc org và cho phép ghi. */
  private async assertAccountsPostable(
    ctx: Ctx,
    accountIds: string[],
  ): Promise<void> {
    const uniqueIds = [...new Set(accountIds)];
    const rows = await this.db
      .select({
        id: accounts.id,
        isPostable: accounts.isPostable,
        isActive: accounts.isActive,
        code: accounts.code,
      })
      .from(accounts)
      .where(
        and(eq(accounts.orgId, ctx.orgId), inArray(accounts.id, uniqueIds)),
      );

    const found = new Map(rows.map((r) => [r.id, r]));
    for (const id of uniqueIds) {
      const acc = found.get(id);
      if (!acc) throw new NotFoundError("tài khoản", id);
      if (!acc.isActive) {
        throw new InvalidStateError(
          `Tài khoản ${acc.code} đã ngừng hoạt động`,
        );
      }
      if (!acc.isPostable) {
        throw new InvalidStateError(
          `Tài khoản ${acc.code} là tài khoản tổng hợp, không ghi trực tiếp được`,
        );
      }
    }
  }
}
