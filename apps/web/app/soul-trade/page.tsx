'use client';
// SOUL-TRADE — control room (apps/web/app/soul-trade/page.tsx)
// Full port of the original brass-on-slate "instrument room" design: grid background,
// pulsing brass LED, tape header, bot cards with canvas sparklines, decision-memory feed,
// trades table, backtest + walk-forward labs, semantic recall, agent contribution.
import { useEffect, useState, useCallback, useRef } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const BASE = `${API}/api/v1/soul-trade`;   // host mounts the module here (manifest.json#routes)
// Auth chuẩn host: JWT phiên đăng nhập (citadel.session) — KHÔNG dùng demo token cứng.
function sessionJwt(): string {
  if (typeof window === 'undefined') return '';
  try { return JSON.parse(localStorage.getItem('citadel.session') ?? '{}')?.jwt ?? ''; } catch { return ''; }
}

type Bot = { id: string; name: string; exchange: string; strategy: string; mode: string; status: string; equity: number; symbols: string[]; llm?: any; has_keys?: boolean };
type Analytics = { total_trades: number; wins: number; win_rate: number; profit_factor: number; total_pnl: number; avg_r: number; turns_by_action: Record<string, number> };

async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const jwt = sessionJwt();
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  return r.json();
}
const fmt = (n?: number | string | null) => (n == null ? '—' : '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/* ── canvas painters (ported 1:1 from the original) ─────────── */
function paintSpark(cv: HTMLCanvasElement, data: number[]) {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  cv.width = w * dpr; cv.height = h * dpr;
  const c = cv.getContext('2d')!; c.scale(dpr, dpr); c.clearRect(0, 0, w, h);
  if (data.length < 2) return;
  const mn = Math.min(...data), mx = Math.max(...data), rg = (mx - mn) || 1;
  const x = (i: number) => (i / (data.length - 1)) * w, y = (v: number) => h - 3 - ((v - mn) / rg) * (h - 6);
  const up = data[data.length - 1] >= data[0];
  c.beginPath(); data.forEach((v, i) => (i ? c.lineTo(x(i), y(v)) : c.moveTo(x(i), y(v)))); c.lineTo(w, h); c.lineTo(0, h); c.closePath();
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, up ? 'rgba(87,200,138,.22)' : 'rgba(232,105,92,.22)'); g.addColorStop(1, 'transparent');
  c.fillStyle = g; c.fill();
  c.beginPath(); data.forEach((v, i) => (i ? c.lineTo(x(i), y(v)) : c.moveTo(x(i), y(v))));
  c.strokeStyle = up ? '#57C88A' : '#E8695C'; c.lineWidth = 1.5; c.stroke();
}
function Spark({ data }: { data: number[] }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => { if (ref.current) paintSpark(ref.current, data); }, [data]);
  return <canvas ref={ref} className="spark" />;
}

