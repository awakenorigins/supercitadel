// ── Trade executors ──────────────────────────────────────────
// One interface, two backends:
//   • PaperExecutor — deterministic simulation (fees + slippage), fully offline/testable.
//   • LiveExecutor  — real orders via ccxt (market entry + reduce-only SL/TP), best-effort
//                     per-exchange params. Dynamic ccxt import so paper/tests need no dep.
import type { Direction, TradePlan, RiskParams } from './types.js';
import { DEFAULT_RISK } from './risk.js';

export interface Position { symbol: string; direction: Direction; entry: number; size: number; stop: number; takeProfit: number; }
export interface FilledTrade { symbol: string; direction: Direction; entry: number; exit: number; size: number; pnl: number; r: number; reason: string; }
export interface Executor {
  readonly mode: 'paper' | 'live';
  openPosition(plan: TradePlan): Promise<Position>;
  closePosition(symbol: string, exitPrice: number, reason: string): Promise<FilledTrade | null>;
  positions(): Position[] | Promise<Position[]>;
  equity(): Promise<number>;
}

export class PaperExecutor implements Executor {
  readonly mode = 'paper';
  private _equity: number; private pos = new Map<string, Position>(); private r: RiskParams;
  constructor(startEquity = 1000, risk: RiskParams = DEFAULT_RISK) { this._equity = startEquity; this.r = risk; }
  async openPosition(plan: TradePlan): Promise<Position> {
    const p: Position = { symbol: plan.symbol, direction: plan.direction, entry: plan.entry, size: plan.size, stop: plan.stop, takeProfit: plan.takeProfit };
    this._equity -= plan.entry * plan.size * this.r.takerFee;   // entry fee
    this.pos.set(plan.symbol, p);
    return p;
  }
  async closePosition(symbol: string, exitPrice: number, reason: string): Promise<FilledTrade | null> {
    const p = this.pos.get(symbol); if (!p) return null;
    let pnl = p.direction === 'long' ? (exitPrice - p.entry) * p.size : (p.entry - exitPrice) * p.size;
    pnl -= exitPrice * p.size * this.r.takerFee;               // exit fee
    this._equity += pnl;
    this.pos.delete(symbol);
    const stopDist = Math.abs(p.entry - p.stop) * p.size || 1e-9;
    return { symbol, direction: p.direction, entry: p.entry, exit: exitPrice, size: p.size, pnl, r: pnl / stopDist, reason };
  }
  /** Intrabar SL/TP check (stop assumed first if both touched). */
  checkExit(symbol: string, high: number, low: number): { price: number; reason: string } | null {
    const p = this.pos.get(symbol); if (!p) return null;
    if (p.direction === 'long') { if (low <= p.stop) return { price: p.stop, reason: 'stop' }; if (high >= p.takeProfit) return { price: p.takeProfit, reason: 'take_profit' }; }
    else { if (high >= p.stop) return { price: p.stop, reason: 'stop' }; if (low <= p.takeProfit) return { price: p.takeProfit, reason: 'take_profit' }; }
    return null;
  }
  positions(): Position[] { return [...this.pos.values()]; }
  position(symbol: string): Position | undefined { return this.pos.get(symbol); }
  updatePosition(symbol: string, patch: Partial<Position>): void { const p = this.pos.get(symbol); if (p) this.pos.set(symbol, { ...p, ...patch }); }
  async equity(): Promise<number> { return this._equity; }
  unrealized(marks: Record<string, number>): number {
    let u = 0; for (const p of this.pos.values()) { const m = marks[p.symbol]; if (m) u += p.direction === 'long' ? (m - p.entry) * p.size : (p.entry - m) * p.size; }
    return this._equity + u;
  }
}

