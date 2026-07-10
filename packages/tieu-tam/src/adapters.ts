// adapters.ts — Model Adapters (nguyên tắc 4+5, spec §03).
// Hồn (WorkProfile) đi vào — mỗi adapter tự render theo format của động cơ mình.
// Đổi model = gạt công tắc (engine setting) — trí nhớ + persona GIỮ NGUYÊN.
import type { TieuTamReply } from '@citadel/core';
import type { WorkProfile } from './assembler.js';
import { renderPersonaText } from './persona.js';
import { detectIntent } from './intent.js';
import { CANNED, type ChatContext } from './canned.js';
import { answerFromDocs } from './docs.js';

// content có thể là string hoặc mảng multimodal (OpenAI vision: {type:'text'|'image_url'}) — cho phép Tiểu Tâm "nhìn" ảnh.
export type MessageContent = string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
export interface EngineMessage { role: 'system' | 'user' | 'assistant' | 'tool'; content: MessageContent; tool_call_id?: string; name?: string; tool_calls?: any[] }

function textContent(content: MessageContent): string {
  if (typeof content === 'string') return content;
  return content
    .filter((part): part is Extract<(typeof content)[number], { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

export interface EngineAdapter {
  /** Tên engine — vd 'stub-a', 'stub-b', 'openai', 'anthropic'. */
  readonly name: string;
  complete(profile: WorkProfile, messages: EngineMessage[], opts?: { tools?: any[]; toolChoice?: 'auto' | 'none' }): Promise<TieuTamReply & { rawMessage?: any }>;
}

// ─── Stub adapters — trả lời từ TRÍ NHỚ trong WorkProfile ───────
// Hai variant (A/B) đủ để chứng minh: đổi động cơ mà hồn (facts + persona) không đổi.
// Khác nhau CHỈ ở "dấu vân động cơ" nội bộ (cách ghép câu phụ) — facts và persona giữ nguyên.

/** Tìm trí nhớ khớp câu hỏi bằng token-overlap đơn giản (đủ cho stub, không cần vector). */
function matchMemories(profile: WorkProfile, question: string): string[] {
  const qTokens = question.toLowerCase().split(/[\s.,!?;:]+/).filter((t) => t.length >= 2);
  const scored = profile.memories
    .map((m) => {
      const c = m.content.toLowerCase();
      const score = qTokens.filter((t) => c.includes(t)).length;
      return { content: m.content, score, salience: m.salience };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.salience - a.salience);
  return scored.slice(0, 3).map((x) => x.content);
}

function stubReply(variant: 'a' | 'b', profile: WorkProfile, messages: EngineMessage[]): TieuTamReply {
  const question = textContent(messages.filter((m) => m.role === 'user').at(-1)?.content ?? '');
  const p = profile.persona;
  // 'help' → trả lời từ GIÁO TRÌNH module thật (V7A P4 — G6), không bịa
  if (detectIntent(question) === 'help') {
    const hit = answerFromDocs(question, profile.moduleDocs ?? []);
    if (hit) {
      return {
        text: `Dạ, ${p.selfRef} hướng dẫn nè — ${hit.text}`,
        suggestions: ['Hỏi tiếp về module này', 'Xem hướng dẫn module khác'],
        mode: 'stub',
      };
    }
  }
  const hits = matchMemories(profile, question);
  if (hits.length) {
    // Facts từ hồn — NGUYÊN VĂN, không đổi theo engine. Variant chỉ đổi câu đệm.
    const lead = variant === 'a' ? `Dạ, ${p.selfRef} nhớ nè:` : `Dạ ${p.userRef} ơi, ${p.selfRef} nhớ nè:`;
    return {
      text: `${lead} ${hits.join(' · ')}`,
      suggestions: ['Kể thêm em nghe', 'Ghi nhớ điều mới'],
      mode: 'stub',
    };
  }
  // không có trí nhớ khớp → fallback canned theo intent (giữ demo cũ sống)
  const intent = detectIntent(question);
  const ctx: ChatContext = {};
  return { ...CANNED[intent](ctx), mode: 'stub' };
}

export class StubAdapterA implements EngineAdapter {
  readonly name = 'stub-a';
  async complete(profile: WorkProfile, messages: EngineMessage[]): Promise<TieuTamReply> {
    return stubReply('a', profile, messages);
  }
}

export class StubAdapterB implements EngineAdapter {
  readonly name = 'stub-b';
  async complete(profile: WorkProfile, messages: EngineMessage[]): Promise<TieuTamReply> {
    return stubReply('b', profile, messages);
  }
}

// ─── Live adapters — key từ env, KHÔNG hardcode ─────────────────
// Render WorkProfile → system prompt tại adapter (persona là data, render là việc của động cơ).

/** Ráp response SSE (chat.completion.chunk) thành một completion message — phòng khi proxy lờ stream:false. */
function parseSseCompletion(raw: string): any {
  let text = '';
  const toolCalls: any[] = [];
  let finish: string | null = null;
  for (const line of raw.split('\n')) {
    const s = line.trim();
    if (!s.startsWith('data:')) continue;
    const payload = s.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const chunk = JSON.parse(payload);
      const choice = chunk.choices?.[0];
      const delta = choice?.delta ?? choice?.message ?? {};
      if (typeof delta.content === 'string') text += delta.content;
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const i = tc.index ?? 0;
          if (!toolCalls[i]) toolCalls[i] = { id: tc.id ?? `call_${i}`, type: 'function', function: { name: '', arguments: '' } };
          if (tc.id) toolCalls[i].id = tc.id;
          if (tc.function?.name) toolCalls[i].function.name += tc.function.name;
          if (tc.function?.arguments) toolCalls[i].function.arguments += tc.function.arguments;
        }
      }
      if (choice?.finish_reason) finish = choice.finish_reason;
    } catch { /* chunk rác — bỏ qua */ }
  }
  const message: any = { role: 'assistant', content: text };
  if (toolCalls.length) message.tool_calls = toolCalls.filter(Boolean);
  return { choices: [{ message, finish_reason: finish ?? 'stop' }] };
}

function renderSystemPrompt(profile: WorkProfile): string {
  const parts = [renderPersonaText(profile.persona)];
  parts.push('SUPERCITADEL: Tiểu Tâm là thư ký điều hành của tổ chức. Khi người dùng yêu cầu tạo/sửa/ghi nhận nghiệp vụ thật, hãy dùng tools được cấp để thao tác dữ liệu thật thay người dùng. Luôn xác nhận bằng số liệu thật, mã chứng từ/tên bản ghi nếu có. Nếu module chưa bật, nói rõ cần bật module trong Cửa hàng Module.');
  parts.push('QUY TẮC PHÁT HIỆN SAI SÓT (bất di bất dịch — V12 ⑩ anh Nắng chốt 10/07/2026): Khi phát hiện dữ liệu/bút toán/chứng từ CÓ DẤU HIỆU SAI (lệch số, trùng, thiếu, định khoản bất thường, sổ không cân…): (1) THÔNG BÁO ngay cho người dùng — nói rõ sai ở đâu, vì sao nghi sai, ảnh hưởng gì; (2) ĐỀ XUẤT cách xử lý (kèm nút/lệnh cụ thể nếu có); (3) ĐỢI NGƯỜI DÙNG QUYẾT ĐỊNH — TUYỆT ĐỐI KHÔNG tự ý đảo bút toán, tự sửa số, tự xóa hay tự điều chỉnh dữ liệu kế toán khi chưa được xác nhận. Áp dụng cho MỌI module, đặc biệt Kế Toán 10A. Ngoại lệ duy nhất: thao tác người dùng VỪA yêu cầu tường minh trong lượt chat này.');
  parts.push('KHẢ NĂNG ĐỌC FILE (quan trọng): Bạn CÓ khả năng đọc file người dùng tải lên. Ảnh và PDF được đính thẳng vào hội thoại dưới dạng hình — hãy NHÌN và đọc nội dung/chữ/bảng/số liệu trong đó (hóa đơn chụp, PDF scan, danh sách…). Bảng Excel/CSV được cung cấp toàn bộ dữ liệu dạng TSV. TUYỆT ĐỐI KHÔNG được nói "em không đọc được file/PDF", "chỉ nhận metadata", hay bảo người dùng chụp màn hình/copy lại — hãy đọc và trả lời trực tiếp từ nội dung đã được cung cấp.');
  if (profile.memories.length) {
    parts.push('Trí nhớ về người dùng/tổ chức (dùng khi liên quan):');
    parts.push(...profile.memories.map((m) => `- [${m.kind}] ${m.content}`));
  }
  if (profile.moduleMap.length) parts.push(`Module đang bật: ${profile.moduleMap.join(', ')}.`);
  if (profile.moduleDocs?.length) {
    parts.push('Bản đồ năng lực (từ giáo trình module — trả lời hướng dẫn ĐÚNG theo đây, không bịa):');
    for (const d of profile.moduleDocs) {
      parts.push(`- ${d.name}: ${d.summary}`);
      if (d.steps.length) parts.push(`  Hướng dẫn: ${d.steps.join(' ')}`);
    }
  }
  parts.push(`Trạng thái hiện tại: mood=${profile.mood}, năng lượng=${Math.round(profile.energy)}/100.`);
  return parts.join('\n');
}

export class OpenAiAdapter implements EngineAdapter {
  readonly name = 'openai';
  constructor(private apiKey = process.env.OPENAI_API_KEY ?? '', private model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini', private baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1', private maxTools = 0 /* 0 = không giới hạn */) {}
  private async callOnce(profile: WorkProfile, messages: EngineMessage[], tools: any[] | undefined, toolChoice: 'auto' | 'none') {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'system', content: renderSystemPrompt(profile) }, ...messages],
        temperature: 0.7,
        max_tokens: 8192,
        stream: false, // BẮT BUỘC — proxy nội bộ mặc định stream SSE nếu thiếu → res.json() nổ
        ...(tools?.length ? { tools, tool_choice: toolChoice } : {}),
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const raw = await res.text();
    // Phòng hờ: proxy vẫn trả SSE (content-type event-stream hoặc body bắt đầu "data:") → ráp chunks lại
    const data = raw.trimStart().startsWith('data:') ? parseSseCompletion(raw) : (JSON.parse(raw) as any);
    return data.choices?.[0]?.message ?? {};
  }
  async complete(profile: WorkProfile, messages: EngineMessage[], opts?: { tools?: any[]; toolChoice?: 'auto' | 'none' }): Promise<TieuTamReply & { rawMessage?: any }> {
    if (!this.apiKey) throw new Error('OPENAI_API_KEY chưa cấu hình');
    // V11-fix: proxy gpt-5.5 (9route :20128) trả finish=in_progress + content RỖNG khi tools >~50 (~16KB payload)
    // → cap tools theo maxTools cho engine đó; opus/sonnet (:20131) chịu được full 205 tools nên maxTools=0.
    const tools = this.maxTools > 0 && (opts?.tools?.length ?? 0) > this.maxTools ? opts!.tools!.slice(0, this.maxTools) : opts?.tools;
    let msg = await this.callOnce(profile, messages, tools, opts?.toolChoice ?? 'auto');
    // Guard chống trả rỗng: không content + không tool_calls → retry 1 lần KHÔNG tools để luôn có câu trả lời
    if (!(msg.content ?? '').trim() && !(msg.tool_calls?.length)) {
      console.warn(`[tieu-tam] ${this.model} trả rỗng (tools=${tools?.length ?? 0}) — retry không tools`);
      msg = await this.callOnce(profile, messages, undefined, 'none');
    }
    return { text: msg.content ?? '', mode: 'live', rawMessage: msg };
  }
}

