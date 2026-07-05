/**
 * SOUL-MANAGER — training.service
 * Đào tạo: khóa học, ghi danh (idempotent), hoàn thành kèm điểm.
 */
import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { hrCourses, hrEnrollments } from '../db/schema.js';
import type { trainingManageSchema } from '../validation/schemas.js';
import { HrError, type HrCtx } from '../types.js';
import { getEmployeeByCode } from './employee.service.js';

async function getCourse(ctx: HrCtx, code: string) {
  const [course] = await ctx.db.select().from(hrCourses).where(and(
    eq(hrCourses.orgId, ctx.orgId), eq(hrCourses.code, code),
  )).limit(1);
  if (!course) throw new HrError('COURSE_NOT_FOUND', `Không có khóa học ${code}`, { code });
  return course;
}

export async function trainingManage(ctx: HrCtx, input: z.infer<typeof trainingManageSchema>) {
  if (input.mode === 'create_course') {
    if (!input.course_name) throw new HrError('INVALID_INPUT', 'create_course cần course_name');
    const [created] = await ctx.db.insert(hrCourses).values({
      orgId: ctx.orgId, code: input.course_code, name: input.course_name,
      hours: input.hours ?? null,
    }).onConflictDoNothing().returning();
    const course = created ?? await getCourse(ctx, input.course_code);
    await ctx.bus.emit('hr.training.course_created', {
      org_id: ctx.orgId, course_code: course.code, name: course.name,
    });
    return { course_code: course.code, name: course.name, hours: course.hours };
  }

  if (!input.employee_code) {
    throw new HrError('INVALID_INPUT', `${input.mode} cần employee_code`);
  }
  const course = await getCourse(ctx, input.course_code);
  const emp = await getEmployeeByCode(ctx, input.employee_code);

  if (input.mode === 'enroll') {
    await ctx.db.insert(hrEnrollments).values({
      orgId: ctx.orgId, courseId: course.id, employeeId: emp.id,
    }).onConflictDoNothing();
    const [enr] = await ctx.db.select().from(hrEnrollments).where(and(
      eq(hrEnrollments.orgId, ctx.orgId),
      eq(hrEnrollments.courseId, course.id),
      eq(hrEnrollments.employeeId, emp.id),
    )).limit(1);
    await ctx.bus.emit('hr.training.enrolled', {
      org_id: ctx.orgId, course_code: course.code, employee_code: emp.code,
    });
    return {
      course_code: course.code, employee_code: emp.code, status: enr!.status,
    };
  }

  // mode = complete
  const [done] = await ctx.db.update(hrEnrollments).set({
    status: 'completed',
    score: input.score ?? null,
    completedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(hrEnrollments.orgId, ctx.orgId),
    eq(hrEnrollments.courseId, course.id),
    eq(hrEnrollments.employeeId, emp.id),
  )).returning();
  if (!done) {
    throw new HrError('ENROLLMENT_NOT_FOUND',
      `${emp.code} chưa ghi danh khóa ${course.code}`,
      { employee_code: emp.code, course_code: course.code });
  }
  await ctx.bus.emit('hr.training.completed', {
    org_id: ctx.orgId, course_code: course.code, employee_code: emp.code,
    score: done.score,
  });
  return {
    course_code: course.code, employee_code: emp.code,
    status: done.status, score: done.score,
  };
}
