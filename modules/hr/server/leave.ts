// HR v2 — Leave. Port domain model từ frappe/hrms (Leave Type, Leave Allocation, Leave Application).
// Quy tắc port: phép có lương (is_paid) phải có allocation và đủ số dư; không lương thì không cần.
// Duyệt đơn → trừ used_days + ghi attendance on_leave từng ngày (không đè ngày đã check-in).
import { eq, and, desc } from 'drizzle-orm';
import { hrLeaveTypes, hrLeaveAllocations, hrLeaveApplications, hrEmployees } from './schema.js';
import { Errors } from '@citadel/core';
import { markOnLeave } from './service-v2.js';
type DB = any;

// ── Leave Types ──
export async function listLeaveTypes(db: DB, orgId: string) {
  return db.select().from(hrLeaveTypes).where(eq(hrLeaveTypes.orgId, orgId)).orderBy(hrLeaveTypes.createdAt);
}
export async function createLeaveType(db: DB, orgId: string, d: { name: string; daysPerYear?: number; isPaid?: boolean; carryForward?: boolean }) {
  if (!d.name?.trim()) throw Errors.validation('Tên loại phép trống', 'name');
  const [dup] = await db.select().from(hrLeaveTypes)
    .where(and(eq(hrLeaveTypes.orgId, orgId), eq(hrLeaveTypes.name, d.name.trim())));
  if (dup) throw Errors.conflict('Loại phép đã tồn tại');
  const [row] = await db.insert(hrLeaveTypes).values({
    orgId, name: d.name.trim(), daysPerYear: String(d.daysPerYear ?? 12),
    isPaid: d.isPaid ?? true, carryForward: d.carryForward ?? false,
  }).returning();
  return row;
}

// ── Allocations ──
export async function allocateLeave(db: DB, orgId: string, d: { employeeId: string; leaveTypeId: string; year: number; days: number }) {
  if (!(d.days > 0)) throw Errors.validation('Số ngày cấp phải > 0', 'days');
  const [existing] = await db.select().from(hrLeaveAllocations).where(and(
    eq(hrLeaveAllocations.orgId, orgId), eq(hrLeaveAllocations.employeeId, d.employeeId),
    eq(hrLeaveAllocations.leaveTypeId, d.leaveTypeId), eq(hrLeaveAllocations.year, d.year)));
  if (existing) {
    const [row] = await db.update(hrLeaveAllocations).set({ allocatedDays: String(d.days) })
      .where(eq(hrLeaveAllocations.id, existing.id)).returning();
    return row;
  }
  const [row] = await db.insert(hrLeaveAllocations).values({
    orgId, employeeId: d.employeeId, leaveTypeId: d.leaveTypeId, year: d.year, allocatedDays: String(d.days),
  }).returning();
  return row;
}

/** Số dư phép của một nhân viên trong năm — theo từng loại. */
export async function leaveBalance(db: DB, orgId: string, employeeId: string, year: number) {
  const rows = await db.select({
    leaveTypeId: hrLeaveAllocations.leaveTypeId, typeName: hrLeaveTypes.name, isPaid: hrLeaveTypes.isPaid,
    allocatedDays: hrLeaveAllocations.allocatedDays, usedDays: hrLeaveAllocations.usedDays,
  }).from(hrLeaveAllocations)
    .innerJoin(hrLeaveTypes, eq(hrLeaveAllocations.leaveTypeId, hrLeaveTypes.id))
    .where(and(eq(hrLeaveAllocations.orgId, orgId), eq(hrLeaveAllocations.employeeId, employeeId), eq(hrLeaveAllocations.year, year)));
  return rows.map((r: any) => ({ ...r, remaining: Number(r.allocatedDays) - Number(r.usedDays) }));
}

// ── Applications ──
const DAY = 86_400_000;
export function countDays(fromDate: string, toDate: string, halfDay: boolean): number {
  const f = new Date(fromDate + 'T00:00:00Z').getTime();
  const t = new Date(toDate + 'T00:00:00Z').getTime();
  if (Number.isNaN(f) || Number.isNaN(t) || t < f) throw Errors.validation('Khoảng ngày không hợp lệ', 'toDate');
  const days = Math.round((t - f) / DAY) + 1;
  if (halfDay && days === 1) return 0.5;
  return days;
}
function* eachDate(fromDate: string, toDate: string) {
  for (let ts = new Date(fromDate + 'T00:00:00Z').getTime(), end = new Date(toDate + 'T00:00:00Z').getTime(); ts <= end; ts += DAY)
    yield new Date(ts).toISOString().slice(0, 10);
}
async function allocationOf(db: DB, orgId: string, employeeId: string, leaveTypeId: string, year: number) {
  const [a] = await db.select().from(hrLeaveAllocations).where(and(
    eq(hrLeaveAllocations.orgId, orgId), eq(hrLeaveAllocations.employeeId, employeeId),
    eq(hrLeaveAllocations.leaveTypeId, leaveTypeId), eq(hrLeaveAllocations.year, year)));
  return a;
}

