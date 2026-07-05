/**
 * Kế Toán 10A routes — theo contract SuperCitadel §4.
 * Host tiêm dependencies: buildKeToan10aRoutes({ db, requireAuth, gate, audit }).
 * Mount tại /api/v1/ke-toan-10a. Mọi query lọc theo orgOf(c) (tenant isolation).
 */
import { Hono } from "hono";
import { z } from "zod";
import {
  AppError,
  orgOf,
  userOf,
  type Context,
  type ModuleDeps,
} from "./contract.js";
import type { Ctx } from "./lib/context.js";
import { seedChartOfAccounts } from "./seed.js";
import { KetoanServices } from "./services/index.js";
import { KetoanError } from "./lib/errors.js";
import { runAction, listActions } from "./actions/registry.js";
import { XLSX_MIME } from "./services/excel.service.js";

/** Dựng Ctx (org + actor) từ auth context của host. */
function ctxOf(c: Context): Ctx {
  return { orgId: orgOf(c), actor: userOf(c) ?? "unknown", source: "api" };
}

/** Chuyển KetoanError nội bộ → AppError contract. */
function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((err) => {
    if (err instanceof KetoanError) {
      throw new AppError(err.code, err.message, err.httpStatus, err.detail);
    }
    throw err;
  });
}

const q = (c: Context, k: string, dft: string) => c.req.query(k) ?? dft;
const today = () => new Date().toISOString().slice(0, 10);

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const moneySchema = z.preprocess((v) => (typeof v === "number" ? String(v) : v), z.string().regex(/^\d+(\.\d{1,2})?$/));

