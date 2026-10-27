import * as XLSX from "xlsx";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import type { Database } from "../lib/db.js";
import type { Ctx } from "../lib/context.js";
import * as Money from "../lib/money.js";
import { accounts } from "../schema/accounts.js";
import { journalEntries, journalLines } from "../schema/journals.js";
import { invoices } from "../schema/documents.js";
import { ReportsService } from "./reports.service.js";
import { ValidationError } from "../lib/errors.js";

export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type Row = (string | number)[];

function toBuffer(aoa: Row[], sheetName: string): Uint8Array {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return new Uint8Array(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
}

const STATUS_VN: Record<string, string> = {
  DRAFT: "Nháp",
  POSTED: "Đã ghi sổ",
  VOIDED: "Đã hủy",
};

/**
 * ExcelService — cầu nối Excel (tinh hoa chắt từ accpro).
 * Xuất sổ sách .xlsx THẬT từ sổ cái (một nguồn sự thật) + nhập hoá đơn
 * validate TỪNG DÒNG (lỗi bất kỳ dòng nào → không ghi gì).
 */
export class ExcelService {
  private reports: ReportsService;
  constructor(private readonly db: Database) {
    this.reports = new ReportsService(db);
  }

  /** Sổ cái toàn bộ trong kỳ → .xlsx. */
  async exportGeneralLedger(
    ctx: Ctx,
    from = "1970-01-01",
    to = new Date().toISOString().slice(0, 10),
  ): Promise<Uint8Array> {
    const rows = await this.db
      .select({
        entryNo: journalEntries.entryNo,
        date: journalEntries.entryDate,
        code: accounts.code,
        name: accounts.name,
        debit: journalLines.debit,
        credit: journalLines.credit,
        memo: journalLines.memo,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
      .where(
        and(
          eq(journalLines.orgId, ctx.orgId),
          eq(journalEntries.status, "POSTED"),
          gte(journalEntries.entryDate, from),
          lte(journalEntries.entryDate, to),
        ),
      )
      .orderBy(asc(journalEntries.entryDate), asc(journalEntries.entryNo));

    const aoa: Row[] = [
      ["Số BT", "Ngày", "TK", "Tên TK", "Nợ", "Có", "Diễn giải"],
    ];
    for (const r of rows) {
      aoa.push([
        r.entryNo,
        r.date,
        r.code,
        r.name,
        Number(r.debit) > 0 ? Number(r.debit) : "",
        Number(r.credit) > 0 ? Number(r.credit) : "",
        r.memo ?? "",
      ]);
    }
    return toBuffer(aoa, "So cai GL");
  }

  /** Bảng cân đối số phát sinh → .xlsx. */
  async exportTrialBalance(ctx: Ctx, from?: string, to?: string): Promise<Uint8Array> {
    const tb = await this.reports.trialBalance(ctx, from, to);
    const aoa: Row[] = [["Mã TK", "Tên tài khoản", "Loại", "Nợ", "Có"]];
    for (const r of tb.rows) {
      aoa.push([r.code, r.name, r.type, Number(r.debit), Number(r.credit)]);
    }
    aoa.push(["", "TỔNG CỘNG", "", Number(tb.totalDebit), Number(tb.totalCredit)]);
    return toBuffer(aoa, "Can doi phat sinh");
  }

  /** Báo cáo kết quả kinh doanh → .xlsx. */
  async exportProfitLoss(ctx: Ctx, from?: string, to?: string): Promise<Uint8Array> {
    const pnl = await this.reports.profitAndLoss(ctx, from, to);
    const aoa: Row[] = [["Khoản mục", "Tài khoản", "Số tiền"]];
    aoa.push(["DOANH THU", "", ""]);
    for (const i of pnl.income) aoa.push([i.name, i.code, Number(i.amount)]);
    aoa.push(["Tổng doanh thu", "", Number(pnl.totalIncome)]);
    aoa.push(["CHI PHÍ", "", ""]);
    for (const e of pnl.expense) aoa.push([e.name, e.code, Number(e.amount)]);
    aoa.push(["Tổng chi phí", "", Number(pnl.totalExpense)]);
    aoa.push(["LỢI NHUẬN", "", Number(pnl.netProfit)]);
    return toBuffer(aoa, "Ket qua kinh doanh");
  }

  /** Danh sách hoá đơn bán → .xlsx. */
  async exportInvoices(ctx: Ctx): Promise<Uint8Array> {
    const rows = await this.db
      .select()
      .from(invoices)
      .where(eq(invoices.orgId, ctx.orgId))
      .orderBy(asc(invoices.docDate));
    const aoa: Row[] = [
      ["Số HĐ", "Ngày", "Tiền hàng", "Thuế", "Tổng", "Đã thu", "Còn nợ", "Trạng thái"],
    ];
    for (const i of rows) {
      aoa.push([
        i.docNo,
        i.docDate,
        Number(i.subtotal),
        Number(i.taxAmount),
        Number(i.total),
        Number(i.amountPaid),
        Number(Money.sub(i.total, i.amountPaid)),
        STATUS_VN[i.status] ?? i.status,
      ]);
    }
    return toBuffer(aoa, "Hoa don ban");
  }

  /** File mẫu nhập hoá đơn. */
  importTemplate(): Uint8Array {
    const aoa: Row[] = [
      ["Loại", "Tên khách hàng", "Ngày", "Diễn giải", "Số lượng", "Đơn giá", "Thuế suất %"],
      ["bán", "Công ty ABC", "2026-07-04", "Cà phê hạt 1kg", 2, 150000, 8],
      ["bán", "Cửa hàng XYZ", "2026-07-04", "Sữa đặc", 10, 25000, 8],
    ];
    return toBuffer(aoa, "Mau nhap hoa don");
  }

  /**
   * Nhập hoá đơn bán từ Excel. Validate TỪNG DÒNG; lỗi bất kỳ → không tạo gì,
   * trả danh sách lỗi kèm số dòng. Trả về danh sách bản ghi hợp lệ để service
   * gọi tạo (tách riêng để dễ test và tránh phụ thuộc vòng).
   */
  parseInvoiceImport(buf: Uint8Array | Buffer): {
    rows: Array<{
      customerName: string;
      docDate: string;
      description: string;
      qty: number;
      rate: string;
      taxRate: string;
    }>;
    errors: string[];
  } {
    let raw: any[][];
    try {
      const wb = XLSX.read(buf, { type: "buffer" });
      const first = wb.SheetNames[0];
      const ws = first ? wb.Sheets[first] : undefined;
      if (!ws) return { rows: [], errors: ["File Excel không có sheet nào"] };
      raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" }) as any[][];
    } catch {
      return { rows: [], errors: ["File không phải Excel hợp lệ (.xlsx)"] };
    }
    if (raw.length < 2) {
      return { rows: [], errors: ["File không có dòng dữ liệu (cần header + ≥1 dòng)"] };
    }

    const normDate = (v: any): string | null => {
      const s = String(v ?? "").trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
      return null;
    };

    const errors: string[] = [];
    const rows: Array<{
      customerName: string;
      docDate: string;
      description: string;
      qty: number;
      rate: string;
      taxRate: string;
    }> = [];

    for (let i = 1; i < raw.length; i++) {
      const rowNo = i + 1;
      const r = raw[i] ?? [];
      if (r.every((c: any) => String(c ?? "").trim() === "")) continue;
      const party = String(r[1] ?? "").trim();
      const date = normDate(r[2]);
      const desc = String(r[3] ?? "").trim();
      const qty = Number(r[4]);
      const rate = Math.round(Number(r[5]));
      const taxRate = String(r[6] ?? "0").trim() || "0";
      const errs: string[] = [];
      if (!party) errs.push("thiếu Tên khách hàng");
      if (!date) errs.push("Ngày sai định dạng (YYYY-MM-DD hoặc DD/MM/YYYY)");
      if (!(qty > 0)) errs.push("Số lượng phải > 0");
      if (!(rate >= 0)) errs.push("Đơn giá không hợp lệ");
      if (errs.length) {
        errors.push(`Dòng ${rowNo}: ${errs.join("; ")}`);
        continue;
      }
      rows.push({
        customerName: party,
        docDate: date!,
        description: desc || "Hàng hóa/dịch vụ",
        qty,
        rate: String(rate),
        taxRate,
      });
    }
    if (errors.length) return { rows: [], errors };
    if (rows.length === 0) throw new ValidationError("Không có dòng hợp lệ để nhập");
    return { rows, errors: [] };
  }
}
