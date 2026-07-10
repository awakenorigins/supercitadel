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

// ── BACKGROUND AUTOMATO WORKER (anh Nấng 09/07) ──────────────────────────────
// Trước đây automato chỉ tick khi UI mở trang (gọi /automato/position). Thoát ra = đứng im.
// Worker này chạy NềN trên server: mỗi ~8s quét MỌI bot armed + running (mọi org) và tick,
// để SL/TP tự chạy, lệnh tự vào/ra kể cả khi anh đã đóng tab.
export function startAutomatoWorker(opts?: { intervalMs?: number; url?: string }): { stop: () => void } {
  const intervalMs = Math.max(2000, opts?.intervalMs ?? 8000);
  let running = false;
  const tickAll = async () => {
    if (running) return; // chống chồng lấn nếu tick trước chưa xong
    running = true;
    try {
      // Lấy danh sách (org_id, bot_id) cần tick: automato armed + bot đang running, chưa halted.
      // Query admin (không set org) — bảng có RLS nhưng superuser/owner pool bỏ qua; dùng client riêng.
      const admin = await pool(opts?.url).connect();
      let single: { org_id: string; bot_id: string }[] = [];
      let multi: { org_id: string; bot_id: string }[] = [];
      try {
        // (a) automato đơn lệnh cũ: config.armed + bot running
        const q1 = await admin.query(
          `SELECT c.org_id, c.bot_id FROM st_automato_configs c
             JOIN st_bots b ON b.id = c.bot_id AND b.org_id = c.org_id
            WHERE c.armed = true AND b.status = 'running'
              AND COALESCE(c.state->>'uiPhase','') <> 'halted'`,
        );
        single = q1.rows as any;
        // (b) đa lệnh: bất kỳ order nào armed + bot running
        const q2 = await admin.query(
          `SELECT DISTINCT o.org_id, o.bot_id FROM st_automato_orders o
             JOIN st_bots b ON b.id = o.bot_id AND b.org_id = o.org_id
            WHERE o.armed = true AND b.status = 'running'`,
        );
        multi = q2.rows as any;
      } finally { admin.release(); }
      if (!single.length && !multi.length) return;
      const { getAutomatoPosition } = await import('../src/automato.service.js');
      const { listOrders, tickOrder } = await import('../src/automato-orders.service.js');
      // Single-position bots
      const singleByOrg = new Map<string, Set<string>>();
      for (const r of single) { (singleByOrg.get(r.org_id) ?? singleByOrg.set(r.org_id, new Set()).get(r.org_id)!).add(r.bot_id); }
      for (const [orgId, botIds] of singleByOrg) {
        for (const botId of botIds) {
          try {
            await withOrgCtx(orgId, 'automato-worker', async (ctx) => {
              const br = await ctx.db.query(`SELECT * FROM st_bots WHERE id=$1`, [botId]);
              const bot = br.rows?.[0];
              if (bot) await getAutomatoPosition(ctx, bot);
            }, opts?.url);
          } catch (e) { console.error(`[automato-worker] single org ${orgId} bot ${botId} loi`, (e as any)?.message ?? e); }
        }
      }
      // Multi-order bots → tick từng order armed
      const multiByOrg = new Map<string, Set<string>>();
      for (const r of multi) { (multiByOrg.get(r.org_id) ?? multiByOrg.set(r.org_id, new Set()).get(r.org_id)!).add(r.bot_id); }
      for (const [orgId, botIds] of multiByOrg) {
        for (const botId of botIds) {
          try {
            await withOrgCtx(orgId, 'automato-worker', async (ctx) => {
              const br = await ctx.db.query(`SELECT * FROM st_bots WHERE id=$1`, [botId]);
              const bot = br.rows?.[0];
              if (!bot) return;
              const orders = await listOrders(ctx, botId);
              for (const o of orders) { if (o.armed) { try { await tickOrder(ctx, bot, o); } catch (e) { console.error(`[automato-worker] order ${o.id} loi`, (e as any)?.message ?? e); } } }
            }, opts?.url);
          } catch (e) { console.error(`[automato-worker] multi org ${orgId} bot ${botId} loi`, (e as any)?.message ?? e); }
        }
      }
    } catch (e) {
      console.error('[automato-worker] tick loi', (e as any)?.message ?? e);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => { tickAll().catch((e) => console.error('[automato-worker]', e)); }, intervalMs);
  (timer as any).unref?.();
  console.log(`[automato-worker] started — tick mỗi ${intervalMs}ms (chạy nền, thoát UI vẫn chạy)`);
  return { stop: () => clearInterval(timer) };
}
