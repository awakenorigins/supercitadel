/**
 * SOUL-MEETING 1A — Tools & Actions cho Tiểu Tâm
 * READ TOOLS (kind:'tool') — tra cứu tự do. WRITE ACTIONS (kind:'action') —
 * sensitive:true + securityLevel 2 → HOST tự chạy dry-run→confirm (lượt 1 preview,
 * lượt 2 {confirm:true} mới execute). Handler trả message tiếng Việt SẴN —
 * Tiểu Tâm đọc lại, không tự soạn số liệu (chống bịa).
 */
import { z, type ZodType } from 'zod';
import type { SmCtx } from '../types.js';
import {
  meetingCreateSchema, meetingRescheduleSchema, meetingCancelSchema,
  participantAddSchema, participantUpdateSchema,
  agendaAddSchema, decisionAddSchema, voteCreateSchema, voteCloseSchema,
  actionCreateSchema, actionBatchSchema, carryoverSchema,
  minutesGenerateSchema, minutesFlowSchema, harvestTextSchema,
  actionListSchema, kpiRangeSchema, weekViewSchema,
} from '../validation/schemas.js';
import { createMeeting, rescheduleMeeting, cancelMeeting, startMeeting, finishMeeting, listMeetings } from '../services/meeting.service.js';
import { addParticipant, updateParticipant } from '../services/participant.service.js';
import { addAgendaItem, publishAgenda, listAgenda } from '../services/agenda.service.js';
import { readStatus } from '../services/prep.service.js';
import { addDecision, createVote, closeVote } from '../services/vote.service.js';
import { createActionItem, createActionItemsBatch, completeActionItem, listActionItems, carryoverOpenItems } from '../services/action.service.js';
import { generateDraft, approveMinutes, publishMinutes, listMinutes, feedbackSummary } from '../services/minutes.service.js';
import { requestTranscription, getTranscript } from '../services/recording.service.js';
import { harvestFromText } from '../services/harvest.service.js';
import { weekView, kpiRange, digest, exportActionsXlsx } from '../services/report.service.js';
import { getMeeting } from '../services/common.js';
import { listParticipants } from '../services/participant.service.js';

export type ToolKind = 'tool' | 'action';
export type SecurityLevel = 1 | 2;

export interface SmToolDefinition<S extends ZodType = ZodType> {
  name: string;
  kind: ToolKind;
  permission: string;
  securityLevel: SecurityLevel;
  sensitive: boolean;
  inputSchema: S;
  docs: string;
  handler(ctx: SmCtx, input: S['_output']): Promise<{ message: string; data?: unknown }>;
}

const fmtVN = (d: Date) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(d);
const def = <S extends ZodType>(d: SmToolDefinition<S>) => d as unknown as SmToolDefinition;

