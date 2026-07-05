/**
 * CẦU NỐI TIỂU TÂM — chuẩn SuperCitadel v8.5 (RBAC + dry-run).
 *
 * Host thực thi qua `executeAction` trung tâm: gate module → hasPermission(role)
 * → securityLevel → nếu `sensitive` mà chưa confirm thì trả DRY-RUN preview
 * (audit `tieu_tam.action_dryrun`, KHÔNG ghi DB) → confirm mới chạy `execute`.
 * Vì vậy `execute` ở đây chỉ lo nghiệp vụ + audit + message tiếng Việt.
 *
 * Tích hợp (xem docs/INTEGRATION.md):
 *   1. Thêm KE_TOAN_10A_PERMISSIONS vào PERMISSION_REGISTRY (@citadel/core).
 *   2. `defs.push(...keToan10aTieuTamActions(getDb()))` trong tieu-tam/actions.ts.
 *   3. (Tùy chọn) nối detectK10aAction vào detectAction để bắt câu lệnh nhanh.
 */
import { getDb, type Database } from "./lib/db.js";
import { userCtx } from "./lib/context.js";
import { KetoanServices } from "./services/index.js";
import * as Money from "./lib/money.js";

/* ---------- Kiểu phản chiếu host (module tự typecheck độc lập) ---------- */
export type K10aRole = "super_admin" | "owner" | "manager" | "staff";
export type K10aSecurityLevel = 1 | 2;
export interface K10aPermissionMeta {
  key: string;
  module: string;
  resource: string;
  action: string;
  description: string;
  securityLevel: K10aSecurityLevel;
  sensitive: boolean;
}
export type K10aActionCtx = {
  db: unknown;
  orgId: string;
  userId: string;
  role: K10aRole;
  securityLevel: number;
  audit?: (e: { action: string; resource?: string; resourceId?: string; detail?: unknown }) => Promise<void>;
};
export type K10aActionResult = {
  ok: boolean;
  action: string;
  module: string;
  message: string;
  data?: unknown;
  dryRun?: boolean;
  preview?: unknown;
  pendingAction?: unknown;
};
export type K10aTieuTamAction = {
  name: string;
  description: string;
  requiredModule: string;
  permission: string;
  securityLevel: K10aSecurityLevel;
  sensitive: boolean;
  parameters: Record<string, unknown>;
  execute(ctx: K10aActionCtx, params: Record<string, unknown>): Promise<K10aActionResult>;
};

/* ---------- Registry quyền của module (host append vào PERMISSION_REGISTRY) ---------- */
const pm = (
  key: string,
  description: string,
  securityLevel: K10aSecurityLevel = 1,
  sensitive = false,
): K10aPermissionMeta => {
  const [module, resource, action] = key.split(".");
  return { key, module: module!, resource: resource!, action: action!, description, securityLevel, sensitive };
};

export const KE_TOAN_10A_PERMISSIONS: readonly K10aPermissionMeta[] = [
  pm("ke-toan-10a.receipt.create", "Kế Toán 10A — Tạo phiếu thu", 2, true),
  pm("ke-toan-10a.payment.create", "Kế Toán 10A — Tạo phiếu chi", 2, true),
  pm("ke-toan-10a.invoice.create", "Kế Toán 10A — Tạo hóa đơn bán/mua", 2, true),
  pm("ke-toan-10a.invoice.collect", "Kế Toán 10A — Thu tiền theo hóa đơn", 2, true),
  pm("ke-toan-10a.advance.create", "Kế Toán 10A — Tạm ứng/đặt cọc", 2, true),
  pm("ke-toan-10a.recurring.create", "Kế Toán 10A — Đặt giao dịch định kỳ", 2, true),
  pm("ke-toan-10a.recurring.run", "Kế Toán 10A — Chạy giao dịch định kỳ", 2, true),
  pm("ke-toan-10a.credit.limit-set", "Kế Toán 10A — Đặt hạn mức tín dụng", 2, true),
  pm("ke-toan-10a.bank.reconcile", "Kế Toán 10A — Đối chiếu ngân hàng (sinh chứng từ)", 2, true),
  pm("ke-toan-10a.asset.create", "Kế Toán 10A — Ghi nhận TSCĐ", 2, true),
  pm("ke-toan-10a.asset.depreciate", "Kế Toán 10A — Chạy khấu hao", 2, true),
  pm("ke-toan-10a.fx.revalue", "Kế Toán 10A — Đánh giá lại tỷ giá", 2, true),
  pm("ke-toan-10a.period.close", "Kế Toán 10A — Kết chuyển & khóa năm tài chính", 2, true),
  pm("ke-toan-10a.budget.set", "Kế Toán 10A — Đặt ngân sách"),
  pm("ke-toan-10a.budget.read", "Kế Toán 10A — Xem ngân sách vs thực tế"),
  pm("ke-toan-10a.report.read", "Kế Toán 10A — Xem báo cáo nhanh"),
] as const;

