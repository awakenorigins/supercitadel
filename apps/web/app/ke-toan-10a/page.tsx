'use client';
// Kế Toán 10A — trang nghiệp vụ. CSS token thuần + component Shell/ModuleLocked có sẵn (khuôn trang accounting R2).
// Copy vào: apps/web/app/ke-toan-10a/page.tsx  ·  Sau khi copy chạy: pnpm --filter web typecheck
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { ModuleLocked } from '../../components/ModuleGate';
import { EmptyState } from '../../components/EmptyState';
import { api, getSession, API } from '../../lib/api';

interface Receipt { id: string; docNo: string; docDate: string; amount: string; reason: string | null; status: string; payerName?: string | null; payeeName?: string | null }
interface Inv { id: string; docNo: string; docDate: string; dueDate: string | null; total: string; amountPaid: string; status: string; contactName?: string | null }
interface PL { income: { code: string; name: string; amount: string }[]; expense: { code: string; name: string; amount: string }[]; totalIncome: string; totalExpense: string; netProfit: string }
interface Dash { cash: string; receivables: string; payables: string; revenue: string; expense: string; profit: string }
interface Asset { id: string; code: string; name: string; cost: string; accumulatedDepreciation: string; status: string }
interface Bva { rows: { accountCode: string; accountName: string; budget: string; actual: string; variance: string; overBudget: boolean }[]; totalBudget: string; totalActual: string }

const today = () => new Date().toISOString().slice(0, 10);
const vnd = (n: number | string) => Math.round(Number(n)).toLocaleString('vi-VN');
const STATUS_VN: Record<string, string> = { POSTED: 'Đã ghi sổ', DRAFT: 'Nháp', REVERSED: 'Đã đảo', PAID: 'Đã tất toán', PARTLY_PAID: 'Thu 1 phần', UNPAID: 'Chưa thu', ACTIVE: 'Đang KH', FULLY_DEPRECIATED: 'Hết KH', OPEN: 'Còn dư', APPLIED: 'Đã cấn trừ' };
const STATUS_BDG: Record<string, string> = { POSTED: 'jade', PAID: 'jade', PARTLY_PAID: 'sky', UNPAID: 'amber', DRAFT: 'mut', REVERSED: 'mut', ACTIVE: 'sky', FULLY_DEPRECIATED: 'mut', OPEN: 'amber', APPLIED: 'jade' };
const Badge = ({ s }: { s: string }) => <span className={`chip chip-${STATUS_BDG[s] ?? 'mut'}`}>{STATUS_VN[s] ?? s}</span>;