// ════════════════════════════ READ TOOLS ════════════════════════════════════
export const smReadTools: SmToolDefinition[] = [
  def({
    name: 'sm.meetings_week', kind: 'tool', permission: 'sm.meeting.read',
    securityLevel: 1, sensitive: false, inputSchema: weekViewSchema,
    docs: 'Lịch họp tuần (mặc định tuần hiện tại, week_of=YYYY-MM-DD để xem tuần khác).',
    async handler(ctx, input) {
      const wv = await weekView(ctx, input);
      const total = wv.days.reduce((s, d) => s + d.meetings.length, 0);
      return { message: `Tuần ${wv.week_start}: ${total} cuộc họp.`, data: wv };
    },
  }),
  def({
    name: 'sm.meeting_detail', kind: 'tool', permission: 'sm.meeting.read',
    securityLevel: 1, sensitive: false,
    inputSchema: z.object({ meeting_id: z.string().uuid() }),
    docs: 'Chi tiết 1 cuộc họp: thông tin + người dự + agenda.',
    async handler(ctx, input) {
      const m = await getMeeting(ctx, input.meeting_id);
      const parts = await listParticipants(ctx, input.meeting_id);
      const agenda = await listAgenda(ctx, input.meeting_id);
      return {
        message: `"${m.title}" · ${fmtVN(m.startAt)} · ${m.status} · ${parts.length} người · agenda ${agenda.length} mục${m.agendaPublished ? ' (đã publish)' : ' (CHƯA publish)'}.`,
        data: { meeting: m, participants: parts, agenda },
      };
    },
  }),
  def({
    name: 'sm.meetings_search', kind: 'tool', permission: 'sm.meeting.read',
    securityLevel: 1, sensitive: false,
    inputSchema: z.object({ q: z.string().max(200).optional(), status: z.enum(['draft', 'scheduled', 'in_progress', 'completed', 'cancelled']).optional(), from: z.string().optional(), to: z.string().optional() }),
    docs: 'Tìm cuộc họp theo tên/trạng thái/khoảng thời gian.',
    async handler(ctx, input) {
      const rows = await listMeetings(ctx, { ...input, limit: 20 } as never);
      return { message: `Tìm thấy ${rows.length} cuộc họp.`, data: rows };
    },
  }),
  def({
    name: 'sm.actions_list', kind: 'tool', permission: 'sm.actionitem.read',
    securityLevel: 1, sensitive: false, inputSchema: actionListSchema,
    docs: 'Danh sách việc cần làm (lọc status/owner/meeting/overdue_only).',
    async handler(ctx, input) {
      const rows = await listActionItems(ctx, input);
      const overdue = rows.filter((r) => r.dueDate && r.dueDate < new Date().toISOString().slice(0, 10) && (r.status === 'open' || r.status === 'in_progress')).length;
      return { message: `${rows.length} việc${overdue ? `, trong đó ${overdue} QUÁ HẠN` : ''}.`, data: rows };
    },
  }),
  def({
    name: 'sm.digest', kind: 'tool', permission: 'sm.meeting.read',
    securityLevel: 1, sensitive: false,
    inputSchema: z.object({ user_id: z.string().max(128).optional() }),
    docs: 'Digest cá nhân: họp 7 ngày tới + việc đang mở của tôi (quá hạn đánh dấu).',
    async handler(ctx, input) {
      const d = await digest(ctx, input.user_id);
      return {
        message: `${d.upcoming_meetings.length} họp sắp tới · ${d.my_open_actions.length} việc đang mở (${d.overdue_count} quá hạn).`,
        data: d,
      };
    },
  }),
  def({
    name: 'sm.kpi', kind: 'tool', permission: 'sm.report.read',
    securityLevel: 1, sensitive: false, inputSchema: kpiRangeSchema,
    docs: 'KPI họp theo kỳ: đúng giờ, điểm danh, biên bản, việc hoàn thành, CHI PHÍ họp.',
    async handler(ctx, input) {
      const k = await kpiRange(ctx, input);
      return {
        message: `Kỳ ${input.from}→${input.to}: ${k.meetings.completed} họp xong, đúng giờ ${k.meetings.on_time_start_pct}%, điểm danh ${k.meetings.attendance_rate_pct}%, việc xong ${k.actions.completion_pct}%, chi phí ~${k.cost.total_vnd.toLocaleString('vi-VN')}đ.`,
        data: k,
      };
    },
  }),
  def({
    name: 'sm.read_status', kind: 'tool', permission: 'sm.meeting.read',
    securityLevel: 1, sensitive: false,
    inputSchema: z.object({ meeting_id: z.string().uuid() }),
    docs: 'Ai CHƯA đọc tài liệu bắt buộc của cuộc họp.',
    async handler(ctx, input) {
      const rs = await readStatus(ctx, input.meeting_id);
      const unread = rs.flatMap((d) => d.unread_user_ids);
      return { message: rs.length === 0 ? 'Họp này không có tài liệu bắt buộc đọc.' : `${rs.length} tài liệu bắt buộc; còn ${new Set(unread).size} người chưa đọc đủ.`, data: rs };
    },
  }),
  def({
    name: 'sm.minutes_read', kind: 'tool', permission: 'sm.meeting.read',
    securityLevel: 1, sensitive: false,
    inputSchema: z.object({ meeting_id: z.string().uuid() }),
    docs: 'Đọc các bản biên bản của cuộc họp (mới nhất trước).',
    async handler(ctx, input) {
      const rows = await listMinutes(ctx, input.meeting_id);
      const latest = rows[0];
      return {
        message: rows.length === 0 ? 'Chưa có biên bản.' : `${rows.length} bản; mới nhất v${latest!.version} (${latest!.status}).`,
        data: rows.map((r) => ({ id: r.id, version: r.version, status: r.status, content_md: r.contentMd })),
      };
    },
  }),
  def({
    name: 'sm.transcript', kind: 'tool', permission: 'sm.recording.manage',
    securityLevel: 1, sensitive: false,
    inputSchema: z.object({ recording_id: z.string().uuid() }),
    docs: 'Đọc transcript đã bóc băng của 1 ghi âm.',
    async handler(ctx, input) {
      const segs = await getTranscript(ctx, input.recording_id);
      return { message: `${segs.length} đoạn transcript.`, data: segs };
    },
  }),
  def({
    name: 'sm.feedback_summary', kind: 'tool', permission: 'sm.report.read',
    securityLevel: 1, sensitive: false,
    inputSchema: z.object({ meeting_id: z.string().uuid() }),
    docs: 'Điểm đánh giá sau họp (avg 1-5 + %% thấy cần thiết).',
    async handler(ctx, input) {
      const f = await feedbackSummary(ctx, input.meeting_id);
      return { message: f.count === 0 ? 'Chưa có đánh giá.' : `${f.count} đánh giá · trung bình ${f.avg_rating}/5${f.necessary_pct !== null ? ` · ${f.necessary_pct}%% thấy họp cần thiết` : ''}.`, data: f };
    },
  }),
];