const fields = (issues: z.ZodIssue[]) => Array.from(new Set(issues.map((i) => i.path.join(".") || "body"))).join(", ");
function validation(message: string, issues: z.ZodIssue[]): never {
  throw new AppError("VALIDATION_ERROR", `${message}. Thiếu/sai field: ${fields(issues)}`, 400, issues);
}
async function parseJson<T extends z.ZodTypeAny>(c: Context, schema: T, message: string): Promise<z.infer<T>> {
  const body = await c.req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) validation(message, parsed.error.issues);
  return parsed.data;
}
const boolDefaultTrue = z.boolean().optional().default(true);
const accountTypeSchema = z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]);
const contactTypeSchema = z.enum(["CUSTOMER", "VENDOR", "BOTH"]);
const lineSchema = z.object({ description: z.string().min(1), qty: z.number().positive(), rate: moneySchema });
const accountSchema = z.object({ code: z.string().min(1), name: z.string().min(1), type: accountTypeSchema, parentId: z.string().optional(), openingBalance: moneySchema.optional(), isPostable: z.boolean().optional(), description: z.string().optional() }).passthrough();
const contactSchema = z.object({ code: z.string().optional(), name: z.string().min(1), type: contactTypeSchema.optional(), taxCode: z.string().optional(), phone: z.string().optional(), email: z.string().email().optional(), address: z.string().optional(), creditLimit: moneySchema.optional(), paymentTermDays: z.number().int().nonnegative().optional() }).passthrough();
const receiptPaymentSchema = z.object({ docDate: dateSchema.optional().default(today), counterAccountCode: z.string().min(1), amount: moneySchema, cashAccountCode: z.string().optional(), description: z.string().optional(), reason: z.string().optional(), post: boolDefaultTrue }).passthrough();
const invoiceBillSchema = z.object({ docDate: dateSchema, dueDate: dateSchema.optional(), contactId: z.string().min(1), subtotal: moneySchema.optional(), lines: z.array(lineSchema).min(1).optional(), taxRate: moneySchema.optional(), description: z.string().optional(), receivableAccountCode: z.string().optional(), revenueAccountCode: z.string().optional(), payableAccountCode: z.string().optional(), expenseAccountCode: z.string().optional(), taxAccountCode: z.string().optional(), post: boolDefaultTrue, allowExceedCredit: z.boolean().optional() }).passthrough().refine((v) => v.subtotal || (v.lines && v.lines.length > 0), { path: ["subtotal"], message: "Cần subtotal hoặc lines" });
const paymentAmountSchema = z.object({ amount: moneySchema, cashAccountCode: z.string().optional(), docDate: dateSchema.optional() }).passthrough();
const journalLineSchema = z.object({ accountId: z.string().min(1), debit: moneySchema.optional(), credit: moneySchema.optional(), memo: z.string().optional(), contactId: z.string().optional(), costCenterId: z.string().optional() }).refine((v) => Boolean(v.debit) !== Boolean(v.credit), { path: ["debit"], message: "Mỗi dòng cần debit hoặc credit" });
const journalSchema = z.object({ entryDate: dateSchema, memo: z.string().optional(), lines: z.array(journalLineSchema).min(2), currency: z.string().optional(), exchangeRate: moneySchema.optional(), post: boolDefaultTrue }).passthrough();
const fiscalYearSchema = z.object({ name: z.string().min(1), startDate: dateSchema, endDate: dateSchema }).refine((v) => v.startDate < v.endDate, { path: ["endDate"], message: "endDate phải sau startDate" });
const advanceSchema = z.object({ type: z.enum(["CUSTOMER_DEPOSIT", "SUPPLIER_ADVANCE", "EMPLOYEE_ADVANCE"]), docDate: dateSchema.optional().default(today), amount: moneySchema, contactId: z.string().optional(), contactName: z.string().optional(), partyName: z.string().optional(), cashAccountCode: z.string().optional(), partyAccountCode: z.string().optional(), reason: z.string().optional(), description: z.string().optional() }).passthrough().transform((v) => ({ ...v, partyName: v.partyName ?? v.contactName, description: v.description ?? v.reason }));
const recurringSchema = z.object({ name: z.string().min(1), kind: z.enum(["RECEIPT", "PAYMENT", "JOURNAL"]), frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]), interval: z.number().int().positive().optional(), payload: z.record(z.string(), z.unknown()), startDate: dateSchema, endDate: dateSchema.optional() }).passthrough();
const activeSchema = z.object({ active: z.boolean().optional() }).passthrough();
const contactPatchSchema = contactSchema.partial().refine((v) => Object.keys(v).length > 0, { path: ["body"], message: "Cần ít nhất một field cập nhật" });
const costCenterSchema = z.object({ name: z.string().min(1), code: z.string().optional(), type: z.enum(["DEPARTMENT", "PROJECT", "BRANCH", "PRODUCT", "OTHER"]).optional(), parentId: z.string().optional() }).passthrough();
const bankAutoMatchSchema = z.object({ account: z.string().optional(), toleranceDays: z.number().int().nonnegative().optional() }).passthrough();
const bankRuleSchema = z.object({ matchText: z.string().min(1), counterAccountCode: z.string().min(1), priority: z.number().optional() }).passthrough();
const assetSchema = z.object({ code: z.string().optional(), name: z.string().min(1), cost: moneySchema, salvageValue: moneySchema.optional(), usefulLifeMonths: z.number().int().positive(), startDate: dateSchema, assetAccountCode: z.string().optional(), depreciationAccountCode: z.string().optional(), expenseAccountCode: z.string().optional(), acquireFromAccountCode: z.string().optional() }).passthrough();
const budgetSchema = z.object({ fiscalYear: z.string().optional(), year: z.union([z.string(), z.number()]).optional(), accountCode: z.string().min(1), amount: moneySchema, costCenterId: z.string().optional() }).transform((v) => ({ fiscalYear: v.fiscalYear ?? String(v.year ?? new Date().getFullYear()), accountCode: v.accountCode, amount: v.amount, costCenterId: v.costCenterId }));
const fxSchema = z.object({ accountCode: z.string().optional(), account: z.string().optional(), foreignCurrency: z.string().optional().default("USD"), foreignAmount: moneySchema, newRate: moneySchema.optional(), rate: moneySchema.optional(), revalDate: dateSchema.optional(), gainAccountCode: z.string().optional(), lossAccountCode: z.string().optional() }).refine((v) => v.accountCode || v.account, { path: ["accountCode"], message: "accountCode là bắt buộc" }).refine((v) => v.newRate || v.rate, { path: ["newRate"], message: "newRate là bắt buộc" }).transform((v) => ({ ...v, accountCode: v.accountCode ?? v.account!, newRate: v.newRate ?? v.rate! }));


/** Bắn event realtime nếu host có tiêm publish — lỗi nuốt im lặng. */
function notify(deps: ModuleDeps, c: Context, type: string, payload?: unknown) {
  void deps.publish?.({ type, orgId: orgOf(c), payload }).catch(() => {});
}

