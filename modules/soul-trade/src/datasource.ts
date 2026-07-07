// ── Data source adapter ──────────────────────────────────────
// Plug-and-play market data. Real exchanges (Bybit / Binance / BingX / OKX ...)
// go through ccxt; a deterministic synthetic source powers demos & tests offline.
import type { Candle } from './types.js';

export interface DataSource {
  readonly id: string;
  fetchOHLCV(symbol: string, timeframe: string, limit: number): Promise<Candle[]>;
  fetchPrice(symbol: string): Promise<number>;
}

const rows2candles = (rows: number[][]): Candle[] =>
  rows.map(r => ({ ts: r[0], open: r[1], high: r[2], low: r[3], close: r[4], volume: r[5] }));

/** Real exchange via ccxt (dynamic import so offline tests don't need it). */
export class CcxtSource implements DataSource {
  constructor(public readonly id: string, private opts: { apiKey?: string; secret?: string; password?: string; marketType?: string } = {}) {}
  private client: any = null;
  private async ex() {
    if (this.client) return this.client;
    // @ts-ignore optional dependency resolved at runtime on the host
    const ccxt: any = await import('ccxt');
    const Ctor = ccxt[this.id] ?? ccxt.default?.[this.id];
    if (!Ctor) throw new Error(`Exchange '${this.id}' not supported by ccxt`);
    this.client = new Ctor({
      enableRateLimit: true,
      options: { defaultType: this.opts.marketType ?? 'swap' },
      ...(this.opts.apiKey ? { apiKey: this.opts.apiKey, secret: this.opts.secret } : {}),
      ...(this.opts.password ? { password: this.opts.password } : {}),
    });
    return this.client;
  }
  async fetchOHLCV(symbol: string, timeframe: string, limit: number): Promise<Candle[]> {
    const ex = await this.ex(); const rows = await ex.fetchOHLCV(symbol, timeframe, undefined, limit);
    return rows2candles(rows);
  }
  async fetchPrice(symbol: string): Promise<number> {
    const ex = await this.ex(); const t = await ex.fetchTicker(symbol); return Number(t.last);
  }
}

/** Deterministic synthetic source — no network, seeded, for demo + tests. */
export class SyntheticSource implements DataSource {
  readonly id = 'synthetic';
  constructor(private seed = 42, private base = 100) {}
  private rng() { this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff; return this.seed / 0x7fffffff; }
  fetchOHLCVSync(n: number): Candle[] {
    const out: Candle[] = []; let px = this.base; const t0 = 1_700_000_000_000;
    for (let i = 0; i < n; i++) {
      px = Math.max(1, px * (1 + (this.rng() - 0.48) * 0.02) + Math.sin(i / 17) * 0.05);
      const noise = (this.rng() - 0.5) * 0.4;
      out.push({ ts: t0 + i * 900_000, open: px + noise, high: px + Math.abs(noise) + 0.3, low: px - Math.abs(noise) - 0.3, close: px, volume: 1000 });
    }
    return out;
  }
  async fetchOHLCV(_s: string, _tf: string, limit: number): Promise<Candle[]> { return this.fetchOHLCVSync(limit); }
  async fetchPrice(_s: string): Promise<number> { const c = this.fetchOHLCVSync(50); return c[c.length - 1].close; }
}

export const SUPPORTED_EXCHANGES = ['bingx', 'binance', 'bybit', 'okx', 'gate', 'kucoin', 'mexc'] as const;

/** Public live ticker with Binance first and Bybit fallback. No API key needed. */
export async function fetchLivePrice(exchange = 'binance', symbol = 'BTC/USDT'): Promise<number> {
  const ids = [exchange, ...(exchange === 'binance' ? ['bybit'] : ['binance', 'bybit'])];
  let lastErr: any;
  for (const id of [...new Set(ids)]) {
    try {
      const px = await new CcxtSource(id, { marketType: 'spot' }).fetchPrice(symbol);
      if (Number.isFinite(px) && px > 0) return px;
    } catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error('live price unavailable');
}

/** Public live OHLCV with Binance first and Bybit fallback. No API key needed. */
export async function fetchLiveOHLCV(exchange = 'binance', symbol = 'BTC/USDT', timeframe = '1m', limit = 200): Promise<Candle[]> {
  const ids = [exchange, ...(exchange === 'binance' ? ['bybit'] : ['binance', 'bybit'])];
  let lastErr: any;
  for (const id of [...new Set(ids)]) {
    try {
      const rows = await new CcxtSource(id, { marketType: 'spot' }).fetchOHLCV(symbol, timeframe, limit);
      if (rows.length) return rows;
    } catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error('live ohlcv unavailable');
}

export function makeDataSource(exchangeId: string, opts: { apiKey?: string; secret?: string; password?: string; marketType?: string } = {}): DataSource {
  if (exchangeId === 'synthetic') return new SyntheticSource();
  return new CcxtSource(exchangeId, opts);
}
