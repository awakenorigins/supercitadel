import type { TradeCtx } from '../types.js';
import { j } from '../db/client.js';

export interface BotInput {
  name: string; exchange?: string; market_type?: string; symbols?: string[];
  strategy?: string; params?: Record<string, unknown>; risk?: Record<string, unknown>;
  mode?: string; llm?: Record<string, unknown>;
}
export async function createBot(ctx: TradeCtx, b: BotInput): Promise<string> {
  const r = await ctx.db.query<{ id: string }>(
    `INSERT INTO st_bots(org_id,name,exchange,market_type,symbols,strategy,params,risk,mode,llm)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8::jsonb,$9,$10::jsonb) RETURNING id`,
    [ctx.orgId, b.name, b.exchange ?? 'bingx', b.market_type ?? 'swap', j(b.symbols ?? []),
     b.strategy ?? 'rsi_ema', j(b.params ?? {}), j(b.risk ?? {}), b.mode ?? 'paper', j(b.llm ?? {})]);
  return r.rows[0].id;
}
export async function listBots(ctx: TradeCtx) {
  const r = await ctx.db.query(
    `SELECT id,name,exchange,market_type,symbols,strategy,mode,status,llm,
            equity::float8 AS equity, (api_key_enc IS NOT NULL) AS has_keys
     FROM st_bots WHERE org_id=$1 ORDER BY created_at`, [ctx.orgId]);
  return r.rows;
}
export async function getBot(ctx: TradeCtx, name: string) {
  const r = await ctx.db.query(`SELECT * FROM st_bots WHERE org_id=$1 AND name=$2`, [ctx.orgId, name]);
  return r.rows[0] ?? null;
}
export async function setStatus(ctx: TradeCtx, name: string, status: string) {
  await ctx.db.query(`UPDATE st_bots SET status=$3, updated_at=now() WHERE org_id=$1 AND name=$2`, [ctx.orgId, name, status]);
}
export async function setEquity(ctx: TradeCtx, botId: string, equity: number) {
  await ctx.db.query(`UPDATE st_bots SET equity=$3 WHERE org_id=$1 AND id=$2`, [ctx.orgId, botId, equity]);
}
export async function deleteBot(ctx: TradeCtx, name: string): Promise<boolean> {
  const r: any = await ctx.db.query(`DELETE FROM st_bots WHERE org_id=$1 AND name=$2`, [ctx.orgId, name]);
  // pg exposes rowCount; pglite exposes affectedRows — honor whichever exists
  const n = r?.rowCount ?? r?.affectedRows ?? 0;
  return n > 0;
}
