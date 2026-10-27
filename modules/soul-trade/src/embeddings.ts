// ── Semantic memory (embeddings) ─────────────────────────────
// Embed each decision so a bot/agent can recall similar past situations. Uses an
// OpenAI-compatible /embeddings endpoint (cloud OR local); a deterministic stub keeps
// it offline-safe. Recall runs on the host via pgvector (<=> cosine distance).
import type { TradeCtx } from './types.js';
import type { LLMConfig, HostLLMEnv } from './llm.js';

export interface EmbeddingProvider { readonly label: string; embed(texts: string[]): Promise<number[][]>; }

export class OpenAICompatEmbeddings implements EmbeddingProvider {
  constructor(private baseUrl: string, private model: string, private apiKey?: string) {}
  get label() { return `${this.model}@${this.baseUrl}`; }
  async embed(texts: string[]): Promise<number[][]> {
    const r = await fetch(this.baseUrl.replace(/\/$/, '') + '/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}) },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!r.ok) throw new Error(`embeddings HTTP ${r.status}`);
    const data: any = await r.json();
    return data.data.map((d: any) => d.embedding as number[]);
  }
}

/** Deterministic offline embedder (hashing trick). dim defaults to 1536 to match the column. */
export class StubEmbeddings implements EmbeddingProvider {
  constructor(private dim = 1536) {}
  get label() { return `stub:${this.dim}`; }
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(t => {
      const v = new Array(this.dim).fill(0);
      for (const tok of t.toLowerCase().split(/\W+/).filter(Boolean)) {
        let h = 2166136261;
        for (let i = 0; i < tok.length; i++) { h ^= tok.charCodeAt(i); h = Math.imul(h, 16777619); }
        v[Math.abs(h) % this.dim] += 1;
      }
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
      return v.map(x => x / norm);
    });
  }
}

export function resolveEmbeddingProvider(cfg: (LLMConfig & { dim?: number }) | undefined, env: HostLLMEnv): EmbeddingProvider {
  const base = cfg?.baseUrl ?? env.LLM_BASE_URL, model = cfg?.model ?? 'text-embedding-3-small';
  if (base) return new OpenAICompatEmbeddings(base, model, cfg?.apiKey ?? env.LLM_API_KEY);
  return new StubEmbeddings(cfg?.dim ?? 1536);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
export const toVectorLiteral = (v: number[]) => '[' + v.join(',') + ']';

export function decisionToText(d: { symbol: string; strategy: string; finalAction: string; note?: string; features?: Record<string, number> }): string {
  const feats = d.features ? Object.entries(d.features).map(([k, v]) => `${k}=${v}`).join(' ') : '';
  return `${d.symbol} ${d.strategy} action=${d.finalAction} ${d.note ?? ''} ${feats}`.trim();
}

/** Attach an embedding to an already-recorded decision (host: pgvector column). */
export async function recordEmbedding(ctx: TradeCtx, decisionId: string, vec: number[]): Promise<void> {
  await ctx.db.query(`UPDATE st_decisions SET embedding = $2::vector WHERE org_id = $1 AND id = $3`,
    [ctx.orgId, toVectorLiteral(vec), decisionId] as any);
}

/** Recall the K most similar past decisions for a bot (host: pgvector cosine distance). */
export async function recallSimilar(ctx: TradeCtx, botId: string, vec: number[], k = 5) {
  const r = await ctx.db.query(
    `SELECT symbol, final_action, note, size_mult::float8 AS size_mult, created_at,
            1 - (embedding <=> $2::vector) AS similarity
     FROM st_decisions
     WHERE org_id = $1 AND bot_id = $3 AND embedding IS NOT NULL
     ORDER BY embedding <=> $2::vector LIMIT $4`,
    [ctx.orgId, toVectorLiteral(vec), botId, k] as any);
  return r.rows;
}
