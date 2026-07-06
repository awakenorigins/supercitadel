/**
 * SMOKE TEST PGlite (Postgres-in-WASM) — chạy được trong `pnpm -r test` của
 * SuperCitadel mà KHÔNG cần Postgres ngoài (đúng harness repo dùng cho acc.test.ts).
 * Bộ test đầy đủ 200+ ca (PG thật) nằm ở tests/ của gói.
 *
 * Chạy: npx tsx server/k10a.pglite.test.ts
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { KetoanServices } from "../src/services/index.js";
import { seedChartOfAccounts } from "../src/seed.js";
import { userCtx } from "../src/lib/context.js";
import * as Money from "../src/lib/money.js";
import type { Database } from "../src/lib/db.js";

let passed = 0,
  failed = 0;
function check(cond: boolean, name: string, extra?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const pg = new PGlite();
  const sql = readFileSync(join(here, "..", "migrations", "0000_init.sql"), "utf8");
  await pg.exec(sql);
  const db = drizzle(pg) as unknown as Database;
  const svc = new KetoanServices(db);

  console.log("=== PGLITE: seed 2 chuẩn chart ===");
  const orgA = randomUUID();
  const orgB = randomUUID();
  const nA = await seedChartOfAccounts(orgA, db);
  const nB = await seedChartOfAccounts(orgB, db, { standard: "TT200" });
  check(nA >= 30, "Org A: seed TT133", String(nA));
  check(nB >= 50, "Org B: seed TT200 ≥50 TK", String(nB));
  const A = userCtx(orgA, "pglite");
  const B = userCtx(orgB, "pglite");

  console.log("=== PGLITE: nghiệp vụ lõi ===");
  const r1 = await svc.receipts.create(A, { docDate: "2026-01-05", counterAccountCode: "411", amount: "50000000", reason: "Góp vốn", post: true });
  check(/^PT-/.test(r1.docNo), "Phiếu thu góp vốn PT-…", r1.docNo);
  const contact = await svc.contacts.create(A, { name: "Công ty Mây", type: "CUSTOMER" });
  const inv = await svc.invoices.create(A, { docDate: "2026-01-10", contactId: contact.id, subtotal: "10000000", taxRate: "8", post: true });
  check(Money.compare(inv.total, "10800000.00") === 0, "Hóa đơn 10tr + 8% = 10.8tr", inv.total);
  await svc.invoices.recordPayment(A, inv.id, "10800000");
  const inv2 = await svc.invoices.getByDocNoOrId(A, inv.docNo);
  check(inv2.status === "POSTED" && Money.compare(Money.sub(inv2.total, inv2.amountPaid), "0") === 0, "Knock-off tất toán (còn nợ 0)");

  const tb = await svc.reports.trialBalance(A);
  check(tb.balanced, "Cân đối thử: SỔ CÂN");
  const dash = await svc.reports.dashboard(A);
  check(Money.compare(dash.cash, "60800000.00") === 0, "Tiền = 50tr vốn + 10.8tr thu", dash.cash);

  console.log("=== PGLITE: tầng phân tích ===");
  await svc.budget.setBudget(A, { fiscalYear: "2026", accountCode: "642", amount: "5000000" });
  await svc.payments.create(A, { docDate: "2026-02-01", counterAccountCode: "642", amount: "7000000", reason: "Chi QLDN", post: true });
  const bva = await svc.budget.budgetVsActual(A, "2026");
  const row642 = bva.rows.find((r) => r.accountCode === "642");
  check(row642?.overBudget === true, "Ngân sách 642: phát hiện VƯỢT");
  const asset = await svc.assets.create(A, { name: "Máy in", cost: "12000000", usefulLifeMonths: 12, startDate: "2026-01-01" });
  const dep = await svc.assets.runDepreciation(A, "2026-03-15");
  check(dep.posted === 3, "Khấu hao 3 kỳ (T1→T3)", String(dep.posted));
  const a214 = await svc.accounts.requireByCode(A, "214");
  const bal214 = await svc.accounts.getBalance(A, a214.id);
  check(Money.compare(bal214.balance, "3000000.00") === 0, "214 dư Có 3tr (1tr/kỳ)", bal214.balance);

  console.log("=== PGLITE: toàn vẹn + cách ly tenant ===");
  const integ = await svc.reports.integrityCheck(A);
  check(integ.ok, "Tự-audit toàn vẹn OK");
  const tbB = await svc.reports.trialBalance(B);
  check(tbB.rows.every((r) => Money.compare(r.debit, "0") === 0 && Money.compare(r.credit, "0") === 0), "Org B sạch — không thấy dữ liệu org A");
  const tbA2 = await svc.reports.trialBalance(A);
  check(tbA2.balanced, "Org A vẫn cân sau toàn bộ chuỗi");

  console.log(`\n   KẾT QUẢ PGLITE 10A: ${passed} PASS, ${failed} FAIL`);
  await pg.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("[PGLITE]", e);
  process.exit(1);
});
