/**
 * QLDN V1A — F7: Dự báo dòng tiền (forecast ledger roll theo ngày) + import
 * file "DU_BAO_THU__CHI_CONG_NO.xlsx" (sheet Báo cáo, 400 dòng).
 *
 * Cấu trúc Excel: [Ngày TT, Ngày CT, Số CT, Hạn TT, Diễn giải, Thu, Chi, Tồn]
 *  - Dòng 3 = "Số tồn quỹ đến hiện tại" → opening balance
 *  - OPN = số dư/khoản mở kỳ; JP/JPA/JO/... Thu>0 = AR; MH/SPA/NK/... Chi>0 = AP
 *  - Tồn = running balance (opening + cumsum(thu−chi)) — engine tính lại và
 *    ĐỐI CHIẾU với Excel (golden 400 dòng).
 */
import * as XLSX from 'xlsx';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { AppError } from '@citadel/core';
import { forecastLines } from './schema.js';
import { excelDateToIso } from './import.js';

const invalid = (msg: string) => new AppError('VALIDATION' as any, msg, 400);
const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const s = (v: unknown): string => String(v ?? '').trim();

export interface ForecastRow {
  docNo: string; docType: 'OPN' | 'AR' | 'AP';
  dueDate: string; description: string;
  inflow: number; outflow: number;
  excelBalance: number; // Tồn theo Excel — để golden đối chiếu
}
export interface ForecastParsed {
  openingBalance: number; asOf: string | null;
  rows: ForecastRow[];
  totals: { inflow: number; outflow: number };
}

/** Phân loại chứng từ: OPN giữ nguyên; còn lại Thu>0 = AR, Chi>0 = AP. */
export function classifyDoc(docNo: string, inflow: number, outflow: number): 'OPN' | 'AR' | 'AP' {
  if (/^OPN/i.test(docNo)) return 'OPN';
  if (inflow > 0 && outflow <= 0) return 'AR';
  return 'AP';
}

export function parseForecastWorkbook(buf: Buffer | Uint8Array): ForecastParsed {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw invalid('File dự báo không có sheet nào');
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // "Đến ngày 14/7/2026"
  const asOfM = s(rows[1]?.[0]).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const asOf = asOfM ? `${asOfM[3]}-${asOfM[2].padStart(2, '0')}-${asOfM[1].padStart(2, '0')}` : null;

  let openingBalance = 0;
  const out: ForecastRow[] = [];
  let totalIn = 0, totalOut = 0;
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const desc = s(r[4]);
    if (desc.includes('tồn quỹ đến hiện tại')) { openingBalance = num(r[7]); continue; }
    if (s(r[0]).startsWith('Số dòng')) break; // dòng tổng cuối
    const due = typeof r[3] === 'number' ? excelDateToIso(num(r[3])) : (typeof r[0] === 'number' ? excelDateToIso(num(r[0])) : null);
    const inflow = num(r[5]), outflow = num(r[6]);
    if (!due || (inflow === 0 && outflow === 0)) continue;
    const docNo = s(r[2]);
    out.push({
      docNo, docType: classifyDoc(docNo, inflow, outflow),
      dueDate: due, description: desc,
      inflow, outflow, excelBalance: num(r[7]),
    });
    totalIn += inflow; totalOut += outflow;
  }
  if (!out.length) throw invalid('File dự báo không có dòng dữ liệu hợp lệ');
  return { openingBalance, asOf, rows: out, totals: { inflow: totalIn, outflow: totalOut } };
}

export interface ForecastImportResult { created: number; openingBalance: number; totals: { inflow: number; outflow: number } }

/** Import forecast (replace-all cho nguồn import — sổ dự báo là snapshot roll). */
export async function importForecast(db: any, orgId: string, parsed: ForecastParsed): Promise<ForecastImportResult> {
  return db.transaction(async (tx: any) => {
    await tx.delete(forecastLines).where(and(eq(forecastLines.orgId, orgId), eq(forecastLines.sourceRef, 'excel-import')));
    let created = 0;
    // Opening balance lưu như 1 dòng OPN đặc biệt ngày asOf (hoặc ngày đầu tiên)
    const firstDate = parsed.asOf ?? parsed.rows[0].dueDate;
    await tx.insert(forecastLines).values({
      orgId, docNo: 'OPENING', docType: 'OPN', dueDate: firstDate,
      description: 'Số tồn quỹ đến hiện tại',
      inflow: String(parsed.openingBalance), outflow: '0',
      sourceRef: 'excel-import', status: 'open',
    });
    created++;
    for (const r of parsed.rows) {
      await tx.insert(forecastLines).values({
        orgId, docNo: r.docNo || null, docType: r.docType, dueDate: r.dueDate,
        description: r.description || null,
        inflow: String(r.inflow), outflow: String(r.outflow),
        sourceRef: 'excel-import', status: 'open',
      });
      created++;
    }
    return { created, openingBalance: parsed.openingBalance, totals: parsed.totals };
  });
}

export async function createForecastLine(db: any, orgId: string, b: any) {
  const dueDate = s(b?.dueDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw invalid('dueDate phải dạng YYYY-MM-DD');
  const docType = ['OPN', 'AR', 'AP'].includes(b?.docType) ? b.docType : (num(b?.inflow) > 0 ? 'AR' : 'AP');
  const [row] = await db.insert(forecastLines).values({
    orgId, docNo: b?.docNo ?? null, docType, dueDate,
    description: b?.description ?? null,
    inflow: String(num(b?.inflow)), outflow: String(num(b?.outflow)),
    sourceRef: b?.sourceRef ?? null, status: 'open',
  }).returning();
  return row;
}

export interface ForecastView {
  from: string | null; to: string | null;
  openingBalance: number;
  lines: { id: string; docNo: string | null; docType: string; dueDate: string; description: string | null; inflow: number; outflow: number; runningBalance: number; status: string }[];
  closingBalance: number;
  totals: { inflow: number; outflow: number };
}

/** Sổ dự báo roll theo ngày: running balance tính lại từ dữ liệu, sort dueDate. */
export async function forecastView(db: any, orgId: string, from?: string, to?: string): Promise<ForecastView> {
  const conds = [eq(forecastLines.orgId, orgId), eq(forecastLines.status, 'open' as any)];
  if (from) conds.push(gte(forecastLines.dueDate, from));
  if (to) conds.push(lte(forecastLines.dueDate, to));
  const rows = await db.select().from(forecastLines)
    .where(and(...conds))
    .orderBy(asc(forecastLines.dueDate), asc(forecastLines.createdAt));
  let bal = 0, totalIn = 0, totalOut = 0;
  let opening = 0;
  const lines = rows.map((r: any) => {
    const inflow = num(r.inflow), outflow = num(r.outflow);
    if (r.docNo === 'OPENING') { opening = inflow; bal += inflow; }
    else { bal += inflow - outflow; totalIn += inflow; totalOut += outflow; }
    return {
      id: r.id, docNo: r.docNo, docType: r.docType, dueDate: r.dueDate,
      description: r.description, inflow, outflow, runningBalance: bal, status: r.status,
    };
  });
  return { from: from ?? null, to: to ?? null, openingBalance: opening, lines, closingBalance: bal, totals: { inflow: totalIn, outflow: totalOut } };
}

export async function settleForecastLine(db: any, orgId: string, id: string) {
  const [row] = await db.update(forecastLines).set({ status: 'settled', updatedAt: new Date() })
    .where(and(eq(forecastLines.orgId, orgId), eq(forecastLines.id, id))).returning();
  if (!row) throw invalid('Không tìm thấy dòng dự báo');
  return row;
}
