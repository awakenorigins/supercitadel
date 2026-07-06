/**
 * STORE-FLOW TEST — mô phỏng đúng vòng đời module trên Cửa hàng SuperCitadel:
 * chưa mua → 403 MODULE_INACTIVE · mua+kích hoạt → full chức năng chạy ngay
 * (auto-setup) · tạm tắt → 403 (kể cả export) · bật lại → dữ liệu NGUYÊN VẸN
 * (chuẩn nghiệm thu #8) · Tiểu Tâm cũng bị gate y hệt và chạy mượt khi active.
 * Gate được nhân bản 1:1 từ requireModule của host v8.5 (AppError 403).
 */
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { getDb } from "../src/lib/db.js";
import { buildKeToan10aRoutes } from "../src/routes.js";
import { keToan10aTieuTamActions, type K10aActionCtx } from "../src/tieu-tam-actions.js";
import { KetoanServices } from "../src/services/index.js";
import { userCtx } from "../src/lib/context.js";
import * as Money from "../src/lib/money.js";

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

/* ── Nhân bản cơ chế store của host (in-memory org_modules) ── */
type OrgModule = { purchased: boolean; status: "active" | "inactive" };
const orgModules = new Map<string, OrgModule>();
const isModuleActive = (orgId: string) => {
  const r = orgModules.get(orgId);
  return Boolean(r && r.status === "active" && r.purchased);
};
const purchase = (orgId: string) => orgModules.set(orgId, { purchased: true, status: "active" });
const deactivate = (orgId: string) => { const r = orgModules.get(orgId); if (r) r.status = "inactive"; };
const reactivate = (orgId: string) => { const r = orgModules.get(orgId); if (r) r.status = "active"; };

const requireAuth: MiddlewareHandler = async (c, next) => {
  const org = c.req.header("x-test-org") ?? "";
  c.set("auth", { orgId: org, sub: "user-store" });
  await next();
};
/** Bản sao requireModule('ke-toan-10a') của host — 403 MODULE_INACTIVE. */
const gate: MiddlewareHandler = async (c, next) => {
  const auth = c.get("auth") as { orgId: string };
  if (!isModuleActive(auth.orgId)) {
    return c.json(
      { error: { code: "MODULE_INACTIVE", message: 'Module "ke-toan-10a" chưa kích hoạt — vào Cửa hàng Module để bật' } },
      403,
    );
  }
  await next();
};

