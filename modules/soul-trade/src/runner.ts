// ── Auto-trade runner ────────────────────────────────────────
// The piece that makes a bot actually TRADE by itself: every tick it fetches fresh
// candles, runs the shared assessment pipeline (strategy → AI ensemble → optional
// agents), checks SL/TP on open positions, opens new ones through an Executor,
// records trades + decision memory + equity to the DB, and emits events.
//
// Framework-neutral: the host supplies `withCtx` (an org-scoped transaction — see
// server/runtime.withOrgCtx) and drives start/stop via RunnerManager. Fully testable
// offline with SyntheticSource + PaperExecutor + pglite.
import type { Candle, Direction, RiskParams, TradePlan } from './types.js';
import type { DataSource } from './datasource.js';
import type { HostLLMEnv } from './llm.js';
import type { TradeToolCtx } from './tools/index.js';
import { DEFAULT_RISK, buildPlan } from './risk.js';
import { PaperExecutor, type Executor, type FilledTrade } from './executor.js';
import { assessSymbol, persistDecision } from './turn.service.js';
import { getBot, setEquity, setStatus } from './services/bot.service.js';
import { recordTrade } from './services/memory.service.js';

export type RunnerEvent =
  | { type: 'turn'; bot: string; symbol: string; action: Direction; sizeMult: number; note: string }
  | { type: 'open'; bot: string; symbol: string; direction: Direction; entry: number; size: number; stop: number; takeProfit: number }
  | { type: 'close'; bot: string; symbol: string; pnl: number; r: number; reason: string }
  | { type: 'kill_switch'; bot: string; drawdown: number }
  | { type: 'error'; bot: string; symbol?: string; message: string };

export interface RunnerConfig {
  intervalMs?: number;          // wall-clock tick period (default 30_000)
  timeframe?: string;           // candle timeframe (default '15m')
  candles?: number;             // candles fetched per tick (default 200)
  useAgents?: boolean;          // run the agent roster each turn
  dropLastCandle?: boolean;     // skip the forming candle (default true — live safety)
  onEvent?: (ev: RunnerEvent) => void;
}

export interface RunnerStats {
  ticks: number; entries: number; exits: number; errors: number;
  entriesSkippedKillSwitch: number; killSwitchActive: boolean; lastNote: string;
}

type WithCtx = <T>(fn: (ctx: TradeToolCtx) => Promise<T>) => Promise<T>;