/** Bar chart SVG thuần — doanh thu vs chi phí theo tài khoản (KQKD kỳ). */
function PLBarChart({ pl }: { pl: PL }) {
  const rows = [
    ...pl.income.map((r) => ({ name: `${r.code} ${r.name}`, amount: Number(r.amount), kind: 'thu' as const })),
    ...pl.expense.map((r) => ({ name: `${r.code} ${r.name}`, amount: Number(r.amount), kind: 'chi' as const })),
  ].filter((r) => r.amount > 0);
  if (!rows.length) return <EmptyState icon="coin" title="Chưa có phát sinh trong kỳ" sub="Ghi phiếu thu/chi hoặc hóa đơn để xem lãi lỗ." />;
  const max = Math.max(...rows.map((r) => r.amount), 1);
  const BH = 20, GAP = 10, LBL = 12;
  const H = rows.length * (BH + GAP + LBL) + 4;
  return (
    <svg viewBox={`0 0 320 ${H}`} width="100%" role="img" aria-label="Biểu đồ lãi lỗ theo tài khoản" style={{ display: 'block' }}>
      {rows.map((r, i) => {
        const y = i * (BH + GAP + LBL);
        const w = Math.max(4, (r.amount / max) * 318);
        const col = r.kind === 'thu' ? 'var(--jade)' : 'var(--amber)';
        return (
          <g key={r.kind + r.name}>
            <text x="0" y={y + 10} fontSize="10" fill="var(--mut)" fontFamily="var(--fm)">{r.kind === 'thu' ? '+' : '−'} {r.name}</text>
            <rect x="0" y={y + LBL + 2} width="318" height={BH} rx="5" fill="var(--s2)" />
            <rect x="0" y={y + LBL + 2} width={w} height={BH} rx="5" fill={col} opacity=".82" />
            <text x={w > 240 ? w - 6 : w + 6} y={y + LBL + 16} fontSize="10.5" fontWeight="700"
              fill={w > 240 ? '#04231f' : col} textAnchor={w > 240 ? 'end' : 'start'} fontFamily="var(--fm)">{vnd(r.amount)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function KeToan10aPage() {
  const router = useRouter();
  const B = '/api/v1/ke-toan-10a';
  const [tab, setTab] = useState<'quy' | 'hd' | 'vh' | 'pt' | 'bc'>('quy');
  const [locked, setLocked] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const flash = (t: string, ok = true) => { setMsg({ t, ok }); setTimeout(() => setMsg(null), 5000); };

  const [dash, setDash] = useState<Dash | null>(null);
  const [tbOk, setTbOk] = useState<boolean | null>(null);
  const [receipts, setReceipts] = useState<Receipt[] | null>(null);
  const [pays, setPays] = useState<Receipt[] | null>(null);
  const [invs, setInvs] = useState<Inv[] | null>(null);
  const [bills, setBills] = useState<Inv[] | null>(null);
  const [advs, setAdvs] = useState<any[] | null>(null);
  const [tpls, setTpls] = useState<any[] | null>(null);
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [bva, setBva] = useState<Bva | null>(null);
  const [recon, setRecon] = useState<any | null>(null);
  const [pl, setPl] = useState<PL | null>(null);

  const load = useCallback(async () => {
    try {
      // Auto-setup lần đầu: chưa có TK → seed TT133, khách không cần làm gì.
      const a = await api<{ accounts: any[] }>(`${B}/accounts`);
      if (a.accounts.length === 0) { await api(`${B}/setup`, { method: 'POST', body: JSON.stringify({}) }); flash('Đã khởi tạo hệ thống tài khoản TT133 ✓'); }
      setLocked(false);
      api<Dash>(`${B}/reports/dashboard`).then(setDash).catch(() => {});
      api<{ balanced: boolean }>(`${B}/reports/trial-balance`).then((d) => setTbOk(d.balanced)).catch(() => {});
      api<{ receipts: Receipt[] }>(`${B}/receipts`).then((d) => setReceipts(d.receipts)).catch(() => {});
      api<{ payments: Receipt[] }>(`${B}/payments`).then((d) => setPays(d.payments)).catch(() => {});
      api<{ invoices: Inv[] }>(`${B}/invoices`).then((d) => setInvs(d.invoices)).catch(() => {});
      api<{ bills: Inv[] }>(`${B}/bills`).then((d) => setBills(d.bills)).catch(() => {});
      api<{ advances: any[] }>(`${B}/advances`).then((d) => setAdvs(d.advances)).catch(() => {});
      api<{ templates: any[] }>(`${B}/recurring`).then((d) => setTpls(d.templates)).catch(() => {});
      api<{ assets: Asset[] }>(`${B}/assets`).then((d) => setAssets(d.assets)).catch(() => {});
      api<Bva>(`${B}/reports/budget-vs-actual?year=${new Date().getFullYear()}`).then(setBva).catch(() => {});
      api<PL>(`${B}/reports/profit-loss?from=${today().slice(0, 8)}01&to=${today()}`).then(setPl).catch(() => {});
    } catch (e: any) { if (/kích hoạt|hết hạn thuê/.test(String(e.message))) setLocked(true); }
  }, []);
  useEffect(() => { if (!getSession()) { router.replace('/'); return; } load(); }, [router, load]);

  /* ── Sổ quỹ: phiếu thu / phiếu chi ── */
  const [pKind, setPKind] = useState<'thu' | 'chi'>('thu');
  const [pParty, setPParty] = useState(''); const [pAmt, setPAmt] = useState(''); const [pNote, setPNote] = useState('');
  async function savePayment() {
    const amt = Math.round(parseFloat(pAmt.replace(/[^\d.]/g, '')) || 0);
    if (amt <= 0) return;
    try {
      const body = pKind === 'thu'
        ? { docDate: today(), counterAccountCode: '511', amount: String(amt), payerName: pParty || undefined, reason: pNote || undefined, post: true }
        : { docDate: today(), counterAccountCode: '642', amount: String(amt), payeeName: pParty || undefined, reason: pNote || undefined, post: true };
      await api(`${B}/${pKind === 'thu' ? 'receipts' : 'payments'}`, { method: 'POST', body: JSON.stringify(body) });
      flash(`Đã ghi PHIẾU ${pKind === 'thu' ? 'THU' : 'CHI'} ${vnd(amt)}₫${pParty ? ' — ' + pParty : ''}`);
      setPParty(''); setPAmt(''); setPNote(''); load();
    } catch (e: any) { flash(e.message, false); }
  }

  /* ── Hóa đơn bán/mua + thu tiền ── */
  const [iKind, setIKind] = useState<'ban' | 'mua'>('ban');
  const [iParty, setIParty] = useState(''); const [iAmt, setIAmt] = useState(''); const [iTax, setITax] = useState('8'); const [iDue, setIDue] = useState('');
  async function addInvoice() {
    const amt = Math.round(parseFloat(iAmt.replace(/[^\d.]/g, '')) || 0);
    if (!iParty.trim() || amt <= 0) return;
    try {
      const cs = await api<{ contacts: any[] }>(`${B}/contacts?search=${encodeURIComponent(iParty.trim())}`).catch(() => ({ contacts: [] as any[] }));
      let contact = cs.contacts.find((c) => c.name?.toLowerCase() === iParty.trim().toLowerCase());
      if (!contact) contact = await api(`${B}/contacts`, { method: 'POST', body: JSON.stringify({ name: iParty.trim(), type: iKind === 'ban' ? 'CUSTOMER' : 'VENDOR' }) });
      const body: any = { docDate: today(), contactId: contact.id, subtotal: String(amt), taxRate: iTax, post: true };
      if (iKind === 'ban' && iDue) body.dueDate = iDue;
      if (iKind === 'mua') body.expenseAccountCode = '156';
      await api(`${B}/${iKind === 'ban' ? 'invoices' : 'bills'}`, { method: 'POST', body: JSON.stringify(body) });
      flash(`Đã tạo hóa đơn ${iKind === 'ban' ? 'BÁN' : 'MUA'} ${vnd(amt)}₫ (+${iTax}% thuế) — ${iParty}`);
      setIParty(''); setIAmt(''); setIDue(''); load();
    } catch (e: any) { flash(e.message, false); }
  }
  async function collect(inv: Inv, kind: 'invoices' | 'bills') {
    const left = Number(inv.total) - Number(inv.amountPaid);
    const v = window.prompt(`${kind === 'invoices' ? 'Thu' : 'Trả'} bao nhiêu cho HĐ ${inv.docNo}? (còn ${vnd(left)}₫)`, String(Math.round(left)));
    if (v === null) return;
    const amt = Math.round(parseFloat(v.replace(/[^\d.]/g, '')) || 0);
    if (amt <= 0) return;
    try {
      await api(`${B}/${kind}/${inv.id}/payment`, { method: 'POST', body: JSON.stringify({ amount: String(amt) }) });
      flash(`Đã ${kind === 'invoices' ? 'thu' : 'trả'} ${vnd(amt)}₫ — ${inv.docNo}`); load();
    } catch (e: any) { flash(e.message, false); }
  }

  /* ── Vận hành: tạm ứng + định kỳ ── */
  const [aType, setAType] = useState<'CUSTOMER_DEPOSIT' | 'SUPPLIER_ADVANCE' | 'EMPLOYEE_ADVANCE'>('CUSTOMER_DEPOSIT');
  const [aParty, setAParty] = useState(''); const [aAmt, setAAmt] = useState('');
  async function addAdvance() {
    const amt = Math.round(parseFloat(aAmt.replace(/[^\d.]/g, '')) || 0);
    if (amt <= 0) return;
    try {
      await api(`${B}/advances`, { method: 'POST', body: JSON.stringify({ type: aType, docDate: today(), amount: String(amt), partyName: aParty || undefined }) });
      flash(`Đã ghi ${aType === 'CUSTOMER_DEPOSIT' ? 'khách đặt cọc' : aType === 'SUPPLIER_ADVANCE' ? 'ứng trước NCC' : 'tạm ứng NV'} ${vnd(amt)}₫`);
      setAParty(''); setAAmt(''); load();
    } catch (e: any) { flash(e.message, false); }
  }
  async function runRecurring() {
    try { const r = await api<{ generated: number }>(`${B}/recurring/run`, { method: 'POST', body: JSON.stringify({}) }); flash(r.generated ? `Đã sinh ${r.generated} chứng từ định kỳ` : 'Không có mẫu nào tới hạn'); load(); }
    catch (e: any) { flash(e.message, false); }
  }

  /* ── Phân tích: đối chiếu NH · TSCĐ · ngân sách ── */
  const [csv, setCsv] = useState('');
  async function reconcile() {
    try {
      const s = getSession();
      if (csv.trim()) {
        await fetch(`${API}${B}/bank/import?account=112`, { method: 'POST', headers: s ? { Authorization: `Bearer ${s.jwt}`, 'Content-Type': 'text/csv' } : {}, body: csv });
      }
      await api(`${B}/bank/auto-match?account=112`, { method: 'POST', body: JSON.stringify({}) });
      await api(`${B}/bank/apply-rules?account=112`, { method: 'POST', body: JSON.stringify({}) });
      const rep = await api<any>(`${B}/bank/reconciliation?account=112`);
      setRecon(rep); setCsv('');
      flash(rep.reconciled ? 'Đối chiếu 112: KHỚP HẾT ✓' : `Đối chiếu 112: còn ${rep.unmatchedCount} dòng chưa khớp`, rep.reconciled);
    } catch (e: any) { flash(e.message, false); }
  }
  const [fName, setFName] = useState(''); const [fCost, setFCost] = useState(''); const [fLife, setFLife] = useState('12');
  async function addAsset() {
    const cost = Math.round(parseFloat(fCost.replace(/[^\d.]/g, '')) || 0);
    if (!fName.trim() || cost <= 0) return;
    try {
      await api(`${B}/assets`, { method: 'POST', body: JSON.stringify({ name: fName.trim(), cost: String(cost), usefulLifeMonths: Number(fLife) || 12, startDate: today() }) });
      flash(`Đã ghi nhận TSCĐ ${fName} — ${vnd(cost)}₫`); setFName(''); setFCost(''); load();
    } catch (e: any) { flash(e.message, false); }
  }
  async function runDep() {
    try { const r = await api<{ posted: number }>(`${B}/assets/depreciation`, { method: 'POST', body: JSON.stringify({}) }); flash(r.posted ? `Đã ghi ${r.posted} kỳ khấu hao` : 'Không có khấu hao tới kỳ'); load(); }
    catch (e: any) { flash(e.message, false); }
  }
  const [bAcc, setBAcc] = useState('642'); const [bAmt, setBAmt] = useState('');
  async function setBudget() {
    const amt = Math.round(parseFloat(bAmt.replace(/[^\d.]/g, '')) || 0);
    if (amt <= 0) return;
    try {
      await api(`${B}/budgets`, { method: 'POST', body: JSON.stringify({ fiscalYear: String(new Date().getFullYear()), accountCode: bAcc, amount: String(amt) }) });
      flash(`Đã đặt ngân sách TK ${bAcc}: ${vnd(amt)}₫`); setBAmt(''); load();
    } catch (e: any) { flash(e.message, false); }
  }

  /* ── Báo cáo: integrity · Excel · dữ liệu mẫu ── */
  async function checkIntegrity() {
    try { const r = await api<{ ok: boolean; checks: { name: string; ok: boolean }[] }>(`${B}/health/integrity`); flash(r.ok ? 'Toàn vẹn sổ: OK ✓ (mọi kiểm định xanh)' : 'Sổ có vấn đề — xem chi tiết trong checks', r.ok); }
    catch (e: any) { flash(e.message, false); }
  }
  async function dlExcel(kind: string, fname: string) {
    try {
      const s = getSession();
      const r = await fetch(`${API}${B}/export/${kind}.xlsx`, { headers: s ? { Authorization: `Bearer ${s.jwt}` } : {} });
      if (!r.ok) throw new Error('Tải file thất bại');
      const blob = await r.blob(); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = fname; a.click(); URL.revokeObjectURL(url);
    } catch (e: any) { flash(e.message, false); }
  }
  async function seedDemo() {
    try {
      await api(`${B}/receipts`, { method: 'POST', body: JSON.stringify({ docDate: today(), counterAccountCode: '411', amount: '50000000', reason: 'Góp vốn khởi đầu (mẫu)', post: true }) });
      const ct = await api<any>(`${B}/contacts`, { method: 'POST', body: JSON.stringify({ name: 'Công ty Mây (mẫu)', type: 'CUSTOMER' }) });
      await api(`${B}/invoices`, { method: 'POST', body: JSON.stringify({ docDate: today(), contactId: ct.id, subtotal: '10000000', taxRate: '8', post: true }) });
      await api(`${B}/assets`, { method: 'POST', body: JSON.stringify({ name: 'Máy in (mẫu)', cost: '12000000', usefulLifeMonths: 12, startDate: today() }) });
      flash('Đã tạo dữ liệu mẫu: góp vốn 50tr · hóa đơn bán 10.8tr · 1 TSCĐ'); load();
    } catch (e: any) { flash(e.message, false); }
  }

  if (locked) return <Shell><ModuleLocked name="Kế Toán 10A" id="ke-toan-10a" /></Shell>;

  const tabs = [['quy', 'Sổ quỹ'], ['hd', 'Hóa đơn'], ['vh', 'Vận hành'], ['pt', 'Phân tích'], ['bc', 'Báo cáo']] as const;
  const inp = { background: 'var(--s2)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', color: 'var(--fg)', width: '100%' } as const;

  return (
    <Shell wide>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Icon name="coin" />
        <h1 style={{ fontSize: 'var(--fs-h1)', margin: 0 }}>Kế Toán 10A</h1>
        {tbOk != null && <span className={`chip chip-${tbOk ? 'jade' : 'amber'}`}>{tbOk ? 'SỔ CÂN' : 'SỔ LỆCH'}</span>}
        <button className="btn" style={{ marginLeft: 'auto' }} onClick={seedDemo} data-tut="k10a-demo">Dữ liệu mẫu</button>
      </div>
      {msg && <div className="card" style={{ padding: 10, marginBottom: 10, borderColor: msg.ok ? 'var(--jade)' : 'var(--amber)' }}>{msg.t}</div>}

      {/* KPI nhanh */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 14 }} data-tut="k10a-kpi">
        {[['Tiền (111+112)', dash?.cash], ['Phải thu 131', dash?.receivables], ['Phải trả 331', dash?.payables], ['Lãi/lỗ kỳ', dash?.profit]].map(([l, v]) => (
          <div key={l as string} className="card" style={{ padding: 12 }}>
            <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--mut)' }}>{l}</div>
            <div style={{ fontSize: 'var(--fs-h2)', fontWeight: 700, fontFamily: 'var(--fm)' }}>{v == null ? '—' : vnd(v) + '₫'}</div>
          </div>
        ))}
      </div>

      <div className="tabs" role="tablist" data-tut="k10a-tabs">
        {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'tab on' : 'tab'} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'quy' && (
        <div className="biz-main" style={{ display: 'grid', gap: 14 }}>
          <div className="card" style={{ padding: 14 }} data-tut="k10a-quy">
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {(['thu', 'chi'] as const).map((k) => <button key={k} className={pKind === k ? 'btn-p' : 'btn'} onClick={() => setPKind(k)}>PHIẾU {k.toUpperCase()}</button>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr auto', gap: 8 }}>
              <input style={inp} placeholder="Đối tác (tùy chọn)" value={pParty} onChange={(e) => setPParty(e.target.value)} />
              <input style={inp} placeholder="Số tiền" inputMode="numeric" value={pAmt} onChange={(e) => setPAmt(e.target.value)} />
              <input style={inp} placeholder="Ghi chú" value={pNote} onChange={(e) => setPNote(e.target.value)} />
              <button className="btn-p" onClick={savePayment}>Ghi sổ</button>
            </div>
            <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--mut)', marginTop: 6 }}>Thu: Nợ 111 / Có 511 · Chi: Nợ 642 / Có 111 (đổi TK đối ứng ở API/Tiểu Tâm)</div>
          </div>
          {[['Phiếu thu', receipts], ['Phiếu chi', pays]].map(([title, rows]) => (
            <div key={title as string} className="card" style={{ padding: 14 }}>
              <h3 style={{ marginTop: 0 }}>{title as string}</h3>
              {!rows ? '…' : (rows as Receipt[]).length === 0 ? <EmptyState icon="coin" title={`Chưa có ${String(title).toLowerCase()}`} /> : (
                <table className="dt"><thead><tr><th>Số CT</th><th>Ngày</th><th>Đối tác / lý do</th><th style={{ textAlign: 'right' }}>Số tiền</th><th></th></tr></thead>
                  <tbody>{(rows as Receipt[]).slice(0, 8).map((r) => (
                    <tr key={r.id}><td style={{ fontFamily: 'var(--fm)' }}>{r.docNo}</td><td>{r.docDate}</td><td>{r.payerName ?? r.payeeName ?? r.reason ?? '—'}</td><td style={{ textAlign: 'right', fontFamily: 'var(--fm)' }}>{vnd(r.amount)}₫</td><td><Badge s={r.status} /></td></tr>
                  ))}</tbody></table>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'hd' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="card" style={{ padding: 14 }} data-tut="k10a-hd">
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {(['ban', 'mua'] as const).map((k) => <button key={k} className={iKind === k ? 'btn-p' : 'btn'} onClick={() => setIKind(k)}>HÓA ĐƠN {k === 'ban' ? 'BÁN' : 'MUA'}</button>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 90px 1fr auto', gap: 8 }}>
              <input style={inp} placeholder={iKind === 'ban' ? 'Tên khách hàng' : 'Tên nhà cung cấp'} value={iParty} onChange={(e) => setIParty(e.target.value)} />
              <input style={inp} placeholder="Tiền hàng (chưa thuế)" inputMode="numeric" value={iAmt} onChange={(e) => setIAmt(e.target.value)} />
              <select style={inp} value={iTax} onChange={(e) => setITax(e.target.value)}>{['0', '5', '8', '10'].map((t) => <option key={t} value={t}>{t}% GTGT</option>)}</select>
              <input style={inp} type="date" value={iDue} onChange={(e) => setIDue(e.target.value)} title="Hạn thanh toán (tuổi nợ)" />
              <button className="btn-p" onClick={addInvoice}>Tạo HĐ</button>
            </div>
          </div>
          {([['Hóa đơn bán (phải thu)', invs, 'invoices'], ['Hóa đơn mua (phải trả)', bills, 'bills']] as const).map(([title, rows, kind]) => (
            <div key={title} className="card" style={{ padding: 14 }}>
              <h3 style={{ marginTop: 0 }}>{title}</h3>
              {!rows ? '…' : rows.length === 0 ? <EmptyState icon="target" title="Chưa có hóa đơn" /> : (
                <table className="dt"><thead><tr><th>Số HĐ</th><th>Đối tác</th><th style={{ textAlign: 'right' }}>Tổng</th><th style={{ textAlign: 'right' }}>Còn nợ</th><th></th><th></th></tr></thead>
                  <tbody>{rows.slice(0, 8).map((v) => {
                    const left = Number(v.total) - Number(v.amountPaid);
                    return (<tr key={v.id}><td style={{ fontFamily: 'var(--fm)' }}>{v.docNo}</td><td>{v.contactName ?? '—'}</td><td style={{ textAlign: 'right', fontFamily: 'var(--fm)' }}>{vnd(v.total)}₫</td><td style={{ textAlign: 'right', fontFamily: 'var(--fm)', color: left > 0 ? 'var(--amber)' : 'var(--jade)' }}>{vnd(left)}₫</td><td><Badge s={v.status} /></td>
                      <td>{left > 0 && v.status !== 'REVERSED' && <button className="btn" onClick={() => collect(v, kind)}>{kind === 'invoices' ? 'Thu tiền' : 'Trả tiền'}</button>}</td></tr>);
                  })}</tbody></table>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'vh' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="card" style={{ padding: 14 }} data-tut="k10a-vh">
            <h3 style={{ marginTop: 0 }}>Tạm ứng / đặt cọc</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 2fr 1fr auto', gap: 8 }}>
              <select style={inp} value={aType} onChange={(e) => setAType(e.target.value as never)}>
                <option value="CUSTOMER_DEPOSIT">Khách đặt cọc</option><option value="SUPPLIER_ADVANCE">Ứng trước NCC</option><option value="EMPLOYEE_ADVANCE">Tạm ứng nhân viên</option>
              </select>
              <input style={inp} placeholder="Đối tác" value={aParty} onChange={(e) => setAParty(e.target.value)} />
              <input style={inp} placeholder="Số tiền" inputMode="numeric" value={aAmt} onChange={(e) => setAAmt(e.target.value)} />
              <button className="btn-p" onClick={addAdvance}>Ghi</button>
            </div>
            {advs && advs.length > 0 && (
              <table className="dt" style={{ marginTop: 10 }}><thead><tr><th>Số CT</th><th>Loại</th><th style={{ textAlign: 'right' }}>Còn dư</th><th></th></tr></thead>
                <tbody>{advs.slice(0, 6).map((a) => <tr key={a.id}><td style={{ fontFamily: 'var(--fm)' }}>{a.docNo}</td><td>{a.type === 'CUSTOMER_DEPOSIT' ? 'Cọc khách' : a.type === 'SUPPLIER_ADVANCE' ? 'Ứng NCC' : 'Tạm ứng NV'}</td><td style={{ textAlign: 'right', fontFamily: 'var(--fm)' }}>{vnd(Number(a.amount) - Number(a.appliedAmount ?? 0))}₫</td><td><Badge s={a.status} /></td></tr>)}</tbody></table>
            )}
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3 style={{ margin: 0 }}>Giao dịch định kỳ</h3>
              <button className="btn-p" style={{ marginLeft: 'auto' }} onClick={runRecurring} data-tut="k10a-recurring">Chạy tới hạn</button>
            </div>
            {!tpls ? '…' : tpls.length === 0 ? <EmptyState icon="book" title="Chưa có mẫu định kỳ" sub='Bảo Tiểu Tâm: "đặt định kỳ 10A tiền thuê 20 triệu mỗi tháng".' /> : (
              <table className="dt" style={{ marginTop: 10 }}><thead><tr><th>Tên</th><th>Tần suất</th><th>Kỳ tiếp</th><th style={{ textAlign: 'right' }}>Đã sinh</th></tr></thead>
                <tbody>{tpls.slice(0, 6).map((t) => <tr key={t.id}><td>{t.name}</td><td>{t.frequency}</td><td>{t.nextRunDate}</td><td style={{ textAlign: 'right', fontFamily: 'var(--fm)' }}>{t.runCount}</td></tr>)}</tbody></table>
            )}
          </div>
        </div>
      )}

      {tab === 'pt' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="card" style={{ padding: 14 }} data-tut="k10a-bank">
            <h3 style={{ marginTop: 0 }}>Đối chiếu ngân hàng (TK 112)</h3>
            <textarea style={{ ...inp, minHeight: 84, fontFamily: 'var(--fm)' }} placeholder={'Dán sao kê CSV: date,description,amount\n2026-07-01,Khách A CK,5000000'} value={csv} onChange={(e) => setCsv(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <button className="btn-p" onClick={reconcile}>Nhập + Đối chiếu</button>
              {recon && <span className={`chip chip-${recon.reconciled ? 'jade' : 'amber'}`}>{recon.reconciled ? 'KHỚP HẾT' : `Còn ${recon.unmatchedCount} chưa khớp`}</span>}
            </div>
          </div>
          <div className="card" style={{ padding: 14 }} data-tut="k10a-asset">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3 style={{ margin: 0 }}>Tài sản cố định</h3>
              <button className="btn" style={{ marginLeft: 'auto' }} onClick={runDep}>Chạy khấu hao</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 100px auto', gap: 8, marginTop: 10 }}>
              <input style={inp} placeholder="Tên tài sản" value={fName} onChange={(e) => setFName(e.target.value)} />
              <input style={inp} placeholder="Nguyên giá" inputMode="numeric" value={fCost} onChange={(e) => setFCost(e.target.value)} />
              <input style={inp} placeholder="Số tháng" inputMode="numeric" value={fLife} onChange={(e) => setFLife(e.target.value)} />
              <button className="btn-p" onClick={addAsset}>Ghi nhận</button>
            </div>
            {assets && assets.length > 0 && (
              <table className="dt" style={{ marginTop: 10 }}><thead><tr><th>Mã</th><th>Tên</th><th style={{ textAlign: 'right' }}>Nguyên giá</th><th style={{ textAlign: 'right' }}>Đã KH</th><th></th></tr></thead>
                <tbody>{assets.slice(0, 6).map((a) => <tr key={a.id}><td style={{ fontFamily: 'var(--fm)' }}>{a.code}</td><td>{a.name}</td><td style={{ textAlign: 'right', fontFamily: 'var(--fm)' }}>{vnd(a.cost)}₫</td><td style={{ textAlign: 'right', fontFamily: 'var(--fm)' }}>{vnd(a.accumulatedDepreciation)}₫</td><td><Badge s={a.status} /></td></tr>)}</tbody></table>
            )}
          </div>
          <div className="card" style={{ padding: 14 }} data-tut="k10a-budget">
            <h3 style={{ marginTop: 0 }}>Ngân sách {new Date().getFullYear()} vs thực tế</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr auto', gap: 8 }}>
              <input style={inp} placeholder="TK (642…)" value={bAcc} onChange={(e) => setBAcc(e.target.value)} />
              <input style={inp} placeholder="Ngân sách năm" inputMode="numeric" value={bAmt} onChange={(e) => setBAmt(e.target.value)} />
              <button className="btn-p" onClick={setBudget}>Đặt</button>
            </div>
            {bva && bva.rows.length > 0 && (
              <table className="dt" style={{ marginTop: 10 }}><thead><tr><th>TK</th><th style={{ textAlign: 'right' }}>Ngân sách</th><th style={{ textAlign: 'right' }}>Thực tế</th><th></th></tr></thead>
                <tbody>{bva.rows.map((r) => <tr key={r.accountCode}><td>{r.accountCode} {r.accountName}</td><td style={{ textAlign: 'right', fontFamily: 'var(--fm)' }}>{vnd(r.budget)}₫</td><td style={{ textAlign: 'right', fontFamily: 'var(--fm)' }}>{vnd(r.actual)}₫</td><td>{r.overBudget ? <span className="chip chip-amber">VƯỢT</span> : <span className="chip chip-jade">OK</span>}</td></tr>)}</tbody></table>
            )}
          </div>
        </div>
      )}

      {tab === 'bc' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="card" style={{ padding: 14 }} data-tut="k10a-report">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>Lãi lỗ tháng này</h3>
              {pl && <span className="chip chip-sky">Thu {vnd(pl.totalIncome)}₫ · Chi {vnd(pl.totalExpense)}₫</span>}
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {([['trial-balance', 'can-doi-thu.xlsx', 'Cân đối thử'], ['general-ledger', 'so-cai.xlsx', 'Sổ cái'], ['profit-loss', 'lai-lo.xlsx', 'KQKD'], ['invoices', 'hoa-don.xlsx', 'Hóa đơn']] as const).map(([k, f, l]) => (
                  <button key={k} className="btn" onClick={() => dlExcel(k, f)}><Icon name="book" /> {l}</button>
                ))}
                <button className="btn" onClick={checkIntegrity}>Kiểm toàn vẹn sổ</button>
              </span>
            </div>
            <div style={{ marginTop: 12 }}>{pl ? <PLBarChart pl={pl} /> : '…'}</div>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <h3 style={{ marginTop: 0 }}>Báo cáo khác (API)</h3>
            <div style={{ fontSize: 'var(--fs-small)', color: 'var(--mut)', lineHeight: 1.7 }}>
              CĐKT <code>/reports/balance-sheet</code> · LCTT <code>/reports/cash-flow</code> · Tờ khai GTGT <code>/reports/vat-declaration</code> · Tuổi nợ <code>/reports/aging</code> · Sao kê công nợ <code>/reports/statement</code> · Lãi lỗ theo bộ phận <code>/reports/profit-by-cost-center</code> — hoặc hỏi thẳng Tiểu Tâm: “báo cáo 10A”, “ai nợ quá hạn?”, “khoản nào vượt ngân sách?”.
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
