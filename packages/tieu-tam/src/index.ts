// Tiểu Tâm engine — provider abstraction so stub ↔ live swap with NO interface change.
// LLM_MODE=stub → canned replies (no key). LLM_MODE=live → real LLM (key required).
// V7A P2: hồn tách động cơ — xem persona.ts / memory.ts / assembler.ts / adapters.ts / energy.ts
import type { TieuTamReply, LlmMode } from '@citadel/core';
import { detectIntent } from './intent.js';
import { CANNED, type ChatContext } from './canned.js';

export type { ChatContext };

export interface LlmProvider {
  readonly mode: LlmMode;
  reply(message: string, ctx: ChatContext): Promise<TieuTamReply>;
}

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
// ─── V7A P2 — TRÁI TIM: hồn tách động cơ + mood/energy ────────
export * from './persona.js';
export * from './memory.js';
export * from './assembler.js';
export * from './adapters.js';
export * from './energy.js';
export * from './docs.js';
export { CANNED } from './canned.js';
