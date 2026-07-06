import { z } from "zod";
import type { Ctx } from "../lib/context.js";
import type { KetoanServices } from "../services/index.js";
import type { ActionResult } from "../types/index.js";
import * as Money from "../lib/money.js";
import { KetoanError } from "../lib/errors.js";

/**
 * Định nghĩa một Action mà Tiểu Tâm có thể gọi.
 * `paramsSchema` dùng để Tiểu Tâm biết cần trích xuất tham số gì từ câu nói.
 * `handler` trả về ActionResult có `message` tiếng Việt tự nhiên để đọc lại.
 */
export interface TieuTamAction<P = unknown> {
  /** ID duy nhất, ví dụ "ketoan.tao_phieu_thu". */
  id: string;
  /** Nhãn hiển thị. */
  title: string;
  /** Mô tả để Tiểu Tâm hiểu action làm gì. */
  description: string;
  /** Câu nói mẫu (intent) người dùng có thể dùng. */
  examples: string[];
  /** Schema tham số (Zod → JSON schema cho Tiểu Tâm). */
  paramsSchema: z.ZodType<P>;
  /** Loại: đọc (an toàn) hay ghi (thay đổi dữ liệu). */
  kind: "read" | "write";
  handler: (
    svc: KetoanServices,
    ctx: Ctx,
    params: P,
  ) => Promise<ActionResult>;
}

/* ================================================================== */
/* SCHEMAS                                                             */
/* ================================================================== */

const today = () => new Date().toISOString().slice(0, 10);

const phieuThuSchema = z.object({
  soTien: z.string().describe("Số tiền thu, ví dụ '500000'"),
  taiKhoanDoiUng: z
    .string()
    .default("511")
    .describe("Mã TK đối ứng: 131 (thu nợ KH), 511 (doanh thu), 711 (thu khác)"),
  taiKhoanTien: z.string().default("111").describe("111 tiền mặt / 112 ngân hàng"),
  lyDo: z.string().optional().describe("Diễn giải lý do thu"),
  nguoiNop: z.string().optional(),
  ngay: z.string().optional().describe("YYYY-MM-DD, mặc định hôm nay"),
});

const phieuChiSchema = z.object({
  soTien: z.string(),
  taiKhoanDoiUng: z
    .string()
    .default("642")
    .describe("Mã TK đối ứng: 331 (trả NCC), 642 (chi phí QLDN), 641 (chi phí bán hàng)"),
  taiKhoanTien: z.string().default("111"),
  lyDo: z.string().optional(),
  nguoiNhan: z.string().optional(),
  ngay: z.string().optional(),
});

const hoaDonSchema = z.object({
  tenKhachHang: z.string().describe("Tên khách hàng"),
  tienHang: z.string().describe("Tiền hàng trước thuế"),
  thueSuat: z.string().default("0").describe("Thuế suất GTGT %, ví dụ '8', '10'"),
  dienGiai: z.string().optional(),
  ngay: z.string().optional(),
});

const soCaiSchema = z.object({
  maTaiKhoan: z.string().describe("Mã TK cần xem sổ cái, ví dụ '111'"),
  tuNgay: z.string().optional(),
  denNgay: z.string().optional(),
});

const kyBaoCaoSchema = z.object({
  tuNgay: z.string().optional().describe("YYYY-MM-DD"),
  denNgay: z.string().optional(),
});

const soDuSchema = z.object({
  maTaiKhoan: z.string(),
  denNgay: z.string().optional(),
});

const taoTaiKhoanSchema = z.object({
  ma: z.string(),
  ten: z.string(),
  loai: z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]),
});

const themDoiTacSchema = z.object({
  ten: z.string(),
  loai: z.enum(["CUSTOMER", "VENDOR", "BOTH"]).default("CUSTOMER"),
  sdt: z.string().optional(),
  maSoThue: z.string().optional(),
});

/* ================================================================== */
/* ACTIONS                                                             */
/* ================================================================== */

