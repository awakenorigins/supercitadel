import { and, asc, eq, sql } from "drizzle-orm";
import type { Database } from "../lib/db.js";
import type { Ctx } from "../lib/context.js";
import * as Money from "../lib/money.js";
import { writeAudit } from "../lib/audit.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { fixedAssets, type FixedAsset } from "../schema/assets.js";
import { LedgerService } from "./ledger.service.js";
import { AccountsService } from "./accounts.service.js";

export interface CreateAssetInput {
  code?: string;
  name: string;
  cost: string;
  salvageValue?: string;
  usefulLifeMonths: number;
  startDate: string;
  assetAccountCode?: string; // 211
  depreciationAccountCode?: string; // 214
  expenseAccountCode?: string; // 642
  /** Ghi bút toán mua TSCĐ (Nợ 211 / Có [tiền/phải trả]). */
  acquireFromAccountCode?: string;
  /**
   * V12 ⑦: phân bổ khấu hao NHIỀU TK chi phí theo tỷ lệ %, VD 1 máy dùng chung:
   * [{code:"627",percent:50},{code:"641",percent:30},{code:"642",percent:20}].
   * Tổng percent PHẢI = 100. Bỏ trống = 100% vào expenseAccountCode.
   */
  allocations?: Array<{ code: string; percent: number }>;
}

/** Dòng phân bổ đã resolve lưu vào jsonb. */
interface AllocationStored {
  accountId: string;
  code: string;
  percent: number;
}

