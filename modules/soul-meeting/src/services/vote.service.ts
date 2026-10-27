/**
 * SOUL-MEETING 1A — vote.service
 * Quyết định + Biểu quyết. Quorum 2 chế độ:
 *  · headcount: % ĐẦU NGƯỜI dự họp / tổng người đủ tư cách (role ≠ informed)
 *  · capital_pct: % VỐN — vote_weight nhập là %% vốn điều lệ của từng thành viên;
 *    quorum so Σ%%(dự họp) với ngưỡng (chuẩn họp HĐTV Luật DN 2020 — ngưỡng config).
 * Phiếu hợp lệ chốt TẠI THỜI ĐIỂM ĐÓNG: người bỏ phiếu phải đang dự họp
 * (present/late) — bỏ phiếu xong bỏ về giữa chừng vẫn hợp lệ vì attendance giữ present.
 * pass_basis: 'attending' (mẫu số = người/vốn DỰ HỌP — phiếu trắng tính như chống,
 * đúng tinh thần luật) | 'total' (mẫu số = toàn bộ đủ tư cách).
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';
import type { SmCtx } from '../types.js';
import { SmError, nowOf } from '../types.js';
import { smDecisions, smVotes, smVoteBallots, smParticipants } from '../db/schema.js';
import { writeAudit, getMeeting, getVote, getParticipant } from './common.js';
import type {
  decisionAddSchema, voteCreateSchema, ballotCastSchema, voteCloseSchema,
} from '../validation/schemas.js';

const DEFAULT_OPTIONS = ['Tán thành', 'Không tán thành', 'Không có ý kiến'];

// ── DECISIONS ────────────────────────────────────────────────────────────────
export async function addDecision(ctx: SmCtx, input: z.infer<typeof decisionAddSchema>) {
  const m = await getMeeting(ctx, input.meeting_id);
  if (m.status === 'cancelled') throw new SmError('MEETING_STATUS_INVALID', 'Họp đã hủy');
  if (input.method === 'vote') {
    if (!input.vote_id) throw new SmError('INVALID_INPUT', 'method=vote cần vote_id');
    const v = await getVote(ctx, input.vote_id);
    if (v.meetingId !== input.meeting_id) throw new SmError('VOTE_NOT_FOUND', 'Vote không thuộc cuộc họp này');
    if (v.status !== 'closed') throw new SmError('VOTE_STILL_OPEN', 'Đóng biểu quyết trước khi ghi quyết định');
  }
  const rows = await ctx.db.insert(smDecisions).values({
    orgId: ctx.orgId, meetingId: input.meeting_id, agendaItemId: input.agenda_item_id,
    content: input.content, method: input.method, voteId: input.vote_id,
    decidedAt: nowOf(ctx), createdBy: ctx.userId,
  }).returning();
  await writeAudit(ctx, { action: 'sm.decision.add', entity: 'smeet_decisions', entityId: rows[0]!.id, after: input });
  await ctx.bus.emit('sm.decision.recorded', { org_id: ctx.orgId, meeting_id: input.meeting_id, decision_id: rows[0]!.id });
  return rows[0]!;
}

export async function listDecisions(ctx: SmCtx, meetingId: string) {
  await getMeeting(ctx, meetingId);
  return ctx.db.select().from(smDecisions)
    .where(and(eq(smDecisions.orgId, ctx.orgId), eq(smDecisions.meetingId, meetingId)))
    .orderBy(asc(smDecisions.decidedAt));
}

// ── VOTES ────────────────────────────────────────────────────────────────────
export async function createVote(ctx: SmCtx, input: z.infer<typeof voteCreateSchema>) {
  const m = await getMeeting(ctx, input.meeting_id);
  if (m.status !== 'in_progress') throw new SmError('MEETING_STATUS_INVALID', 'Chỉ mở biểu quyết khi đang họp');
  const options = input.options ?? DEFAULT_OPTIONS;
  const passOption = input.pass_option ?? options[0]!;
  if (!options.includes(passOption)) throw new SmError('CHOICE_INVALID', 'pass_option phải nằm trong options');
  const rows = await ctx.db.insert(smVotes).values({
    orgId: ctx.orgId, meetingId: input.meeting_id, agendaItemId: input.agenda_item_id,
    question: input.question, options,
    quorumMode: input.quorum_mode, quorumThreshold: String(input.quorum_threshold),
    passThreshold: String(input.pass_threshold), passBasis: input.pass_basis,
    passOption, openedAt: nowOf(ctx), createdBy: ctx.userId,
  }).returning();
  await writeAudit(ctx, { action: 'sm.vote.create', entity: 'smeet_votes', entityId: rows[0]!.id, after: { question: input.question } });
  return rows[0]!;
}

export async function castBallot(ctx: SmCtx, input: z.infer<typeof ballotCastSchema>) {
  const v = await getVote(ctx, input.vote_id);
  if (v.status !== 'open') throw new SmError('VOTE_CLOSED', 'Biểu quyết đã đóng');
  const p = await getParticipant(ctx, input.participant_id);
  if (p.meetingId !== v.meetingId) throw new SmError('PARTICIPANT_INVALID', 'Người này không thuộc cuộc họp của biểu quyết');
  if (p.role === 'informed') throw new SmError('PARTICIPANT_INVALID', 'Vai trò "được thông báo" không có quyền biểu quyết');
  const options = (v.options ?? []) as string[];
  if (!options.includes(input.choice)) throw new SmError('CHOICE_INVALID', `Phương án không hợp lệ. Chọn: ${options.join(' / ')}`);
  const rows = await ctx.db.insert(smVoteBallots).values({
    orgId: ctx.orgId, voteId: input.vote_id, participantId: input.participant_id,
    choice: input.choice, weight: p.voteWeight, castAt: nowOf(ctx),
  }).onConflictDoUpdate({
    target: [smVoteBallots.voteId, smVoteBallots.participantId],
    set: { choice: input.choice, weight: p.voteWeight, castAt: nowOf(ctx), isValid: true },
  }).returning();
  await writeAudit(ctx, { action: 'sm.vote.cast', entity: 'smeet_vote_ballots', entityId: rows[0]!.id, after: { vote_id: input.vote_id } });
  return rows[0]!;
}

export interface VoteResult {
  quorum_mode: string; quorum_met: boolean;
  eligible_count: number; attending_count: number;
  eligible_weight: number; present_weight: number;
  quorum_metric: number; quorum_threshold: number;
  tallies: Record<string, { count: number; weight: number }>;
  invalid_count: number;
  pass_option: string; pass_basis: string;
  pass_metric: number; pass_threshold: number; passed: boolean;
}

export async function closeVote(ctx: SmCtx, input: z.infer<typeof voteCloseSchema>): Promise<{ vote: unknown; result: VoteResult }> {
  const v = await getVote(ctx, input.vote_id);
  if (v.status !== 'open') throw new SmError('VOTE_CLOSED', 'Biểu quyết đã đóng rồi');

  const parts = await ctx.db.select().from(smParticipants)
    .where(and(eq(smParticipants.orgId, ctx.orgId), eq(smParticipants.meetingId, v.meetingId)));
  const eligible = parts.filter((p) => p.role !== 'informed');
  const attendingIds = new Set(eligible.filter((p) => p.attendance === 'present' || p.attendance === 'late').map((p) => p.id));
  const eligibleWeight = eligible.reduce((s, p) => s + Number(p.voteWeight), 0);
  const presentWeight = eligible.filter((p) => attendingIds.has(p.id)).reduce((s, p) => s + Number(p.voteWeight), 0);
  const eligibleCount = eligible.length;
  const attendingCount = attendingIds.size;

  // quorum
  const quorumThreshold = Number(v.quorumThreshold);
  let quorumMetric = 100; let quorumMet = true;
  if (v.quorumMode === 'headcount') {
    quorumMetric = eligibleCount > 0 ? (attendingCount / eligibleCount) * 100 : 0;
    quorumMet = quorumMetric >= quorumThreshold;
  } else if (v.quorumMode === 'capital_pct') {
    quorumMetric = presentWeight; // Σ % vốn điều lệ của người DỰ HỌP
    quorumMet = quorumMetric >= quorumThreshold;
  }

  // đánh dấu hợp lệ theo attendance tại thời điểm đóng
  const ballots = await ctx.db.select().from(smVoteBallots)
    .where(and(eq(smVoteBallots.orgId, ctx.orgId), eq(smVoteBallots.voteId, v.id)));
  const invalidIds = ballots.filter((b) => !attendingIds.has(b.participantId)).map((b) => b.id);
  if (invalidIds.length > 0) {
    await ctx.db.update(smVoteBallots).set({ isValid: false })
      .where(and(eq(smVoteBallots.orgId, ctx.orgId), inArray(smVoteBallots.id, invalidIds)));
  }
  const valid = ballots.filter((b) => attendingIds.has(b.participantId));

  const tallies: Record<string, { count: number; weight: number }> = {};
  for (const opt of (v.options ?? []) as string[]) tallies[opt] = { count: 0, weight: 0 };
  for (const b of valid) {
    const t = tallies[b.choice] ?? (tallies[b.choice] = { count: 0, weight: 0 });
    t.count += 1; t.weight += Number(b.weight);
  }

  const passThreshold = Number(v.passThreshold);
  const passTally = tallies[v.passOption] ?? { count: 0, weight: 0 };
  let passMetric = 0;
  if (v.quorumMode === 'capital_pct') {
    const denom = v.passBasis === 'total' ? eligibleWeight : presentWeight;
    passMetric = denom > 0 ? (passTally.weight / denom) * 100 : 0;
  } else {
    const denom = v.passBasis === 'total' ? eligibleCount : attendingCount;
    passMetric = denom > 0 ? (passTally.count / denom) * 100 : 0;
  }
  const passed = quorumMet && passMetric >= passThreshold;

  const result: VoteResult = {
    quorum_mode: v.quorumMode, quorum_met: quorumMet,
    eligible_count: eligibleCount, attending_count: attendingCount,
    eligible_weight: round2(eligibleWeight), present_weight: round2(presentWeight),
    quorum_metric: round2(quorumMetric), quorum_threshold: quorumThreshold,
    tallies: Object.fromEntries(Object.entries(tallies).map(([k, t]) => [k, { count: t.count, weight: round2(t.weight) }])),
    invalid_count: invalidIds.length,
    pass_option: v.passOption, pass_basis: v.passBasis,
    pass_metric: round2(passMetric), pass_threshold: passThreshold, passed,
  };

  const rows = await ctx.db.update(smVotes).set({ status: 'closed', closedAt: nowOf(ctx), result })
    .where(and(eq(smVotes.orgId, ctx.orgId), eq(smVotes.id, v.id))).returning();
  await writeAudit(ctx, { action: 'sm.vote.close', entity: 'smeet_votes', entityId: v.id, after: result });
  await ctx.bus.emit('sm.vote.closed', { org_id: ctx.orgId, meeting_id: v.meetingId, vote_id: v.id, passed });
  return { vote: rows[0]!, result };
}

export async function listVotes(ctx: SmCtx, meetingId: string) {
  await getMeeting(ctx, meetingId);
  return ctx.db.select().from(smVotes)
    .where(and(eq(smVotes.orgId, ctx.orgId), eq(smVotes.meetingId, meetingId)))
    .orderBy(asc(smVotes.openedAt));
}

const round2 = (n: number) => Math.round(n * 100) / 100;
