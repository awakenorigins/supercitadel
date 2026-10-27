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
  // Micro-cache chống độ trễ: UI poll 2.5s + worker tick 8s đều gọi cùng ticker/ohlcv —
  // không cache thì mỗi request trả ~0.9-1s vì round-trip sàn. TTL ngắn nên giá vẫn "live".
  private priceCache = new Map<string, { v: number; at: number }>();
  private ohlcvCache = new Map<string, { v: Candle[]; at: number }>();
  private inflight = new Map<string, Promise<any>>(); // gộp request trùng đang bay
  private static PRICE_TTL = 2000; // 2s
  private static OHLCV_TTL = 5000; // 5s
  private dedup<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const cur = this.inflight.get(key);
    if (cur) return cur as Promise<T>;
    const p = fn().finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }
  async fetchOHLCV(symbol: string, timeframe: string, limit: number): Promise<Candle[]> {
    const key = `${symbol}|${timeframe}|${limit}`;
    const hit = this.ohlcvCache.get(key);
    if (hit && Date.now() - hit.at < CcxtSource.OHLCV_TTL) return hit.v;
    return this.dedup(`o:${key}`, async () => {
      const ex = await this.ex(); const rows = await ex.fetchOHLCV(symbol, timeframe, undefined, limit);
      const v = rows2candles(rows);
      this.ohlcvCache.set(key, { v, at: Date.now() });
      return v;
    });
  }
  async fetchPrice(symbol: string): Promise<number> {
    const hit = this.priceCache.get(symbol);
    if (hit && Date.now() - hit.at < CcxtSource.PRICE_TTL) return hit.v;
    return this.dedup(`p:${symbol}`, async () => {
      const ex = await this.ex(); const t = await ex.fetchTicker(symbol);
      const v = Number(t.last);
      this.priceCache.set(symbol, { v, at: Date.now() });
      return v;
    });
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

// Pool CcxtSource dùng chung theo exchange — trước đây mỗi call `new CcxtSource(...)`
// = tạo ccxt client mới + không tận dụng cache → position/ohlcv mất ~1s mỗi request.
// Pool + micro-cache trong CcxtSource kéo xuống còn vài ms khi cache ấm.
const liveSources = new Map<string, CcxtSource>();
function liveSource(id: string): CcxtSource {
  let s = liveSources.get(id);
  if (!s) { s = new CcxtSource(id, { marketType: 'spot' }); liveSources.set(id, s); }
  return s;
}

// ── TOP MOVERS: cặp USDT biến động 24h dữ dội nhất (fetchTickers thật, cache 30s) ──
export interface Mover { symbol: string; last: number; changePct: number; high: number; low: number; rangePct: number; quoteVolume: number }
let moversCache: { key: string; at: number; v: Mover[] } | null = null;
let moversInflight: Promise<Mover[]> | null = null;
export async function fetchTopMovers(exchange = 'binance', limit = 12): Promise<Mover[]> {
  const key = `${exchange}`;
  if (moversCache && moversCache.key === key && Date.now() - moversCache.at < 30_000) return moversCache.v.slice(0, limit);
  if (moversInflight) return (await moversInflight).slice(0, limit);
  moversInflight = (async () => {
    const ids = [exchange, ...(exchange === 'binance' ? ['bybit'] : ['binance', 'bybit'])];
    let lastErr: any;
    for (const id of [...new Set(ids)]) {
      try {
        // @ts-ignore dynamic dep on host
        const ccxt: any = await import('ccxt');
        const Ctor = ccxt[id] ?? ccxt.default?.[id];
        if (!Ctor) continue;
        const ex = new Ctor({ enableRateLimit: true, options: { defaultType: 'spot' } });
        const tickers = await ex.fetchTickers();
        const movers: Mover[] = Object.values(tickers as Record<string, any>)
          .filter((t: any) => typeof t?.symbol === 'string' && /\/USDT$/.test(t.symbol) && !/UP\/|DOWN\/|BULL\/|BEAR\/|[23][LS]\//.test(t.symbol))
          .map((t: any) => {
            const last = Number(t.last ?? t.close ?? 0);
            const high = Number(t.high ?? 0), low = Number(t.low ?? 0);
            const changePct = Number(t.percentage ?? ((t.open ? (last - Number(t.open)) / Number(t.open) * 100 : 0)));
            const rangePct = low > 0 ? (high - low) / low * 100 : 0;
            return { symbol: t.symbol, last, changePct, high, low, rangePct, quoteVolume: Number(t.quoteVolume ?? 0) };
          })
          // lọc rác: cần volume tối thiểu để không gợi ý coin chết thanh khoản
          .filter((m) => Number.isFinite(m.changePct) && m.last > 0 && m.quoteVolume >= 2_000_000)
          // điểm "dữ dội" = |%24h| + ½ biên độ high-low
          .sort((a, b) => (Math.abs(b.changePct) + b.rangePct / 2) - (Math.abs(a.changePct) + a.rangePct / 2))
          .slice(0, 30);
        if (movers.length) { moversCache = { key, at: Date.now(), v: movers }; return movers; }
      } catch (e) { lastErr = e; }
    }
    throw lastErr ?? new Error('movers unavailable');
  })().finally(() => { moversInflight = null; });
  return (await moversInflight).slice(0, limit);
}

/** Public live ticker with Binance first and Bybit fallback. No API key needed. */
export async function fetchLivePrice(exchange = 'binance', symbol = 'BTC/USDT'): Promise<number> {
  const ids = [exchange, ...(exchange === 'binance' ? ['bybit'] : ['binance', 'bybit'])];
  let lastErr: any;
  for (const id of [...new Set(ids)]) {
    try {
      const px = await liveSource(id).fetchPrice(symbol);
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
      const rows = await liveSource(id).fetchOHLCV(symbol, timeframe, limit);
      if (rows.length) return rows;
    } catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error('live ohlcv unavailable');
}

export function makeDataSource(exchangeId: string, opts: { apiKey?: string; secret?: string; password?: string; marketType?: string } = {}): DataSource {
  if (exchangeId === 'synthetic') return new SyntheticSource();
  return new CcxtSource(exchangeId, opts);
}