export class BotRunner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;
  private cooldown = new Map<string, number>();     // symbol -> ticks remaining
  private dayStartEquity: number | null = null;
  private dayKey = '';
  readonly stats: RunnerStats = { ticks: 0, entries: 0, exits: 0, errors: 0, entriesSkippedKillSwitch: 0, killSwitchActive: false, lastNote: '' };

  constructor(
    private botName: string,
    private withCtx: WithCtx,
    private source: DataSource,
    private executor: Executor,
    private env: HostLLMEnv = {},
    private cfg: RunnerConfig = {},
  ) {}

  start(): void {
    if (this.timer) return;
    const ms = this.cfg.intervalMs ?? 30_000;
    this.timer = setInterval(() => { void this.tickOnce(); }, ms);
  }
  stop(): void { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  get running(): boolean { return this.timer !== null; }

  /** Test hook: pin the daily kill-switch reference equity. */
  setDayStart(equity: number): void { this.dayStartEquity = equity; this.dayKey = new Date().toISOString().slice(0, 10); }

  private emit(ev: RunnerEvent): void { try { this.cfg.onEvent?.(ev); } catch { /* listener must not kill the loop */ } }

  private risk(bot: any): RiskParams { return { ...DEFAULT_RISK, ...(bot.risk ?? {}) }; }

  /**
   * One full tick. Public + awaitable so tests (and cron-style hosts) can drive it
   * deterministically without timers. Re-entrancy guarded.
   */
  async tickOnce(): Promise<void> {
    if (this.inFlight) return;           // previous tick still running — skip, don't stack
    this.inFlight = true;
    try {
      await this.withCtx(async (ctx) => {
        const bot = await getBot(ctx, this.botName);
        if (!bot) { this.stop(); return; }
        if (bot.status !== 'running') return;          // paused via API/Tiểu Tâm — honor it
        this.stats.ticks++;

        const risk = this.risk(bot);
        const symbols: string[] = Array.isArray(bot.symbols) && bot.symbols.length ? bot.symbols : ['BTC/USDT:USDT'];

        // daily kill-switch bookkeeping (reset on date change)
        const today = new Date().toISOString().slice(0, 10);
        const eqNow = await this.executor.equity();
        if (this.dayKey !== today) { this.dayKey = today; this.dayStartEquity = eqNow; this.stats.killSwitchActive = false; }
        if (this.dayStartEquity == null) this.dayStartEquity = eqNow;
        const dd = this.dayStartEquity > 0 ? eqNow / this.dayStartEquity - 1 : 0;
        if (dd <= -risk.maxDailyLoss && !this.stats.killSwitchActive) {
          this.stats.killSwitchActive = true;
          this.emit({ type: 'kill_switch', bot: this.botName, drawdown: dd });
        }

        const marks: Record<string, number> = {};
        for (const symbol of symbols) {
          try {
            await this.tickSymbol(ctx, bot, symbol, risk, marks);
          } catch (e: any) {
            this.stats.errors++;
            this.emit({ type: 'error', bot: this.botName, symbol, message: String(e?.message ?? e) });
            // one symbol failing must never take down the others
          }
        }

        // persist mark-to-market equity
        const mtm = this.executor instanceof PaperExecutor ? this.executor.unrealized(marks) : await this.executor.equity();
        await setEquity(ctx, bot.id, mtm);
      });
    } catch (e: any) {
      this.stats.errors++;
      this.emit({ type: 'error', bot: this.botName, message: String(e?.message ?? e) });
    } finally {
      this.inFlight = false;
    }
  }

  private async tickSymbol(ctx: TradeToolCtx, bot: any, symbol: string, risk: RiskParams, marks: Record<string, number>): Promise<void> {
    const candles: Candle[] = await this.source.fetchOHLCV(symbol, this.cfg.timeframe ?? '15m', this.cfg.candles ?? 200);
    const a = await assessSymbol(candles, symbol, bot, this.env, {
      useAgents: this.cfg.useAgents, dropLast: this.cfg.dropLastCandle ?? true,
    });
    marks[symbol] = a.close;
    this.stats.lastNote = a.note;
    this.emit({ type: 'turn', bot: this.botName, symbol, action: a.direction, sizeMult: a.sizeMult, note: a.note });

    // memory: every turn is recorded (with auto-embed when bot.llm.embedding is set)
    await persistDecision(ctx, bot.id, bot.strategy, a, this.env, bot.llm?.embedding);

    // 1) manage an open position on this symbol: SL/TP against the latest CLOSED bar
    if (this.executor instanceof PaperExecutor) {
      const hit = this.executor.checkExit(symbol, a.high, a.low);
      if (hit) {
        const t = await this.executor.closePosition(symbol, hit.price, hit.reason);
        if (t) await this.afterClose(ctx, bot, t);
        this.cooldown.set(symbol, hit.reason === 'stop' ? risk.cooldownBars : 0);
        return; // one action per symbol per tick
      }
    }

    // 2) entries
    if (a.direction === 'flat') return;
    const cd = this.cooldown.get(symbol) ?? 0;
    if (cd > 0) { this.cooldown.set(symbol, cd - 1); return; }
    const open = await Promise.resolve(this.executor.positions());
    if (open.find(p => p.symbol === symbol)) return;                    // already in — no pyramiding
    if (open.length >= risk.maxPositions) return;                       // portfolio cap
    if (this.stats.killSwitchActive) { this.stats.entriesSkippedKillSwitch++; return; }

    const entry = a.close * (a.direction === 'long' ? 1 + risk.slippage : 1 - risk.slippage);
    const equity = await this.executor.equity();
    const plan: TradePlan | null = buildPlan(symbol, a.direction, entry, a.atr, equity, risk, a.sizeMult);
    if (!plan) return;
    const pos = await this.executor.openPosition(plan);
    this.stats.entries++;
    this.emit({ type: 'open', bot: this.botName, symbol, direction: pos.direction, entry: pos.entry, size: pos.size, stop: pos.stop, takeProfit: pos.takeProfit });
  }

  private async afterClose(ctx: TradeToolCtx, bot: any, t: FilledTrade): Promise<void> {
    this.stats.exits++;
    await recordTrade(ctx, {
      botId: bot.id, symbol: t.symbol, direction: t.direction, entry: t.entry, exit: t.exit,
      size: t.size, pnl: t.pnl, r: t.r, reason: t.reason, strategy: bot.strategy, closed: true,
    });
    this.emit({ type: 'close', bot: this.botName, symbol: t.symbol, pnl: t.pnl, r: t.r, reason: t.reason });
  }
}

/** Orchestrates one runner per (org, bot) — what the host background worker holds. */
export class RunnerManager {
  private runners = new Map<string, BotRunner>();
  key(orgId: string, bot: string): string { return `${orgId}:${bot}`; }

  register(orgId: string, botName: string, runner: BotRunner): BotRunner {
    const k = this.key(orgId, botName);
    this.runners.get(k)?.stop();
    this.runners.set(k, runner);
    return runner;
  }
  get(orgId: string, botName: string): BotRunner | undefined { return this.runners.get(this.key(orgId, botName)); }
  async startBot(ctx: TradeToolCtx, orgId: string, botName: string): Promise<void> {
    await setStatus(ctx, botName, 'running');
    this.get(orgId, botName)?.start();
  }
  async stopBot(ctx: TradeToolCtx, orgId: string, botName: string): Promise<void> {
    await setStatus(ctx, botName, 'idle');
    this.get(orgId, botName)?.stop();
  }
  stopAll(): void { for (const r of [...this.runners.values()]) r.stop(); }
  status(): Array<{ key: string; running: boolean; stats: RunnerStats }> {
    return [...this.runners.entries()].map(([key, r]) => ({ key, running: r.running, stats: r.stats }));
  }
}