export function buildKeToan10aRoutes(deps: ModuleDeps) {
  const svc = new KetoanServices(deps.db);
  const r = new Hono();

  // Xử lý lỗi tập trung: AppError → status + body; còn lại → 500.
  r.onError((err, c) => {
    const maybe = err as { code?: string; status?: number; toJSON?: () => unknown };
    if (err instanceof AppError || (typeof maybe.toJSON === "function" && typeof maybe.status === "number")) {
      return c.json(maybe.toJSON!(), maybe.status as 400);
    }
    return (console.error("[ke-toan-10a]", err),
      c.json({ error: { code: "INTERNAL", message: "Lỗi hệ thống Kế Toán 10A" } }, 500));
  });

  // Health — KHÔNG cần auth (monitor/gateway ping được).
  r.get("/health", (c) =>
    c.json({ ok: true, module: "ke-toan-10a", name: "Kế Toán 10A", version: "1.0.0", time: new Date().toISOString() }),
  );

  // Auth + gate cho mọi route còn lại (host tiêm).
  r.use("*", deps.requireAuth);
  if (deps.gate) r.use("*", deps.gate);

  /* ---------------- Khởi tạo ---------------- */
  /**
   * Khởi tạo hệ thống tài khoản cho org (idempotent — mã đã có thì bỏ qua).
   * body: { standard?: "TT133"|"TT200", chart?: SeedAccount[] } — mặc định TT133.
   * FE gọi 1 lần khi mở trang đầu tiên; khách không cần thao tác gì thêm.
   */
  r.post("/setup", (c) =>
    wrap(async () => {
      const b = await c.req.json().catch(() => ({}));
      const standard = b?.standard === "TT200" ? "TT200" : "TT133";
      const custom = Array.isArray(b?.chart) && b.chart.length > 0 ? b.chart : undefined;
      const created = await seedChartOfAccounts(ctxOf(c).orgId, deps.db, { standard, custom });
      const list = await svc.accounts.list(ctxOf(c));
      await deps.audit?.(c, { action: "k10a.setup", resource: "account", detail: { standard: custom ? "CUSTOM" : standard, created, total: list.length } });
      return c.json({ ok: true, standard: custom ? "CUSTOM" : standard, created, seeded: created, total: list.length }, 201);
    }),
  );

  /* ---------------- Tài khoản ---------------- */
  r.get("/accounts", (c) =>
    wrap(async () => c.json({ accounts: await svc.accounts.list(ctxOf(c), c.req.query("type") ? { type: c.req.query("type") as never } : undefined) })),
  );
  r.get("/accounts/:code/balance", (c) =>
    wrap(async () => {
      const acc = await svc.accounts.requireByCode(ctxOf(c), c.req.param("code"));
      return c.json(await svc.accounts.getBalance(ctxOf(c), acc.id, c.req.query("asOf")));
    }),
  );
  r.post("/accounts", (c) =>
    wrap(async () => {
      const b = await parseJson(c, accountSchema, "Dữ liệu tài khoản không hợp lệ");
      const acc = await svc.accounts.create(ctxOf(c), b);
      await deps.audit?.(c, { action: "k10a.account.create", resource: "account", resourceId: acc.id });
      return c.json({ account: acc }, 201);
    }),
  );

  /* ---------------- Đối tác ---------------- */
  r.get("/contacts", (c) =>
    wrap(async () => c.json({ contacts: await svc.contacts.list(ctxOf(c), { type: c.req.query("type") as never, search: c.req.query("search") }) })),
  );
  r.post("/contacts", (c) =>
    wrap(async () => {
      const b = await parseJson(c, contactSchema, "Dữ liệu đối tác không hợp lệ");
      const contact = await svc.contacts.create(ctxOf(c), b);
      await deps.audit?.(c, { action: "k10a.contact.create", resource: "contact", resourceId: contact.id });
      return c.json({ contact }, 201);
    }),
  );

  /* ---------------- Phiếu thu ---------------- */
  r.get("/receipts", (c) => wrap(async () => c.json({ receipts: await svc.receipts.list(ctxOf(c)) })));
  r.post("/receipts", (c) =>
    wrap(async () => {
      const b = await parseJson(c, receiptPaymentSchema, "Dữ liệu phiếu thu không hợp lệ");
      const receipt = await svc.receipts.create(ctxOf(c), b);
      await deps.audit?.(c, { action: "k10a.receipt.create", resource: "receipt", resourceId: receipt.id, detail: { amount: receipt.amount } });
      return c.json({ receipt }, 201);
    }),
  );
  r.post("/receipts/:id/void", (c) =>
    wrap(async () => {
      await deps.reverseGate?.(c, "receipt");
      const receipt = await svc.receipts.void(ctxOf(c), c.req.param("id"));
      await deps.audit?.(c, { action: "k10a.receipt.void", resource: "receipt", resourceId: receipt.id });
      return c.json({ receipt });
    }),
  );

  /* ---------------- Phiếu chi ---------------- */
  r.get("/payments", (c) => wrap(async () => c.json({ payments: await svc.payments.list(ctxOf(c)) })));
  r.post("/payments", (c) =>
    wrap(async () => {
      const b = await parseJson(c, receiptPaymentSchema, "Dữ liệu phiếu chi không hợp lệ");
      const payment = await svc.payments.create(ctxOf(c), b);
      await deps.audit?.(c, { action: "k10a.payment.create", resource: "payment", resourceId: payment.id, detail: { amount: payment.amount } });
      return c.json({ payment }, 201);
    }),
  );
  r.post("/payments/:id/void", (c) =>
    wrap(async () => {
      await deps.reverseGate?.(c, "payment");
      const payment = await svc.payments.void(ctxOf(c), c.req.param("id"));
      await deps.audit?.(c, { action: "k10a.payment.void", resource: "payment", resourceId: payment.id });
      return c.json({ payment });
    }),
  );

  /* ---------------- Hoá đơn bán ---------------- */
  r.get("/invoices", (c) => wrap(async () => c.json({ invoices: await svc.invoices.list(ctxOf(c)) })));
  r.post("/invoices", (c) =>
    wrap(async () => {
      const b = await parseJson(c, invoiceBillSchema, "Dữ liệu hóa đơn bán không hợp lệ");
      try {
        const invoice = await svc.invoices.create(ctxOf(c), b);
        await deps.audit?.(c, { action: "k10a.invoice.create", resource: "invoice", resourceId: invoice.id, detail: { total: invoice.total } });
        return c.json({ invoice }, 201);
      } catch (err) {
        if (err instanceof KetoanError && /hạn mức tín dụng/.test(err.message)) {
          notify(deps, c, "k10a.credit_limit.blocked", { contactId: b?.contactId, message: err.message });
        }
        throw err;
      }
    }),
  );
  r.post("/invoices/:id/payment", (c) =>
    wrap(async () => {
      const p = await parseJson(c, paymentAmountSchema, "Dữ liệu thu tiền không hợp lệ");
      const invoice = await svc.invoices.recordPayment(ctxOf(c), c.req.param("id"), p.amount, p.cashAccountCode, p.docDate);
      await deps.audit?.(c, { action: "k10a.invoice.payment", resource: "invoice", resourceId: invoice.id, detail: { amount: p.amount } });
      return c.json({ invoice });
    }),
  );

  /* ---------------- Hoá đơn mua (bills) ---------------- */
  r.get("/bills", (c) => wrap(async () => c.json({ bills: await svc.bills.list(ctxOf(c)) })));
  r.post("/bills", (c) =>
    wrap(async () => {
      const b = await parseJson(c, invoiceBillSchema, "Dữ liệu hóa đơn mua không hợp lệ");
      const bill = await svc.bills.create(ctxOf(c), b);
      await deps.audit?.(c, { action: "k10a.bill.create", resource: "bill", resourceId: bill.id, detail: { total: bill.total } });
      return c.json({ bill }, 201);
    }),
  );
  r.post("/bills/:id/payment", (c) =>
    wrap(async () => {
      const p = await parseJson(c, paymentAmountSchema, "Dữ liệu trả tiền không hợp lệ");
      const bill = await svc.bills.recordPayment(ctxOf(c), c.req.param("id"), p.amount, p.cashAccountCode, p.docDate);
      await deps.audit?.(c, { action: "k10a.bill.payment", resource: "bill", resourceId: bill.id, detail: { amount: p.amount } });
      return c.json({ bill });
    }),
  );

  /* ---------------- Bút toán ---------------- */
  r.get("/journals/:id", (c) =>
    wrap(async () => {
      const entry = await svc.ledger.getEntry(ctxOf(c), c.req.param("id"));
      const lines = await svc.ledger.getEntryLines(ctxOf(c), c.req.param("id"));
      return c.json({ entry, lines });
    }),
  );
  r.post("/journals", (c) =>
    wrap(async () => {
      const b = await parseJson(c, journalSchema, "Dữ liệu bút toán không hợp lệ");
      const entry = await svc.ledger.createEntry(ctxOf(c), { ...b, sourceType: "MANUAL", post: b.post ?? true });
      await deps.audit?.(c, { action: "k10a.journal.create", resource: "journal", resourceId: entry.id, detail: { total: entry.totalAmount } });
      return c.json({ entry }, 201);
    }),
  );
  r.post("/journals/:id/reverse", (c) =>
    wrap(async () => {
      await deps.reverseGate?.(c, "journal");
      const b = await c.req.json().catch(() => ({}));
      const entry = await svc.ledger.reverseEntry(ctxOf(c), c.req.param("id"), typeof b?.reversalDate === "string" ? b.reversalDate : undefined);
      await deps.audit?.(c, { action: "k10a.journal.reverse", resource: "journal", resourceId: c.req.param("id") });
      return c.json({ entry });
    }),
  );

  /* ---------------- Năm tài chính + khóa kỳ ---------------- */
  r.get("/fiscal-years", (c) => wrap(async () => c.json({ fiscalYears: await svc.fiscal.list(ctxOf(c)) })));
  r.post("/fiscal-years", (c) =>
    wrap(async () => {
      const b = await parseJson(c, fiscalYearSchema, "Dữ liệu năm tài chính không hợp lệ");
      const fy = await svc.fiscal.create(ctxOf(c), b);
      await deps.audit?.(c, { action: "k10a.fiscal.create", resource: "fiscal_year", resourceId: fy.id });
      return c.json({ fiscalYear: fy }, 201);
    }),
  );
  r.post("/fiscal-years/:id/close", (c) =>
    wrap(async () => {
      await deps.reverseGate?.(c, "fiscal_close");
      const fy = await svc.fiscal.close(ctxOf(c), c.req.param("id"));
      await deps.audit?.(c, { action: "k10a.fiscal.close", resource: "fiscal_year", resourceId: fy.id });
      return c.json({ fiscalYear: fy });
    }),
  );
  r.post("/fiscal-years/:id/reopen", (c) =>
    wrap(async () => {
      await deps.reverseGate?.(c, "fiscal_reopen");
      const fy = await svc.fiscal.reopen(ctxOf(c), c.req.param("id"));
      await deps.audit?.(c, { action: "k10a.fiscal.reopen", resource: "fiscal_year", resourceId: fy.id });
      return c.json({ fiscalYear: fy });
    }),
  );

  /* ---------------- Báo cáo ---------------- */
  r.get("/reports/general-ledger", (c) =>
    wrap(async () => c.json(await svc.reports.generalLedger(ctxOf(c), q(c, "account", "111"), c.req.query("from"), c.req.query("to")))),
  );
  r.get("/reports/trial-balance", (c) =>
    wrap(async () => c.json(await svc.reports.trialBalance(ctxOf(c), c.req.query("from"), c.req.query("to")))),
  );
  r.get("/reports/profit-loss", (c) =>
    wrap(async () => c.json(await svc.reports.profitAndLoss(ctxOf(c), c.req.query("from"), c.req.query("to")))),
  );
  r.get("/reports/balance-sheet", (c) =>
    wrap(async () => c.json(await svc.reports.balanceSheet(ctxOf(c), c.req.query("asOf")))),
  );
  r.get("/reports/dashboard", (c) =>
    wrap(async () => c.json(await svc.reports.dashboard(ctxOf(c), c.req.query("from"), c.req.query("to")))),
  );
  // GEM: tuổi nợ (aging)
  r.get("/reports/aging", (c) =>
    wrap(async () => c.json(await svc.reports.aging(ctxOf(c), (c.req.query("type") as never) ?? "sales", c.req.query("asOf")))),
  );
  // GEM: công nợ theo đối tác
  r.get("/reports/outstanding", (c) =>
    wrap(async () => c.json(await svc.reports.outstandingByParty(ctxOf(c), (c.req.query("type") as never) ?? "sales"))),
  );

  /* ---------------- Tự-audit toàn vẹn sổ (GEM) ---------------- */
  r.get("/health/integrity", (c) => wrap(async () => c.json(await svc.reports.integrityCheck(ctxOf(c)))));

  /* ---------------- Tuân thủ Việt Nam (GEM 7A) ---------------- */
  // Kết chuyển cuối kỳ + khóa niên độ
  r.post("/fiscal-years/:id/closing", (c) =>
    wrap(async () => {
      await deps.reverseGate?.(c, "fiscal_close");
      const result = await svc.closing.closeFiscalYear(ctxOf(c), c.req.param("id"));
      await deps.audit?.(c, { action: "k10a.closing", resource: "fiscal_year", resourceId: c.req.param("id"), detail: { net: result.netResult } });
      return c.json(result);
    }),
  );
  // Báo cáo lưu chuyển tiền tệ (LCTT / B03)
  r.get("/reports/cash-flow", (c) =>
    wrap(async () => c.json(await svc.vietnam.cashFlowStatement(ctxOf(c), c.req.query("from"), c.req.query("to")))),
  );
  // Tờ khai thuế GTGT (01/GTGT) + bảng kê
  r.get("/reports/vat-declaration", (c) =>
    wrap(async () => c.json(await svc.vietnam.vatDeclaration(ctxOf(c), c.req.query("from"), c.req.query("to")))),
  );
  // Sổ nhật ký chung (S03a)
  r.get("/reports/general-journal", (c) =>
    wrap(async () => c.json({ rows: await svc.vietnam.generalJournal(ctxOf(c), c.req.query("from"), c.req.query("to")) })),
  );
  // Sổ quỹ tiền mặt (S07)
  r.get("/reports/cash-book", (c) =>
    wrap(async () => c.json(await svc.vietnam.cashBook(ctxOf(c), c.req.query("from"), c.req.query("to")))),
  );
  // Sao kê công nợ theo đối tác
  r.get("/reports/statement/:contactId", (c) =>
    wrap(async () => c.json(await svc.reports.statementOfAccount(ctxOf(c), c.req.param("contactId"), c.req.query("from"), c.req.query("to")))),
  );
  // Nhắc hạn công nợ
  r.get("/reports/due-reminders", (c) =>
    wrap(async () => c.json(await svc.reports.dueReminders(ctxOf(c), (c.req.query("type") as never) ?? "sales", c.req.query("soonDays") ? Number(c.req.query("soonDays")) : 7))),
  );
  // Hoá đơn điều chỉnh giảm (credit note)
  r.post("/invoices/:id/credit-note", (c) =>
    wrap(async () => {
      const p = await parseJson(c, z.object({ amount: moneySchema, reason: z.string().optional() }), "Dữ liệu điều chỉnh không hợp lệ");
      const inv = await svc.invoices.createCreditNote(ctxOf(c), c.req.param("id"), p.amount, p.reason);
      await deps.audit?.(c, { action: "k10a.invoice.credit_note", resource: "invoice", resourceId: inv.id, detail: { amount: p.amount } });
      return c.json({ invoice: inv });
    }),
  );

  /* ---------------- Chiều sâu vận hành (GEM 8A) ---------------- */
  // Debit note (điều chỉnh giảm mua)
  r.post("/bills/:id/debit-note", (c) =>
    wrap(async () => {
      const p = await parseJson(c, z.object({ amount: moneySchema, reason: z.string().optional() }), "Dữ liệu điều chỉnh không hợp lệ");
      const bill = await svc.bills.createDebitNote(ctxOf(c), c.req.param("id"), p.amount, p.reason);
      await deps.audit?.(c, { action: "k10a.bill.debit_note", resource: "bill", resourceId: bill.id, detail: { amount: p.amount } });
      return c.json({ bill });
    }),
  );

  // Tạm ứng / đặt cọc
  r.get("/advances", (c) => wrap(async () => c.json({ advances: await svc.advances.list(ctxOf(c), c.req.query("type") as never) })));
  r.post("/advances", (c) =>
    wrap(async () => {
      const b = await parseJson(c, advanceSchema, "Dữ liệu tạm ứng không hợp lệ");
      const adv = await svc.advances.create(ctxOf(c), b);
      await deps.audit?.(c, { action: "k10a.advance.create", resource: "advance", resourceId: adv.id, detail: { type: adv.type, amount: adv.amount } });
      return c.json({ advance: adv }, 201);
    }),
  );
  r.post("/advances/:id/apply", (c) =>
    wrap(async () => {
      const p = await parseJson(c, z.object({ target: z.enum(["invoice", "bill"]), targetId: z.string(), amount: moneySchema.optional() }), "Dữ liệu áp khoản ứng không hợp lệ");
      const result = await svc.advances.applyToInvoice(ctxOf(c), c.req.param("id"), p.target, p.targetId, p.amount);
      await deps.audit?.(c, { action: "k10a.advance.apply", resource: "advance", resourceId: c.req.param("id"), detail: { applied: result.applied } });
      return c.json(result);
    }),
  );

  // Giao dịch định kỳ
  r.get("/recurring", (c) => wrap(async () => c.json({ templates: await svc.recurring.list(ctxOf(c)) })));
  r.post("/recurring", (c) =>
    wrap(async () => {
      const b = await parseJson(c, recurringSchema, "Dữ liệu mẫu định kỳ không hợp lệ. Cần name, kind, frequency, payload, startDate");
      const tpl = await svc.recurring.create(ctxOf(c), b);
      await deps.audit?.(c, { action: "k10a.recurring.create", resource: "recurring_template", resourceId: tpl.id });
      return c.json({ template: tpl }, 201);
    }),
  );
  r.post("/recurring/run", (c) =>
    wrap(async () => {
      const b = await c.req.json().catch(() => ({}));
      const result = await svc.recurring.runDue(ctxOf(c), typeof b?.asOf === "string" ? b.asOf : undefined);
      await deps.audit?.(c, { action: "k10a.recurring.run", resource: "recurring_template", detail: { generated: result.generated } });
      if (result.generated > 0) notify(deps, c, "k10a.recurring.generated", { generated: result.generated });
      return c.json(result);
    }),
  );
  r.post("/recurring/:id/toggle", (c) =>
    wrap(async () => {
      const b = await parseJson(c, activeSchema, "Dữ liệu bật/tắt mẫu định kỳ không hợp lệ");
      const tpl = await svc.recurring.setActive(ctxOf(c), c.req.param("id"), b?.active !== false);
      return c.json({ template: tpl });
    }),
  );

  // Hạn mức tín dụng + điều khoản thanh toán
  r.patch("/contacts/:id", (c) =>
    wrap(async () => {
      const b = await parseJson(c, contactPatchSchema, "Dữ liệu cập nhật đối tác không hợp lệ");
      const contact = await svc.contacts.update(ctxOf(c), c.req.param("id"), b);
      await deps.audit?.(c, { action: "k10a.contact.update", resource: "contact", resourceId: contact.id });
      return c.json({ contact });
    }),
  );
  r.get("/contacts/:id/credit-status", (c) =>
    wrap(async () => c.json(await svc.contacts.checkCreditLimit(ctxOf(c), c.req.param("id"), c.req.query("amount") ?? "0"))),
  );

  // Nhập CSV danh mục
  r.post("/import/accounts.csv", (c) =>
    wrap(async () => {
      const csv = await c.req.text();
      const result = await svc.imports.importAccounts(ctxOf(c), csv);
      await deps.audit?.(c, { action: "k10a.import.accounts", resource: "account", detail: { created: result.created } });
      return c.json(result);
    }),
  );
  r.post("/import/contacts.csv", (c) =>
    wrap(async () => {
      const csv = await c.req.text();
      const result = await svc.imports.importContacts(ctxOf(c), csv);
      await deps.audit?.(c, { action: "k10a.import.contacts", resource: "contact", detail: { created: result.created } });
      return c.json(result);
    }),
  );

  /* ---------------- Phân tích nâng cao (GEM 10A / Tầng 2) ---------------- */
  // Bộ phận/dự án (dimensions)
  r.get("/cost-centers", (c) => wrap(async () => c.json({ costCenters: await svc.dimensions.list(ctxOf(c)) })));
  r.post("/cost-centers", (c) =>
    wrap(async () => {
      const cc = await svc.dimensions.create(ctxOf(c), await parseJson(c, costCenterSchema, "Dữ liệu bộ phận/dự án không hợp lệ"));
      await deps.audit?.(c, { action: "k10a.cost_center.create", resource: "cost_center", resourceId: cc.id });
      return c.json({ costCenter: cc }, 201);
    }),
  );
  r.get("/reports/profit-by-cost-center", (c) =>
    wrap(async () => c.json(await svc.dimensions.profitByCostCenter(ctxOf(c), c.req.query("from"), c.req.query("to")))),
  );

  // Đối chiếu ngân hàng
  r.post("/bank/import", (c) =>
    wrap(async () => {
      const acc = c.req.query("account") ?? "112";
      const csv = await c.req.text();
      const result = await svc.bank.importStatement(ctxOf(c), acc, csv);
      await deps.audit?.(c, { action: "k10a.bank.import", resource: "bank_transaction", detail: result });
      return c.json(result);
    }),
  );
  r.post("/bank/auto-match", (c) =>
    wrap(async () => {
      const b = await parseJson(c, bankAutoMatchSchema, "Dữ liệu auto-match ngân hàng không hợp lệ");
      const result = await svc.bank.autoMatch(ctxOf(c), b?.account ?? "112", b?.toleranceDays);
      return c.json(result);
    }),
  );
  r.post("/bank/apply-rules", (c) =>
    wrap(async () => {
      const b = await parseJson(c, bankAutoMatchSchema, "Dữ liệu áp quy tắc ngân hàng không hợp lệ");
      const result = await svc.bank.applyRules(ctxOf(c), b?.account ?? "112");
      await deps.audit?.(c, { action: "k10a.bank.apply_rules", resource: "bank_transaction", detail: result });
      notify(deps, c, "k10a.bank.rules_applied", { created: result.created });
      return c.json(result);
    }),
  );
  r.post("/bank/rules", (c) =>
    wrap(async () => {
      const p = await parseJson(c, bankRuleSchema, "Dữ liệu quy tắc không hợp lệ");
      const rule = await svc.bank.addRule(ctxOf(c), p.matchText, p.counterAccountCode, p.priority);
      return c.json({ rule }, 201);
    }),
  );
  r.get("/bank/transactions", (c) =>
    wrap(async () => c.json({ transactions: await svc.bank.listTransactions(ctxOf(c), c.req.query("account") ?? "112", c.req.query("status") as never) })),
  );
  r.get("/bank/reconciliation", (c) =>
    wrap(async () => c.json(await svc.bank.reconciliationReport(ctxOf(c), c.req.query("account") ?? "112"))),
  );

  // Tài sản cố định + khấu hao
  r.get("/assets", (c) => wrap(async () => c.json({ assets: await svc.assets.list(ctxOf(c)) })));
  r.post("/assets", (c) =>
    wrap(async () => {
      const asset = await svc.assets.create(ctxOf(c), await parseJson(c, assetSchema, "Dữ liệu tài sản không hợp lệ"));
      await deps.audit?.(c, { action: "k10a.asset.create", resource: "fixed_asset", resourceId: asset.id });
      return c.json({ asset }, 201);
    }),
  );
  r.post("/assets/depreciation", (c) =>
    wrap(async () => {
      const b = await c.req.json().catch(() => ({}));
      const result = await svc.assets.runDepreciation(ctxOf(c), typeof b?.asOf === "string" ? b.asOf : undefined);
      await deps.audit?.(c, { action: "k10a.asset.depreciation", resource: "fixed_asset", detail: { posted: result.posted } });
      if (result.posted > 0) notify(deps, c, "k10a.depreciation.posted", { posted: result.posted });
      return c.json(result);
    }),
  );

  // Dự toán ngân sách
  r.get("/budgets", (c) => wrap(async () => c.json({ budgets: await svc.budget.list(ctxOf(c), c.req.query("year") ?? String(new Date().getFullYear())) })));
  r.post("/budgets", (c) =>
    wrap(async () => {
      const budget = await svc.budget.setBudget(ctxOf(c), await parseJson(c, budgetSchema, "Dữ liệu ngân sách không hợp lệ"));
      await deps.audit?.(c, { action: "k10a.budget.set", resource: "budget", resourceId: budget.id });
      return c.json({ budget }, 201);
    }),
  );
  r.get("/reports/budget-vs-actual", (c) =>
    wrap(async () => c.json(await svc.budget.budgetVsActual(ctxOf(c), c.req.query("year") ?? String(new Date().getFullYear())))),
  );

  // Đánh giá lại tỷ giá
  r.post("/fx/revalue", (c) =>
    wrap(async () => {
      const result = await svc.fx.revalue(ctxOf(c), await parseJson(c, fxSchema, "Dữ liệu đánh giá lại tỷ giá không hợp lệ"));
      await deps.audit?.(c, { action: "k10a.fx.revalue", resource: "account", detail: { result: result.result, difference: result.difference } });
      return c.json(result);
    }),
  );

  /* ---------------- Excel (GEM) ---------------- */
  const xlsxResponse = (c: Context, bytes: Uint8Array, filename: string) => {
    c.header("Content-Type", XLSX_MIME);
    c.header("Content-Disposition", `attachment; filename="${filename}"`);
    return c.body(bytes as never);
  };
  r.get("/export/general-ledger.xlsx", (c) =>
    wrap(async () => xlsxResponse(c, await svc.excel.exportGeneralLedger(ctxOf(c), c.req.query("from"), c.req.query("to")), "so-cai.xlsx")),
  );
  r.get("/export/trial-balance.xlsx", (c) =>
    wrap(async () => xlsxResponse(c, await svc.excel.exportTrialBalance(ctxOf(c), c.req.query("from"), c.req.query("to")), "can-doi-phat-sinh.xlsx")),
  );
  r.get("/export/profit-loss.xlsx", (c) =>
    wrap(async () => xlsxResponse(c, await svc.excel.exportProfitLoss(ctxOf(c), c.req.query("from"), c.req.query("to")), "ket-qua-kinh-doanh.xlsx")),
  );
  r.get("/export/invoices.xlsx", (c) =>
    wrap(async () => xlsxResponse(c, await svc.excel.exportInvoices(ctxOf(c)), "hoa-don.xlsx")),
  );
  r.get("/import/template.xlsx", (c) => xlsxResponse(c, svc.excel.importTemplate(), "mau-nhap-hoa-don.xlsx"));
  r.post("/import/invoices.xlsx", (c) =>
    wrap(async () => {
      const buf = new Uint8Array(await c.req.arrayBuffer());
      const parsed = svc.excel.parseInvoiceImport(buf);
      if (parsed.errors.length) return c.json({ ok: false, errors: parsed.errors }, 400);
      // Tạo hoá đơn từng dòng (đã validate).
      const created = [];
      const ctx = ctxOf(c);
      for (const row of parsed.rows) {
        let contact = await svc.contacts.findByName(ctx, row.customerName);
        if (!contact) contact = await svc.contacts.create(ctx, { name: row.customerName, type: "CUSTOMER" });
        const inv = await svc.invoices.create(ctx, {
          docDate: row.docDate,
          contactId: contact.id,
          lines: [{ description: row.description, qty: row.qty, rate: row.rate }],
          taxRate: row.taxRate,
          post: true,
        });
        created.push(inv);
      }
      await deps.audit?.(c, { action: "k10a.import.invoices", resource: "invoice", detail: { count: created.length } });
      return c.json({ ok: true, created: created.length });
    }),
  );

  /* ---------------- Cổng Tiểu Tâm (write actions) ---------------- */
  r.get("/actions", (c) => c.json({ ok: true, actions: listActions() }));
  r.post("/actions/:id", (c) =>
    wrap(async () => {
      const params = await c.req.json().catch(() => ({}));
      const result = await runAction(svc, ctxOf(c), c.req.param("id"), params);
      await deps.audit?.(c, { action: `k10a.action.${c.req.param("id")}`, resource: "action", detail: { ok: result.ok } });
      return c.json(result);
    }),
  );

  return r;
}