/** Cộng N tháng vào ngày, trả về mốc đầu tháng YYYY-MM-01. */
function monthStart(dateStr: string, addMonths = 0): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + addMonths);
  return d.toISOString().slice(0, 10);
}
function monthsBetween(from: string, to: string): number {
  const a = new Date(from + "T00:00:00Z");
  const b = new Date(to + "T00:00:00Z");
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

/**
 * AssetsService — tài sản cố định + khấu hao đường thẳng.
 * Khấu hao tháng = (cost − salvageValue) / usefulLifeMonths.
 * Mỗi kỳ ghi: Nợ [642/641] / Có 214. Lũy kế tối đa = cost − salvage.
 */
export class AssetsService {
  private ledger: LedgerService;
  private acc: AccountsService;
  constructor(private readonly db: Database) {
    this.ledger = new LedgerService(db);
    this.acc = new AccountsService(db);
  }

  async create(ctx: Ctx, input: CreateAssetInput): Promise<FixedAsset> {
    if (!input.name?.trim()) throw new ValidationError("Thiếu tên tài sản");
    if (Money.compare(input.cost, "0") <= 0) throw new ValidationError("Nguyên giá phải lớn hơn 0");
    if (!input.usefulLifeMonths || input.usefulLifeMonths <= 0) {
      throw new ValidationError("Số tháng khấu hao phải lớn hơn 0");
    }
    const asset = await this.acc.requireByCode(ctx, input.assetAccountCode ?? "211");
    const deprec = await this.acc.requireByCode(ctx, input.depreciationAccountCode ?? "214");
    const expense = await this.acc.requireByCode(ctx, input.expenseAccountCode ?? "642");
    const code = input.code ?? (await this.autoCode(ctx));

    // V12 ⑦: validate + resolve phân bổ multi-TK.
    let allocations: AllocationStored[] | null = null;
    if (input.allocations && input.allocations.length > 0) {
      const totalPct = input.allocations.reduce((s, a) => s + a.percent, 0);
      if (Math.abs(totalPct - 100) > 0.001) {
        throw new ValidationError(`Tổng tỷ lệ phân bổ phải = 100% (đang ${totalPct}%)`);
      }
      if (input.allocations.some((a) => a.percent <= 0)) {
        throw new ValidationError("Tỷ lệ phân bổ từng TK phải > 0");
      }
      const codes = input.allocations.map((a) => a.code);
      if (new Set(codes).size !== codes.length) {
        throw new ValidationError("TK phân bổ bị trùng — mỗi TK chỉ xuất hiện 1 lần");
      }
      allocations = [];
      for (const a of input.allocations) {
        const accRow = await this.acc.requireByCode(ctx, a.code);
        allocations.push({ accountId: accRow.id, code: a.code, percent: a.percent });
      }
    }

    const [row] = await this.db
      .insert(fixedAssets)
      .values({
        orgId: ctx.orgId,
        code,
        name: input.name,
        cost: input.cost,
        salvageValue: input.salvageValue ?? "0",
        usefulLifeMonths: input.usefulLifeMonths,
        startDate: input.startDate,
        assetAccountId: asset.id,
        depreciationAccountId: deprec.id,
        expenseAccountId: expense.id,
        allocations: allocations as never,
        status: "ACTIVE",
      })
      .returning();

    // Bút toán mua TSCĐ (tùy chọn).
    if (input.acquireFromAccountCode) {
      const from = await this.acc.requireByCode(ctx, input.acquireFromAccountCode);
      await this.ledger.createEntry(ctx, {
        entryDate: input.startDate,
        memo: `Mua TSCĐ ${code} — ${input.name}`,
        sourceType: "MANUAL",
        post: true,
        lines: [
          { accountId: asset.id, debit: input.cost },
          { accountId: from.id, credit: input.cost },
        ],
      });
    }

    await writeAudit(this.db, ctx, {
      action: "asset.create",
      entityType: "fixed_asset",
      entityId: row!.id,
      detail: { code, cost: input.cost },
    });
    return row!;
  }

  async list(ctx: Ctx): Promise<FixedAsset[]> {
    return this.db
      .select()
      .from(fixedAssets)
      .where(eq(fixedAssets.orgId, ctx.orgId))
      .orderBy(asc(fixedAssets.code));
  }

  /** Khấu hao 1 tháng cho 1 tài sản. */
  private monthlyDep(asset: FixedAsset): string {
    const base = Money.sub(asset.cost, asset.salvageValue);
    // Chia đều theo số tháng (làm tròn 2 chữ số).
    const per = (Number(base) / asset.usefulLifeMonths).toFixed(2);
    return per;
  }

  /**
   * Chạy khấu hao tới kỳ `asOf`. Với mỗi TSCĐ ACTIVE, ghi khấu hao cho các
   * tháng chưa ghi (từ sau lastDepreciationDate, hoặc từ startDate) tới asOf.
   * Bút toán mỗi tháng: Nợ [chi phí] / Có 214.
   */
  async runDepreciation(
    ctx: Ctx,
    asOf?: string,
  ): Promise<{ posted: number; assets: Array<{ code: string; months: number; amount: string }> }> {
    const target = monthStart(asOf ?? new Date().toISOString().slice(0, 10));
    const list = await this.db
      .select()
      .from(fixedAssets)
      .where(and(eq(fixedAssets.orgId, ctx.orgId), eq(fixedAssets.status, "ACTIVE")));

    let posted = 0;
    const results: Array<{ code: string; months: number; amount: string }> = [];

    for (const asset of list) {
      const firstPeriod = asset.lastDepreciationDate
        ? monthStart(asset.lastDepreciationDate, 1)
        : monthStart(asset.startDate);
      if (firstPeriod > target) continue;

      const depreciableTotal = Money.sub(asset.cost, asset.salvageValue);
      let accumulated = asset.accumulatedDepreciation;
      const perMonth = this.monthlyDep(asset);
      let months = 0;
      let totalThis = "0";
      let period = firstPeriod;
      let lastPeriod = asset.lastDepreciationDate;

      while (period <= target && Money.compare(accumulated, depreciableTotal) < 0 && months < 600) {
        // Kỳ cuối: chỉ ghi phần còn lại để không vượt (cost − salvage).
        let dep = perMonth;
        const remaining = Money.sub(depreciableTotal, accumulated);
        if (Money.compare(dep, remaining) > 0) dep = remaining;
        if (Money.compare(dep, "0") <= 0) break;

        // V12 ⑦: phân bổ multi-TK — chia dep theo % từng TK, dòng cuối nhận phần dư
        // làm tròn để tổng Nợ = Có tuyệt đối.
        const allocs = (asset.allocations as AllocationStored[] | null) ?? null;
        const debitLines: Array<{ accountId: string; debit: string }> = [];
        if (allocs && allocs.length > 0) {
          let assigned = "0";
          for (let i = 0; i < allocs.length; i++) {
            const isLast = i === allocs.length - 1;
            const part = isLast
              ? Money.sub(dep, assigned)
              : ((Number(dep) * allocs[i]!.percent) / 100).toFixed(2);
            if (Money.compare(part, "0") > 0) {
              debitLines.push({ accountId: allocs[i]!.accountId, debit: part });
              assigned = Money.add(assigned, part);
            }
          }
        } else {
          debitLines.push({ accountId: asset.expenseAccountId, debit: dep });
        }
        await this.ledger.createEntry(ctx, {
          entryDate: period,
          memo: `Khấu hao ${asset.code} kỳ ${period.slice(0, 7)}`,
          sourceType: "MANUAL",
          post: true,
          lines: [
            ...debitLines,
            { accountId: asset.depreciationAccountId, credit: dep },
          ],
        });
        accumulated = Money.add(accumulated, dep);
        totalThis = Money.add(totalThis, dep);
        months++;
        lastPeriod = period;
        period = monthStart(period, 1);
      }

      if (months > 0) {
        const fullyDepreciated = Money.compare(accumulated, depreciableTotal) >= 0;
        await this.db
          .update(fixedAssets)
          .set({
            accumulatedDepreciation: accumulated,
            lastDepreciationDate: lastPeriod,
            status: fullyDepreciated ? "FULLY_DEPRECIATED" : "ACTIVE",
            updatedAt: new Date(),
          })
          .where(and(eq(fixedAssets.id, asset.id), eq(fixedAssets.orgId, ctx.orgId)));
        posted += months;
        results.push({ code: asset.code, months, amount: totalThis });
      }
    }

    if (posted > 0) {
      await writeAudit(this.db, ctx, { action: "asset.depreciation", entityType: "fixed_asset", detail: { posted, assets: results.length } });
    }
    return { posted, assets: results };
  }

  private async autoCode(ctx: Ctx): Promise<string> {
    const [row] = await this.db
      .select({ n: sql<number>`COUNT(*)` })
      .from(fixedAssets)
      .where(eq(fixedAssets.orgId, ctx.orgId));
    const n = Number(row?.n ?? 0) + 1;
    return `TS${String(n).padStart(4, "0")}`;
  }
}