/* ── page ───────────────────────────────────────────────────── */
export default function SoulTradePage() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [an, setAn] = useState<Analytics | null>(null);
  const [mem, setMem] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [contrib, setContrib] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState('');
  const eqHist = useRef<Record<string, number[]>>({});
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2400); };

  const refresh = useCallback(async () => {
    try {
      const d = await api<Bot[] | { bots: Bot[] }>('/trade/bots');
      const list: Bot[] = Array.isArray(d) ? d : ((d as any).bots ?? []);
      for (const b of list) {
        const h = (eqHist.current[b.name] = eqHist.current[b.name] ?? []);
        if (b.equity != null) { h.push(Number(b.equity)); if (h.length > 40) h.shift(); }
      }
      setBots(list);
      setSel(s => s ?? list[0]?.name ?? null);
    } catch (e: any) { say(e.message); }
  }, []);

  useEffect(() => { refresh(); const t = setInterval(refresh, 5000); return () => clearInterval(t); }, [refresh]);
  useEffect(() => {
    if (!sel) return;
    api<Analytics>(`/trade/bots/${sel}/analytics`).then(setAn).catch(() => {});
    api<any[]>(`/trade/bots/${sel}/memory?limit=14`).then(setMem).catch(() => {});
    api<any[]>(`/trade/bots/${sel}/trades?limit=12`).then(setTrades).catch(() => {});
    api<any[]>(`/trade/bots/${sel}/agents`).then(setContrib).catch(() => {});
  }, [sel, bots]);

  const totalEq = bots.reduce((s, b) => s + Number(b.equity || 0), 0);
  const running = bots.filter(b => b.status === 'running').length;

  const act = async (name: string, verb: 'start' | 'stop') => { try { await api(`/trade/bots/${name}/${verb}`, 'POST'); say(`${name} ${verb === 'start' ? 'started' : 'stopped'}`); refresh(); } catch (e: any) { say(e.message); } };
  const del = async (name: string) => { if (!confirm(`Delete bot "${name}"?`)) return; try { await api(`/trade/bots/${name}`, 'DELETE'); delete eqHist.current[name]; setSel(null); say(`${name} deleted`); refresh(); } catch (e: any) { say(e.message); } };
  const evalTurn = async (name: string) => { try { const r = await api<any>(`/trade/bots/${name}/evaluate`, 'POST', { use_agents: true }); say(`turn: ${r.finalAction} · ${r.note}`); refresh(); } catch (e: any) { say(e.message); } };

  return (
    <div className="st-root">
      <Style />
      <div className="wrap">
        <header className="tape">
          <div className="header-left">
            <a className="back-home" href="/home" aria-label="Về Super Citadel">← Về Super Citadel</a>
            <div className="brand"><span className="led" /><div><h1>SOUL-TRADE</h1><small>control room</small></div></div>
          </div>
          <div className="right">
            <div className="readout"><div className="lbl">total equity</div><div className="val">{fmt(totalEq)}</div></div>
            <div className="meta">{bots.length} bot{bots.length !== 1 ? 's' : ''} · {running} running</div>
          </div>
        </header>

        <div className="eyebrow"><span className="k">Bots</span><span className="rule" /><span className="mt">isolated · per-org RLS · auto-trade loop</span></div>
        <div className="toolbar"><button className="btn primary" onClick={() => setShowForm(v => !v)}>+ New bot</button></div>
        {showForm && <NewBotForm onDone={() => { setShowForm(false); refresh(); }} say={say} />}

        <div className="grid">
          {bots.map(b => (
            <div key={b.name} className={`card ${b.status === 'running' ? 'live' : ''} ${sel === b.name ? 'is-sel' : ''}`} onClick={() => setSel(b.name)}>
              <div className="top">
                <div className="name"><span className="dot" /><b>{b.name}</b></div>
                <div className="tags">
                  {b.mode === 'live' ? <span className="tag live-badge">LIVE</span> : <span className="tag">{b.mode}</span>}
                  <span className="tag">{b.exchange}</span>
                </div>
              </div>
              <div className="eq">{fmt(b.equity)}</div>
              <Spark data={eqHist.current[b.name] ?? []} />
              <div className="rows">
                <div className="row"><span>strategy</span><b>{b.strategy}</b></div>
                <div className="row"><span>status</span><b>{b.status}</b></div>
                <div className="row"><span>symbols</span><b>{b.symbols?.length ?? 0}</b></div>
                <div className="row"><span>agents</span><b>{(b.llm?.agents ?? []).filter((a: any) => a.enabled).length || '—'}</b></div>
              </div>
              <div className="actions" onClick={e => e.stopPropagation()}>
                {b.status === 'running'
                  ? <button className="btn sm ghost" onClick={() => act(b.name, 'stop')}>Stop</button>
                  : <button className="btn sm primary" onClick={() => act(b.name, 'start')}>Start</button>}
                <button className="btn sm ghost" onClick={() => evalTurn(b.name)}>Evaluate</button>
                <button className="btn sm ghost danger" onClick={() => del(b.name)}>Delete</button>
              </div>
            </div>
          ))}
          {!bots.length && <div className="empty">No bots yet. Hit <b>+ New bot</b> (paper mode needs no keys) — or ask Tiểu Tâm: “tạo bot paper trên bybit”.</div>}
        </div>

        {sel && (
          <>
            <div className="eyebrow"><span className="k">{sel} · performance</span><span className="rule" /><span className="mt">across total trades</span></div>
            <div className="metrics">
              {an ? <>
                <Metric l="Total PnL" v={fmt(an.total_pnl)} cls={an.total_pnl >= 0 ? 'up' : 'down'} />
                <Metric l="Trades" v={String(an.total_trades)} />
                <Metric l="Win rate" v={(an.win_rate * 100).toFixed(1) + '%'} />
                <Metric l="Profit factor" v={an.profit_factor.toFixed(2)} />
                <Metric l="Avg R" v={an.avg_r.toFixed(2)} />
                <Metric l="Turns L/S/F" v={`${an.turns_by_action.long ?? 0}/${an.turns_by_action.short ?? 0}/${an.turns_by_action.flat ?? 0}`} />
              </> : <span className="dim">loading…</span>}
            </div>

            <div className="cols">
              <div>
                <div className="eyebrow"><span className="k">Decision memory</span><span className="rule" /><span className="mt">per-turn · strategy + AI + agents</span></div>
                <div className="feed">
                  {mem.length ? mem.map((d, i) => (
                    <div key={i} className="ev">
                      <span className="ico">{d.final_action === 'long' ? '🟢' : d.final_action === 'short' ? '🔴' : '⚪'}</span>
                      <span className="txt"><b>{String(d.final_action).toUpperCase()}</b> <span className="mono">{d.symbol}</span> · ×{Number(d.size_mult).toFixed(2)} <span className="dim">{d.note}</span></span>
                      <span className="t">{new Date(d.created_at).toLocaleTimeString()}</span>
                    </div>
                  )) : <div className="feed-empty">no decisions yet — press Evaluate or start the bot</div>}
                </div>
              </div>
              <div>
                <div className="eyebrow"><span className="k">Agents</span><span className="rule" /></div>
                <div className="tgcard">
                  {contrib.length ? contrib.map(c => (
                    <div key={c.name} className="agent-row">
                      <span className="mono">{c.name}</span>
                      <span className="agree">{(c.agreement * 100).toFixed(0)}% <span className="dim">({c.votes})</span></span>
                    </div>
                  )) : <p className="dim" style={{ fontSize: 12 }}>No agent votes yet — run Evaluate with agents.</p>}
                  <RecallBox bot={sel} />
                </div>
              </div>
            </div>

            <div className="eyebrow"><span className="k">Recent trades</span><span className="rule" /></div>
            <div className="trades">
              <table>
                <thead><tr><th>Symbol</th><th>Side</th><th>Entry</th><th>Exit</th><th>PnL</th><th>R</th><th>Exit by</th></tr></thead>
                <tbody>
                  {trades.map((t, i) => (
                    <tr key={i}>
                      <td className="mono">{t.symbol}</td><td>{t.direction}</td>
                      <td>{Number(t.entry).toFixed(2)}</td><td>{t.exit != null ? Number(t.exit).toFixed(2) : '—'}</td>
                      <td className={Number(t.pnl) >= 0 ? 'up' : 'down'}>{t.pnl != null ? (Number(t.pnl) >= 0 ? '+' : '') + Number(t.pnl).toFixed(2) : '—'}</td>
                      <td>{t.r != null ? Number(t.r).toFixed(2) : '—'}</td><td>{t.reason ?? '—'}</td>
                    </tr>
                  ))}
                  {!trades.length && <tr><td colSpan={7} className="dim" style={{ textAlign: 'center' }}>no closed trades yet</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        <BacktestLab say={say} />
        <WalkForwardLab say={say} />
        <p className="footnote">Paper first · backtest + walk-forward before real money · live keys: Read + Trade only.</p>
      </div>
      {toast && <div className="toast show">{toast}</div>}
    </div>
  );
}

function Metric({ l, v, cls = '' }: { l: string; v: string; cls?: string }) {
  return <div className="metric"><div className="m-l">{l}</div><div className={`m-v ${cls}`}>{v}</div></div>;
}

function NewBotForm({ onDone, say }: { onDone: () => void; say: (m: string) => void }) {
  const [f, setF] = useState({ name: '', exchange: 'bingx', market_type: 'swap', strategy: 'rsi_ema', symbols: 'BTC/USDT:USDT,ETH/USDT:USDT', mode: 'paper' });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const create = async () => {
    if (!f.name.trim()) { say('Name required'); return; }
    try {
      await api('/trade/bots', 'POST', { ...f, name: f.name.trim(), symbols: f.symbols.split(',').map(s => s.trim()).filter(Boolean) });
      say('Bot created'); onDone();
    } catch (e: any) { say(e.message); }
  };
  return (
    <div className="form">
      <div className="grid2">
        <label className="field"><span>Name</span><input value={f.name} onChange={set('name')} placeholder="main" /></label>
        <label className="field"><span>Exchange</span>
          <select value={f.exchange} onChange={set('exchange')}>{['bingx', 'binance', 'bybit', 'okx', 'gate', 'kucoin', 'mexc', 'synthetic'].map(o => <option key={o}>{o}</option>)}</select></label>
        <label className="field"><span>Market</span>
          <select value={f.market_type} onChange={set('market_type')}><option value="swap">futures (swap)</option><option value="spot">spot</option></select></label>
        <label className="field"><span>Strategy</span>
          <select value={f.strategy} onChange={set('strategy')}>{['rsi_ema', 'donchian_breakout', 'bollinger_meanrev'].map(o => <option key={o}>{o}</option>)}</select></label>
        <label className="field"><span>Symbols (comma)</span><input value={f.symbols} onChange={set('symbols')} /></label>
        <label className="field"><span>Mode</span>
          <select value={f.mode} onChange={set('mode')}><option value="paper">paper (simulated)</option><option value="live">live (real orders)</option></select></label>
      </div>
      <div className="foot-row">
        <button className="btn primary" onClick={create}>Create bot</button>
        <span className="hint">Paper mode trades live prices with virtual money — no keys needed.</span>
      </div>
    </div>
  );
}

function RecallBox({ bot }: { bot: string }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<any[] | null>(null);
  const go = async () => {
    if (!q.trim()) return;
    try { setRows(await api<any[]>(`/trade/bots/${bot}/recall?query=${encodeURIComponent(q)}&limit=5`)); }
    catch { setRows([]); }
  };
  return (
    <div className="recall">
      <div className="m-l" style={{ marginBottom: 6 }}>Semantic recall</div>
      <div className="recall-row">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="BTC breakout strong uptrend…" onKeyDown={e => e.key === 'Enter' && go()} />
        <button className="btn sm" onClick={go}>Recall</button>
      </div>
      {rows && (rows.length ? rows.map((r, i) => (
        <div key={i} className="recall-hit">
          <span>{r.final_action === 'long' ? '🟢' : r.final_action === 'short' ? '🔴' : '⚪'} <span className="mono">{r.symbol}</span> <span className="dim">{r.note}</span></span>
          <span className="mono">{(Number(r.similarity) * 100).toFixed(0)}%</span>
        </div>
      )) : <p className="dim" style={{ fontSize: 12, marginTop: 8 }}>nothing similar yet (needs embeddings)</p>)}
    </div>
  );
}

function BacktestLab({ say }: { say: (m: string) => void }) {
  const [f, setF] = useState({ strategy: 'rsi_ema', symbol: 'BTC/USDT:USDT', timeframe: '15m', exchange: 'bybit', candles: 1000 });
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<any | null>(null);
  const run = async () => {
    setBusy(true);
    try { const r = await api<any>('/trade/backtest', 'POST', { ...f, candles: Number(f.candles) }); setM(r.metrics); say(`backtest · ${r.metrics.numTrades} trades`); }
    catch (e: any) { say('backtest: ' + e.message); }
    setBusy(false);
  };
  return (
    <>
      <div className="eyebrow"><span className="k">Backtest lab</span><span className="rule" /><span className="mt">enter next open · atr stop · intrabar exits</span></div>
      <div className="lab">
        <div className="controls">
          <Sel l="Strategy" v={f.strategy} onC={v => setF({ ...f, strategy: v })} opts={['rsi_ema', 'donchian_breakout', 'bollinger_meanrev']} />
          <Inp l="Symbol" v={f.symbol} onC={v => setF({ ...f, symbol: v })} />
          <Sel l="Timeframe" v={f.timeframe} onC={v => setF({ ...f, timeframe: v })} opts={['5m', '15m', '1h', '4h']} />
          <Sel l="Exchange" v={f.exchange} onC={v => setF({ ...f, exchange: v })} opts={['bingx', 'binance', 'bybit', 'okx', 'synthetic']} />
          <Inp l="Candles" v={String(f.candles)} onC={v => setF({ ...f, candles: Number(v) || 1000 })} w={90} />
          <button className="btn primary" disabled={busy} onClick={run}>{busy ? 'Running…' : 'Run backtest'}</button>
        </div>
        {m && (
          <div className="metrics">
            <Metric l="Total return" v={(m.totalReturn * 100).toFixed(2) + '%'} cls={m.totalReturn >= 0 ? 'up' : 'down'} />
            <Metric l="Trades" v={String(m.numTrades)} />
            <Metric l="Win rate" v={(m.winRate * 100).toFixed(1) + '%'} />
            <Metric l="Max drawdown" v={(m.maxDrawdown * 100).toFixed(2) + '%'} cls="down" />
            <Metric l="Profit factor" v={m.profitFactor.toFixed(2)} />
            <Metric l="Sharpe" v={m.sharpe.toFixed(2)} />
            <Metric l="Avg win" v={fmt(m.avgWin)} cls="up" />
            <Metric l="Avg loss" v={fmt(m.avgLoss)} cls="down" />
          </div>
        )}
      </div>
    </>
  );
}

function WalkForwardLab({ say }: { say: (m: string) => void }) {
  const [f, setF] = useState({ strategy: 'donchian_breakout', symbol: 'BTC/USDT:USDT', timeframe: '15m', exchange: 'bybit', candles: 2000, grid: '{"channel":[10,20,30]}' });
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any | null>(null);
  const run = async () => {
    let grid: any;
    try { grid = JSON.parse(f.grid); } catch { say('Grid must be valid JSON'); return; }
    setBusy(true);
    try { const r = await api<any>('/trade/walkforward', 'POST', { ...f, candles: Number(f.candles), grid }); setRes(r); say(`walk-forward · ${r.aggregate.windows} windows`); }
    catch (e: any) { say('walk-forward: ' + e.message); }
    setBusy(false);
  };
  const a = res?.aggregate;
  return (
    <>
      <div className="eyebrow"><span className="k">Walk-forward</span><span className="rule" /><span className="mt">optimize in-sample · validate out-of-sample</span></div>
      <div className="lab">
        <div className="controls">
          <Sel l="Strategy" v={f.strategy} onC={v => setF({ ...f, strategy: v })} opts={['donchian_breakout', 'rsi_ema', 'bollinger_meanrev']} />
          <Inp l="Symbol" v={f.symbol} onC={v => setF({ ...f, symbol: v })} />
          <Sel l="Exchange" v={f.exchange} onC={v => setF({ ...f, exchange: v })} opts={['bingx', 'binance', 'bybit', 'okx', 'synthetic']} />
          <Inp l="Candles" v={String(f.candles)} onC={v => setF({ ...f, candles: Number(v) || 2000 })} w={90} />
          <Inp l="Param grid (JSON)" v={f.grid} onC={v => setF({ ...f, grid: v })} w={220} />
          <button className="btn primary" disabled={busy} onClick={run}>{busy ? 'Optimizing…' : 'Run walk-forward'}</button>
        </div>
        {a && (
          <>
            <div className="metrics">
              <Metric l="OOS return" v={(a.oos_total_return * 100).toFixed(2) + '%'} cls={a.oos_total_return >= 0 ? 'up' : 'down'} />
              <Metric l="Windows" v={String(a.windows)} />
              <Metric l="OOS trades" v={String(a.oos_trades)} />
              <Metric l="OOS win rate" v={(a.oos_win_rate * 100).toFixed(1) + '%'} />
              <Metric l="OOS max DD" v={(a.oos_max_drawdown * 100).toFixed(2) + '%'} cls="down" />
              <Metric l="Final" v={fmt(a.final_equity)} />
            </div>
            <div className="wf-windows">
              {res.windows.map((w: any) => (
                <div key={w.window} className="w">
                  <span className="mono">#{w.window} · {JSON.stringify(w.best_params)}</span>
                  <span className={w.oos_return >= 0 ? 'pos' : 'neg'}>{w.oos_return >= 0 ? '+' : ''}{(w.oos_return * 100).toFixed(2)}% · {w.oos_trades} trades</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Sel({ l, v, onC, opts }: { l: string; v: string; onC: (v: string) => void; opts: string[] }) {
  return <label className="field"><span>{l}</span><select value={v} onChange={e => onC(e.target.value)}>{opts.map(o => <option key={o}>{o}</option>)}</select></label>;
}
function Inp({ l, v, onC, w }: { l: string; v: string; onC: (v: string) => void; w?: number }) {
  return <label className="field"><span>{l}</span><input value={v} onChange={e => onC(e.target.value)} style={w ? { width: w } : undefined} /></label>;
}

/* ── full original stylesheet (brass on slate) ──────────────── */
function Style() {
  return (
    <style>{`
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@400;500;600&display=swap');
.st-root{--void:#0C1017;--panel:#131A23;--panel2:#0F151D;--line:#212B38;--ink:#DCE4EC;--muted:#6B7A8D;--dim:#465364;--brass:#E8B04B;--brass-dim:#8a6a2c;--up:#57C88A;--down:#E8695C;--r:10px;
  background:var(--void);color:var(--ink);font-family:Inter,system-ui,sans-serif;font-size:14px;line-height:1.5;min-height:100vh;
  background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);
  background-size:44px 44px;background-position:center;background-attachment:fixed;position:relative}
.st-root::before{content:"";position:fixed;inset:0;background:radial-gradient(120% 90% at 50% -10%,transparent 40%,var(--void) 100%);pointer-events:none}
.st-root .wrap{position:relative;max-width:1200px;margin:0 auto;padding:22px 20px 60px}
.st-root .led{width:11px;height:11px;border-radius:50%;background:var(--brass);flex:none;box-shadow:0 0 0 3px rgba(232,176,75,.14),0 0 14px 2px rgba(232,176,75,.55);animation:stpulse 2.4s ease-in-out infinite}
@keyframes stpulse{50%{opacity:.45;box-shadow:0 0 0 3px rgba(232,176,75,.06),0 0 6px 1px rgba(232,176,75,.3)}}
.st-root .tape{display:flex;align-items:center;justify-content:space-between;gap:20px;border:1px solid var(--line);background:linear-gradient(180deg,var(--panel),var(--panel2));border-radius:var(--r);padding:15px 20px;position:relative;overflow:hidden}
.st-root .tape::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;background:linear-gradient(90deg,transparent,var(--brass),transparent);opacity:.5}
.st-root .header-left{display:flex;align-items:center;gap:14px;min-width:0}
.st-root .back-home{font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.04em;color:var(--brass);text-decoration:none;border:1px solid var(--brass-dim);border-radius:8px;padding:7px 10px;background:rgba(232,176,75,.06);white-space:nowrap;transition:.14s}
.st-root .back-home:hover{color:#fff;border-color:var(--brass);background:rgba(232,176,75,.12)}
.st-root .brand{display:flex;align-items:center;gap:12px}
.st-root .brand h1{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:18px;letter-spacing:.14em;margin:0}
.st-root .brand small{display:block;color:var(--muted);font-size:10px;letter-spacing:.34em;text-transform:uppercase;margin-top:1px}
.st-root .right{text-align:right}
.st-root .readout .lbl{color:var(--muted);font-size:10px;letter-spacing:.28em;text-transform:uppercase}
.st-root .readout .val{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:26px;color:var(--brass);line-height:1.1}
.st-root .meta,.st-root .mt{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--dim)}
.st-root .eyebrow{display:flex;align-items:baseline;gap:12px;margin:26px 2px 12px}
.st-root .eyebrow .k{font-family:'Space Grotesk',sans-serif;font-size:12px;letter-spacing:.3em;text-transform:uppercase}
.st-root .eyebrow .rule{flex:1;height:1px;background:var(--line)}
.st-root .toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.st-root .btn{font-family:'Space Grotesk',sans-serif;font-size:12px;letter-spacing:.06em;background:var(--panel);color:var(--ink);border:1px solid var(--line);padding:9px 15px;border-radius:8px;cursor:pointer;transition:.14s;text-transform:uppercase;display:inline-flex;align-items:center;gap:6px}
.st-root .btn:hover{border-color:var(--brass-dim);color:#fff}
.st-root .btn.primary{background:var(--brass);color:#20170a;border-color:var(--brass);font-weight:700}
.st-root .btn.primary:hover{filter:brightness(1.08)}
.st-root .btn.ghost{background:transparent}.st-root .btn.sm{padding:5px 10px;font-size:11px}
.st-root .btn.danger:hover{border-color:var(--down);color:var(--down)}
.st-root .btn:disabled{opacity:.4;cursor:not-allowed}
.st-root .form{border:1px solid var(--brass-dim);background:var(--panel);border-radius:var(--r);padding:16px;margin-bottom:14px}
.st-root .grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.st-root .field{display:flex;flex-direction:column;gap:5px}
.st-root .field span{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.st-root input,.st-root select{font-family:'JetBrains Mono',monospace;font-size:13px;background:var(--panel2);color:var(--ink);border:1px solid var(--line);border-radius:7px;padding:8px 10px}
.st-root input:focus,.st-root select:focus{outline:2px solid var(--brass);outline-offset:1px;border-color:var(--brass-dim)}
.st-root .foot-row{display:flex;gap:10px;align-items:center;margin-top:14px}
.st-root .hint{font-size:11px;color:var(--dim)}
.st-root .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}
.st-root .card{border:1px solid var(--line);background:linear-gradient(180deg,var(--panel),var(--panel2));border-radius:var(--r);padding:16px;transition:.16s;cursor:pointer}
.st-root .card.live{border-color:var(--brass-dim);box-shadow:0 0 0 1px rgba(232,176,75,.12),0 10px 30px -18px rgba(232,176,75,.3)}
.st-root .card.is-sel{outline:1px solid var(--brass-dim)}
.st-root .card .top{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.st-root .name{display:flex;align-items:center;gap:9px}
.st-root .name .dot{width:8px;height:8px;border-radius:50%;background:var(--dim)}
.st-root .card.live .name .dot{background:var(--brass);box-shadow:0 0 8px var(--brass)}
.st-root .name b{font-family:'Space Grotesk',sans-serif;font-size:15px;letter-spacing:.04em}
.st-root .tags{display:flex;gap:6px}
.st-root .tag{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--muted);border:1px solid var(--line);padding:2px 7px;border-radius:5px}
.st-root .tag.live-badge{color:var(--down);border-color:var(--down)}
.st-root .eq{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:24px}
.st-root .spark{width:100%;height:38px;display:block;margin:8px 0 12px}
.st-root .rows{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;font-size:12px;margin-bottom:14px}
.st-root .row{display:flex;justify-content:space-between;border-bottom:1px dotted var(--line);padding-bottom:3px}
.st-root .row span{color:var(--muted)}.st-root .row b{font-family:'JetBrains Mono',monospace;font-weight:500}
.st-root .actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.st-root .empty{border:1px dashed var(--line);border-radius:var(--r);padding:30px;text-align:center;color:var(--dim);font-family:'JetBrains Mono',monospace;font-size:13px}
.st-root .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:4px}
.st-root .metric{border:1px solid var(--line);background:var(--panel2);border-radius:8px;padding:9px 11px}
.st-root .m-l{font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.st-root .m-v{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:17px;margin-top:2px}
.st-root .cols{display:grid;grid-template-columns:1fr 340px;gap:14px}
.st-root .feed{border:1px solid var(--line);background:var(--panel2);border-radius:var(--r);max-height:280px;overflow:auto;padding:6px}
.st-root .ev{display:flex;align-items:center;gap:10px;padding:8px 10px;border-bottom:1px solid var(--line);font-size:13px}
.st-root .ev .txt{flex:1}.st-root .ev .t{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--dim)}
.st-root .feed-empty{color:var(--dim);font-family:'JetBrains Mono',monospace;font-size:12px;text-align:center;padding:30px}
.st-root .tgcard{border:1px solid var(--line);background:var(--panel);border-radius:var(--r);padding:16px}
.st-root .agent-row{display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px dotted var(--line)}
.st-root .agree{font-family:'JetBrains Mono',monospace;color:var(--brass)}
.st-root .recall{margin-top:14px}
.st-root .recall-row{display:flex;gap:8px}.st-root .recall-row input{flex:1}
.st-root .recall-hit{display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:6px 0;border-bottom:1px dotted var(--line)}
.st-root .trades{max-height:230px;overflow:auto;border:1px solid var(--line);border-radius:8px}
.st-root table{width:100%;border-collapse:collapse;font-family:'JetBrains Mono',monospace;font-size:12px}
.st-root th,.st-root td{text-align:right;padding:6px 12px;border-bottom:1px solid var(--line)}
.st-root th{position:sticky;top:0;background:var(--panel);color:var(--muted);font-weight:500;font-size:10px;letter-spacing:.1em;text-transform:uppercase}
.st-root th:first-child,.st-root td:first-child{text-align:left}
.st-root .lab{border:1px solid var(--line);background:var(--panel);border-radius:var(--r);padding:18px}
.st-root .controls{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:16px}
.st-root .wf-windows{margin-top:12px;font-family:'JetBrains Mono',monospace;font-size:12px}
.st-root .wf-windows .w{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dotted var(--line)}
.st-root .wf-windows .pos{color:var(--up)}.st-root .wf-windows .neg{color:var(--down)}
.st-root .mono{font-family:'JetBrains Mono',monospace}
.st-root .up{color:var(--up)}.st-root .down{color:var(--down)}.st-root .dim{color:var(--dim)}
.st-root .footnote{color:var(--dim);font-size:11px;font-family:'JetBrains Mono',monospace;margin-top:26px;text-align:center}
.st-root .toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:var(--panel);border:1px solid var(--brass-dim);color:var(--ink);padding:10px 16px;border-radius:8px;font-size:13px;z-index:40}
@media (max-width:820px){.st-root .cols{grid-template-columns:1fr}.st-root .tape{flex-wrap:wrap;gap:12px}.st-root .header-left{flex-wrap:wrap}}
`}</style>
  );
}
