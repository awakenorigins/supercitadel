// ── Exchange API keys vault ─────────────────────────────────
// Gắn tài khoản sàn THẬT (BingX/Binance/Bybit...) vào bot:
//   • AES-256-GCM encrypt-at-rest (key derive từ ST_KEYS_SECRET ?? JWT_SECRET)
//   • verify: gọi fetchBalance thật qua ccxt → chứng minh key sống + đọc số dư
//   • KHÔNG BAO GIỜ trả plaintext key qua API — chỉ trả has_keys + apiKey 4 ký tự cuối.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { TradeCtx } from './types.js';

const masterKey = () =>
  createHash('sha256').update(String(process.env.ST_KEYS_SECRET ?? process.env.JWT_SECRET ?? 'soul-trade-dev')).digest();

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
}
export function decryptSecret(blob: string): string {
  const [v, ivB64, tagB64, dataB64] = String(blob).split(':');
  if (v !== 'v1') throw new Error('Định dạng key không hợp lệ');
  const decipher = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(ivB64!, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64!, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64!, 'base64')), decipher.final()]).toString('utf8');
}

export interface BotKeys { apiKey: string; secret: string }

export async function setBotKeys(ctx: TradeCtx, botName: string, k: BotKeys): Promise<void> {
  await ctx.db.query(
    `UPDATE st_bots SET api_key_enc=$3, api_secret_enc=$4, updated_at=now() WHERE org_id=$1 AND name=$2`,
    [ctx.orgId, botName, encryptSecret(k.apiKey), encryptSecret(k.secret)]);
}
export async function clearBotKeys(ctx: TradeCtx, botName: string): Promise<void> {
  await ctx.db.query(
    `UPDATE st_bots SET api_key_enc=NULL, api_secret_enc=NULL, updated_at=now() WHERE org_id=$1 AND name=$2`,
    [ctx.orgId, botName]);
}
export async function getBotKeys(ctx: TradeCtx, botName: string): Promise<BotKeys | null> {
  const r = await ctx.db.query<{ api_key_enc: string | null; api_secret_enc: string | null }>(
    `SELECT api_key_enc, api_secret_enc FROM st_bots WHERE org_id=$1 AND name=$2`, [ctx.orgId, botName]);
  const row = r.rows[0];
  if (!row?.api_key_enc || !row?.api_secret_enc) return null;
  return { apiKey: decryptSecret(row.api_key_enc), secret: decryptSecret(row.api_secret_enc) };
}

/** Verify key với sàn thật: fetchBalance qua ccxt. Trả số dư USDT + tổng vị thế đang mở. */
export async function verifyKeysWithExchange(exchangeId: string, keys: BotKeys, marketType = 'swap'): Promise<{
  ok: boolean; exchange: string; usdt?: { free: number; used: number; total: number };
  openPositions?: number; error?: string;
}> {
  try {
    // @ts-ignore dynamic dep on host
    const ccxt: any = await import('ccxt');
    const Ctor = ccxt[exchangeId] ?? ccxt.default?.[exchangeId];
    if (!Ctor) return { ok: false, exchange: exchangeId, error: `Sàn '${exchangeId}' không được ccxt hỗ trợ` };
    const ex = new Ctor({ apiKey: keys.apiKey, secret: keys.secret, enableRateLimit: true, options: { defaultType: marketType } });
    const bal = await ex.fetchBalance();
    const u = bal?.USDT ?? bal?.usdt ?? {};
    let openPositions: number | undefined;
    try {
      if (ex.has?.fetchPositions) {
        const ps = await ex.fetchPositions();
        openPositions = (ps ?? []).filter((p: any) => Math.abs(Number(p?.contracts ?? p?.contractSize ?? 0)) > 0 || Math.abs(Number(p?.notional ?? 0)) > 0).length;
      }
    } catch { /* optional */ }
    return { ok: true, exchange: exchangeId,
      usdt: { free: Number(u.free ?? 0), used: Number(u.used ?? 0), total: Number(u.total ?? 0) },
      ...(openPositions != null ? { openPositions } : {}) };
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    // ccxt lỗi auth thường chứa 'signature', 'apikey', '100413', 'Invalid'
    return { ok: false, exchange: exchangeId, error: msg.slice(0, 220) };
  }
}

/** Trạng thái key an toàn để hiển thị UI: không lộ secret. */
export async function keysStatus(ctx: TradeCtx, bot: { name: string; exchange?: string; market_type?: string }, opts: { verify?: boolean } = {}) {
  const keys = await getBotKeys(ctx, bot.name);
  if (!keys) return { bot: bot.name, exchange: bot.exchange ?? 'bingx', has_keys: false as const };
  const masked = `••••${keys.apiKey.slice(-4)}`;
  if (!opts.verify) return { bot: bot.name, exchange: bot.exchange ?? 'bingx', has_keys: true as const, api_key_masked: masked };
  const v = await verifyKeysWithExchange(bot.exchange ?? 'bingx', keys, bot.market_type ?? 'swap');
  return { bot: bot.name, exchange: bot.exchange ?? 'bingx', has_keys: true as const, api_key_masked: masked, live: v };
}