export class LiveExecutor implements Executor {
  readonly mode = 'live';
  private client: any = null;
  constructor(private exchangeId: string, private opts: { apiKey: string; secret: string; password?: string; marketType?: string; leverage?: number; marginMode?: string }) {}
  private async ex() {
    if (this.client) return this.client;
    // @ts-ignore optional dependency resolved at runtime on the host
    const ccxt: any = await import('ccxt');
    const Ctor = ccxt[this.exchangeId] ?? ccxt.default?.[this.exchangeId];
    if (!Ctor) throw new Error(`Exchange '${this.exchangeId}' not supported by ccxt`);
    this.client = new Ctor({ apiKey: this.opts.apiKey, secret: this.opts.secret, ...(this.opts.password ? { password: this.opts.password } : {}), enableRateLimit: true, options: { defaultType: this.opts.marketType ?? 'swap' } });
    return this.client;
  }
  async openPosition(plan: TradePlan): Promise<Position> {
    const ex = await this.ex();
    const side = plan.direction === 'long' ? 'buy' : 'sell';
    try { if (this.opts.marginMode) await ex.setMarginMode(this.opts.marginMode, plan.symbol); } catch { /* some exchanges reject / not needed */ }
    try { if (this.opts.leverage) await ex.setLeverage(this.opts.leverage, plan.symbol); } catch { /* some exchanges reject / not needed */ }
    await ex.createOrder(plan.symbol, 'market', side, plan.size);
    // best-effort reduce-only protective orders (params vary by exchange)
    const closeSide = plan.direction === 'long' ? 'sell' : 'buy';
    try { await ex.createOrder(plan.symbol, 'stop', closeSide, plan.size, undefined, { stopPrice: plan.stop, reduceOnly: true }); } catch { /* ignore */ }
    try { await ex.createOrder(plan.symbol, 'take_profit', closeSide, plan.size, undefined, { stopPrice: plan.takeProfit, reduceOnly: true }); } catch { /* ignore */ }
    return { symbol: plan.symbol, direction: plan.direction, entry: plan.entry, size: plan.size, stop: plan.stop, takeProfit: plan.takeProfit };
  }
  async closePosition(symbol: string, _exitPrice: number, reason: string): Promise<FilledTrade | null> {
    const ex = await this.ex();
    const poss = await ex.fetchPositions([symbol]).catch(() => []);
    const p = poss.find((x: any) => Number(x.contracts ?? x.amount ?? 0) !== 0);
    if (!p) return null;
    const dir: Direction = (p.side === 'long' || Number(p.contracts) > 0) ? 'long' : 'short';
    const amount = Math.abs(Number(p.contracts ?? p.amount));
    await ex.createOrder(symbol, 'market', dir === 'long' ? 'sell' : 'buy', amount, undefined, { reduceOnly: true });
    const entry = Number(p.entryPrice ?? 0), exit = Number(p.markPrice ?? _exitPrice);
    const pnl = Number(p.unrealizedPnl ?? (dir === 'long' ? (exit - entry) * amount : (entry - exit) * amount));
    return { symbol, direction: dir, entry, exit, size: amount, pnl, r: 0, reason };
  }
  async positions(): Promise<Position[]> {
    const ex = await this.ex();
    const raw = await ex.fetchPositions().catch(() => []);
    return raw.filter((p: any) => Number(p.contracts ?? 0) !== 0).map((p: any) => ({
      symbol: p.symbol, direction: (Number(p.contracts) > 0 || p.side === 'long') ? 'long' : 'short' as any,
      entry: Number(p.entryPrice ?? 0), size: Math.abs(Number(p.contracts ?? 0)), stop: 0, takeProfit: 0,
    }));
  }
  async equity(): Promise<number> { const ex = await this.ex(); const b = await ex.fetchBalance(); return Number(b?.USDT?.total ?? b?.total?.USDT ?? 0); }
}

export function makeExecutor(mode: 'paper' | 'live', cfg: { startEquity?: number; risk?: RiskParams; exchangeId?: string; keys?: { apiKey: string; secret: string; password?: string }; marketType?: string; leverage?: number; marginMode?: string }): Executor {
  if (mode === 'live') {
    if (!cfg.exchangeId || !cfg.keys?.apiKey) throw new Error('live mode requires exchangeId + API keys');
    return new LiveExecutor(cfg.exchangeId, { ...cfg.keys, marketType: cfg.marketType, leverage: cfg.leverage, marginMode: cfg.marginMode });
  }
  return new PaperExecutor(cfg.startEquity ?? 1000, cfg.risk);
}
