/**
 * QLDN V1A — F3: Chấm công + import BCC từ 2 file Excel Joli Poli.
 * Nguồn 1 (CHÍNH THỨC): sheet "BCC" file Bang luong — chế độ KÝ HIỆU NGÀY:
 *   cột 4..33 = ngày 1..30/31 (giá trị giờ 8 hoặc ký hiệu P/N),
 *   cột 35 ngày công thường, 36 giờ OT thường, 37 giờ OT ngày nghỉ,
 *   38 ngày lễ, 39 ngày nghỉ hưởng lương, 40 phép có trong tháng, 41 phép còn lại.
 * Nguồn 2 (NỘI BỘ): sheet "BCC" file LUONGNB — chế độ GIỜ MÁY:
 *   col 3 tổng ngày công, 4 ngày công tính lương, 5 dư công 1.5, 6 NP, 7 KL, 8 TV, 9 L,
 *   10/11/12 giờ OT 1.5/1.7/2.0, 13 làm thêm CN, 14 tổng giờ năng suất,
 *   col 16.. = giờ làm từng ngày 1..31.
 * Match: official theo code_official; internal theo TÊN chuẩn hóa (BCC nội bộ dùng
 * idUser JPxx không trùng mã NHÂN SỰ). Unmatched → báo, không tự tạo NV.
 */
import * as XLSX from 'xlsx';
import { and, eq } from 'drizzle-orm';
import { AppError } from '@citadel/core';
import { employees, periods, timesheets, timesheetDays } from './schema.js';
import { normalizeName, excelDateToIso } from './import.js';

const invalid = (msg: string) => new AppError('VALIDATION' as any, msg, 400);
const num = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const s = (v: unknown): string => String(v ?? '').trim();

export interface BccDay { day: number; symbol?: string; workHours: number }
export interface BccRow {
  key: string; // codeOfficial hoặc tên chuẩn hóa
  code: string; // mã gốc trong file (NV001 hoặc idUser JPKD001)
  fullName: string;
  workDays: number; paidLeaveDays: number; unpaidDays: number;
  ot150Hours: number; ot170Hours: number; ot200Hours: number;
  totalHours: number;
  days: BccDay[];
  detail: Record<string, number>;
}
export interface BccParsed { periodCode: string; source: 'official' | 'internal'; rows: BccRow[] }

/** Parse sheet BCC file lương CHÍNH THỨC (ký hiệu ngày). */
export function parseOfficialBcc(buf: Buffer | Uint8Array): BccParsed {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheetName = wb.SheetNames.find((n) => n.trim().toUpperCase() === 'BCC');
  if (!sheetName) throw invalid('Không tìm thấy sheet "BCC" trong file lương chính thức');
  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null });

  // Hàng serial date (dòng 8): xác định kỳ + số ngày trong tháng
  const serialRow = rows.find((r) => r && typeof r[4] === 'number' && r[4] > 40000 && r[4] < 60000);
  if (!serialRow) throw invalid('BCC chính thức: không tìm thấy hàng ngày tháng (serial)');
  const firstIso = excelDateToIso(num(serialRow[4]));
  if (!firstIso) throw invalid('BCC chính thức: ngày đầu kỳ không hợp lệ');
  const periodCode = firstIso.slice(0, 7);
  let dayCount = 0;
  for (let c = 4; c < 40; c++) { if (typeof serialRow[c] === 'number' && serialRow[c] > 40000) dayCount++; else break; }

  const out: BccRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const code = s(r?.[1]);
    if (!/^[A-Z]{2}\d{3,}$/.test(code)) continue;
    const fullName = s(r?.[2]);
    const days: BccDay[] = [];
    for (let d = 0; d < dayCount; d++) {
      const v = r[4 + d];
      if (v === null || v === undefined || v === '') continue;
      if (typeof v === 'number') days.push({ day: d + 1, workHours: v });
      else days.push({ day: d + 1, symbol: s(v), workHours: 0 });
    }
    out.push({
      key: code, code, fullName,
      workDays: num(r[4 + dayCount + 1]),          // cột 35: ngày công bình thường
      paidLeaveDays: num(r[4 + dayCount + 5]),     // cột 39: ngày nghỉ hưởng lương
      unpaidDays: 0,
      ot150Hours: num(r[4 + dayCount + 2]),        // cột 36: giờ tăng ca thường
      ot170Hours: 0,
      ot200Hours: num(r[4 + dayCount + 3]),        // cột 37: giờ tăng ca ngày nghỉ
      totalHours: 0,
      days,
      detail: {
        holidayDays: num(r[4 + dayCount + 4]),     // cột 38: ngày lễ
        leaveQuotaMonth: num(r[4 + dayCount + 6]), // cột 40: phép có tháng
        leaveRemaining: num(r[4 + dayCount + 7]),  // cột 41: phép còn lại
      },
    });
  }
  if (!out.length) throw invalid('BCC chính thức: không có dòng nhân viên hợp lệ');
  return { periodCode, source: 'official', rows: out };
}

