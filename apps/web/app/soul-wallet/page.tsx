'use client';
// Soul-Wallet 1A — Ví Cá Nhân. CSS token thuần + Shell/ModuleLocked có sẵn (khuôn trang ke-toan-10a).
// Copy vào: apps/web/app/soul-wallet/page.tsx  ·  Sau khi copy chạy: pnpm --filter @citadel/web typecheck
import { useState, useEffect, useCallback } from 'react';
import { Shell } from '../../components/Shell';
import { ModuleLocked } from '../../components/ModuleGate';
import { EmptyState } from '../../components/EmptyState';
import { api } from '../../lib/api';

const B = '/api/v1/soul-wallet';
const vnd = (n: number | string) => Math.round(Number(n)).toLocaleString('vi-VN');
const kbig = (n: number | string) => {
  const v = Number(n); const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(1)}tỷ`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}tr`;
  if (a >= 1e3) return `${Math.round(v / 1e3)}k`;
  return String(v);
};
const today = () => new Date().toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString();

// ── Types (mirror payload API) ──────────────────────────────────────────────
interface Acc { id: string; name: string; type: string; balance: string; is_archived: boolean }
interface Cat { id: string; name: string; kind: string; parentId: string | null }
interface Tx { id: string; docNo: string; kind: string; status: string; occurredAt: string; amount: string; memo: string | null; accountId: string | null; counterAccountId: string | null; categoryId: string | null }
interface DonutItem { label: string; value: string }
interface Candle { day: string; open: string; high: string; low: string; close: string }
interface WfStep { label: string; value: string; kind: string }
interface HeatCell { day: string; out: string }
interface BudgetItem { id: string; name: string; jar_code: string | null; limit: string; spent: string; remaining: string; pct_used: number; at_risk: boolean; exceeded: boolean }
interface Goal { id: string; name: string; target: string; saved: string; pct: number; reached: boolean; deadline: string | null }
interface Debt { id: string; contact: string; direction: string; principal: string; paid: string; remaining: string; interest_accrued: string; due_date: string | null; overdue_days: number; status: string }
interface Aging { receivable: Record<string, string>; payable: Record<string, string> }
interface Recur { id: string; name: string; kind: string; amount: string; next_run_at: string; freq: string; auto_post: boolean; price_hiked: boolean }
interface Runway { liquid_now: string; daily_net_weighted: string; runway_days: number | null; will_run_dry: boolean; projected_end_balance: string }
interface Exec {
  month: string; liquid: string;
  net_worth: { assets: string; liabilities: string; net: string };
  this_month: { income: string; expense: string; net: string };
  top_expense_categories: DonutItem[]; anomaly_count: number;
  anomalies: { type: string; message: string }[]; runway: Runway;
}
interface ImportRow { row_no: number; status: string; parsed: { occurred_at: string; kind: string; amount: string; memo: string } | null; suggestion: { category_id?: string } | null; error: string | null }

