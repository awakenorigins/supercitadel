/**
 * SOUL-INVENTORY v2.0 — excel.service
 * Nhập/xuất Excel bằng SheetJS (xlsx) — hấp thụ pattern excel.service của
 * module Kế Toán 10A:
 *   - importItems: đọc sheet danh mục (SKU/Tên/ĐVT/Định mức/Barcode/Lô?/Serial?)
 *     → upsert items, trả báo cáo từng dòng OK/lỗi (không fail cả file vì 1 dòng)
 *   - importOpeningStock: đọc sheet tồn đầu kỳ (SKU/Kho/Số lượng/Đơn giá/Lô/HSD)
 *     → receive từng dòng với ref 'excel_import' (idempotent theo ref_id file+row)
 *   - exportStockReport: tồn hiện tại → buffer xlsx
 *   - exportStockCard: thẻ kho một SKU → buffer xlsx
 * Mọi hàm nhận/nhả Buffer — route/action layer lo HTTP; module không đụng file system.
 */
import * as XLSX from 'xlsx';
import type { KhoCtx } from '../types.js';
import { upsertItem } from './catalog.service.js';
import { receiveStock, queryStock } from './stock.service.js';
import { stockCard } from './report.service.js';

interface ImportRowResult { row: number; sku?: string; ok: boolean; message: string }

/** Chuẩn hóa header tiếng Việt/Anh về key nội bộ */
function normalizeHeader(h: string): string {
  const k = h.trim().toLowerCase();
  const map: Record<string, string> = {
    'sku': 'sku', 'mã': 'sku', 'ma': 'sku', 'mã hàng': 'sku', 'ma hang': 'sku',
    'tên': 'name', 'ten': 'name', 'name': 'name', 'tên hàng': 'name', 'ten hang': 'name',
    'đvt': 'unit', 'dvt': 'unit', 'unit': 'unit', 'đơn vị': 'unit', 'don vi': 'unit',
    'định mức': 'min_stock', 'dinh muc': 'min_stock', 'min': 'min_stock', 'min_stock': 'min_stock',
    'barcode': 'barcode', 'mã vạch': 'barcode', 'ma vach': 'barcode',
    'theo lô': 'track_lot', 'theo lo': 'track_lot', 'track_lot': 'track_lot',
    'theo serial': 'track_serial', 'track_serial': 'track_serial',
    'kho': 'location', 'location': 'location',
    'số lượng': 'quantity', 'so luong': 'quantity', 'sl': 'quantity', 'qty': 'quantity', 'quantity': 'quantity',
    'đơn giá': 'unit_cost', 'don gia': 'unit_cost', 'giá': 'unit_cost', 'gia': 'unit_cost', 'unit_cost': 'unit_cost',
    'lô': 'lot_no', 'lo': 'lot_no', 'số lô': 'lot_no', 'so lo': 'lot_no', 'lot': 'lot_no', 'lot_no': 'lot_no',
    'serial': 'serial_no', 'serial_no': 'serial_no',
    'hsd': 'expiry_date', 'hạn': 'expiry_date', 'han': 'expiry_date',
    'hạn sử dụng': 'expiry_date', 'han su dung': 'expiry_date', 'expiry': 'expiry_date',
  };
  return map[k] ?? k;
}

function sheetToRows(buf: Buffer): Array<Record<string, unknown>> {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  return raw.map(r => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) out[normalizeHeader(k)] = v;
    return out;
  });
}

const s = (v: unknown): string => String(v ?? '').trim();
/** Excel date serial | string → YYYY-MM-DD */
function toDateStr(v: unknown): string | undefined {
  if (v === '' || v == null) return undefined;
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return undefined;
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const str = s(v);
  // nhận dd/mm/yyyy hoặc yyyy-mm-dd
  const dmy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2, '0')}-${dmy[1]!.padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  return undefined;
}
const truthy = (v: unknown): boolean =>
  ['1', 'x', 'true', 'có', 'co', 'yes', 'y'].includes(s(v).toLowerCase());

