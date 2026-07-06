// Accounting service — fork domain model ERPNext Accounts (Account, GL Entry, Journal/Payment/Invoice).
// Quy tắc vàng (port từ journal_entry.py + general_ledger.py):
//   (1) mỗi dòng GL chỉ Nợ HOẶC Có, không âm; (2) Σ Nợ = Σ Có mỗi chứng từ;
//   (3) GL đã post bất biến — hủy chứng từ = bút toán đảo (is_cancel), không xóa/sửa.
import { eq, and, sql, desc } from 'drizzle-orm';
import { accAccounts, accVouchers, accGlEntries, accInvoices, accPayments } from './schema.js';
import { Errors, emitEvent } from '@citadel/core';
type DB = any;

// ── Chart of Accounts chuẩn VN-SME (TT133 rút gọn) ──
export const CHART_VN: { number: string; name: string; rootType: string; parent?: string; isGroup?: boolean }[] = [
  { number: '1', name: 'Tài sản', rootType: 'asset', isGroup: true },
  { number: '111', name: 'Tiền mặt', rootType: 'asset', parent: '1' },
  { number: '112', name: 'Tiền gửi ngân hàng', rootType: 'asset', parent: '1' },
  { number: '131', name: 'Phải thu khách hàng', rootType: 'asset', parent: '1' },
  { number: '152', name: 'Hàng tồn kho', rootType: 'asset', parent: '1' },
  { number: '3', name: 'Nợ phải trả', rootType: 'liability', isGroup: true },
  { number: '331', name: 'Phải trả nhà cung cấp', rootType: 'liability', parent: '3' },
  { number: '4', name: 'Vốn chủ sở hữu', rootType: 'equity', isGroup: true },
  { number: '411', name: 'Vốn góp', rootType: 'equity', parent: '4' },
  { number: '5', name: 'Doanh thu', rootType: 'income', isGroup: true },
  { number: '511', name: 'Doanh thu bán hàng', rootType: 'income', parent: '5' },
  { number: '6', name: 'Chi phí', rootType: 'expense', isGroup: true },
  { number: '632', name: 'Giá vốn hàng bán', rootType: 'expense', parent: '6' },
  { number: '642', name: 'Chi phí quản lý & vận hành', rootType: 'expense', parent: '6' },
];

export async function seedChart(db: DB, orgId: string) {
  const existing = await db.select().from(accAccounts).where(eq(accAccounts.orgId, orgId));
  if (existing.length) return existing;
  const byNumber = new Map<string, string>();
  for (const a of CHART_VN) {
    const [row] = await db.insert(accAccounts).values({
      orgId, number: a.number, name: a.name, rootType: a.rootType,
      isGroup: a.isGroup ?? false, parentId: a.parent ? byNumber.get(a.parent) : null,
    }).returning();
    byNumber.set(a.number, row.id);
  }
  return db.select().from(accAccounts).where(eq(accAccounts.orgId, orgId));
}
export async function listAccounts(db: DB, orgId: string) {
  return db.select().from(accAccounts).where(eq(accAccounts.orgId, orgId)).orderBy(accAccounts.number);
}
export async function accountByNumber(db: DB, orgId: string, number: string) {
  const [a] = await db.select().from(accAccounts)
    .where(and(eq(accAccounts.orgId, orgId), eq(accAccounts.number, number)));
  if (!a) throw Errors.notFound(`Không có tài khoản ${number} — chạy seed chart trước`);
  return a;
}

// ── Voucher numbering: JV-0001 / INV-0001 / PAY-0001 per org ──
const PREFIX: Record<string, string> = { journal: 'JV', invoice: 'INV', payment: 'PAY' };
async function nextVoucherNo(db: DB, orgId: string, voucherType: string) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(accVouchers)
    .where(and(eq(accVouchers.orgId, orgId), eq(accVouchers.voucherType, voucherType)));
  return `${PREFIX[voucherType]}-${String(n + 1).padStart(4, '0')}`;
}

export interface GlLine { accountId: string; debit?: number; credit?: number; partyType?: string; partyName?: string; remarks?: string }

