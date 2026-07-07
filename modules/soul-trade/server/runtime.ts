// Shared host runtime: a pg pool + a per-request org-scoped transaction (fail-closed RLS)
// + host LLM env. Used by both the routes adapter and the Tiểu Tâm actions adapter so
// isolation is enforced identically everywhere.
import { Pool, type PoolClient } from 'pg';
import type { DbClient } from '../src/db/client.js';
import type { HostLLMEnv } from '../src/llm.js';
import type { TradeToolCtx } from '../src/tools/index.js';

let _pool: Pool | null = null;
export function pool(url?: string): Pool {
  if (!_pool) _pool = new Pool({ connectionString: url ?? process.env.DATABASE_URL });
  return _pool;
}
export function clientAsDb(c: PoolClient): DbClient {
  return { query: (text, params) => c.query(text, params) as any, exec: (sql) => c.query(sql) as any };
}
export function hostEnv(): HostLLMEnv {
  const e = process.env;
  return {
    LLM_BASE_URL: e.LLM_BASE_URL, LLM_MODEL: e.LLM_MODEL, LLM_API_KEY: e.LLM_API_KEY,
    LLM2_BASE_URL: e.LLM2_BASE_URL, LLM2_MODEL: e.LLM2_MODEL, LLM2_API_KEY: e.LLM2_API_KEY,
    OLLAMA_BASE_URL: e.OLLAMA_BASE_URL,
  };
}
/** Run fn inside a transaction scoped to org (SET LOCAL app.current_org_id) → RLS in effect. */
export async function withOrgCtx<T>(orgId: string, actor: string | undefined, fn: (ctx: TradeToolCtx) => Promise<T>, url?: string): Promise<T> {
  const client = await pool(url).connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_org_id', $1, true)", [orgId]);
    const r = await fn({ db: clientAsDb(client), orgId, actor, env: hostEnv() });
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