// ── SVG charts thuần ────────────────────────────────────────────────────────
function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function Donut({ items }: { items: DonutItem[] }) {
  const total = items.reduce((s, i) => s + Number(i.value), 0);
  if (!total) return <EmptyState icon="coin" title="Chưa có chi tiêu kỳ này" sub="Ghi giao dịch để thấy cơ cấu." />;
  const COLORS = ['var(--jade)', 'var(--amber)', 'var(--sky)', '#b085f5', '#f472b6', '#fb923c', '#94a3b8'];
  let angle = 0;
  const top = items.slice(0, 6);
  const rest = items.slice(6).reduce((s, i) => s + Number(i.value), 0);
  const segs = rest > 0 ? [...top, { label: 'Khác', value: String(rest) }] : top;
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg viewBox="0 0 150 150" width="150" role="img" aria-label="Cơ cấu chi theo danh mục">
        {segs.map((s, i) => {
          const frac = Number(s.value) / total;
          const a0 = angle; const a1 = angle + frac * 360; angle = a1;
          const p0 = polar(75, 75, 58, a0); const p1 = polar(75, 75, 58, Math.min(a1, a0 + 359.9));
          const large = a1 - a0 > 180 ? 1 : 0;
          return <path key={s.label} d={`M75 75 L${p0.x} ${p0.y} A58 58 0 ${large} 1 ${p1.x} ${p1.y} Z`}
            fill={COLORS[i % COLORS.length]} opacity=".85" stroke="var(--s1)" strokeWidth="1.5" />;
        })}
        <circle cx="75" cy="75" r="34" fill="var(--s1)" />
        <text x="75" y="72" textAnchor="middle" fontSize="11" fill="var(--mut)" fontFamily="var(--fm)">Tổng chi</text>
        <text x="75" y="86" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--txt)" fontFamily="var(--fm)">{kbig(total)}</text>
      </svg>
      <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
        {segs.map((s, i) => (
          <div key={s.label} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[i % COLORS.length] }} />
            <span style={{ color: 'var(--mut)' }}>{s.label}</span>
            <b style={{ fontFamily: 'var(--fm)' }}>{vnd(s.value)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function Candles({ data }: { data: Candle[] }) {
  if (!data.length) return <EmptyState icon="coin" title="Chưa có biến động" sub="Ghi giao dịch để thấy nến dòng tiền." />;
  const W = 340, H = 130, P = 6;
  const lo = Math.min(...data.map((d) => Number(d.low)));
  const hi = Math.max(...data.map((d) => Number(d.high)));
  const span = Math.max(1, hi - lo);
  const y = (v: number) => P + (1 - (v - lo) / span) * (H - 2 * P);
  const bw = Math.max(3, Math.min(14, ((W - 2 * P) / data.length) * 0.6));
  return (
    <svg viewBox={`0 0 ${W} ${H + 14}`} width="100%" role="img" aria-label="Nến số dư theo ngày">
      <text x={P} y={10} fontSize="9" fill="var(--mut)" fontFamily="var(--fm)">{kbig(hi)}</text>
      <text x={P} y={H - 2} fontSize="9" fill="var(--mut)" fontFamily="var(--fm)">{kbig(lo)}</text>
      {data.map((d, i) => {
        const cx = P + ((i + 0.5) * (W - 2 * P)) / data.length;
        const o = Number(d.open), c = Number(d.close);
        const up = c >= o;
        const col = up ? 'var(--jade)' : 'var(--amber)';
        const by0 = y(Math.max(o, c)), by1 = y(Math.min(o, c));
        return (
          <g key={d.day}>
            <line x1={cx} x2={cx} y1={y(Number(d.high))} y2={y(Number(d.low))} stroke={col} strokeWidth="1.4" opacity=".8" />
            <rect x={cx - bw / 2} y={by0} width={bw} height={Math.max(2, by1 - by0)} rx="1.5" fill={col} opacity=".9" />
          </g>
        );
      })}
      <text x={P} y={H + 11} fontSize="9" fill="var(--mut)" fontFamily="var(--fm)">{data[0]!.day}</text>
      <text x={W - P} y={H + 11} fontSize="9" fill="var(--mut)" textAnchor="end" fontFamily="var(--fm)">{data[data.length - 1]!.day}</text>
    </svg>
  );
}

function Waterfall({ steps }: { steps: WfStep[] }) {
  const W = 340, H = 140, P = 8;
  let run = 0;
  const bars = steps.map((s) => {
    const v = Number(s.value);
    if (s.kind === 'base' || s.kind === 'total') { const b = { from: 0, to: v, s }; run = v; return b; }
    const from = run; run = run + v; return { from, to: run, s };
  });
  const lo = Math.min(0, ...bars.map((b) => Math.min(b.from, b.to)));
  const hi = Math.max(1, ...bars.map((b) => Math.max(b.from, b.to)));
  const y = (v: number) => P + (1 - (v - lo) / (hi - lo)) * (H - 2 * P);
  const bw = (W - 2 * P) / steps.length - 8;
  return (
    <svg viewBox={`0 0 ${W} ${H + 26}`} width="100%" role="img" aria-label="Waterfall dòng tiền tháng">
      {bars.map((b, i) => {
        const x = P + i * ((W - 2 * P) / steps.length) + 4;
        const col = b.s.kind === 'up' ? 'var(--jade)' : b.s.kind === 'down' ? 'var(--amber)' : 'var(--sky)';
        const y0 = y(Math.max(b.from, b.to)), y1 = y(Math.min(b.from, b.to));
        return (
          <g key={b.s.label}>
            <rect x={x} y={y0} width={bw} height={Math.max(2, y1 - y0)} rx="4" fill={col} opacity=".85" />
            <text x={x + bw / 2} y={y0 - 3} fontSize="8.5" textAnchor="middle" fill="var(--txt)" fontFamily="var(--fm)">{kbig(b.s.value)}</text>
            <text x={x + bw / 2} y={H + 10} fontSize="8" textAnchor="middle" fill="var(--mut)">{b.s.label.split(' ')[0]}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Heatmap({ cells }: { cells: HeatCell[] }) {
  if (!cells.length) return null;
  const max = Math.max(1, ...cells.map((c) => Number(c.out)));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 18px)', gap: 4 }}>
      {cells.map((c) => {
        const d = new Date(`${c.day}T00:00:00Z`);
        const op = 0.12 + 0.88 * (Number(c.out) / max);
        return <div key={c.day} title={`${c.day}: −${vnd(c.out)}đ`}
          style={{ width: 18, height: 18, borderRadius: 4, background: 'var(--amber)', opacity: Number(c.out) > 0 ? op : 0.08, gridColumnStart: d.getUTCDay() + 1 }} />;
      })}
    </div>
  );
}

function BudgetBar({ b }: { b: BudgetItem }) {
  const pct = Math.min(100, b.pct_used);
  const col = b.exceeded ? 'var(--rose, #e5484d)' : b.at_risk ? 'var(--amber)' : 'var(--jade)';
  return (
    <div style={{ display: 'grid', gap: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span>{b.jar_code ? `🏺 ${b.name}` : b.name}</span>
        <span style={{ fontFamily: 'var(--fm)', color: b.exceeded ? 'var(--rose, #e5484d)' : 'var(--mut)' }}>
          {vnd(b.spent)} / {vnd(b.limit)}đ {b.exceeded ? '· VƯỢT' : b.at_risk ? '· nguy cơ' : ''}
        </span>
      </div>
      <div style={{ height: 10, borderRadius: 5, background: 'var(--s2)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: col, opacity: 0.85 }} />
      </div>
    </div>
  );
}

// ── Trang chính ─────────────────────────────────────────────────────────────
export default function SoulWalletPage() {
  const [tab, setTab] = useState<'tq' | 'so' | 'hu' | 'no' | 'dk' | 'im'>('tq');
  const [locked, setLocked] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const flash = (t: string, ok = true) => { setMsg({ t, ok }); setTimeout(() => setMsg(null), 4200); };
  const guard = (e: unknown) => {
    const m = String((e as Error)?.message ?? e);
    if (/kích hoạt|hết hạn thuê/.test(m)) { setLocked(true); return; }
    flash(m, false);
  };

  const [accs, setAccs] = useState<Acc[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [exec, setExec] = useState<Exec | null>(null);
  const [narr, setNarr] = useState('');
  const [wf, setWf] = useState<WfStep[]>([]);
  const [donut, setDonut] = useState<DonutItem[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [heat, setHeat] = useState<HeatCell[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [budgets, setBudgets] = useState<BudgetItem[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [aging, setAging] = useState<Aging | null>(null);
  const [recurs, setRecurs] = useState<Recur[]>([]);

  const loadBase = useCallback(async () => {
    try {
      const [a, c] = await Promise.all([
        api<{ data: Acc[] }>(`${B}/accounts`),
        api<{ data: Cat[] }>(`${B}/categories`),
      ]);
      setAccs(a.data); setCats(c.data); setLocked(false);
      if (!c.data.length) { await api(`${B}/categories/seed`, { method: 'POST' }); const c2 = await api<{ data: Cat[] }>(`${B}/categories`); setCats(c2.data); }
    } catch (e) { guard(e); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTab = useCallback(async (t: typeof tab) => {
    try {
      if (t === 'tq') {
        const [e, n, w, d, cd, h] = await Promise.all([
          api<{ data: Exec }>(`${B}/reports/executive`),
          api<{ data: { text: string } }>(`${B}/reports/narrate`),
          api<{ data: { steps: WfStep[] } }>(`${B}/charts/waterfall`),
          api<{ data: DonutItem[] }>(`${B}/charts/donut?kind=expense`),
          api<{ data: Candle[] }>(`${B}/charts/candles`),
          api<{ data: HeatCell[] }>(`${B}/charts/heatmap`),
        ]);
        setExec(e.data); setNarr(n.data.text); setWf(w.data.steps); setDonut(d.data);
        setCandles(cd.data.slice(-30)); setHeat(h.data);
      }
      if (t === 'so') {
        const r = await api<{ data: Tx[] }>(`${B}/transactions/search`, { method: 'POST', body: JSON.stringify({ limit: 20 }) });
        setTxs(r.data);
      }
      if (t === 'hu') {
        const [b, g] = await Promise.all([
          api<{ data: { budgets: BudgetItem[] } }>(`${B}/budgets/status`),
          api<{ data: Goal[] }>(`${B}/goals`),
        ]);
        setBudgets(b.data.budgets); setGoals(g.data);
      }
      if (t === 'no') {
        const [d, a] = await Promise.all([
          api<{ data: Debt[] }>(`${B}/debts?status=open`),
          api<{ data: Aging }>(`${B}/debts/aging`),
        ]);
        setDebts(d.data); setAging(a.data);
      }
      if (t === 'dk') {
        const r = await api<{ data: Recur[] }>(`${B}/recurring/upcoming?days=45`);
        setRecurs(r.data);
      }
    } catch (e) { guard(e); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadBase(); }, [loadBase]);
  useEffect(() => { loadTab(tab); }, [tab, loadTab]);

  // ── forms state ──
  const [fTx, setFTx] = useState({ kind: 'expense', amount: '', memo: '', account_id: '', category_id: '' });
  const [fTf, setFTf] = useState({ from: '', to: '', amount: '' });
  const [fJar, setFJar] = useState('');
  const [fGoal, setFGoal] = useState({ goal_id: '', amount: '', from: '' });
  const [fDebt, setFDebt] = useState({ contact_name: '', direction: 'receivable', principal: '', due_date: '', account_id: '' });
  const [fPay, setFPay] = useState({ debt_id: '', amount: '', account_id: '' });
  const [fRec, setFRec] = useState({ name: '', amount: '', freq: 'monthly', next_run_at: today(), auto_post: true, account_id: '' });
  const [imp, setImp] = useState<{ job_id: string; rows: ImportRow[]; stats: string } | null>(null);
  const [impPreset, setImpPreset] = useState('vcb');
  const [impAcc, setImpAcc] = useState('');

  const [fAcc, setFAcc] = useState({ name: '', type: 'cash', opening_balance: '' });
  const addAcc = async () => {
    if (!fAcc.name) { flash('Nhập tên ví trước nhé', false); return; }
    try {
      await api(`${B}/accounts`, { method: 'POST', body: JSON.stringify({ name: fAcc.name, type: fAcc.type, opening_balance: fAcc.opening_balance || '0' }) });
      flash(`Đã tạo ví ${fAcc.name}`); setFAcc({ name: '', type: 'cash', opening_balance: '' }); loadBase();
    } catch (e) { guard(e); }
  };
  const [fNewGoal, setFNewGoal] = useState({ name: '', target: '' });
  const addGoal = async () => {
    if (!fNewGoal.name || !fNewGoal.target) { flash('Nhập tên hũ + số tiền mục tiêu', false); return; }
    try {
      await api(`${B}/goals`, { method: 'POST', body: JSON.stringify({ name: fNewGoal.name, target: fNewGoal.target }) });
      flash(`Đã tạo hũ ${fNewGoal.name}`); setFNewGoal({ name: '', target: '' }); loadTab('hu');
    } catch (e) { guard(e); }
  };
  const submitTx = async () => {
    if (!fTx.amount || !fTx.account_id) { flash(accs.length ? 'Nhập số tiền + chọn ví đã nhé' : 'Chưa có ví nào — tạo ví mới ở thẻ bên dưới trước', false); return; }
    try {
      const r = await api<{ data: { docNo: string } }>(`${B}/transactions`, {
        method: 'POST',
        body: JSON.stringify({ kind: fTx.kind, occurred_at: nowIso(), account_id: fTx.account_id, amount: fTx.amount, memo: fTx.memo || undefined, category_id: fTx.category_id || undefined }),
      });
      flash(`Đã ghi ${fTx.kind === 'income' ? 'thu' : 'chi'} ${vnd(fTx.amount)}đ (${r.data.docNo})`);
      setFTx({ ...fTx, amount: '', memo: '' }); loadTab('so'); loadBase();
    } catch (e) { guard(e); }
  };
  const submitTf = async () => {
    if (!fTf.from || !fTf.to || !fTf.amount) { flash(accs.length >= 2 ? 'Chọn ví nguồn + ví đích + số tiền' : 'Cần ít nhất 2 ví để chuyển — tạo thêm ví ở thẻ dưới', false); return; }
    if (fTf.from === fTf.to) { flash('Ví nguồn và ví đích phải khác nhau', false); return; }
    try {
      await api(`${B}/transfer`, { method: 'POST', body: JSON.stringify({ occurred_at: nowIso(), from_account_id: fTf.from, to_account_id: fTf.to, amount: fTf.amount }) });
      flash(`Đã chuyển ${vnd(fTf.amount)}đ giữa 2 ví`); setFTf({ from: '', to: '', amount: '' }); loadTab('so'); loadBase();
    } catch (e) { guard(e); }
  };
  const reverse = async (id: string) => {
    try { await api(`${B}/transactions/reverse`, { method: 'POST', body: JSON.stringify({ id }) }); flash('Đã đảo bút toán'); loadTab('so'); loadBase(); } catch (e) { guard(e); }
  };
  const applyJars = async () => {
    if (!fJar) { flash('Nhập thu nhập tháng trước đã (VD: 20000000)', false); return; }
    try {
      await api(`${B}/budgets/six-jars`, { method: 'POST', body: JSON.stringify({ monthly_income: fJar }) });
      flash('Đã chia 6 Hũ'); setFJar(''); loadTab('hu');
    } catch (e) { guard(e); }
  };
  const contribute = async () => {
    if (!fGoal.goal_id || !fGoal.amount) { flash(goals.length ? 'Chọn hũ + nhập số tiền nạp' : 'Chưa có hũ mục tiêu — tạo hũ ngay bên dưới trước', false); return; }
    try {
      await api(`${B}/goals/contribute`, { method: 'POST', body: JSON.stringify({ goal_id: fGoal.goal_id, amount: fGoal.amount, from_account_id: fGoal.from || undefined }) });
      flash('Đã nạp hũ mục tiêu'); setFGoal({ goal_id: '', amount: '', from: '' }); loadTab('hu'); loadBase();
    } catch (e) { guard(e); }
  };
  const addDebt = async () => {
    if (!fDebt.contact_name || !fDebt.principal) { flash('Nhập tên người nợ/chủ nợ + số tiền gốc', false); return; }
    try {
      await api(`${B}/debts`, { method: 'POST', body: JSON.stringify({ ...fDebt, start_date: today(), due_date: fDebt.due_date || undefined, account_id: fDebt.account_id || undefined }) });
      flash('Đã ghi khoản nợ'); setFDebt({ contact_name: '', direction: 'receivable', principal: '', due_date: '', account_id: '' }); loadTab('no'); loadBase();
    } catch (e) { guard(e); }
  };
  const payDebt = async () => {
    if (!fPay.debt_id || !fPay.amount) { flash('Chọn khoản nợ + nhập số tiền', false); return; }
    try {
      await api(`${B}/debts/pay`, { method: 'POST', body: JSON.stringify({ debt_id: fPay.debt_id, amount: fPay.amount, paid_at: today(), account_id: fPay.account_id || undefined }) });
      flash('Đã ghi trả/thu nợ'); setFPay({ debt_id: '', amount: '', account_id: '' }); loadTab('no'); loadBase();
    } catch (e) { guard(e); }
  };
  const addRecur = async () => {
    if (!fRec.name || !fRec.amount || !fRec.account_id) { flash('Nhập tên + số tiền + chọn ví cho khoản định kỳ', false); return; }
    try {
      await api(`${B}/recurring`, { method: 'POST', body: JSON.stringify({ ...fRec, kind: 'subscription', interval_n: 1, active: true }) });
      flash('Đã lưu khoản định kỳ'); loadTab('dk');
    } catch (e) { guard(e); }
  };
  const runRecur = async () => {
    try {
      const r = await api<{ data: { posted: number; drafts: number } }>(`${B}/recurring/run`, { method: 'POST', body: JSON.stringify({}) });
      flash(`Đã chạy kỳ: ${r.data.posted} ghi thẳng, ${r.data.drafts} draft`); loadTab('dk'); loadBase();
    } catch (e) { guard(e); }
  };
  const uploadFile = async (f: File) => {
    try {
      const b64: string = await new Promise((res, rej) => {
        const rd = new FileReader();
        rd.onload = () => res(String(rd.result).split(',')[1] ?? '');
        rd.onerror = rej; rd.readAsDataURL(f);
      });
      const j = await api<{ data: { job_id: string; total: number; ready: number; duplicates: number; errors: number } }>(`${B}/import`, {
        method: 'POST', body: JSON.stringify({ file_name: f.name, preset: impPreset, account_id: impAcc, content_base64: b64 }),
      });
      const pv = await api<{ data: { rows: ImportRow[] } }>(`${B}/import/preview`, { method: 'POST', body: JSON.stringify({ job_id: j.data.job_id }) });
      setImp({ job_id: j.data.job_id, rows: pv.data.rows, stats: `${j.data.ready} sẵn sàng · ${j.data.duplicates} trùng · ${j.data.errors} lỗi` });
    } catch (e) { guard(e); }
  };
  const commitImp = async () => {
    if (!imp) return;
    try {
      const r = await api<{ data: { imported: number; skipped: number } }>(`${B}/import/commit`, { method: 'POST', body: JSON.stringify({ job_id: imp.job_id, skip_duplicates: true }) });
      flash(`Import xong: ${r.data.imported} vào sổ, ${r.data.skipped} bỏ qua`); setImp(null); loadBase();
    } catch (e) { guard(e); }
  };

  if (locked) return <Shell><ModuleLocked name="Soul-Wallet — Ví Cá Nhân" id="soul-wallet" /></Shell>;

  const expCats = cats.filter((c) => c.kind === 'expense');
  const sel = { padding: '7px 9px', borderRadius: 8, background: 'var(--s2)', border: '1px solid var(--bd)', color: 'var(--txt)', fontSize: 13 } as const;
  const inp = sel;
  const btn = { padding: '8px 14px', borderRadius: 8, background: 'var(--jade)', color: '#04231f', fontWeight: 700, border: 'none', cursor: 'pointer', fontSize: 13 } as const;
  const card = { background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 14, padding: 14 } as const;

  return (
    <Shell wide>
      {/* paddingBottom: chừa chỗ cho bottom-nav mobile (fixed 78px) + safe-area, tránh che form 'Hũ mục tiêu' */}
      <div style={{ display: 'grid', gap: 14, paddingBottom: 'calc(96px + env(safe-area-inset-bottom, 0px))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>👛 Soul-Wallet — Ví Cá Nhân</h1>
          {msg && <span className={`chip chip-${msg.ok ? 'jade' : 'amber'}`}>{msg.t}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {([['tq', 'Tổng quan'], ['so', 'Sổ tiền'], ['hu', 'Hũ & Mục tiêu'], ['no', 'Sổ nợ'], ['dk', 'Định kỳ'], ['im', 'Import sao kê']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{ ...btn, background: tab === k ? 'var(--jade)' : 'var(--s2)', color: tab === k ? '#04231f' : 'var(--txt)' }}>{label}</button>
          ))}
        </div>

        {tab === 'tq' && exec && (
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              {[
                ['Tài sản ròng', exec.net_worth.net, 'sky'],
                ['Tiền lỏng', exec.liquid, 'jade'],
                ['Thu tháng', exec.this_month.income, 'jade'],
                ['Chi tháng', exec.this_month.expense, 'amber'],
                ['Ròng tháng', exec.this_month.net, Number(exec.this_month.net) >= 0 ? 'jade' : 'amber'],
              ].map(([label, v, c]) => (
                <div key={label as string} style={card}>
                  <div style={{ fontSize: 11.5, color: 'var(--mut)' }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--fm)', color: `var(--${c})` }}>{vnd(v as string)}đ</div>
                </div>
              ))}
              <div style={card}>
                <div style={{ fontSize: 11.5, color: 'var(--mut)' }}>Runway</div>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--fm)', color: exec.runway.will_run_dry ? 'var(--rose, #e5484d)' : 'var(--jade)' }}>
                  {exec.runway.runway_days === null ? 'Dòng tiền dương ∞' : `~${exec.runway.runway_days} ngày`}
                </div>
              </div>
            </div>
            <div style={{ ...card, whiteSpace: 'pre-line', fontSize: 13.5, lineHeight: 1.65 }}>{narr}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
              <div style={card}><h3 style={{ marginTop: 0, fontSize: 14 }}>Waterfall dòng tiền tháng</h3><Waterfall steps={wf} /></div>
              <div style={card}><h3 style={{ marginTop: 0, fontSize: 14 }}>Cơ cấu chi</h3><Donut items={donut} /></div>
              <div style={card}><h3 style={{ marginTop: 0, fontSize: 14 }}>Nến số dư (30 ngày)</h3><Candles data={candles} /></div>
              <div style={card}><h3 style={{ marginTop: 0, fontSize: 14 }}>Heatmap ngày đốt tiền</h3><Heatmap cells={heat} /></div>
            </div>
            {exec.anomalies.length > 0 && (
              <div style={card}>
                <h3 style={{ marginTop: 0, fontSize: 14 }}>👁 Bất thường ({exec.anomaly_count})</h3>
                {exec.anomalies.map((a, i) => <div key={i} style={{ fontSize: 12.5, color: 'var(--mut)', padding: '3px 0' }}>• {a.message}</div>)}
              </div>
            )}
          </div>
        )}

        {tab === 'so' && (
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ ...card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <b style={{ fontSize: 13 }}>✍️ Ghi thu chi:</b>
              <select style={sel} value={fTx.kind} onChange={(e) => setFTx({ ...fTx, kind: e.target.value })}>
                <option value="expense">Chi</option><option value="income">Thu</option>
                <option value="refund">Hoàn</option><option value="fee">Phí</option>
              </select>
              <input style={inp} placeholder="Số tiền (VND)" value={fTx.amount} onChange={(e) => setFTx({ ...fTx, amount: e.target.value })} />
              <input style={{ ...inp, minWidth: 180 }} placeholder="Ghi chú" value={fTx.memo} onChange={(e) => setFTx({ ...fTx, memo: e.target.value })} />
              <select style={sel} value={fTx.account_id} onChange={(e) => setFTx({ ...fTx, account_id: e.target.value })}>
                <option value="">— Ví —</option>{accs.map((a) => <option key={a.id} value={a.id}>{a.name} ({kbig(a.balance)})</option>)}
              </select>
              <select style={sel} value={fTx.category_id} onChange={(e) => setFTx({ ...fTx, category_id: e.target.value })}>
                <option value="">— Danh mục —</option>{(fTx.kind === 'income' ? cats.filter((c) => c.kind === 'income') : expCats).map((c) => <option key={c.id} value={c.id}>{c.parentId ? '· ' : ''}{c.name}</option>)}
              </select>
              <button style={btn} onClick={submitTx}>Ghi sổ</button>
            </div>
            <div style={{ ...card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <b style={{ fontSize: 13 }}>Chuyển ví:</b>
              <select style={sel} value={fTf.from} onChange={(e) => setFTf({ ...fTf, from: e.target.value })}>
                <option value="">— Từ —</option>{accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <select style={sel} value={fTf.to} onChange={(e) => setFTf({ ...fTf, to: e.target.value })}>
                <option value="">— Đến —</option>{accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <input style={inp} placeholder="Số tiền" value={fTf.amount} onChange={(e) => setFTf({ ...fTf, amount: e.target.value })} />
              <button style={btn} onClick={submitTf}>Chuyển</button>
            </div>
            <div style={{ ...card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <b style={{ fontSize: 13 }}>➕ Tạo ví mới:</b>
              <input style={inp} placeholder="Tên ví (VD: Tiền mặt)" value={fAcc.name} onChange={(e) => setFAcc({ ...fAcc, name: e.target.value })} />
              <select style={sel} value={fAcc.type} onChange={(e) => setFAcc({ ...fAcc, type: e.target.value })}>
                <option value="cash">Tiền mặt</option><option value="bank">Ngân hàng</option><option value="ewallet">Ví điện tử</option>
                <option value="credit_card">Thẻ tín dụng</option><option value="savings">Tiết kiệm</option><option value="investment">Đầu tư</option>
              </select>
              <input style={inp} placeholder="Số dư đầu (VD: 500000)" value={fAcc.opening_balance} onChange={(e) => setFAcc({ ...fAcc, opening_balance: e.target.value })} />
              <button style={btn} onClick={addAcc}>Tạo ví</button>
              {accs.length === 0 && <span style={{ fontSize: 11.5, color: 'var(--amber, #d9a441)' }}>Chưa có ví nào — tạo ví trước rồi mới ghi sổ được nha</span>}
            </div>
            <div style={card}>
              <h3 style={{ marginTop: 0, fontSize: 14 }}>Giao dịch gần nhất</h3>
              {txs.length === 0 ? <EmptyState icon="coin" title="Sổ trống" sub="Ghi khoản thu/chi đầu tiên ở trên." /> : (
                <div style={{ display: 'grid', gap: 4 }}>
                  {txs.map((t) => {
                    const rev = t.status === 'reversed';
                    const inc = t.kind === 'income' || t.kind === 'refund';
                    const tf = t.kind === 'transfer';
                    const icon = tf ? '🔁' : inc ? '💰' : t.kind === 'fee' ? '🧧' : '🛒';
                    const kindVi = tf ? 'Chuyển ví' : inc ? (t.kind === 'refund' ? 'Hoàn tiền' : 'Thu') : t.kind === 'fee' ? 'Phí' : 'Chi';
                    const accName = accs.find((a) => a.id === t.accountId)?.name ?? '';
                    const toName = tf ? (accs.find((a) => a.id === t.counterAccountId)?.name ?? '') : '';
                    const catName = cats.find((c) => c.id === t.categoryId)?.name ?? '';
                    const title = t.memo || catName || kindVi;
                    const subParts = [t.occurredAt.slice(5, 10).split('-').reverse().join('/'), tf ? `${accName} → ${toName}` : accName, !tf && catName && t.memo ? catName : ''].filter(Boolean);
                    const amtColor = rev ? 'var(--mut)' : tf ? 'var(--sky)' : inc ? 'var(--jade)' : '#e07a5f';
                    const sign = tf ? '' : inc ? '+' : '−';
                    return (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 2px', borderTop: '1px solid var(--bd)', opacity: rev ? 0.5 : 1 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--s2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>{icon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}{rev ? ' (đã đảo)' : t.status === 'draft' ? ' (nháp)' : ''}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--mut)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subParts.join(' · ')}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontFamily: 'var(--fm)', fontWeight: 700, fontSize: 13.5, color: amtColor }}>{sign}{vnd(t.amount)}đ</div>
                          <div style={{ fontSize: 10.5, color: 'var(--mut)' }}>{kindVi}</div>
                        </div>
                        {t.status === 'posted' && <button title={`Hoàn tác bút toán ${t.docNo}`} style={{ ...btn, background: 'var(--s2)', color: 'var(--mut)', padding: '4px 9px', fontSize: 11.5, flexShrink: 0 }} onClick={() => reverse(t.id)}>Hoàn tác</button>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'hu' && (
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ ...card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <b style={{ fontSize: 13 }}>Chia 6 Hũ từ thu nhập tháng:</b>
              <input style={inp} placeholder="VD: 20000000" value={fJar} onChange={(e) => setFJar(e.target.value)} />
              <button style={btn} onClick={applyJars}>Áp 6 Hũ</button>
              <span style={{ fontSize: 11.5, color: 'var(--mut)' }}>NEC 55 · FFA 10 · EDU 10 · LTS 10 · PLAY 10 · GIVE 5</span>
            </div>
            <div style={{ ...card, display: 'grid', gap: 12 }}>
              <h3 style={{ margin: 0, fontSize: 14 }}>Ngân sách kỳ này</h3>
              {budgets.length === 0 ? <EmptyState icon="coin" title="Chưa có ngân sách" sub="Áp 6 Hũ hoặc tạo envelope theo danh mục." /> :
                budgets.map((b) => <BudgetBar key={b.id} b={b} />)}
            </div>
            <div style={{ ...card, display: 'grid', gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: 14 }}>Hũ mục tiêu</h3>
              {goals.length === 0 && <EmptyState icon="coin" title="Chưa có hũ mục tiêu" sub="Tạo hũ mới ngay bên dưới (VD: Mua xe — 50 triệu)." />}
              {goals.map((g) => (
                <div key={g.id} style={{ display: 'grid', gap: 3 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span>{g.reached ? '🎉 ' : '🎯 '}{g.name}</span>
                    <span style={{ fontFamily: 'var(--fm)', color: 'var(--mut)' }}>{vnd(g.saved)} / {vnd(g.target)}đ ({g.pct}%)</span>
                  </div>
                  <div style={{ height: 10, borderRadius: 5, background: 'var(--s2)', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, g.pct)}%`, height: '100%', background: 'var(--sky)', opacity: 0.9 }} />
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select style={sel} value={fGoal.goal_id} onChange={(e) => setFGoal({ ...fGoal, goal_id: e.target.value })}>
                  <option value="">— Hũ —</option>{goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <input style={inp} placeholder="Số tiền nạp" value={fGoal.amount} onChange={(e) => setFGoal({ ...fGoal, amount: e.target.value })} />
                <select style={sel} value={fGoal.from} onChange={(e) => setFGoal({ ...fGoal, from: e.target.value })}>
                  <option value="">— Trừ từ ví (tùy chọn) —</option>{accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <button style={btn} onClick={contribute}>Nạp hũ</button>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid var(--bd)', paddingTop: 10 }}>
                <b style={{ fontSize: 13 }}>➕ Tạo hũ mới:</b>
                <input style={inp} placeholder="Tên hũ (VD: Mua xe)" value={fNewGoal.name} onChange={(e) => setFNewGoal({ ...fNewGoal, name: e.target.value })} />
                <input style={inp} placeholder="Mục tiêu (VD: 50000000)" value={fNewGoal.target} onChange={(e) => setFNewGoal({ ...fNewGoal, target: e.target.value })} />
                <button style={btn} onClick={addGoal}>Tạo hũ</button>
              </div>
            </div>
          </div>
        )}

        {tab === 'no' && (
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ ...card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input style={inp} placeholder="Tên người" value={fDebt.contact_name} onChange={(e) => setFDebt({ ...fDebt, contact_name: e.target.value })} />
              <select style={sel} value={fDebt.direction} onChange={(e) => setFDebt({ ...fDebt, direction: e.target.value })}>
                <option value="receivable">Họ nợ mình</option><option value="payable">Mình nợ họ</option>
              </select>
              <input style={inp} placeholder="Số tiền gốc" value={fDebt.principal} onChange={(e) => setFDebt({ ...fDebt, principal: e.target.value })} />
              <input style={inp} type="date" value={fDebt.due_date} onChange={(e) => setFDebt({ ...fDebt, due_date: e.target.value })} />
              <select style={sel} value={fDebt.account_id} onChange={(e) => setFDebt({ ...fDebt, account_id: e.target.value })}>
                <option value="">— Ví dòng tiền (tùy chọn) —</option>{accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <button style={btn} onClick={addDebt}>Ghi nợ</button>
            </div>
            {aging && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                {(['receivable', 'payable'] as const).map((dir) => (
                  <div key={dir} style={card}>
                    <h3 style={{ marginTop: 0, fontSize: 14 }}>{dir === 'receivable' ? '💰 Người ta nợ MÌNH' : '💸 MÌNH nợ người ta'}</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, fontSize: 10.5, textAlign: 'center' }}>
                      {['not_due', '0-7', '8-30', '31-60', '61-90', '90+'].map((b) => (
                        <div key={b}>
                          <div style={{ color: 'var(--mut)' }}>{b === 'not_due' ? 'chưa hạn' : b}</div>
                          <div style={{ fontFamily: 'var(--fm)', fontWeight: 700, color: b === '90+' && Number(aging[dir][b]) > 0 ? 'var(--rose, #e5484d)' : 'var(--txt)' }}>{kbig(aging[dir][b] ?? '0')}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={card}>
              <h3 style={{ marginTop: 0, fontSize: 14 }}>Khoản nợ đang mở</h3>
              {debts.length === 0 ? <EmptyState icon="coin" title="Sạch nợ" sub="Không có khoản nào đang mở." /> : (
                <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
                  <thead><tr style={{ color: 'var(--mut)', textAlign: 'left' }}><th>Người</th><th>Hướng</th><th style={{ textAlign: 'right' }}>Còn lại</th><th style={{ textAlign: 'right' }}>Lãi dồn</th><th>Hạn</th><th>Quá hạn</th></tr></thead>
                  <tbody>{debts.map((d) => (
                    <tr key={d.id} style={{ borderTop: '1px solid var(--bd)' }}>
                      <td style={{ padding: '6px 0' }}>{d.contact}</td>
                      <td><span className={`chip chip-${d.direction === 'receivable' ? 'jade' : 'amber'}`}>{d.direction === 'receivable' ? 'thu về' : 'phải trả'}</span></td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--fm)', fontWeight: 700 }}>{vnd(d.remaining)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--fm)', color: 'var(--mut)' }}>{vnd(d.interest_accrued)}</td>
                      <td style={{ color: 'var(--mut)' }}>{d.due_date ?? '—'}</td>
                      <td style={{ color: d.overdue_days > 0 ? 'var(--rose, #e5484d)' : 'var(--mut)' }}>{d.overdue_days > 0 ? `${d.overdue_days} ngày` : '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
                <select style={sel} value={fPay.debt_id} onChange={(e) => setFPay({ ...fPay, debt_id: e.target.value })}>
                  <option value="">— Khoản nợ —</option>{debts.map((d) => <option key={d.id} value={d.id}>{d.contact} · còn {kbig(d.remaining)}</option>)}
                </select>
                <input style={inp} placeholder="Số tiền trả/thu" value={fPay.amount} onChange={(e) => setFPay({ ...fPay, amount: e.target.value })} />
                <select style={sel} value={fPay.account_id} onChange={(e) => setFPay({ ...fPay, account_id: e.target.value })}>
                  <option value="">— Ví dòng tiền (tùy chọn) —</option>{accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <button style={btn} onClick={payDebt}>Ghi trả/thu</button>
              </div>
            </div>
          </div>
        )}

        {tab === 'dk' && (
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ ...card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input style={inp} placeholder="Tên (VD: Netflix)" value={fRec.name} onChange={(e) => setFRec({ ...fRec, name: e.target.value })} />
              <input style={inp} placeholder="Số tiền/kỳ" value={fRec.amount} onChange={(e) => setFRec({ ...fRec, amount: e.target.value })} />
              <select style={sel} value={fRec.freq} onChange={(e) => setFRec({ ...fRec, freq: e.target.value })}>
                <option value="monthly">Hàng tháng</option><option value="weekly">Hàng tuần</option>
                <option value="yearly">Hàng năm</option><option value="daily">Hàng ngày</option>
              </select>
              <input style={inp} type="date" value={fRec.next_run_at} onChange={(e) => setFRec({ ...fRec, next_run_at: e.target.value })} />
              <select style={sel} value={fRec.account_id} onChange={(e) => setFRec({ ...fRec, account_id: e.target.value })}>
                <option value="">— Ví —</option>{accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <label style={{ fontSize: 12.5, display: 'flex', gap: 4, alignItems: 'center' }}>
                <input type="checkbox" checked={fRec.auto_post} onChange={(e) => setFRec({ ...fRec, auto_post: e.target.checked })} /> tự ghi
              </label>
              <button style={btn} onClick={addRecur}>Lưu định kỳ</button>
              <button style={{ ...btn, background: 'var(--sky)' }} onClick={runRecur}>Chạy kỳ đến hạn</button>
            </div>
            <div style={card}>
              <h3 style={{ marginTop: 0, fontSize: 14 }}>Sắp trừ tiền (45 ngày)</h3>
              {recurs.length === 0 ? <EmptyState icon="coin" title="Không có khoản định kỳ" sub="Thêm subscription/hóa đơn để hết bị trừ tiền bất ngờ." /> : (
                <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
                  <thead><tr style={{ color: 'var(--mut)', textAlign: 'left' }}><th>Tên</th><th style={{ textAlign: 'right' }}>Số tiền</th><th>Kỳ tới</th><th>Tần suất</th><th></th></tr></thead>
                  <tbody>{recurs.map((r) => (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--bd)' }}>
                      <td style={{ padding: '6px 0' }}>{r.kind === 'income' ? '💵 ' : '🔁 '}{r.name}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--fm)', fontWeight: 700 }}>{vnd(r.amount)}</td>
                      <td>{r.next_run_at}</td>
                      <td style={{ color: 'var(--mut)' }}>{r.freq}{r.auto_post ? ' · tự ghi' : ' · draft'}</td>
                      <td>{r.price_hiked && <span className="chip chip-amber">⬆ tăng giá</span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {tab === 'im' && (
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ ...card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select style={sel} value={impPreset} onChange={(e) => setImpPreset(e.target.value)}>
                {['vcb', 'tcb', 'mb', 'acb', 'bidv', 'generic'].map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
              </select>
              <select style={sel} value={impAcc} onChange={(e) => setImpAcc(e.target.value)}>
                <option value="">— Ví nhận —</option>{accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <input type="file" accept=".xlsx,.csv" disabled={!impAcc}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ''; }} />
              <span style={{ fontSize: 11.5, color: 'var(--mut)' }}>Sao kê .xlsx/.csv — preview trước, không ghi thẳng</span>
            </div>
            {imp && (
              <div style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 14 }}>Preview · {imp.stats}</h3>
                  <button style={btn} onClick={commitImp}>Commit vào sổ (bỏ dòng trùng)</button>
                </div>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginTop: 8 }}>
                  <thead><tr style={{ color: 'var(--mut)', textAlign: 'left' }}><th>#</th><th>Ngày</th><th>Loại</th><th style={{ textAlign: 'right' }}>Số tiền</th><th>Nội dung</th><th>Trạng thái</th></tr></thead>
                  <tbody>{imp.rows.map((r) => (
                    <tr key={r.row_no} style={{ borderTop: '1px solid var(--bd)', opacity: r.status === 'pending' ? 1 : 0.55 }}>
                      <td style={{ padding: '5px 0' }}>{r.row_no}</td>
                      <td>{r.parsed?.occurred_at ?? '—'}</td>
                      <td>{r.parsed ? (r.parsed.kind === 'income' ? '↑ thu' : '↓ chi') : '—'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--fm)' }}>{r.parsed ? vnd(r.parsed.amount) : '—'}</td>
                      <td style={{ color: 'var(--mut)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.parsed?.memo}</td>
                      <td><span className={`chip chip-${r.status === 'pending' ? 'jade' : r.status === 'skipped' ? 'amber' : 'mut'}`}>{r.status === 'pending' ? 'sẵn sàng' : r.status === 'skipped' ? 'trùng' : r.error ? 'lỗi' : r.status}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
