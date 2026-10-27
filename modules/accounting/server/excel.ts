// excel.ts — Excel connect cho Kế Toán (V7A P4 — G7, spec §07).
// Export sổ sách .xlsx THẬT từ GL (một nguồn sự thật) + import hóa đơn validate TẠI CỬA (hiến pháp #4).
// Kèm export JSON machine-friendly — cầu nối cho AI làm việc trên bảng tính ("Claude trên Excel").
import * as XLSX from 'xlsx';
import { eq, and, gte, lte } from 'drizzle-orm';
import { accAccounts, accGlEntries, accInvoices, accVouchers } from './schema.js';
import { createInvoice } from './service.js';
import { trialBalance, profitLoss } from './reports.js';

type DB = any;
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const STATUS_VN: Record<string, string> = { unpaid: 'Chưa thu', partly_paid: 'Thu 1 phần', paid: 'Đã tất toán', cancelled: 'Đã hủy', posted: 'Đã ghi sổ' };

function toBuffer(aoa: (string | number)[][], sheetName: string): Uint8Array {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return new Uint8Array(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
}

/** Toàn bộ dòng GL trong kỳ — join tài khoản + chứng từ, LUÔN filter org (hiến pháp #1). */
export async function glExportRows(db: DB, orgId: string, from: string, to: string) {
  const rows = await db.select({
    voucherNo: accVouchers.voucherNo,
    postingDate: accGlEntries.postingDate,
    number: accAccounts.number, name: accAccounts.name,
    debit: accGlEntries.debit, credit: accGlEntries.credit,
    partyName: accGlEntries.partyName, remarks: accGlEntries.remarks,
    isCancel: accGlEntries.isCancel,
  }).from(accGlEntries)
    .innerJoin(accAccounts, eq(accGlEntries.accountId, accAccounts.id))
    .innerJoin(accVouchers, eq(accGlEntries.voucherId, accVouchers.id))
    .where(and(eq(accGlEntries.orgId, orgId), gte(accGlEntries.postingDate, from), lte(accGlEntries.postingDate, to)))
    .orderBy(accGlEntries.postingDate, accGlEntries.createdAt);
  return rows.map((r: any) => ({
    voucherNo: r.voucherNo, postingDate: r.postingDate,
    accountDebit: Number(r.debit) > 0 ? `${r.number} — ${r.name}` : '',
    accountCredit: Number(r.credit) > 0 ? `${r.number} — ${r.name}` : '',
    amount: Number(r.debit) > 0 ? Number(r.debit) : Number(r.credit),
    partyName: r.partyName ?? '', remarks: r.remarks ?? '', isCancel: r.isCancel,
  }));
}

/** Sổ cái GL → .xlsx (header tiếng Việt). */
export async function exportGeneralLedgerXlsx(db: DB, orgId: string, from: string, to: string): Promise<Uint8Array> {
  const rows = await glExportRows(db, orgId, from, to);
  const aoa: (string | number)[][] = [['Số CT', 'Ngày', 'TK Nợ', 'TK Có', 'Số tiền', 'Đối tác', 'Diễn giải']];
  for (const r of rows) aoa.push([r.voucherNo, r.postingDate, r.accountDebit, r.accountCredit, r.amount, r.partyName, r.remarks]);
  return toBuffer(aoa, 'So cai GL');
}

/** Sổ cái GL → JSON machine-friendly (cùng data với .xlsx) — cầu cho AI trên bảng tính. */
export async function exportGeneralLedgerJson(db: DB, orgId: string, from: string, to: string) {
  const rows = await glExportRows(db, orgId, from, to);
  const sumDebit = rows.reduce((s: number, r: any) => s + (r.accountDebit ? r.amount : 0), 0);
  const sumCredit = rows.reduce((s: number, r: any) => s + (r.accountCredit ? r.amount : 0), 0);
  return {
    columns: ['Số CT', 'Ngày', 'TK Nợ', 'TK Có', 'Số tiền', 'Đối tác', 'Diễn giải'],
    entries: rows, sumDebit, sumCredit, balanced: sumDebit === sumCredit, from, to,
  };
}

/** Danh sách hóa đơn → .xlsx. */
export async function exportInvoicesXlsx(db: DB, orgId: string): Promise<Uint8Array> {
  const invs = await db.select().from(accInvoices).where(eq(accInvoices.orgId, orgId)).orderBy(accInvoices.postingDate);
  const aoa: (string | number)[][] = [['Loại', 'Đối tác', 'Ngày', 'Tổng tiền', 'Còn nợ', 'Trạng thái']];
  for (const i of invs) aoa.push([i.invoiceType === 'sales' ? 'Bán' : 'Mua', i.partyName, i.postingDate, Number(i.grandTotal), Number(i.outstanding), STATUS_VN[i.status] ?? i.status]);
  return toBuffer(aoa, 'Hoa don');
}

/** Bảng cân đối thử → .xlsx. */
export async function exportTrialBalanceXlsx(db: DB, orgId: string, from: string, to: string): Promise<Uint8Array> {
  const tb = await trialBalance(db, orgId, from, to);
  const aoa: (string | number)[][] = [['Số TK', 'Tên tài khoản', 'Tổng Nợ', 'Tổng Có', 'Số dư', 'Bên']];
  for (const r of tb.rows) aoa.push([r.number, r.name, r.totalDebit, r.totalCredit, r.balance, r.balanceSide === 'debit' ? 'Nợ' : 'Có']);
  aoa.push(['TỔNG', tb.balanced ? 'SỔ CÂN (Σ Nợ = Σ Có)' : 'SỔ LỆCH', tb.sumDebit, tb.sumCredit, '', '']);
  return toBuffer(aoa, 'Can doi thu');
}

/** Báo cáo lãi lỗ → .xlsx. */
export async function exportProfitLossXlsx(db: DB, orgId: string, from: string, to: string): Promise<Uint8Array> {
  const pl = await profitLoss(db, orgId, from, to);
  const aoa: (string | number)[][] = [['Khoản mục', 'Số tiền (₫)']];
  aoa.push(['DOANH THU', pl.totalIncome]);
  for (const r of pl.income) aoa.push([`  ${r.number} — ${r.name}`, r.amount]);
  aoa.push(['CHI PHÍ', pl.totalExpense]);
  for (const r of pl.expense) aoa.push([`  ${r.number} — ${r.name}`, r.amount]);
  aoa.push(['LÃI RÒNG', pl.netProfit]);
  return toBuffer(aoa, 'Lai lo');
}

// ── Import hóa đơn từ Excel — validate TẠI CỬA từng dòng (hiến pháp #4) ──
// Cột: Loại (bán/mua) | Đối tác | Ngày | Diễn giải | Số lượng | Đơn giá | TK Chi phí (tuỳ chọn, HĐ mua)
export const IMPORT_COLUMNS = ['Loại', 'Đối tác', 'Ngày', 'Diễn giải', 'Số lượng', 'Đơn giá', 'TK Chi phí (tuỳ chọn)'];

function normDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(+v)) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) { // Excel serial date
    const d = new Date(Math.round((v - 25569) * 86400000));
    return isNaN(+d) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(v ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isNaN(+new Date(s)) ? null : s; // ISO — JS tự bắt 2026-02-31
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // DD/MM/YYYY kiểu VN
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return isNaN(+new Date(iso)) ? null : iso;
  }
  return null;
}

