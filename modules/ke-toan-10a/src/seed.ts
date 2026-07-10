import { and, eq } from "drizzle-orm";
import type { Database } from "./lib/db.js";
import { getDb } from "./lib/db.js";
import { accounts } from "./schema/accounts.js";
import { CHART_OF_ACCOUNTS, chartOf, type ChartStandard, type SeedAccount } from "./lib/chart-of-accounts.js";

export { CHART_OF_ACCOUNTS, CHART_TT133, CHART_TT200, CHART_TT99, chartOf } from "./lib/chart-of-accounts.js";
export type { SeedAccount, ChartStandard } from "./lib/chart-of-accounts.js";

export interface SeedOptions {
  /** Chuẩn hệ thống TK: TT133 (SME, mặc định) · TT99 (thay TT200 từ 2026, ~120 TK) · TT200 (deprecated). */
  standard?: ChartStandard;
  /** Chart tùy biến (ghi đè standard) — mảng SeedAccount từ JSON của DN. */
  custom?: SeedAccount[];
}

/**
 * Nạp hệ thống tài khoản mặc định (chuẩn TT133) cho một tổ chức.
 * Idempotent: chạy lại không tạo trùng (bỏ qua mã đã có).
 * Trả về số tài khoản MỚI tạo.
 *
 * Core SuperCitadel gọi hàm này khi một org bật module Kế Toán 10A lần đầu.
 * Có thể truyền `db` (dùng chung pool của core) hoặc để trống (dùng singleton).
 */
export async function seedChartOfAccounts(
  orgId: string,
  db: Database = getDb(),
  opts: SeedOptions = {},
): Promise<number> {
  const chart = opts.custom ?? chartOf(opts.standard ?? "TT133");
  const codeToId = new Map<string, string>();

  // Nạp tài khoản cha trước rồi mới tới con (để nối parentId).
  const parents = chart.filter((a) => !a.parentCode);
  const children = chart.filter((a) => a.parentCode);
  const ordered = [...parents, ...children];

  let created = 0;
  for (const acc of ordered) {
    const [existing] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.orgId, orgId), eq(accounts.code, acc.code)))
      .limit(1);
    if (existing) {
      codeToId.set(acc.code, existing.id);
      continue;
    }

    const parentId = acc.parentCode ? codeToId.get(acc.parentCode) : undefined;
    const [row] = await db
      .insert(accounts)
      .values({
        orgId,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        normalBalance: acc.normalBalance,
        parentId,
        isPostable: acc.isPostable,
        isSystem: acc.isSystem,
        createdBy: "seed",
      })
      .returning({ id: accounts.id });

    if (row) {
      codeToId.set(acc.code, row.id);
      created++;
    }
  }

  return created;
}
