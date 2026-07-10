"use client";
// SOUL-TRADE — control room (apps/web/app/soul-trade/page.tsx)
// Full port of the original brass-on-slate "instrument room" design: grid background,
// pulsing brass LED, tape header, bot cards with canvas sparklines, decision-memory feed,
// trades table, backtest + walk-forward labs, semantic recall, agent contribution.
import { useEffect, useState, useCallback, useRef } from "react";
// Soul-Trade dùng layout riêng (.st-root), không qua <Shell> → phải tự mount Tutorial + nút "?".
import { Tutorial } from "../../components/Tutorial";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const BASE = `${API}/api/v1/soul-trade`; // host mounts the module here (manifest.json#routes)
// Auth chuẩn host: JWT phiên đăng nhập (citadel.session) — KHÔNG dùng demo token cứng.
function sessionJwt(): string {
  if (typeof window === "undefined") return "";
  try {
    return (
      JSON.parse(localStorage.getItem("citadel.session") ?? "{}")?.jwt ?? ""
    );
  } catch {
    return "";
  }
}

type Bot = {
  id: string;
  name: string;
  exchange: string;
  strategy: string;
  mode: string;
  status: string;
  equity: number;
  symbols: string[];
  llm?: any;
  has_keys?: boolean;
};

type Lang = "vi" | "en";
type DictKey = keyof typeof T.vi;
const RECOMMENDED_PAIRS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "DOGE/USDT", "ADA/USDT", "AVAX/USDT", "LINK/USDT", "TON/USDT"];
const T = {
  vi: {
    backHome: "← Về Super Citadel",
    controlRoom: "phòng điều khiển",
    totalEquity: "tổng vốn",
    botsMeta: "bot giao dịch",
    running: "đang chạy",
    bots: "Bot giao dịch",
    isolated: "tách biệt · RLS theo tổ chức · vòng tự giao dịch",
    newBot: "+ Tạo bot",
    back: "← Quay lại",
    noBots:
      "Chưa có bot nào — bấm + Tạo bot (chế độ paper không cần key) hoặc nhờ Tiểu Tâm: “tạo bot paper trên bybit”.",
    strategy: "Chiến lược",
    status: "Trạng thái",
    symbols: "Cặp coin",
    agents: "Tác nhân",
    start: "Chạy",
    stop: "Dừng",
    evaluate: "Đánh giá",
    delete: "Xoá",
    performance: "hiệu suất",
    acrossTrades: "trên toàn bộ lệnh",
    totalPnl: "Tổng PnL",
    trades: "Lệnh",
    winRate: "Tỷ lệ thắng",
    profitFactor: "Hệ số lợi nhuận",
    avgR: "R trung bình",
    turnsLSF: "Lượt L/S/F",
    loading: "đang tải…",
    decisionMemory: "Bộ nhớ quyết định",
    decisionSub: "mỗi lượt · chiến lược + AI + tác nhân",
    noDecisions: "chưa có quyết định — bấm Đánh giá hoặc chạy bot",
    noAgentVotes: "Chưa có phiếu tác nhân — chạy Đánh giá kèm tác nhân.",
    recentTrades: "Lệnh gần đây",
    symbol: "Cặp coin",
    side: "Phía",
    entry: "Vào lệnh",
    exit: "Thoát",
    pnl: "PnL",
    r: "R",
    exitBy: "Thoát bởi",
    noClosedTrades: "chưa có lệnh đã đóng",
    name: "Tên",
    exchange: "Sàn",
    market: "Thị trường",
    mode: "Chế độ",
    symbolsComma: "Cặp coin (phẩy)",
    createBot: "Tạo bot",
    paperMode: "paper (mô phỏng)",
    liveMode: "live (lệnh thật)",
    paperHint:
      "Chế độ paper giao dịch giá thật bằng tiền ảo — không cần API key.",
    semanticRecall: "Hồi tưởng ngữ nghĩa",
    recall: "Tìm",
    recallPlaceholder: "BTC breakout xu hướng tăng mạnh…",
    nothingSimilar: "chưa có gì tương tự (cần embeddings)",
    backtestLab: "Phòng backtest",
    backtestSub: "vào lệnh ở nến kế · stop ATR · thoát trong nến",
    timeframe: "Khung nến",
    candles: "Số nến",
    runBacktest: "Chạy backtest",
    runningEllipsis: "Đang chạy…",
    totalReturn: "Tổng lợi nhuận",
    maxDrawdown: "Sụt giảm tối đa",
    sharpe: "Sharpe",
    avgWin: "Thắng TB",
    avgLoss: "Thua TB",
    walkForward: "Kiểm chứng walk-forward",
    walkSub: "tối ưu in-sample · kiểm chứng out-of-sample",
    paramGrid: "Lưới tham số (JSON)",
    runWalk: "Chạy walk-forward",
    optimizing: "Đang tối ưu…",
    oosReturn: "Lợi nhuận OOS",
    windows: "Cửa sổ",
    oosTrades: "Lệnh OOS",
    oosWinRate: "Tỷ lệ thắng OOS",
    oosMaxDD: "Max DD OOS",
    final: "Cuối kỳ",
    footnote:
      "Paper trước · backtest + walk-forward rồi mới tiền thật · key live: chỉ Read + Trade.",
    nameRequired: "Vui lòng nhập tên bot.",
    botCreated: "Đã tạo bot",
    deleteConfirm: 'Xoá bot "{name}"?',
    deleted: "{name} đã xoá",
    started: "{name} đã chạy",
    stopped: "{name} đã dừng",
    turn: "lượt",
    backtestMsg: "backtest",
    walkMsg: "walk-forward",
    gridJson: "Lưới tham số phải là JSON hợp lệ",
    apiError: "Lỗi: {msg}",
    recommendedPairs: "Cặp đề xuất",
    quickRun: "click là chạy · shadow + ultra + ARM",
  },
  en: {
    backHome: "← Back to Super Citadel",
    controlRoom: "control room",
    totalEquity: "total equity",
    botsMeta: "bot",
    running: "running",
    bots: "Bots",
    isolated: "isolated · per-org RLS · auto-trade loop",
    newBot: "+ New bot",
    back: "← Back",
    noBots:
      "No bots yet. Hit + New bot (paper mode needs no keys) — or ask Tiểu Tâm: “tạo bot paper trên bybit”.",
    strategy: "Strategy",
    status: "Status",
    symbols: "Symbols",
    agents: "Agents",
    start: "Start",
    stop: "Stop",
    evaluate: "Evaluate",
    delete: "Delete",
    performance: "performance",
    acrossTrades: "across total trades",
    totalPnl: "Total PnL",
    trades: "Trades",
    winRate: "Win rate",
    profitFactor: "Profit factor",
    avgR: "Avg R",
    turnsLSF: "Turns L/S/F",
    loading: "loading…",
    decisionMemory: "Decision memory",
    decisionSub: "per-turn · strategy + AI + agents",
    noDecisions: "no decisions yet — press Evaluate or start the bot",
    noAgentVotes: "No agent votes yet — run Evaluate with agents.",
    recentTrades: "Recent trades",
    symbol: "Symbol",
    side: "Side",
    entry: "Entry",
    exit: "Exit",
    pnl: "PnL",
    r: "R",
    exitBy: "Exit by",
    noClosedTrades: "no closed trades yet",
    name: "Name",
    exchange: "Exchange",
    market: "Market",
    mode: "Mode",
    symbolsComma: "Symbols (comma)",
    createBot: "Create bot",
    paperMode: "paper (simulated)",
    liveMode: "live (real orders)",
    paperHint:
      "Paper mode trades live prices with virtual money — no keys needed.",
    semanticRecall: "Semantic recall",
    recall: "Recall",
    recallPlaceholder: "BTC breakout strong uptrend…",
    nothingSimilar: "nothing similar yet (needs embeddings)",
    backtestLab: "Backtest lab",
    backtestSub: "enter next open · atr stop · intrabar exits",
    timeframe: "Timeframe",
    candles: "Candles",
    runBacktest: "Run backtest",
    runningEllipsis: "Running…",
    totalReturn: "Total return",
    maxDrawdown: "Max drawdown",
    sharpe: "Sharpe",
    avgWin: "Avg win",
    avgLoss: "Avg loss",
    walkForward: "Walk-forward",
    walkSub: "optimize in-sample · validate out-of-sample",
    paramGrid: "Param grid (JSON)",
    runWalk: "Run walk-forward",
    optimizing: "Optimizing…",
    oosReturn: "OOS return",
    windows: "Windows",
    oosTrades: "OOS trades",
    oosWinRate: "OOS win rate",
    oosMaxDD: "OOS max DD",
    final: "Final",
    footnote:
      "Paper first · backtest + walk-forward before real money · live keys: Read + Trade only.",
    nameRequired: "Name required.",
    botCreated: "Bot created",
    deleteConfirm: 'Delete bot "{name}"?',
    deleted: "{name} deleted",
    started: "{name} started",
    stopped: "{name} stopped",
    turn: "turn",
    backtestMsg: "backtest",
    walkMsg: "walk-forward",
    gridJson: "Grid must be valid JSON",
    apiError: "Error: {msg}",
    recommendedPairs: "Recommended pairs",
    quickRun: "click to run · shadow + ultra + ARM",
  },
} as const;
const tr = (
  lang: Lang,
  key: DictKey,
  vars?: Record<string, string | number>,
) => {
  let out = T[lang][key] as string;
  if (vars)
    for (const [k, v] of Object.entries(vars))
      out = out.replaceAll(`{${k}}`, String(v));
  return out;
};

type Analytics = {
  total_trades: number;
  wins: number;
  win_rate: number;
  profit_factor: number;
  total_pnl: number;
  avg_r: number;
  turns_by_action: Record<string, number>;
};

async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const jwt = sessionJwt();
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok)
    throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  return r.json();
}
const fmt = (n?: number | string | null) =>
  n == null
    ? "—"
    : "$" +
      Number(n).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