function normType(v: unknown): 'sales' | 'purchase' | null {
  const s = String(v ?? '').trim().toLowerCase();
  if (['bán', 'ban', 'sales', 'sale'].includes(s)) return 'sales';
  if (['mua', 'purchase', 'buy'].includes(s)) return 'purchase';
  return null;
}

/** File mẫu nhập hóa đơn — header chuẩn + 2 dòng ví dụ để user điền theo. */
export function importTemplateXlsx(): Uint8Array {
  const aoa: (string | number)[][] = [
    IMPORT_COLUMNS as unknown as string[],
    ['bán', 'Công ty ABC', '03/07/2026', 'Cà phê hạt rang 1kg', 2, 150000, ''],
    ['mua', 'Nhà cung cấp XYZ', '03/07/2026', 'Sữa đặc nguyên liệu', 10, 25000, '642'],
  ];
  return toBuffer(aoa, 'Mau nhap hoa don');
}

export interface ImportResult {
  created: any[];
  errors: string[]; // tiếng Việt, kèm số dòng Excel
}

/** Parse + validate + tạo hóa đơn qua service hiện có (postGL tự động, Σ Nợ = Σ Có).
 *  Dòng lỗi → báo đúng số dòng, KHÔNG tạo gì; dòng hợp lệ → tạo invoice bình thường. */