export async function applyLeave(db: DB, orgId: string, d: { employeeId: string; leaveTypeId: string; fromDate: string; toDate: string; halfDay?: boolean; reason?: string }) {
  const [emp] = await db.select().from(hrEmployees).where(and(eq(hrEmployees.id, d.employeeId), eq(hrEmployees.orgId, orgId)));
  if (!emp) throw Errors.notFound('Không tìm thấy nhân viên');
  const [lt] = await db.select().from(hrLeaveTypes).where(and(eq(hrLeaveTypes.id, d.leaveTypeId), eq(hrLeaveTypes.orgId, orgId)));
  if (!lt) throw Errors.notFound('Không tìm thấy loại phép');
  const total = countDays(d.fromDate, d.toDate, d.halfDay ?? false);
  if (lt.isPaid) { // phép có lương: phải có allocation và đủ số dư ngay lúc nộp (fail sớm)
    const alloc = await allocationOf(db, orgId, d.employeeId, d.leaveTypeId, new Date(d.fromDate).getUTCFullYear());
    if (!alloc) throw Errors.validation('Chưa được cấp loại phép này trong năm', 'leaveTypeId');
    const remaining = Number(alloc.allocatedDays) - Number(alloc.usedDays);
    if (total > remaining) throw Errors.conflict(`Không đủ số dư phép (còn ${remaining}, xin ${total})`);
  }
  const [row] = await db.insert(hrLeaveApplications).values({
    orgId, employeeId: d.employeeId, leaveTypeId: d.leaveTypeId,
    fromDate: d.fromDate, toDate: d.toDate, halfDay: d.halfDay ?? false,
    totalDays: String(total), reason: d.reason,
  }).returning();
  return row;
}

export async function listApplications(db: DB, orgId: string, status?: string) {
  const conds = [eq(hrLeaveApplications.orgId, orgId)];
  if (status) conds.push(eq(hrLeaveApplications.status, status));
  return db.select({
    id: hrLeaveApplications.id, employeeId: hrLeaveApplications.employeeId,
    employeeName: hrEmployees.fullName, typeName: hrLeaveTypes.name,
    fromDate: hrLeaveApplications.fromDate, toDate: hrLeaveApplications.toDate,
    halfDay: hrLeaveApplications.halfDay, totalDays: hrLeaveApplications.totalDays,
    reason: hrLeaveApplications.reason, status: hrLeaveApplications.status,
    createdAt: hrLeaveApplications.createdAt,
  }).from(hrLeaveApplications)
    .innerJoin(hrEmployees, eq(hrLeaveApplications.employeeId, hrEmployees.id))
    .innerJoin(hrLeaveTypes, eq(hrLeaveApplications.leaveTypeId, hrLeaveTypes.id))
    .where(and(...conds)).orderBy(desc(hrLeaveApplications.createdAt));
}

export async function decideLeave(db: DB, orgId: string, applicationId: string, approve: boolean, approverUserId: string) {
  const [app] = await db.select().from(hrLeaveApplications).where(and(
    eq(hrLeaveApplications.id, applicationId), eq(hrLeaveApplications.orgId, orgId)));
  if (!app) throw Errors.notFound('Không tìm thấy đơn');
  if (app.status !== 'open') throw Errors.conflict(`Đơn đã ở trạng thái "${app.status}"`);
  if (!approve) {
    const [row] = await db.update(hrLeaveApplications)
      .set({ status: 'rejected', approverUserId, decidedAt: new Date() })
      .where(eq(hrLeaveApplications.id, applicationId)).returning();
    return row;
  }
  const [lt] = await db.select().from(hrLeaveTypes).where(eq(hrLeaveTypes.id, app.leaveTypeId));
  if (lt.isPaid) { // re-check + trừ số dư tại thời điểm duyệt
    const year = new Date(app.fromDate).getUTCFullYear();
    const alloc = await allocationOf(db, orgId, app.employeeId, app.leaveTypeId, year);
    const remaining = alloc ? Number(alloc.allocatedDays) - Number(alloc.usedDays) : 0;
    if (!alloc || Number(app.totalDays) > remaining) throw Errors.conflict(`Không đủ số dư phép (còn ${remaining})`);
    await db.update(hrLeaveAllocations)
      .set({ usedDays: String(Number(alloc.usedDays) + Number(app.totalDays)) })
      .where(eq(hrLeaveAllocations.id, alloc.id));
  }
  for (const day of eachDate(app.fromDate, app.toDate))
    await markOnLeave(db, orgId, app.employeeId, day, `Nghỉ phép: ${lt.name}`);
  const [row] = await db.update(hrLeaveApplications)
    .set({ status: 'approved', approverUserId, decidedAt: new Date() })
    .where(eq(hrLeaveApplications.id, applicationId)).returning();
  return row;
}
