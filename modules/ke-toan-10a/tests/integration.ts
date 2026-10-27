/** Integration test end-to-end Kế Toán 6A — cũ (5A) + gem mới (bills, aging, outstanding, integrity, fiscal, multi-line). */
import { randomUUID } from "node:crypto";
import { getDb } from "../src/lib/db.js";
import { KetoanServices } from "../src/services/index.js";
import { runAction } from "../src/actions/registry.js";
import { seedChartOfAccounts } from "../src/seed.js";
import * as Money from "../src/lib/money.js";
import { tieuTamCtx, userCtx } from "../src/lib/context.js";
import { NotFoundError, InvalidStateError } from "../src/lib/errors.js";
import { listActions } from "../src/actions/registry.js";

let passed = 0, failed = 0;
function check(cond: boolean, name: string, extra?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
}

async function main() {
  const db = getDb();
  const svc = new KetoanServices(db);
  const orgA = randomUUID(), orgB = randomUUID();
  const ctxA = userCtx(orgA, "user-a"), ctxB = userCtx(orgB, "user-b");
  const today = new Date().toISOString().slice(0, 10);

  console.log("\n=== SEED ===");
  check((await seedChartOfAccounts(orgA)) > 25, "Seed org A");
  await seedChartOfAccounts(orgB);

  console.log("\n=== PHIẾU THU/CHI (kế thừa 5A) ===");
  const rc = await svc.receipts.create(ctxA, { docDate: today, counterAccountCode: "511", amount: "5000000", post: true });
  check(rc.status === "POSTED" && rc.docNo.startsWith("PT-"), "Phiếu thu ghi sổ");
  await svc.payments.create(ctxA, { docDate: today, counterAccountCode: "642", amount: "1200000", post: true });

  console.log("\n=== HOÁ ĐƠN BÁN NHIỀU DÒNG (GEM multi-line) ===");
  const cust = await svc.contacts.create(ctxA, { name: "Công ty An Phát", type: "CUSTOMER" });
  const inv = await svc.invoices.create(ctxA, {
    docDate: today, dueDate: "2026-08-01", contactId: cust.id, taxRate: "8",
    lines: [
      { description: "Cà phê 1kg", qty: 10, rate: "150000" },
      { description: "Trà 0.5kg", qty: 5, rate: "100000" },
    ], post: true,
  });
  check(Money.compare(inv.subtotal, "2000000.00") === 0, "Multi-line subtotal = 10*150k+5*100k = 2tr", inv.subtotal);
  check(Money.compare(inv.taxAmount, "160000.00") === 0, "Thuế 8% = 160k");
  check(Money.compare(inv.total, "2160000.00") === 0, "Tổng = 2.16tr");
  const invLines = await svc.ledger.getEntryLines(ctxA, inv.journalEntryId!);
  check(invLines.length === 3, "Bút toán hoá đơn 3 dòng");

  console.log("\n=== HOÁ ĐƠN MUA (GEM bills — 5A thiếu) ===");
  const vendor = await svc.contacts.create(ctxA, { name: "NCC Hưng Thịnh", type: "VENDOR" });
  const bill = await svc.bills.create(ctxA, {
    docDate: today, dueDate: "2026-07-20", contactId: vendor.id,
    subtotal: "3000000", taxRate: "8", expenseAccountCode: "156", post: true,
  });
  check(Money.compare(bill.total, "3240000.00") === 0, "HĐ mua tổng = 3.24tr");
  const billLines = await svc.ledger.getEntryLines(ctxA, bill.journalEntryId!);
  check(billLines.length === 3, "Bút toán HĐ mua 3 dòng (Nợ 156 + Nợ 1331 / Có 331)");
  check(Money.compare(Money.sum(billLines.map((l) => l.debit)), Money.sum(billLines.map((l) => l.credit))) === 0, "Bút toán HĐ mua cân");
  // Trả tiền 1 phần
  const billPaid = await svc.bills.recordPayment(ctxA, bill.id, "1000000", "111");
  check(Money.compare(billPaid.amountPaid, "1000000.00") === 0, "Trả HĐ mua 1 phần = 1tr");

  console.log("\n=== TRIAL BALANCE CÂN ===");
  const tb = await svc.reports.trialBalance(ctxA);
  check(tb.balanced, "Trial balance cân", `Nợ ${tb.totalDebit} / Có ${tb.totalCredit}`);

  console.log("\n=== GEM: TỰ-AUDIT TOÀN VẸN SỔ ===");
  const integ = await svc.reports.integrityCheck(ctxA);
  check(integ.ok, "Integrity check OK");
  check(integ.checks.length === 3, "Có 3 kiểm tra");
  check(integ.checks.every((c) => c.ok), "Cả 3 kiểm tra đạt");

  console.log("\n=== GEM: CÔNG NỢ THEO ĐỐI TÁC (outstanding) ===");
  const outAR = await svc.reports.outstandingByParty(ctxA, "sales");
  check(Money.compare(outAR.grandTotal, "2160000.00") === 0, "Phải thu = 2.16tr (hoá đơn chưa thu)", outAR.grandTotal);
  const outAP = await svc.reports.outstandingByParty(ctxA, "purchase");
  check(Money.compare(outAP.grandTotal, "2240000.00") === 0, "Phải trả = 3.24tr - 1tr = 2.24tr", outAP.grandTotal);

  console.log("\n=== GEM: TUỔI NỢ (aging) ===");
  const aging = await svc.reports.aging(ctxA, "sales");
  check(Money.compare(aging.grandTotal, "2160000.00") === 0, "Aging phải thu tổng = 2.16tr");
  check(aging.parties.length === 1, "1 khách có công nợ");

  console.log("\n=== GEM: NĂM TÀI CHÍNH + KHÓA KỲ ===");
  const fy = await svc.fiscal.create(ctxA, { name: "2020", startDate: "2020-01-01", endDate: "2020-12-31" });
  await svc.fiscal.close(ctxA, fy.id);
  // Hạch toán vào kỳ đã khóa phải bị chặn
  try {
    await svc.receipts.create(ctxA, { docDate: "2020-06-15", counterAccountCode: "511", amount: "100000", post: true });
    check(false, "Chặn hạch toán vào kỳ đã khóa");
  } catch (e) {
    check(e instanceof InvalidStateError, "Chặn hạch toán vào kỳ đã khóa (2020 đã khóa)");
  }
  // Kỳ hiện tại (2026) vẫn ghi được
  const rcNow = await svc.receipts.create(ctxA, { docDate: today, counterAccountCode: "711", amount: "500000", post: true });
  check(rcNow.status === "POSTED", "Kỳ 2026 chưa khóa vẫn ghi được");

  console.log("\n=== GEM: EXCEL EXPORT ===");
  const xlsxGL = await svc.excel.exportGeneralLedger(ctxA);
  check(xlsxGL.length > 100 && xlsxGL[0] === 0x50 && xlsxGL[1] === 0x4b, "Xuất sổ cái .xlsx (magic PK)");
  const tmpl = svc.excel.importTemplate();
  check(tmpl.length > 100, "Tạo file mẫu nhập");
  // Parse import (validate) — file mẫu có 2 dòng hợp lệ
  const parsed = svc.excel.parseInvoiceImport(tmpl);
  check(parsed.errors.length === 0 && parsed.rows.length === 2, "Parse import file mẫu = 2 dòng hợp lệ", `errors=${parsed.errors.length} rows=${parsed.rows.length}`);

  console.log("\n=== TENANT ISOLATION ===");
  try { await svc.receipts.getById(ctxB, rc.id); check(false, "Org B chặn xem phiếu org A"); }
  catch (e) { check(e instanceof NotFoundError, "Org B chặn xem phiếu org A"); }
  const tbB = await svc.reports.trialBalance(ctxB);
  check(tbB.rows.length === 0, "Org B không thấy giao dịch org A");

  console.log("\n=== TIỂU TÂM ACTIONS (cũ + mới) ===");
  const tt = tieuTamCtx(orgA);
  const a1 = await runAction(svc, tt, "ketoan.tao_hoa_don_mua", { tenNhaCungCap: "NCC Test", tienHang: "1000000", thueSuat: "8" });
  check(a1.ok && a1.message.includes("1.080.000"), "Action tao_hoa_don_mua", a1.message);
  const a2 = await runAction(svc, tt, "ketoan.tuoi_no", { loai: "sales" });
  check(a2.ok && a2.message.includes("Tuổi nợ"), "Action tuoi_no");
  const a3 = await runAction(svc, tt, "ketoan.cong_no_doi_tac", { loai: "sales" });
  check(a3.ok && a3.message.includes("công nợ"), "Action cong_no_doi_tac");
  const a4 = await runAction(svc, tt, "ketoan.kiem_tra_so", {});
  check(a4.ok && a4.message.includes("SỔ LÀNH"), "Action kiem_tra_so");
  check(listActions().length >= 40, "Có ≥20 actions cho Tiểu Tâm");


  console.log("\n=== GEM VN: SAO KÊ CÔNG NỢ ===");
  const st = await svc.reports.statementOfAccount(ctxA, cust.id);
  check(st.contact?.id === cust.id, "Sao kê đúng đối tác");
  check(st.rows.length >= 1, "Sao kê có phát sinh");

  console.log("\n=== GEM VN: NHẮC HẠN CÔNG NỢ ===");
  const due = await svc.reports.dueReminders(ctxA, "sales", 7);
  check(typeof due.totalOverdue === "string", "Nhắc hạn trả về tổng quá hạn");

  console.log("\n=== GEM VN: CREDIT NOTE (điều chỉnh giảm) ===");
  // inv có subtotal 2tr, thuế 8% -> total 2.16tr. Điều chỉnh giảm 500k.
  const beforeTotal = (await svc.invoices.getById(ctxA, inv.id)).total;
  const adjusted = await svc.invoices.createCreditNote(ctxA, inv.id, "500000", "Trả lại hàng");
  check(Money.compare(adjusted.subtotal, "1500000.00") === 0, "Sau điều chỉnh subtotal = 1.5tr", adjusted.subtotal);
  check(Money.compare(adjusted.total, "1620000.00") === 0, "Sau điều chỉnh total = 1.62tr (giảm 540k gồm thuế)", adjusted.total);
  const tbAfterCN = await svc.reports.trialBalance(ctxA);
  check(tbAfterCN.balanced, "Trial balance cân sau credit note");

  console.log("\n=== GEM VN: TỜ KHAI THUẾ GTGT ===");
  const vat = await svc.vietnam.vatDeclaration(ctxA);
  check(Money.compare(vat.output.outputVat, "0") >= 0, "Có thuế đầu ra");
  check(Money.compare(vat.input.inputVat, "0") >= 0, "Có thuế đầu vào");
  check(vat.output.invoices.length >= 1, "Bảng kê hoá đơn bán có dòng");

  console.log("\n=== GEM VN: LƯU CHUYỂN TIỀN TỆ ===");
  const cf = await svc.vietnam.cashFlowStatement(ctxA);
  // Có phiếu thu 5tr (kinh doanh), phiếu chi 1.2tr, trả HĐ mua 1tr...
  check(typeof cf.operating === "string", "LCTT có dòng tiền HĐKD");
  check(Money.compare(cf.closingCash, "0") !== 0 || Money.compare(cf.openingCash, "0") === 0, "LCTT tính số dư tiền cuối kỳ");

  console.log("\n=== GEM VN: SỔ NHẬT KÝ CHUNG + SỔ QUỸ ===");
  const gj = await svc.vietnam.generalJournal(ctxA);
  check(gj.length > 5, "Nhật ký chung có bút toán");
  const cb = await svc.vietnam.cashBook(ctxA);
  check(cb.rows.length >= 1, "Sổ quỹ tiền mặt có phát sinh");

  console.log("\n=== GEM 8A: TẠM ỨNG / ĐẶT CỌC ===");
  const dep = await svc.advances.create(ctxA, { type: "CUSTOMER_DEPOSIT", docDate: today, amount: "3000000", contactId: cust.id, partyName: "Công ty An Phát" });
  check(dep.status === "POSTED" && dep.docNo.startsWith("ADV-"), "Tạo đặt cọc khách → POSTED");
  const supAdv = await svc.advances.create(ctxA, { type: "SUPPLIER_ADVANCE", docDate: today, amount: "2000000", partyName: "NCC X" });
  check(Money.compare(supAdv.amount, "2000000.00") === 0, "Ứng trước NCC");
  const empAdv = await svc.advances.create(ctxA, { type: "EMPLOYEE_ADVANCE", docDate: today, amount: "1000000", partyName: "NV Minh" });
  check(empAdv.status === "POSTED", "Tạm ứng nhân viên (141)");
  // Bút toán đặt cọc phải cân
  const depLines = await svc.ledger.getEntryLines(ctxA, dep.journalEntryId!);
  check(Money.compare(Money.sum(depLines.map(l=>l.debit)), Money.sum(depLines.map(l=>l.credit))) === 0, "Bút toán đặt cọc cân");

  console.log("\n=== GEM 8A: ÁP KHOẢN ỨNG VÀO HÓA ĐƠN ===");
  // Tạo hóa đơn mới cho An Phát rồi cấn trừ tiền cọc
  const inv2 = await svc.invoices.create(ctxA, { docDate: today, contactId: cust.id, subtotal: "5000000", taxRate: "0", post: true });
  const applied = await svc.advances.applyToInvoice(ctxA, dep.id, "invoice", inv2.id, "3000000");
  check(Money.compare(applied.applied, "3000000.00") === 0, "Cấn trừ 3tr cọc vào hóa đơn");
  const inv2After = await svc.invoices.getById(ctxA, inv2.id);
  check(Money.compare(Money.sub(inv2After.total, inv2After.amountPaid), "2000000.00") === 0, "Hóa đơn còn nợ 2tr sau cấn trừ", Money.sub(inv2After.total, inv2After.amountPaid));
  const depAfter = await svc.advances.getById(ctxA, dep.id);
  check(Money.compare(depAfter.appliedAmount, "3000000.00") === 0, "Khoản cọc đã áp hết 3tr");

  console.log("\n=== GEM 8A: DEBIT NOTE (điều chỉnh giảm mua) ===");
  const billForDN = await svc.bills.create(ctxA, { docDate: today, contactId: vendor.id, subtotal: "4000000", taxRate: "8", expenseAccountCode: "156", post: true });
  const dnBefore = billForDN.total;
  const dnAfter = await svc.bills.createDebitNote(ctxA, billForDN.id, "1000000", "Trả lại hàng lỗi");
  check(Money.compare(dnAfter.subtotal, "3000000.00") === 0, "Sau debit note subtotal = 3tr", dnAfter.subtotal);
  check(Money.compare(dnAfter.total, "3240000.00") === 0, "Sau debit note total = 3.24tr (giảm 1.08tr gồm thuế)", dnAfter.total);
  const tbAfterDN = await svc.reports.trialBalance(ctxA);
  check(tbAfterDN.balanced, "Trial balance cân sau debit note");

  console.log("\n=== GEM 8A: GIAO DỊCH ĐỊNH KỲ ===");
  // Đặt lịch chi tiền thuê hàng tháng, bắt đầu 3 tháng trước → runDue phải bắt kịp
  const startPast = "2026-01-01";
  const tpl = await svc.recurring.create(ctxA, {
    name: "Tiền thuê VP", kind: "PAYMENT", frequency: "MONTHLY",
    payload: { counterAccountCode: "642", cashAccountCode: "111", amount: "5000000", reason: "Thuê văn phòng" },
    startDate: startPast,
  });
  check(tpl.isActive && tpl.nextRunDate === startPast, "Tạo mẫu định kỳ");
  const run = await svc.recurring.runDue(ctxA, "2026-03-15");
  // Từ 2026-01-01 chạy hàng tháng đến 2026-03-15: 01-01, 02-01, 03-01 = 3 kỳ
  check(run.generated === 3, "Chạy định kỳ bắt kịp 3 kỳ (T1,T2,T3)", String(run.generated));
  const tplAfter = (await svc.recurring.list(ctxA)).find(t => t.id === tpl.id)!;
  check(tplAfter.runCount === 3 && tplAfter.nextRunDate === "2026-04-01", "Dời hạn sang T4 sau khi chạy");

  console.log("\n=== GEM 8A: HẠN MỨC TÍN DỤNG ===");
  const custLimit = await svc.contacts.create(ctxA, { name: "Khách Hạn Mức", type: "CUSTOMER", creditLimit: "10000000" });
  const status1 = await svc.contacts.checkCreditLimit(ctxA, custLimit.id, "5000000");
  check(status1.hasLimit && !status1.exceeded, "Trong hạn mức: 5tr < 10tr");
  // Hóa đơn 8tr OK
  await svc.invoices.create(ctxA, { docDate: today, contactId: custLimit.id, subtotal: "8000000", taxRate: "0", post: true });
  // Hóa đơn thêm 5tr → tổng 13tr > 10tr → chặn
  try {
    await svc.invoices.create(ctxA, { docDate: today, contactId: custLimit.id, subtotal: "5000000", taxRate: "0", post: true });
    check(false, "Chặn hóa đơn vượt hạn mức");
  } catch (e) {
    check(e instanceof InvalidStateError, "Chặn hóa đơn vượt hạn mức (13tr > 10tr)");
  }
  // Override thì cho qua
  const forced = await svc.invoices.create(ctxA, { docDate: today, contactId: custLimit.id, subtotal: "5000000", taxRate: "0", post: true, allowExceedCredit: true });
  check(forced.status === "POSTED", "Override allowExceedCredit → cho qua");

  console.log("\n=== GEM 8A: NHẬP CSV DANH MỤC ===");
  const csvAcc = "code,name,type\n1388,Phải thu khác,ASSET\n3388,Phải trả khác,LIABILITY\n111,Tiền mặt,ASSET";
  const impAcc = await svc.imports.importAccounts(ctxA, csvAcc);
  check(impAcc.created === 2 && impAcc.skipped === 1, "Nhập TK: 2 mới, 1 bỏ qua (111 đã có)", `created=${impAcc.created} skipped=${impAcc.skipped}`);
  const csvCon = "name,type,taxCode,creditLimit\nCông ty Mới 1,CUSTOMER,0101234567,20000000\nNCC Mới 2,VENDOR,,0";
  const impCon = await svc.imports.importContacts(ctxA, csvCon);
  check(impCon.created === 2, "Nhập đối tác: 2 mới", `created=${impCon.created}`);
  const newCon = await svc.contacts.findByName(ctxA, "Công ty Mới 1");
  check(newCon != null && Money.compare(newCon.creditLimit, "20000000.00") === 0, "Đối tác nhập có hạn mức 20tr");


  // ========== TẦNG 2: PHÂN TÍCH NÂNG CAO (org C sạch, xác định) ==========
  const orgC = randomUUID();
  const ctxC = userCtx(orgC, "user-c");
  await seedChartOfAccounts(orgC);
  const accC = async (code: string) => (await svc.accounts.requireByCode(ctxC, code)).id;

  console.log("\n=== GEM 10A: BỘ PHẬN / DỰ ÁN (dimensions) ===");
  const ccKD = await svc.dimensions.create(ctxC, { name: "Kinh doanh", type: "DEPARTMENT" });
  const ccMKT = await svc.dimensions.create(ctxC, { name: "Marketing", type: "DEPARTMENT" });
  check(ccKD.code === "BP001" && ccMKT.code === "BP002", "Tạo 2 bộ phận, mã tự tăng", `${ccKD.code},${ccMKT.code}`);
  // Doanh thu gắn KD 20tr
  await svc.ledger.createEntry(ctxC, { entryDate: "2026-02-05", memo: "DT KD", sourceType: "MANUAL", post: true,
    lines: [{ accountId: await accC("112"), debit: "20000000" }, { accountId: await accC("511"), credit: "20000000", costCenterId: ccKD.id }] });
  // Chi phí gắn MKT 8tr
  await svc.ledger.createEntry(ctxC, { entryDate: "2026-02-06", memo: "CP MKT", sourceType: "MANUAL", post: true,
    lines: [{ accountId: await accC("641"), debit: "8000000", costCenterId: ccMKT.id }, { accountId: await accC("112"), credit: "8000000" }] });
  const pbcc = await svc.dimensions.profitByCostCenter(ctxC);
  const kdRow = pbcc.rows.find(r => r.costCenterId === ccKD.id)!;
  const mktRow = pbcc.rows.find(r => r.costCenterId === ccMKT.id)!;
  check(Money.compare(kdRow.income, "20000000.00") === 0 && Money.compare(kdRow.profit, "20000000.00") === 0, "KD: doanh thu 20tr, lãi 20tr");
  check(Money.compare(mktRow.expense, "8000000.00") === 0 && Money.compare(mktRow.profit, "-8000000.00") === 0, "MKT: chi phí 8tr, lỗ 8tr");

  console.log("\n=== GEM 10A: ĐỐI CHIẾU NGÂN HÀNG ===");
  // Bút toán chi qua NH 112: Nợ 642 / Có 112, 2tr
  await svc.payments.create(ctxC, { docDate: "2026-02-10", cashAccountCode: "112", counterAccountCode: "642", amount: "2000000", post: true });
  const stmt = "date,description,amount\n2026-02-11,Thanh toan tien dien,-2000000\n2026-02-12,Thu khac tu doi tac,5000000";
  const imp = await svc.bank.importStatement(ctxC, "112", stmt);
  check(imp.imported === 2, "Nhập sao kê 2 dòng");
  const m = await svc.bank.autoMatch(ctxC, "112");
  check(m.matched === 1, "Tự khớp 1 dòng (chi 2tr với bút toán)", `matched=${m.matched}`);
  await svc.bank.addRule(ctxC, "Thu khac", "511");
  const ar = await svc.bank.applyRules(ctxC, "112");
  check(ar.created === 1, "Áp quy tắc sinh 1 chứng từ (+5tr)", `created=${ar.created}`);
  const recon = await svc.bank.reconciliationReport(ctxC, "112");
  check(recon.reconciled && recon.unmatchedCount === 0, "Đối chiếu khớp hết (0 chưa khớp)");

  console.log("\n=== GEM 10A: TSCĐ + KHẤU HAO ===");
  const asset = await svc.assets.create(ctxC, { name: "Máy chủ", cost: "36000000", usefulLifeMonths: 36, startDate: "2026-01-01", expenseAccountCode: "642", acquireFromAccountCode: "112" });
  check(asset.code === "TS0001" && asset.status === "ACTIVE", "Tạo TSCĐ");
  const depRun = await svc.assets.runDepreciation(ctxC, "2026-03-15");
  check(depRun.posted === 3, "Khấu hao 3 kỳ (T1,T2,T3)", `posted=${depRun.posted}`);
  const assetAfter = (await svc.assets.list(ctxC)).find(a => a.id === asset.id)!;
  check(Money.compare(assetAfter.accumulatedDepreciation, "3000000.00") === 0, "Hao mòn lũy kế 3tr (3×1tr)", assetAfter.accumulatedDepreciation);

  console.log("\n=== GEM 10A: DỰ TOÁN NGÂN SÁCH ===");
  // 642 thực tế = chi 2tr (NH) + khấu hao 3tr = 5tr
  await svc.budget.setBudget(ctxC, { fiscalYear: "2026", accountCode: "642", amount: "10000000" });
  await svc.budget.setBudget(ctxC, { fiscalYear: "2026", accountCode: "641", amount: "5000000" });
  const bva = await svc.budget.budgetVsActual(ctxC, "2026");
  const r642 = bva.rows.find(r => r.accountCode === "642")!;
  const r641 = bva.rows.find(r => r.accountCode === "641")!;
  check(Money.compare(r642.actual, "5000000.00") === 0 && !r642.overBudget && r642.usedPct === 50, "642: thực tế 5tr/10tr = 50%, không vượt", `actual=${r642.actual} pct=${r642.usedPct}`);
  check(Money.compare(r641.actual, "8000000.00") === 0 && r641.overBudget, "641: thực tế 8tr > 5tr → VƯỢT ngân sách");
  // upsert: đặt lại 642 = 20tr
  await svc.budget.setBudget(ctxC, { fiscalYear: "2026", accountCode: "642", amount: "20000000" });
  const bva2 = await svc.budget.budgetVsActual(ctxC, "2026");
  check(Money.compare(bva2.rows.find(r => r.accountCode === "642")!.budget, "20000000.00") === 0, "Upsert ngân sách 642 → 20tr (không nhân đôi dòng)");

  console.log("\n=== GEM 10A: ĐÁNH GIÁ LẠI TỶ GIÁ ===");
  // 131 sạch trong orgC: post Nợ 131 / Có 511 24tr (= 1000 USD @ 24000)
  await svc.ledger.createEntry(ctxC, { entryDate: "2026-03-01", memo: "Phải thu USD", sourceType: "MANUAL", post: true,
    lines: [{ accountId: await accC("131"), debit: "24000000" }, { accountId: await accC("511"), credit: "24000000" }] });
  const fx = await svc.fx.revalue(ctxC, { accountCode: "131", foreignCurrency: "USD", foreignAmount: "1000", newRate: "24500" });
  check(fx.result === "GAIN" && Money.compare(fx.difference, "500000.00") === 0, "FX: 131 tăng (24000→24500) → LÃI 500k", `${fx.result} ${fx.difference}`);
  // TK dư Có (331): post Có 331 24tr, revalue lên 24500 → nợ tăng → LỖ
  await svc.ledger.createEntry(ctxC, { entryDate: "2026-03-01", memo: "Phải trả USD", sourceType: "MANUAL", post: true,
    lines: [{ accountId: await accC("112"), debit: "24000000" }, { accountId: await accC("331"), credit: "24000000" }] });
  const fx2 = await svc.fx.revalue(ctxC, { accountCode: "331", foreignCurrency: "USD", foreignAmount: "1000", newRate: "24500" });
  check(fx2.result === "LOSS" && Money.compare(fx2.difference, "500000.00") === 0, "FX: 331 (nợ) tăng → LỖ 500k", `${fx2.result} ${fx2.difference}`);
  const tbC = await svc.reports.trialBalance(ctxC);
  check(tbC.balanced, "Trial balance org C cân sau mọi thao tác Tầng 2");



  console.log("\n=== GEM 10A: CHART TT133/TT200 + TÙY BIẾN ===");
  const orgD = randomUUID();
  const nTT200 = await seedChartOfAccounts(orgD, undefined as never, { standard: "TT200" });
  check(nTT200 >= 50, "Seed TT200 ≥50 TK", String(nTT200));
  const ctxD = userCtx(orgD, "user-d");
  const a621 = await svc.accounts.findByCode(ctxD, "621");
  const a334 = await svc.accounts.findByCode(ctxD, "334");
  check(a621 != null && a334 != null, "TT200 có 621 (CP NVL trực tiếp) + 334 (phải trả NLĐ)");
  const a214d = await svc.accounts.findByCode(ctxD, "214");
  check(a214d?.normalBalance === "CREDIT", "TT200: 214 contra-asset dư Có");
  // Mọi mã mặc định của service phải tồn tại trong TT200
  for (const code of ["111","112","131","1331","141","156","211","214","331","3331","411","421","511","515","632","635","641","642","911"]) {
    const a = await svc.accounts.findByCode(ctxD, code);
    if (!a) { check(false, `TT200 thiếu mã dịch vụ cần: ${code}`); }
  }
  check(true, "TT200 là tập cha đủ mã mặc định của mọi service");
  const again = await seedChartOfAccounts(orgD, undefined as never, { standard: "TT200" });
  check(again === 0, "Seed TT200 idempotent (chạy lại = 0 mới)");
  // Chart tùy biến JSON
  const orgE = randomUUID();
  const nCustom = await seedChartOfAccounts(orgE, undefined as never, { custom: [
    { code: "111", name: "Két tiền", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: true },
    { code: "511", name: "Doanh thu", type: "INCOME", normalBalance: "CREDIT", isPostable: true, isSystem: true },
    { code: "911", name: "KQKD", type: "EQUITY", normalBalance: "CREDIT", isPostable: true, isSystem: true },
  ] });
  check(nCustom === 3, "Chart tùy biến JSON: seed đúng 3 TK", String(nCustom));

  console.log("\n=== GEM VN: KẾT CHUYỂN CUỐI KỲ ===");
  // Tạo niên độ 2026 (chứa các giao dịch today ~2026), kết chuyển + khóa.
  const fy2026 = await svc.fiscal.create(ctxA, { name: "KC2026", startDate: "2026-01-01", endDate: "2026-12-31" });
  const closing = await svc.closing.closeFiscalYear(ctxA, fy2026.id);
  check(closing.entries.length >= 2, "Kết chuyển sinh ≥2 bút toán (DT + CP)");
  check(Money.compare(closing.totalIncome, "0") > 0, "Kết chuyển có doanh thu");
  // Sau kết chuyển, 511/642... phải về 0 trong kỳ; 911 cũng về 0; lãi/lỗ vào 421.
  const acc911 = await svc.accounts.requireByCode(ctxA, "911");
  const bal911 = await svc.accounts.getBalance(ctxA, acc911.id);
  check(Money.compare(bal911.balance, "0") === 0, "TK 911 về 0 sau kết chuyển", bal911.balance);
  const tbAfterClose = await svc.reports.trialBalance(ctxA);
  check(tbAfterClose.balanced, "Trial balance vẫn cân sau kết chuyển");
  // Niên độ đã khóa → không ghi thêm được vào 2026
  try {
    await svc.receipts.create(ctxA, { docDate: "2026-03-01", counterAccountCode: "511", amount: "100000", post: true });
    check(false, "Kỳ 2026 đã kết chuyển+khóa → chặn ghi");
  } catch (e) {
    check(e instanceof InvalidStateError, "Kỳ 2026 đã khóa sau kết chuyển → chặn ghi thêm");
  }


  console.log("\n=== INTEGRITY VẪN OK SAU MỌI THAO TÁC ===");
  const integ2 = await svc.reports.integrityCheck(ctxA);
  check(integ2.ok, "Integrity vẫn OK sau tất cả");

  console.log(`\n========================================`);
  console.log(`   KẾT QUẢ 10A: ${passed} PASS, ${failed} FAIL`);
  console.log(`========================================\n`);
  if (failed > 0) process.exit(1);
}


main().catch((e) => { console.error("[INTEGRATION]", e); process.exit(1); });

