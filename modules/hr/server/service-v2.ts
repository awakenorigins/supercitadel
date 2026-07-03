// HR v2 — Employees + Attendance. Port domain model từ frappe/hrms (Attendance, Employee Checkin),
// viết lại bằng TS cho Citadel (chiến lược A — sạch license).
import { eq, and, desc, sql } from 'drizzle-orm';
import { hrEmployees, hrAttendance, hrShifts } from './schema.js';
import { Errors } from '@citadel/core';
type DB = any;

// ── Employees ──
export async function listEmployees(db: DB, orgId: string, status?: string) {
  const conds = [eq(hrEmployees.orgId, orgId)];
  if (status) conds.push(eq(hrEmployees.status, status));
  return db.select().from(hrEmployees).where(and(...conds)).orderBy(desc(hrEmployees.createdAt));
}
export async function createEmployee(db: DB, orgId: string, d: { fullName: string; roleTitle?: string; phone?: string; joinedDate?: string; userId?: string }) {
  if (!d.fullName?.trim()) throw Errors.validation('Tên nhân viên trống', 'fullName');
  const [row] = await db.insert(hrEmployees).values({
    orgId, fullName: d.fullName.trim(), roleTitle: d.roleTitle?.trim() || 'Nhân viên',
    phone: d.phone, joinedDate: d.joinedDate, userId: d.userId,
  }).returning();
  return row;
}
export async function updateEmployee(db: DB, orgId: string, id: string, d: { fullName?: string; roleTitle?: string; phone?: string; status?: string }) {
  const patch: Record<string, unknown> = {};
  if (d.fullName?.trim()) patch.fullName = d.fullName.trim();
  if (d.roleTitle?.trim()) patch.roleTitle = d.roleTitle.trim();
  if (d.phone !== undefined) patch.phone = d.phone;
  if (d.status && ['active', 'inactive'].includes(d.status)) patch.status = d.status;
  if (!Object.keys(patch).length) throw Errors.validation('Không có gì để sửa');
  const [row] = await db.update(hrEmployees).set(patch)
    .where(and(eq(hrEmployees.id, id), eq(hrEmployees.orgId, orgId))).returning();
  if (!row) throw Errors.notFound('Không tìm thấy nhân viên');
  return row;
}
async function mustEmployee(db: DB, orgId: string, employeeId: string) {
  const [e] = await db.select().from(hrEmployees)
    .where(and(eq(hrEmployees.id, employeeId), eq(hrEmployees.orgId, orgId)));
  if (!e) throw Errors.notFound('Không tìm thấy nhân viên');
  return e;
}

// ── Attendance ──
const dateStr = (d: Date) => d.toISOString().slice(0, 10);
const hhmm = (d: Date) => d.toTimeString().slice(0, 5);

/** Check-in: 1 record/người/ngày. late_entry nếu vào sau start_time của ca (nếu gắn ca). */
export async function checkIn(db: DB, orgId: string, d: { employeeId: string; shiftId?: string; at?: Date }) {
  await mustEmployee(db, orgId, d.employeeId);
  const now = d.at ?? new Date();
  const today = dateStr(now);
  const [existing] = await db.select().from(hrAttendance).where(and(
    eq(hrAttendance.orgId, orgId), eq(hrAttendance.employeeId, d.employeeId), eq(hrAttendance.attDate, today)));
  if (existing?.checkIn) throw Errors.conflict('Hôm nay đã check-in rồi');
  let late = false;
  if (d.shiftId) {
    const [shift] = await db.select().from(hrShifts)
      .where(and(eq(hrShifts.id, d.shiftId), eq(hrShifts.orgId, orgId)));
    if (!shift) throw Errors.notFound('Không tìm thấy ca');
    late = hhmm(now) > shift.startTime; // so sánh "HH:MM" lexicographic — đúng cho 24h
  }
  if (existing) { // record on_leave có sẵn nhưng vẫn đi làm → chuyển present, giữ ghi chú
    const [row] = await db.update(hrAttendance)
      .set({ checkIn: now, status: 'present', lateEntry: late, shiftId: d.shiftId ?? existing.shiftId })
      .where(eq(hrAttendance.id, existing.id)).returning();
    return row;
  }
  const [row] = await db.insert(hrAttendance).values({
    orgId, employeeId: d.employeeId, attDate: today, checkIn: now, status: 'present', lateEntry: late, shiftId: d.shiftId,
  }).returning();
  return row;
}

/** Check-out: set giờ ra + working_hours (2 chữ số thập phân). */
export async function checkOut(db: DB, orgId: string, d: { employeeId: string; at?: Date }) {
  const now = d.at ?? new Date();
  const today = dateStr(now);
  const [existing] = await db.select().from(hrAttendance).where(and(
    eq(hrAttendance.orgId, orgId), eq(hrAttendance.employeeId, d.employeeId), eq(hrAttendance.attDate, today)));
  if (!existing?.checkIn) throw Errors.validation('Chưa check-in hôm nay');
  if (existing.checkOut) throw Errors.conflict('Đã check-out rồi');
  const hours = Math.max(0, (now.getTime() - new Date(existing.checkIn).getTime()) / 3_600_000);
  const [row] = await db.update(hrAttendance)
    .set({ checkOut: now, workingHours: hours.toFixed(2), status: 'checked_out' })
    .where(eq(hrAttendance.id, existing.id)).returning();
  return row;
}

/** Bảng chấm công theo ngày — kèm tên nhân viên. */
export async function attendanceByDate(db: DB, orgId: string, date: string) {
  return db.select({
    id: hrAttendance.id, employeeId: hrAttendance.employeeId, attDate: hrAttendance.attDate,
    checkIn: hrAttendance.checkIn, checkOut: hrAttendance.checkOut,
    workingHours: hrAttendance.workingHours, status: hrAttendance.status, lateEntry: hrAttendance.lateEntry,
    employeeName: hrEmployees.fullName, roleTitle: hrEmployees.roleTitle,
  }).from(hrAttendance)
    .innerJoin(hrEmployees, eq(hrAttendance.employeeId, hrEmployees.id))
    .where(and(eq(hrAttendance.orgId, orgId), eq(hrAttendance.attDate, date)))
    .orderBy(hrAttendance.checkIn);
}

/** Upsert ngày nghỉ (dùng khi duyệt đơn): không đè ngày đã có check-in. */
export async function markOnLeave(db: DB, orgId: string, employeeId: string, date: string, note: string) {
  await db.insert(hrAttendance)
    .values({ orgId, employeeId, attDate: date, status: 'on_leave', note })
    .onConflictDoUpdate({
      target: [hrAttendance.orgId, hrAttendance.employeeId, hrAttendance.attDate],
      set: { status: sql`CASE WHEN ${hrAttendance.checkIn} IS NULL THEN 'on_leave' ELSE ${hrAttendance.status} END`, note },
    });
}