/* ── canvas painters (ported 1:1 from the original) ─────────── */
function paintSpark(cv: HTMLCanvasElement, data: number[]) {
  const dpr = window.devicePixelRatio || 1,
    w = cv.clientWidth,
    h = cv.clientHeight;
  cv.width = w * dpr;
  cv.height = h * dpr;
  const c = cv.getContext("2d")!;
  c.scale(dpr, dpr);
  c.clearRect(0, 0, w, h);
  if (data.length < 2) return;
  const mn = Math.min(...data),
    mx = Math.max(...data),
    rg = mx - mn || 1;
  const x = (i: number) => (i / (data.length - 1)) * w,
    y = (v: number) => h - 3 - ((v - mn) / rg) * (h - 6);
  const up = data[data.length - 1] >= data[0];
  c.beginPath();
  data.forEach((v, i) => (i ? c.lineTo(x(i), y(v)) : c.moveTo(x(i), y(v))));
  c.lineTo(w, h);
  c.lineTo(0, h);
  c.closePath();
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, up ? "rgba(87,200,138,.22)" : "rgba(232,105,92,.22)");
  g.addColorStop(1, "transparent");
  c.fillStyle = g;
  c.fill();
  c.beginPath();
  data.forEach((v, i) => (i ? c.lineTo(x(i), y(v)) : c.moveTo(x(i), y(v))));
  c.strokeStyle = up ? "#57C88A" : "#E8695C";
  c.lineWidth = 1.5;
  c.stroke();
}
function Spark({ data }: { data: number[] }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (ref.current) paintSpark(ref.current, data);
  }, [data]);
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
  const [toast, setToast] = useState("");
  const [lang, setLang] = useState<Lang>("vi");
  const [view, setView] = useState<"control" | "automato">("control");
  const [keysBot, setKeysBot] = useState<Bot | null>(null); // modal gắn tài khoản sàn thật
  const t = useCallback(
    (key: DictKey, vars?: Record<string, string | number>) =>
      tr(lang, key, vars),
    [lang],
  );
  const eqHist = useRef<Record<string, number[]>>({});
  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2400);
  };
  useEffect(() => {
    try {
      const saved = localStorage.getItem("st.lang") as Lang | null;
      if (saved === "en" || saved === "vi") setLang(saved);
    } catch {}
  }, []);
  const switchLang = (next: Lang) => {
    setLang(next);
    try {
      localStorage.setItem("st.lang", next);
    } catch {}
  };

  const refresh = useCallback(async () => {
    try {
      const d = await api<Bot[] | { bots: Bot[] }>("/trade/bots");
      const list: Bot[] = Array.isArray(d) ? d : ((d as any).bots ?? []);
      for (const b of list) {
        const h = (eqHist.current[b.name] = eqHist.current[b.name] ?? []);
        if (b.equity != null) {
          h.push(Number(b.equity));
          if (h.length > 40) h.shift();
        }
      }
      setBots(list);
      setSel((s) => (s && list.some((b) => b.name === s) ? s : null));
    } catch (e: any) {
      say(t("apiError", { msg: e.message }));
    }
  }, [t]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);
  useEffect(() => {
    if (!sel) return;
    api<Analytics>(`/trade/bots/${sel}/analytics`)
      .then(setAn)
      .catch(() => {});
    api<any[]>(`/trade/bots/${sel}/memory?limit=14`)
      .then(setMem)
      .catch(() => {});
    api<any[]>(`/trade/bots/${sel}/trades?limit=12`)
      .then(setTrades)
      .catch(() => {});
    api<any[]>(`/trade/bots/${sel}/agents`)
      .then(setContrib)
      .catch(() => {});
  }, [sel, bots]);

  const totalEq = bots.reduce((s, b) => s + Number(b.equity || 0), 0);
  const running = bots.filter((b) => b.status === "running").length;

  const act = async (name: string, verb: "start" | "stop") => {
    // optimistic: đổi trạng thái nút NGAY, không chờ server + refresh
    const nextStatus = verb === "start" ? "running" : "idle";
    setBots((prev) => prev.map((b) => (b.name === name ? { ...b, status: nextStatus } : b)));
    say(t(verb === "start" ? "started" : "stopped", { name }));
    try {
      await api(`/trade/bots/${name}/${verb}`, "POST");
    } catch (e: any) {
      say(t("apiError", { msg: e.message }));
      // rollback nếu lỗi
      setBots((prev) => prev.map((b) => (b.name === name ? { ...b, status: verb === "start" ? "idle" : "running" } : b)));
    } finally {
      refresh();
    }
  };
  const del = async (name: string) => {
    if (!window.confirm(t("deleteConfirm", { name }))) return;
    try {
      await api(`/trade/bots/${name}`, "DELETE");
      delete eqHist.current[name];
      setSel(null);
      say(t("deleted", { name }));
      refresh();
    } catch (e: any) {
      say(t("apiError", { msg: e.message }));
    }
  };
  const evalTurn = async (name: string) => {
    try {
      const r = await api<any>(`/trade/bots/${name}/evaluate`, "POST", {
        use_agents: true,
      });
      say(`${t("turn")}: ${r.finalAction} · ${r.note}`);
      refresh();
    } catch (e: any) {
      say(t("apiError", { msg: e.message }));
    }
  };

  return (
    <div className="st-root">
      <Style />
      <Tutorial />
      <div className="wrap">
        <header className="tape">
          <div className="header-left">
            <a className="back-home" href="/home" aria-label={t("backHome")}>
              {t("backHome")}
            </a>
            <button
              className="back-home"
              title="Hướng dẫn sử dụng trang này"
              aria-label="Hướng dẫn sử dụng"
              onClick={() => window.dispatchEvent(new Event("citadel:tutorial-start"))}
            >
              ? Hướng dẫn
            </button>
            <div className="brand">
              <span className="led" />
              <div>
                <h1>SOUL-TRADE</h1>
                <small>{t("controlRoom")}</small>
              </div>
            </div>
          </div>
          <div className="right">
            <div className="lang-toggle">
              <button
                className={`lang-btn ${lang === "vi" ? "on" : ""}`}
                onClick={() => switchLang("vi")}
              >
                VI
              </button>
              <button
                className={`lang-btn ${lang === "en" ? "on" : ""}`}
                onClick={() => switchLang("en")}
              >
                EN
              </button>
            </div>
            <div className="readout">
              <div className="lbl">{t("totalEquity")}</div>
              <div className="val">{fmt(totalEq)}</div>
            </div>
            <div className="meta">
              {bots.length} {t("botsMeta")} · {running} {t("running")}
            </div>
          </div>
        </header>

        <div className="menu">
          <button
            className={`menu-item ${view === "control" ? "on" : ""}`}
            onClick={() => setView("control")}
          >
            Control Room
          </button>
          <button
            className={`menu-item ${view === "automato" ? "on" : ""}`}
            onClick={() => setView("automato")}
          >
            AUTOMATO
          </button>
        </div>
        {view === "automato" && (
          <AutomatoPanel bots={bots} sel={sel} setSel={setSel} say={say} />
        )}
        {view === "control" && (
          <>
            <div className="eyebrow">
              <span className="k">{t("bots")}</span>
              <span className="rule" />
              <span className="mt">{t("isolated")}</span>
            </div>
            <div className="toolbar">
              <button
                className="btn primary"
                onClick={() => setShowForm((v) => !v)}
              >
                {t("newBot")}
              </button>
            </div>
            {showForm && (
              <NewBotForm
                onDone={() => {
                  setShowForm(false);
                  refresh();
                }}
                onBack={() => setShowForm(false)}
                say={say}
                t={t}
              />
            )}

            <div className="grid">
              {bots.map((b) => (
                <div
                  key={b.name}
                  className={`card ${b.status === "running" ? "live" : ""} ${sel === b.name ? "is-sel" : ""}`}
                  onClick={() => setSel(b.name)}
                >
                  <div className="top">
                    <div className="name">
                      <span className="dot" />
                      <b>{b.name}</b>
                    </div>
                    <div className="tags">
                      {b.mode === "live" ? (
                        <span className="tag live-badge">LIVE</span>
                      ) : (
                        <span className="tag">{b.mode}</span>
                      )}
                      <span className="tag">{b.exchange}</span>
                    </div>
                  </div>
                  <div className="eq">{fmt(b.equity)}</div>
                  <Spark data={eqHist.current[b.name] ?? []} />
                  <div className="rows">
                    <div className="row">
                      <span>{t("strategy")}</span>
                      <b>{b.strategy}</b>
                    </div>
                    <div className="row">
                      <span>{t("status")}</span>
                      <b>{b.status}</b>
                    </div>
                    <div className="row">
                      <span>{t("symbols")}</span>
                      <b>{b.symbols?.length ?? 0}</b>
                    </div>
                    <div className="row">
                      <span>{t("agents")}</span>
                      <b>
                        {(b.llm?.agents ?? []).filter((a: any) => a.enabled)
                          .length || "—"}
                      </b>
                    </div>
                  </div>
                  <div className="actions" onClick={(e) => e.stopPropagation()}>
                    {b.status === "running" ? (
                      <button
                        className="btn sm ghost"
                        onClick={() => act(b.name, "stop")}
                      >
                        {t("stop")}
                      </button>
                    ) : (
                      <button
                        className="btn sm primary"
                        onClick={() => act(b.name, "start")}
                      >
                        {t("start")}
                      </button>
                    )}
                    <button
                      className="btn sm ghost"
                      onClick={() => evalTurn(b.name)}
                    >
                      {t("evaluate")}
                    </button>
                    <button
                      className={`btn sm ${b.has_keys ? "primary" : "ghost"}`}
                      title={b.has_keys ? "Đã gắn tài khoản sàn thật — bấm để xem/đổi" : "Gắn API key sàn thật (BingX…)"}
                      onClick={() => setKeysBot(b)}
                    >
                      {b.has_keys ? "🔑 Đã nối sàn" : "🔌 Gắn sàn thật"}
                    </button>
                    <button
                      className="btn sm ghost danger"
                      onClick={() => del(b.name)}
                    >
                      {t("delete")}
                    </button>
                  </div>
                </div>
              ))}
              {!bots.length && <div className="empty">{t("noBots")}</div>}
            </div>
            {keysBot && <ExchangeKeysModal bot={keysBot} onClose={(changed) => { setKeysBot(null); if (changed) refresh(); }} say={say} />}

            {sel && (
              <>
                <div className="section-back">
                  <button className="btn ghost" onClick={() => setSel(null)}>
                    {t("back")}
                  </button>
                </div>
                <div className="eyebrow">
                  <span className="k">
                    {sel} · {t("performance")}
                  </span>
                  <span className="rule" />
                  <span className="mt">{t("acrossTrades")}</span>
                </div>
                <div className="metrics">
                  {an ? (
                    <>
                      <Metric
                        l={t("totalPnl")}
                        v={fmt(an.total_pnl)}
                        cls={an.total_pnl >= 0 ? "up" : "down"}
                      />
                      <Metric l={t("trades")} v={String(an.total_trades)} />
                      <Metric
                        l={t("winRate")}
                        v={(an.win_rate * 100).toFixed(1) + "%"}
                      />
                      <Metric
                        l={t("profitFactor")}
                        v={an.profit_factor.toFixed(2)}
                      />
                      <Metric l={t("avgR")} v={an.avg_r.toFixed(2)} />
                      <Metric
                        l={t("turnsLSF")}
                        v={`${an.turns_by_action.long ?? 0}/${an.turns_by_action.short ?? 0}/${an.turns_by_action.flat ?? 0}`}
                      />
                    </>
                  ) : (
                    <span className="dim">{t("loading")}</span>
                  )}
                </div>

                <div className="cols">
                  <div>
                    <div className="eyebrow">
                      <span className="k">{t("decisionMemory")}</span>
                      <span className="rule" />
                      <span className="mt">{t("decisionSub")}</span>
                    </div>
                    <div className="feed">
                      {mem.length ? (
                        mem.map((d, i) => (
                          <div key={i} className="ev">
                            <span className="ico">
                              {d.final_action === "long"
                                ? "🟢"
                                : d.final_action === "short"
                                  ? "🔴"
                                  : "⚪"}
                            </span>
                            <span className="txt">
                              <b>{String(d.final_action).toUpperCase()}</b>{" "}
                              <span className="mono">{d.symbol}</span> · ×
                              {Number(d.size_mult).toFixed(2)}{" "}
                              <span className="dim">{d.note}</span>
                            </span>
                            <span className="t">
                              {new Date(d.created_at).toLocaleTimeString()}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="feed-empty">{t("noDecisions")}</div>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="eyebrow">
                      <span className="k">{t("agents")}</span>
                      <span className="rule" />
                    </div>
                    <div className="tgcard">
                      {contrib.length ? (
                        contrib.map((c) => (
                          <div key={c.name} className="agent-row">
                            <span className="mono">{c.name}</span>
                            <span className="agree">
                              {(c.agreement * 100).toFixed(0)}%{" "}
                              <span className="dim">({c.votes})</span>
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="dim" style={{ fontSize: 12 }}>
                          {t("noAgentVotes")}
                        </p>
                      )}
                      <RecallBox bot={sel} t={t} />
                    </div>
                  </div>
                </div>

                <div className="eyebrow">
                  <span className="k">{t("recentTrades")}</span>
                  <span className="rule" />
                </div>
                <div className="trades">
                  <table>
                    <thead>
                      <tr>
                        <th>{t("symbol")}</th>
                        <th>{t("side")}</th>
                        <th>{t("entry")}</th>
                        <th>{t("exit")}</th>
                        <th>{t("pnl")}</th>
                        <th>{t("r")}</th>
                        <th>{t("exitBy")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map((t, i) => (
                        <tr key={i}>
                          <td className="mono">{t.symbol}</td>
                          <td>{t.direction}</td>
                          <td>{Number(t.entry).toFixed(2)}</td>
                          <td>
                            {t.exit != null ? Number(t.exit).toFixed(2) : "—"}
                          </td>
                          <td className={Number(t.pnl) >= 0 ? "up" : "down"}>
                            {t.pnl != null
                              ? (Number(t.pnl) >= 0 ? "+" : "") +
                                Number(t.pnl).toFixed(2)
                              : "—"}
                          </td>
                          <td>{t.r != null ? Number(t.r).toFixed(2) : "—"}</td>
                          <td>{t.reason ?? "—"}</td>
                        </tr>
                      ))}
                      {!trades.length && (
                        <tr>
                          <td
                            colSpan={7}
                            className="dim"
                            style={{ textAlign: "center" }}
                          >
                            {t("noClosedTrades")}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <BacktestLab say={say} t={t} />
            <WalkForwardLab say={say} t={t} />
            <p className="footnote">{t("footnote")}</p>
          </>
        )}
      </div>
      {toast && <div className="toast show">{toast}</div>}
    </div>
  );
}

function AutomatoPanel({
  bots,
  sel,
  setSel,
  say,
}: {
  bots: Bot[];
  sel: string | null;
  setSel: (s: string | null) => void;
  say: (m: string) => void;
}) {
  const bot = sel ?? bots[0]?.name ?? null;
  useEffect(() => {
    if (!sel && bot) setSel(bot);
  }, [sel, bot, setSel]);
  const [tab, setTab] = useState<"auto" | "analysis" | "shield" | "journal">(
    "auto",
  );
  const [cfg, setCfg] = useState<any>(null);
  const [log, setLog] = useState<any[]>([]);
  const [ana, setAna] = useState<any>(null);
  const [pos, setPos] = useState<any>(null);
  const [ohlcv, setOhlcv] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  // Trang 2 cặp đề xuất: top movers biến động 24h dữ dội (ticker thật, backend cache 30s)
  const [pairPage, setPairPage] = useState<1 | 2>(1);
  const [movers, setMovers] = useState<any[] | null>(null);
  useEffect(() => {
    if (pairPage !== 2) return;
    let dead = false;
    const pull = () => api<any>(`/trade/market/movers?limit=12`).then((r) => { if (!dead) setMovers(r.movers ?? []); }).catch(() => { if (!dead) setMovers([]); });
    pull();
    const i = setInterval(pull, 30000); // khớp TTL cache backend
    return () => { dead = true; clearInterval(i); };
  }, [pairPage]);
  const patchPending = useRef(false);
  const busyRef = useRef(false); // guard: không cho poll ghi đè state khi đang ARM/DISARM
  const loadSeq = useRef(0); // token chống stale: response cũ về muộn bị bỏ, không flicker
  const load = useCallback(async () => {
    if (!bot) return;
    const seq = ++loadSeq.current;
    try {
      // Song song 4 call (trước đây tuần tự → chậm + update so le giật mắt)
      const [st, lg, an, p] = await Promise.all([
        api<any>(`/trade/bots/${bot}/automato`),
        api<any[]>(`/trade/bots/${bot}/automato/log?limit=80`),
        api<any>(`/trade/bots/${bot}/automato/analytics`),
        api<any>(`/trade/bots/${bot}/automato/position`),
      ]);
      if (seq !== loadSeq.current) return; // có hành động mới hơn → bỏ response cũ
      // Đừng ghi đè config/phase khi đang kéo đòn bẩy hoặc đang ARM (optimistic chưa xong).
      if (!patchPending.current && !busyRef.current) setCfg(st.config ?? st);
      setLog(lg);
      setAna(an);
      if (!busyRef.current) setPos(p);
      const symQ = encodeURIComponent(p?.openPosition?.symbol ?? p?.symbol ?? "");
      const oh = await api<any>(`/trade/bots/${bot}/automato/ohlcv?tf=1m&limit=80${symQ ? `&symbol=${symQ}` : ""}`);
      if (seq === loadSeq.current) setOhlcv(oh);
    } catch (e: any) {
      say(`AUTOMATO: ${e.message}`);
    }
  }, [bot, say]);
  useEffect(() => {
    load();
    const i = setInterval(load, 2500);
    return () => clearInterval(i);
  }, [load]);
  if (!bot)
    return (
      <div className="empty">Chưa có bot — tạo bot trước khi ARM AUTOMATO.</div>
    );

  // ── Optimistic + debounced config patch ─────────────────────
  // Trước đây mỗi lần kéo slider đòn bẩy = 1 POST configure + load() (5 API).
  // Giật/delay là do UI phải chờ round-trip mới update. Nay:
  //  1) cập nhật cfg cục bộ NGAY (optimistic) → slider + số × nhảy tức thì.
  //  2) gom các thay đổi liên tiếp, chỉ gửi POST sau 220ms yên (debounce).
  //  3) chỉ đồng bộ lại config nhẹ (1 API), KHÔNG reload cả 5 panel.
  const patchTimer = useRef<any>(null);
  const pendingPatch = useRef<any>({});
  const flushPatch = useCallback(async () => {
    if (!bot) return;
    const body = pendingPatch.current;
    pendingPatch.current = {};
    if (!body || Object.keys(body).length === 0) { patchPending.current = false; return; }
    try {
      const r = await api<any>(
        `/trade/bots/${bot}/automato/configure`,
        "POST",
        body,
      );
      // Server có thể clamp (vd 999→125) → đồng bộ lại config nhẹ.
      setCfg((prev: any) => ({ ...(prev ?? {}), ...(r.config ?? r) }));
    } catch (e: any) {
      say(`AUTOMATO: ${e.message}`);
      load(); // lỗi → kéo lại state thật
    } finally {
      patchPending.current = false;
    }
  }, [bot, say, load]);
  const patch = (p: any) => {
    if (!bot) return;
    // GUARD chống NaN: bỏ mọi field có giá trị số không hợp lệ (NaN/Infinity) →
    // không bao giờ ghi NaN vào cfg hoặc gửi lên server (bủ anh Nấng 09/07).
    const clean: any = {};
    for (const [k, val] of Object.entries(p)) {
      if (typeof val === "number" && !Number.isFinite(val)) continue; // drop NaN/Inf
      clean[k] = val;
    }
    if (Object.keys(clean).length === 0) return;
    // optimistic: UI phản hồi ngay, không chờ mạng
    patchPending.current = true;
    setCfg((prev: any) => ({ ...(prev ?? {}), ...clean }));
    pendingPatch.current = { ...pendingPatch.current, ...clean };
    clearTimeout(patchTimer.current);
    patchTimer.current = setTimeout(flushPatch, 220);
  };
  const preset = async (p: string) => {
    const r = await api<any>(`/trade/bots/${bot}/automato/preset`, "POST", {
      preset: p,
    });
    setCfg(r.config ?? r);
    say(`Preset ${p}`);
    load();
  };
  // v1.4: bấm ARM phản hồi NGAY (optimistic) — không disable nút, không để poll stale ghi đè,
  // sau khi xong chỉ sync NHẸ position (1 call) thay vì reload 5 panel.
  const armInFlight = useRef(false);
  const arm = async () => {
    if (!bot || armInFlight.current) return;
    const next = !cfg?.armed;
    // 1) lật trạng thái + phase ngay lập tức để nút tròn đổi tức thì
    armInFlight.current = true;
    patchPending.current = true;
    busyRef.current = true;
    loadSeq.current++; // hủy mọi poll đang bay — response cũ không được ghi đè nữa
    setCfg((prev: any) => ({ ...(prev ?? {}), armed: next }));
    setPos((prev: any) => ({ ...(prev ?? {}), phase: next ? "scanning" : "standby", openPosition: next ? prev?.openPosition : null }));
    say(next ? "Đã ARM — AUTOMATO chạy ngay" : "Đã DISARM");
    setBusy(true);
    try {
      const r = await api<any>(
        `/trade/bots/${bot}/automato/${next ? "arm" : "disarm"}`,
        "POST",
      );
      setCfg((prev: any) => ({ ...(prev ?? {}), ...(r.config ?? r), armed: next }));
    } catch (e: any) {
      say(`AUTOMATO: ${e.message}`);
      setCfg((prev: any) => ({ ...(prev ?? {}), armed: !next })); // rollback nếu lỗi
      setPos((prev: any) => ({ ...(prev ?? {}), phase: !next ? "scanning" : "standby" }));
    } finally {
      patchPending.current = false;
      busyRef.current = false;
      armInFlight.current = false;
      setBusy(false);
      // sync nhẹ: chỉ position — không kéo lại 5 panel gây giật
      try { const p = await api<any>(`/trade/bots/${bot}/automato/position`); setPos(p); } catch {}
    }
  };
  const n = (v: any, d = 0) => Number(v ?? d);
  const armed = !!cfg?.armed,
    st = cfg?.state ?? {},
    uiPhase = pos?.phase ?? (armed ? (st.openPosition ? "live" : "scanning") : "standby"),
    phase = uiPhase === "live" ? "live" : uiPhase;
  const livePos = pos?.openPosition ?? st.openPosition;
  const posSym = String(livePos?.symbol ?? bots.find((b) => b.name === bot)?.symbols?.[0] ?? "BTC/USDT").replace(":USDT", "");
  const posSide = String(livePos?.side ?? "long").toLowerCase();
  const pnl = n(pos?.pnlPct ?? livePos?.pnlPct ?? st.sessionPnl),
    sessPnl = n(pos?.sessionPnlPct ?? st.sessionPnl),
    tp = n(pos?.sessionTpPct ?? cfg?.session_tp, 6),
    sl = n(pos?.sessionSlPct ?? cfg?.session_sl, 3);
  // ---- Smooth readout: ease the displayed % toward the polled target so the
  // dial number + gain ring glide (như bản HTML demo tick 240ms) thay vì nhảy giật mỗi 2.5s.
  const [dispPnl, setDispPnl] = useState(0);
  const dispRef = useRef(0);
  const targetRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  targetRef.current = pnl;
  useEffect(() => {
    // Reset ngay về 0 khi rời trạng thái giữ lệnh để không kéo số cũ.
    if (uiPhase !== "live") {
      targetRef.current = 0;
    }
    if (rafRef.current != null) return;
    const step = () => {
      const cur = dispRef.current;
      const tgt = targetRef.current;
      const d = tgt - cur;
      if (Math.abs(d) < 0.0008) {
        dispRef.current = tgt;
        setDispPnl(tgt);
        rafRef.current = null;
        return;
      }
      // easing ~0.12/frame → mượt tự nhiên, không giật
      dispRef.current = cur + d * 0.12;
      setDispPnl(dispRef.current);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [pnl, uiPhase]);
  const shownPnl = uiPhase === "live" ? dispPnl : pnl;
  const sweep = Math.min(604, Math.max(0, shownPnl / Math.max(0.0001, tp)) * 604);
  const mode = cfg?.mode === "shadow" ? "PAPER · SHADOW" : "PAPER";
  const superMode = cfg?.super_mode ?? "off";
  const logs = log ?? [];
  const ledger = ana?.ledger ?? {
    sim: { trades: 0, pnl: 0 },
    real: { trades: 0, pnl: 0 },
  };

  return (
    <div className="automato-v12">
      <div className="at-meta">
        <button className="chip brass chipbtn" onClick={() => patch({ mode: cfg?.mode === "shadow" ? "live_sim" : "shadow" })}>{mode}</button>
        <span className="chip sim">
          giả lập {Number(ledger.sim?.pnl ?? 0).toFixed(2)}
        </span>
        <select className="botpick" value={bot} onChange={(e) => setSel(e.target.value)}>{bots.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}</select>
        <span className="chip">
          {new Date().toLocaleTimeString("vi-VN", { hour12: false })}
        </span>
        <PaperCapital cfg={cfg} patch={patch} />
        <span className="sp" />
        <span className="at-eq">
          {fmt(Number(cfg?.sim_capital ?? bots.find((b) => b.name === bot)?.equity ?? 0))}
        </span>
        <span className="at-eqsub">
          vốn giả lập · phiên {sessPnl >= 0 ? "+" : ""}
          {sessPnl.toFixed(2)}%
        </span>
      </div>
      <nav className="at-tabs">
        {(
          [
            ["auto", "Auto", "1 nút · risk shell"],
            ["analysis", "Phân tích", "thị trường · tín hiệu"],
            ["shield", "Shield", "delta-neutral · funding"],
            ["journal", "Nhật ký", "lệnh · hồ sơ quyết định"],
          ] as const
        ).map((x) => (
          <button
            key={x[0]}
            className={`at-tab ${tab === x[0] ? "on" : ""}`}
            onClick={() => setTab(x[0])}
          >
            {x[1]}
            <span className="n">{x[2]}</span>
          </button>
        ))}
      </nav>

      {tab === "auto" && (
        <div className="auto-grid">
          <div>
            <div className="card pair-card">
              <div className="pair-head">
                <h3 style={{ margin: 0 }}>{pairPage === 1 ? "Cặp đề xuất" : "Biến động dữ dội 🌋"}</h3>
                <div className="pair-pager">
                  <button className={pairPage === 1 ? "pgbtn on" : "pgbtn"} onClick={() => setPairPage(1)}>1</button>
                  <button className={pairPage === 2 ? "pgbtn on" : "pgbtn"} onClick={() => setPairPage(2)}>2</button>
                </div>
              </div>
              <div className="pair-sub">{pairPage === 1 ? "10 coin hot · click là chạy SHADOW ULTRA" : "quét ticker 24h thật · xếp theo độ điên · click là chạy"}</div>
              {pairPage === 1 ? (
                <div className="pair-grid">
                  {RECOMMENDED_PAIRS.map((sym) => (
                    <button key={sym} className="coin-chip" disabled={busy} onClick={async () => { setBusy(true); try { await api(`/trade/bots/${bot}/automato/quickstart`, "POST", { symbol: sym }); say(`${sym} — đã bật Shadow + ULTRA + ARM`); await load(); } catch (e:any) { say(`AUTOMATO: ${e.message}`); } finally { setBusy(false); } }}>
                      {sym.replace("/USDT", "")}<span>/USDT</span>
                    </button>
                  ))}
                </div>
              ) : movers == null ? (
                <div className="pair-sub" style={{ padding: "12px 0" }}>đang quét biến động từ sàn…</div>
              ) : movers.length === 0 ? (
                <div className="pair-sub" style={{ padding: "12px 0" }}>không lấy được dữ liệu sàn — thử lại sau</div>
              ) : (
                <div className="pair-grid movers">
                  {movers.map((m) => (
                    <button key={m.symbol} className="coin-chip mover" disabled={busy} title={`Biên độ 24h ${m.rangePct.toFixed(1)}% · volume ${(m.quoteVolume / 1e6).toFixed(1)}M`} onClick={async () => { setBusy(true); try { await api(`/trade/bots/${bot}/automato/quickstart`, "POST", { symbol: m.symbol }); say(`${m.symbol} — đã bật Shadow + ULTRA + ARM`); await load(); } catch (e:any) { say(`AUTOMATO: ${e.message}`); } finally { setBusy(false); } }}>
                      <span className="mv-sym">{m.symbol.replace("/USDT", "")}</span>
                      <span className={`mv-chg ${m.changePct >= 0 ? "up" : "down"}`}>{m.changePct >= 0 ? "+" : ""}{m.changePct.toFixed(1)}%</span>
                      <span className="mv-rng">±{m.rangePct.toFixed(0)}%</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="card dial-card" style={{ marginTop: 16 }}>
              <div className="marks">
                <span>
                  <b>SL phiên</b> −{sl.toFixed(1)}%
                </span>
                <span>
                  +{tp.toFixed(1)}% <b>TP phiên</b>
                </span>
              </div>
              <div className={`dial-wrap ${phase}`}>
                <svg viewBox="0 0 220 220" aria-hidden="true">
                  <circle className="ring-track" cx="110" cy="110" r="96" />
                  <g className="sweepg">
                    <circle className="ring-sweep" cx="110" cy="110" r="96" />
                  </g>
                  <circle
                    className="ring-gain"
                    cx="110"
                    cy="110"
                    r="96"
                    style={{
                      strokeDasharray: `${sweep} 604`,
                      stroke:
                        shownPnl < -0.0005
                          ? "var(--down)"
                          : shownPnl > 0.0005
                            ? "var(--up)"
                            : "var(--brass)",
                    }}
                  />
                </svg>
                <button
                  className="core"
                  onClick={arm}
                  aria-live="polite"
                >
                  {uiPhase === "live" ? (<>
                    <span className={`dial-symbol ${shownPnl >= 0 ? "up" : "down"}`}>{posSym}</span>
                    <span className={`word pnlread ${shownPnl >= 0 ? "up" : "down"}`}>{shownPnl >= 0 ? "+" : ""}{shownPnl.toFixed(2)}%</span>
                    <span className={`dir ${posSide === "short" ? "down" : "up"}`}>{n(pos?.leverage ?? cfg?.leverage, 1) > 1 ? `${n(pos?.leverage ?? cfg?.leverage, 1)}× · ` : ""}{posSide === "short" ? "▼ SHORT" : "▲ LONG"}</span>
                    <span className="subw">bấm để DISARM + đóng</span>
                  </>) : (<>
                    <span className="glyph">{armed ? "◌" : "⬡"}</span>
                    <span className="word">{armed ? "QUÉT" : "ARM"}</span>
                    <span className="lev-badge">{cfg?.auto_leverage ? `AUTO ${n(cfg?.lev_min, 2)}–${n(cfg?.lev_max, 20)}×` : `${n(cfg?.leverage, 1)}× đòn bẩy`}</span>
                    <span className="subw">{armed ? "bấm để disarm" : "phiên mới · paper"}</span>
                  </>)}
                </button>
              </div>
              <div className="phase-line">
                {uiPhase === "live"
                  ? "ĐANG GIỮ VỊ THẾ — P&L live theo giá ccxt"
                  : armed
                    ? "đang quét — vào lệnh khi strategy + AI đồng thuận"
                    : "standby — cấu hình risk shell rồi ARM"}
              </div>
            </div>
            <div className="card cfg" style={{ marginTop: 16 }}>
              <h3>Super Automato</h3>
              <div className="preset-row">
                {["off", "soft", "hard", "ultra", "custom"].map((m) => (
                  <button
                    key={m}
                    className={`pbtn ${superMode === m ? "on" : ""}`}
                    onClick={() => patch({ super_mode: m })}
                  >
                    {m === "off"
                      ? "Tắt"
                      : m === "soft"
                        ? "Soft Think · 3"
                        : m === "hard"
                          ? "Hard Think · 5"
                          : m === "ultra"
                            ? "ULTRA"
                          : "Custom"}
                  </button>
                ))}
              </div>
              <div className="sup-state">
                <span
                  className={`tag ${st.phase === "REAL" ? "brass" : "sim"}`}
                >
                  {st.phase === "REAL" ? "VỐN THẬT" : "GIẢ LẬP"}
                </span>
                <span>
                  chuỗi thua sim {n(st.simLossStreak)}/
                  {superMode === "hard" ? 5 : 3}
                </span>
                <span>stake ×{n(st.stakeMult, 1).toFixed(2)}</span>
              </div>
              <div className="honest">
                <div className="t">Audit thật</div>
                <p>
                  Theo xác suất thống kê toán học: nếu các lệnh độc lập, chuỗi
                  thua giả lập không làm lệnh kế tiếp dễ thắng hơn. Cơ chế chỉ
                  đáng tin sau walk-forward A/B.
                </p>
              </div>
            </div>
          </div>
          <div>
            <div className="card cfg">
              <h3>Risk shell — vỏ an toàn của phiên</h3>
              <div className="preset-row">
                <button onClick={() => preset("cautious")} className="pbtn">
                  Thận trọng
                </button>
                <button onClick={() => preset("standard")} className="pbtn on">
                  Chuẩn
                </button>
                <button onClick={() => preset("active")} className="pbtn">
                  Chủ động
                </button>
                <button
                  onClick={() =>
                    say(
                      "AI gợi ý: giữ Chuẩn cho đến khi walk-forward OOS ổn định.",
                    )
                  }
                  className="pbtn ai"
                >
                  ✦ AI gợi ý
                </button>
              </div>
              <div className="cfgrows">
                <NumInp
                  l="Rủi ro mỗi lệnh (% vốn)"
                  value={Number(cfg?.risk_per_trade ?? 0.5)}
                  min={0.1} max={100}
                  onCommit={(n) => patch({ risk_per_trade: n })}
                />
                <NumInp
                  l="Giới hạn số lệnh / phiên"
                  value={Number(cfg?.max_trades_session ?? 10)}
                  min={1} max={1000}
                  onCommit={(n) => patch({ max_trades_session: Math.round(n) })}
                />
                <NumInp
                  l="Ngắt phiên khi lãi (TP)"
                  value={Number(cfg?.session_tp ?? 6)}
                  min={0.1} max={1000}
                  onCommit={(n) => patch({ session_tp: n })}
                />
                <NumInp
                  l="Ngắt phiên khi lỗ (SL)"
                  value={Number(cfg?.session_sl ?? 3)}
                  min={0.1} max={1000}
                  onCommit={(n) => patch({ session_sl: n })}
                />
              </div>
              <LeverageStrip cfg={cfg} patch={patch} />
              <div className="riskest">
                Xấu nhất phiên:{" "}
                <b>
                  −
                  {Math.min(
                    n(cfg?.session_sl, 3),
                    n(cfg?.risk_per_trade, 0.5) *
                      n(cfg?.max_trades_session, 10),
                  ).toFixed(2)}
                  %
                </b>{" "}
                · rủi ro/lệnh {n(cfg?.risk_per_trade, 0.5).toFixed(2)}% vốn.
              </div>
              <h3>Quản lý lệnh — máy tự chăm vị thế</h3>
              <div className="cfgrows">
                <NumInp
                  l="BE tại R"
                  value={Number(cfg?.breakeven_at_r ?? 1)}
                  min={0}
                  onCommit={(n) => patch({ breakeven_at_r: n })}
                />
                <NumInp
                  l="Trailing ATR"
                  value={Number(cfg?.trailing_atr ?? 0)}
                  min={0}
                  onCommit={(n) => patch({ trailing_atr: n })}
                />
                <NumInp
                  l="Partial TP R"
                  value={Number(cfg?.partial_tp_at_r ?? 1.5)}
                  min={0}
                  onCommit={(n) => patch({ partial_tp_at_r: n })}
                />
                <NumInp
                  l="Time-stop bars"
                  value={Number(cfg?.time_stop_bars ?? 24)}
                  min={1}
                  onCommit={(n) => patch({ time_stop_bars: Math.round(n) })}
                />
              </div>
              <h3>Ngắt mạch — chống cháy dây chuyền</h3>
              <div className="cfgrows">
                <NumInp
                  l="Chuỗi thua THẬT"
                  value={Number(cfg?.cb_loss_streak ?? 3)}
                  min={1}
                  onCommit={(n) => patch({ cb_loss_streak: Math.round(n) })}
                />
                <NumInp
                  l="Cooldown phút"
                  value={Number(cfg?.cb_cooldown_min ?? 15)}
                  min={0}
                  onCommit={(n) => patch({ cb_cooldown_min: Math.round(n) })}
                />
                <Sel
                  l="Chế độ vốn"
                  v={cfg?.mode ?? "live_sim"}
                  onC={(v) => patch({ mode: v })}
                  opts={["live_sim", "shadow"]}
                />
              </div>
            </div>
            <AutomatoStatePanel bot={bot} pos={pos} cfg={cfg} armed={armed} say={say} load={load} />
          </div>
          {/* ĐA LỆNH: danh sách tối đa 10 lệnh automato song song, mỗi lệnh coin+side+đòn bẩy+TP/SL riêng */}
          <div className="chart-full">
            <OrderList bot={bot} say={say} />
          </div>
          {/* Biểu đồ nến: full-width ngay dưới bảng Audit Thật — to, dễ xem */}
          <div className="chart-full">
            <CandleChart data={ohlcv} pos={pos} big />
          </div>
        </div>
      )}
      {tab === "analysis" && (
        <div className="an-grid">
          <div className="card">
            <h3>Bảng tín hiệu</h3>
            <div className="feed">
              {[
                "BTC RSI quay đầu lên · MACD rising",
                "ETH inside channel — đứng ngoài",
                "SOL ATR nở · regime BÙNG",
                "BNB funding dương — giảm size",
              ].map((x, i) => (
                <div className="ev" key={i}>
                  <span className="sym">{x.split(" ")[0]}</span>
                  <span className="txt">{x}</span>
                  <span className="tag">watch</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <h3>Ma trận đồng thuận</h3>
            <div className="riskest">
              Strategy + AI + risk-agent phải đồng thuận trước khi vào lệnh. Khi
              chưa đủ mạnh, AUTOMATO đứng ngoài.
            </div>
          </div>
        </div>
      )}
      {tab === "shield" && (
        <div className="card">
          <h3>Shield — delta-neutral · funding</h3>
          <div className="metrics">
            <Metric
              l="Real ledger"
              v={`${ledger.real?.trades ?? 0} · ${Number(ledger.real?.pnl ?? 0).toFixed(2)}`}
            />
            <Metric
              l="Sim ledger"
              v={`${ledger.sim?.trades ?? 0} · ${Number(ledger.sim?.pnl ?? 0).toFixed(2)}`}
              cls="simc"
            />
            <Metric l="Guard blocks" v={String(ana?.guardBlocks ?? 0)} />
          </div>
          <div className="riskest">
            Né funding/tin vĩ mô, cooldown sau chuỗi thua, và giới hạn
            lệnh/phiên được enforce ở server.
          </div>
        </div>
      )}
      {tab === "journal" && (
        <div className="card">
          <h3>Nhật ký phiên — máy ghi từng bước</h3>
          <div className="feed">
            {logs.length ? (
              logs.map((h, i) => (
                <div className="ev" key={i}>
                  <span className="t">
                    {new Date(h.at).toLocaleTimeString("vi-VN", {
                      hour12: false,
                    })}
                  </span>
                  <span className="sym">{h.kind}</span>
                  <span className="txt">{h.message}</span>
                </div>
              ))
            ) : (
              <div className="feed-empty">chưa có sự kiện</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ l, v, cls }: { l: string; v: string; cls?: string }) {
  return <div className="metric"><div className="m-l">{l}</div><div className={`m-v ${cls ?? ''}`}>{v}</div></div>;
}

function NewBotForm({
  onDone,
  onBack,
  say,
  t,
}: {
  onDone: () => void;
  onBack: () => void;
  say: (m: string) => void;
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
}) {
  const [f, setF] = useState({
    name: "",
    exchange: "bingx",
    market_type: "swap",
    strategy: "rsi_ema",
    symbols: "BTC/USDT:USDT,ETH/USDT:USDT",
    mode: "paper",
  });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const create = async () => {
    if (!f.name.trim()) {
      say(t("nameRequired"));
      return;
    }
    try {
      await api("/trade/bots", "POST", {
        ...f,
        name: f.name.trim(),
        symbols: f.symbols
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      say(t("botCreated"));
      onDone();
    } catch (e: any) {
      say(t("apiError", { msg: e.message }));
    }
  };
  return (
    <div className="form">
      <div className="section-back">
        <button className="btn ghost" onClick={onBack}>
          {t("back")}
        </button>
      </div>
      <div className="grid2">
        <label className="field">
          <span>{t("name")}</span>
          <input value={f.name} onChange={set("name")} placeholder="main" />
        </label>
        <label className="field">
          <span>{t("exchange")}</span>
          <select value={f.exchange} onChange={set("exchange")}>
            {[
              "bingx",
              "binance",
              "bybit",
              "okx",
              "gate",
              "kucoin",
              "mexc",
              "synthetic",
            ].map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("market")}</span>
          <select value={f.market_type} onChange={set("market_type")}>
            <option value="swap">futures (swap)</option>
            <option value="spot">spot</option>
          </select>
        </label>
        <label className="field">
          <span>{t("strategy")}</span>
          <select value={f.strategy} onChange={set("strategy")}>
            {["rsi_ema", "donchian_breakout", "bollinger_meanrev"].map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("symbolsComma")}</span>
          <input value={f.symbols} onChange={set("symbols")} />
        </label>
        <label className="field">
          <span>{t("mode")}</span>
          <select value={f.mode} onChange={set("mode")}>
            <option value="paper">{t("paperMode")}</option>
            <option value="live">{t("liveMode")}</option>
          </select>
        </label>
      </div>
      <div className="foot-row">
        <button className="btn primary" onClick={create}>
          {t("createBot")}
        </button>
        <span className="hint">{t("paperHint")}</span>
      </div>
    </div>
  );
}

function RecallBox({
  bot,
  t,
}: {
  bot: string;
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
}) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[] | null>(null);
  const go = async () => {
    if (!q.trim()) return;
    try {
      setRows(
        await api<any[]>(
          `/trade/bots/${bot}/recall?query=${encodeURIComponent(q)}&limit=5`,
        ),
      );
    } catch {
      setRows([]);
    }
  };
  return (
    <div className="recall">
      <div className="m-l" style={{ marginBottom: 6 }}>
        {t("semanticRecall")}
      </div>
      <div className="recall-row">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("recallPlaceholder")}
          onKeyDown={(e) => e.key === "Enter" && go()}
        />
        <button className="btn sm" onClick={go}>
          {t("recall")}
        </button>
      </div>
      {rows &&
        (rows.length ? (
          rows.map((r, i) => (
            <div key={i} className="recall-hit">
              <span>
                {r.final_action === "long"
                  ? "🟢"
                  : r.final_action === "short"
                    ? "🔴"
                    : "⚪"}{" "}
                <span className="mono">{r.symbol}</span>{" "}
                <span className="dim">{r.note}</span>
              </span>
              <span className="mono">
                {(Number(r.similarity) * 100).toFixed(0)}%
              </span>
            </div>
          ))
        ) : (
          <p className="dim" style={{ fontSize: 12, marginTop: 8 }}>
            {t("nothingSimilar")}
          </p>
        ))}
    </div>
  );
}

function BacktestLab({
  say,
  t,
}: {
  say: (m: string) => void;
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
}) {
  const [f, setF] = useState({
    strategy: "rsi_ema",
    symbol: "BTC/USDT:USDT",
    timeframe: "15m",
    exchange: "bybit",
    candles: 1000,
  });
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<any | null>(null);
  const run = async () => {
    setBusy(true);
    try {
      const r = await api<any>("/trade/backtest", "POST", {
        ...f,
        candles: Number(f.candles),
      });
      setM(r.metrics);
      say(`${t("backtestMsg")} · ${r.metrics.numTrades} ${t("trades")}`);
    } catch (e: any) {
      say(`${t("backtestMsg")}: ${e.message}`);
    }
    setBusy(false);
  };
  return (
    <>
      <div className="eyebrow">
        <span className="k">{t("backtestLab")}</span>
        <span className="rule" />
        <span className="mt">{t("backtestSub")}</span>
      </div>
      <div className="lab">
        <div className="controls">
          <Sel
            l={t("strategy")}
            v={f.strategy}
            onC={(v) => setF({ ...f, strategy: v })}
            opts={["rsi_ema", "donchian_breakout", "bollinger_meanrev"]}
          />
          <Inp
            l={t("symbol")}
            v={f.symbol}
            onC={(v) => setF({ ...f, symbol: v })}
          />
          <Sel
            l={t("timeframe")}
            v={f.timeframe}
            onC={(v) => setF({ ...f, timeframe: v })}
            opts={["5m", "15m", "1h", "4h"]}
          />
          <Sel
            l={t("exchange")}
            v={f.exchange}
            onC={(v) => setF({ ...f, exchange: v })}
            opts={["bingx", "binance", "bybit", "okx", "synthetic"]}
          />
          <Inp
            l={t("candles")}
            v={String(f.candles)}
            onC={(v) => setF({ ...f, candles: Number(v) || 1000 })}
            w={90}
          />
          <button className="btn primary" disabled={busy} onClick={run}>
            {busy ? t("runningEllipsis") : t("runBacktest")}
          </button>
        </div>
        {m && (
          <div className="metrics">
            <Metric
              l={t("totalReturn")}
              v={(m.totalReturn * 100).toFixed(2) + "%"}
              cls={m.totalReturn >= 0 ? "up" : "down"}
            />
            <Metric l={t("trades")} v={String(m.numTrades)} />
            <Metric l={t("winRate")} v={(m.winRate * 100).toFixed(1) + "%"} />
            <Metric
              l={t("maxDrawdown")}
              v={(m.maxDrawdown * 100).toFixed(2) + "%"}
              cls="down"
            />
            <Metric l={t("profitFactor")} v={m.profitFactor.toFixed(2)} />
            <Metric l={t("sharpe")} v={m.sharpe.toFixed(2)} />
            <Metric l={t("avgWin")} v={fmt(m.avgWin)} cls="up" />
            <Metric l={t("avgLoss")} v={fmt(m.avgLoss)} cls="down" />
          </div>
        )}
      </div>
    </>
  );
}

function WalkForwardLab({
  say,
  t,
}: {
  say: (m: string) => void;
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
}) {
  const [f, setF] = useState({
    strategy: "donchian_breakout",
    symbol: "BTC/USDT:USDT",
    timeframe: "15m",
    exchange: "bybit",
    candles: 2000,
    grid: '{"channel":[10,20,30]}',
  });
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any | null>(null);
  const run = async () => {
    let grid: any;
    try {
      grid = JSON.parse(f.grid);
    } catch {
      say(t("gridJson"));
      return;
    }
    setBusy(true);
    try {
      const r = await api<any>("/trade/walkforward", "POST", {
        ...f,
        candles: Number(f.candles),
        grid,
      });
      setRes(r);
      say(`${t("walkMsg")} · ${r.aggregate.windows} ${t("windows")}`);
    } catch (e: any) {
      say(`${t("walkMsg")}: ${e.message}`);
    }
    setBusy(false);
  };
  const a = res?.aggregate;
  return (
    <>
      <div className="eyebrow">
        <span className="k">{t("walkForward")}</span>
        <span className="rule" />
        <span className="mt">{t("walkSub")}</span>
      </div>
      <div className="lab">
        <div className="controls">
          <Sel
            l={t("strategy")}
            v={f.strategy}
            onC={(v) => setF({ ...f, strategy: v })}
            opts={["donchian_breakout", "rsi_ema", "bollinger_meanrev"]}
          />
          <Inp
            l={t("symbol")}
            v={f.symbol}
            onC={(v) => setF({ ...f, symbol: v })}
          />
          <Sel
            l={t("exchange")}
            v={f.exchange}
            onC={(v) => setF({ ...f, exchange: v })}
            opts={["bingx", "binance", "bybit", "okx", "synthetic"]}
          />
          <Inp
            l={t("candles")}
            v={String(f.candles)}
            onC={(v) => setF({ ...f, candles: Number(v) || 2000 })}
            w={90}
          />
          <Inp
            l={t("paramGrid")}
            v={f.grid}
            onC={(v) => setF({ ...f, grid: v })}
            w={220}
          />
          <button className="btn primary" disabled={busy} onClick={run}>
            {busy ? t("optimizing") : t("runWalk")}
          </button>
        </div>
        {a && (
          <>
            <div className="metrics">
              <Metric
                l={t("oosReturn")}
                v={(a.oos_total_return * 100).toFixed(2) + "%"}
                cls={a.oos_total_return >= 0 ? "up" : "down"}
              />
              <Metric l={t("windows")} v={String(a.windows)} />
              <Metric l={t("oosTrades")} v={String(a.oos_trades)} />
              <Metric
                l={t("oosWinRate")}
                v={(a.oos_win_rate * 100).toFixed(1) + "%"}
              />
              <Metric
                l={t("oosMaxDD")}
                v={(a.oos_max_drawdown * 100).toFixed(2) + "%"}
                cls="down"
              />
              <Metric l={t("final")} v={fmt(a.final_equity)} />
            </div>
            <div className="wf-windows">
              {res.windows.map((w: any) => (
                <div key={w.window} className="w">
                  <span className="mono">
                    #{w.window} · {JSON.stringify(w.best_params)}
                  </span>
                  <span className={w.oos_return >= 0 ? "pos" : "neg"}>
                    {w.oos_return >= 0 ? "+" : ""}
                    {(w.oos_return * 100).toFixed(2)}% · {w.oos_trades}{" "}
                    {t("trades")}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Sel({
  l,
  v,
  onC,
  opts,
}: {
  l: string;
  v: string;
  onC: (v: string) => void;
  opts: string[];
}) {
  return (
    <label className="field">
      <span>{l}</span>
      <select value={v} onChange={(e) => onC(e.target.value)}>
        {opts.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

// Đòn bẩy: nút + thanh kéo (1×→125×) + Advance mở drawer full option. Giữ nguyên UI hiện có.
const LEV_MAX = 125;
// ĐA LỆNH (multi-order): danh sách tối đa 10 lệnh automato song song. Mỗi lệnh:
// coin + long/short/auto + đòn bẩy + TP/SL riêng (min 0,1%), bật/tắt riêng. Chạy nền.
const ORDER_COINS = ["BTC/USDT","ETH/USDT","SOL/USDT","BNB/USDT","XRP/USDT","DOGE/USDT","ADA/USDT","AVAX/USDT","LINK/USDT","TON/USDT"];
// ── Gắn tài khoản sàn THẬT ── modal nhập API key + secret → verify fetchBalance với sàn
// (PASS mới lưu, encrypt server-side) → hiện số dư USDT thật. Không bao giờ hiển thị lại secret.
function ExchangeKeysModal({ bot, onClose, say }: { bot: Bot; onClose: (changed: boolean) => void; say: (m: string) => void }) {
  const [apiKey, setApiKey] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<any>(null); // keys status hiện tại
  const [verifyRes, setVerifyRes] = useState<any>(null); // kết quả verify sau khi lưu
  useEffect(() => {
    api<any>(`/trade/bots/${bot.name}/keys${bot.has_keys ? "?verify=1" : ""}`)
      .then(setStatus)
      .catch(() => setStatus({ has_keys: bot.has_keys ?? false }));
  }, [bot.name, bot.has_keys]);
  const save = async () => {
    if (!apiKey.trim() || !secret.trim() || busy) return;
    setBusy(true);
    setVerifyRes(null);
    try {
      const r = await api<any>(`/trade/bots/${bot.name}/keys`, "POST", { apiKey: apiKey.trim(), secret: secret.trim() });
      setVerifyRes(r.live);
      setStatus({ has_keys: true, api_key_masked: `••••${apiKey.trim().slice(-4)}`, live: r.live });
      setApiKey(""); setSecret("");
      say(`✓ Đã nối ${bot.exchange.toUpperCase()} — số dư ${Number(r.live?.usdt?.total ?? 0).toFixed(2)} USDT`);
    } catch (e: any) {
      say(`Kết nối thất bại: ${e.message}`);
    } finally { setBusy(false); }
  };
  const clear = async () => {
    if (busy) return;
    if (!window.confirm(`Gỡ API key ${bot.exchange.toUpperCase()} khỏi bot ${bot.name}? Bot về chế độ paper-only.`)) return;
    setBusy(true);
    try { await api(`/trade/bots/${bot.name}/keys`, "DELETE"); setStatus({ has_keys: false }); setVerifyRes(null); say("Đã gỡ key — bot về paper-only"); }
    catch (e: any) { say(e.message); } finally { setBusy(false); }
  };
  const live = verifyRes ?? status?.live;
  return (
    <div className="od-editor-scrim" onClick={() => onClose(true)}>
      <div className="od-editor" style={{ width: "min(420px,94vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="od-ed-head"><b>🔌 Nối sàn thật — {bot.exchange.toUpperCase()} · {bot.name}</b><span className="x" onClick={() => onClose(true)}>✕</span></div>
        {status?.has_keys ? (
          <div className="keys-current">
            <div className="od-ed-row"><span>API key</span><b style={{ fontFamily: "'JetBrains Mono'" }}>{status.api_key_masked ?? "••••"}</b></div>
            {live?.ok && (<>
              <div className="od-ed-row"><span>Số dư USDT (futures)</span><b style={{ color: "var(--brass)", fontFamily: "'JetBrains Mono'" }}>{Number(live.usdt?.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</b></div>
              <div className="od-ed-row"><span>Khả dụng / Đang dùng</span><b style={{ fontFamily: "'JetBrains Mono'" }}>{Number(live.usdt?.free ?? 0).toFixed(2)} / {Number(live.usdt?.used ?? 0).toFixed(2)}</b></div>
              {live.openPositions != null && <div className="od-ed-row"><span>Vị thế đang mở trên sàn</span><b>{live.openPositions}</b></div>}
              <div className="keys-ok">✓ Kết nối sống — key hợp lệ</div>
            </>)}
            {live && !live.ok && <div className="keys-err">⚠ Key đã lưu nhưng verify lỗi: {live.error}</div>}
            {!live && <div className="keys-hint">Đang kiểm tra kết nối…</div>}
          </div>
        ) : (
          <div className="keys-hint" style={{ marginBottom: 10 }}>
            Chưa nối sàn. Tạo API key trong {bot.exchange.toUpperCase()} → API Management:
            bật quyền <b>Read + Perpetual Futures Trading</b>, TẮT quyền rút tiền (Withdraw), nên giới hạn IP.
            Key được mã hóa AES-256 trên server, không bao giờ hiển thị lại.
          </div>
        )}
        <label className="od-ed-row"><span>API Key</span>
          <input type="text" autoComplete="off" placeholder={status?.has_keys ? "Nhập để thay key mới" : "Dán API key"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} style={{ minWidth: 180 }} />
        </label>
        <label className="od-ed-row"><span>Secret</span>
          <input type="password" autoComplete="new-password" placeholder="Dán secret key" value={secret} onChange={(e) => setSecret(e.target.value)} style={{ minWidth: 180 }} />
        </label>
        <div className="od-ed-foot">
          {status?.has_keys ? <button className="btn sm ghost danger" disabled={busy} onClick={clear}>Gỡ key</button> : <span />}
          <button className="btn sm primary" disabled={busy || !apiKey.trim() || !secret.trim()} onClick={save}>
            {busy ? "Đang verify với sàn…" : "Verify + Lưu"}
          </button>
        </div>
        <div className="keys-hint" style={{ marginTop: 8 }}>Verify thật: gọi fetchBalance lên {bot.exchange.toUpperCase()} — key sai sẽ báo lỗi ngay, không lưu key chết.</div>
      </div>
    </div>
  );
}

function OrderList({ bot, say }: { bot: string; say: (m: string) => void }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const opRef = useRef(0); // số thao tác đang bay — poll không ghi đè optimistic khi >0
  const load = useCallback(async () => {
    if (!bot) return;
    try { const r = await api<any>(`/trade/bots/${bot}/automato/orders`); if (opRef.current === 0) setOrders(r.orders ?? []); } catch (e:any) { /* im lặng */ }
  }, [bot]);
  useEffect(() => { load(); const i = setInterval(load, 3000); return () => clearInterval(i); }, [load]);

  const addOrder = async () => {
    if (busy || orders.length >= 10) return;
    // optimistic: hiện ngay 1 dial tạm (không chờ mạng) → hết cảm giác delay
    const tempId = `tmp-${Date.now()}`;
    const optimistic = { id: tempId, slot: orders.length, symbol: "BTC/USDT", side: "auto", leverage: 5, tp_pct: 2, sl_pct: 1, risk_pct: 1, sim_capital: 1000, armed: false, uiPhase: "standby", openPosition: null };
    setOrders((prev) => [...prev, optimistic]);
    setBusy(true);
    opRef.current++;
    try { const created = await api<any>(`/trade/bots/${bot}/automato/orders`, "POST", { symbol: "BTC/USDT", side: "auto", leverage: 5, tp_pct: 2, sl_pct: 1, risk_pct: 1, sim_capital: 1000 }); setOrders((prev) => prev.map((o) => (o.id === tempId ? { ...optimistic, ...created } : o))); say("Đã thêm lệnh"); }
    catch (e:any) { setOrders((prev) => prev.filter((o) => o.id !== tempId)); say(e.message); } finally { setBusy(false); opRef.current--; if (opRef.current === 0) load(); }
  };
  const upd = async (id: string, patch: any) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o))); // optimistic
    opRef.current++;
    try { await api(`/trade/bots/${bot}/automato/orders/${id}`, "POST", patch); } catch (e:any) { say(e.message); } finally { opRef.current--; if (opRef.current === 0) load(); }
  };
  const toggle = async (o: any) => {
    if (String(o.id).startsWith("tmp-")) return; // dial tạm chưa có id thật
    const next = !o.armed;
    opRef.current++;
    setOrders((prev) => prev.map((x) => (x.id === o.id ? { ...x, armed: next, openPosition: next ? x.openPosition : null } : x)));
    say(next ? "BẬT lệnh" : "TẮT lệnh"); // báo ngay, không chờ round-trip
    try { await api(`/trade/bots/${bot}/automato/orders/${o.id}/${next ? "arm" : "disarm"}`, "POST"); }
    catch (e:any) { say(e.message); setOrders((prev) => prev.map((x) => (x.id === o.id ? { ...x, armed: !next } : x))); }
    finally { opRef.current--; if (opRef.current === 0) load(); }
  };
  const del = async (id: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== id));
    if (String(id).startsWith("tmp-")) return;
    opRef.current++;
    try { await api(`/trade/bots/${bot}/automato/orders/${id}`, "DELETE"); say("Xoá lệnh"); } catch (e:any) { say(e.message); } finally { opRef.current--; if (opRef.current === 0) load(); }
  };

  const [editId, setEditId] = useState<string | null>(null);
  const running = orders.filter((o) => o.armed).length;
  const edit = orders.find((o) => o.id === editId) || null;
  return (
    <div className="card ord-card">
      <div className="ord-head">
        <h3 style={{ margin: 0 }}>Đa lệnh Automato — {orders.length}/10 · {running} đang chạy</h3>
      </div>
      <div className="ord-sub">Mỗi lệnh là 1 nút ARM nhỏ chạy nền độc lập. Bấm nút nhỏ để BẬT/TẮT riêng từng lệnh. Bấm để sửa ở nút răng cưa. Thoát trang vẫn chạy.</div>
      <div className="ord-dials">
        {orders.map((o) => {
          const p = o.openPosition; const pnl = p ? Number(p.pnlPct ?? 0) : 0;
          const sideResolved = (p?.side ?? (o.side === "auto" ? null : o.side));
          const phase = o.armed ? (p ? "live" : "scanning") : "off";
          return (
            <div key={o.id} className="ord-dial-wrap">
              <button
                className={`ord-dial ${phase} ${pnl >= 0 ? "up" : "down"}`}
                title={o.armed ? "Bấm để TẮT lệnh này" : "Bấm để BẬT lệnh này"}
                onClick={() => toggle(o)}
              >
                <span className="od-sym">{String(o.symbol).replace("/USDT", "")}</span>
                {o.armed && p ? (
                  <span className={`od-pnl ${pnl >= 0 ? "up" : "down"}`}>{pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}%</span>
                ) : (
                  <span className="od-word">{o.armed ? "QUÉT" : "ARM"}</span>
                )}
                <span className="od-meta">{o.leverage}× · {sideResolved === "short" ? "▼ SHORT" : sideResolved === "long" ? "▲ LONG" : "AUTO"}</span>
                <span className="od-tpsl">TP {o.tp_pct}% / SL {o.sl_pct}%</span>
                <span className="od-state">{phase === "live" ? "đang giữ · bấm tắt" : o.armed ? "chờ vào · bấm tắt" : "tắt · bấm bật"}</span>
              </button>
              <button className="od-gear" title="Sửa lệnh" onClick={() => setEditId(o.id)}>⚙</button>
              <button className="od-x" title="Xoá lệnh" onClick={() => del(o.id)}>✕</button>
            </div>
          );
        })}
        {orders.length < 10 && (
          <button className="ord-dial add" disabled={busy} onClick={addOrder} title="Thêm lệnh">
            <span className="od-plus">+</span>
            <span className="od-word">Thêm</span>
            <span className="od-state">tối đa 10</span>
          </button>
        )}
      </div>
      {orders.length === 0 && <div className="ord-empty">Chưa có lệnh nào — bấm <b>+ Thêm</b> để tạo nút ARM nhỏ (tối đa 10).</div>}

      {edit && (
        <div className="od-editor-scrim" onClick={() => setEditId(null)}>
          <div className="od-editor" onClick={(e) => e.stopPropagation()}>
            <div className="od-ed-head"><b>Sửa lệnh {String(edit.symbol).replace("/USDT","")}</b><span className="x" onClick={() => setEditId(null)}>✕</span></div>
            <label className="od-ed-row"><span>Cặp coin</span>
              <select value={edit.symbol} onChange={(e) => upd(edit.id, { symbol: e.target.value })}>{ORDER_COINS.map((c) => <option key={c} value={c}>{c.replace("/USDT","")}</option>)}</select>
            </label>
            <label className="od-ed-row"><span>Hướng</span>
              <div className="ord-side">{(["auto","long","short"] as const).map((s) => (<button key={s} className={`sbtn ${edit.side === s ? "on " + s : ""}`} onClick={() => upd(edit.id, { side: s })}>{s === "auto" ? "AUTO" : s === "long" ? "LONG" : "SHORT"}</button>))}</div>
            </label>
            <label className="od-ed-row"><span>Đòn bẩy</span><input type="text" inputMode="decimal" defaultValue={String(edit.leverage)} onBlur={(e) => { const n = Math.max(1, Math.min(125, Math.round(Number(String(e.target.value).replace(",",".")) || edit.leverage))); e.target.value = String(n); if (n !== edit.leverage) upd(edit.id, { leverage: n }); }} /></label>
            <label className="od-ed-row"><span>Chốt lời TP %</span><input type="text" inputMode="decimal" defaultValue={String(edit.tp_pct)} onBlur={(e) => { const n = Math.max(0.1, Number(String(e.target.value).replace(",",".")) || edit.tp_pct); e.target.value = String(n); if (n !== edit.tp_pct) upd(edit.id, { tp_pct: n }); }} /></label>
            <label className="od-ed-row"><span>Cắt lỗ SL %</span><input type="text" inputMode="decimal" defaultValue={String(edit.sl_pct)} onBlur={(e) => { const n = Math.max(0.1, Number(String(e.target.value).replace(",",".")) || edit.sl_pct); e.target.value = String(n); if (n !== edit.sl_pct) upd(edit.id, { sl_pct: n }); }} /></label>
            <label className="od-ed-row"><span>Rủi ro %/lệnh</span><input type="text" inputMode="decimal" defaultValue={String(edit.risk_pct)} onBlur={(e) => { const n = Math.max(0.1, Number(String(e.target.value).replace(",",".")) || edit.risk_pct); e.target.value = String(n); if (n !== edit.risk_pct) upd(edit.id, { risk_pct: n }); }} /></label>
            <label className="od-ed-row"><span>Vốn giả lập</span><input type="text" inputMode="decimal" defaultValue={String(edit.sim_capital)} onBlur={(e) => { const n = Math.max(1, Number(String(e.target.value).replace(",",".")) || edit.sim_capital); e.target.value = String(n); if (n !== edit.sim_capital) upd(edit.id, { sim_capital: n }); }} /></label>
            <div className="od-ed-foot"><button className="btn sm ghost danger" onClick={() => { del(edit.id); setEditId(null); }}>Xoá lệnh</button><button className="btn sm primary" onClick={() => setEditId(null)}>Xong</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// Vốn giả lập: input để anh đặt số vốn paper → P&L mô phỏng dễ hình dung theo vốn thật.
function PaperCapital({ cfg, patch }: { cfg:any; patch:(p:any)=>void }) {
  const cfgVal = Math.max(1, Number(cfg?.sim_capital ?? 1000));
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(cfgVal));
  useEffect(() => { if (!editing) setVal(String(cfgVal)); }, [cfgVal, editing]);
  const commit = () => {
    const n = Math.max(1, Math.round(Number(val) || cfgVal));
    setEditing(false);
    if (n !== cfgVal) patch({ sim_capital: n });
  };
  if (editing) {
    return (
      <input
        className="cap-inp" autoFocus type="number" min={1} value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setVal(String(cfgVal)); setEditing(false); } }}
        title="Vốn giả lập (USDT)"
      />
    );
  }
  return (
    <button className="chip cap-chip" title="Bấm để đặt vốn giả lập" onClick={() => setEditing(true)}>
      🏵️ vốn giả lập {fmt(cfgVal)} ✎
    </button>
  );
}

function LeverageStrip({ cfg, patch }: { cfg:any; patch:(p:any)=>void }) {
  const [open, setOpen] = useState(false);
  const cfgLev = Math.max(1, Math.min(LEV_MAX, Number(cfg?.leverage ?? 1)));
  // Slider giữ state cục bộ → kéo mượt 60fps, không chờ re-render từ cfg.
  const [lev, setLev] = useState(cfgLev);
  const dragging = useRef(false);
  useEffect(() => { if (!dragging.current) setLev(cfgLev); }, [cfgLev]);
  const marginMode = String(cfg?.margin_mode ?? "isolated");
  const auto = !!cfg?.auto_leverage;
  const levMin = Number(cfg?.lev_min ?? 2), levMax = Number(cfg?.lev_max ?? 20);
  const riskModel = String(cfg?.lev_risk_model ?? "A").toUpperCase();
  const pct = ((lev - 1) / (LEV_MAX - 1)) * 100;
  const liqPct = (100 / Math.max(1, lev)).toFixed(1);
  return (
    <div className="levstrip">
      <div className="lev-top">
        <span className="lev-btn">⚙ ĐÒN BẨY</span>
        <button className={`lev-adv ${open ? "on" : ""}`} onClick={() => setOpen(!open)}>Advance {open ? "▾" : "▸"}</button>
        <span className="lev-val">{lev}<small>×</small></span>
      </div>
      <input className="lev-range" type="range" min={1} max={LEV_MAX} step={1} value={lev} disabled={auto}
        onPointerDown={() => { dragging.current = true; }}
        onInput={(e) => setLev(Number((e.target as HTMLInputElement).value))}
        onChange={(e) => setLev(Number(e.target.value))}
        onPointerUp={(e) => { dragging.current = false; patch({ leverage: Number((e.target as HTMLInputElement).value) }); }}
        onKeyUp={(e) => { dragging.current = false; patch({ leverage: Number((e.target as HTMLInputElement).value) }); }} />
      <div className="lev-ticks"><span>1×</span><span>25×</span><span>50×</span><span>100×</span><span>125×</span></div>
      {!open && <div className="lev-hint">{auto ? `Auto-Leverage đang bật (${levMin}×–${levMax}×)` : "Kéo để chọn đòn bẩy."} Bấm <b>Advance</b> để tùy chỉnh chi tiết.</div>}
      {open && (
        <div className="lev-drawer">
          <div className="lev-dh"><span className="t">Tùy chỉnh đòn bẩy</span><span className="x" onClick={() => setOpen(false)}>✕</span></div>
          <div className="lev-seg">
            <button className={marginMode === "isolated" ? "on" : ""} onClick={() => patch({ margin_mode: "isolated" })}>Isolated (khuyến nghị)</button>
            <button className={marginMode === "cross" ? "on" : ""} onClick={() => patch({ margin_mode: "cross" })}>Cross</button>
          </div>
          <label className={`lev-tgl ${auto ? "" : "off"}`}>
            <input type="checkbox" checked={auto} onChange={(e) => patch({ auto_leverage: e.target.checked })} />
            <span className="sw" /><span className="sp">Auto-Leverage <span className="lev-pill">ATR</span> — tự chọn × theo biến động (tắt = cố định)</span>
          </label>
          <div className="lev-mini2">
            <NumInp l="Đòn bẩy min" value={levMin} min={1} max={LEV_MAX} onCommit={(n) => patch({ lev_min: Math.round(n) })} />
            <NumInp l="Đòn bẩy max" value={levMax} min={1} max={LEV_MAX} onCommit={(n) => patch({ lev_max: Math.round(n) })} />
          </div>
          <div className="lev-seg" style={{ marginTop: 6 }}>
            <button className={riskModel === "A" ? "on" : ""} onClick={() => patch({ lev_risk_model: "A" })}>A · giữ risk% (an toàn)</button>
            <button className={riskModel === "B" ? "on" : ""} onClick={() => patch({ lev_risk_model: "B" })}>B · khuếch đại size</button>
          </div>
          <div className="lev-impact">
            <div className="r"><span>Ký quỹ cần</span><span className="v grn">↓ 1/{lev} notional</span></div>
            <div className="r"><span>Notional</span><span className="v">{riskModel === "B" ? `= vốn × ${lev}` : "giữ theo risk%"}</span></div>
            <div className="r"><span>Giá thanh lý</span><span className="v red">~ −{liqPct}%</span></div>
          </div>
          <div className="lev-warn">⚠️ <b>Thanh lý ~ −{liqPct}%</b> (≈100/đòn bẩy, chưa tính phí+funding). SL phiên chạm trước → an toàn.</div>
        </div>
      )}
    </div>
  );
}

function CandleChart({ data, pos, big }: { data:any; pos:any; big?:boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const candles = data?.candles ?? [];
  const symbol = data?.symbol ?? pos?.openPosition?.symbol ?? "BTC/USDT";
  const openPos = pos?.openPosition ?? pos?.state?.openPosition;
  useEffect(() => {
    const c = ref.current; if (!c || !candles.length) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1); const w = c.clientWidth || 520, h = big ? 420 : 230;
    c.width = Math.floor(w*dpr); c.height = Math.floor(h*dpr); const g = c.getContext("2d"); if (!g) return; g.setTransform(dpr,0,0,dpr,0,0);
    g.clearRect(0,0,w,h); g.fillStyle="#0F151D"; g.fillRect(0,0,w,h);
    // layout: reserve right gutter for price axis + bottom strip for time axis
    const padL=10, padR=64, top=14, botH=22; const plotW=w-padL-padR, ys=h-top-botH;
    const prices=candles.flatMap((x:any)=>[Number(x.h),Number(x.l)]);
    let hi=Math.max(...prices), lo=Math.min(...prices); const mrg=(hi-lo)*0.06||1e-6; hi+=mrg; lo-=mrg;
    const rng=Math.max(1e-9,hi-lo); const y=(v:number)=>top+(hi-v)/rng*ys;
    const dec=hi>1000?2:hi>1?4:6; const pf=(v:number)=>v.toFixed(dec);
    const step=plotW/Math.max(1,candles.length); const bw=Math.max(2.5,Math.min(11,step*.62));
    const x=(i:number)=>padL+i*step+step/2;
    // ---- price grid + right axis labels ----
    g.font="11px JetBrains Mono,monospace"; g.textBaseline="middle";
    const TICKS=5;
    for(let k=0;k<=TICKS;k++){const v=hi-(rng*k)/TICKS; const yy=y(v);
      g.strokeStyle="rgba(33,43,56,.7)"; g.lineWidth=1; g.beginPath(); g.moveTo(padL,yy); g.lineTo(padL+plotW,yy); g.stroke();
      g.fillStyle="#8592A0"; g.textAlign="left"; g.fillText(pf(v), padL+plotW+8, yy);}
    // ---- time axis (bottom): ~5 labels ----
    g.textAlign="center"; g.textBaseline="alphabetic"; g.fillStyle="#66727E";
    const tlab=(ts:number)=>{const d=new Date(ts);return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");};
    const nT=5; for(let k=0;k<nT;k++){const idx=Math.round((candles.length-1)*k/(nT-1)); const cx=x(idx); g.fillText(tlab(Number(candles[idx].t)), Math.min(padL+plotW-14,Math.max(padL+14,cx)), h-6);}
    const ema=(n:number)=>{let k=2/(n+1), e=Number(candles[0].c); return candles.map((z:any)=>{e=Number(z.c)*k+e*(1-k); return e;});};
    // ---- candles ----
    candles.forEach((z:any,i:number)=>{const cx=x(i), o=Number(z.o), cl=Number(z.c), up=cl>=o; g.strokeStyle=up?"#57C88A":"#E8695C"; g.fillStyle=g.strokeStyle; g.lineWidth=1; g.beginPath(); g.moveTo(cx,y(Number(z.h))); g.lineTo(cx,y(Number(z.l))); g.stroke(); const yy=Math.min(y(o),y(cl)), hh=Math.max(1,Math.abs(y(o)-y(cl))); g.fillRect(cx-bw/2,yy,bw,hh);});
    // ---- EMAs ----
    [[ema(9),"rgba(232,176,75,.92)"],[ema(21),"rgba(127,166,201,.85)"]].forEach(([arr,col]:any)=>{g.strokeStyle=col; g.lineWidth=1.4; g.beginPath(); arr.forEach((v:number,i:number)=>{const xx=x(i), yy=y(v); if(i)g.lineTo(xx,yy); else g.moveTo(xx,yy);}); g.stroke();});
    // ---- entry / SL / TP lines (khi đang giữ vị thế) ----
    const line=(v:number,col:string,lbl:string)=>{if(!isFinite(v)||v<=0)return;const yy=y(v);if(yy<top||yy>top+ys)return;g.strokeStyle=col;g.lineWidth=1;g.setLineDash([5,4]);g.beginPath();g.moveTo(padL,yy);g.lineTo(padL+plotW,yy);g.stroke();g.setLineDash([]);g.fillStyle=col;g.fillRect(padL+plotW,yy-8,padR,16);g.fillStyle="#0F151D";g.font="10px JetBrains Mono,monospace";g.textAlign="left";g.textBaseline="middle";g.fillText(lbl+" "+pf(v),padL+plotW+4,yy);};
    if(openPos){const ent=Number(openPos.entry??openPos.entryPrice), side=String(openPos.side??"long").toLowerCase();
      const sl=Number(openPos.sl??openPos.slPrice), tp=Number(openPos.tp??openPos.tpPrice);
      line(sl,"#E8695C","SL"); line(tp,"#57C88A","TP"); line(ent,"#E8B04B",side==="short"?"SHORT":"LONG");}
    // ---- last price line + tag ----
    const last=Number(candles[candles.length-1].c); const ly=y(last);
    g.strokeStyle="rgba(220,228,236,.4)"; g.lineWidth=1; g.setLineDash([2,3]); g.beginPath(); g.moveTo(padL,ly); g.lineTo(padL+plotW,ly); g.stroke(); g.setLineDash([]);
    g.fillStyle="#DCE4EC"; g.fillRect(padL+plotW,ly-9,padR,18); g.fillStyle="#0F151D"; g.font="11px JetBrains Mono,monospace"; g.textAlign="left"; g.textBaseline="middle"; g.fillText(pf(last),padL+plotW+5,ly);
  }, [candles, big, openPos]);
  const last = candles.length ? Number(candles[candles.length-1].c) : Number(pos?.livePrice ?? 0);
  return <div className={`card candle-card${big ? " candle-big" : ""}`} style={{ marginTop: big ? 0 : 16 }}><div className="chart-head"><h3>{String(symbol).replace(":USDT", "")} · 1m</h3><span className="chip brass">{last ? last.toFixed(last > 1000 ? 2 : 4) : "—"}</span><span className={`chip ${data?.synthetic ? "" : "sim"}`}>{data?.synthetic ? "synthetic fallback" : "ccxt live"}</span></div><canvas ref={ref} className="candle-canvas" /></div>;
}

function AutomatoStatePanel({ bot, pos, cfg, armed, say, load }: { bot:string; pos:any; cfg:any; armed:boolean; say:(m:string)=>void; load:()=>Promise<void> }) {
  const phase = pos?.phase ?? (armed ? "scanning" : "standby"); const p = pos?.openPosition;
  const tp = Number(pos?.sessionTpPct ?? cfg?.session_tp ?? 6), sl = Number(pos?.sessionSlPct ?? cfg?.session_sl ?? 3), pnl = Number(pos?.pnlPct ?? 0);
  const x = Math.max(0, Math.min(100, 33.33 + (pnl >= 0 ? (pnl/tp)*66.67 : (pnl/sl)*33.33)));
  const kill = async()=>{ try { await api(`/trade/bots/${bot}/automato/kill`, "POST"); say("KILL — đã đóng & ngắt phiên"); await load(); } catch(e:any){ say(`KILL: ${e.message}`); } };
  return <div style={{ marginTop: 16 }}>
    <div id="ps-standby" className={`card panel-state ${phase === "standby" ? "on" : ""}`}>
      <h3>Kiểm tra trước phiên</h3><div className="check"><span className="ok">✓</span> API key — Read + Trade, tắt quyền rút tiền</div><div className="check"><span className="ok">✓</span> Dữ liệu nến live ccxt</div><div className="check"><span className="ok">✓</span> Risk shell — SL/TP + kill-switch phiên</div><p className="dim" style={{fontSize:12.5}}>Bấm <b style={{color:"var(--brass)"}}>ARM</b> để mở phiên.</p>
    </div>
    <div id="ps-scanning" className={`card panel-state ${phase === "scanning" ? "on" : ""}`}>
      <h3>Đang quét — chưa vào lệnh</h3><div className="sess-strip"><div className="metric"><div className="m-l">Lệnh</div><div className="m-v">{pos?.tradeCount ?? 0}/{pos?.maxTrades ?? 10}</div></div><div className="metric"><div className="m-l">PnL phiên</div><div className="m-v">{Number(pos?.sessionPnlPct ?? 0).toFixed(2)}%</div></div><div className="metric"><div className="m-l">Giả lập</div><div className="m-v">{pos?.mode === "sim" ? "ON" : "REAL"}</div></div></div><div className="feed"><div className="ev"><span className="sym">SCAN</span><span className="txt">strategy + AI + guard đang chờ entry</span><span className="tag">live</span></div></div>
    </div>
    <div id="ps-live" className={`card panel-state ${phase === "live" ? "on" : ""}`}>
      <div className="pos-head"><span className="psym">{p?.symbol ?? "—"}</span><span className={`tag ${p?.mode === "sim" ? "sim" : "brass"}`}>{p?.mode === "sim" ? "SIM" : "VỐN THẬT"}</span><span className={`tag ${p?.side === "short" ? "short" : "long"}`}>{String(p?.side ?? "LONG").toUpperCase()}</span><span className="tag">{p?.strategy ?? "ULTRA"}</span></div>
      <div className={`pnl-big ${p?.mode === "sim" ? "simc" : pnl >= 0 ? "up" : "down"}`}>{fmt(Number(pos?.pnlAbs ?? 0))} <small>({pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}% vốn)</small></div>
      <div className="rows"><div className="row"><span>Entry</span><b>{Number(p?.entry ?? 0).toFixed(4)}</b></div><div className="row"><span>Size</span><b>{Number(p?.size ?? 0).toFixed(6)}</b></div><div className="row"><span>SL lệnh</span><b>{Number(p?.sl ?? 0).toFixed(4)}</b></div><div className="row"><span>TP lệnh</span><b>{Number(p?.tp ?? 0).toFixed(4)}</b></div><div className="row"><span>Rủi ro</span><b>{Number(p?.riskPct ?? 0).toFixed(2)}%</b></div><div className="row"><span>Lý do vào</span><b>{p?.reason ?? "—"}</b></div></div>
      <div className="cutbar"><i className="zero"/><i className="fill" style={{left:pnl<0?`${x}%`:"33.33%", width:pnl<0?`${33.33-x}%`:`${x-33.33}%`, background:pnl<0?"var(--down)":"var(--up)"}}/></div><div className="cutlbl"><span>−{sl.toFixed(1)}%</span><span>0</span><span>+{tp.toFixed(1)}%</span></div><button id="killBtn" className="btn danger" onClick={kill}>■ KILL — đóng & ngắt phiên</button>
    </div>
    <div id="ps-halted" className={`card panel-state report ${phase === "halted" ? "on" : ""}`}><h3>Phiên đã ngắt</h3><p className="why">{pos?.haltedReport?.reason ?? "halted"}</p><div className="sess-strip"><div className="metric"><div className="m-l">Lệnh thật</div><div className="m-v">{pos?.haltedReport?.trades ?? pos?.tradeCount ?? 0}</div></div><div className="metric"><div className="m-l">PnL</div><div className="m-v">{Number(pos?.haltedReport?.pnlPct ?? pos?.sessionPnlPct ?? 0).toFixed(2)}%</div></div><div className="metric"><div className="m-l">Equity</div><div className="m-v">{fmt(Number(pos?.haltedReport?.equity ?? 0))}</div></div></div></div>
  </div>;
}

function Inp({
  l,
  v,
  onC,
  w,
}: {
  l: string;
  v: string;
  onC: (v: string) => void;
  w?: number;
}) {
  return (
    <label className="field">
      <span>{l}</span>
      <input
        value={v}
        onChange={(e) => onC(e.target.value)}
        style={w ? { width: w } : undefined}
      />
    </label>
  );
}

// Ô nhập số an toàn: giữ text cục bộ khi đang gõ (không đẩy NaN giữa chừng),
// chấp nhận dấu phẩy VN (0,1), chỉ commit khi hợp lệ, clamp min (mặc định 0.1).
// Bủ bug anh Nấng 09/07: gõ "0,1" hoặc xoá trắng → trước đây ra NaN.
function NumInp({
  l, value, onCommit, min = 0.1, max, step, w,
}: {
  l: string; value: number; onCommit: (n: number) => void;
  min?: number; max?: number; step?: number; w?: number;
}) {
  const [txt, setTxt] = useState(String(value ?? ""));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setTxt(String(value ?? "")); }, [value, focused]);
  const parse = (s: string): number | null => {
    const norm = s.replace(/,/g, ".").trim();
    if (norm === "" || norm === "." || norm === "-") return null;
    const n = Number(norm);
    if (!Number.isFinite(n)) return null;
    let v = n;
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    return v;
  };
  const commit = () => {
    setFocused(false);
    const n = parse(txt);
    if (n == null) { setTxt(String(value ?? "")); return; } // rỗng/invalid → khôi phục cũ, KHÔNG gửi NaN
    setTxt(String(n));
    if (n !== value) onCommit(n);
  };
  return (
    <label className="field">
      <span>{l}</span>
      <input
        type="text" inputMode="decimal" value={txt}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          const raw = e.target.value;
          // cho phép ký tự đang gõ dở: số, dấu chấm/phẩy, dấu trừ
          if (/^-?[0-9]*[.,]?[0-9]*$/.test(raw)) setTxt(raw);
        }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        step={step}
        style={w ? { width: w } : undefined}
      />
    </label>
  );
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
.st-root .right{text-align:right}.st-root .lang-toggle{display:flex;justify-content:flex-end;gap:4px;margin-bottom:6px}.st-root .lang-btn{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--muted);background:transparent;border:1px solid var(--line);border-radius:6px;padding:3px 7px;cursor:pointer}.st-root .lang-btn.on{color:#20170a;background:var(--brass);border-color:var(--brass);font-weight:700}.st-root .section-back{margin:0 0 12px 2px}
.st-root .readout .lbl{color:var(--muted);font-size:10px;letter-spacing:.28em;text-transform:uppercase}
.st-root .readout .val{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:26px;color:var(--brass);line-height:1.1}
.st-root .meta,.st-root .mt{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--dim)}
.st-root .eyebrow{display:flex;align-items:baseline;gap:12px;margin:26px 2px 12px}
.st-root .eyebrow .k{font-family:'Space Grotesk',sans-serif;font-size:12px;letter-spacing:.3em;text-transform:uppercase}
.st-root .eyebrow .rule{flex:1;height:1px;background:var(--line)}
.st-root .toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.st-root .menu,.st-root .at-tabs{display:flex;gap:6px;margin:16px 0;border:1px solid var(--line);background:var(--panel2);border-radius:var(--r);padding:6px;overflow-x:auto;scrollbar-width:none}.st-root .menu-item,.st-root .at-tab{flex:1;background:transparent;color:var(--muted);border:0;border-radius:8px;padding:10px 14px;font-family:'Space Grotesk';letter-spacing:.16em;text-transform:uppercase;cursor:pointer;min-width:96px}.st-root .menu-item.on,.st-root .at-tab.on{background:var(--panel);color:var(--brass);box-shadow:inset 0 -2px 0 var(--brass),0 0 0 1px var(--line)}.st-root .at-tab .n{font-family:'JetBrains Mono';font-size:9px;color:var(--dim);display:block;letter-spacing:.1em;margin-top:2px}
.st-root .automato-v12{--sim:#7FA6C9}.st-root .cap-chip{font-family:'JetBrains Mono';font-size:10px;color:var(--brass);border:1px solid var(--brass-dim);background:rgba(232,176,75,.06);padding:3px 8px;border-radius:5px;letter-spacing:.04em;cursor:pointer}.st-root .cap-chip:hover{background:rgba(232,176,75,.14)}.st-root .cap-inp{font-family:'JetBrains Mono';font-size:11px;color:var(--brass);background:var(--panel2);border:1px solid var(--brass);border-radius:5px;padding:3px 8px;width:110px;letter-spacing:.03em}.st-root .botpick{font-family:'JetBrains Mono';font-size:10px;color:var(--brass);border:1px solid var(--brass-dim);background:var(--panel2);border-radius:5px;padding:3px 8px;letter-spacing:.06em}.st-root .at-meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 2px 14px}.st-root .chip{font-family:'JetBrains Mono';font-size:10px;color:var(--muted);border:1px solid var(--line);padding:3px 8px;border-radius:5px;letter-spacing:.06em}.st-root .chip.brass{color:var(--brass);border-color:var(--brass-dim)}.st-root .chip.sim,.st-root .tag.sim,.st-root .simc{color:var(--sim);border-color:rgba(127,166,201,.45)}.st-root .sp{flex:1}.st-root .at-eq{font-family:'JetBrains Mono';font-weight:700;font-size:16px;color:var(--brass)}.st-root .at-eqsub{font-family:'JetBrains Mono';font-size:11px;color:var(--dim)}.st-root .auto-grid{display:grid;grid-template-columns:400px 1fr;gap:16px;align-items:start}.st-root .dial-card{border:1px solid var(--line);background:linear-gradient(180deg,var(--panel),var(--panel2));border-radius:var(--r);padding:22px 16px 18px;text-align:center}.st-root .dial-wrap{position:relative;width:min(290px,74vw);margin:4px auto 8px;aspect-ratio:1}.st-root .dial-wrap svg{position:absolute;inset:0;width:100%;height:100%}.st-root .ring-track{fill:none;stroke:var(--line);stroke-width:6}.st-root .ring-sweep{fill:none;stroke:var(--brass);stroke-width:3;stroke-dasharray:5 17;opacity:0;transition:opacity .3s}.st-root .sweepg{transform-origin:110px 110px}.st-root .dial-wrap.scanning .ring-sweep{opacity:.85}.st-root .dial-wrap.scanning .sweepg{animation:spin 3.2s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.st-root .ring-gain{fill:none;stroke:var(--brass);stroke-width:6;stroke-linecap:round;stroke-dasharray:0 604;transform:rotate(-90deg);transform-origin:110px 110px;transition:stroke-dasharray .25s linear,stroke .25s}.st-root .core{position:absolute;inset:13%;width:auto;height:auto;aspect-ratio:1/1;box-sizing:border-box;appearance:none;-webkit-appearance:none;padding:0;margin:0;border-radius:50%!important;overflow:visible;cursor:pointer;border:1px solid var(--line);background:radial-gradient(130% 130% at 50% 18%,#26313f 0%,#161d27 46%,var(--panel2) 100%);box-shadow:inset 0 2px 3px rgba(255,255,255,.10),inset 0 -10px 22px -6px rgba(0,0,0,.92),inset 0 0 0 6px #0b0f15,inset 0 0 0 7px var(--line),0 18px 46px -16px rgba(0,0,0,.9),0 2px 0 rgba(255,255,255,.03);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;transition:box-shadow .22s ease,border-color .22s ease,transform .12s ease,background .22s ease;color:var(--ink)}.st-root .core::before{content:"";position:absolute;inset:9%;border-radius:50%;background:radial-gradient(120% 80% at 50% 8%,rgba(255,255,255,.09),rgba(255,255,255,0) 55%);pointer-events:none}.st-root .core:hover{border-color:var(--brass-dim)}.st-root .core:active{transform:scale(.985)}.st-root .core:disabled{opacity:.85;cursor:wait}.st-root .core .glyph,.st-root .glyph{font-size:26px;color:var(--brass);line-height:1;text-shadow:0 0 18px rgba(232,176,75,.45)}.st-root .core .word,.st-root .word{font-family:'Space Grotesk';font-weight:700;font-size:26px;letter-spacing:.3em;text-indent:.3em}.st-root .core .glyph,.st-root .core .word,.st-root .core .subw,.st-root .core .dial-symbol,.st-root .core .dir{position:relative;z-index:2}.st-root .dial-wrap.scanning .core,.st-root .dial-wrap.live .core{border-color:var(--brass-dim);box-shadow:inset 0 2px 3px rgba(255,255,255,.12),inset 0 -10px 22px -6px rgba(0,0,0,.92),inset 0 0 0 6px #0b0f15,inset 0 0 0 7px var(--brass-dim),0 0 40px -10px rgba(232,176,75,.8),0 18px 46px -16px rgba(0,0,0,.9)}.st-root .dial-wrap.scanning .word,.st-root .dial-wrap.live .word{font-size:29px;letter-spacing:.02em;text-indent:0}.st-root .core .subw,.st-root .subw{font-family:'JetBrains Mono';font-size:10px;color:var(--muted);letter-spacing:.12em}.st-root .lev-badge{font-family:'JetBrains Mono';font-weight:700;font-size:12px;color:#20170a;background:var(--brass);border-radius:6px;padding:2px 9px;letter-spacing:.03em;box-shadow:0 0 14px -2px rgba(232,176,75,.6);position:relative;z-index:2}.st-root .dial-symbol{font-family:'Space Grotesk';font-size:18px;font-weight:700;letter-spacing:.08em}.st-root .pnlread{font-size:31px!important;letter-spacing:.02em!important;text-indent:0!important}.st-root .dir{font-family:'JetBrains Mono';font-size:12px;font-weight:700;letter-spacing:.14em}.st-root .up{color:var(--up)!important}.st-root .down{color:var(--down)!important}.st-root .chart-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}.st-root .chart-head h3{margin-right:auto!important}.st-root .candle-canvas{width:100%;height:230px;display:block;border:1px solid var(--line);border-radius:8px;background:var(--panel2);box-shadow:inset 0 0 0 1px rgba(255,255,255,.015)}.st-root .chart-full{grid-column:1 / -1;margin-top:16px}.st-root .candle-big .candle-canvas{height:420px}.st-root .candle-big .chart-head h3{font-size:14px;letter-spacing:.12em}@media(max-width:900px){.st-root .candle-big .candle-canvas{height:300px}}.st-root .marks{display:flex;justify-content:space-between;font-family:'JetBrains Mono';font-size:11px;color:var(--dim);max-width:min(290px,74vw);margin:0 auto 4px}.st-root .marks b{color:var(--muted);font-weight:500}.st-root .phase-line{font-family:'JetBrains Mono';font-size:11px;color:var(--muted);min-height:18px}.st-root .preset-row{display:flex;gap:6px;margin:8px 0 14px}.st-root .pbtn{flex:1;font-family:'JetBrains Mono';font-size:11px;padding:7px;border:1px solid var(--line);background:var(--panel2);color:var(--muted);border-radius:7px;cursor:pointer}.st-root .pbtn.on{color:var(--brass);border-color:var(--brass-dim);background:rgba(232,176,75,.08)}.st-root .riskest{margin:12px 0;border:1px dashed var(--line);border-radius:8px;padding:9px 12px;font-family:'JetBrains Mono';font-size:11px;color:var(--muted);line-height:1.7}.st-root .riskest b{color:var(--down)}.st-root .levstrip{margin-top:14px;border:1px solid var(--brass-dim);border-radius:10px;padding:12px 12px 10px;background:rgba(232,176,75,.04)}.st-root .lev-top{display:flex;align-items:center;gap:10px;margin-bottom:8px}.st-root .lev-btn{font-family:'JetBrains Mono';font-size:12px;font-weight:700;color:#20170a;background:var(--brass);border-radius:7px;padding:7px 12px;letter-spacing:.04em}.st-root .lev-adv{font-family:'JetBrains Mono';font-size:12px;font-weight:600;color:var(--brass);background:transparent;border:1px solid var(--brass-dim);border-radius:7px;padding:6px 12px;cursor:pointer}.st-root .lev-adv.on{color:#20170a;background:var(--brass);border-color:var(--brass)}.st-root .lev-val{margin-left:auto;font-family:'JetBrains Mono';font-weight:700;font-size:22px;color:var(--brass)}.st-root .lev-val small{font-size:13px;color:var(--muted)}.st-root .lev-range{width:100%;accent-color:var(--brass);margin:6px 0 5px;cursor:pointer}.st-root .lev-range:disabled{opacity:.5;cursor:not-allowed}.st-root .lev-ticks{display:flex;justify-content:space-between;font-family:'JetBrains Mono';font-size:10px;color:var(--dim)}.st-root .lev-hint{font-size:11px;color:var(--muted);margin-top:8px}.st-root .lev-hint b{color:var(--brass)}.st-root .lev-drawer{border:1px solid var(--brass-dim);border-radius:10px;background:var(--panel);padding:12px;margin-top:10px;animation:fadein .18s ease}.st-root .lev-dh{display:flex;align-items:center;margin-bottom:10px}.st-root .lev-dh .t{font-family:'Space Grotesk';font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--brass);font-weight:600}.st-root .lev-dh .x{margin-left:auto;color:var(--dim);font-family:'JetBrains Mono';font-size:13px;cursor:pointer}.st-root .lev-seg{display:flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}.st-root .lev-seg button{flex:1;border:0;background:transparent;color:var(--muted);font-family:'JetBrains Mono';font-size:11px;padding:9px;cursor:pointer}.st-root .lev-seg button.on{background:var(--brass);color:#20170a;font-weight:700}.st-root .lev-tgl{display:flex;align-items:center;gap:10px;font-size:12px;padding:10px 0;cursor:pointer}.st-root .lev-tgl input{position:absolute;opacity:0;width:0;height:0}.st-root .lev-tgl .sw{position:relative;width:38px;height:21px;border:1px solid var(--brass-dim);border-radius:12px;background:rgba(232,176,75,.1);flex:none}.st-root .lev-tgl .sw::after{content:'';position:absolute;top:2px;left:19px;width:15px;height:15px;border-radius:50%;background:var(--brass);transition:.15s}.st-root .lev-tgl.off .sw{border-color:var(--line);background:var(--panel2)}.st-root .lev-tgl.off .sw::after{left:2px;background:var(--dim)}.st-root .lev-pill{font-family:'JetBrains Mono';font-size:10px;color:var(--brass);border:1px solid var(--brass-dim);border-radius:5px;padding:1px 6px}.st-root .lev-mini2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px}.st-root .lev-impact{margin-top:10px;border:1px dashed var(--line);border-radius:8px;padding:8px 11px}.st-root .lev-impact .r{display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px dotted var(--line)}.st-root .lev-impact .r:last-child{border-bottom:0}.st-root .lev-impact .r span:first-child{color:var(--muted)}.st-root .lev-impact .v{font-family:'JetBrains Mono';font-weight:700;color:var(--brass)}.st-root .lev-impact .v.red{color:var(--down)}.st-root .lev-impact .v.grn{color:var(--up)}.st-root .lev-warn{margin-top:9px;border:1px dashed var(--down);border-radius:8px;padding:8px 11px;font-size:12px;color:var(--ink);background:rgba(232,105,92,.05)}.st-root .lev-warn b{color:var(--down)}.st-root .ord-card{border-color:var(--brass-dim)}.st-root .ord-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}.st-root .ord-sub{font-size:11.5px;color:var(--muted);margin-bottom:14px}.st-root .ord-empty{font-size:12.5px;color:var(--dim);border:1px dashed var(--line);border-radius:8px;padding:14px;text-align:center;margin-top:10px}.st-root .ord-empty b{color:var(--brass)}.st-root .ord-dials{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:18px;justify-items:center;padding-top:6px}.st-root .ord-dial-wrap{position:relative;width:150px;height:150px}.st-root .ord-dial{width:150px;height:150px;border-radius:50%;border:1px solid var(--line);background:radial-gradient(130% 130% at 50% 18%,#26313f 0%,#161d27 46%,var(--panel2) 100%);box-shadow:inset 0 2px 3px rgba(255,255,255,.08),inset 0 -8px 18px -6px rgba(0,0,0,.9),inset 0 0 0 5px #0b0f15,inset 0 0 0 6px var(--line),0 12px 30px -14px rgba(0,0,0,.85);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;cursor:pointer;color:var(--ink);transition:box-shadow .2s,border-color .2s,transform .1s;padding:6px;text-align:center}.st-root .ord-dial:active{transform:scale(.97)}.st-root .ord-dial.scanning,.st-root .ord-dial.live{box-shadow:inset 0 2px 3px rgba(255,255,255,.1),inset 0 -8px 18px -6px rgba(0,0,0,.9),inset 0 0 0 5px #0b0f15,inset 0 0 0 6px var(--brass-dim),0 0 30px -8px rgba(232,176,75,.7),0 12px 30px -14px rgba(0,0,0,.85)}.st-root .ord-dial .od-sym{font-family:'Space Grotesk';font-weight:700;font-size:15px;letter-spacing:.04em}.st-root .ord-dial .od-word{font-family:'Space Grotesk';font-weight:700;font-size:16px;letter-spacing:.14em;color:var(--brass)}.st-root .ord-dial .od-pnl{font-family:'JetBrains Mono';font-weight:700;font-size:18px;line-height:1}.st-root .ord-dial .od-pnl.up{color:var(--up)}.st-root .ord-dial .od-pnl.down{color:var(--down)}.st-root .ord-dial .od-meta{font-family:'JetBrains Mono';font-size:10px;color:var(--muted)}.st-root .ord-dial .od-tpsl{font-family:'JetBrains Mono';font-size:9px;color:var(--dim)}.st-root .ord-dial .od-state{font-family:'JetBrains Mono';font-size:9px;color:var(--dim);margin-top:1px}.st-root .ord-dial.off{opacity:.72}.st-root .ord-dial.off .od-sym{color:var(--muted)}.st-root .ord-dial.add{border-style:dashed;background:var(--panel2);box-shadow:none;color:var(--muted)}.st-root .ord-dial.add .od-plus{font-size:30px;color:var(--brass);line-height:1}.st-root .ord-dial.add:hover{border-color:var(--brass-dim)}.st-root .od-gear,.st-root .od-x{position:absolute;width:34px;height:34px;border-radius:50%;border:1px solid var(--line);background:var(--panel);color:var(--ink);font-size:15px;cursor:pointer;display:grid;place-items:center;z-index:3;box-shadow:0 3px 8px -2px rgba(0,0,0,.6)}.st-root .od-gear{top:2px;left:2px}.st-root .od-x{top:2px;right:2px}.st-root .od-gear:hover{color:var(--brass);border-color:var(--brass-dim)}.st-root .od-x:hover{color:var(--down);border-color:var(--down)}.st-root .ord-side{display:flex;gap:3px}.st-root .ord-side .sbtn{font-family:'JetBrains Mono';font-size:11px;color:var(--muted);background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:6px 10px;cursor:pointer}.st-root .ord-side .sbtn.on{color:#20170a;background:var(--brass);border-color:var(--brass);font-weight:700}.st-root .ord-side .sbtn.on.long{background:var(--up);border-color:var(--up)}.st-root .ord-side .sbtn.on.short{background:var(--down);border-color:var(--down);color:#fff}.st-root .od-editor-scrim{position:fixed;inset:0;background:rgba(6,9,14,.72);display:grid;place-items:center;z-index:50;padding:16px}.st-root .od-editor{width:min(360px,94vw);border:1px solid var(--brass-dim);border-radius:14px;background:var(--panel);padding:16px;box-shadow:0 24px 60px -20px rgba(0,0,0,.9)}.st-root .od-ed-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.st-root .od-ed-head b{font-family:'Space Grotesk';letter-spacing:.06em}.st-root .od-ed-head .x{cursor:pointer;color:var(--dim)}.st-root .od-ed-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px dotted var(--line)}.st-root .od-ed-row span{font-size:12.5px;color:var(--muted)}.st-root .od-ed-row select,.st-root .od-ed-row input{font-family:'JetBrains Mono';font-size:12px;color:var(--ink);background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:6px 8px;text-align:right;min-width:96px}.st-root .od-ed-foot{display:flex;justify-content:space-between;gap:8px;margin-top:14px}.st-root .keys-hint{font-size:11.5px;color:var(--muted);line-height:1.6}.st-root .keys-ok{margin-top:8px;font-size:12px;color:var(--up);border:1px dashed var(--up);border-radius:7px;padding:6px 10px}.st-root .keys-err{margin-top:8px;font-size:12px;color:var(--down);border:1px dashed var(--down);border-radius:7px;padding:6px 10px}.st-root .keys-current{margin-bottom:10px}
.st-root .cfg h3,.st-root .automato-v12 .card h3{font-family:'Space Grotesk';font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted);margin:8px 0 12px;font-weight:500}.st-root .cfgrows{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.st-root .sup-state{display:flex;gap:12px;align-items:center;flex-wrap:wrap;border:1px solid var(--line);background:var(--panel2);border-radius:8px;padding:9px 12px;margin-top:12px;font-family:'JetBrains Mono';font-size:11px;color:var(--muted)}.st-root .honest{margin-top:12px;border:1px dashed var(--brass-dim);border-radius:8px;padding:12px}.st-root .honest .t{font-family:'Space Grotesk';font-size:10px;letter-spacing:.26em;text-transform:uppercase;color:var(--brass);margin-bottom:6px}.st-root .honest p{margin:0;font-size:12px;color:var(--muted);line-height:1.55}.st-root .check{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px dotted var(--line);font-size:13px}.st-root .check .ok{color:var(--up);font-family:'JetBrains Mono'}.st-root .an-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:16px}.st-root .ev .sym{font-family:'JetBrains Mono';color:var(--brass);flex:none}.st-root .ev .txt{flex:1}.st-root .panel-state{display:none}.st-root .panel-state.on{display:block;animation:fadein .18s ease}.st-root .sess-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}.st-root .pos-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;flex-wrap:wrap}.st-root .pos-head .psym{font-family:'Space Grotesk';font-weight:700;font-size:19px;letter-spacing:.04em}.st-root .pnl-big{font-family:'JetBrains Mono';font-weight:700;font-size:34px;line-height:1.1;margin:2px 0 12px}.st-root .pnl-big small{font-size:14px;color:var(--muted);font-weight:400}.st-root .cutbar{position:relative;height:12px;border:1px solid var(--line);border-radius:6px;background:var(--panel2);margin:6px 0 4px;overflow:hidden}.st-root .cutbar .zero{position:absolute;top:0;bottom:0;left:33.33%;width:1px;background:var(--dim)}.st-root .cutbar .fill{position:absolute;top:2px;bottom:2px;border-radius:4px;transition:.2s}.st-root .cutlbl{display:flex;justify-content:space-between;font-family:'JetBrains Mono';font-size:10px;color:var(--dim);margin-bottom:12px}.st-root .report .why{font-size:13px;color:var(--ink);border-left:2px solid var(--brass);padding:2px 0 2px 12px;margin:0 0 14px}.st-root .tag.long{color:var(--up);border-color:rgba(87,200,138,.4)}.st-root .tag.short{color:var(--down);border-color:rgba(232,105,92,.4)}.st-root .tbl-wrap{overflow:auto;border:1px solid var(--line);border-radius:8px;max-height:420px}
.st-root .chipbtn{background:rgba(232,176,75,.06);cursor:pointer}.st-root .pair-card{border-color:var(--brass-dim);background:linear-gradient(180deg,rgba(232,176,75,.06),var(--panel2))}.st-root .pair-sub{font-family:'JetBrains Mono';font-size:10px;color:var(--dim);margin:-4px 0 10px;letter-spacing:.08em}.st-root .pair-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:7px}.st-root .coin-chip{font-family:'JetBrains Mono';font-weight:700;color:var(--brass);border:1px solid var(--line);background:var(--panel2);border-radius:9px;padding:9px 7px;cursor:pointer;box-shadow:inset 0 -1px 0 rgba(232,176,75,.12)}.st-root .coin-chip:hover{border-color:var(--brass-dim);background:rgba(232,176,75,.08)}.st-root .coin-chip span{font-weight:500;color:var(--muted);font-size:10px;margin-left:2px}.st-root .coin-chip:disabled{opacity:.55;cursor:wait}.st-root .pair-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.st-root .pair-pager{display:flex;gap:4px}.st-root .pgbtn{font-family:'JetBrains Mono';font-size:11px;font-weight:700;width:26px;height:26px;border-radius:7px;border:1px solid var(--line);background:var(--panel2);color:var(--muted);cursor:pointer}.st-root .pgbtn.on{color:#20170a;background:var(--brass);border-color:var(--brass)}.st-root .coin-chip.mover{display:flex;flex-direction:column;gap:1px;align-items:center;padding:7px 5px}.st-root .mv-sym{font-size:12px;letter-spacing:.02em}.st-root .mv-chg{font-size:11px;font-weight:700}.st-root .mv-chg.up{color:var(--up)}.st-root .mv-chg.down{color:var(--down)}.st-root .mv-rng{font-size:9px;color:var(--dim);font-weight:500}
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
