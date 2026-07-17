/**
 * QLDN V1A — Import nhân sự từ bộ Excel Joli Poli (F2).
 * Nguồn 1 (hệ CHÍNH THỨC): "Bang luong thang 06.xlsx" sheet "Bảng thông tin"
 *   → mã NV001/QL001, loại HĐ, lương BHXH + cơ bản + 5 phụ cấp HĐLĐ, tình trạng.
 * Nguồn 2 (hệ NỘI BỘ): "LUONGNB xx.xls" sheet "NHÂN SỰ"
 *   → mã nội bộ (idUser/Mã nhân viên), lương cơ bản nội bộ + PC chức vụ/trách nhiệm/
 *     tay nghề/xăng xe/hoàn thiện/gửi xe, STK + ngân hàng, số NPT, ngày công chuẩn.
 * Merge key: TÊN chuẩn hóa (bỏ dấu, lowercase, gộp khoảng trắng) — 2 hệ mã khác nhau
 * không map trực tiếp được; import ghi rõ matched/unmatched để người dùng rà.
 * Chiến lược ghi: 1 dòng lỗi = báo lỗi dòng đó, KHÔNG ghi gì (all-or-nothing).
 */
import * as XLSX from 'xlsx';
import { and, eq } from 'drizzle-orm';
import { AppError } from '@citadel/core';
import { employees, salaryProfiles } from './schema.js';

const invalid = (msg: string) => new AppError('VALIDATION' as any, msg, 400);

/** Chuẩn hóa tên để merge: bỏ dấu tiếng Việt, lowercase, gộp space. */
export function normalizeName(s: string): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const num = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const s = (v: unknown): string => String(v ?? '').trim();

/** Excel serial date → YYYY-MM-DD (hệ 1900). */
export function excelDateToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export interface OfficialRow {
  codeOfficial: string; fullName: string; contractType: 'HDLD' | 'HDTV' | 'CTV';
  position: string; department: string;
  bhxhSalary: number; baseSalary: number;
  allowResponsibility: number; allowMeal: number; allowFuel: number;
  allowPhone: number; allowUniform: number;
  statusNote: string;
}

/** Parse sheet "Bảng thông tin" (file lương chính thức). */
export function parseOfficialWorkbook(buf: Buffer | Uint8Array): OfficialRow[] {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheetName = wb.SheetNames.find((n) => normalizeName(n).includes('bang thong tin'));
  if (!sheetName) throw invalid('Không tìm thấy sheet "Bảng thông tin" trong file lương chính thức');
  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null });
  const out: OfficialRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const code = s(r?.[1]);
    if (!/^[A-Z]{2}\d{3,}$/.test(code)) continue; // chỉ nhận dòng có mã NV thật (QL001/NV001)
    const fullName = s(r?.[2]);
    if (!fullName) throw invalid(`Dòng ${i + 1}: mã ${code} thiếu họ tên`);
    const rawCt = normalizeName(s(r?.[3]));
    const contractType = rawCt.includes('tv') && !rawCt.includes('ld') ? 'HDTV' : rawCt.includes('ctv') ? 'CTV' : 'HDLD';
    out.push({
      codeOfficial: code, fullName, contractType,
      position: s(r?.[4]), department: s(r?.[5]),
      bhxhSalary: num(r?.[7]), baseSalary: num(r?.[8]),
      allowResponsibility: num(r?.[9]), allowMeal: num(r?.[10]), allowFuel: num(r?.[11]),
      allowPhone: num(r?.[12]), allowUniform: num(r?.[13]),
      statusNote: s(r?.[18]),
    });
  }
  if (!out.length) throw invalid('Sheet "Bảng thông tin" không có dòng nhân viên hợp lệ');
  return out;
}

export interface InternalRow {
  codeInternal: string; fullName: string; position: string;
  dependentsCount: number; standardDays: number;
  baseSalaryInternal: number;
  allowPosition: number; allowResponsibility: number; allowSkill: number;
  allowFuel: number; allowCreative: number; allowOther: number;
  bankAccount: string; bankName: string; joinedDate: string | null;
}