/** Parse sheet BCC file lương NỘI BỘ (giờ máy). */
export function parseInternalBcc(buf: Buffer | Uint8Array): BccParsed {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheetName = wb.SheetNames.find((n) => n.trim().toUpperCase() === 'BCC');
  if (!sheetName) throw invalid('Không tìm thấy sheet "BCC" trong file lương nội bộ');
  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null });

  // Tiêu đề: "BẢNG CHẤM CÔNG THÁNG 06NĂM 2026"
  const title = s(rows[0]?.[0]);
  const m = title.match(/TH[ÁA]NG\s*(\d{1,2}).*N[ĂA]M\s*(\d{4})/i);
  if (!m) throw invalid(`BCC nội bộ: không đọc được kỳ từ tiêu đề "${title}"`);
  const periodCode = `${m[2]}-${String(m[1]).padStart(2, '0')}`;
  const daysInMonth = new Date(Number(m[2]), Number(m[1]), 0).getDate();

  const out: BccRow[] = [];
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i];
    const id = s(r?.[0]);
    if (!/^JP/i.test(id)) continue;
    const fullName = s(r?.[2]);
    if (!fullName) continue;
    const days: BccDay[] = [];
    for (let d = 0; d < daysInMonth; d++) {
      const v = r[16 + d];
      if (v === null || v === undefined || v === '') continue;
      if (typeof v === 'number') { if (v > 0) days.push({ day: d + 1, workHours: v }); }
      else days.push({ day: d + 1, symbol: s(v), workHours: 0 });
    }
    out.push({
      key: normalizeName(fullName), code: id, fullName,
      workDays: num(r[4]),        // ngày công tính lương
      paidLeaveDays: num(r[6]),   // NP
      unpaidDays: num(r[7]),      // KL
      ot150Hours: num(r[10]),
      ot170Hours: num(r[11]),
      ot200Hours: num(r[12]),
      totalHours: num(r[14]),     // tổng giờ năng suất
      days,
      detail: {
        totalDaysRaw: num(r[3]),      // tổng ngày công (kể cả dư hệ số)
        extraDays15: num(r[5]),       // dư công hệ số 1.5
        probationDays: num(r[8]),     // TV thử việc
        holidayDays: num(r[9]),       // L lễ
        sundayExtraDays: num(r[13]),  // làm thêm CN
      },
    });
  }
  if (!out.length) throw invalid('BCC nội bộ: không có dòng nhân viên hợp lệ');
  return { periodCode, source: 'internal', rows: out };
}

/** Tìm/tạo kỳ theo code YYYY-MM. */
export async function ensurePeriod(db: any, orgId: string, code: string) {
  const found = await db.select().from(periods)
    .where(and(eq(periods.orgId, orgId), eq(periods.code, code))).limit(1);
  if (found.length) return found[0];
  const [row] = await db.insert(periods).values({
    orgId, code, name: `Tháng ${code.slice(5)}/${code.slice(0, 4)}`,
  }).onConflictDoNothing().returning();
  if (row) return row;
  const again = await db.select().from(periods)
    .where(and(eq(periods.orgId, orgId), eq(periods.code, code))).limit(1);
  return again[0];
}

export interface TimesheetImportResult {
  periodCode: string; created: number; updated: number; dayRows: number;
  matched: number; autoCreated: number; unmatched: string[];
}

