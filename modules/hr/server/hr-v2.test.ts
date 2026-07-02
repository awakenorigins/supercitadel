// hr-v2.test.ts — verify thật trên PGlite: vòng đời nhân viên → chấm công → nghỉ phép.
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import * as hr from './schema.js';
import { createShift } from './service.js';
import { createEmployee, listEmployees, updateEmployee, checkIn, checkOut, attendanceByDate } from './service-v2.js';
import { createLeaveType, allocateLeave, leaveBalance, applyLeave, listApplications, decideLeave, countDays } from './leave.js';

function assert(c: unknown, m: string) { if (!c) { console.error('  ✗', m); process.exitCode = 1; throw new Error(m); } console.log('  ✓', m); }
async function expectErr(fn: () => Promise<unknown>, code: number, m: string) {
  try { await fn(); assert(false, m + ' (không throw)'); }
  catch (e: any) { assert(e?.status === code, `${m} (status=${e?.status})`); }
}
const ORG = 'aaaaaaaa-0000-0000-0000-000000000001';
const ORG_B = 'bbbbbbbb-0000-0000-0000-000000000002';

const client = new PGlite();
await client.exec(readFileSync(new URL('../migrations/0001_hr.sql', import.meta.url), 'utf8'));
await client.exec(readFileSync(new URL('../migrations/0002_hr_v2.sql', import.meta.url), 'utf8'));
const db = drizzle(client, { schema: hr }) as any;
const today = new Date().toISOString().slice(0, 10);

// ── Employees ──
const lan = await createEmployee(db, ORG, { fullName: 'Lan Phạm', roleTitle: 'Quản lý ca', phone: '0901' });
await createEmployee(db, ORG, { fullName: 'Tú Lê' });
assert((await listEmployees(db, ORG)).length === 2, 'tạo 2 nhân viên');
const upd = await updateEmployee(db, ORG, lan.id, { roleTitle: 'Trưởng ca' });
assert(upd.roleTitle === 'Trưởng ca', 'sửa chức danh');
assert((await listEmployees(db, ORG_B)).length === 0, 'tenant isolation employees');

// ── Attendance: check-in với ca → late ──
const caToi = await createShift(db, ORG, { name: 'Ca Tối', shiftDate: today, startTime: '17:00', endTime: '22:00' });
const lateTime = new Date(); lateTime.setHours(18, 30, 0, 0); // 18:30 > 17:00 → late
const att1 = await checkIn(db, ORG, { employeeId: lan.id, shiftId: caToi.id, at: lateTime });
assert(att1.status === 'present' && att1.lateEntry === true, 'check-in 18:30 ca 17:00 → late_entry');
await expectErr(() => checkIn(db, ORG, { employeeId: lan.id }), 409, 'check-in lần 2 trong ngày → 409');
const outTime = new Date(lateTime.getTime() + 3.5 * 3_600_000);
const att2 = await checkOut(db, ORG, { employeeId: lan.id, at: outTime });
assert(Number(att2.workingHours) === 3.5, `check-out → working_hours 3.5 (=${att2.workingHours})`);
await expectErr(() => checkOut(db, ORG, { employeeId: lan.id, at: outTime }), 409, 'check-out lần 2 → 409');
const board = await attendanceByDate(db, ORG, today);
assert(board.length === 1 && board[0].employeeName === 'Lan Phạm', 'bảng chấm công hôm nay join tên');

// ── Leave: countDays thuần ──
assert(countDays('2026-06-15', '2026-06-17', false) === 3, 'countDays 15→17 = 3');
assert(countDays('2026-06-15', '2026-06-15', true) === 0.5, 'half-day = 0.5');

// ── Leave full cycle ──
const phepNam = await createLeaveType(db, ORG, { name: 'Phép năm', daysPerYear: 12, isPaid: true });
await createLeaveType(db, ORG, { name: 'Không lương', isPaid: false });
await expectErr(() => createLeaveType(db, ORG, { name: 'Phép năm' }), 409, 'loại phép trùng tên → 409');
// chưa cấp phép mà xin paid → 400
await expectErr(() => applyLeave(db, ORG, { employeeId: lan.id, leaveTypeId: phepNam.id, fromDate: '2026-06-15', toDate: '2026-06-16' }), 400, 'xin phép paid khi chưa allocate → 400');
await allocateLeave(db, ORG, { employeeId: lan.id, leaveTypeId: phepNam.id, year: 2026, days: 12 });
let bal = await leaveBalance(db, ORG, lan.id, 2026);
assert(bal[0].remaining === 12, 'số dư sau cấp = 12');
// xin 3 ngày
const app1 = await applyLeave(db, ORG, { employeeId: lan.id, leaveTypeId: phepNam.id, fromDate: '2026-06-15', toDate: '2026-06-17', reason: 'Về quê' });
assert(Number(app1.totalDays) === 3 && app1.status === 'open', 'đơn 3 ngày, status open');
// duyệt → trừ số dư + attendance on_leave 3 ngày
const ok1 = await decideLeave(db, ORG, app1.id, true, 'cccccccc-0000-0000-0000-000000000009');
assert(ok1.status === 'approved', 'duyệt đơn → approved');
bal = await leaveBalance(db, ORG, lan.id, 2026);
assert(bal[0].remaining === 9, 'số dư 12 − 3 = 9');
const att15 = await attendanceByDate(db, ORG, '2026-06-15');
assert(att15.length === 1 && att15[0].status === 'on_leave', 'attendance 15/6 = on_leave (tự ghi)');
await expectErr(() => decideLeave(db, ORG, app1.id, true, 'cccccccc-0000-0000-0000-000000000009'), 409, 'duyệt lại đơn đã duyệt → 409');
// xin vượt số dư (10 > 9) → fail sớm lúc nộp
await expectErr(() => applyLeave(db, ORG, { employeeId: lan.id, leaveTypeId: phepNam.id, fromDate: '2026-07-01', toDate: '2026-07-10' }), 409, 'xin 10 ngày khi còn 9 → 409');
// đơn khác → reject không trừ
const app2 = await applyLeave(db, ORG, { employeeId: lan.id, leaveTypeId: phepNam.id, fromDate: '2026-08-03', toDate: '2026-08-04' });
await decideLeave(db, ORG, app2.id, false, 'cccccccc-0000-0000-0000-000000000009');
bal = await leaveBalance(db, ORG, lan.id, 2026);
assert(bal[0].remaining === 9, 'reject không trừ số dư (vẫn 9)');
const opens = await listApplications(db, ORG, 'open');
assert(opens.length === 0, 'không còn đơn open');
// nghỉ không lương: không cần allocation
const lwp = (await listApplications(db, ORG)).length;
const ltUnpaid = (await db.select().from(hr.hrLeaveTypes))[1];
const app3 = await applyLeave(db, ORG, { employeeId: lan.id, leaveTypeId: ltUnpaid.id, fromDate: '2026-09-01', toDate: '2026-09-01' });
assert(app3.status === 'open' && (await listApplications(db, ORG)).length === lwp + 1, 'không lương: xin được không cần allocation');
// on_leave rồi vẫn đi làm → check-in chuyển present
await decideLeave(db, ORG, app3.id, true, 'cccccccc-0000-0000-0000-000000000009');
const ciDate = new Date('2026-09-01T08:00:00');
const att3 = await checkIn(db, ORG, { employeeId: lan.id, at: ciDate });
assert(att3.status === 'present' && att3.attDate === '2026-09-01', 'on_leave nhưng đi làm → check-in chuyển present');

console.log('[hr-v2] ALL PASSED');