/** Parse sheet "NHÂN SỰ" (file lương nội bộ .xls). */
export function parseInternalWorkbook(buf: Buffer | Uint8Array): InternalRow[] {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheetName = wb.SheetNames.find((n) => normalizeName(n) === 'nhan su' || normalizeName(n).includes('nhan su'));
  if (!sheetName) throw invalid('Không tìm thấy sheet "NHÂN SỰ" trong file lương nội bộ');
  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null });
  const out: InternalRow[] = [];
  for (let i = 2; i < rows.length; i++) { // dòng 0 header, dòng 1 số thứ tự cột
    const r = rows[i];
    const fullName = s(r?.[3]);
    if (!fullName) continue;
    const codeInternal = s(r?.[2]);
    out.push({
      codeInternal, fullName, position: s(r?.[4]),
      dependentsCount: Math.max(0, Math.trunc(num(r?.[7]))),
      standardDays: num(r?.[9]) || 26,
      baseSalaryInternal: num(r?.[13]),
      allowPosition: num(r?.[14]), allowResponsibility: num(r?.[15]), allowSkill: num(r?.[16]),
      allowFuel: num(r?.[17]), allowCreative: num(r?.[18]), allowOther: num(r?.[19]) + num(r?.[20]) + num(r?.[21]) + num(r?.[22]) + num(r?.[23]),
      bankAccount: s(r?.[24]), bankName: s(r?.[25]),
      joinedDate: excelDateToIso(num(r?.[27])),
    });
  }
  if (!out.length) throw invalid('Sheet "NHÂN SỰ" không có dòng nhân viên hợp lệ');
  return out;
}

export interface ImportResult {
  created: number; updated: number; profilesCreated: number;
  matchedInternal: number; unmatchedInternal: string[];
  employees: { id: string; codeOfficial: string | null; codeInternal: string | null; fullName: string }[];
}

/**
 * Import merge 2 nguồn (all-or-nothing trong 1 transaction):
 * 1. Upsert employees từ nguồn CHÍNH THỨC (theo org+code_official).
 * 2. Merge nguồn NỘI BỘ theo tên chuẩn hóa → điền code_internal, STK, NPT;
 *    tên không khớp → tạo NV mới chỉ có code_internal (CTV/nội bộ đơn thuần).
 * 3. Tạo salary_profiles effective_from cho từng NV (gộp official + internal).
 */