export const ACTIONS: TieuTamAction<any>[] = [
  {
    id: "ketoan.tao_phieu_thu",
    title: "Tạo phiếu thu",
    description:
      "Lập và ghi sổ phiếu thu tiền. Sinh bút toán Nợ TK tiền / Có TK đối ứng.",
    examples: [
      "Tạo phiếu thu 500k tiền bán hàng",
      "Thu 2 triệu tiền khách trả nợ",
      "Lập phiếu thu 1.500.000 doanh thu dịch vụ hôm nay",
    ],
    paramsSchema: phieuThuSchema,
    kind: "write",
    handler: async (svc, ctx, p) => {
      const r = await svc.receipts.create(ctx, {
        docDate: p.ngay ?? today(),
        cashAccountCode: p.taiKhoanTien ?? "111",
        counterAccountCode: p.taiKhoanDoiUng ?? "511",
        amount: p.soTien,
        reason: p.lyDo,
        payerName: p.nguoiNop,
        post: true,
      });
      return {
        ok: true,
        message: `Đã lập phiếu thu ${r.docNo}, số tiền ${Money.formatVND(r.amount)} và ghi sổ thành công.`,
        data: r,
      };
    },
  },
  {
    id: "ketoan.tao_phieu_chi",
    title: "Tạo phiếu chi",
    description:
      "Lập và ghi sổ phiếu chi tiền. Sinh bút toán Nợ TK đối ứng / Có TK tiền.",
    examples: [
      "Tạo phiếu chi 300k mua văn phòng phẩm",
      "Chi 5 triệu trả tiền nhà cung cấp",
      "Lập phiếu chi 800.000 tiền điện",
    ],
    paramsSchema: phieuChiSchema,
    kind: "write",
    handler: async (svc, ctx, p) => {
      const r = await svc.payments.create(ctx, {
        docDate: p.ngay ?? today(),
        cashAccountCode: p.taiKhoanTien ?? "111",
        counterAccountCode: p.taiKhoanDoiUng ?? "642",
        amount: p.soTien,
        reason: p.lyDo,
        payeeName: p.nguoiNhan,
        post: true,
      });
      return {
        ok: true,
        message: `Đã lập phiếu chi ${r.docNo}, số tiền ${Money.formatVND(r.amount)} và ghi sổ thành công.`,
        data: r,
      };
    },
  },
  {
    id: "ketoan.tao_hoa_don",
    title: "Tạo hoá đơn bán hàng",
    description:
      "Lập hoá đơn bán hàng (công nợ phải thu). Tự tính thuế GTGT và sinh bút toán Nợ 131 / Có 511, Có 3331.",
    examples: [
      "Xuất hoá đơn cho khách An 10 triệu thuế 8%",
      "Tạo hoá đơn bán hàng 5.000.000 cho công ty ABC",
    ],
    paramsSchema: hoaDonSchema,
    kind: "write",
    handler: async (svc, ctx, p) => {
      // Tìm hoặc tạo khách hàng theo tên.
      let contact = await svc.contacts.findByName(ctx, p.tenKhachHang);
      if (!contact) {
        contact = await svc.contacts.create(ctx, {
          name: p.tenKhachHang,
          type: "CUSTOMER",
        });
      }
      const inv = await svc.invoices.create(ctx, {
        docDate: p.ngay ?? today(),
        contactId: contact.id,
        subtotal: p.tienHang,
        taxRate: p.thueSuat ?? "0",
        description: p.dienGiai,
        post: true,
      });
      return {
        ok: true,
        message: `Đã xuất hoá đơn ${inv.docNo} cho ${contact.name}: tiền hàng ${Money.formatVND(inv.subtotal)}, thuế ${Money.formatVND(inv.taxAmount)}, tổng cộng ${Money.formatVND(inv.total)}.`,
        data: inv,
      };
    },
  },
  {
    id: "ketoan.thu_tien_hoa_don",
    title: "Thu tiền hoá đơn",
    description: "Ghi nhận thu tiền (một phần/toàn bộ) cho một hoá đơn đã lập.",
    examples: ["Thu 5 triệu hoá đơn HD-2026-000012", "Khách trả hết hoá đơn số ..."],
    paramsSchema: z.object({
      maHoaDon: z.string().describe("docNo hoặc id hoá đơn"),
      soTien: z.string(),
      taiKhoanTien: z.string().default("111"),
    }),
    kind: "write",
    handler: async (svc, ctx, p) => {
      // Cho phép truyền docNo → tra id.
      const list = await svc.invoices.list(ctx, 200);
      const inv = list.find(
        (i) => i.id === p.maHoaDon || i.docNo === p.maHoaDon,
      );
      if (!inv) {
        return { ok: false, message: `Không tìm thấy hoá đơn ${p.maHoaDon}.`, error: "NOT_FOUND" };
      }
      const updated = await svc.invoices.recordPayment(
        ctx,
        inv.id,
        p.soTien,
        p.taiKhoanTien ?? "111",
      );
      const remaining = Money.sub(updated.total, updated.amountPaid);
      return {
        ok: true,
        message: `Đã ghi nhận thu ${Money.formatVND(p.soTien)} cho hoá đơn ${updated.docNo}. Còn lại ${Money.formatVND(remaining)}.`,
        data: updated,
      };
    },
  },
  {
    id: "ketoan.tao_but_toan",
    title: "Tạo bút toán thủ công",
    description:
      "Lập bút toán tổng hợp bằng danh sách dòng Nợ/Có. Tự kiểm tra cân đối trước khi ghi sổ.",
    examples: ["Hạch toán kết chuyển lãi lỗ cuối kỳ"],
    paramsSchema: z.object({
      dienGiai: z.string().optional(),
      ngay: z.string().optional(),
      dong: z
        .array(
          z.object({
            maTaiKhoan: z.string(),
            no: z.string().optional(),
            co: z.string().optional(),
            dienGiai: z.string().optional(),
          }),
        )
        .min(2),
    }),
    kind: "write",
    handler: async (svc, ctx, p) => {
      // Chuyển mã TK → id.
      const lines = [];
      for (const d of p.dong) {
        const acc = await svc.accounts.requireByCode(ctx, d.maTaiKhoan);
        lines.push({
          accountId: acc.id,
          debit: d.no,
          credit: d.co,
          memo: d.dienGiai,
        });
      }
      const entry = await svc.ledger.createEntry(ctx, {
        entryDate: p.ngay ?? today(),
        memo: p.dienGiai,
        lines,
        sourceType: "MANUAL",
        post: true,
      });
      return {
        ok: true,
        message: `Đã ghi bút toán ${entry.entryNo}, tổng phát sinh ${Money.formatVND(entry.totalAmount)}.`,
        data: entry,
      };
    },
  },
  {
    id: "ketoan.tong_quan",
    title: "Tổng quan tài chính",
    description:
      "Xem nhanh tình hình tài chính: tiền, phải thu, phải trả, doanh thu, chi phí, lợi nhuận.",
    examples: [
      "Tình hình tài chính hiện tại thế nào",
      "Cho xem tổng quan tài chính tháng này",
      "Công ty đang lãi hay lỗ",
    ],
    paramsSchema: kyBaoCaoSchema,
    kind: "read",
    handler: async (svc, ctx, p) => {
      const d = await svc.reports.dashboard(ctx, p.tuNgay, p.denNgay);
      const laiLo = Money.compare(d.profit, "0") >= 0 ? "lãi" : "lỗ";
      return {
        ok: true,
        message:
          `Tổng quan tài chính:\n` +
          `• Tiền hiện có: ${Money.formatVND(d.cash)}\n` +
          `• Phải thu khách hàng: ${Money.formatVND(d.receivables)}\n` +
          `• Phải trả nhà cung cấp: ${Money.formatVND(d.payables)}\n` +
          `• Doanh thu: ${Money.formatVND(d.revenue)}\n` +
          `• Chi phí: ${Money.formatVND(d.expense)}\n` +
          `• Kết quả: ${laiLo} ${Money.formatVND(Money.abs(d.profit))}`,
        data: d,
      };
    },
  },
  {
    id: "ketoan.bao_cao_lai_lo",
    title: "Báo cáo lãi lỗ",
    description: "Báo cáo kết quả kinh doanh (doanh thu, chi phí, lợi nhuận) theo kỳ.",
    examples: ["Báo cáo lãi lỗ quý này", "Kết quả kinh doanh tháng 6"],
    paramsSchema: kyBaoCaoSchema,
    kind: "read",
    handler: async (svc, ctx, p) => {
      const r = await svc.reports.profitAndLoss(ctx, p.tuNgay, p.denNgay);
      const laiLo = Money.compare(r.netProfit, "0") >= 0 ? "Lãi" : "Lỗ";
      return {
        ok: true,
        message: `Kết quả kinh doanh: Doanh thu ${Money.formatVND(r.totalIncome)}, Chi phí ${Money.formatVND(r.totalExpense)}. ${laiLo} ${Money.formatVND(Money.abs(r.netProfit))}.`,
        data: r,
      };
    },
  },
  {
    id: "ketoan.can_doi_ke_toan",
    title: "Bảng cân đối kế toán",
    description: "Bảng cân đối kế toán tại một thời điểm: Tài sản = Nợ phải trả + Vốn chủ.",
    examples: ["Cho xem bảng cân đối kế toán", "Bảng cân đối tính đến cuối tháng"],
    paramsSchema: z.object({ denNgay: z.string().optional() }),
    kind: "read",
    handler: async (svc, ctx, p) => {
      const r = await svc.reports.balanceSheet(ctx, p.denNgay);
      const canDoi = r.balanced ? "cân đối ✓" : "CHƯA cân đối ✗";
      return {
        ok: true,
        message: `Bảng cân đối kế toán: Tổng tài sản ${Money.formatVND(r.totalAssets)}, Tổng nợ phải trả ${Money.formatVND(r.totalLiabilities)}, Vốn chủ sở hữu ${Money.formatVND(r.totalEquity)} (${canDoi}).`,
        data: r,
      };
    },
  },
  {
    id: "ketoan.can_doi_phat_sinh",
    title: "Bảng cân đối số phát sinh",
    description: "Bảng cân đối số phát sinh (trial balance) — tổng Nợ/Có từng tài khoản.",
    examples: ["Xem bảng cân đối số phát sinh", "Cân đối phát sinh tháng này"],
    paramsSchema: kyBaoCaoSchema,
    kind: "read",
    handler: async (svc, ctx, p) => {
      const r = await svc.reports.trialBalance(ctx, p.tuNgay, p.denNgay);
      return {
        ok: true,
        message: `Bảng cân đối số phát sinh có ${r.rows.length} tài khoản. Tổng Nợ ${Money.formatVND(r.totalDebit)}, Tổng Có ${Money.formatVND(r.totalCredit)} (${r.balanced ? "cân ✓" : "lệch ✗"}).`,
        data: r,
      };
    },
  },
  {
    id: "ketoan.xem_so_cai",
    title: "Xem sổ cái tài khoản",
    description: "Xem sổ cái chi tiết một tài khoản: phát sinh và số dư luỹ kế.",
    examples: ["Xem sổ cái tài khoản tiền mặt", "Sổ cái 131 tháng này"],
    paramsSchema: soCaiSchema,
    kind: "read",
    handler: async (svc, ctx, p) => {
      const r = await svc.reports.generalLedger(
        ctx,
        p.maTaiKhoan,
        p.tuNgay,
        p.denNgay,
      );
      return {
        ok: true,
        message: `Sổ cái TK ${r.account.code} - ${r.account.name}: đầu kỳ ${Money.formatVND(r.opening)}, có ${r.rows.length} phát sinh, cuối kỳ ${Money.formatVND(r.closing)}.`,
        data: r,
      };
    },
  },
  {
    id: "ketoan.so_du_tai_khoan",
    title: "Số dư tài khoản",
    description: "Xem số dư hiện tại của một tài khoản.",
    examples: ["Còn bao nhiêu tiền mặt", "Số dư tài khoản ngân hàng", "Công nợ phải thu bao nhiêu"],
    paramsSchema: soDuSchema,
    kind: "read",
    handler: async (svc, ctx, p) => {
      const acc = await svc.accounts.requireByCode(ctx, p.maTaiKhoan);
      const r = await svc.accounts.getBalance(ctx, acc.id, p.denNgay);
      return {
        ok: true,
        message: `Số dư TK ${r.account.code} - ${r.account.name}: ${Money.formatVND(r.balance)}.`,
        data: r,
      };
    },
  },
  {
    id: "ketoan.tao_tai_khoan",
    title: "Tạo tài khoản kế toán",
    description: "Thêm một tài khoản mới vào hệ thống tài khoản.",
    examples: ["Thêm tài khoản 154 chi phí sản xuất dở dang"],
    paramsSchema: taoTaiKhoanSchema,
    kind: "write",
    handler: async (svc, ctx, p) => {
      const acc = await svc.accounts.create(ctx, {
        code: p.ma,
        name: p.ten,
        type: p.loai,
      });
      return {
        ok: true,
        message: `Đã tạo tài khoản ${acc.code} - ${acc.name}.`,
        data: acc,
      };
    },
  },
  {
    id: "ketoan.them_doi_tac",
    title: "Thêm đối tác",
    description: "Thêm khách hàng hoặc nhà cung cấp mới.",
    examples: ["Thêm khách hàng Công ty Minh Anh", "Tạo nhà cung cấp Vật tư Hưng Thịnh"],
    paramsSchema: themDoiTacSchema,
    kind: "write",
    handler: async (svc, ctx, p) => {
      const c = await svc.contacts.create(ctx, {
        name: p.ten,
        type: p.loai ?? "CUSTOMER",
        phone: p.sdt,
        taxCode: p.maSoThue,
      });
      const loai = c.type === "VENDOR" ? "nhà cung cấp" : "khách hàng";
      return {
        ok: true,
        message: `Đã thêm ${loai} ${c.name} (mã ${c.code}).`,
        data: c,
      };
    },
  },
  {
    id: "ketoan.danh_sach_phieu_thu",
    title: "Danh sách phiếu thu",
    description: "Liệt kê các phiếu thu gần nhất.",
    examples: ["Xem các phiếu thu gần đây", "Liệt kê phiếu thu"],
    paramsSchema: z.object({ soLuong: z.number().optional() }),
    kind: "read",
    handler: async (svc, ctx, p) => {
      const rows = await svc.receipts.list(ctx, p.soLuong ?? 20);
      const tong = Money.sum(rows.filter((r) => r.status === "POSTED").map((r) => r.amount));
      return {
        ok: true,
        message: `Có ${rows.length} phiếu thu gần đây, tổng đã ghi sổ ${Money.formatVND(tong)}.`,
        data: rows,
      };
    },
  },
  {
    id: "ketoan.danh_sach_phieu_chi",
    title: "Danh sách phiếu chi",
    description: "Liệt kê các phiếu chi gần nhất.",
    examples: ["Xem các phiếu chi gần đây", "Liệt kê phiếu chi"],
    paramsSchema: z.object({ soLuong: z.number().optional() }),
    kind: "read",
    handler: async (svc, ctx, p) => {
      const rows = await svc.payments.list(ctx, p.soLuong ?? 20);
      const tong = Money.sum(rows.filter((r) => r.status === "POSTED").map((r) => r.amount));
      return {
        ok: true,
        message: `Có ${rows.length} phiếu chi gần đây, tổng đã ghi sổ ${Money.formatVND(tong)}.`,
        data: rows,
      };
    },
  },
  {
    id: "ketoan.tao_hoa_don_mua",
    title: "Tạo hoá đơn mua hàng",
    description:
      "Lập hoá đơn mua (công nợ phải trả). Sinh bút toán Nợ 156/642 + Nợ 1331 / Có 331.",
    examples: ["Nhập hàng 5 triệu từ NCC Hưng Thịnh thuế 8%", "Mua vật tư 2 triệu"],
    paramsSchema: z.object({
      tenNhaCungCap: z.string(),
      tienHang: z.string(),
      thueSuat: z.string().default("0"),
      taiKhoanChiPhi: z.string().default("156").describe("156 hàng hóa / 642 chi phí"),
      dienGiai: z.string().optional(),
      ngay: z.string().optional(),
    }),
    kind: "write",
    handler: async (svc, ctx, p) => {
      let contact = await svc.contacts.findByName(ctx, p.tenNhaCungCap);
      if (!contact) {
        contact = await svc.contacts.create(ctx, { name: p.tenNhaCungCap, type: "VENDOR" });
      }
      const bill = await svc.bills.create(ctx, {
        docDate: p.ngay ?? today(),
        contactId: contact.id,
        subtotal: p.tienHang,
        taxRate: p.thueSuat ?? "0",
        expenseAccountCode: p.taiKhoanChiPhi ?? "156",
        description: p.dienGiai,
        post: true,
      });
      return {
        ok: true,
        message: `Đã lập hoá đơn mua ${bill.docNo} từ ${contact.name}: tiền hàng ${Money.formatVND(bill.subtotal)}, thuế ${Money.formatVND(bill.taxAmount)}, tổng phải trả ${Money.formatVND(bill.total)}.`,
        data: bill,
      };
    },
  },
  {
    id: "ketoan.tuoi_no",
    title: "Báo cáo tuổi nợ",
    description: "Xem công nợ theo tuổi nợ (quá hạn bao lâu), nhóm theo đối tác.",
    examples: ["Ai đang nợ quá hạn", "Công nợ phải thu theo tuổi nợ", "Ai nợ mình lâu nhất"],
    paramsSchema: z.object({
      loai: z.enum(["sales", "purchase"]).default("sales").describe("sales=phải thu, purchase=phải trả"),
    }),
    kind: "read",
    handler: async (svc, ctx, p) => {
      const type = p.loai === "purchase" ? "purchase" : "sales";
      const a = await svc.reports.aging(ctx, type);
      const nhan = type === "sales" ? "phải thu" : "phải trả";
      const top = a.parties.slice(0, 5);
      const dong = top.length
        ? top.map((pt) => `• ${Money.formatVND(pt.total)} (quá hạn: ${Money.formatVND(pt.buckets.d90_plus ?? "0")} trên 90 ngày)`).join("\n")
        : "Không có công nợ quá hạn.";
      return {
        ok: true,
        message: `Tuổi nợ ${nhan}: tổng ${Money.formatVND(a.grandTotal)}.\n${dong}`,
        data: a,
      };
    },
  },
  {
    id: "ketoan.cong_no_doi_tac",
    title: "Công nợ theo đối tác",
    description: "Tổng công nợ còn lại của từng đối tác (gộp mọi hoá đơn).",
    examples: ["Công nợ phải thu còn bao nhiêu", "Khách nào nợ nhiều nhất", "Mình còn nợ ai"],
    paramsSchema: z.object({
      loai: z.enum(["sales", "purchase"]).default("sales"),
    }),
    kind: "read",
    handler: async (svc, ctx, p) => {
      const type = p.loai === "purchase" ? "purchase" : "sales";
      const o = await svc.reports.outstandingByParty(ctx, type);
      const nhan = type === "sales" ? "khách hàng còn nợ mình" : "mình còn nợ nhà cung cấp";
      return {
        ok: true,
        message: `Tổng công nợ ${nhan}: ${Money.formatVND(o.grandTotal)} (${o.parties.length} đối tác).`,
        data: o,
      };
    },
  },
  {
    id: "ketoan.kiem_tra_so",
    title: "Kiểm tra toàn vẹn sổ",
    description: "Tự-audit: kiểm Σ Nợ=Σ Có toàn sổ, mỗi bút toán cân, không dòng mồ côi.",
    examples: ["Sổ sách có cân không", "Kiểm tra toàn vẹn sổ", "Sổ có lành không"],
    paramsSchema: z.object({}),
    kind: "read",
    handler: async (svc, ctx) => {
      const r = await svc.reports.integrityCheck(ctx);
      const ket = r.ok ? "SỔ LÀNH ✓ — mọi kiểm tra đạt." : "SỔ CÓ VẤN ĐỀ ✗";
      const chiTiet = r.checks.map((c) => `• ${c.ok ? "✓" : "✗"} ${c.detail}`).join("\n");
      return { ok: true, message: `${ket}\n${chiTiet}`, data: r };
    },
  },
  {
    id: "ketoan.khoa_ky",
    title: "Khóa kỳ kế toán",
    description: "Tạo/khóa năm tài chính để chặn sửa số kỳ đã quyết toán (không kết chuyển).",
    examples: ["Khóa sổ năm 2025", "Tạo năm tài chính 2026"],
    paramsSchema: z.object({
      ten: z.string().describe("Tên kỳ, ví dụ '2026'"),
      tuNgay: z.string().describe("YYYY-MM-DD"),
      denNgay: z.string().describe("YYYY-MM-DD"),
      khoaLuon: z.boolean().default(false).describe("true để khóa ngay sau khi tạo"),
    }),
    kind: "write",
    handler: async (svc, ctx, p) => {
      let fy = await svc.fiscal.create(ctx, { name: p.ten, startDate: p.tuNgay, endDate: p.denNgay });
      if (p.khoaLuon) fy = await svc.fiscal.close(ctx, fy.id);
      return {
        ok: true,
        message: `Đã tạo năm tài chính ${fy.name} (${p.tuNgay} → ${p.denNgay})${p.khoaLuon ? " và khóa kỳ" : ""}.`,
        data: fy,
      };
    },
  },
  {
    id: "ketoan.ket_chuyen_cuoi_ky",
    title: "Kết chuyển cuối kỳ",
    description:
      "Kết chuyển doanh thu & chi phí về 911, xác định lãi/lỗ về 421, rồi khóa niên độ. Cần fiscalYearId.",
    examples: ["Kết chuyển lãi lỗ cuối năm 2025", "Chốt sổ cuối kỳ"],
    paramsSchema: z.object({
      maNienDo: z.string().describe("ID năm tài chính cần kết chuyển & khóa"),
    }),
    kind: "write",
    handler: async (svc, ctx, p) => {
      const r = await svc.closing.closeFiscalYear(ctx, p.maNienDo);
      const kq = r.isProfit ? "LÃI" : "LỖ";
      return {
        ok: true,
        message: `Đã kết chuyển & khóa niên độ ${r.fiscalYear}. Doanh thu ${Money.formatVND(r.totalIncome)}, chi phí ${Money.formatVND(r.totalExpense)}, kết quả ${kq} ${Money.formatVND(Money.abs(r.netResult))} (chuyển vào 421).`,
        data: r,
      };
    },
  },
  {
    id: "ketoan.luu_chuyen_tien_te",
    title: "Báo cáo lưu chuyển tiền tệ",
    description: "Dòng tiền từ HĐ kinh doanh/đầu tư/tài chính, số dư tiền đầu-cuối kỳ.",
    examples: ["Báo cáo lưu chuyển tiền tệ quý này", "Dòng tiền tháng 6"],
    paramsSchema: z.object({ tuNgay: z.string().optional(), denNgay: z.string().optional() }),
    kind: "read",
    handler: async (svc, ctx, p) => {
      const cf = await svc.vietnam.cashFlowStatement(ctx, p.tuNgay, p.denNgay);
      return {
        ok: true,
        message: `Lưu chuyển tiền tệ: HĐ kinh doanh ${Money.formatVND(cf.operating)}, đầu tư ${Money.formatVND(cf.investing)}, tài chính ${Money.formatVND(cf.financing)}. Tiền thuần ${Money.formatVND(cf.netCashFlow)}. Số dư cuối kỳ ${Money.formatVND(cf.closingCash)}.`,
        data: cf,
      };
    },
  },
  {
    id: "ketoan.to_khai_gtgt",
    title: "Tờ khai thuế GTGT",
    description: "Tổng hợp thuế GTGT đầu ra/đầu vào + số phải nộp trong kỳ (mẫu 01/GTGT).",
    examples: ["Tờ khai thuế GTGT quý này", "Thuế GTGT phải nộp tháng 6"],
    paramsSchema: z.object({ tuNgay: z.string().optional(), denNgay: z.string().optional() }),
    kind: "read",
    handler: async (svc, ctx, p) => {
      const v = await svc.vietnam.vatDeclaration(ctx, p.tuNgay, p.denNgay);
      const ket =
        Money.compare(v.vatPayable, "0") > 0
          ? `Phải nộp ${Money.formatVND(v.vatPayable)}`
          : `Còn được khấu trừ ${Money.formatVND(v.carryForward)}`;
      return {
        ok: true,
        message: `Thuế GTGT: đầu ra ${Money.formatVND(v.output.outputVat)}, đầu vào ${Money.formatVND(v.input.inputVat)}. ${ket}.`,
        data: v,
      };
    },
  },
  {
    id: "ketoan.sao_ke_cong_no",
    title: "Sao kê công nợ đối tác",
    description: "Sao kê phát sinh công nợ của một đối tác theo thời gian, kèm số dư lũy kế.",
    examples: ["Sao kê công nợ của An Phát", "Công nợ khách Minh Anh 3 tháng qua"],
    paramsSchema: z.object({
      tenDoiTac: z.string(),
      tuNgay: z.string().optional(),
      denNgay: z.string().optional(),
    }),
    kind: "read",
    handler: async (svc, ctx, p) => {
      const contact = await svc.contacts.findByName(ctx, p.tenDoiTac);
      if (!contact) {
        return { ok: false, message: `Không tìm thấy đối tác "${p.tenDoiTac}".`, error: "NOT_FOUND" };
      }
      const st = await svc.reports.statementOfAccount(ctx, contact.id, p.tuNgay, p.denNgay);
      return {
        ok: true,
        message: `Sao kê ${contact.name}: đầu kỳ ${Money.formatVND(st.opening)}, ${st.rows.length} phát sinh, số dư cuối kỳ ${Money.formatVND(st.closing)}.`,
        data: st,
      };
    },
  },
  {
    id: "ketoan.nhac_han",
    title: "Nhắc hạn công nợ",
    description: "Danh sách hoá đơn quá hạn và sắp tới hạn, để chủ động nhắc thu/trả.",
    examples: ["Khách nào sắp tới hạn", "Có hoá đơn nào quá hạn không", "Nhắc công nợ phải thu"],
    paramsSchema: z.object({
      loai: z.enum(["sales", "purchase"]).default("sales"),
      soNgay: z.number().optional().describe("Ngưỡng 'sắp tới hạn' (mặc định 7 ngày)"),
    }),
    kind: "read",
    handler: async (svc, ctx, p) => {
      const type = p.loai === "purchase" ? "purchase" : "sales";
      const d = await svc.reports.dueReminders(ctx, type, p.soNgay ?? 7);
      const nhan = type === "sales" ? "phải thu" : "phải trả";
      return {
        ok: true,
        message: `Công nợ ${nhan}: ${d.overdue.length} hoá đơn QUÁ HẠN (${Money.formatVND(d.totalOverdue)}), ${d.dueSoon.length} SẮP TỚI HẠN (${Money.formatVND(d.totalDueSoon)}).`,
        data: d,
      };
    },
  },
  {
    id: "ketoan.hoa_don_dieu_chinh",
    title: "Hoá đơn điều chỉnh giảm",
    description: "Điều chỉnh giảm hoá đơn bán (hàng trả lại/giảm giá). Bút toán ngược phần điều chỉnh.",
    examples: ["Khách trả lại 2 triệu hàng hoá đơn HD-...001", "Giảm giá 500k cho hoá đơn ...003"],
    paramsSchema: z.object({
      maHoaDon: z.string(),
      soTien: z.string().describe("Tiền hàng chưa thuế bị điều chỉnh giảm"),
      lyDo: z.string().optional(),
    }),
    kind: "write",
    handler: async (svc, ctx, p) => {
      const inv = await svc.invoices.getByDocNoOrId(ctx, p.maHoaDon);
      const updated = await svc.invoices.createCreditNote(ctx, inv.id, p.soTien, p.lyDo);
      return {
        ok: true,
        message: `Đã điều chỉnh giảm hoá đơn ${updated.docNo}: giảm ${Money.formatVND(p.soTien)} tiền hàng. Tổng hoá đơn còn ${Money.formatVND(updated.total)}.`,
        data: updated,
      };
    },
  },
  {
    id: "ketoan.tam_ung",
    title: "Tạm ứng / đặt cọc",
    description:
      "Ghi nhận khách đặt cọc / ứng trước NCC / tạm ứng nhân viên. Sinh bút toán tương ứng.",
    examples: ["Khách An đặt cọc 5 triệu", "Ứng trước NCC Hưng Thịnh 10 triệu", "Tạm ứng nhân viên Minh 3 triệu"],
    paramsSchema: z.object({
      loai: z.enum(["CUSTOMER_DEPOSIT", "SUPPLIER_ADVANCE", "EMPLOYEE_ADVANCE"]).describe("Loại ứng trước"),
      soTien: z.string(),
      tenDoiTac: z.string().optional().describe("Tên khách/NCC/nhân viên"),
      taiKhoanTien: z.string().default("111"),
      dienGiai: z.string().optional(),
      ngay: z.string().optional(),
    }),
    kind: "write",
    handler: async (svc, ctx, p) => {
      let contactId: string | undefined;
      if (p.tenDoiTac && p.loai !== "EMPLOYEE_ADVANCE") {
        const found = await svc.contacts.findByName(ctx, p.tenDoiTac);
        if (found) contactId = found.id;
      }
      const adv = await svc.advances.create(ctx, {
        type: p.loai,
        docDate: p.ngay ?? today(),
        amount: p.soTien,
        contactId,
        partyName: p.tenDoiTac,
        cashAccountCode: p.taiKhoanTien ?? "111",
        description: p.dienGiai,
      });
      const nhan = p.loai === "CUSTOMER_DEPOSIT" ? "khách đặt cọc" : p.loai === "SUPPLIER_ADVANCE" ? "ứng trước NCC" : "tạm ứng nhân viên";
      return {
        ok: true,
        message: `Đã ghi nhận ${nhan} ${adv.docNo}: ${Money.formatVND(adv.amount)}${p.tenDoiTac ? ` (${p.tenDoiTac})` : ""}.`,
        data: adv,
      };
    },
  },
  {
    id: "ketoan.ap_tam_ung",
    title: "Áp khoản ứng vào hóa đơn",
    description: "Dùng khoản đặt cọc/ứng trước để cấn trừ công nợ một hóa đơn.",
    examples: ["Cấn trừ tiền cọc của khách vào hóa đơn HD-...001", "Trừ khoản ứng NCC vào hóa đơn mua"],
    paramsSchema: z.object({
      maKhoanUng: z.string().describe("docNo hoặc id khoản ứng (ADV-...)"),
      loaiChungTu: z.enum(["invoice", "bill"]).default("invoice"),
      maChungTu: z.string().describe("docNo hoặc id hóa đơn/hóa đơn mua"),
      soTien: z.string().optional().describe("Số cấn trừ (bỏ trống = tối đa)"),
    }),
    kind: "write",
    handler: async (svc, ctx, p) => {
      // Tra id khoản ứng.
      const advList = await svc.advances.list(ctx, undefined, 200);
      const adv = advList.find((a) => a.id === p.maKhoanUng || a.docNo === p.maKhoanUng);
      if (!adv) return { ok: false, message: `Không tìm thấy khoản ứng ${p.maKhoanUng}.`, error: "NOT_FOUND" };
      // Tra id chứng từ.
      let targetId = p.maChungTu;
      if (p.loaiChungTu === "invoice") {
        const inv = await svc.invoices.getByDocNoOrId(ctx, p.maChungTu);
        targetId = inv.id;
      } else {
        const bill = await svc.bills.getByDocNoOrId(ctx, p.maChungTu);
        targetId = bill.id;
      }
      const result = await svc.advances.applyToInvoice(ctx, adv.id, p.loaiChungTu, targetId, p.soTien);
      return {
        ok: true,
        message: `Đã cấn trừ ${Money.formatVND(result.applied)} từ khoản ứng ${adv.docNo} vào ${p.maChungTu}.`,
        data: result,
      };
    },
  },
  {
    id: "ketoan.dieu_chinh_mua",
    title: "Điều chỉnh giảm hóa đơn mua",
    description: "Trả lại hàng đã mua / NCC giảm giá (debit note). Bút toán ngược phần điều chỉnh.",
    examples: ["Trả lại 2 triệu hàng hóa đơn mua BILL-...001", "NCC giảm giá 500k hóa đơn mua"],
    paramsSchema: z.object({
      maHoaDonMua: z.string(),
      soTien: z.string().describe("Tiền hàng chưa thuế điều chỉnh giảm"),
      lyDo: z.string().optional(),
    }),
    kind: "write",
    handler: async (svc, ctx, p) => {
      const bill = await svc.bills.getByDocNoOrId(ctx, p.maHoaDonMua);
      const updated = await svc.bills.createDebitNote(ctx, bill.id, p.soTien, p.lyDo);
      return {
        ok: true,
        message: `Đã điều chỉnh giảm hóa đơn mua ${updated.docNo}: giảm ${Money.formatVND(p.soTien)} tiền hàng. Tổng còn ${Money.formatVND(updated.total)}.`,
        data: updated,
      };
    },
  },
  {
    id: "ketoan.dat_dinh_ky",
    title: "Đặt giao dịch định kỳ",
    description: "Tạo mẫu tự sinh chứng từ định kỳ (tiền thuê, lương, phí cố định...).",
    examples: ["Đặt chi tiền thuê 10 triệu mỗi tháng", "Định kỳ thu phí dịch vụ 2 triệu hàng tháng"],
    paramsSchema: z.object({
      ten: z.string(),
      loai: z.enum(["RECEIPT", "PAYMENT"]).describe("RECEIPT=thu, PAYMENT=chi"),
      tanSuat: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]).default("MONTHLY"),
      soTien: z.string(),
      taiKhoanDoiUng: z.string().describe("TK đối ứng (VD 642 thuê, 511 doanh thu)"),
      taiKhoanTien: z.string().default("111"),
      batDau: z.string().describe("Ngày chạy đầu tiên YYYY-MM-DD"),
      lyDo: z.string().optional(),
    }),
    kind: "write",
    handler: async (svc, ctx, p) => {
      const payload = p.loai === "RECEIPT"
        ? { counterAccountCode: p.taiKhoanDoiUng, cashAccountCode: p.taiKhoanTien ?? "111", amount: p.soTien, reason: p.lyDo }
        : { counterAccountCode: p.taiKhoanDoiUng, cashAccountCode: p.taiKhoanTien ?? "111", amount: p.soTien, reason: p.lyDo };
      const tpl = await svc.recurring.create(ctx, {
        name: p.ten,
        kind: p.loai,
        frequency: p.tanSuat,
        payload,
        startDate: p.batDau,
      });
      const tanMap: Record<string, string> = { DAILY: "hàng ngày", WEEKLY: "hàng tuần", MONTHLY: "hàng tháng", YEARLY: "hàng năm" };
      const tan = tanMap[p.tanSuat];
      return {
        ok: true,
        message: `Đã đặt lịch "${p.ten}": ${p.loai === "RECEIPT" ? "thu" : "chi"} ${Money.formatVND(p.soTien)} ${tan}, bắt đầu ${p.batDau}.`,
        data: tpl,
      };
    },
  },
  {
    id: "ketoan.chay_dinh_ky",
    title: "Chạy giao dịch định kỳ tới hạn",
    description: "Sinh chứng từ cho mọi mẫu định kỳ đã tới hạn (bắt kịp các kỳ bỏ lỡ).",
    examples: ["Chạy các giao dịch định kỳ tới hạn", "Sinh chứng từ định kỳ tháng này"],
    paramsSchema: z.object({ tinhDenNgay: z.string().optional() }),
    kind: "write",
    handler: async (svc, ctx, p) => {
      const result = await svc.recurring.runDue(ctx, p.tinhDenNgay);
      if (result.generated === 0) {
        return { ok: true, message: "Không có giao dịch định kỳ nào tới hạn.", data: result };
      }
      return {
        ok: true,
        message: `Đã sinh ${result.generated} chứng từ từ ${result.templates.length} mẫu định kỳ.`,
        data: result,
      };
    },
  },
  {
    id: "ketoan.dat_han_muc",
    title: "Đặt hạn mức tín dụng",
    description: "Đặt hạn mức công nợ + điều khoản thanh toán cho một khách hàng.",
    examples: ["Đặt hạn mức nợ khách An Phát 50 triệu", "Cho khách B nợ tối đa 20 triệu, 30 ngày"],
    paramsSchema: z.object({
      tenKhachHang: z.string(),
      hanMuc: z.string().describe("Hạn mức công nợ tối đa"),
      soNgayDuocNo: z.number().optional().describe("Điều khoản thanh toán (ngày)"),
    }),
    kind: "write",
    handler: async (svc, ctx, p) => {
      const contact = await svc.contacts.findByName(ctx, p.tenKhachHang);
      if (!contact) return { ok: false, message: `Không tìm thấy khách "${p.tenKhachHang}".`, error: "NOT_FOUND" };
      const updated = await svc.contacts.update(ctx, contact.id, {
        creditLimit: p.hanMuc,
        ...(p.soNgayDuocNo != null ? { paymentTermDays: p.soNgayDuocNo } : {}),
      });
      return {
        ok: true,
        message: `Đã đặt hạn mức tín dụng cho ${updated.name}: ${Money.formatVND(p.hanMuc)}${p.soNgayDuocNo ? `, điều khoản ${p.soNgayDuocNo} ngày` : ""}.`,
        data: updated,
      };
    },
  },
  {
    id: "ketoan.tao_bo_phan",
    title: "Tạo bộ phận / dự án",
    description: "Tạo chiều phân tích (bộ phận/dự án/chi nhánh) để gắn vào bút toán.",
    examples: ["Tạo bộ phận Kinh doanh", "Thêm dự án Website 2026"],
    paramsSchema: z.object({
      ten: z.string(),
      loai: z.enum(["DEPARTMENT", "PROJECT", "BRANCH", "PRODUCT", "OTHER"]).default("DEPARTMENT"),
      ma: z.string().optional(),
    }),
    kind: "write",
    handler: async (svc, ctx, p) => {
      const cc = await svc.dimensions.create(ctx, { name: p.ten, type: p.loai, code: p.ma });
      return { ok: true, message: `Đã tạo ${cc.code} — ${cc.name}.`, data: cc };
    },
  },
  {
    id: "ketoan.lai_lo_bo_phan",
    title: "Lãi lỗ theo bộ phận/dự án",
    description: "Báo cáo doanh thu, chi phí, lợi nhuận theo từng bộ phận/dự án.",
    examples: ["Lãi lỗ theo dự án năm nay", "Bộ phận nào lời nhất"],
    paramsSchema: z.object({ tuNgay: z.string().optional(), denNgay: z.string().optional() }),
    kind: "read",
    handler: async (svc, ctx, p) => {
      const r = await svc.dimensions.profitByCostCenter(ctx, p.tuNgay, p.denNgay);
      if (r.rows.length === 0) return { ok: true, message: "Chưa có phát sinh gắn bộ phận/dự án.", data: r };
      const top = r.rows[0]!;
      return {
        ok: true,
        message: `${r.rows.length} bộ phận/dự án. Cao nhất: ${top.name} lãi ${Money.formatVND(top.profit)}.`,
        data: r,
      };
    },
  },
  {
    id: "ketoan.doi_chieu_ngan_hang",
    title: "Đối chiếu ngân hàng",
    description: "Tự khớp sao kê đã nhập với sổ, áp quy tắc phân loại, rồi trả báo cáo đối chiếu.",
    examples: ["Đối chiếu ngân hàng tài khoản 112", "Khớp sao kê ngân hàng"],
    paramsSchema: z.object({ taiKhoan: z.string().default("112") }),
    kind: "write",
    handler: async (svc, ctx, p) => {
      const acc = p.taiKhoan ?? "112";
      const m = await svc.bank.autoMatch(ctx, acc);
      const r = await svc.bank.applyRules(ctx, acc);
      const report = await svc.bank.reconciliationReport(ctx, acc);
      return {
        ok: true,
        message: `Đối chiếu ${acc}: khớp tự động ${m.matched}, sinh theo quy tắc ${r.created}, còn ${report.unmatchedCount} dòng chưa khớp. ${report.reconciled ? "✓ Đã khớp hết." : ""}`,
        data: report,
      };
    },
  },
  {
    id: "ketoan.tao_tscd",
    title: "Tạo tài sản cố định",
    description: "Ghi nhận TSCĐ mới (nguyên giá, thời gian khấu hao). Tùy chọn ghi bút toán mua.",
    examples: ["Mua máy tính 30 triệu khấu hao 36 tháng", "Thêm TSCĐ xe tải 500 triệu 60 tháng"],
    paramsSchema: z.object({
      ten: z.string(),
      nguyenGia: z.string(),
      soThangKhauHao: z.number(),
      ngayBatDau: z.string(),
      giaTriThanhLy: z.string().optional(),
      muaTuTaiKhoan: z.string().optional().describe("TK nguồn mua (VD 112) để ghi bút toán mua"),
    }),
    kind: "write",
    handler: async (svc, ctx, p) => {
      const asset = await svc.assets.create(ctx, {
        name: p.ten,
        cost: p.nguyenGia,
        usefulLifeMonths: p.soThangKhauHao,
        startDate: p.ngayBatDau,
        salvageValue: p.giaTriThanhLy,
        acquireFromAccountCode: p.muaTuTaiKhoan,
      });
      return {
        ok: true,
        message: `Đã ghi nhận TSCĐ ${asset.code} — ${asset.name}: nguyên giá ${Money.formatVND(asset.cost)}, khấu hao ${p.soThangKhauHao} tháng.`,
        data: asset,
      };
    },
  },
  {
    id: "ketoan.chay_khau_hao",
    title: "Chạy khấu hao TSCĐ",
    description: "Ghi khấu hao cho mọi TSCĐ đến kỳ (bắt kịp các tháng chưa ghi). Nợ chi phí / Có 214.",
    examples: ["Chạy khấu hao tháng này", "Trích khấu hao đến tháng 6"],
    paramsSchema: z.object({ denNgay: z.string().optional() }),
    kind: "write",
    handler: async (svc, ctx, p) => {
      const r = await svc.assets.runDepreciation(ctx, p.denNgay);
      if (r.posted === 0) return { ok: true, message: "Không có khấu hao nào tới kỳ.", data: r };
      return { ok: true, message: `Đã ghi ${r.posted} kỳ khấu hao cho ${r.assets.length} tài sản.`, data: r };
    },
  },
  {
    id: "ketoan.dat_ngan_sach",
    title: "Đặt ngân sách",
    description: "Đặt dự toán ngân sách cả năm cho một tài khoản.",
    examples: ["Đặt ngân sách chi phí 642 năm 2026 là 500 triệu", "Ngân sách marketing 200tr"],
    paramsSchema: z.object({
      nam: z.string(),
      taiKhoan: z.string(),
      soTien: z.string(),
    }),
    kind: "write",
    handler: async (svc, ctx, p) => {
      const b = await svc.budget.setBudget(ctx, { fiscalYear: p.nam, accountCode: p.taiKhoan, amount: p.soTien });
      return { ok: true, message: `Đã đặt ngân sách TK ${p.taiKhoan} năm ${p.nam}: ${Money.formatVND(p.soTien)}.`, data: b };
    },
  },
  {
    id: "ketoan.ngan_sach_thuc_te",
    title: "Ngân sách vs thực tế",
    description: "So sánh dự toán với thực tế, cảnh báo tài khoản vượt/sắp vượt ngân sách.",
    examples: ["Ngân sách vs thực tế năm nay", "Khoản nào vượt ngân sách"],
    paramsSchema: z.object({ nam: z.string().optional() }),
    kind: "read",
    handler: async (svc, ctx, p) => {
      const year = p.nam ?? String(new Date().getFullYear());
      const r = await svc.budget.budgetVsActual(ctx, year);
      if (r.rows.length === 0) return { ok: true, message: `Chưa đặt ngân sách cho năm ${year}.`, data: r };
      const over = r.rows.filter((x) => x.overBudget);
      return {
        ok: true,
        message: `Ngân sách ${year}: tổng ${Money.formatVND(r.totalBudget)}, thực tế ${Money.formatVND(r.totalActual)}. ${over.length} khoản VƯỢT ngân sách.`,
        data: r,
      };
    },
  },
  {
    id: "ketoan.danh_gia_ty_gia",
    title: "Đánh giá lại tỷ giá",
    description: "Đánh giá lại số dư gốc ngoại tệ cuối kỳ, ghi lãi/lỗ tỷ giá (515/635).",
    examples: ["Đánh giá lại 131 số dư 1000 USD tỷ giá 24500", "Revalue công nợ USD cuối kỳ"],
    paramsSchema: z.object({
      taiKhoan: z.string(),
      ngoaiTe: z.string().default("USD"),
      soDuNgoaiTe: z.string(),
      tyGiaMoi: z.string(),
      ngay: z.string().optional(),
    }),
    kind: "write",
    handler: async (svc, ctx, p) => {
      const r = await svc.fx.revalue(ctx, {
        accountCode: p.taiKhoan,
        foreignCurrency: p.ngoaiTe,
        foreignAmount: p.soDuNgoaiTe,
        newRate: p.tyGiaMoi,
        revalDate: p.ngay,
      });
      const kq = r.result === "GAIN" ? "LÃI tỷ giá" : r.result === "LOSS" ? "LỖ tỷ giá" : "không chênh lệch";
      return {
        ok: true,
        message: `Đánh giá lại ${p.taiKhoan}: giá trị sổ ${Money.formatVND(r.bookValue)} → ${Money.formatVND(r.revaluedValue)}. ${kq} ${Money.formatVND(Money.abs(r.difference))}.`,
        data: r,
      };
    },
  },
];