/** Core posting engine — validate + tạo voucher + GL entries trong 1 transaction. */
export async function postGL(db: DB, orgId: string, d: {
  voucherType: 'journal' | 'invoice' | 'payment'; postingDate: string; remarks?: string; lines: GlLine[]; isCancel?: boolean; voucherNo?: string;
}) {
  if (!d.lines?.length || d.lines.length < 2) throw Errors.validation('Chứng từ cần tối thiểu 2 dòng (Nợ + Có)', 'lines');
  let totalD = 0, totalC = 0;
  for (const l of d.lines) {
    const debit = Math.round(l.debit ?? 0), credit = Math.round(l.credit ?? 0);
    if (debit < 0 || credit < 0) throw Errors.validation('Số tiền không được âm', 'lines');
    if (debit > 0 && credit > 0) throw Errors.validation('Mỗi dòng chỉ Nợ HOẶC Có', 'lines');
    if (debit === 0 && credit === 0) throw Errors.validation('Dòng trống (Nợ=Có=0)', 'lines');
    totalD += debit; totalC += credit;
  }
  if (totalD !== totalC) throw Errors.validation(`Tổng Nợ (${totalD.toLocaleString('vi')}) ≠ Tổng Có (${totalC.toLocaleString('vi')})`, 'lines');
  // account thuộc org + không phải nhóm
  const ids = [...new Set(d.lines.map((l) => l.accountId))];
  const accts = await db.select().from(accAccounts).where(and(eq(accAccounts.orgId, orgId)));
  const map = new Map(accts.map((a: any) => [a.id, a]));
  for (const id of ids) {
    const a: any = map.get(id);
    if (!a) throw Errors.notFound('Tài khoản không thuộc tổ chức');
    if (a.isGroup) throw Errors.validation(`Không hạch toán vào tài khoản nhóm "${a.name}"`);
  }
  return db.transaction(async (tx: DB) => {
    const voucherNo = d.voucherNo ?? await nextVoucherNo(tx, orgId, d.voucherType);
    const [voucher] = await tx.insert(accVouchers).values({
      orgId, voucherType: d.voucherType, voucherNo, postingDate: d.postingDate,
      remarks: d.remarks, total: String(totalD),
    }).returning();
    for (const l of d.lines) {
      await tx.insert(accGlEntries).values({
        orgId, postingDate: d.postingDate, accountId: l.accountId,
        debit: String(Math.round(l.debit ?? 0)), credit: String(Math.round(l.credit ?? 0)),
        partyType: l.partyType, partyName: l.partyName, voucherId: voucher.id,
        remarks: l.remarks ?? d.remarks, isCancel: d.isCancel ?? false,
      });
    }
    return voucher;
  });
}

/** Bút toán tay. lines dùng accountNumber cho tiện API. */
export async function createJournal(db: DB, orgId: string, d: { postingDate: string; remarks?: string; lines: { accountNumber: string; debit?: number; credit?: number; partyName?: string }[] }) {
  const lines: GlLine[] = [];
  for (const l of d.lines ?? []) {
    const a = await accountByNumber(db, orgId, l.accountNumber);
    lines.push({ accountId: a.id, debit: l.debit, credit: l.credit, partyName: l.partyName });
  }
  return postGL(db, orgId, { voucherType: 'journal', postingDate: d.postingDate, remarks: d.remarks, lines });
}