/**
 * Import BCC (official/internal) vào timesheets + timesheet_days.
 * Upsert theo (org, employee, period) — import lại = update, không nhân đôi.
 * Kỳ đã khóa (closed) → từ chối.
 * opts.autoCreate: NV có trong BCC nhưng chưa có hồ sơ → tự tạo (mã nội bộ từ idUser JPxx);
 * mặc định false → chỉ báo unmatched, không ghi.
 */
export async function importBcc(db: any, orgId: string, parsed: BccParsed, opts?: { autoCreate?: boolean }): Promise<TimesheetImportResult> {
  const period = await ensurePeriod(db, orgId, parsed.periodCode);
  if (period.status === 'closed') throw invalid(`Kỳ ${parsed.periodCode} đã khóa — không import được chấm công`);

  const all = await db.select().from(employees).where(eq(employees.orgId, orgId));
  const byCode = new Map<string, any>();
  const byName = new Map<string, any>();
  for (const e of all) {
    if (e.codeOfficial) byCode.set(e.codeOfficial, e);
    byName.set(normalizeName(e.fullName), e);
  }

  return db.transaction(async (tx: any) => {
    const result: TimesheetImportResult = { periodCode: parsed.periodCode, created: 0, updated: 0, dayRows: 0, matched: 0, autoCreated: 0, unmatched: [] };
    const monthPrefix = `${parsed.periodCode}-`;
    for (const row of parsed.rows) {
      let emp = parsed.source === 'official'
        ? (byCode.get(row.key) ?? byName.get(normalizeName(row.fullName)))
        : byName.get(row.key);
      if (!emp && opts?.autoCreate) {
        // NV có công nhưng chưa có hồ sơ (ví dụ thợ mới trong BCC nội bộ) → tạo tối thiểu
        const values = parsed.source === 'official'
          ? { orgId, codeOfficial: row.code, fullName: row.fullName, contractType: 'HDLD' as const, note: 'Auto-tạo từ import BCC' }
          : { orgId, codeInternal: row.code, fullName: row.fullName, contractType: 'HDLD' as const, note: 'Auto-tạo từ import BCC nội bộ' };
        [emp] = await tx.insert(employees).values(values).returning();
        byName.set(normalizeName(emp.fullName), emp);
        if (emp.codeOfficial) byCode.set(emp.codeOfficial, emp);
        result.autoCreated++;
      }
      if (!emp) { result.unmatched.push(`${row.code} (${row.fullName})`); continue; }
      result.matched++;

      const base = {
        workDays: String(row.workDays), paidLeaveDays: String(row.paidLeaveDays), unpaidDays: String(row.unpaidDays),
        ot150Hours: String(row.ot150Hours), ot170Hours: String(row.ot170Hours), ot200Hours: String(row.ot200Hours),
        totalHours: String(row.totalHours),
        source: 'import' as const, updatedAt: new Date(),
      };
      const existing = await tx.select().from(timesheets).where(and(
        eq(timesheets.orgId, orgId), eq(timesheets.employeeId, emp.id), eq(timesheets.periodId, period.id),
      )).limit(1);
      let ts;
      if (existing.length) {
        [ts] = await tx.update(timesheets).set(base).where(eq(timesheets.id, existing[0].id)).returning();
        await tx.delete(timesheetDays).where(and(eq(timesheetDays.orgId, orgId), eq(timesheetDays.timesheetId, ts.id)));
        result.updated++;
      } else {
        [ts] = await tx.insert(timesheets).values({ orgId, employeeId: emp.id, periodId: period.id, ...base }).returning();
        result.created++;
      }
      for (const d of row.days) {
        await tx.insert(timesheetDays).values({
          orgId, timesheetId: ts.id,
          day: `${monthPrefix}${String(d.day).padStart(2, '0')}`,
          symbol: d.symbol ?? null,
          workHours: String(d.workHours),
          otHours: '0',
        });
        result.dayRows++;
      }
    }
    return result;
  });
}

/** Danh sách chấm công theo kỳ. */
export async function listTimesheets(db: any, orgId: string, periodCode: string) {
  const period = await db.select().from(periods)
    .where(and(eq(periods.orgId, orgId), eq(periods.code, periodCode))).limit(1);
  if (!period.length) return { period: null, timesheets: [] };
  const rows = await db.select().from(timesheets)
    .where(and(eq(timesheets.orgId, orgId), eq(timesheets.periodId, period[0].id)));
  return { period: period[0], timesheets: rows };
}
