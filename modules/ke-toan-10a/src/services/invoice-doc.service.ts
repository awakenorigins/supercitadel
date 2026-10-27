// Xuất chứng từ hoá đơn ra file: HTML in được (Lưu thành PDF) + Excel (.xlsx) 1 hoá đơn.
// Không cần lib PDF nặng — HTML in chuẩn A4, người dùng bấm "Lưu PDF" từ trình duyệt hoặc tải trực tiếp.
import * as XLSX from "xlsx";
import { and, eq } from "drizzle-orm";
import type { Database } from "../lib/db.js";
import type { Ctx } from "../lib/context.js";
import * as Money from "../lib/money.js";
import { invoices, bills } from "../schema/documents.js";
import { contacts } from "../schema/contacts.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export class InvoiceDocService {
  constructor(private readonly db: Database) {}

  private async load(ctx: Ctx, key: string) {
    // HDM-* = hoá đơn mua (bills); HD-* = hoá đơn bán (invoices). Thử cả 2 bảng theo docNo; chỉ tra theo id khi key là uuid hợp lệ (tránh crash).
    const isBill = /^HDM/i.test(key);
    const table: any = isBill ? bills : invoices;
    const kind: 'ban' | 'mua' = isBill ? 'mua' : 'ban';
    let [invoice] = await this.db.select().from(table).where(and(eq(table.orgId, ctx.orgId), eq(table.docNo, key))).limit(1);
    // fallback: nếu không thấy ở bảng đoán, thử bảng còn lại theo docNo
    if (!invoice) {
      const other: any = isBill ? invoices : bills;
      const [alt] = await this.db.select().from(other).where(and(eq(other.orgId, ctx.orgId), eq(other.docNo, key))).limit(1);
      if (alt) return this.buildFrom(ctx, alt, /^HDM/i.test(alt.docNo) ? 'mua' : 'ban');
    }
    if (!invoice && UUID_RE.test(key)) {
      const [byId] = await this.db.select().from(table).where(and(eq(table.orgId, ctx.orgId), eq(table.id, key))).limit(1);
      invoice = byId;
    }
    if (!invoice) throw new Error("Không tìm thấy chứng từ " + key);
    return this.buildFrom(ctx, invoice, kind);
  }

  private async buildFrom(ctx: Ctx, invoice: any, kind: 'ban' | 'mua') {
    let contact: any = null;
    if (invoice.contactId) {
      const [ct] = await this.db.select().from(contacts).where(and(eq(contacts.orgId, ctx.orgId), eq(contacts.id, invoice.contactId))).limit(1);
      contact = ct ?? null;
    }
    const lines: Array<{ description: string; qty: number; rate: string; amount: string }> =
      Array.isArray((invoice as any).lines) ? (invoice as any).lines : [];
    return { invoice, contact, lines, kind };
  }

  /** HTML hoá đơn A4, in đẹp — trình duyệt/Telegram xem trực tiếp, bấm in → Lưu PDF. */
  async html(ctx: Ctx, key: string): Promise<{ html: string; docNo: string }> {
    const { invoice, contact, lines, kind } = await this.load(ctx, key);
    const title = kind === 'mua' ? 'HOÁ ĐƠN MUA HÀNG' : 'HOÁ ĐƠN BÁN HÀNG';
    const partyLabel = kind === 'mua' ? 'Nhà cung cấp' : 'Khách hàng';
    const rows = lines.length
      ? lines.map((l, i) => `<tr><td class="c">${i + 1}</td><td>${esc(l.description)}</td><td class="r">${esc(l.qty)}</td><td class="r">${Money.formatVND(l.rate)}</td><td class="r">${Money.formatVND(l.amount)}</td></tr>`).join("")
      : `<tr><td class="c">1</td><td>${esc(invoice.description || "Hàng hoá / dịch vụ")}</td><td class="r">1</td><td class="r">${Money.formatVND(invoice.subtotal)}</td><td class="r">${Money.formatVND(invoice.subtotal)}</td></tr>`;
    const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hoá đơn ${esc(invoice.docNo)}</title>
<style>
*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,'Noto Sans','Liberation Sans',sans-serif;color:#1a1a1a;margin:0;padding:24px;background:#f4f4f5}
.sheet{max-width:760px;margin:0 auto;background:#fff;padding:40px 44px;border-radius:12px;box-shadow:0 1px 8px rgba(0,0,0,.08)}
.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #14a37f;padding-bottom:18px;margin-bottom:22px}
h1{font-size:26px;margin:0;color:#0f766e;letter-spacing:.5px}.sub{color:#666;font-size:12.5px;margin-top:4px}
.meta{text-align:right;font-size:13px;line-height:1.7}.meta b{color:#0f766e}
.party{display:flex;gap:32px;margin-bottom:20px}.party>div{flex:1}
.lbl{font-size:10.5px;text-transform:uppercase;letter-spacing:.09em;color:#999;margin-bottom:4px}
.pv{font-size:14px;font-weight:600}
table{width:100%;border-collapse:collapse;margin:6px 0 14px;font-size:13px}
th{background:#0f766e;color:#fff;padding:9px 10px;text-align:left;font-weight:600}
td{padding:9px 10px;border-bottom:1px solid #eee}.r{text-align:right}.c{text-align:center;width:38px}
.tot{margin-left:auto;width:280px;font-size:13.5px}
.tot .row{display:flex;justify-content:space-between;padding:6px 2px}
.tot .grand{border-top:2px solid #0f766e;margin-top:5px;padding-top:9px;font-size:17px;font-weight:800;color:#0f766e}
.badge{display:inline-block;padding:3px 12px;border-radius:99px;font-size:11.5px;font-weight:700}
.POSTED{background:#dcfce7;color:#15803d}.DRAFT{background:#fef3c7;color:#a16207}.VOID{background:#fee2e2;color:#b91c1c}
.foot{margin-top:34px;display:flex;justify-content:space-between;font-size:12px;color:#666}
@media print{body{background:#fff;padding:0}.sheet{box-shadow:none;border-radius:0;max-width:none}.noprint{display:none}}
.noprint{text-align:center;margin:18px auto 0;max-width:760px}
.pbtn{background:#0f766e;color:#fff;border:none;padding:11px 22px;border-radius:9px;font-size:14px;font-weight:600;cursor:pointer}
</style></head><body>
<div class="sheet">
  <div class="top">
    <div><h1>${title}</h1><div class="sub">Số: <b>${esc(invoice.docNo)}</b></div></div>
    <div class="meta"><div>Ngày: <b>${esc(invoice.docDate)}</b></div>${invoice.dueDate ? `<div>Hạn TT: ${esc(invoice.dueDate)}</div>` : ""}<div style="margin-top:6px"><span class="badge ${esc(invoice.status)}">${esc(invoice.status)}</span></div></div>
  </div>
  <div class="party">
    <div><div class="lbl">${partyLabel}</div><div class="pv">${esc(contact?.name || "—")}</div>${contact?.taxCode ? `<div class="sub">MST: ${esc(contact.taxCode)}</div>` : ""}${contact?.phone ? `<div class="sub">ĐT: ${esc(contact.phone)}</div>` : ""}</div>
    <div><div class="lbl">Diễn giải</div><div class="pv" style="font-weight:400;font-size:13px">${esc(invoice.description || "—")}</div></div>
  </div>
  <table><thead><tr><th class="c">#</th><th>Nội dung</th><th class="r">SL</th><th class="r">Đơn giá</th><th class="r">Thành tiền</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="tot">
    <div class="row"><span>Tiền hàng</span><span>${Money.formatVND(invoice.subtotal)}</span></div>
    <div class="row"><span>Thuế GTGT (${esc(invoice.taxRate)}%)</span><span>${Money.formatVND(invoice.taxAmount)}</span></div>
    <div class="row grand"><span>TỔNG CỘNG</span><span>${Money.formatVND(invoice.total)}</span></div>
    <div class="row"><span>Đã thanh toán</span><span>${Money.formatVND(invoice.amountPaid)}</span></div>
  </div>
  <div class="foot"><div>Người mua hàng<br><br><i>(Ký, ghi rõ họ tên)</i></div><div style="text-align:right">Người bán hàng<br><br><i>(Ký, ghi rõ họ tên)</i></div></div>
</div>
<div class="noprint"><button class="pbtn" onclick="window.print()">🖨️ In / Lưu thành PDF</button></div>
</body></html>`;
    return { html, docNo: invoice.docNo };
  }

  /** Excel 1 hoá đơn — 2 sheet: Thông tin + Chi tiết dòng. */
  async xlsx(ctx: Ctx, key: string): Promise<{ bytes: Uint8Array; docNo: string }> {
    const { invoice, contact, lines, kind } = await this.load(ctx, key);
    const wb = XLSX.utils.book_new();
    const info = [
      [kind === 'mua' ? "HOÁ ĐƠN MUA HÀNG" : "HOÁ ĐƠN BÁN HÀNG"],
      ["Số hoá đơn", invoice.docNo],
      ["Ngày", invoice.docDate],
      ["Hạn thanh toán", invoice.dueDate ?? ""],
      [kind === 'mua' ? "Nhà cung cấp" : "Khách hàng", contact?.name ?? ""],
      ["Mã số thuế", contact?.taxCode ?? ""],
      ["Diễn giải", invoice.description ?? ""],
      ["Tiền hàng", Number(invoice.subtotal)],
      ["Thuế suất (%)", Number(invoice.taxRate)],
      ["Tiền thuế", Number(invoice.taxAmount)],
      ["Tổng cộng", Number(invoice.total)],
      ["Đã thanh toán", Number(invoice.amountPaid)],
      ["Trạng thái", invoice.status],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(info), "Thông tin");
    const det = [["#", "Nội dung", "SL", "Đơn giá", "Thành tiền"]];
    if (lines.length) lines.forEach((l, i) => det.push([String(i + 1), l.description, String(l.qty), String(l.rate), String(l.amount)]));
    else det.push(["1", invoice.description || "Hàng hoá / dịch vụ", "1", String(invoice.subtotal), String(invoice.subtotal)]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(det), "Chi tiết");
    const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    return { bytes: new Uint8Array(bytes), docNo: invoice.docNo };
  }
}