export async function importEmployees(
  db: any, orgId: string,
  opts: { official?: OfficialRow[]; internal?: InternalRow[]; effectiveFrom: string },
): Promise<ImportResult> {
  const { official = [], internal = [], effectiveFrom } = opts;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) throw invalid('effectiveFrom phải dạng YYYY-MM-DD');
  if (!official.length && !internal.length) throw invalid('Không có dữ liệu import');

  // Chặn trùng mã trong chính file nguồn
  const seen = new Set<string>();
  for (const o of official) {
    if (seen.has(o.codeOfficial)) throw invalid(`Mã ${o.codeOfficial} trùng lặp trong file chính thức`);
    seen.add(o.codeOfficial);
  }

  return db.transaction(async (tx: any) => {
    const result: ImportResult = { created: 0, updated: 0, profilesCreated: 0, matchedInternal: 0, unmatchedInternal: [], employees: [] };
    const byName = new Map<string, { id: string; codeOfficial: string | null; codeInternal: string | null; fullName: string; off?: OfficialRow; int?: InternalRow }>();

    // Index NV đã có trong DB theo tên chuẩn hóa — để import lại không nhân đôi
    // (kể cả NV nội bộ không có code_official).
    const existingAll = await tx.select().from(employees).where(eq(employees.orgId, orgId));
    const dbByName = new Map<string, any>();
    for (const e of existingAll) dbByName.set(normalizeName(e.fullName), e);

    // 1) Nguồn chính thức
    for (const o of official) {
      const existing = await tx.select().from(employees)
        .where(and(eq(employees.orgId, orgId), eq(employees.codeOfficial, o.codeOfficial))).limit(1);
      let row;
      if (existing.length) {
        [row] = await tx.update(employees).set({
          fullName: o.fullName, contractType: o.contractType,
          position: o.position || null, department: o.department || null,
          note: o.statusNote || null, updatedAt: new Date(),
        }).where(eq(employees.id, existing[0].id)).returning();
        result.updated++;
      } else {
        [row] = await tx.insert(employees).values({
          orgId, codeOfficial: o.codeOfficial, fullName: o.fullName, contractType: o.contractType,
          position: o.position || null, department: o.department || null,
          bhxhEnrolled: o.bhxhSalary > 0, note: o.statusNote || null,
        }).returning();
        result.created++;
      }
      byName.set(normalizeName(o.fullName), { id: row.id, codeOfficial: row.codeOfficial, codeInternal: row.codeInternal, fullName: row.fullName, off: o });
    }

    // 2) Nguồn nội bộ — merge theo tên
    for (const it of internal) {
      const key = normalizeName(it.fullName);
      const hit = byName.get(key);
      if (hit) {
        result.matchedInternal++;
        hit.int = it;
        const [row] = await tx.update(employees).set({
          codeInternal: it.codeInternal || hit.codeInternal,
          dependentsCount: it.dependentsCount,
          bankAccount: it.bankAccount || null, bankName: it.bankName || null,
          joinedDate: it.joinedDate, updatedAt: new Date(),
        }).where(eq(employees.id, hit.id)).returning();
        hit.codeInternal = row.codeInternal;
      } else {
        result.unmatchedInternal.push(it.fullName);
        const dbHit = dbByName.get(key);
        let row;
        if (dbHit) {
          [row] = await tx.update(employees).set({
            codeInternal: it.codeInternal || dbHit.codeInternal,
            position: it.position || dbHit.position,
            dependentsCount: it.dependentsCount,
            bankAccount: it.bankAccount || dbHit.bankAccount, bankName: it.bankName || dbHit.bankName,
            joinedDate: it.joinedDate ?? dbHit.joinedDate, updatedAt: new Date(),
          }).where(eq(employees.id, dbHit.id)).returning();
          result.updated++;
        } else {
          [row] = await tx.insert(employees).values({
            orgId, codeInternal: it.codeInternal || null, fullName: it.fullName,
            contractType: 'HDLD', position: it.position || null,
            dependentsCount: it.dependentsCount,
            bankAccount: it.bankAccount || null, bankName: it.bankName || null,
            joinedDate: it.joinedDate,
          }).returning();
          result.created++;
        }
        byName.set(key, { id: row.id, codeOfficial: row.codeOfficial, codeInternal: row.codeInternal, fullName: row.fullName, int: it });
      }
    }

    // 3) Salary profiles gộp 2 nguồn
    for (const v of byName.values()) {
      const o = v.off, it = v.int;
      await tx.insert(salaryProfiles).values({
        orgId, employeeId: v.id, effectiveFrom,
        bhxhSalary: String(o?.bhxhSalary ?? 0),
        baseSalary: String(o?.baseSalary ?? 0),
        baseSalaryInternal: String(it?.baseSalaryInternal ?? 0),
        allowResponsibility: String(o?.allowResponsibility ?? it?.allowResponsibility ?? 0),
        allowMeal: String(o?.allowMeal ?? 0),
        allowFuel: String(o?.allowFuel ?? it?.allowFuel ?? 0),
        allowPhone: String(o?.allowPhone ?? 0),
        allowUniform: String(o?.allowUniform ?? 0),
        allowCreative: String(it?.allowCreative ?? 0),
        allowSkill: String(it?.allowSkill ?? 0),
        allowPosition: String(it?.allowPosition ?? 0),
        allowOther: String(it?.allowOther ?? 0),
        note: 'Import Excel',
      });
      result.profilesCreated++;
      result.employees.push({ id: v.id, codeOfficial: v.codeOfficial, codeInternal: v.codeInternal, fullName: v.fullName });
    }
    return result;
  });
}
