/**
 * QLDN V1A — F3 TEST: import BCC chấm công từ 2 file Excel Joli Poli THẬT.
 * Kiểm: parse BCC official (ký hiệu ngày, sheet 1.057 dòng) + BCC internal (giờ máy),
 * match NV, upsert timesheets + timesheet_days, idempotent, khóa kỳ chặn import.
 * Chạy: npx tsx server/qldn.timesheet.test.ts
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { parseOfficialWorkbook, parseInternalWorkbook, importEmployees, normalizeName } from './import.js';
import { parseOfficialBcc, parseInternalBcc, importBcc, listTimesheets } from './timesheet.js';
import { closePeriod } from './service.js';

let passed = 0, failed = 0;
function check(cond: boolean, name: string, extra?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const fx = (f: string) => readFileSync(join(here, '..', 'tests', 'fixtures', f));

  console.log('=== F3: parse BCC CHÍNH THỨC (ký hiệu ngày) ===');
  const offBcc = parseOfficialBcc(fx('bang-luong-t06.xlsx'));
  check(offBcc.periodCode === '2026-06', 'Nhận kỳ 2026-06 từ serial date', offBcc.periodCode);
  check(offBcc.rows.length === 40, 'Parse 40 NV trong BCC official', String(offBcc.rows.length));
  const tuan = offBcc.rows.find((r) => r.key === 'QL002');
  check(!!tuan && tuan.workDays === 26 && tuan.ot150Hours === 0, 'QL002: 26 công, 0h OT (khớp Excel)', `${tuan?.workDays}/${tuan?.ot150Hours}`);
  const giang = offBcc.rows.find((r) => r.key === 'NV016');
  check(!!giang && giang.workDays === 26 && giang.ot150Hours === 29.33, 'NV016 Cao Ngân Giang: 26 công + 29.33h OT thường', `${giang?.workDays}/${giang?.ot150Hours}`);
  check(giang!.detail.leaveQuotaMonth === 6 && giang!.detail.leaveRemaining === 6, 'NV016: phép tháng 6/6');
  const symRows = offBcc.rows.filter((r) => r.days.some((d) => d.symbol));
  check(symRows.length > 0, `Ký hiệu ngày (P/N) parse được (${symRows.length} NV có ký hiệu)`);

  console.log('=== F3: parse BCC NỘI BỘ (giờ máy) ===');
  const intBcc = parseInternalBcc(fx('luongnb-t06.xls'));
  check(intBcc.periodCode === '2026-06', 'Nhận kỳ 2026-06 từ tiêu đề', intBcc.periodCode);
  check(intBcc.rows.length === 65, 'Parse 65 NV trong BCC internal', String(intBcc.rows.length));
  const chi = intBcc.rows.find((r) => r.fullName.includes('Quý Chi') || r.fullName.includes('Qúy Chi'));
  check(!!chi && chi.workDays === 26 && Math.abs(chi.totalHours - 229.55) < 0.01, 'Quý Chi: 26 công tính lương + 229.55h năng suất', `${chi?.workDays}/${chi?.totalHours}`);
  check(Math.abs(chi!.ot200Hours - 0.765) < 0.001, 'Quý Chi: OT hệ số 2.0 = 0.765h (số lẻ giờ máy giữ nguyên)', String(chi?.ot200Hours));
  const thao = intBcc.rows.find((r) => normalizeName(r.fullName) === 'pham dang anh thao');
  check(!!thao && Math.abs(thao.ot150Hours - 6.5875) < 0.001 && Math.abs(thao.ot200Hours - 1.14125) < 0.00001, 'Anh Thảo: OT 1.5=6.5875h + 2.0=1.14125h', `${thao?.ot150Hours}/${thao?.ot200Hours}`);
  check(thao!.paidLeaveDays === 1, 'Anh Thảo: 1 ngày NP');
  const chiDays = chi!.days.filter((d) => d.workHours > 0);
  check(chiDays.length >= 25, `Quý Chi: ${chiDays.length} ngày có giờ máy chi tiết`);

  console.log('=== F3: import vào DB (PGlite) ===');
  const pg = new PGlite();
  await pg.exec(readFileSync(join(here, '..', 'migrations', '0000_init.sql'), 'utf8'));
  const db = drizzle(pg) as any;
  const orgA = randomUUID();
  // Seed NV từ F2 trước (BCC match theo code + tên)
  const official = parseOfficialWorkbook(fx('bang-luong-t06.xlsx'));
  const internal = parseInternalWorkbook(fx('luongnb-t06.xls'));
  await importEmployees(db, orgA, { official, internal, effectiveFrom: '2026-06-01' });

  const res1 = await importBcc(db, orgA, offBcc);
  check(res1.created === res1.matched && res1.matched >= 38, `BCC official: match ${res1.matched}/39, tạo ${res1.created} timesheet`, JSON.stringify(res1.unmatched));
  check(res1.dayRows > 900, `Ghi ${res1.dayRows} dòng chi tiết ngày`, String(res1.dayRows));

  // BCC nội bộ có 37 thợ/NV không nằm trong sheet NHÂN SỰ (đặc thù file Joli Poli)
  // → chạy 2 chế độ: mặc định báo unmatched, autoCreate tự tạo hồ sơ từ idUser JPxx.
  const dry = await importBcc(db, orgA, intBcc);
  check(dry.matched === 42 && dry.unmatched.length === 23, `Mặc định: match 42, báo 23 unmatched (không tự tạo)`, `m${dry.matched}/u${dry.unmatched.length}`);
  const res2 = await importBcc(db, orgA, intBcc, { autoCreate: true });
  check(res2.matched === 65 && res2.unmatched.length === 0, `autoCreate: match đủ 65/65 NV nội bộ`, `m${res2.matched}/auto${res2.autoCreated}`);
  check(res2.autoCreated === 23, `Tự tạo 23 hồ sơ từ idUser JPxx`, String(res2.autoCreated));

  const { timesheets: tsRows } = await listTimesheets(db, orgA, '2026-06');
  check(tsRows.length >= 60, `Tổng ${tsRows.length} timesheet kỳ 2026-06 (official + internal, NV trùng update đè)`);

  console.log('=== F3: idempotent re-import ===');
  const res3 = await importBcc(db, orgA, offBcc);
  check(res3.created === 0 && res3.updated === res1.matched, 'Import lại official: 0 created, toàn update', `c${res3.created}/u${res3.updated}`);
  const { timesheets: tsRows2 } = await listTimesheets(db, orgA, '2026-06');
  check(tsRows2.length === tsRows.length, 'Số timesheet không đổi sau re-import', String(tsRows2.length));

  console.log('=== F3: khóa kỳ chặn import ===');
  const { period } = await listTimesheets(db, orgA, '2026-06');
  await closePeriod(db, orgA, period.id);
  let err = '';
  try { await importBcc(db, orgA, offBcc); } catch (e: any) { err = e.message; }
  check(err.includes('đã khóa'), 'Kỳ closed → từ chối import BCC');

  console.log('=== F3: tenant isolation ===');
  const orgB = randomUUID();
  const { timesheets: tsB } = await listTimesheets(db, orgB, '2026-06');
  check(tsB.length === 0, 'Org B không thấy chấm công org A');

  console.log(`\n   KẾT QUẢ F3 TIMESHEET: ${passed} PASS, ${failed} FAIL`);
  await pg.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('[F3-TIMESHEET]', e); process.exit(1); });