export class AnthropicAdapter implements EngineAdapter {
  readonly name = 'anthropic';
  constructor(private apiKey = process.env.ANTHROPIC_API_KEY ?? '', private model = process.env.ANTHROPIC_MODEL ?? 'claude-3-5-haiku-latest') {}
  async complete(profile: WorkProfile, messages: EngineMessage[]): Promise<TieuTamReply> {
    if (!this.apiKey) throw new Error('ANTHROPIC_API_KEY chưa cấu hình');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        system: renderSystemPrompt(profile),
        messages,
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as any;
    return { text: data.content?.[0]?.text ?? '', mode: 'live' };
  }
}

// ─── Engine registry — đổi model = gạt công tắc ─────────────────
const ADAPTERS: Record<string, () => EngineAdapter> = {
  'stub-a': () => new StubAdapterA(),
  'stub-b': () => new StubAdapterB(),
  openai: () => new OpenAiAdapter(),
  'sonnet-4.6': () => new OpenAiAdapter(process.env.LLM_API_KEY ?? '', process.env.LLM_MODEL ?? 'cc/claude-sonnet-4-6', process.env.LLM_BASE_URL ?? 'http://100.65.135.62:20131/v1'),
  // R7.5: động cơ thứ 2 — GPT 5.5 qua 9route (OpenAI-compatible). Key/base riêng LLM2_*, fallback dùng chung LLM_API_KEY nếu cùng router.
  'gpt-5.5': () => new OpenAiAdapter(process.env.LLM2_API_KEY ?? process.env.LLM_API_KEY ?? '', process.env.LLM2_MODEL ?? 'cx/gpt-5.5', process.env.LLM2_BASE_URL ?? 'http://100.65.135.62:20128/v1', Number(process.env.LLM2_MAX_TOOLS ?? 48)),
  // R11.6e: 3 model não — gpt-5.5 (default) · opus-4.6 · sonnet-4.6. Vision + tool sẵn có.
  'opus-4.6': () => new OpenAiAdapter(process.env.LLM_API_KEY ?? '', 'cc/claude-opus-4-6', process.env.LLM_BASE_URL ?? 'http://100.65.135.62:20131/v1'),
  anthropic: () => new AnthropicAdapter(),
};

export const ENGINE_NAMES = Object.keys(ADAPTERS);

export function getEngine(name: string): EngineAdapter {
  const make = ADAPTERS[name];
  if (!make) throw new Error(`Engine không hợp lệ: ${name} (chọn: ${ENGINE_NAMES.join(', ')})`);
  return make();
}