async function main() {
  const db = getDb();
  const events: Array<{ type: string }> = [];
  const app = new Hono();
  app.route(
    "/api/v1/ke-toan-10a",
    buildKeToan10aRoutes({
      db,
      requireAuth,
      gate,
      audit: async () => {},
      publish: async (e) => { events.push({ type: e.type }); },
    }),
  );

  const org = randomUUID();
  const H = { "x-test-org": org, "content-type": "application/json" };
  const call = (path: string, init?: RequestInit) => app.request(`/api/v1/ke-toan-10a${path}`, { headers: H, ...init, ...(init?.headers ? { headers: { ...H, ...(init.headers as Record<string, string>) } } : {}) });

  console.log("\n=== 1. CHƯA MUA → 403 MODULE_INACTIVE ===");
  const pre = await call("/accounts");
  const preBody = (await pre.json()) as any;
  check(pre.status === 403 && preBody.error?.code === "MODULE_INACTIVE", "GET /accounts trước khi mua → 403 MODULE_INACTIVE", JSON.stringify(preBody));
  const preW = await call("/receipts", { method: "POST", body: JSON.stringify({ docDate: "2026-01-05", counterAccountCode: "511", amount: "1000", post: true }) });
  check(preW.status === 403, "Ghi sổ trước khi mua cũng bị chặn");

  console.log("\n=== 2. MUA + KÍCH HOẠT → CHẠY NGAY (auto-setup) ===");
  purchase(org);
  const setup = await call("/setup", { method: "POST", body: JSON.stringify({}) });
  const setupJ = (await setup.json()) as any;
  check(setup.status === 201 && setupJ.total >= 30, "POST /setup lần đầu → chart TT133 sẵn sàng", JSON.stringify(setupJ));
  const thu = await call("/receipts", { method: "POST", body: JSON.stringify({ docDate: "2026-01-05", counterAccountCode: "411", amount: "50000000", reason: "Góp vốn", post: true }) });
  check(thu.status === 201, "Phiếu thu góp vốn 50tr");
  const ct = await (await call("/contacts", { method: "POST", body: JSON.stringify({ name: "Công ty Mây", type: "CUSTOMER" }) })).json() as any;
  const hd = await (await call("/invoices", { method: "POST", body: JSON.stringify({ docDate: "2026-01-10", contactId: ct.id ?? ct.contact?.id, subtotal: "10000000", taxRate: "8", post: true }) })).json() as any;
  const hdRow = hd.invoice ?? hd;
  check(Money.compare(hdRow.total, "10800000.00") === 0, "Hóa đơn bán 10.8tr", hdRow.total);
  await call(`/invoices/${hdRow.id}/payment`, { method: "POST", body: JSON.stringify({ amount: "10800000" }) });
  await call("/assets", { method: "POST", body: JSON.stringify({ name: "Máy in", cost: "12000000", usefulLifeMonths: 12, startDate: "2026-01-01" }) });
  const dep = await (await call("/assets/depreciation", { method: "POST", body: JSON.stringify({ asOf: "2026-03-15" }) })).json() as any;
  check(dep.posted === 3, "Chạy khấu hao 3 kỳ qua HTTP", String(dep.posted));
  check(events.some((e) => e.type === "k10a.depreciation.posted"), "Realtime hook: bắn k10a.depreciation.posted");
  const tb1 = await (await call("/reports/trial-balance")).json() as any;
  check(tb1.balanced === true, "Sổ CÂN sau chuỗi nghiệp vụ");
  const rc1 = await (await call("/receipts")).json() as any;
  const nReceipts = rc1.receipts.length;
  check(nReceipts === 1, "Phiếu thu góp vốn nằm trong sổ (thu HĐ đi lối journal knock-off)", String(nReceipts));

  console.log("\n=== 3. TẠM TẮT MODULE → 403 (không gãy) ===");
  deactivate(org);
  const off1 = await call("/receipts");
  check(off1.status === 403 && ((await off1.json()) as any).error?.code === "MODULE_INACTIVE", "GET /receipts khi tắt → 403 MODULE_INACTIVE");
  const off2 = await call("/export/trial-balance.xlsx");
  check(off2.status === 403, "Export Excel khi tắt cũng 403 (không lộ dữ liệu)");

  console.log("\n=== 4. BẬT LẠI → DỮ LIỆU NGUYÊN VẸN (chuẩn #8) ===");
  reactivate(org);
  const rc2 = await (await call("/receipts")).json() as any;
  check(rc2.receipts.length === nReceipts, "Số phiếu thu giữ nguyên sau tắt/bật", `${rc2.receipts.length}/${nReceipts}`);
  const tb2 = await (await call("/reports/trial-balance")).json() as any;
  check(tb2.balanced === true, "Sổ vẫn CÂN — không mất một đồng nào");
  const dash = await (await call("/reports/dashboard")).json() as any;
  check(Money.compare(dash.cash, "60800000.00") === 0, "Tiền đúng: 50tr vốn + 10.8tr thu HĐ (TSCĐ ghi nhận không kèm chi tiền)", dash.cash);

  console.log("\n=== 5. TIỂU TÂM CŨNG BỊ GATE STORE Y HỆT ===");
  const defs = keToan10aTieuTamActions(db);
  const thuTien = defs.find((d) => d.name === "k10a.thu_tien")!;
  const mkCtx = (): K10aActionCtx => ({ db, orgId: org, userId: "tt", role: "manager", securityLevel: 2, audit: async () => {} });
  // mô phỏng executeAction host: gate module TRƯỚC permission
  async function hostExec(confirm: boolean) {
    if (!isModuleActive(org)) return { ok: false, code: "MODULE_INACTIVE" as const };
    if (thuTien.sensitive && !confirm) return { ok: true, dryRun: true as const };
    return thuTien.execute(mkCtx(), { soTien: 1000000, tenDoiTac: "Khách store" });
  }
  deactivate(org);
  const g1 = await hostExec(true);
  check((g1 as any).code === "MODULE_INACTIVE", "Module tắt → Tiểu Tâm bị chặn (không lách được gate)");
  reactivate(org);
  const g2 = await hostExec(false);
  check((g2 as any).dryRun === true, "Bật lại → lượt 1 dry-run đúng chuẩn v8.5");
  const g3 = await hostExec(true);
  check(g3.ok === true && /PT-/.test(String((g3 as any).data?.docNo)), "Confirm → Tiểu Tâm ghi phiếu thật");
  const svc = new KetoanServices(db);
  const tb3 = await svc.reports.trialBalance(userCtx(org, "verify"));
  check(tb3.balanced, "Sổ cân sau hành động Tiểu Tâm store-gated");

  console.log(`\n   KẾT QUẢ STORE-FLOW 10A: ${passed} PASS, ${failed} FAIL`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("[STORE-FLOW]", e);
  process.exit(1);
});