/** NHẬP DANH MỤC từ Excel — mỗi dòng độc lập, trả kết quả từng dòng */
export async function importItems(ctx: KhoCtx, fileBuffer: Buffer): Promise<{
  total: number; ok: number; failed: number; results: ImportRowResult[];
}> {
  const rows = sheetToRows(fileBuffer);
  const results: ImportRowResult[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const rowNo = i + 2; // header dòng 1
    try {
      if (!s(r.sku) || !s(r.name)) {
        results.push({ row: rowNo, ok: false, message: 'Thiếu SKU hoặc Tên' });
        continue;
      }
      await upsertItem(ctx, {
        sku: s(r.sku), name: s(r.name),
        unit: s(r.unit) || 'cái',
        min_stock: s(r.min_stock) || '0',
        barcode: s(r.barcode) || undefined,
        track_lot: truthy(r.track_lot),
        track_serial: truthy(r.track_serial),
        metadata: { source: 'excel_import' },
      });
      results.push({ row: rowNo, sku: s(r.sku), ok: true, message: 'OK' });
    } catch (e) {
      results.push({
        row: rowNo, sku: s(r.sku), ok: false,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  const ok = results.filter(x => x.ok).length;
  await ctx.bus.emit('kho.excel.items_imported', {
    org_id: ctx.orgId, total: rows.length, ok, failed: rows.length - ok,
  });
  return { total: rows.length, ok, failed: rows.length - ok, results };
}

/** NHẬP TỒN ĐẦU KỲ từ Excel — receive từng dòng, idempotent theo file hash + row */
export async function importOpeningStock(
  ctx: KhoCtx, fileBuffer: Buffer, fileRef?: string,
): Promise<{ total: number; ok: number; failed: number; results: ImportRowResult[] }> {
  const rows = sheetToRows(fileBuffer);
  const ref = fileRef ?? `xlsx-${Date.now()}`;
  const results: ImportRowResult[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const rowNo = i + 2;
    try {
      if (!s(r.sku) || !s(r.quantity)) {
        results.push({ row: rowNo, ok: false, message: 'Thiếu SKU hoặc Số lượng' });
        continue;
      }
      await receiveStock(ctx, {
        sku: s(r.sku),
        quantity: s(r.quantity),
        location_code: s(r.location) || undefined,
        unit_cost: s(r.unit_cost) || undefined,
        lot_no: s(r.lot_no) || undefined,
        serial_no: s(r.serial_no) || undefined,
        expiry_date: toDateStr(r.expiry_date),
        ref_type: 'excel_import',
        ref_id: `${ref}#${rowNo}`,
        note: 'Tồn đầu kỳ nhập từ Excel',
      });
      results.push({ row: rowNo, sku: s(r.sku), ok: true, message: 'OK' });
    } catch (e) {
      results.push({
        row: rowNo, sku: s(r.sku), ok: false,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  const ok = results.filter(x => x.ok).length;
  await ctx.bus.emit('kho.excel.stock_imported', {
    org_id: ctx.orgId, total: rows.length, ok, failed: rows.length - ok, ref,
  });
  return { total: rows.length, ok, failed: rows.length - ok, results };
}

/** XUẤT BÁO CÁO TỒN → Buffer xlsx */
export async function exportStockReport(ctx: KhoCtx): Promise<Buffer> {
  const rows = await queryStock(ctx, { limit: 200 });
  const data = rows.map(r => ({
    'SKU': r.sku, 'Tên hàng': r.name, 'ĐVT': r.unit, 'Kho': r.location,
    'Tồn sổ': r.stocked, 'Đang giữ': r.reserved,
    'Khả dụng': r.available, 'Đang về': r.incoming, 'Định mức': r.min_stock,
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 8 }, { wch: 12 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ton kho');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** XUẤT THẺ KHO một SKU → Buffer xlsx */
export async function exportStockCard(ctx: KhoCtx, sku: string): Promise<Buffer> {
  const card = await stockCard(ctx, sku, 200);
  const data = card.card.map(m => ({
    'Ngày': m.date instanceof Date ? m.date.toISOString().slice(0, 10) : String(m.date).slice(0, 10),
    'Loại': m.type, 'Số CT': (m as { ref?: string | null }).ref ?? '',
    'Kho': m.location, 'SL (+/-)': m.delta,
    'Đơn giá': m.unit_cost ?? '', 'Ghi chú': m.note ?? '',
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 12 },
    { wch: 10 }, { wch: 12 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws,
    `The kho ${card.item.sku}`.slice(0, 31));
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
