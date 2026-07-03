'use client';
// R2 redesign: .tabs + .dt data tables + bar chart SVG thuần lãi lỗ. Data/endpoint GIỮ NGUYÊN V7A P4.
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { ModuleLocked } from '../../components/ModuleGate';
import { EmptyState } from '../../components/EmptyState';
import { api, getSession, API } from '../../lib/api';

interface Inv { id: string; invoiceType: string; partyName: string; grandTotal: string; outstanding: string; status: string; postingDate: string }
interface Pay { id: string; paymentType: string; partyName: string; amount: string; postingDate: string; status: string; remarks: string | null }
interface PL { totalIncome: number; totalExpense: number; netProfit: number; income: { name: string; amount: number }[]; expense: { name: string; amount: number }[] }

const today = () => new Date().toISOString().slice(0, 10);
const vnd = (n: number | string) => Number(n).toLocaleString('vi-VN');
const STATUS_VN: Record<string, string> = { unpaid: 'Chưa thu', partly_paid: 'Thu 1 phần', paid: 'Đã tất toán', cancelled: 'Đã hủy' };
const STATUS_BDG: Record<string, string> = { unpaid: 'amber', partly_paid: 'sky', paid: 'jade', cancelled: 'mut' };

/** Bar chart SVG thuần — doanh thu vs chi phí theo hạng mục (lãi lỗ tháng). */
function PLBarChart({ pl }: { pl: PL }) {
  const rows = [
    ...pl.income.map((r) => ({ ...r, kind: 'thu' as const })),
    ...pl.expense.map((r) => ({ ...r, kind: 'chi' as const })),
  ];
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.amount), 1);
  const BH = 20, GAP = 10, LBL = 12;
  const H = rows.length * (BH + GAP + LBL) + 4;
  return (
    <svg viewBox={`0 0 320 ${H}`} width="100%" role="img" aria-label="Biểu đồ lãi lỗ theo hạng mục" style={{ display: 'block' }}>
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

export default function AccountingPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'quy' | 'congno' | 'baocao'>('quy');
  const [locked, setLocked] = useState(false);
  const [cash, setCash] = useState<number | null>(null);
  const [bank, setBank] = useState<number | null>(null);
  const [pays, setPays] = useState<Pay[] | null>(null);
  const [invs, setInvs] = useState<Inv[] | null>(null);
  const [pl, setPl] = useState<PL | null>(null);
  const [tbOk, setTbOk] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      let accts = await api<{ accounts: any[] }>('/api/v1/accounting/accounts');
      if (accts.accounts.length === 0) { await api('/api/v1/accounting/chart/seed', { method: 'POST' }); }
      setLocked(false);
      api<{ balance: number }>('/api/v1/accounting/accounts/111/balance').then((d) => setCash(d.balance)).catch(() => {});
      api<{ balance: number }>('/api/v1/accounting/accounts/112/balance').then((d) => setBank(d.balance)).catch(() => {});
      api<{ payments: Pay[] }>('/api/v1/accounting/payments').then((d) => setPays(d.payments)).catch(() => {});
      api<{ invoices: Inv[] }>('/api/v1/accounting/invoices').then((d) => setInvs(d.invoices)).catch(() => {});
      api<PL>(`/api/v1/accounting/reports/profit-loss?from=${today().slice(0, 8)}01&to=${today()}`).then(setPl).catch(() => {});
      api<{ balanced: boolean }>('/api/v1/accounting/reports/trial-balance').then((d) => setTbOk(d.balanced)).catch(() => {});
    } catch (e: any) { if (/kích hoạt|hết hạn thuê/.test(String(e.message))) setLocked(true); }
  }, []);
  useEffect(() => { if (!getSession()) { router.replace('/'); return; } load(); }, [router, load]);

  // ── form thu/chi nhanh (không gắn HĐ) ──
  const [pType, setPType] = useState<'receive' | 'pay'>('pay');
  const [pParty, setPParty] = useState(''); const [pAmt, setPAmt] = useState(''); const [pNote, setPNote] = useState('');
  async function quickPay() {
    const amt = Math.round(parseFloat(pAmt.replace(/[^\d.]/g, '')) || 0);
    if (!pParty.trim() || amt <= 0) return;
    try {
      // thu/chi tự do: bút toán journal thẳng quỹ ↔ doanh thu khác/chi phí
      await api('/api/v1/accounting/journal', { method: 'POST', body: JSON.stringify({ postingDate: today(), remarks: pNote || (pType === 'pay' ? 'Chi' : 'Thu') + ' — ' + pParty, lines: pType === 'pay' ? [{ accountNumber: '642', debit: amt }, { accountNumber: '111', credit: amt }] : [{ accountNumber: '111', debit: amt }, { accountNumber: '511', credit: amt }] }) });
      setMsg({ t: `Đã ghi ${pType === 'pay' ? 'CHI' : 'THU'} ${vnd(amt)}₫ — ${pParty}`, ok: true });
      setPParty(''); setPAmt(''); setPNote(''); load();
    } catch (e: any) { setMsg({ t: e.message, ok: false }); }
  }

  // ── form hóa đơn ──
  const [iType, setIType] = useState<'sales' | 'purchase'>('sales');
  const [iParty, setIParty] = useState(''); const [iDesc, setIDesc] = useState(''); const [iAmt, setIAmt] = useState('');
  async function addInvoice() {
    const amt = Math.round(parseFloat(iAmt.replace(/[^\d.]/g, '')) || 0);
    if (!iParty.trim() || amt <= 0) return;
    try {
      await api('/api/v1/accounting/invoices', { method: 'POST', body: JSON.stringify({ invoiceType: iType, partyName: iParty.trim(), postingDate: today(), lines: [{ description: iDesc || 'Hàng hóa/dịch vụ', qty: 1, rate: amt }] }) });
      setMsg({ t: `Đã tạo hóa đơn ${iType === 'sales' ? 'BÁN' : 'MUA'} ${vnd(amt)}₫ — ${iParty} (ghi công nợ)`, ok: true });
      setIParty(''); setIDesc(''); setIAmt(''); load();
    } catch (e: any) { setMsg({ t: e.message, ok: false }); }
  }
  async function settle(inv: Inv) {
    const v = window.prompt(`${inv.invoiceType === 'sales' ? 'Thu' : 'Trả'} bao nhiêu cho "${inv.partyName}"? (còn ${vnd(inv.outstanding)}₫)`, String(inv.outstanding));
    if (v === null) return;
    const amt = Math.round(parseFloat(v.replace(/[^\d.]/g, '')) || 0);
    if (amt <= 0) return;
    try {
      await api('/api/v1/accounting/payments', { method: 'POST', body: JSON.stringify({ paymentType: inv.invoiceType === 'sales' ? 'receive' : 'pay', partyName: inv.partyName, amount: amt, invoiceId: inv.id, postingDate: today() }) });
      setMsg({ t: `Đã ${inv.invoiceType === 'sales' ? 'thu' : 'trả'} ${vnd(amt)}₫ — ${inv.partyName}`, ok: true }); load();
    } catch (e: any) { setMsg({ t: e.message, ok: false }); }
  }

  // ── Excel connect (V7A P4) — logic GIỮ NGUYÊN ──
  const [xlsOpen, setXlsOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  // Kết quả import lưu localStorage — sống qua refresh để user luôn biết lần nhập gần nhất ra sao (fix UX 03/07)
  const IMPORT_KEY = 'citadel.acc.lastImport';
  const [importRes, setImportResRaw] = useState<{ created: number; errors: string[]; at?: string } | null>(null);
  useEffect(() => {
    try { const raw = localStorage.getItem(IMPORT_KEY); if (raw) setImportResRaw(JSON.parse(raw)); } catch {}
  }, []);
  function setImportRes(v: { created: number; errors: string[] } | null) {
    if (v === null) { setImportResRaw(null); try { localStorage.removeItem(IMPORT_KEY); } catch {} return; }
    const withTime = { ...v, at: new Date().toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) };
    setImportResRaw(withTime);
    try { localStorage.setItem(IMPORT_KEY, JSON.stringify(withTime)); } catch {}
  }
  const EXPORTS = [
    ['general-ledger', 'Sổ cái GL', 'so-cai-gl.xlsx'],
    ['invoices', 'Hóa đơn', 'hoa-don.xlsx'],
    ['trial-balance', 'Cân đối thử', 'can-doi-thu.xlsx'],
    ['profit-loss', 'Lãi lỗ', 'lai-lo.xlsx'],
  ] as const;
  async function downloadXlsx(kind: string, filename: string) {
    setXlsOpen(false);
    try {
      const s = getSession();
      const path = kind.startsWith('/') ? kind : `/api/v1/accounting/export/${kind}.xlsx`;
      const r = await fetch(`${API}${path}`, { headers: s ? { Authorization: `Bearer ${s.jwt}` } : {} });
      if (!r.ok) { const d = await r.json().catch(() => ({} as any)); throw new Error((d as any)?.error?.message ?? `Lỗi ${r.status}`); }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      setMsg({ t: `Đã xuất ${filename}`, ok: true });
    } catch (e: any) { setMsg({ t: e.message, ok: false }); }
  }
  async function importXlsx(file: File) {
    setImporting(true); setImportRes(null);
    try {
      const s = getSession();
      const fd = new FormData(); fd.append('file', file);
      const r = await fetch(`${API}/api/v1/accounting/import/invoices.xlsx`, { method: 'POST', headers: s ? { Authorization: `Bearer ${s.jwt}` } : {}, body: fd });
      const d = await r.json().catch(() => ({} as any));
      if (!r.ok) throw new Error((d as any)?.error?.message ?? `Lỗi ${r.status}`);
      setImportRes({ created: d.created, errors: d.errors ?? [] });
      setMsg({ t: d.message, ok: d.created > 0 || (d.errors ?? []).length === 0 });
      load();
    } catch (e: any) { setMsg({ t: e.message, ok: false }); }
    finally { setImporting(false); }
  }

  const tabs = [['quy', 'Thu Chi'], ['congno', 'Công nợ'], ['baocao', 'Báo cáo']] as const;
  return (
    <Shell wide>
      <div className="scroll">
        <div className="pg-h"><div className="k">Tài chính · fork ERPNext Accounts</div><h1>Kế Toán</h1></div>
        {locked ? <ModuleLocked name="Kế Toán" id="accounting" /> : (
          <div className="biz-cols">
          <div className="biz-main">
            <div className="tabs">
              {tabs.map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)} className={`tab ${tab === k ? 'on' : ''}`}>{label}</button>
              ))}
            </div>
            {msg && <div className="card" style={{ margin: '11px 20px 0', padding: '10px 13px', fontSize: 12.5, color: msg.ok ? 'var(--jade)' : 'var(--amber)', borderColor: msg.ok ? 'rgba(52,211,184,.3)' : 'rgba(232,179,102,.35)' }}>{msg.t}</div>}

            {/* Excel connect: xuất 4 báo cáo + nhập hóa đơn (V7A P4 — G7) */}
            <div style={{ margin: '11px 20px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, position: 'relative' }}>
              <button onClick={() => setXlsOpen(!xlsOpen)} className="tab" style={{ padding: '9px 0' }}>⤓ Xuất Excel</button>
              <label className="tab" style={{ padding: '9px 0', textAlign: 'center', cursor: 'pointer', opacity: importing ? .5 : 1 }}>
                {importing ? 'Đang nhập…' : '⤒ Nhập hóa đơn từ Excel'}
                <input type="file" accept=".xlsx" style={{ display: 'none' }} disabled={importing} onChange={(e) => { const f = e.target.files?.[0]; if (f) importXlsx(f); e.target.value = ''; }} />
              </label>
              <button onClick={() => downloadXlsx('/api/v1/accounting/import/template.xlsx', 'mau-nhap-hoa-don.xlsx')} className="tab" style={{ padding: '9px 0', gridColumn: '1 / -1', fontSize: 12, color: 'var(--jade)' }}>⤓ Tải file mẫu nhập hóa đơn (.xlsx) — điền theo rồi nạp lên</button>
              {xlsOpen && (
                <div className="card scale-in" style={{ position: 'absolute', top: 42, left: 0, width: 'min(240px, 50%)', zIndex: 5, padding: 6, borderRadius: 13, boxShadow: 'var(--sh-3)' }}>
                  {EXPORTS.map(([kind, label, fn]) => (
                    <button key={kind} onClick={() => downloadXlsx(kind, fn)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 11px', borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--txt)', fontSize: 12.5, fontWeight: 600 }}>{label} (.xlsx)</button>
                  ))}
                </div>
              )}
            </div>
            {importRes && (
              <div className="card" style={{ margin: '9px 20px 0', padding: '10px 13px', borderRadius: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: importRes.created > 0 ? 'var(--jade)' : 'var(--rose)', flex: 1 }}>Kết quả nhập{importRes.at ? ` (${importRes.at})` : ''}: {importRes.created} hóa đơn thành công · {importRes.errors.length} lỗi{importRes.created === 0 && importRes.errors.length > 0 ? ' — KHÔNG có gì được ghi vào sổ' : ''}</div>
                  <button onClick={() => setImportRes(null)} style={{ border: 'none', background: 'transparent', color: 'var(--mut)', fontSize: 11, cursor: 'pointer' }}>✕ Ẩn</button>
                </div>
                {importRes.errors.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    {importRes.errors.slice(0, 10).map((er, i) => <div key={i} style={{ fontSize: 11.5, color: 'var(--amber)', padding: '2px 0' }}>• {er}</div>)}
                    {importRes.errors.length > 10 && <div style={{ fontSize: 11, color: 'var(--mut)' }}>… và {importRes.errors.length - 10} lỗi nữa</div>}
                  </div>
                )}
                <div style={{ fontSize: 10, color: 'var(--mut)', marginTop: 6 }}>Mẫu cột: Loại (bán/mua) · Đối tác · Ngày · Diễn giải · Số lượng · Đơn giá</div>
              </div>
            )}

            {tab === 'quy' && (
              <>
                <div style={{ margin: '13px 20px 0', display: 'grid', gap: 7 }}>
                  <div style={{ display: 'flex', gap: 7 }}>
                    <button onClick={() => setPType('receive')} className={`tab ${pType === 'receive' ? 'on' : ''}`}>PHIẾU THU</button>
                    <button onClick={() => setPType('pay')} className={`tab ${pType === 'pay' ? 'on warm' : ''}`}>PHIẾU CHI</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 7 }}>
                    <input value={pParty} onChange={(e) => setPParty(e.target.value)} placeholder="Đối tượng (vd: Tiền điện)" className="inp" />
                    <input value={pAmt} onChange={(e) => setPAmt(e.target.value)} placeholder="Số tiền ₫" inputMode="numeric" className="inp" />
                  </div>
                  <input value={pNote} onChange={(e) => setPNote(e.target.value)} placeholder="Ghi chú (tuỳ chọn)" className="inp" />
                  <button onClick={quickPay} className="btn-p" style={{ opacity: pParty.trim() && pAmt ? 1 : .5 }}>Ghi sổ ({pType === 'pay' ? 'Nợ 642 / Có 111' : 'Nợ 111 / Có 511'})</button>
                </div>
                <div className="sect">Phiếu gần đây</div>
                {pays === null && <div className="skel" style={{ height: 120, margin: '10px 20px 0', borderRadius: 16 }} />}
                {pays?.length === 0 && (
                  <EmptyState icon="receipt" title="Chưa có phiếu thu/chi" sub="Ghi phiếu đầu tiên bằng form phía trên — sổ cái cập nhật ngay." />
                )}
                {pays && pays.length > 0 && (
                  <div className="dt-wrap fade-up">
                    <table className="dt">
                      <thead><tr><th>Loại</th><th>Đối tượng</th><th>Ngày</th><th className="num">Số tiền (₫)</th></tr></thead>
                      <tbody>
                        {pays.slice(0, 10).map((p) => (
                          <tr key={p.id} style={{ opacity: p.status === 'cancelled' ? .5 : 1 }}>
                            <td><span className={`bdg-s ${p.paymentType === 'receive' ? 'jade' : 'amber'}`}>{p.paymentType === 'receive' ? 'THU' : 'CHI'}</span></td>
                            <td style={{ fontWeight: 600 }}>{p.partyName}</td>
                            <td className="mono" style={{ color: 'var(--mut)', fontSize: 11 }}>{p.postingDate}</td>
                            <td className="num" style={{ fontWeight: 700, color: p.paymentType === 'receive' ? 'var(--jade)' : 'var(--amber)' }}>{p.paymentType === 'receive' ? '+' : '−'}{vnd(p.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {tab === 'congno' && (
              <>
                <div style={{ margin: '13px 20px 0', display: 'grid', gap: 7 }}>
                  <div style={{ display: 'flex', gap: 7 }}>
                    <button onClick={() => setIType('sales')} className={`tab ${iType === 'sales' ? 'on' : ''}`}>HĐ BÁN (phải thu)</button>
                    <button onClick={() => setIType('purchase')} className={`tab ${iType === 'purchase' ? 'on cool' : ''}`}>HĐ MUA (phải trả)</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 7 }}>
                    <input value={iParty} onChange={(e) => setIParty(e.target.value)} placeholder={iType === 'sales' ? 'Tên khách hàng' : 'Tên nhà cung cấp'} className="inp" />
                    <input value={iAmt} onChange={(e) => setIAmt(e.target.value)} placeholder="Tổng ₫" inputMode="numeric" className="inp" />
                  </div>
                  <input value={iDesc} onChange={(e) => setIDesc(e.target.value)} placeholder="Nội dung (vd: Tiệc 20 người)" className="inp" />
                  <button onClick={addInvoice} className="btn-p" style={{ opacity: iParty.trim() && iAmt ? 1 : .5 }}>Tạo hóa đơn (ghi công nợ)</button>
                </div>
                {invs === null && <div className="skel" style={{ height: 120, margin: '14px 20px 0', borderRadius: 16 }} />}
                {invs?.length === 0 && (
                  <EmptyState icon="doc" title="Chưa có hóa đơn" sub="Tạo hóa đơn bán/mua để theo dõi công nợ từng đối tác." />
                )}
                {invs && invs.length > 0 && (
                  <div className="dt-wrap fade-up" style={{ marginTop: 14 }}>
                    <table className="dt">
                      <thead><tr><th>Loại</th><th>Đối tác</th><th>Trạng thái</th><th className="num">Tổng (₫)</th><th className="num">Còn nợ (₫)</th><th></th></tr></thead>
                      <tbody>
                        {invs.map((i) => (
                          <tr key={i.id} style={{ opacity: i.status === 'cancelled' ? .5 : 1 }}>
                            <td><span className={`bdg-s ${i.invoiceType === 'sales' ? 'jade' : 'violet'}`}>{i.invoiceType === 'sales' ? 'BÁN' : 'MUA'}</span></td>
                            <td style={{ fontWeight: 600 }}>{i.partyName}</td>
                            <td><span className={`bdg-s ${STATUS_BDG[i.status] ?? 'mut'}`}>{STATUS_VN[i.status] ?? i.status}</span></td>
                            <td className="num">{vnd(i.grandTotal)}</td>
                            <td className="num" style={{ fontWeight: 700, color: Number(i.outstanding) > 0 ? 'var(--amber)' : 'var(--jade)' }}>{vnd(i.outstanding)}</td>
                            <td>
                              {Number(i.outstanding) > 0 && i.status !== 'cancelled' && (
                                <button onClick={() => settle(i)} className="bdg-s jade" style={{ border: '1px solid rgba(52,211,184,.3)', cursor: 'pointer', padding: '5px 10px' }}>{i.invoiceType === 'sales' ? 'Thu tiền' : 'Trả tiền'}</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {tab === 'baocao' && (
              <>
                <div className="stat-row c3">
                  <div className="stat"><div className="sv" style={{ color: 'var(--jade)' }}>{pl ? vnd(pl.totalIncome) : '—'}</div><div className="sl">Doanh thu tháng (₫)</div></div>
                  <div className="stat"><div className="sv" style={{ color: 'var(--amber)' }}>{pl ? vnd(pl.totalExpense) : '—'}</div><div className="sl">Chi phí tháng (₫)</div></div>
                  <div className="stat"><div className="sv" style={{ color: pl && pl.netProfit >= 0 ? 'var(--jade)' : 'var(--rose)' }}>{pl ? vnd(pl.netProfit) : '—'}</div><div className="sl">Lãi ròng (₫)</div></div>
                </div>
                <div className="card fade-up" style={{ margin: '11px 20px 0', padding: 16, borderRadius: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <b className="fd" style={{ fontSize: 14 }}>Lãi lỗ tháng này</b>
                    {tbOk !== null && <span className={`bdg-s ${tbOk ? 'jade' : 'rose'}`} style={{ marginLeft: 'auto' }}>{tbOk ? 'SỔ CÂN' : 'SỔ LỆCH'}</span>}
                  </div>
                  {pl && (pl.income.length > 0 || pl.expense.length > 0)
                    ? <PLBarChart pl={pl} />
                    : <p className="mut" style={{ fontSize: 12.5, padding: '6px 0' }}>Chưa có bút toán trong tháng — ghi thu/chi hoặc tạo hóa đơn để thấy biểu đồ.</p>}
                </div>
                <p className="mono" style={{ padding: '12px 22px', fontSize: 10, color: 'var(--faint)' }}>Tính trực tiếp từ sổ cái GL (Σ Nợ = Σ Có). Sổ quỹ, công nợ, P&L cùng một nguồn sự thật.</p>
              </>
            )}
          </div>

          {/* ── R4 aside: sổ gần đây + số dư quỹ + trial balance ── */}
          <aside className="biz-aside">
            <div className="as-panel">
              <div className="as-h"><Icon name="coin" /> Số dư quỹ
                {tbOk !== null && <span className={`bdg-s ${tbOk ? 'jade' : 'rose'}`} style={{ marginLeft: 'auto' }}>{tbOk ? 'SỔ CÂN' : 'SỔ LỆCH'}</span>}
              </div>
              <div className="as-kpis">
                <div className="as-kpi">
                  <div className="ii" style={{ background: 'var(--jade-soft)', color: 'var(--jade)' }}><Icon name="coin" size={14} /></div>
                  <div className="v" style={{ color: 'var(--jade)' }}>{cash === null ? '—' : vnd(cash)}</div>
                  <div className="l">111 · Tiền mặt (₫)</div>
                </div>
                <div className="as-kpi">
                  <div className="ii" style={{ background: 'var(--sky-soft)', color: 'var(--sky)' }}><Icon name="bank" size={14} /></div>
                  <div className="v" style={{ color: 'var(--sky)' }}>{bank === null ? '—' : vnd(bank)}</div>
                  <div className="l">112 · Ngân hàng (₫)</div>
                </div>
              </div>
              {pl && (
                <div className="as-kpis" style={{ marginTop: 9 }}>
                  <div className="as-kpi">
                    <div className="v" style={{ color: 'var(--jade)', fontSize: 14 }}>{vnd(pl.totalIncome)}</div>
                    <div className="l">Thu tháng này (₫)</div>
                    <div className="d" style={{ color: 'var(--jade)' }}><Icon name="up" size={10} /> doanh thu</div>
                  </div>
                  <div className="as-kpi">
                    <div className="v" style={{ color: pl.netProfit >= 0 ? 'var(--jade)' : 'var(--rose)', fontSize: 14 }}>{vnd(pl.netProfit)}</div>
                    <div className="l">Lãi ròng (₫)</div>
                    <div className="d" style={{ color: pl.netProfit >= 0 ? 'var(--jade)' : 'var(--rose)' }}>{pl.netProfit >= 0 ? '▲ dương' : '▼ âm'}</div>
                  </div>
                </div>
              )}
            </div>
            <div className="as-panel">
              <div className="as-h"><Icon name="book" /> Sổ gần đây
                <button className="as-more" onClick={() => setTab('quy')}>xem sổ <Icon name="chevron" size={11} /></button>
              </div>
              {pays === null && <div className="skel" style={{ height: 90, borderRadius: 12 }} />}
              {pays?.length === 0 && <p className="mut" style={{ fontSize: 12, padding: '4px 0' }}>Chưa có bút toán nào.</p>}
              {pays?.slice(0, 6).map((p) => (
                <div key={p.id} className="as-it">
                  <div className="ai-ico" style={{ background: p.paymentType === 'receive' ? 'var(--jade-soft)' : 'var(--amber-soft)', color: p.paymentType === 'receive' ? 'var(--jade)' : 'var(--amber)' }}>
                    <Icon name={p.paymentType === 'receive' ? 'up' : 'coin'} size={14} />
                  </div>
                  <div className="ai-t"><b>{p.partyName}</b><span>{p.postingDate}</span></div>
                  <div className="ai-r" style={{ color: p.paymentType === 'receive' ? 'var(--jade)' : 'var(--amber)' }}>{p.paymentType === 'receive' ? '+' : '−'}{vnd(p.amount)}</div>
                </div>
              ))}
            </div>
          </aside>
          </div>
        )}
        <div style={{ height: 14 }} />
      </div>
    </Shell>
  );
}