/* ---------- Helpers ---------- */
const MODULE_ID = "ke-toan-10a";
const today = () => new Date().toISOString().slice(0, 10);
const num = (v: unknown, d = 0): number => (Number.isFinite(Number(v)) ? Number(v) : d);
const money = (v: unknown): string => String(Math.round(num(v)));
const ok = (action: string, message: string, data?: unknown): K10aActionResult => ({
  ok: true,
  action,
  module: MODULE_ID,
  message,
  data,
});
async function logAudit(ctx: K10aActionCtx, action: string, params: unknown, resourceId?: string) {
  await ctx.audit?.({ action: "tieu_tam.action", resource: "tieu_tam", resourceId, detail: { action, params } });
}

/**
 * Bộ action Tiểu Tâm của Kế Toán 10A — khuôn v8.5.
 * Mọi hành động GHI SỔ đặt securityLevel 2 + sensitive (host tự dry-run→confirm).
 */
export function keToan10aTieuTamActions(db?: Database): K10aTieuTamAction[] {
  const resolveDb = () => db ?? getDb();
  const svc = new Proxy({} as KetoanServices, { get(_target, prop) { return (services() as any)[prop]; } });
  const services = () => new KetoanServices(resolveDb());
  const ctxOf = (c: K10aActionCtx) => userCtx(c.orgId, c.userId || "tieu-tam");
  /** Đảm bảo org đã có chart (khách vừa mua module vẫn ra lệnh được ngay). */
  const ensureChart = async (c: K10aActionCtx) => {
    const { seedChartOfAccounts } = await import("./seed.js");
    await seedChartOfAccounts(c.orgId, resolveDb()).catch(() => 0);
  };

  return [
    {
      name: "k10a.thu_tien",
      permission: "ke-toan-10a.receipt.create",
      securityLevel: 2,
      sensitive: true,
      requiredModule: MODULE_ID,
      description: "(Kế Toán 10A) Tạo phiếu thu tiền từ khách/đối tác, ghi sổ ngay",
      parameters: {
        type: "object",
        properties: {
          soTien: { type: "number", description: "Số tiền thu (VND)" },
          tenDoiTac: { type: "string", description: "Tên khách/đối tác" },
          taiKhoanDoiUng: { type: "string", description: "TK đối ứng, mặc định 511" },
          taiKhoanTien: { type: "string", description: "TK tiền 111/112, mặc định 111" },
          ghiChu: { type: "string" },
        },
        required: ["soTien"],
      },
      async execute(ctx, p) {
        await ensureChart(ctx);
        const svc = services();
        const row = await svc.receipts.create(ctxOf(ctx), {
          docDate: today(),
          counterAccountCode: String(p.taiKhoanDoiUng || "511"),
          cashAccountCode: String(p.taiKhoanTien || "111"),
          amount: money(p.soTien),
          payerName: p.tenDoiTac ? String(p.tenDoiTac) : undefined,
          reason: p.ghiChu ? String(p.ghiChu) : undefined,
          post: true,
        });
        await logAudit(ctx, this.name, p, row.id);
        return ok(this.name, `Đã tạo phiếu thu ${row.docNo}: ${Money.formatVND(row.amount)}${p.tenDoiTac ? ` từ ${p.tenDoiTac}` : ""}.`, row);
      },
    },
    {
      name: "k10a.chi_tien",
      permission: "ke-toan-10a.payment.create",
      securityLevel: 2,
      sensitive: true,
      requiredModule: MODULE_ID,
      description: "(Kế Toán 10A) Tạo phiếu chi tiền cho NCC/đối tác, ghi sổ ngay",
      parameters: {
        type: "object",
        properties: {
          soTien: { type: "number", description: "Số tiền chi (VND)" },
          tenDoiTac: { type: "string" },
          taiKhoanDoiUng: { type: "string", description: "TK chi phí/công nợ, mặc định 642" },
          taiKhoanTien: { type: "string", description: "TK tiền, mặc định 111" },
          ghiChu: { type: "string" },
        },
        required: ["soTien"],
      },
      async execute(ctx, p) {
        await ensureChart(ctx);
        const svc = services();
        const row = await svc.payments.create(ctxOf(ctx), {
          docDate: today(),
          counterAccountCode: String(p.taiKhoanDoiUng || "642"),
          cashAccountCode: String(p.taiKhoanTien || "111"),
          amount: money(p.soTien),
          payeeName: p.tenDoiTac ? String(p.tenDoiTac) : undefined,
          reason: p.ghiChu ? String(p.ghiChu) : undefined,
          post: true,
        } as never);
        await logAudit(ctx, this.name, p, row.id);
        return ok(this.name, `Đã tạo phiếu chi ${row.docNo}: ${Money.formatVND(row.amount)}${p.tenDoiTac ? ` cho ${p.tenDoiTac}` : ""}.`, row);
      },
    },
    {
      name: "k10a.hoa_don_ban",
      permission: "ke-toan-10a.invoice.create",
      securityLevel: 2,
      sensitive: true,
      requiredModule: MODULE_ID,
      description: "(Kế Toán 10A) Tạo hóa đơn bán (Nợ 131/Có 511 + thuế), tự tạo khách nếu chưa có",
      parameters: {
        type: "object",
        properties: {
          tenKhach: { type: "string" },
          soTien: { type: "number", description: "Tiền hàng chưa thuế" },
          thueSuat: { type: "string", description: "0/5/8/10, mặc định 8" },
          hanThanhToan: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["tenKhach", "soTien"],
      },
      async execute(ctx, p) {
        await ensureChart(ctx);
        const svc = services();
        const c = ctxOf(ctx);
        const contact =
          (await svc.contacts.findByName(c, String(p.tenKhach))) ??
          (await svc.contacts.create(c, { name: String(p.tenKhach), type: "CUSTOMER" }));
        const inv = await svc.invoices.create(c, {
          docDate: today(),
          dueDate: p.hanThanhToan ? String(p.hanThanhToan) : undefined,
          contactId: contact.id,
          subtotal: money(p.soTien),
          taxRate: String(p.thueSuat ?? "8"),
          post: true,
        });
        await logAudit(ctx, this.name, p, inv.id);
        return ok(this.name, `Đã tạo hóa đơn bán ${inv.docNo} cho ${contact.name}: tổng ${Money.formatVND(inv.total)} (thuế ${inv.taxRate}%).`, inv);
      },
    },
    {
      name: "k10a.hoa_don_mua",
      permission: "ke-toan-10a.invoice.create",
      securityLevel: 2,
      sensitive: true,
      requiredModule: MODULE_ID,
      description: "(Kế Toán 10A) Tạo hóa đơn mua (Nợ 156/642 + 1331 / Có 331), tự tạo NCC nếu chưa có",
      parameters: {
        type: "object",
        properties: {
          tenNcc: { type: "string" },
          soTien: { type: "number", description: "Tiền hàng chưa thuế" },
          thueSuat: { type: "string", description: "mặc định 8" },
          taiKhoanChiPhi: { type: "string", description: "156 hàng hoá / 642 chi phí, mặc định 156" },
        },
        required: ["tenNcc", "soTien"],
      },
      async execute(ctx, p) {
        await ensureChart(ctx);
        const c = ctxOf(ctx);
        const contact =
          (await svc.contacts.findByName(c, String(p.tenNcc))) ??
          (await svc.contacts.create(c, { name: String(p.tenNcc), type: "VENDOR" }));
        const bill = await svc.bills.create(c, {
          docDate: today(),
          contactId: contact.id,
          subtotal: money(p.soTien),
          taxRate: String(p.thueSuat ?? "8"),
          expenseAccountCode: String(p.taiKhoanChiPhi || "156"),
          post: true,
        });
        await logAudit(ctx, this.name, p, bill.id);
        return ok(this.name, `Đã tạo hóa đơn mua ${bill.docNo} của ${contact.name}: tổng ${Money.formatVND(bill.total)}.`, bill);
      },
    },
    {
      name: "k10a.thu_tien_hoa_don",
      permission: "ke-toan-10a.invoice.collect",
      securityLevel: 2,
      sensitive: true,
      requiredModule: MODULE_ID,
      description: "(Kế Toán 10A) Thu tiền theo hóa đơn bán (knock-off công nợ, chặn thu vượt nợ)",
      parameters: {
        type: "object",
        properties: {
          maHoaDon: { type: "string", description: "Số hóa đơn HD-... hoặc id" },
          soTien: { type: "number", description: "Bỏ trống = thu toàn bộ còn lại" },
          taiKhoanTien: { type: "string", description: "mặc định 111" },
        },
        required: ["maHoaDon"],
      },
      async execute(ctx, p) {
        const c = ctxOf(ctx);
        const inv = await svc.invoices.getByDocNoOrId(c, String(p.maHoaDon));
        const remaining = Money.sub(inv.total, inv.amountPaid);
        const amount = p.soTien != null ? money(p.soTien) : remaining;
        const r = await svc.invoices.recordPayment(c, inv.id, amount, String(p.taiKhoanTien || "111"));
        await logAudit(ctx, this.name, p, inv.id);
        const left = Money.sub(r.total, r.amountPaid);
        return ok(this.name, `Đã thu ${Money.formatVND(amount)} cho hóa đơn ${inv.docNo}. Còn nợ ${Money.formatVND(left)}.`, r);
      },
    },
    {
      name: "k10a.tam_ung",
      permission: "ke-toan-10a.advance.create",
      securityLevel: 2,
      sensitive: true,
      requiredModule: MODULE_ID,
      description: "(Kế Toán 10A) Ghi khách đặt cọc / ứng trước NCC / tạm ứng nhân viên",
      parameters: {
        type: "object",
        properties: {
          loai: { type: "string", enum: ["CUSTOMER_DEPOSIT", "SUPPLIER_ADVANCE", "EMPLOYEE_ADVANCE"] },
          soTien: { type: "number" },
          tenDoiTac: { type: "string" },
        },
        required: ["loai", "soTien"],
      },
      async execute(ctx, p) {
        await ensureChart(ctx);
        const adv = await svc.advances.create(ctxOf(ctx), {
          type: p.loai as never,
          docDate: today(),
          amount: money(p.soTien),
          partyName: p.tenDoiTac ? String(p.tenDoiTac) : undefined,
        });
        await logAudit(ctx, this.name, p, adv.id);
        const nhan = p.loai === "CUSTOMER_DEPOSIT" ? "khách đặt cọc" : p.loai === "SUPPLIER_ADVANCE" ? "ứng trước NCC" : "tạm ứng nhân viên";
        return ok(this.name, `Đã ghi ${nhan} ${adv.docNo}: ${Money.formatVND(adv.amount)}${p.tenDoiTac ? ` (${p.tenDoiTac})` : ""}.`, adv);
      },
    },
    {
      name: "k10a.dat_dinh_ky",
      permission: "ke-toan-10a.recurring.create",
      securityLevel: 2,
      sensitive: true,
      requiredModule: MODULE_ID,
      description: "(Kế Toán 10A) Đặt lịch thu/chi định kỳ (tiền thuê, lương, phí cố định)",
      parameters: {
        type: "object",
        properties: {
          ten: { type: "string" },
          loai: { type: "string", enum: ["RECEIPT", "PAYMENT"] },
          tanSuat: { type: "string", enum: ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"], description: "mặc định MONTHLY" },
          soTien: { type: "number" },
          taiKhoanDoiUng: { type: "string", description: "VD 642 thuê, 511 doanh thu" },
          batDau: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["ten", "loai", "soTien", "taiKhoanDoiUng", "batDau"],
      },
      async execute(ctx, p) {
        await ensureChart(ctx);
        const tpl = await svc.recurring.create(ctxOf(ctx), {
          name: String(p.ten),
          kind: p.loai as never,
          frequency: (p.tanSuat as never) ?? "MONTHLY",
          payload: { counterAccountCode: String(p.taiKhoanDoiUng), cashAccountCode: "111", amount: money(p.soTien) },
          startDate: String(p.batDau),
        });
        await logAudit(ctx, this.name, p, tpl.id);
        return ok(this.name, `Đã đặt lịch "${tpl.name}": ${p.loai === "RECEIPT" ? "thu" : "chi"} ${Money.formatVND(money(p.soTien))} định kỳ, bắt đầu ${p.batDau}.`, tpl);
      },
    },
    {
      name: "k10a.chay_dinh_ky",
      permission: "ke-toan-10a.recurring.run",
      securityLevel: 2,
      sensitive: true,
      requiredModule: MODULE_ID,
      description: "(Kế Toán 10A) Chạy mọi giao dịch định kỳ tới hạn (bắt kịp kỳ bỏ lỡ, ghi sổ thật)",
      parameters: { type: "object", properties: { tinhDenNgay: { type: "string", description: "YYYY-MM-DD" } } },
      async execute(ctx, p) {
        const r = await svc.recurring.runDue(ctxOf(ctx), p.tinhDenNgay ? String(p.tinhDenNgay) : undefined);
        await logAudit(ctx, this.name, p);
        return ok(this.name, r.generated === 0 ? "Không có giao dịch định kỳ nào tới hạn." : `Đã sinh ${r.generated} chứng từ từ ${r.templates.length} mẫu định kỳ.`, r);
      },
    },
    {
      name: "k10a.dat_han_muc",
      permission: "ke-toan-10a.credit.limit-set",
      securityLevel: 2,
      sensitive: true,
      requiredModule: MODULE_ID,
      description: "(Kế Toán 10A) Đặt hạn mức công nợ + điều khoản thanh toán cho khách (chặn hóa đơn vượt)",
      parameters: {
        type: "object",
        properties: {
          tenKhachHang: { type: "string" },
          hanMuc: { type: "number" },
          soNgayDuocNo: { type: "number" },
        },
        required: ["tenKhachHang", "hanMuc"],
      },
      async execute(ctx, p) {
        const c = ctxOf(ctx);
        const contact = await svc.contacts.findByName(c, String(p.tenKhachHang));
        if (!contact) return { ok: false, action: this.name, module: MODULE_ID, message: `Không tìm thấy khách "${p.tenKhachHang}".` };
        const updated = await svc.contacts.update(c, contact.id, {
          creditLimit: money(p.hanMuc),
          ...(p.soNgayDuocNo != null ? { paymentTermDays: num(p.soNgayDuocNo) } : {}),
        });
        await logAudit(ctx, this.name, p, contact.id);
        return ok(this.name, `Đã đặt hạn mức cho ${updated.name}: ${Money.formatVND(updated.creditLimit)}${p.soNgayDuocNo ? `, ${p.soNgayDuocNo} ngày` : ""}.`, updated);
      },
    },
    {
      name: "k10a.doi_chieu_ngan_hang",
      permission: "ke-toan-10a.bank.reconcile",
      securityLevel: 2,
      sensitive: true,
      requiredModule: MODULE_ID,
      description: "(Kế Toán 10A) Đối chiếu ngân hàng: tự khớp sao kê đã nhập + áp quy tắc (sinh chứng từ) + báo cáo",
      parameters: { type: "object", properties: { taiKhoan: { type: "string", description: "mặc định 112" } } },
      async execute(ctx, p) {
        const c = ctxOf(ctx);
        const acc = String(p.taiKhoan || "112");
        const m = await svc.bank.autoMatch(c, acc);
        const r = await svc.bank.applyRules(c, acc);
        const report = await svc.bank.reconciliationReport(c, acc);
        await logAudit(ctx, this.name, p);
        return ok(this.name, `Đối chiếu ${acc}: khớp tự động ${m.matched}, sinh theo quy tắc ${r.created}, còn ${report.unmatchedCount} dòng chưa khớp.${report.reconciled ? " ✓ Đã khớp hết." : ""}`, report);
      },
    },
    {
      name: "k10a.tao_tscd",
      permission: "ke-toan-10a.asset.create",
      securityLevel: 2,
      sensitive: true,
      requiredModule: MODULE_ID,
      description: "(Kế Toán 10A) Ghi nhận tài sản cố định (tùy chọn ghi bút toán mua Nợ 211/Có tiền)",
      parameters: {
        type: "object",
        properties: {
          ten: { type: "string" },
          nguyenGia: { type: "number" },
          soThangKhauHao: { type: "number" },
          ngayBatDau: { type: "string", description: "YYYY-MM-DD, mặc định hôm nay" },
          muaTuTaiKhoan: { type: "string", description: "VD 112 để ghi bút toán mua" },
        },
        required: ["ten", "nguyenGia", "soThangKhauHao"],
      },
      async execute(ctx, p) {
        await ensureChart(ctx);
        const asset = await svc.assets.create(ctxOf(ctx), {
          name: String(p.ten),
          cost: money(p.nguyenGia),
          usefulLifeMonths: num(p.soThangKhauHao),
          startDate: p.ngayBatDau ? String(p.ngayBatDau) : today(),
          acquireFromAccountCode: p.muaTuTaiKhoan ? String(p.muaTuTaiKhoan) : undefined,
        });
        await logAudit(ctx, this.name, p, asset.id);
        return ok(this.name, `Đã ghi nhận TSCĐ ${asset.code} — ${asset.name}: nguyên giá ${Money.formatVND(asset.cost)}, khấu hao ${p.soThangKhauHao} tháng.`, asset);
      },
    },
    {
      name: "k10a.chay_khau_hao",
      permission: "ke-toan-10a.asset.depreciate",
      securityLevel: 2,
      sensitive: true,
      requiredModule: MODULE_ID,
      description: "(Kế Toán 10A) Chạy khấu hao TSCĐ tới kỳ (Nợ chi phí / Có 214, bắt kịp tháng chưa ghi)",
      parameters: { type: "object", properties: { denNgay: { type: "string", description: "YYYY-MM-DD" } } },
      async execute(ctx, p) {
        const r = await svc.assets.runDepreciation(ctxOf(ctx), p.denNgay ? String(p.denNgay) : undefined);
        await logAudit(ctx, this.name, p);
        return ok(this.name, r.posted === 0 ? "Không có khấu hao nào tới kỳ." : `Đã ghi ${r.posted} kỳ khấu hao cho ${r.assets.length} tài sản.`, r);
      },
    },
    {
      name: "k10a.dat_ngan_sach",
      permission: "ke-toan-10a.budget.set",
      securityLevel: 1,
      sensitive: false,
      requiredModule: MODULE_ID,
      description: "(Kế Toán 10A) Đặt dự toán ngân sách năm cho một tài khoản (upsert)",
      parameters: {
        type: "object",
        properties: { nam: { type: "string" }, taiKhoan: { type: "string" }, soTien: { type: "number" } },
        required: ["nam", "taiKhoan", "soTien"],
      },
      async execute(ctx, p) {
        await ensureChart(ctx);
        const b = await svc.budget.setBudget(ctxOf(ctx), { fiscalYear: String(p.nam), accountCode: String(p.taiKhoan), amount: money(p.soTien) });
        await logAudit(ctx, this.name, p, b.id);
        return ok(this.name, `Đã đặt ngân sách TK ${p.taiKhoan} năm ${p.nam}: ${Money.formatVND(b.amount)}.`, b);
      },
    },
    {
      name: "k10a.ngan_sach_thuc_te",
      permission: "ke-toan-10a.budget.read",
      securityLevel: 1,
      sensitive: false,
      requiredModule: MODULE_ID,
      description: "(Kế Toán 10A) So sánh ngân sách vs thực tế, chỉ ra khoản vượt",
      parameters: { type: "object", properties: { nam: { type: "string" } } },
      async execute(ctx, p) {
        const year = p.nam ? String(p.nam) : String(new Date().getFullYear());
        const r = await svc.budget.budgetVsActual(ctxOf(ctx), year);
        await logAudit(ctx, this.name, p);
        if (r.rows.length === 0) return ok(this.name, `Chưa đặt ngân sách cho năm ${year}.`, r);
        const over = r.rows.filter((x) => x.overBudget);
        return ok(this.name, `Ngân sách ${year}: tổng ${Money.formatVND(r.totalBudget)}, thực tế ${Money.formatVND(r.totalActual)}. ${over.length} khoản VƯỢT.`, r);
      },
    },
    {
      name: "k10a.danh_gia_ty_gia",
      permission: "ke-toan-10a.fx.revalue",
      securityLevel: 2,
      sensitive: true,
      requiredModule: MODULE_ID,
      description: "(Kế Toán 10A) Đánh giá lại số dư ngoại tệ cuối kỳ, ghi lãi/lỗ tỷ giá (515/635)",
      parameters: {
        type: "object",
        properties: {
          taiKhoan: { type: "string" },
          ngoaiTe: { type: "string", description: "mặc định USD" },
          soDuNgoaiTe: { type: "number" },
          tyGiaMoi: { type: "number" },
        },
        required: ["taiKhoan", "soDuNgoaiTe", "tyGiaMoi"],
      },
      async execute(ctx, p) {
        const r = await svc.fx.revalue(ctxOf(ctx), {
          accountCode: String(p.taiKhoan),
          foreignCurrency: String(p.ngoaiTe || "USD"),
          foreignAmount: String(num(p.soDuNgoaiTe)),
          newRate: String(num(p.tyGiaMoi)),
        });
        await logAudit(ctx, this.name, p, r.entryId);
        const kq = r.result === "GAIN" ? "LÃI tỷ giá" : r.result === "LOSS" ? "LỖ tỷ giá" : "không chênh lệch";
        return ok(this.name, `Đánh giá lại ${p.taiKhoan}: ${Money.formatVND(r.bookValue)} → ${Money.formatVND(r.revaluedValue)}. ${kq} ${Money.formatVND(Money.abs(r.difference))}.`, r);
      },
    },
    {
      name: "k10a.ket_chuyen",
      permission: "ke-toan-10a.period.close",
      securityLevel: 2,
      sensitive: true,
      requiredModule: MODULE_ID,
      description: "(Kế Toán 10A) Kết chuyển cuối kỳ (doanh thu/chi phí → 911 → 421) và KHÓA năm tài chính",
      parameters: { type: "object", properties: { maNienDo: { type: "string", description: "id hoặc tên năm, VD 2026" } }, required: ["maNienDo"] },
      async execute(ctx, p) {
        const c = ctxOf(ctx);
        const key = String(p.maNienDo);
        const list = await svc.fiscal.list(c);
        const fy = list.find((f) => f.id === key || f.name === key);
        if (!fy) return { ok: false, action: this.name, module: MODULE_ID, message: `Không tìm thấy năm tài chính "${key}". Tạo trước bằng "khóa kỳ".` };
        const r = await svc.closing.closeFiscalYear(c, fy.id);
        await logAudit(ctx, this.name, p, fy.id);
        return ok(this.name, `Đã kết chuyển năm ${fy.name}: lãi/lỗ ${Money.formatVND(r.netResult)} chuyển về 421, kỳ đã khóa.`, r);
      },
    },
    {
      name: "k10a.bao_cao_nhanh",
      permission: "ke-toan-10a.report.read",
      securityLevel: 1,
      sensitive: false,
      requiredModule: MODULE_ID,
      description: "(Kế Toán 10A) Báo cáo nhanh: tiền, phải thu/trả, doanh thu, chi phí, lãi lỗ, sổ có cân không",
      parameters: { type: "object", properties: {} },
      async execute(ctx, p) {
        const c = ctxOf(ctx);
        const d = await svc.reports.dashboard(c);
        const tb = await svc.reports.trialBalance(c);
        await logAudit(ctx, this.name, p);
        return ok(
          this.name,
          `Tiền ${Money.formatVND(d.cash)} · Phải thu ${Money.formatVND(d.receivables)} · Phải trả ${Money.formatVND(d.payables)} · Lãi/lỗ kỳ ${Money.formatVND(d.profit)} · Sổ ${tb.balanced ? "CÂN ✓" : "LỆCH ✗"}.`,
          { ...d, balanced: tb.balanced },
        );
      },
    },
  ];
}

/**
 * Regex bắt câu lệnh nhanh (host nối vào detectAction). Mọi mẫu đều yêu cầu
 * chữ "10a" trong câu để KHÔNG giẫm lên acc.* của module kế toán cũ.
 */
export function detectK10aAction(message: string): { name: string; params: Record<string, unknown> } | null {
  const m = message.trim();
  if (!/10a/i.test(m)) return null;
  let x: RegExpExecArray | null;
  if ((x = /phiếu\s+thu\s+(?:10a\s+)?([\d.,]+)\s*(?:k|nghìn|tr|triệu)?\s+(?:cho|từ)\s+(.+)/i.exec(m)))
    return { name: "k10a.thu_tien", params: { soTien: Number(x[1]!.replace(/\D/g, "")), tenDoiTac: x[2]!.replace(/\s*10a\s*/i, "").trim() } };
  if ((x = /phiếu\s+chi\s+(?:10a\s+)?([\d.,]+)\s*(?:k|nghìn|tr|triệu)?\s+(?:cho|tới|đến)\s+(.+)/i.exec(m)))
    return { name: "k10a.chi_tien", params: { soTien: Number(x[1]!.replace(/\D/g, "")), tenDoiTac: x[2]!.replace(/\s*10a\s*/i, "").trim() } };
  if ((x = /hóa\s*đơn\s+bán\s+(?:10a\s+)?([\d.,]+)\s+(?:cho|của)\s+(.+)/i.exec(m)))
    return { name: "k10a.hoa_don_ban", params: { soTien: Number(x[1]!.replace(/\D/g, "")), tenKhach: x[2]!.replace(/\s*10a\s*/i, "").trim() } };
  if (/khấu\s*hao/i.test(m)) return { name: "k10a.chay_khau_hao", params: {} };
  if (/đối\s*chiếu\s+ngân\s*hàng/i.test(m)) return { name: "k10a.doi_chieu_ngan_hang", params: {} };
  if (/định\s*kỳ/i.test(m) && /chạy/i.test(m)) return { name: "k10a.chay_dinh_ky", params: {} };
  if (/ngân\s*sách/i.test(m)) return { name: "k10a.ngan_sach_thuc_te", params: {} };
  if (/báo\s*cáo|tình\s*hình|sổ\s*sách/i.test(m)) return { name: "k10a.bao_cao_nhanh", params: {} };
  return null;
}