// ── Invoice: sales → Nợ 131 / Có 511 · purchase → Nợ 642 / Có 331 ──
export interface InvoiceLine { description: string; qty: number; rate: number }
export async function createInvoice(db: DB, orgId: string, d: { invoiceType: 'sales' | 'purchase'; partyName: string; postingDate: string; dueDate?: string; lines: InvoiceLine[]; expenseAccount?: string }) {
  if (!d.partyName?.trim()) throw Errors.validation('Thiếu tên đối tác', 'partyName');
  if (!d.lines?.length) throw Errors.validation('Hóa đơn cần ít nhất 1 dòng', 'lines');
  const lines = d.lines.map((l) => {
    const qty = Number(l.qty), rate = Math.round(Number(l.rate));
    if (!(qty > 0) || !(rate >= 0)) throw Errors.validation('Dòng hóa đơn không hợp lệ (qty>0, rate>=0)', 'lines');
    return { description: String(l.description ?? '').trim() || 'Hàng hóa/dịch vụ', qty, rate, amount: Math.round(qty * rate) };
  });
  const grand = lines.reduce((s, l) => s + l.amount, 0);
  if (grand <= 0) throw Errors.validation('Tổng hóa đơn phải > 0');
  const partyType = d.invoiceType === 'sales' ? 'customer' : 'supplier';
  const recv = await accountByNumber(db, orgId, d.invoiceType === 'sales' ? '131' : '331');
  const pnl = await accountByNumber(db, orgId, d.invoiceType === 'sales' ? '511' : (d.expenseAccount ?? '642'));
  const glLines: GlLine[] = d.invoiceType === 'sales'
    ? [{ accountId: recv.id, debit: grand, partyType, partyName: d.partyName }, { accountId: pnl.id, credit: grand }]
    : [{ accountId: pnl.id, debit: grand }, { accountId: recv.id, credit: grand, partyType, partyName: d.partyName }];
  return db.transaction(async (tx: DB) => {
    const voucher = await postGL(tx, orgId, { voucherType: 'invoice', postingDate: d.postingDate, remarks: `HĐ ${d.invoiceType === 'sales' ? 'bán' : 'mua'} — ${d.partyName}`, lines: glLines });
    const [inv] = await tx.insert(accInvoices).values({
      orgId, invoiceType: d.invoiceType, partyName: d.partyName.trim(), postingDate: d.postingDate,
      dueDate: d.dueDate, lines, grandTotal: String(grand), outstanding: String(grand), voucherId: voucher.id,
    }).returning();
    await emitEvent(tx, { orgId, topic: 'accounting.invoice.created', payload: { id: inv.id, invoiceType: inv.invoiceType, partyName: inv.partyName, grandTotal: inv.grandTotal } });
    return inv;
  });
}
export async function listInvoices(db: DB, orgId: string, invoiceType?: string) {
  const conds = [eq(accInvoices.orgId, orgId)];
  if (invoiceType) conds.push(eq(accInvoices.invoiceType, invoiceType));
  return db.select().from(accInvoices).where(and(...conds)).orderBy(desc(accInvoices.createdAt));
}

// ── Payment: receive → Nợ quỹ / Có 131 (+knock-off HĐ) · pay → Nợ 331 / Có quỹ ──
export async function createPayment(db: DB, orgId: string, d: { paymentType: 'receive' | 'pay'; partyName: string; amount: number; cashAccount?: string; invoiceId?: string; postingDate: string; remarks?: string }) {
  const amount = Math.round(Number(d.amount));
  if (!(amount > 0)) throw Errors.validation('Số tiền phải > 0', 'amount');
  if (!d.partyName?.trim()) throw Errors.validation('Thiếu tên đối tác', 'partyName');
  let invoice: any = null;
  if (d.invoiceId) {
    [invoice] = await db.select().from(accInvoices).where(and(eq(accInvoices.id, d.invoiceId), eq(accInvoices.orgId, orgId)));
    if (!invoice) throw Errors.notFound('Không tìm thấy hóa đơn');
    if (invoice.status === 'cancelled') throw Errors.conflict('Hóa đơn đã hủy');
    if (amount > Number(invoice.outstanding)) throw Errors.conflict(`Thu/chi (${amount.toLocaleString('vi')}) vượt công nợ còn lại (${Number(invoice.outstanding).toLocaleString('vi')})`);
  }
  const cash = await accountByNumber(db, orgId, d.cashAccount ?? '111');
  if (!['111', '112'].includes(cash.number)) throw Errors.validation('Tài khoản quỹ phải là 111 hoặc 112', 'cashAccount');
  const party = await accountByNumber(db, orgId, d.paymentType === 'receive' ? '131' : '331');
  const partyType = d.paymentType === 'receive' ? 'customer' : 'supplier';
  const glLines: GlLine[] = d.paymentType === 'receive'
    ? [{ accountId: cash.id, debit: amount }, { accountId: party.id, credit: amount, partyType, partyName: d.partyName }]
    : [{ accountId: party.id, debit: amount, partyType, partyName: d.partyName }, { accountId: cash.id, credit: amount }];
  return db.transaction(async (tx: DB) => {
    const voucher = await postGL(tx, orgId, { voucherType: 'payment', postingDate: d.postingDate, remarks: d.remarks ?? `${d.paymentType === 'receive' ? 'Thu' : 'Chi'} — ${d.partyName}`, lines: glLines });
    if (invoice) {
      const newOut = Number(invoice.outstanding) - amount;
      await tx.update(accInvoices).set({ outstanding: String(newOut), status: newOut === 0 ? 'paid' : 'partly_paid' })
        .where(eq(accInvoices.id, invoice.id));
    }
    const [pay] = await tx.insert(accPayments).values({
      orgId, paymentType: d.paymentType, partyName: d.partyName.trim(), amount: String(amount),
      cashAccountId: cash.id, invoiceId: d.invoiceId, postingDate: d.postingDate, remarks: d.remarks, voucherId: voucher.id,
    }).returning();
    await emitEvent(tx, { orgId, topic: 'accounting.payment.created', payload: { id: pay.id, paymentType: pay.paymentType, partyName: pay.partyName, amount: pay.amount } });
    return pay;
  });
}
export async function listPayments(db: DB, orgId: string) {
  return db.select().from(accPayments).where(eq(accPayments.orgId, orgId)).orderBy(desc(accPayments.createdAt));
}