export async function importInvoicesXlsx(db: DB, orgId: string, buf: Uint8Array | Buffer): Promise<ImportResult> {
  let raw: any[][];
  try {
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return { created: [], errors: ['File Excel không có sheet nào'] };
    raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) as any[][];
  } catch {
    return { created: [], errors: ['File không phải Excel hợp lệ (.xlsx)'] };
  }
  if (raw.length < 2) return { created: [], errors: ['File không có dòng dữ liệu nào (cần header + tối thiểu 1 dòng)'] };

  // TK tồn tại — validate tại cửa trước khi đụng dòng nào
  const accts = await db.select().from(accAccounts).where(eq(accAccounts.orgId, orgId));
  if (!accts.length) return { created: [], errors: ['Chưa khởi tạo hệ thống tài khoản — mở trang Kế Toán để seed chart trước khi nhập'] };
  const numbers = new Set(accts.map((a: any) => a.number));
  const errors: string[] = [];
  const candidates: { row: number; invoiceType: 'sales' | 'purchase'; partyName: string; postingDate: string; description: string; qty: number; rate: number; expenseAccount?: string }[] = [];

  for (let i = 1; i < raw.length; i++) {
    const rowNo = i + 1; // số dòng Excel (header = dòng 1)
    const r = raw[i] ?? [];
    if (r.every((c: any) => String(c ?? '').trim() === '')) continue; // dòng trống → bỏ qua
    const rowErrs: string[] = [];
    const invoiceType = normType(r[0]);
    if (!invoiceType) rowErrs.push(`Dòng ${rowNo}: Loại không hợp lệ — chỉ nhận "bán" hoặc "mua"`);
    const partyName = String(r[1] ?? '').trim();
    if (!partyName) rowErrs.push(`Dòng ${rowNo}: Thiếu tên đối tác (bắt buộc)`);
    const postingDate = normDate(r[2]);
    if (!postingDate) rowErrs.push(`Dòng ${rowNo}: Ngày không hợp lệ — dùng YYYY-MM-DD hoặc DD/MM/YYYY`);
    const qty = Number(r[4]), rate = Number(r[5]);
    if (!Number.isFinite(qty) || qty <= 0) rowErrs.push(`Dòng ${rowNo}: Số lượng phải là số > 0`);
    if (!Number.isFinite(rate) || rate <= 0) rowErrs.push(`Dòng ${rowNo}: Đơn giá phải là số > 0`);
    const expenseAccount = String(r[6] ?? '').trim() || undefined;
    if (invoiceType) {
      const need = invoiceType === 'sales' ? ['131', '511'] : ['331', expenseAccount ?? '642'];
      for (const n of need) if (!numbers.has(n)) rowErrs.push(`Dòng ${rowNo}: Tài khoản ${n} không tồn tại trong hệ thống`);
    }
    if (rowErrs.length) { errors.push(...rowErrs); continue; }
    candidates.push({
      row: rowNo, invoiceType: invoiceType!, partyName, postingDate: postingDate!,
      description: String(r[3] ?? '').trim() || 'Hàng hóa/dịch vụ', qty, rate: Math.round(rate), expenseAccount,
    });
  }

  const created: any[] = [];
  for (const cd of candidates) {
    try {
      const inv = await createInvoice(db, orgId, {
        invoiceType: cd.invoiceType, partyName: cd.partyName, postingDate: cd.postingDate,
        lines: [{ description: cd.description, qty: cd.qty, rate: cd.rate }],
        expenseAccount: cd.expenseAccount,
      });
      created.push(inv);
    } catch (e: any) {
      errors.push(`Dòng ${cd.row}: ${e?.message ?? 'Lỗi tạo hóa đơn'}`);
    }
  }
  return { created, errors };
}
