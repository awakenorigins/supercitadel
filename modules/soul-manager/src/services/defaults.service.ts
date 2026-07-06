/**
 * SOUL-MANAGER — defaults.service
 * Seed mặc định PER-ORG (idempotent, gọi lười tại điểm dùng đầu tiên):
 *   - 4 loại phép chuẩn Luật Lao động VN
 *   - Ca hành chính HC 08:00–17:00
 *   - Dòng hr_settings với policy rỗng (merge DEFAULT_POLICY lúc đọc)
 */
import { and, eq } from 'drizzle-orm';
import { hrLeaveTypes, hrSettings, hrShifts } from '../db/schema.js';
import { mergePolicy, type HrPolicy } from '../config.js';
import type { HrCtx } from '../types.js';

export async function ensureLeaveTypes(ctx: HrCtx): Promise<void> {
  await ctx.db.insert(hrLeaveTypes).values([
    // Điều 113 BLLĐ 2019: 12 ngày phép năm điều kiện bình thường
    { orgId: ctx.orgId, code: 'PHEP-NAM', name: 'Phép năm', paid: true, annualQuota: '12' },
    // Ốm đau hưởng chế độ BHXH chi trả (không phải lương DN) → paid=false
    { orgId: ctx.orgId, code: 'OM', name: 'Nghỉ ốm (BHXH chi trả)', paid: false, annualQuota: null },
    { orgId: ctx.orgId, code: 'THAI-SAN', name: 'Thai sản (BHXH chi trả)', paid: false, annualQuota: null },
    { orgId: ctx.orgId, code: 'KHONG-LUONG', name: 'Nghỉ không lương', paid: false, annualQuota: null },
  ]).onConflictDoNothing();
}

export async function ensureDefaultShift(ctx: HrCtx) {
  await ctx.db.insert(hrShifts).values({
    orgId: ctx.orgId, code: 'HC', name: 'Ca hành chính',
    startTime: '08:00:00', endTime: '17:00:00', breakMinutes: 60, workHours: '8',
  }).onConflictDoNothing();
  const [shift] = await ctx.db.select().from(hrShifts).where(and(
    eq(hrShifts.orgId, ctx.orgId), eq(hrShifts.code, 'HC'),
  )).limit(1);
  return shift!;
}

export interface HrOrgSettings {
  standardWorkDays: string;
  workHoursPerDay: string;
  defaultRegion: number;
  policy: HrPolicy;
}

/** Đọc (tạo nếu chưa có) cấu hình HR của org — policy đã merge DEFAULT_POLICY */
export async function getSettings(ctx: HrCtx): Promise<HrOrgSettings> {
  await ctx.db.insert(hrSettings)
    .values({ orgId: ctx.orgId })
    .onConflictDoNothing();
  const [row] = await ctx.db.select().from(hrSettings)
    .where(eq(hrSettings.orgId, ctx.orgId)).limit(1);
  return {
    standardWorkDays: row!.standardWorkDays,
    workHoursPerDay: row!.workHoursPerDay,
    defaultRegion: row!.defaultRegion,
    policy: mergePolicy(row!.policy),
  };
}
