// Tiểu Tâm engine — provider abstraction so stub ↔ live swap with NO interface change.
// LLM_MODE=stub → canned replies (no key). LLM_MODE=live → real LLM (key required).
import type { TieuTamReply, LlmMode } from '@citadel/core';
import { detectIntent, type Intent } from './intent.js';

export interface ChatContext {
  orgName?: string;
  userName?: string;
  /** Optional facts the caller injects (e.g. today's revenue) so stub feels grounded. */
  facts?: Record<string, string | number>;
}

export interface LlmProvider {
  readonly mode: LlmMode;
  reply(message: string, ctx: ChatContext): Promise<TieuTamReply>;
}

// ─── Canned responses per intent (Vietnamese, business-grounded) ────────
const CANNED: Record<Intent, (ctx: ChatContext) => Omit<TieuTamReply, 'mode'>> = {
  greeting: (c) => ({
    text: `Chào ${c.userName ?? 'bạn'}! Tôi là Tiểu Tâm. Hôm nay tôi giúp gì cho ${c.orgName ?? 'quán'} được?`,
    suggestions: ['Doanh thu hôm nay', 'Deal đang mở', 'Tồn kho thế nào'],
  }),
  revenue: (c) => ({
    text: `Doanh thu hôm nay của ${c.orgName ?? 'quán'} là ${c.facts?.revenue ?? '12.4 triệu'}, ${c.facts?.revenueTrend ?? 'tăng 18.4% so hôm qua'}. Bạn muốn xem chi tiết theo giờ không?`,
    toolCalls: [{ tool: 'get_revenue', module: 'pos', result: { today: c.facts?.revenue ?? '12.4tr' } }],
    suggestions: ['Chi tiết theo giờ', 'So với tuần trước'],
  }),
  deals: () => ({
    text: 'Hiện có 3 deal đang mở, tổng 47.2 triệu. Deal của Cô Hoa (VIP, 22tr) đã ở bước đàm phán 5 ngày — bạn muốn tôi nhắc follow-up không?',
    toolCalls: [{ tool: 'query_records', module: 'crm', result: { open: 3, total: '47.2tr' } }],
    suggestions: ['Nhắc Cô Hoa', 'Xem tất cả deal'],
  }),
  inventory: () => ({
    text: 'Có 3 mặt hàng sắp hết. Sữa tươi còn ~10 hộp — nên đặt trước 15h để kịp ca tối. Tôi tạo đơn nhập giúp nhé?',
    toolCalls: [{ tool: 'check_stock', module: 'inventory', result: { low: 3 } }],
    suggestions: ['Tạo đơn nhập', 'Xem danh sách'],
  }),
  shift: () => ({
    text: 'Ca tối nay có 3 người. Dựa trên 4 tuần gần đây, tối nay thường đông — bạn có muốn xếp thêm 1 người không?',
    suggestions: ['Xếp thêm người', 'Xem lịch ca'],
  }),
  finance: () => ({
    text: 'Tháng này doanh thu 22 triệu, chi phí 13 triệu — lãi ròng 9 triệu. Công nợ phải thu còn 12 triệu (Cô Hoa). Sổ đang cân. Bạn muốn xem chi tiết sổ quỹ không?',
    suggestions: ['Sổ quỹ tiền mặt', 'Ai đang nợ tiền'],
  }),
  attendance: () => ({
    text: 'Hôm nay 4/5 nhân viên đã check-in. Lan Phạm vào 18:30 — trễ 30 phút so với ca tối. Bạn muốn xem bảng chấm công chi tiết không?',
    suggestions: ['Bảng chấm công hôm nay', 'Ai đi trễ tuần này'],
  }),
  leave: () => ({
    text: 'Có 1 đơn nghỉ phép đang chờ duyệt: Lan Phạm xin nghỉ 15–17/6 (3 ngày, Phép năm, còn dư 12 ngày). Bạn muốn duyệt ngay không?',
    suggestions: ['Duyệt đơn của Lan', 'Xem số dư phép cả team'],
  }),
  reminder: () => ({
    text: 'Tôi đã ghi nhận. Bạn muốn nhắc vào lúc nào? Tôi có thể nhắc trước 30 phút hoặc đúng giờ.',
    suggestions: ['Trước 30 phút', 'Đúng giờ'],
  }),
  unknown: () => ({
    text: 'Tôi chưa rõ ý bạn lắm. Tôi có thể giúp về doanh thu, khách hàng, tồn kho, ca làm, hoặc nhắc việc. Bạn muốn hỏi về điều gì?',
    suggestions: ['Doanh thu', 'Khách hàng', 'Tồn kho', 'Ca làm'],
  }),
};

export class StubProvider implements LlmProvider {
  readonly mode = 'stub' as const;
  async reply(message: string, ctx: ChatContext): Promise<TieuTamReply> {
    const intent = detectIntent(message);
    const base = CANNED[intent](ctx);
    return { ...base, mode: 'stub' };
  }
}

/** Placeholder — real provider wired when keys arrive (OpenAI/Anthropic). Same interface. */
export class LiveProvider implements LlmProvider {
  readonly mode = 'live' as const;
  constructor(private apiKey: string) {}
  async reply(message: string, ctx: ChatContext): Promise<TieuTamReply> {
    // TODO(M-later): call real LLM with tool-calling. For now, guard so deploy never crashes.
    if (!this.apiKey) throw new Error('LiveProvider requires API key');
    // Fallback to stub behaviour shape until live integration lands.
    const intent = detectIntent(message);
    return { ...CANNED[intent](ctx), mode: 'live' };
  }
}

/** Factory: picks provider from env. Defaults to stub so app runs without keys. */
export function getProvider(): LlmProvider {
  const mode = (process.env.LLM_MODE ?? 'stub') as LlmMode;
  if (mode === 'live') {
    const key = process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? '';
    if (key) return new LiveProvider(key);
    console.warn('[tieu-tam] LLM_MODE=live but no key found — falling back to stub');
  }
  return new StubProvider();
}

export * from './intent.js';
export type { TieuTamReply };
export * from './tools.js';