/* ================================================================== */
/* REGISTRY API                                                        */
/* ================================================================== */

const BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));

/** Liệt kê metadata action (Tiểu Tâm nạp để biết gọi gì). */
/** Chuyển ZodObject → JSON Schema tối giản để LLM (Tiểu Tâm) biết tham số. */
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const def: any = (schema as any)._def;
  const unwrap = (s: any): any => {
    let cur = s;
    // Bóc default/optional/effects để lấy kiểu gốc.
    while (cur?._def?.innerType || cur?._def?.schema) {
      cur = cur._def.innerType ?? cur._def.schema;
    }
    return cur;
  };
  if (def?.typeName === "ZodObject") {
    const shape = def.shape();
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, val] of Object.entries<any>(shape)) {
      const inner = unwrap(val);
      const tn = inner?._def?.typeName;
      let type = "string";
      let extra: Record<string, unknown> = {};
      if (tn === "ZodNumber") type = "number";
      else if (tn === "ZodBoolean") type = "boolean";
      else if (tn === "ZodArray") type = "array";
      else if (tn === "ZodEnum") {
        type = "string";
        extra.enum = inner._def.values;
      }
      const desc = val?._def?.description ?? inner?._def?.description;
      if (desc) extra.description = desc;
      properties[key] = { type, ...extra };
      // required nếu không phải optional/default
      const isOptional = val?._def?.typeName === "ZodOptional" || val?._def?.typeName === "ZodDefault";
      if (!isOptional) required.push(key);
    }
    return { type: "object", properties, ...(required.length ? { required } : {}) };
  }
  return { type: "object", properties: {} };
}

export function listActions() {
  return ACTIONS.map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    examples: a.examples,
    kind: a.kind,
    parameters: zodToJsonSchema(a.paramsSchema),
  }));
}

/** Thực thi một action. Kiểm tra params bằng Zod trước khi chạy handler. */
export async function runAction(
  svc: KetoanServices,
  ctx: Ctx,
  actionId: string,
  rawParams: unknown,
): Promise<ActionResult> {
  const action = BY_ID.get(actionId);
  if (!action) {
    return {
      ok: false,
      message: `Không có action "${actionId}" trong Kế Toán 10A.`,
      error: "UNKNOWN_ACTION",
    };
  }

  const parsed = action.paramsSchema.safeParse(rawParams ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      message: `Tham số cho "${action.title}" chưa đúng: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
      error: "INVALID_PARAMS",
    };
  }

  try {
    return await action.handler(svc, ctx, parsed.data);
  } catch (err) {
    if (err instanceof KetoanError) {
      return { ok: false, message: err.message, error: err.code };
    }
    console.error(`[ketoan10a] action ${actionId} lỗi:`, err);
    return {
      ok: false,
      message: `Có lỗi khi thực hiện "${action.title}".`,
      error: "INTERNAL",
    };
  }
}
