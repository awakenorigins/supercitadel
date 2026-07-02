// adapters.ts — Model Adapters (nguyên tắc 4+5, spec §03).
// Hồn (WorkProfile) đi vào — mỗi adapter tự render theo format của động cơ mình.
// Đổi model = gạt công tắc (engine setting) — trí nhớ + persona GIỮ NGUYÊN.
import type { TieuTamReply } from '@citadel/core';
import type { WorkProfile } from './assembler.js';
import { renderPersonaText } from './persona.js';
import { detectIntent } from './intent.js';
import { CANNED, type ChatContext } from './canned.js';

export interface EngineMessage { role: 'user' | 'assistant'; content: string }

export interface EngineAdapter {
  /** Tên engine — vd 'stub-a', 'stub-b', 'openai', 'anthropic'. */
  readonly name: string;
  complete(profile: WorkProfile, messages: EngineMessage[]): Promise<TieuTamReply>;
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
  const question = messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
  const p = profile.persona;
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

function renderSystemPrompt(profile: WorkProfile): string {
  const parts = [renderPersonaText(profile.persona)];
  if (profile.memories.length) {
    parts.push('Trí nhớ về người dùng/tổ chức (dùng khi liên quan):');
    parts.push(...profile.memories.map((m) => `- [${m.kind}] ${m.content}`));
  }
  if (profile.moduleMap.length) parts.push(`Module đang bật: ${profile.moduleMap.join(', ')}.`);
  parts.push(`Trạng thái hiện tại: mood=${profile.mood}, năng lượng=${Math.round(profile.energy)}/100.`);
  return parts.join('\n');
}

export class OpenAiAdapter implements EngineAdapter {
  readonly name = 'openai';
  constructor(private apiKey = process.env.OPENAI_API_KEY ?? '', private model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini') {}
  async complete(profile: WorkProfile, messages: EngineMessage[]): Promise<TieuTamReply> {
    if (!this.apiKey) throw new Error('OPENAI_API_KEY chưa cấu hình');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'system', content: renderSystemPrompt(profile) }, ...messages],
        temperature: 0.7,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as any;
    return { text: data.choices?.[0]?.message?.content ?? '', mode: 'live' };
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
  anthropic: () => new AnthropicAdapter(),
};

export const ENGINE_NAMES = Object.keys(ADAPTERS);

export function getEngine(name: string): EngineAdapter {
  const make = ADAPTERS[name];
  if (!make) throw new Error(`Engine không hợp lệ: ${name} (chọn: ${ENGINE_NAMES.join(', ')})`);
  return make();
}
