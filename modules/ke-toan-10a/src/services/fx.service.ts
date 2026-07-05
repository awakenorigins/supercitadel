import type { Database } from "../lib/db.js";
import type { Ctx } from "../lib/context.js";
import * as Money from "../lib/money.js";
import { ValidationError } from "../lib/errors.js";
import { LedgerService } from "./ledger.service.js";
import { AccountsService } from "./accounts.service.js";

export interface RevalueInput {
  accountCode: string;
  foreignCurrency: string; // ví dụ "USD"
  foreignAmount: string; // số dư gốc ngoại tệ
  newRate: string; // tỷ giá đánh giá lại
  revalDate?: string;
  gainAccountCode?: string; // 515
  lossAccountCode?: string; // 635
}

/**
 * FxService — đánh giá lại số dư gốc ngoại tệ cuối kỳ (TT133).
 * Giá trị mới VND = foreignAmount × newRate. Chênh lệch so với giá trị sổ:
 *  - TK dư Nợ (tiền/phải thu): lãi → Có 515, lỗ → Nợ 635.
 *  - TK dư Có (phải trả): lãi → Có 515, lỗ → Nợ 635 (điều chỉnh ngược chiều).
 * Chiều điều chỉnh chính TK xác định theo normalBalance.
 */
export class FxService {
  private ledger: LedgerService;
  private acc: AccountsService;
  constructor(private readonly db: Database) {
    this.ledger = new LedgerService(db);
    this.acc = new AccountsService(db);
  }

  async revalue(
    ctx: Ctx,
    input: RevalueInput,
  ): Promise<{
    accountCode: string;
    bookValue: string;
    revaluedValue: string;
    difference: string;
    result: "GAIN" | "LOSS" | "NONE";
    entryId?: string;
  }> {
    if (Money.compare(input.newRate, "0") <= 0) throw new ValidationError("Tỷ giá phải lớn hơn 0");
    const account = await this.acc.requireByCode(ctx, input.accountCode);
    const gainAcc = await this.acc.requireByCode(ctx, input.gainAccountCode ?? "515");
    const lossAcc = await this.acc.requireByCode(ctx, input.lossAccountCode ?? "635");
    const revalDate = input.revalDate ?? new Date().toISOString().slice(0, 10);

    const bal = await this.acc.getBalance(ctx, account.id, revalDate);
    const bookValue = bal.balance; // theo chiều bình thường (dương = phía normal)
    const revaluedValue = Money.multiply(input.foreignAmount, input.newRate);
    // adjustment theo chiều normal của TK (dương = tăng phía normal).
    const adjustment = Money.sub(revaluedValue, bookValue);
    const absAdj = Money.abs(adjustment);

    if (Money.compare(absAdj, "0") === 0) {
      return { accountCode: input.accountCode, bookValue, revaluedValue, difference: "0", result: "NONE" };
    }

    const isDebitNormal = account.normalBalance === "DEBIT";
    // Xác định lãi/lỗ theo bản chất:
    //  - Nợ-normal (tài sản): tăng phía normal = tài sản tăng = LÃI.
    //  - Có-normal (nợ phải trả): tăng phía normal = nợ tăng = LỖ.
    const increased = Money.compare(adjustment, "0") > 0;
    const isGain = isDebitNormal ? increased : !increased;

    let lines: Array<{ accountId: string; debit?: string; credit?: string }>;
    if (isDebitNormal) {
      // Điều chỉnh chính TK: tăng = Nợ, giảm = Có.
      lines = increased
        ? [
            { accountId: account.id, debit: absAdj },
            { accountId: gainAcc.id, credit: absAdj },
          ]
        : [
            { accountId: lossAcc.id, debit: absAdj },
            { accountId: account.id, credit: absAdj },
          ];
    } else {
      // TK dư Có: tăng phía normal = Có, giảm = Nợ.
      lines = increased
        ? [
            { accountId: lossAcc.id, debit: absAdj },
            { accountId: account.id, credit: absAdj },
          ]
        : [
            { accountId: account.id, debit: absAdj },
            { accountId: gainAcc.id, credit: absAdj },
          ];
    }

    const entry = await this.ledger.createEntry(ctx, {
      entryDate: revalDate,
      memo: `Đánh giá lại tỷ giá ${input.accountCode} (${input.foreignAmount} ${input.foreignCurrency} @ ${input.newRate})`,
      sourceType: "MANUAL",
      post: true,
      lines,
    });

    return {
      accountCode: input.accountCode,
      bookValue,
      revaluedValue,
      difference: adjustment,
      result: isGain ? "GAIN" : "LOSS",
      entryId: entry.id,
    };
  }
}