/** Loại chứng từ (invoice/payment/journal) — dùng cho gate nhạy cảm trước khi hủy. */
export async function voucherType(db: DB, orgId: string, voucherId: string): Promise<string> {
  const [v] = await db.select().from(accVouchers).where(and(eq(accVouchers.id, voucherId), eq(accVouchers.orgId, orgId)));
  if (!v) throw Errors.notFound('Không tìm thấy chứng từ');
  return v.voucherType;
}

/** Hủy chứng từ = bút toán ĐẢO (GL bất biến). Invoice chỉ hủy khi chưa thu đồng nào; payment hủy → hoàn công nợ. */
export async function cancelVoucher(db: DB, orgId: string, voucherId: string) {
  const [v] = await db.select().from(accVouchers).where(and(eq(accVouchers.id, voucherId), eq(accVouchers.orgId, orgId)));
  if (!v) throw Errors.notFound('Không tìm thấy chứng từ');
  if (v.status === 'cancelled') throw Errors.conflict('Chứng từ đã hủy');
  const today = new Date().toISOString().slice(0, 10);
  if (v.voucherType === 'invoice') {
    const [inv] = await db.select().from(accInvoices).where(eq(accInvoices.voucherId, voucherId));
    if (inv && Number(inv.outstanding) !== Number(inv.grandTotal)) throw Errors.conflict('Hóa đơn đã có thanh toán — hủy các phiếu thu/chi trước');
    if (inv) await db.update(accInvoices).set({ status: 'cancelled', outstanding: '0' }).where(eq(accInvoices.id, inv.id));
  }
  if (v.voucherType === 'payment') {
    const [pay] = await db.select().from(accPayments).where(eq(accPayments.voucherId, voucherId));
    if (pay?.invoiceId) {
      const [inv] = await db.select().from(accInvoices).where(eq(accInvoices.id, pay.invoiceId));
      const newOut = Number(inv.outstanding) + Number(pay.amount);
      await db.update(accInvoices).set({ outstanding: String(newOut), status: newOut === Number(inv.grandTotal) ? 'unpaid' : 'partly_paid' }).where(eq(accInvoices.id, inv.id));
    }
    if (pay) await db.update(accPayments).set({ status: 'cancelled' }).where(eq(accPayments.id, pay.id));
  }
  const lines = await db.select().from(accGlEntries).where(and(eq(accGlEntries.voucherId, voucherId), eq(accGlEntries.isCancel, false)));
  return db.transaction(async (tx: DB) => {
    for (const l of lines) {
      await tx.insert(accGlEntries).values({
        orgId, postingDate: today, accountId: l.accountId,
        debit: l.credit, credit: l.debit, // ĐẢO
        partyType: l.partyType, partyName: l.partyName, voucherId,
        remarks: `[HỦY ${v.voucherNo}] ${l.remarks ?? ''}`.trim(), isCancel: true,
      });
    }
    const [row] = await tx.update(accVouchers).set({ status: 'cancelled' }).where(eq(accVouchers.id, voucherId)).returning();
    return row;
  });
}
export async function listVouchers(db: DB, orgId: string) {
  return db.select().from(accVouchers).where(eq(accVouchers.orgId, orgId)).orderBy(desc(accVouchers.createdAt));
}
