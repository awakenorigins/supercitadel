import { and, asc, eq, sql } from "drizzle-orm";
import type { Database } from "../lib/db.js";
import type { Ctx } from "../lib/context.js";
import * as Money from "../lib/money.js";
import { writeAudit } from "../lib/audit.js";
import {
  InvalidStateError,
  NotFoundError,
  ValidationError,
} from "../lib/errors.js";
import { accounts, type Account } from "../schema/accounts.js";
import { journalEntries, journalLines } from "../schema/journals.js";
import type { AccountType, NormalBalance } from "../types/index.js";

export interface CreateAccountInput {
  code: string;
  name: string;
  type: AccountType;
  parentId?: string;
  openingBalance?: string;
  isPostable?: boolean;
  description?: string;
}

/** Suy ra số dư bình thường (Nợ/Có) từ loại tài khoản. */
export function normalBalanceOf(type: AccountType): NormalBalance {
  // Tài sản & Chi phí có số dư Nợ; còn lại số dư Có.
  return type === "ASSET" || type === "EXPENSE" ? "DEBIT" : "CREDIT";
}

export class AccountsService {
  constructor(private readonly db: Database) {}

  /** Tạo tài khoản mới. */
  async create(ctx: Ctx, input: CreateAccountInput): Promise<Account> {
    if (!/^\d[\d.]*$/.test(input.code)) {
      throw new ValidationError(
        `Mã tài khoản "${input.code}" không hợp lệ (chỉ chữ số, ví dụ 111, 1111)`,
      );
    }

    // Kiểm tra trùng mã trong org.
    const existing = await this.findByCode(ctx, input.code);
    if (existing) {
      throw new InvalidStateError(`Mã tài khoản ${input.code} đã tồn tại`);
    }

    if (input.parentId) {
      await this.getById(ctx, input.parentId); // đảm bảo cha tồn tại
    }

    const [account] = await this.db
      .insert(accounts)
      .values({
        orgId: ctx.orgId,
        code: input.code,
        name: input.name,
        type: input.type,
        normalBalance: normalBalanceOf(input.type),
        parentId: input.parentId,
        openingBalance: input.openingBalance ?? "0",
        isPostable: input.isPostable ?? true,
        description: input.description,
        createdBy: ctx.actor,
      })
      .returning();

    await writeAudit(this.db, ctx, {
      action: "account.create",
      entityType: "account",
      entityId: account!.id,
      detail: { code: input.code, name: input.name },
    });
    return account!;
  }

  /** Danh sách tài khoản (có thể lọc theo loại). */
  async list(ctx: Ctx, filter?: { type?: AccountType }): Promise<Account[]> {
    const where = filter?.type
      ? and(eq(accounts.orgId, ctx.orgId), eq(accounts.type, filter.type))
      : eq(accounts.orgId, ctx.orgId);
    return this.db
      .select()
      .from(accounts)
      .where(where)
      .orderBy(asc(accounts.code));
  }

  async getById(ctx: Ctx, id: string): Promise<Account> {
    const [acc] = await this.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.orgId, ctx.orgId)))
      .limit(1);
    if (!acc) throw new NotFoundError("tài khoản", id);
    return acc;
  }

  async findByCode(ctx: Ctx, code: string): Promise<Account | null> {
    const [acc] = await this.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.code, code), eq(accounts.orgId, ctx.orgId)))
      .limit(1);
    return acc ?? null;
  }

  /** Tìm tài khoản theo mã, ném lỗi nếu không thấy (dùng cho documents). */
  async requireByCode(ctx: Ctx, code: string): Promise<Account> {
    const acc = await this.findByCode(ctx, code);
    if (!acc) {
      throw new NotFoundError(`tài khoản mã ${code}`);
    }
    return acc;
  }

  /**
   * Tính số dư hiện tại của một tài khoản (chỉ tính bút toán đã POSTED).
   * Số dư = số dư đầu kỳ +/- (tổng Nợ - tổng Có) theo chiều số dư bình thường.
   */
  async getBalance(
    ctx: Ctx,
    accountId: string,
    asOfDate?: string,
  ): Promise<{ account: Account; debit: string; credit: string; balance: string }> {
    const account = await this.getById(ctx, accountId);

    const conditions = [
      eq(journalLines.orgId, ctx.orgId),
      eq(journalLines.accountId, accountId),
      eq(journalEntries.status, "POSTED"),
    ];
    if (asOfDate) {
      conditions.push(sql`${journalEntries.entryDate} <= ${asOfDate}`);
    }

    const [agg] = await this.db
      .select({
        debit: sql<string>`COALESCE(SUM(${journalLines.debit}), 0)`,
        credit: sql<string>`COALESCE(SUM(${journalLines.credit}), 0)`,
      })
      .from(journalLines)
      .innerJoin(
        journalEntries,
        eq(journalLines.entryId, journalEntries.id),
      )
      .where(and(...conditions));

    const totalDebit = agg?.debit ?? "0";
    const totalCredit = agg?.credit ?? "0";

    // Chênh lệch phát sinh theo chiều số dư bình thường.
    const movement =
      account.normalBalance === "DEBIT"
        ? Money.sub(totalDebit, totalCredit)
        : Money.sub(totalCredit, totalDebit);

    const balance = Money.add(account.openingBalance, movement);

    return {
      account,
      debit: totalDebit,
      credit: totalCredit,
      balance,
    };
  }

  /** Ngừng hoạt động một tài khoản (soft). */
  async deactivate(ctx: Ctx, id: string): Promise<Account> {
    const acc = await this.getById(ctx, id);
    if (acc.isSystem) {
      throw new InvalidStateError("Không thể vô hiệu tài khoản hệ thống");
    }
    const [updated] = await this.db
      .update(accounts)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(accounts.id, id), eq(accounts.orgId, ctx.orgId)))
      .returning();
    await writeAudit(this.db, ctx, {
      action: "account.deactivate",
      entityType: "account",
      entityId: id,
    });
    return updated!;
  }
}
