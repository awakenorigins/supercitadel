// HR service — ca làm theo ngày, staff là danh sách tên (CSV) cho gọn.
import { eq, and, asc } from 'drizzle-orm';
import { hrShifts } from './schema.js';
import { Errors } from '@citadel/core';
type DB = any;

export async function listShifts(db: DB, orgId: string, dateStr?: string) {
  const conds = [eq(hrShifts.orgId, orgId)];
  if (dateStr) conds.push(eq(hrShifts.shiftDate, dateStr));
  return db.select().from(hrShifts).where(and(...conds)).orderBy(asc(hrShifts.shiftDate), asc(hrShifts.startTime));
}
export async function createShift(db: DB, orgId: string, d: { name: string; shiftDate: string; startTime: string; endTime: string; staff?: string[]; note?: string }) {
  if (!d.name?.trim()) throw Errors.validation('Tên ca trống', 'name');
  if (!d.shiftDate) throw Errors.validation('Thiếu ngày', 'shiftDate');
  const [row] = await db.insert(hrShifts).values({ orgId, name: d.name, shiftDate: d.shiftDate, startTime: d.startTime ?? '08:00', endTime: d.endTime ?? '17:00', staff: (d.staff ?? []).join(', '), note: d.note }).returning();
  return row;
}
export async function assignStaff(db: DB, orgId: string, id: string, staff: string[]) {
  const [row] = await db.update(hrShifts).set({ staff: staff.join(', ') })
    .where(and(eq(hrShifts.id, id), eq(hrShifts.orgId, orgId))).returning();
  if (!row) throw Errors.notFound('Không tìm thấy ca');
  return row;
}
