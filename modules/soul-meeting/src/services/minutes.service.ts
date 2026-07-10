/**
 * SOUL-MEETING 1A — minutes.service
 * Biên bản versioned: compile snapshot (participants/agenda/notes/decisions/
 * votes/actions/cost) → draft → (pending_approval → approve bởi CHỦ TỌA) →
 * publish (BẤT BIẾN — sửa nữa = tạo version mới). Loại họp quorum %%vốn render
 * đủ trường Điều 60 Luật DN 2020: danh sách dự/vắng kèm tỷ lệ vốn, kết quả
 * từng biểu quyết (hợp lệ/không hợp lệ, tán thành/không/không ý kiến, tỷ lệ),
 * quyết định + tỷ lệ thông qua, chỗ ký THƯ KÝ / CHỦ TỌA.
 */
import { and, asc, desc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { SmCtx } from '../types.js';
import { SmError, nowOf } from '../types.js';
import {
  smMinutes, smMeetings, smParticipants, smAgendaItems, smNotes,
  smDecisions, smVotes, smActionItems, smFeedback, smMeetingTypes,
} from '../db/schema.js';
import { writeAudit, getMeeting, getMinutes } from './common.js';
import { typeTemplateOf } from './catalog.service.js';
import type { minutesGenerateSchema, minutesUpdateSchema, minutesFlowSchema, feedbackSchema } from '../validation/schemas.js';

const fmtDT = (d: Date | null) => d
  ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(d)
  : '—';
const pct = (n: number) => `${Math.round(n * 100) / 100}%`;

export interface CompiledMinutes {
  meeting: { id: string; title: string; goal: string | null; location: string | null; online_link: string | null;
    start_at: string; end_at: string; actual_start_at: string | null; actual_end_at: string | null;
    chair_user_id: string | null; secretary_user_id: string | null; type_name: string | null };
  quorum_mode: 'none' | 'headcount' | 'capital_pct';
  participants: Array<{ name: string; role: string; vote_weight: number; attendance: string; is_external: boolean }>;
  agenda: Array<{ title: string; status: string; timebox_minutes: number | null; notes: string[] }>;
  general_notes: string[];
  decisions: Array<{ content: string; method: string; vote?: unknown }>;
  votes: Array<{ question: string; status: string; result: unknown }>;
  actions: Array<{ title: string; owner: string | null; due_date: string | null; status: string }>;
  cost: { duration_minutes: number; present_count: number; rate: number; estimate: number };
}

export async function compileMinutes(ctx: SmCtx, meetingId: string): Promise<CompiledMinutes> {
  const m = await getMeeting(ctx, meetingId);
  let typeName: string | null = null;
  let quorumMode: CompiledMinutes['quorum_mode'] = 'none';
  if (m.typeId) {
    const [t] = await ctx.db.select().from(smMeetingTypes)
      .where(and(eq(smMeetingTypes.orgId, ctx.orgId), eq(smMeetingTypes.id, m.typeId))).limit(1);
    if (t) { typeName = t.name; quorumMode = typeTemplateOf(t).quorum_mode; }
  }
  const parts = await ctx.db.select().from(smParticipants)
    .where(and(eq(smParticipants.orgId, ctx.orgId), eq(smParticipants.meetingId, meetingId)))
    .orderBy(desc(smParticipants.voteWeight), asc(smParticipants.createdAt));
  const agenda = await ctx.db.select().from(smAgendaItems)
    .where(and(eq(smAgendaItems.orgId, ctx.orgId), eq(smAgendaItems.meetingId, meetingId)))
    .orderBy(asc(smAgendaItems.sortOrder));
  const notes = await ctx.db.select().from(smNotes)
    .where(and(eq(smNotes.orgId, ctx.orgId), eq(smNotes.meetingId, meetingId)))
    .orderBy(asc(smNotes.createdAt));
  const decisions = await ctx.db.select().from(smDecisions)
    .where(and(eq(smDecisions.orgId, ctx.orgId), eq(smDecisions.meetingId, meetingId)))
    .orderBy(asc(smDecisions.decidedAt));
  const votes = await ctx.db.select().from(smVotes)
    .where(and(eq(smVotes.orgId, ctx.orgId), eq(smVotes.meetingId, meetingId)))
    .orderBy(asc(smVotes.openedAt));
  const actions = await ctx.db.select().from(smActionItems)
    .where(and(eq(smActionItems.orgId, ctx.orgId), eq(smActionItems.meetingId, meetingId)))
    .orderBy(asc(smActionItems.createdAt));

  const voteById = new Map(votes.map((v) => [v.id, v]));
  const present = parts.filter((p) => p.attendance === 'present' || p.attendance === 'late');
  const durMin = m.actualStartAt && m.actualEndAt
    ? Math.max(0, Math.round((m.actualEndAt.getTime() - m.actualStartAt.getTime()) / 60000))
    : Math.max(0, Math.round((m.endAt.getTime() - m.startAt.getTime()) / 60000));
  const rate = Number(m.costRate ?? 0);

  return {
    meeting: {
      id: m.id, title: m.title, goal: m.goal, location: m.location, online_link: m.onlineLink,
      start_at: m.startAt.toISOString(), end_at: m.endAt.toISOString(),
      actual_start_at: m.actualStartAt?.toISOString() ?? null, actual_end_at: m.actualEndAt?.toISOString() ?? null,
      chair_user_id: m.chairUserId, secretary_user_id: m.secretaryUserId, type_name: typeName,
    },
    quorum_mode: quorumMode,
    participants: parts.map((p) => ({
      name: p.userId ?? p.externalName ?? '—', role: p.role,
      vote_weight: Number(p.voteWeight), attendance: p.attendance, is_external: !p.userId,
    })),
    agenda: agenda.map((a) => ({
      title: a.title, status: a.status, timebox_minutes: a.timeboxMinutes,
      notes: notes.filter((n) => n.agendaItemId === a.id).map((n) => n.content),
    })),
    general_notes: notes.filter((n) => !n.agendaItemId).map((n) => n.content),
    decisions: decisions.map((d) => ({
      content: d.content, method: d.method,
      vote: d.voteId ? voteById.get(d.voteId)?.result ?? null : undefined,
    })),
    votes: votes.map((v) => ({ question: v.question, status: v.status, result: v.result })),
    actions: actions.map((a) => ({
      title: a.title, owner: a.ownerUserId ?? a.externalOwner, due_date: a.dueDate, status: a.status,
    })),
    cost: {
      duration_minutes: durMin, present_count: present.length, rate,
      estimate: Math.round((durMin * present.length * rate) / 60),
    },
  };
}

const VN_ATT: Record<string, string> = {
  present: 'Có mặt', late: 'Có mặt (đến muộn)', absent: 'Vắng',
  absent_excused: 'Vắng có phép', none: 'Chưa điểm danh',
};

export function renderMinutesMd(c: CompiledMinutes): string {
  const L: string[] = [];
  const isCapital = c.quorum_mode === 'capital_pct';
  L.push(`# BIÊN BẢN ${isCapital ? 'HỌP HỘI ĐỒNG THÀNH VIÊN' : 'CUỘC HỌP'}`);
  L.push('');
  L.push(`**${c.meeting.title}**${c.meeting.type_name ? ` · Loại: ${c.meeting.type_name}` : ''}`);
  L.push('');
  L.push(`- Thời gian: ${fmtDT(c.meeting.actual_start_at ? new Date(c.meeting.actual_start_at) : new Date(c.meeting.start_at))} → ${fmtDT(c.meeting.actual_end_at ? new Date(c.meeting.actual_end_at) : new Date(c.meeting.end_at))}`);
  L.push(`- Địa điểm: ${c.meeting.location ?? c.meeting.online_link ?? '—'}`);
  if (c.meeting.goal) L.push(`- Mục đích, chương trình: ${c.meeting.goal}`);
  L.push(`- Chủ tọa: ${c.meeting.chair_user_id ?? '—'} · Thư ký: ${c.meeting.secretary_user_id ?? '—'}`);
  L.push('');
  L.push('## I. THÀNH PHẦN THAM DỰ');
  const attending = c.participants.filter((p) => p.attendance === 'present' || p.attendance === 'late');
  const absent = c.participants.filter((p) => !(p.attendance === 'present' || p.attendance === 'late'));
  const wSum = (xs: typeof c.participants) => xs.reduce((s, p) => s + p.vote_weight, 0);
  for (const p of attending) {
    L.push(`- ${p.name} (${p.role})${isCapital ? ` — tỷ lệ vốn ${pct(p.vote_weight)}` : ''} — ${VN_ATT[p.attendance]}`);
  }
  if (isCapital) L.push(`- **Tổng tỷ lệ vốn dự họp: ${pct(wSum(attending))}**`);
  if (absent.length) {
    L.push('');
    L.push('Vắng mặt:');
    for (const p of absent) L.push(`- ${p.name}${isCapital ? ` — tỷ lệ vốn ${pct(p.vote_weight)}` : ''} — ${VN_ATT[p.attendance]}`);
  }
  L.push('');
  L.push('## II. NỘI DUNG THẢO LUẬN');
  for (const a of c.agenda) {
    L.push(`### ${a.title}${a.status === 'skipped' ? ' (bỏ qua)' : ''}`);
    for (const n of a.notes) L.push(`- ${n}`);
    if (a.notes.length === 0) L.push('- (không có ghi chú)');
  }
  if (c.general_notes.length) {
    L.push('### Ghi chú chung');
    for (const n of c.general_notes) L.push(`- ${n}`);
  }
  if (c.votes.length) {
    L.push('');
    L.push('## III. KẾT QUẢ BIỂU QUYẾT');
    let i = 1;
    for (const v of c.votes) {
      const r = v.result as null | {
        tallies?: Record<string, { count: number; weight: number }>;
        invalid_count?: number; present_weight?: number; quorum_metric?: number;
        quorum_met?: boolean; pass_metric?: number; passed?: boolean; quorum_mode?: string;
      };
      L.push(`### Vấn đề ${i++}: ${v.question}`);
      if (!r) { L.push('- (chưa đóng biểu quyết)'); continue; }
      const tallies = r.tallies ?? {};
      const totalValid = Object.values(tallies).reduce((s, t) => s + t.count, 0);
      L.push(`- Số phiếu hợp lệ: ${totalValid} · không hợp lệ: ${r.invalid_count ?? 0}`);
      for (const [opt, t] of Object.entries(tallies)) {
        L.push(`- ${opt}: ${t.count} phiếu${r.quorum_mode === 'capital_pct' ? ` — ${pct(t.weight)} vốn` : ''}`);
      }
      L.push(`- Túc số (quorum): ${pct(r.quorum_metric ?? 0)} — ${r.quorum_met ? 'ĐẠT' : 'KHÔNG ĐẠT'}`);
      L.push(`- Tỷ lệ thông qua: ${pct(r.pass_metric ?? 0)} → **${r.passed ? 'THÔNG QUA' : 'KHÔNG THÔNG QUA'}**`);
    }
  }
  L.push('');
  L.push('## IV. CÁC QUYẾT ĐỊNH');
  if (c.decisions.length === 0) L.push('- (không có)');
  let di = 1;
  for (const d of c.decisions) {
    const r = d.vote as undefined | null | { pass_metric?: number; passed?: boolean };
    L.push(`${di++}. ${d.content}${d.method === 'vote' && r ? ` — thông qua với tỷ lệ ${pct(r.pass_metric ?? 0)}` : d.method === 'consensus' ? ' — đồng thuận' : ''}`);
  }
  L.push('');
  L.push('## V. PHÂN CÔNG CÔNG VIỆC');
  if (c.actions.length === 0) L.push('- (không có)');
  for (const a of c.actions) {
    L.push(`- [ ] ${a.title}${a.owner ? ` — @${a.owner}` : ''}${a.due_date ? ` — hạn ${a.due_date}` : ''}`);
  }
  if (c.cost.rate > 0) {
    L.push('');
    L.push(`> Chi phí họp ước tính: ${c.cost.duration_minutes} phút × ${c.cost.present_count} người × ${c.cost.rate.toLocaleString('vi-VN')}đ/giờ ≈ **${c.cost.estimate.toLocaleString('vi-VN')}đ**`);
  }
  L.push('');
  L.push('Biên bản được đọc và thông qua trước khi kết thúc cuộc họp.');
  L.push('');
  L.push('| THƯ KÝ | CHỦ TỌA |');
  L.push('|---|---|');
  L.push(`| ${c.meeting.secretary_user_id ?? ''} | ${c.meeting.chair_user_id ?? ''} |`);
  return L.join('\n');
}

async function requiresApproval(ctx: SmCtx, meeting: { typeId: string | null }): Promise<boolean> {
  if (!meeting.typeId) return false;
  const [t] = await ctx.db.select().from(smMeetingTypes)
    .where(and(eq(smMeetingTypes.orgId, ctx.orgId), eq(smMeetingTypes.id, meeting.typeId))).limit(1);
  return t ? typeTemplateOf(t).requires_minutes_approval : false;
}

export async function generateDraft(ctx: SmCtx, input: z.infer<typeof minutesGenerateSchema>) {
  const m = await getMeeting(ctx, input.meeting_id);
  if (m.status !== 'in_progress' && m.status !== 'completed') {
    throw new SmError('MEETING_STATUS_INVALID', `Họp đang ${m.status} — biên bản lập khi đang họp hoặc sau họp`);
  }
  const compiled = await compileMinutes(ctx, input.meeting_id);
  const [mx] = await ctx.db.select({ v: smMinutes.version }).from(smMinutes)
    .where(and(eq(smMinutes.orgId, ctx.orgId), eq(smMinutes.meetingId, input.meeting_id)))
    .orderBy(desc(smMinutes.version)).limit(1);
  const version = (mx?.v ?? 0) + 1;
  const rows = await ctx.db.insert(smMinutes).values({
    orgId: ctx.orgId, meetingId: input.meeting_id, version,
    content: compiled as unknown as Record<string, unknown>,
    contentMd: renderMinutesMd(compiled),
    createdBy: ctx.userId,
  }).returning();
  await writeAudit(ctx, { action: 'sm.minutes.generate', entity: 'smeet_minutes', entityId: rows[0]!.id, after: { version } });
  return rows[0]!;
}

export async function updateDraft(ctx: SmCtx, input: z.infer<typeof minutesUpdateSchema>) {
  const before = await getMinutes(ctx, input.id);
  if (before.status === 'published') throw new SmError('MINUTES_IMMUTABLE', 'Biên bản đã phát hành — tạo version mới nếu cần sửa');
  if (before.status === 'pending_approval') throw new SmError('MINUTES_STATUS_INVALID', 'Biên bản đang chờ duyệt — reject trước khi sửa');
  const rows = await ctx.db.update(smMinutes).set({ contentMd: input.content_md, updatedAt: new Date() })
    .where(and(eq(smMinutes.orgId, ctx.orgId), eq(smMinutes.id, input.id))).returning();
  await writeAudit(ctx, { action: 'sm.minutes.update', entity: 'smeet_minutes', entityId: input.id });
  return rows[0]!;
}

export async function submitMinutes(ctx: SmCtx, input: z.infer<typeof minutesFlowSchema>) {
  const before = await getMinutes(ctx, input.id);
  if (before.status === 'published') throw new SmError('MINUTES_IMMUTABLE', 'Đã phát hành');
  if (before.status !== 'draft' && before.status !== 'rejected') {
    throw new SmError('MINUTES_STATUS_INVALID', `Biên bản đang ${before.status}`);
  }
  const rows = await ctx.db.update(smMinutes).set({
    status: 'pending_approval', submittedBy: ctx.userId, submittedAt: nowOf(ctx),
    rejectedReason: null, updatedAt: new Date(),
  }).where(and(eq(smMinutes.orgId, ctx.orgId), eq(smMinutes.id, input.id))).returning();
  await writeAudit(ctx, { action: 'sm.minutes.submit', entity: 'smeet_minutes', entityId: input.id });
  return rows[0]!;
}

/** CHỈ chủ tọa của cuộc họp được duyệt/từ chối */
async function assertChair(ctx: SmCtx, meetingId: string) {
  const m = await getMeeting(ctx, meetingId);
  if (!m.chairUserId || m.chairUserId !== ctx.userId) {
    throw new SmError('PERMISSION_DENIED', 'Chỉ CHỦ TỌA cuộc họp được duyệt/từ chối biên bản');
  }
  return m;
}

export async function approveMinutes(ctx: SmCtx, input: z.infer<typeof minutesFlowSchema>) {
  const before = await getMinutes(ctx, input.id);
  if (before.status === 'published') throw new SmError('MINUTES_IMMUTABLE', 'Đã phát hành');
  if (before.status !== 'pending_approval') throw new SmError('MINUTES_STATUS_INVALID', `Biên bản đang ${before.status}`);
  await assertChair(ctx, before.meetingId);
  const rows = await ctx.db.update(smMinutes).set({
    approvedBy: ctx.userId, approvedAt: nowOf(ctx), updatedAt: new Date(),
  }).where(and(eq(smMinutes.orgId, ctx.orgId), eq(smMinutes.id, input.id))).returning();
  await writeAudit(ctx, { action: 'sm.minutes.approve', entity: 'smeet_minutes', entityId: input.id });
  return rows[0]!;
}

export async function rejectMinutes(ctx: SmCtx, input: z.infer<typeof minutesFlowSchema>) {
  const before = await getMinutes(ctx, input.id);
  if (before.status !== 'pending_approval') throw new SmError('MINUTES_STATUS_INVALID', `Biên bản đang ${before.status}`);
  await assertChair(ctx, before.meetingId);
  const rows = await ctx.db.update(smMinutes).set({
    status: 'rejected', rejectedReason: input.reason ?? null, approvedBy: null, approvedAt: null, updatedAt: new Date(),
  }).where(and(eq(smMinutes.orgId, ctx.orgId), eq(smMinutes.id, input.id))).returning();
  await writeAudit(ctx, { action: 'sm.minutes.reject', entity: 'smeet_minutes', entityId: input.id, after: { reason: input.reason } });
  return rows[0]!;
}

export async function publishMinutes(ctx: SmCtx, input: z.infer<typeof minutesFlowSchema>) {
  const before = await getMinutes(ctx, input.id);
  if (before.status === 'published') throw new SmError('MINUTES_IMMUTABLE', 'Đã phát hành rồi');
  const m = await getMeeting(ctx, before.meetingId);
  const needApproval = await requiresApproval(ctx, m);
  if (needApproval) {
    if (!(before.status === 'pending_approval' && before.approvedAt)) {
      throw new SmError('MINUTES_STATUS_INVALID', 'Loại họp này yêu cầu CHỦ TỌA duyệt trước khi phát hành');
    }
  } else if (before.status !== 'draft' && !(before.status === 'pending_approval')) {
    throw new SmError('MINUTES_STATUS_INVALID', `Biên bản đang ${before.status}`);
  }
  const rows = await ctx.db.update(smMinutes).set({
    status: 'published', publishedAt: nowOf(ctx), updatedAt: new Date(),
  }).where(and(eq(smMinutes.orgId, ctx.orgId), eq(smMinutes.id, input.id))).returning();
  await writeAudit(ctx, { action: 'sm.minutes.publish', entity: 'smeet_minutes', entityId: input.id, after: { version: before.version } });
  await ctx.bus.emit('sm.minutes.published', { org_id: ctx.orgId, meeting_id: before.meetingId, minutes_id: input.id, version: before.version });
  return rows[0]!;
}

export async function listMinutes(ctx: SmCtx, meetingId: string) {
  await getMeeting(ctx, meetingId);
  return ctx.db.select().from(smMinutes)
    .where(and(eq(smMinutes.orgId, ctx.orgId), eq(smMinutes.meetingId, meetingId)))
    .orderBy(desc(smMinutes.version));
}

// ── FEEDBACK ─────────────────────────────────────────────────────────────────
export async function submitFeedback(ctx: SmCtx, input: z.infer<typeof feedbackSchema>) {
  await getMeeting(ctx, input.meeting_id);
  const [dup] = await ctx.db.select().from(smFeedback)
    .where(and(eq(smFeedback.orgId, ctx.orgId), eq(smFeedback.meetingId, input.meeting_id), eq(smFeedback.userId, ctx.userId))).limit(1);
  if (dup) throw new SmError('FEEDBACK_DUPLICATE', 'Bạn đã đánh giá cuộc họp này rồi');
  const rows = await ctx.db.insert(smFeedback).values({
    orgId: ctx.orgId, meetingId: input.meeting_id, userId: ctx.userId,
    rating: input.rating, wasNecessary: input.was_necessary, comment: input.comment,
  }).returning();
  return rows[0]!;
}

export async function feedbackSummary(ctx: SmCtx, meetingId: string) {
  await getMeeting(ctx, meetingId);
  const rows = await ctx.db.select().from(smFeedback)
    .where(and(eq(smFeedback.orgId, ctx.orgId), eq(smFeedback.meetingId, meetingId)));
  const count = rows.length;
  const avg = count ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 100) / 100 : 0;
  const nec = rows.filter((r) => r.wasNecessary !== null);
  const necessaryPct = nec.length ? Math.round((nec.filter((r) => r.wasNecessary).length / nec.length) * 100) : null;
  return { count, avg_rating: avg, necessary_pct: necessaryPct };
}
