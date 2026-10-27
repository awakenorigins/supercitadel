/**
 * SOUL-MANAGER — recruitment.service
 * Tuyển dụng: vị trí tuyển (get-or-create theo tiêu đề), ứng viên,
 * pipeline 6 stage: applied → screening → interview → offer → hired | rejected.
 */
import { and, desc, eq, ilike, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { hrCandidates, hrJobOpenings } from '../db/schema.js';
import type { candidateAdvanceSchema, recruitmentPipelineSchema } from '../validation/schemas.js';
import { HrError, type HrCtx } from '../types.js';

async function ensureOpening(ctx: HrCtx, title: string, createIfMissing: boolean) {
  const [found] = await ctx.db.select().from(hrJobOpenings).where(and(
    eq(hrJobOpenings.orgId, ctx.orgId), ilike(hrJobOpenings.title, title),
  )).limit(1);
  if (found) return found;
  if (!createIfMissing) {
    throw new HrError('OPENING_NOT_FOUND', `Không có vị trí tuyển "${title}"`, { title });
  }
  const [created] = await ctx.db.insert(hrJobOpenings)
    .values({ orgId: ctx.orgId, title: title.trim() }).returning();
  return created!;
}

/** Thêm ứng viên mới hoặc chuyển stage — một action cho Tiểu Tâm */
export async function candidateAdvance(ctx: HrCtx, input: z.infer<typeof candidateAdvanceSchema>) {
  const opening = await ensureOpening(ctx, input.opening_title, input.mode === 'add');

  if (input.mode === 'add') {
    const [cand] = await ctx.db.insert(hrCandidates).values({
      orgId: ctx.orgId, openingId: opening.id,
      fullName: input.full_name, email: input.email ?? null,
      phone: input.phone ?? null,
      stage: input.stage ?? 'applied', note: input.note ?? null,
    }).returning();
    await ctx.bus.emit('hr.candidate.stage_changed', {
      org_id: ctx.orgId, candidate_id: cand!.id, candidate: cand!.fullName,
      opening: opening.title, from: null, to: cand!.stage,
    });
    return {
      candidate_id: cand!.id, candidate: cand!.fullName,
      opening: opening.title, stage: cand!.stage,
    };
  }

  // mode = move
  const conds = [
    eq(hrCandidates.orgId, ctx.orgId),
    eq(hrCandidates.openingId, opening.id),
    ilike(hrCandidates.fullName, input.full_name),
  ];
  if (input.email) conds.push(eq(hrCandidates.email, input.email));
  const [cand] = await ctx.db.select().from(hrCandidates)
    .where(and(...conds)).orderBy(desc(hrCandidates.createdAt)).limit(1);
  if (!cand) {
    throw new HrError('CANDIDATE_NOT_FOUND',
      `Không tìm thấy ứng viên "${input.full_name}" cho vị trí "${opening.title}"`,
      { full_name: input.full_name, opening: opening.title });
  }
  if (!input.stage) throw new HrError('INVALID_INPUT', 'mode=move cần chỉ định stage đích');

  const from = cand.stage;
  const [moved] = await ctx.db.update(hrCandidates)
    .set({ stage: input.stage, note: input.note ?? cand.note, updatedAt: new Date() })
    .where(and(eq(hrCandidates.orgId, ctx.orgId), eq(hrCandidates.id, cand.id)))
    .returning();

  await ctx.bus.emit('hr.candidate.stage_changed', {
    org_id: ctx.orgId, candidate_id: cand.id, candidate: cand.fullName,
    opening: opening.title, from, to: moved!.stage,
    hired: moved!.stage === 'hired',
  });
  return {
    candidate_id: cand.id, candidate: cand.fullName, opening: opening.title,
    from, to: moved!.stage,
    ...(moved!.stage === 'hired'
      ? { next_step: 'Ứng viên đã trúng tuyển — dùng hr.employee.create để lập hồ sơ nhân viên' }
      : {}),
  };
}

/** Pipeline tuyển dụng: đếm ứng viên theo stage cho từng vị trí */
export async function recruitmentPipeline(ctx: HrCtx, input: z.infer<typeof recruitmentPipelineSchema>) {
  const conds = [eq(hrJobOpenings.orgId, ctx.orgId)];
  if (input.opening_title) conds.push(ilike(hrJobOpenings.title, `%${input.opening_title}%`));
  const openings = await ctx.db.select().from(hrJobOpenings).where(and(...conds));

  const counts = await ctx.db.select({
    openingId: hrCandidates.openingId,
    stage: hrCandidates.stage,
    count: sql<number>`count(*)::int`,
  }).from(hrCandidates)
    .where(eq(hrCandidates.orgId, ctx.orgId))
    .groupBy(hrCandidates.openingId, hrCandidates.stage);

  return {
    openings: openings.map((o) => {
      const stages: Record<string, number> = {};
      for (const c of counts.filter((x) => x.openingId === o.id)) stages[c.stage] = c.count;
      return {
        title: o.title, status: o.status, headcount: o.headcount,
        stages, total_candidates: Object.values(stages).reduce((a, b) => a + b, 0),
      };
    }),
  };
}
