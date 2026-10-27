// ── Per-bot LLM providers ────────────────────────────────────
// One interface, three ways to plug a brain in:
//   • Cloud gateway  — host's LLM_BASE_URL/LLM_MODEL (e.g. cc/claude-sonnet-4-6)
//   • Local model    — point baseUrl at Ollama / LM Studio / llama.cpp (OpenAI-compatible)
//   • Stub           — deterministic, offline (tests + no-key fallback)
// Every provider speaks the OpenAI /chat/completions shape, the common denominator
// across OpenAI, most gateways, Ollama (/v1), and LM Studio.

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string; }
export interface LLMProvider { readonly label: string; chat(messages: ChatMessage[], opts?: { json?: boolean; maxTokens?: number }): Promise<string>; }

export interface LLMConfig { model?: string; baseUrl?: string; apiKey?: string; }
export interface HostLLMEnv { LLM_BASE_URL?: string; LLM_MODEL?: string; LLM_API_KEY?: string;
  LLM2_BASE_URL?: string; LLM2_MODEL?: string; LLM2_API_KEY?: string;
  OLLAMA_BASE_URL?: string; }

/** OpenAI-compatible chat provider (works for cloud gateways AND local servers). */
export class OpenAICompatProvider implements LLMProvider {
  constructor(private baseUrl: string, private model: string, private apiKey?: string) {}
  get label() { return `${this.model}@${this.baseUrl}`; }
  async chat(messages: ChatMessage[], opts: { json?: boolean; maxTokens?: number } = {}): Promise<string> {
    const url = this.baseUrl.replace(/\/$/, '') + '/chat/completions';
    const body: any = { model: this.model, messages, max_tokens: opts.maxTokens ?? 400, temperature: 0.2 };
    if (opts.json) body.response_format = { type: 'json_object' };
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}) },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`LLM ${this.model} HTTP ${r.status}`);
    const data: any = await r.json();
    return data.choices?.[0]?.message?.content ?? '';
  }
}

/** Deterministic stub — used offline / in tests / when no provider is configured. */
export class StubProvider implements LLMProvider {
  constructor(private responder: (messages: ChatMessage[]) => string = () => '{"action":"flat","confidence":0.0,"reason":"stub"}') {}
  get label() { return 'stub'; }
  async chat(messages: ChatMessage[]): Promise<string> { return this.responder(messages); }
}

/**
 * Resolve a provider from a per-bot/agent config, falling back to host env.
 * Model prefix convention: "local/*" or an explicit baseUrl → OpenAI-compatible;
 * "cx/*" → second host model (LLM2_*); otherwise → primary host model (LLM_*).
 */
export function resolveProvider(cfg: LLMConfig | undefined, env: HostLLMEnv): LLMProvider {
  const model = cfg?.model ?? env.LLM_MODEL;
  // explicit local endpoint (per-bot) OR local/* prefix -> local server
  if (cfg?.baseUrl || (model && model.startsWith('local/'))) {
    const baseUrl = cfg?.baseUrl ?? env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1';
    const m = (model ?? 'local/llama3.1').replace(/^local\//, '');
    return new OpenAICompatProvider(baseUrl, m, cfg?.apiKey);
  }
  // second host model
  if (model && model.startsWith('cx/') && env.LLM2_BASE_URL) {
    return new OpenAICompatProvider(env.LLM2_BASE_URL, model, cfg?.apiKey ?? env.LLM2_API_KEY);
  }
  // primary host gateway
  if ((cfg?.baseUrl ?? env.LLM_BASE_URL) && model) {
    return new OpenAICompatProvider((cfg?.baseUrl ?? env.LLM_BASE_URL)!, model, cfg?.apiKey ?? env.LLM_API_KEY);
  }
  // nothing configured -> stub (offline-safe)
  return new StubProvider();
}