// ═══════════════════════════ WRITE ACTIONS ══════════════════════════════════
export const smWriteActions: SmToolDefinition[] = [
  def({
    name: 'sm.schedule_meeting', kind: 'action', permission: 'sm.meeting.write',
    securityLevel: 2, sensitive: true, inputSchema: meetingCreateSchema,
    docs: 'Đặt lịch họp mới (có thể áp template loại họp). SENSITIVE: động lịch nhiều người.',
    async handler(ctx, input) {
      const m = await createMeeting(ctx, input);
      return { message: `Đã đặt lịch "${m.title}" lúc ${fmtVN(m.startAt)}.`, data: m };
    },
  }),
  def({
    name: 'sm.reschedule_meeting', kind: 'action', permission: 'sm.meeting.write',
    securityLevel: 2, sensitive: true, inputSchema: meetingRescheduleSchema,
    docs: 'Dời lịch họp (reset nhắc lịch). SENSITIVE.',
    async handler(ctx, input) {
      const m = await rescheduleMeeting(ctx, input);
      return { message: `Đã dời "${m.title}" sang ${fmtVN(m.startAt)}.`, data: m };
    },
  }),
  def({
    name: 'sm.cancel_meeting', kind: 'action', permission: 'sm.meeting.write',
    securityLevel: 2, sensitive: true, inputSchema: meetingCancelSchema,
    docs: 'Hủy cuộc họp (kèm lý do). SENSITIVE.',
    async handler(ctx, input) {
      const m = await cancelMeeting(ctx, input);
      return { message: `Đã hủy "${m.title}"${input.reason ? ` — lý do: ${input.reason}` : ''}.`, data: m };
    },
  }),
  def({
    name: 'sm.start_meeting', kind: 'action', permission: 'sm.meeting.write',
    securityLevel: 1, sensitive: false,
    inputSchema: z.object({ meeting_id: z.string().uuid() }),
    docs: 'Bắt đầu họp (chặn nếu quy tắc yêu cầu agenda publish mà chưa publish).',
    async handler(ctx, input) {
      const m = await startMeeting(ctx, input.meeting_id);
      return { message: `Đã bắt đầu "${m.title}".`, data: m };
    },
  }),
  def({
    name: 'sm.finish_meeting', kind: 'action', permission: 'sm.meeting.write',
    securityLevel: 1, sensitive: false,
    inputSchema: z.object({ meeting_id: z.string().uuid() }),
    docs: 'Kết thúc họp (đóng mục agenda đang chạy, tính thời lượng).',
    async handler(ctx, input) {
      const m = await finishMeeting(ctx, input.meeting_id);
      return { message: `Đã kết thúc "${m.title}".`, data: m };
    },
  }),
  def({
    name: 'sm.invite_participant', kind: 'action', permission: 'sm.participant.write',
    securityLevel: 1, sensitive: false, inputSchema: participantAddSchema,
    docs: 'Mời người vào họp: nội bộ (user_id) hoặc khách ngoài (external_name/email, external_ref nối Soul-Sale).',
    async handler(ctx, input) {
      const p = await addParticipant(ctx, input);
      return { message: `Đã mời ${p.userId ?? p.externalName} (${p.role}).`, data: p };
    },
  }),
  def({
    name: 'sm.set_vote_weight', kind: 'action', permission: 'sm.participant.write',
    securityLevel: 2, sensitive: true, inputSchema: participantUpdateSchema,
    docs: 'Chỉnh tỷ lệ vốn (%% vốn điều lệ) của thành viên dự họp HĐTV. SENSITIVE: ảnh hưởng kết quả biểu quyết.',
    async handler(ctx, input) {
      const p = await updateParticipant(ctx, input);
      return { message: `Đã đặt tỷ lệ vốn ${Number(p.voteWeight)}%% cho ${p.userId ?? p.externalName}.`, data: p };
    },
  }),
  def({
    name: 'sm.add_agenda_item', kind: 'action', permission: 'sm.agenda.write',
    securityLevel: 1, sensitive: false, inputSchema: agendaAddSchema,
    docs: 'Thêm mục agenda (source=parking_lot khi đang họp cho vấn đề ngoài lề).',
    async handler(ctx, input) {
      const a = await addAgendaItem(ctx, input);
      return { message: `Đã thêm agenda "${a.title}".`, data: a };
    },
  }),
  def({
    name: 'sm.publish_agenda', kind: 'action', permission: 'sm.agenda.write',
    securityLevel: 1, sensitive: false,
    inputSchema: z.object({ meeting_id: z.string().uuid() }),
    docs: 'Publish agenda (điều kiện ≥1 mục) — mở khóa quy tắc bắt đầu họp.',
    async handler(ctx, input) {
      const m = await publishAgenda(ctx, input.meeting_id);
      return { message: `Agenda "${m.title}" đã publish.`, data: m };
    },
  }),
  def({
    name: 'sm.record_decision', kind: 'action', permission: 'sm.decision.write',
    securityLevel: 2, sensitive: true, inputSchema: decisionAddSchema,
    docs: 'Ghi QUYẾT ĐỊNH (consensus/chair/vote — method=vote cần vote đã đóng). SENSITIVE: vào biên bản chính thức.',
    async handler(ctx, input) {
      const d = await addDecision(ctx, input);
      return { message: `Đã ghi quyết định: "${d.content}".`, data: d };
    },
  }),
  def({
    name: 'sm.open_vote', kind: 'action', permission: 'sm.vote.manage',
    securityLevel: 2, sensitive: true, inputSchema: voteCreateSchema,
    docs: 'Mở biểu quyết (headcount hoặc capital_pct %% vốn; ngưỡng quorum/pass config). SENSITIVE.',
    async handler(ctx, input) {
      const v = await createVote(ctx, input);
      return { message: `Đã mở biểu quyết: "${v.question}" (${v.quorumMode}, quorum ${Number(v.quorumThreshold)}%%, pass ${Number(v.passThreshold)}%%).`, data: v };
    },
  }),
  def({
    name: 'sm.close_vote', kind: 'action', permission: 'sm.vote.manage',
    securityLevel: 2, sensitive: true, inputSchema: voteCloseSchema,
    docs: 'Đóng biểu quyết + chốt kết quả (phiếu người vắng vô hiệu, tính quorum/pass). SENSITIVE.',
    async handler(ctx, input) {
      const { result } = await closeVote(ctx, input);
      return {
        message: `Đã đóng biểu quyết: túc số ${result.quorum_metric}%% (${result.quorum_met ? 'ĐẠT' : 'KHÔNG ĐẠT'}), tỷ lệ thuận ${result.pass_metric}%% → ${result.passed ? 'THÔNG QUA' : 'KHÔNG THÔNG QUA'}.`,
        data: result,
      };
    },
  }),
  def({
    name: 'sm.create_action', kind: 'action', permission: 'sm.actionitem.write',
    securityLevel: 1, sensitive: false, inputSchema: actionCreateSchema,
    docs: 'Tạo 1 việc cần làm (owner, hạn, ưu tiên).',
    async handler(ctx, input) {
      const a = await createActionItem(ctx, input);
      return { message: `Đã tạo việc "${a.title}"${a.dueDate ? ` — hạn ${a.dueDate}` : ''}.`, data: a };
    },
  }),
  def({
    name: 'sm.create_actions_batch', kind: 'action', permission: 'sm.actionitem.write',
    securityLevel: 1, sensitive: false, inputSchema: actionBatchSchema,
    docs: 'Tạo nhiều việc 1 lần — tự CHỐNG TRÙNG với việc đang mở (skip + báo trùng với việc nào).',
    async handler(ctx, input) {
      const r = await createActionItemsBatch(ctx, input);
      return { message: `Đã tạo ${r.created.length} việc, bỏ qua ${r.skipped.length} việc trùng.`, data: r };
    },
  }),
  def({
    name: 'sm.complete_action', kind: 'action', permission: 'sm.actionitem.write',
    securityLevel: 1, sensitive: false,
    inputSchema: z.object({ action_item_id: z.string().uuid(), comment: z.string().max(2000).optional() }),
    docs: 'Đánh dấu việc đã xong (ghi người + thời điểm).',
    async handler(ctx, input) {
      const a = await completeActionItem(ctx, input.action_item_id, input.comment);
      return { message: `Đã xong việc "${a.title}".`, data: a };
    },
  }),
  def({
    name: 'sm.carryover_actions', kind: 'action', permission: 'sm.actionitem.write',
    securityLevel: 2, sensitive: true, inputSchema: carryoverSchema,
    docs: 'Chuyển việc chưa xong sang kỳ họp sau + agenda "Rà soát việc kỳ trước". SENSITIVE: đổi trạng thái hàng loạt.',
    async handler(ctx, input) {
      const r = await carryoverOpenItems(ctx, input);
      return { message: `Đã chuyển ${r.carried} việc sang kỳ mới.`, data: r };
    },
  }),
  def({
    name: 'sm.generate_minutes', kind: 'action', permission: 'sm.minutes.write',
    securityLevel: 1, sensitive: false, inputSchema: minutesGenerateSchema,
    docs: 'Sinh bản nháp biên bản từ dữ liệu họp (version mới; loại HĐTV render đủ trường Điều 60).',
    async handler(ctx, input) {
      const mn = await generateDraft(ctx, input);
      return { message: `Đã sinh biên bản nháp v${mn.version}.`, data: { id: mn.id, version: mn.version, content_md: mn.contentMd } };
    },
  }),
  def({
    name: 'sm.approve_minutes', kind: 'action', permission: 'sm.minutes.approve',
    securityLevel: 2, sensitive: true, inputSchema: minutesFlowSchema,
    docs: 'CHỦ TỌA duyệt biên bản đang chờ. SENSITIVE.',
    async handler(ctx, input) {
      const mn = await approveMinutes(ctx, input);
      return { message: `Đã duyệt biên bản v${mn.version}.`, data: mn };
    },
  }),
  def({
    name: 'sm.publish_minutes', kind: 'action', permission: 'sm.minutes.publish',
    securityLevel: 2, sensitive: true, inputSchema: minutesFlowSchema,
    docs: 'Phát hành biên bản — BẤT BIẾN sau phát hành. SENSITIVE.',
    async handler(ctx, input) {
      const mn = await publishMinutes(ctx, input);
      return { message: `Đã phát hành biên bản v${mn.version} (bất biến).`, data: mn };
    },
  }),
  def({
    name: 'sm.transcribe_recording', kind: 'action', permission: 'sm.recording.manage',
    securityLevel: 2, sensitive: true,
    inputSchema: z.object({ recording_id: z.string().uuid() }),
    docs: 'Bóc băng ghi âm qua ASR worker (PhoWhisper/faster-whisper). SENSITIVE: tốn tài nguyên + dữ liệu giọng nói.',
    async handler(ctx, input) {
      const r = await requestTranscription(ctx, input.recording_id);
      return { message: r.status === 'done' ? 'Bóc băng xong.' : `Trạng thái: ${r.status}${r.error ? ` (${r.error})` : ''}.`, data: r };
    },
  }),
  def({
    name: 'sm.harvest_text', kind: 'action', permission: 'sm.actionitem.write',
    securityLevel: 1, sensitive: false, inputSchema: harvestTextSchema,
    docs: 'Bóc VIỆC + QUYẾT ĐỊNH đề xuất từ ghi chú thô (KHÔNG ghi DB — xem xong dùng sm.create_actions_batch để chốt).',
    async handler(ctx, input) {
      const r = await harvestFromText(ctx, input);
      return {
        message: `Đề xuất ${r.proposed_actions.length} việc (${r.stats.duplicates_flagged} nghi trùng) + ${r.proposed_decisions.length} quyết định. Xác nhận rồi tôi tạo bằng sm.create_actions_batch.`,
        data: r,
      };
    },
  }),
  def({
    name: 'sm.export_actions_excel', kind: 'action', permission: 'sm.report.read',
    securityLevel: 1, sensitive: false, inputSchema: actionListSchema,
    docs: 'Xuất Excel danh sách việc cần làm — trả downloadUrl cho nút tải.',
    async handler(ctx, input) {
      const r = await exportActionsXlsx(ctx, input);
      return { message: `Đã xuất ${r.rows} việc ra Excel.`, data: r };
    },
  }),
];

export const smAllTools = [...smReadTools, ...smWriteActions];
