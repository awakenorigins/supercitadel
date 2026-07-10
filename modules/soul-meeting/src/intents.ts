/**
 * SOUL-MEETING 1A — Intent definitions cho Tiểu Tâm
 * Patterns Việt/Anh → tool. slots: trường cần trích từ câu nói.
 */
export interface IntentDefinition {
  id: string;
  tool: string;
  patterns_vi: string[];
  patterns_en: string[];
  slots: string[];
  examples: Array<{ utterance: string; tool_input: Record<string, unknown> }>;
}

export const smIntents: IntentDefinition[] = [
  {
    id: 'sm.intent.schedule',
    tool: 'sm.schedule_meeting',
    patterns_vi: ['đặt lịch họp', 'lên lịch họp', 'tạo cuộc họp', 'hẹn họp', 'book họp'],
    patterns_en: ['schedule a meeting', 'book a meeting', 'set up a meeting'],
    slots: ['title', 'start_at', 'end_at', 'type_id', 'chair_user_id', 'location'],
    examples: [{
      utterance: 'Đặt lịch giao ban tuần thứ 2 tuần sau 8h sáng, 1 tiếng, anh An chủ trì',
      tool_input: { title: 'Giao ban tuần', start_at: '2026-07-13T01:00:00Z', end_at: '2026-07-13T02:00:00Z', chair_user_id: 'user-an', apply_template: true, status: 'scheduled' },
    }],
  },
  {
    id: 'sm.intent.week',
    tool: 'sm.meetings_week',
    patterns_vi: ['tuần này họp gì', 'lịch họp tuần', 'tuần sau có họp không'],
    patterns_en: ['meetings this week', 'my week'],
    slots: ['week_of'],
    examples: [{ utterance: 'Tuần này công ty có họp gì?', tool_input: {} }],
  },
  {
    id: 'sm.intent.reschedule',
    tool: 'sm.reschedule_meeting',
    patterns_vi: ['dời lịch họp', 'đổi giờ họp', 'lùi họp', 'hoãn sang'],
    patterns_en: ['reschedule the meeting', 'move the meeting'],
    slots: ['id', 'start_at', 'end_at'],
    examples: [{
      utterance: 'Dời họp dự án chiều nay sang 9h sáng mai',
      tool_input: { id: '<meeting_id>', start_at: '2026-07-11T02:00:00Z', end_at: '2026-07-11T03:00:00Z' },
    }],
  },
  {
    id: 'sm.intent.cancel',
    tool: 'sm.cancel_meeting',
    patterns_vi: ['hủy họp', 'bỏ cuộc họp', 'cancel họp'],
    patterns_en: ['cancel the meeting'],
    slots: ['id', 'reason'],
    examples: [{ utterance: 'Hủy họp 1-1 chiều nay, lý do trùng lịch khách', tool_input: { id: '<meeting_id>', reason: 'Trùng lịch khách' } }],
  },
  {
    id: 'sm.intent.invite',
    tool: 'sm.invite_participant',
    patterns_vi: ['mời thêm', 'thêm người vào họp', 'mời khách', 'add anh'],
    patterns_en: ['invite', 'add participant'],
    slots: ['meeting_id', 'user_id', 'external_name', 'external_email', 'role'],
    examples: [{
      utterance: 'Mời anh Tuấn bên Jolipoli vào họp khách hàng thứ 5, email tuan@jolipoli.vn',
      tool_input: { meeting_id: '<meeting_id>', external_name: 'Anh Tuấn (Jolipoli)', external_email: 'tuan@jolipoli.vn', role: 'attendee', required: false, vote_weight: 0 },
    }],
  },
  {
    id: 'sm.intent.agenda_add',
    tool: 'sm.add_agenda_item',
    patterns_vi: ['thêm vào agenda', 'thêm mục họp', 'bổ sung nội dung họp', 'parking lot'],
    patterns_en: ['add agenda item'],
    slots: ['meeting_id', 'title', 'timebox_minutes', 'source'],
    examples: [{ utterance: 'Thêm mục "Giá cước vận chuyển tháng 8" 15 phút vào agenda giao ban', tool_input: { meeting_id: '<meeting_id>', title: 'Giá cước vận chuyển tháng 8', timebox_minutes: 15, source: 'manual' } }],
  },
  {
    id: 'sm.intent.agenda_publish',
    tool: 'sm.publish_agenda',
    patterns_vi: ['publish agenda', 'chốt agenda', 'gửi agenda'],
    patterns_en: ['publish agenda'],
    slots: ['meeting_id'],
    examples: [{ utterance: 'Chốt agenda họp giao ban thứ 2', tool_input: { meeting_id: '<meeting_id>' } }],
  },
  {
    id: 'sm.intent.start',
    tool: 'sm.start_meeting',
    patterns_vi: ['bắt đầu họp', 'vào họp', 'start họp'],
    patterns_en: ['start the meeting'],
    slots: ['meeting_id'],
    examples: [{ utterance: 'Bắt đầu họp giao ban', tool_input: { meeting_id: '<meeting_id>' } }],
  },
  {
    id: 'sm.intent.finish',
    tool: 'sm.finish_meeting',
    patterns_vi: ['kết thúc họp', 'xong họp', 'đóng họp'],
    patterns_en: ['end the meeting', 'finish meeting'],
    slots: ['meeting_id'],
    examples: [{ utterance: 'Kết thúc họp', tool_input: { meeting_id: '<meeting_id>' } }],
  },
  {
    id: 'sm.intent.decision',
    tool: 'sm.record_decision',
    patterns_vi: ['ghi quyết định', 'chốt quyết định', 'ghi vào biên bản quyết định'],
    patterns_en: ['record decision'],
    slots: ['meeting_id', 'content', 'method', 'vote_id'],
    examples: [{ utterance: 'Ghi quyết định: duyệt ngân sách marketing 150 triệu, cả phòng đồng thuận', tool_input: { meeting_id: '<meeting_id>', content: 'Duyệt ngân sách marketing 150 triệu', method: 'consensus' } }],
  },
  {
    id: 'sm.intent.vote_open',
    tool: 'sm.open_vote',
    patterns_vi: ['mở biểu quyết', 'biểu quyết về', 'lấy ý kiến biểu quyết', 'vote'],
    patterns_en: ['open a vote', 'start voting'],
    slots: ['meeting_id', 'question', 'quorum_mode', 'quorum_threshold', 'pass_threshold'],
    examples: [{
      utterance: 'Mở biểu quyết HĐTV thông qua phương án mở kho Cần Thơ, quorum 65% vốn, pass 65%',
      tool_input: { meeting_id: '<meeting_id>', question: 'Thông qua phương án mở kho Cần Thơ', quorum_mode: 'capital_pct', quorum_threshold: 65, pass_threshold: 65, pass_basis: 'attending' },
    }],
  },
  {
    id: 'sm.intent.vote_close',
    tool: 'sm.close_vote',
    patterns_vi: ['đóng biểu quyết', 'chốt kết quả biểu quyết', 'kết thúc vote'],
    patterns_en: ['close the vote'],
    slots: ['vote_id'],
    examples: [{ utterance: 'Đóng biểu quyết và đọc kết quả', tool_input: { vote_id: '<vote_id>' } }],
  },
  {
    id: 'sm.intent.action_create',
    tool: 'sm.create_action',
    patterns_vi: ['giao việc', 'tạo việc', 'thêm việc cần làm', 'assign'],
    patterns_en: ['assign a task', 'create action item'],
    slots: ['title', 'owner_user_id', 'due_date', 'priority', 'meeting_id'],
    examples: [{
      utterance: 'Giao anh Bình khảo sát mặt bằng kho Cần Thơ, hạn 20/07, ưu tiên cao',
      tool_input: { title: 'Khảo sát mặt bằng kho Cần Thơ', owner_user_id: 'user-binh', due_date: '2026-07-20', priority: 'high' },
    }],
  },
  {
    id: 'sm.intent.action_done',
    tool: 'sm.complete_action',
    patterns_vi: ['xong việc', 'đánh dấu hoàn thành', 'done việc'],
    patterns_en: ['mark done', 'complete task'],
    slots: ['action_item_id', 'comment'],
    examples: [{ utterance: 'Việc khảo sát mặt bằng xong rồi nhé', tool_input: { action_item_id: '<action_id>' } }],
  },
  {
    id: 'sm.intent.actions_overdue',
    tool: 'sm.actions_list',
    patterns_vi: ['việc quá hạn', 'việc nào trễ', 'ai đang nợ việc', 'việc của tôi'],
    patterns_en: ['overdue tasks', 'my tasks'],
    slots: ['overdue_only', 'owner_user_id', 'status'],
    examples: [{ utterance: 'Liệt kê việc quá hạn của cả công ty', tool_input: { overdue_only: true, limit: 50 } }],
  },
  {
    id: 'sm.intent.carryover',
    tool: 'sm.carryover_actions',
    patterns_vi: ['chuyển việc sang kỳ sau', 'carry over', 'dồn việc chưa xong sang họp tới'],
    patterns_en: ['carry over open items'],
    slots: ['from_meeting_id', 'to_meeting_id'],
    examples: [{ utterance: 'Chuyển việc chưa xong của giao ban tuần này sang giao ban tuần sau', tool_input: { from_meeting_id: '<from_id>', to_meeting_id: '<to_id>' } }],
  },
  {
    id: 'sm.intent.minutes',
    tool: 'sm.generate_minutes',
    patterns_vi: ['soạn biên bản', 'tạo biên bản', 'lập biên bản họp'],
    patterns_en: ['generate minutes', 'draft the minutes'],
    slots: ['meeting_id'],
    examples: [{ utterance: 'Soạn biên bản họp HĐTV vừa rồi', tool_input: { meeting_id: '<meeting_id>' } }],
  },
  {
    id: 'sm.intent.harvest',
    tool: 'sm.harvest_text',
    patterns_vi: ['bóc việc từ ghi chú', 'tách việc từ note', 'trích quyết định từ ghi chú'],
    patterns_en: ['extract action items from notes'],
    slots: ['meeting_id', 'text'],
    examples: [{ utterance: 'Bóc việc và quyết định từ ghi chú này: …', tool_input: { meeting_id: '<meeting_id>', text: '…' } }],
  },
  {
    id: 'sm.intent.kpi',
    tool: 'sm.kpi',
    patterns_vi: ['kpi họp', 'họp tháng này tốn bao nhiêu', 'thống kê họp', 'chi phí họp'],
    patterns_en: ['meeting kpi', 'meeting cost'],
    slots: ['from', 'to'],
    examples: [{ utterance: 'Tháng này họp tốn bao nhiêu tiền, đúng giờ được bao nhiêu %?', tool_input: { from: '2026-07-01', to: '2026-07-31' } }],
  },
];
