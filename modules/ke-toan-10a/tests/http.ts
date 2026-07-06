/** HTTP smoke test — contract buildKeToan10aRoutes với mock requireAuth (mô phỏng host inject). */
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { buildKeToan10aRoutes } from "../src/routes.js";
import { getDb } from "../src/lib/db.js";
import { seedChartOfAccounts } from "../src/seed.js";

let passed = 0, failed = 0;
function check(cond: boolean, name: string, extra?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
}

async function main() {
  const org = randomUUID();
  await seedChartOfAccounts(org);

  // Mock requireAuth (host inject): set auth context từ header test.
  const mockAuth: MiddlewareHandler = async (c, next): Promise<Response | void> => {
    const oid = c.req.header("x-test-org");
    if (!oid) return c.json({ error: { code: "UNAUTHORIZED", message: "no org" } }, 401);
    c.set("auth", { orgId: oid, sub: "tester" } as never);
    await next();
  };
  let auditCount = 0;
  const audit = async () => { auditCount++; };

  const router = buildKeToan10aRoutes({ db: getDb(), requireAuth: mockAuth, audit });
  const app = new Hono();
  app.route("/api/v1/ke-toan-10a", router);
  const H = { "x-test-org": org, "content-type": "application/json" };

  console.log("\n=== HEALTH (không auth) ===");
  const health = await app.request("/api/v1/ke-toan-10a/health");
  check(health.status === 200 && (await health.json() as any).module === "ke-toan-10a", "GET /health OK");

  console.log("\n=== AUTH: thiếu → 401 ===");
  check((await app.request("/api/v1/ke-toan-10a/accounts")).status === 401, "Không auth → 401");

  console.log("\n=== ACCOUNTS ===");
  const accs = await app.request("/api/v1/ke-toan-10a/accounts", { headers: H });
  check(accs.status === 200 && (await accs.json() as any).accounts.length > 25, "GET /accounts");

  console.log("\n=== RECEIPT (POST + audit) ===");
  const rc = await app.request("/api/v1/ke-toan-10a/receipts", {
    method: "POST", headers: H,
    body: JSON.stringify({ docDate: "2026-07-04", counterAccountCode: "511", amount: "3000000", post: true }),
  });
  check(rc.status === 201 && (await rc.json() as any).receipt.status === "POSTED", "POST /receipts → POSTED");
  check(auditCount > 0, "Audit sink được gọi");

  console.log("\n=== BILL (hoá đơn mua qua HTTP) ===");
  // tạo vendor trước
  const v = await app.request("/api/v1/ke-toan-10a/contacts", { method: "POST", headers: H, body: JSON.stringify({ name: "NCC HTTP", type: "VENDOR" }) });
  const vendorId = (await v.json() as any).contact.id;
  const bill = await app.request("/api/v1/ke-toan-10a/bills", {
    method: "POST", headers: H,
    body: JSON.stringify({ docDate: "2026-07-04", contactId: vendorId, subtotal: "2000000", taxRate: "8", post: true }),
  });
  check(bill.status === 201, "POST /bills OK");

  console.log("\n=== REPORTS: aging + outstanding + integrity ===");
  const aging = await app.request("/api/v1/ke-toan-10a/reports/aging?type=purchase", { headers: H });
  check(aging.status === 200, "GET /reports/aging");
  const outstanding = await app.request("/api/v1/ke-toan-10a/reports/outstanding?type=purchase", { headers: H });
  check(outstanding.status === 200, "GET /reports/outstanding");
  const integ = await app.request("/api/v1/ke-toan-10a/health/integrity", { headers: H });
  check(integ.status === 200 && (await integ.json() as any).ok === true, "GET /health/integrity → ok");

  console.log("\n=== EXCEL EXPORT (xlsx qua HTTP) ===");
  const xlsx = await app.request("/api/v1/ke-toan-10a/export/general-ledger.xlsx", { headers: H });
  const ct = xlsx.headers.get("content-type") ?? "";
  check(xlsx.status === 200 && ct.includes("spreadsheet"), "GET /export/general-ledger.xlsx");

  console.log("\n=== FISCAL YEAR ===");
  const fy = await app.request("/api/v1/ke-toan-10a/fiscal-years", {
    method: "POST", headers: H, body: JSON.stringify({ name: "2026", startDate: "2026-01-01", endDate: "2026-12-31" }),
  });
  check(fy.status === 201, "POST /fiscal-years");

  console.log("\n=== TIỂU TÂM ACTIONS (cổng) ===");
  const cat = await app.request("/api/v1/ke-toan-10a/actions", { headers: H });
  check(cat.status === 200 && (await cat.json() as any).actions.length >= 40, "GET /actions ≥20");
  const act = await app.request("/api/v1/ke-toan-10a/actions/ketoan.kiem_tra_so", { method: "POST", headers: H, body: "{}" });
  check(act.status === 200 && (await act.json() as any).ok, "POST /actions/kiem_tra_so");


  console.log("\n=== 8A: ADVANCES + RECURRING + IMPORT (HTTP) ===");
  const adv = await app.request("/api/v1/ke-toan-10a/advances", {
    method: "POST", headers: H,
    body: JSON.stringify({ type: "CUSTOMER_DEPOSIT", docDate: "2026-07-04", amount: "3000000", partyName: "Khách HTTP" }),
  });
  check(adv.status === 201, "POST /advances OK");
  const rec = await app.request("/api/v1/ke-toan-10a/recurring", {
    method: "POST", headers: H,
    body: JSON.stringify({ name: "Phí HTTP", kind: "PAYMENT", frequency: "MONTHLY", startDate: "2026-07-01", payload: { counterAccountCode: "642", cashAccountCode: "111", amount: "1000000" } }),
  });
  check(rec.status === 201, "POST /recurring OK");
  const runRec = await app.request("/api/v1/ke-toan-10a/recurring/run", { method: "POST", headers: H, body: JSON.stringify({ asOf: "2026-07-15" }) });
  check(runRec.status === 200 && (await runRec.json() as any).generated >= 1, "POST /recurring/run sinh chứng từ");
  const imp = await app.request("/api/v1/ke-toan-10a/import/contacts.csv", { method: "POST", headers: { ...H, "content-type": "text/csv" }, body: "name,type\nHTTP Co,CUSTOMER" });
  check(imp.status === 200 && (await imp.json() as any).created === 1, "POST /import/contacts.csv nhập 1");


  console.log("\n=== 10A: TẦNG 2 (HTTP) ===");
  const cc = await app.request("/api/v1/ke-toan-10a/cost-centers", { method: "POST", headers: H, body: JSON.stringify({ name: "Dự án HTTP", type: "PROJECT" }) });
  check(cc.status === 201, "POST /cost-centers OK");
  const bankImp = await app.request("/api/v1/ke-toan-10a/bank/import?account=112", { method: "POST", headers: { ...H, "content-type": "text/csv" }, body: "date,description,amount\n2026-07-01,Test thu,1000000" });
  check(bankImp.status === 200 && (await bankImp.json() as any).imported === 1, "POST /bank/import nhập 1 dòng");
  const recon = await app.request("/api/v1/ke-toan-10a/bank/reconciliation?account=112", { headers: H });
  check(recon.status === 200, "GET /bank/reconciliation OK");
  const asset = await app.request("/api/v1/ke-toan-10a/assets", { method: "POST", headers: H, body: JSON.stringify({ name: "Máy HTTP", cost: "12000000", usefulLifeMonths: 12, startDate: "2026-01-01" }) });
  check(asset.status === 201, "POST /assets OK");
  const budget = await app.request("/api/v1/ke-toan-10a/budgets", { method: "POST", headers: H, body: JSON.stringify({ fiscalYear: "2026", accountCode: "642", amount: "5000000" }) });
  check(budget.status === 201, "POST /budgets OK");
  const bva = await app.request("/api/v1/ke-toan-10a/reports/budget-vs-actual?year=2026", { headers: H });
  check(bva.status === 200, "GET /reports/budget-vs-actual OK");


  console.log("\n=== 10A: POST /setup (chọn chuẩn) ===");
  const org2 = randomUUID();
  const H2 = { "x-test-org": org2, "content-type": "application/json" };
  const st200 = await app.request("/api/v1/ke-toan-10a/setup", { method: "POST", headers: H2, body: JSON.stringify({ standard: "TT200" }) });
  const stj = await st200.json() as any;
  check(st200.status === 201 && stj.total >= 50 && stj.standard === "TT200", "POST /setup TT200 → ≥50 TK");
  const stAgain = await app.request("/api/v1/ke-toan-10a/setup", { method: "POST", headers: H2, body: JSON.stringify({ standard: "TT200" }) });
  check(((await stAgain.json()) as any).created === 0, "POST /setup idempotent");

  console.log(`\n=== KẾT QUẢ HTTP: ${passed} PASS, ${failed} FAIL ===\n`);
  if (failed > 0) process.exit(1);
}
main().catch((e) => { console.error("[HTTP]", e); process.exit(1); });
