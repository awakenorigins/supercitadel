'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { ModuleLocked } from '../../components/ModuleGate';
import { api, getSession, API } from '../../lib/api';

interface Inv { id: string; invoiceType: string; partyName: string; grandTotal: string; outstanding: string; status: string; postingDate: string }
interface Pay { id: string; paymentType: string; partyName: string; amount: string; postingDate: string; status: string; remarks: string | null }
interface PL { totalIncome: number; totalExpense: number; netProfit: number; income: { name: string; amount: number }[]; expense: { name: string; amount: number }[] }

const today = () => new Date().toISOString().slice(0, 10);
const vnd = (n: number | string) => Number(n).toLocaleString('vi-VN');
const inputSt = { padding: '11px 12px', borderRadius: 12, border: '1.5px solid var(--bd)', background: 'var(--s1)', color: 'var(--txt)', fontSize: 13, outline: 'none' } as const;
const STATUS_VN: Record<string, string> = { unpaid: 'Chưa thu', partly_paid: 'Thu 1 phần', paid: 'Đã tất toán', cancelled: 'Đã hủy' };

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
    } catch (e: any) { if (String(e.message).includes('kích hoạt')) setLocked(true); }
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

  // ── Excel connect (V7A P4) ──
  const [xlsOpen, setXlsOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importRes, setImportRes] = useState<{ created: number; errors: string[] } | null>(null);
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
      const r = await fetch(`${API}/api/v1/accounting/export/${kind}.xlsx`, { headers: s ? { Authorization: `Bearer ${s.jwt}` } : {} });
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
    <Shell>
      <div className="scroll">
        <div className="pg-h"><div className="k">Tài chính · fork ERPNext Accounts</div><h1>Kế Toán</h1></div>
        {locked ? <ModuleLocked name="Kế Toán" /> : (
          <>
            <div style={{ display: 'flex', gap: 7, padding: '13px 20px 0' }}>
              {tabs.map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: '9px 0', borderRadius: 12, fontSize: 12.5, fontWeight: 700, border: '1px solid', borderColor: tab === k ? 'rgba(52,211,184,.4)' : 'var(--bd)', background: tab === k ? 'var(--jade-soft)' : 'var(--s1)', color: tab === k ? 'var(--jade)' : 'var(--dim)' }}>{label}</button>
              ))}
            </div>
            {msg && <div className="card" style={{ margin: '11px 20px 0', padding: '10px 13px', fontSize: 12.5, color: msg.ok ? 'var(--jade)' : 'var(--amber)', borderColor: msg.ok ? 'rgba(52,211,184,.3)' : 'rgba(232,179,102,.35)' }}>{msg.t}</div>}

            {/* Excel connect: xuất 4 báo cáo + nhập hóa đơn (V7A P4 — G7) */}
            <div style={{ margin: '11px 20px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, position: 'relative' }}>
              <button onClick={() => setXlsOpen(!xlsOpen)} style={{ padding: '9px 0', borderRadius: 11, fontWeight: 700, fontSize: 12, border: '1px solid var(--bd)', background: 'var(--s1)', color: 'var(--dim)' }}>⤓ Xuất Excel</button>
              <label style={{ padding: '9px 0', borderRadius: 11, fontWeight: 700, fontSize: 12, border: '1px solid var(--bd)', background: 'var(--s1)', color: 'var(--dim)', textAlign: 'center', cursor: 'pointer', opacity: importing ? .5 : 1 }}>
                {importing ? 'Đang nhập…' : '⤒ Nhập hóa đơn từ Excel'}
                <input type="file" accept=".xlsx" style={{ display: 'none' }} disabled={importing} onChange={(e) => { const f = e.target.files?.[0]; if (f) importXlsx(f); e.target.value = ''; }} />
              </label>
              {xlsOpen && (
                <div className="card" style={{ position: 'absolute', top: 42, left: 0, right: '50%', zIndex: 5, padding: 6, borderRadius: 13 }}>
                  {EXPORTS.map(([kind, label, fn]) => (
                    <button key={kind} onClick={() => downloadXlsx(kind, fn)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 11px', borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--txt)', fontSize: 12.5, fontWeight: 600 }}>{label} (.xlsx)</button>
                  ))}
                </div>
              )}
            </div>
            {importRes && (
              <div className="card" style={{ margin: '9px 20px 0', padding: '10px 13px', borderRadius: 13 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: importRes.created > 0 ? 'var(--jade)' : 'var(--dim)' }}>Kết quả nhập: {importRes.created} hóa đơn thành công · {importRes.errors.length} lỗi</div>
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
                <div style={{ margin: '13px 20px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
                  <div className="card" style={{ padding: 13, borderRadius: 14 }}><div className="mono" style={{ fontWeight: 700, fontSize: 17, color: 'var(--jade)' }}>{cash === null ? '—' : vnd(cash)}</div><div style={{ fontSize: 10.5, color: 'var(--mut)', marginTop: 2 }}>111 · Tiền mặt (₫)</div></div>
                  <div className="card" style={{ padding: 13, borderRadius: 14 }}><div className="mono" style={{ fontWeight: 700, fontSize: 17, color: 'var(--sky)' }}>{bank === null ? '—' : vnd(bank)}</div><div style={{ fontSize: 10.5, color: 'var(--mut)', marginTop: 2 }}>112 · Ngân hàng (₫)</div></div>
                </div>
                <div style={{ margin: '13px 20px 0', display: 'grid', gap: 7 }}>
                  <div style={{ display: 'flex', gap: 7 }}>
                    <button onClick={() => setPType('receive')} style={{ flex: 1, padding: '9px 0', borderRadius: 11, fontWeight: 700, fontSize: 12, border: '1px solid', borderColor: pType === 'receive' ? 'rgba(52,211,184,.4)' : 'var(--bd)', background: pType === 'receive' ? 'var(--jade-soft)' : 'var(--s1)', color: pType === 'receive' ? 'var(--jade)' : 'var(--dim)' }}>PHIẾU THU</button>
                    <button onClick={() => setPType('pay')} style={{ flex: 1, padding: '9px 0', borderRadius: 11, fontWeight: 700, fontSize: 12, border: '1px solid', borderColor: pType === 'pay' ? 'rgba(232,179,102,.4)' : 'var(--bd)', background: pType === 'pay' ? 'var(--amber-soft)' : 'var(--s1)', color: pType === 'pay' ? 'var(--amber)' : 'var(--dim)' }}>PHIẾU CHI</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 7 }}>
                    <input value={pParty} onChange={(e) => setPParty(e.target.value)} placeholder="Đối tượng (vd: Tiền điện)" style={inputSt} />
                    <input value={pAmt} onChange={(e) => setPAmt(e.target.value)} placeholder="Số tiền ₫" inputMode="numeric" style={inputSt} />
                  </div>
                  <input value={pNote} onChange={(e) => setPNote(e.target.value)} placeholder="Ghi chú (tuỳ chọn)" style={inputSt} />
                  <button onClick={quickPay} className="btn-p" style={{ opacity: pParty.trim() && pAmt ? 1 : .5 }}>Ghi sổ ({pType === 'pay' ? 'Nợ 642 / Có 111' : 'Nợ 111 / Có 511'})</button>
                </div>
                <div style={{ padding: '14px 20px 0', fontSize: 12.5, fontWeight: 700, color: 'var(--dim)' }}>Phiếu gần đây</div>
                <div style={{ padding: '8px 20px 0' }}>
                  {pays?.length === 0 && <p className="mut" style={{ padding: 8, fontSize: 12.5 }}>Chưa có phiếu thu/chi.</p>}
                  {pays?.slice(0, 8).map((p) => (
                    <div key={p.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', borderRadius: 13, marginBottom: 7, opacity: p.status === 'cancelled' ? .5 : 1 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 10, display: 'grid', placeItems: 'center', background: p.paymentType === 'receive' ? 'var(--jade-soft)' : 'var(--amber-soft)', color: p.paymentType === 'receive' ? 'var(--jade)' : 'var(--amber)', fontWeight: 800, fontSize: 14 }}>{p.paymentType === 'receive' ? '+' : '−'}</div>
                      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{p.partyName}</div><div className="mono" style={{ fontSize: 10, color: 'var(--mut)' }}>{p.postingDate}</div></div>
                      <span className="mono" style={{ fontWeight: 700, fontSize: 13.5, color: p.paymentType === 'receive' ? 'var(--jade)' : 'var(--amber)' }}>{vnd(p.amount)}₫</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {tab === 'congno' && (
              <>
                <div style={{ margin: '13px 20px 0', display: 'grid', gap: 7 }}>
                  <div style={{ display: 'flex', gap: 7 }}>
                    <button onClick={() => setIType('sales')} style={{ flex: 1, padding: '9px 0', borderRadius: 11, fontWeight: 700, fontSize: 12, border: '1px solid', borderColor: iType === 'sales' ? 'rgba(52,211,184,.4)' : 'var(--bd)', background: iType === 'sales' ? 'var(--jade-soft)' : 'var(--s1)', color: iType === 'sales' ? 'var(--jade)' : 'var(--dim)' }}>HĐ BÁN (phải thu)</button>
                    <button onClick={() => setIType('purchase')} style={{ flex: 1, padding: '9px 0', borderRadius: 11, fontWeight: 700, fontSize: 12, border: '1px solid', borderColor: iType === 'purchase' ? 'rgba(152,137,232,.4)' : 'var(--bd)', background: iType === 'purchase' ? 'rgba(152,137,232,.12)' : 'var(--s1)', color: iType === 'purchase' ? 'var(--violet)' : 'var(--dim)' }}>HĐ MUA (phải trả)</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 7 }}>
                    <input value={iParty} onChange={(e) => setIParty(e.target.value)} placeholder={iType === 'sales' ? 'Tên khách hàng' : 'Tên nhà cung cấp'} style={inputSt} />
                    <input value={iAmt} onChange={(e) => setIAmt(e.target.value)} placeholder="Tổng ₫" inputMode="numeric" style={inputSt} />
                  </div>
                  <input value={iDesc} onChange={(e) => setIDesc(e.target.value)} placeholder="Nội dung (vd: Tiệc 20 người)" style={inputSt} />
                  <button onClick={addInvoice} className="btn-p" style={{ opacity: iParty.trim() && iAmt ? 1 : .5 }}>Tạo hóa đơn (ghi công nợ)</button>
                </div>
                <div style={{ padding: '14px 20px 0' }}>
                  {invs?.length === 0 && <p className="mut" style={{ padding: 8, fontSize: 12.5 }}>Chưa có hóa đơn.</p>}
                  {invs?.map((i) => (
                    <div key={i.id} className="card" style={{ padding: 13, borderRadius: 14, marginBottom: 9, opacity: i.status === 'cancelled' ? .5 : 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <span className="mono" style={{ fontSize: 9, padding: '2px 7px', borderRadius: 6, background: i.invoiceType === 'sales' ? 'var(--jade-soft)' : 'rgba(152,137,232,.12)', color: i.invoiceType === 'sales' ? 'var(--jade)' : 'var(--violet)' }}>{i.invoiceType === 'sales' ? 'BÁN' : 'MUA'}</span>
                        <b style={{ fontSize: 13.5, flex: 1 }}>{i.partyName}</b>
                        <span className="mono" style={{ fontSize: 9.5, color: 'var(--mut)' }}>{STATUS_VN[i.status]}</span>
                      </div>
                      <div className="mono" style={{ fontSize: 11.5, marginTop: 6, color: 'var(--dim)' }}>Tổng {vnd(i.grandTotal)}₫ · còn nợ <b style={{ color: Number(i.outstanding) > 0 ? 'var(--amber)' : 'var(--jade)' }}>{vnd(i.outstanding)}₫</b></div>
                      {Number(i.outstanding) > 0 && i.status !== 'cancelled' && (
                        <button onClick={() => settle(i)} style={{ marginTop: 9, width: '100%', padding: '8px 0', borderRadius: 11, border: '1px solid rgba(52,211,184,.3)', background: 'var(--jade-soft)', color: 'var(--jade)', fontWeight: 700, fontSize: 12 }}>{i.invoiceType === 'sales' ? 'Thu tiền' : 'Trả tiền'} (knock-off)</button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {tab === 'baocao' && (
              <div style={{ padding: '13px 20px 0' }}>
                <div className="card" style={{ padding: 15, borderRadius: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <b className="fd" style={{ fontSize: 14 }}>Lãi lỗ tháng này</b>
                    {tbOk !== null && <span className="mono" style={{ marginLeft: 'auto', fontSize: 9, padding: '2px 8px', borderRadius: 6, background: tbOk ? 'var(--jade-soft)' : 'rgba(240,98,116,.12)', color: tbOk ? 'var(--jade)' : 'var(--rose)' }}>{tbOk ? 'SỔ CÂN' : 'SỔ LỆCH'}</span>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
                    <div><div className="mono" style={{ fontWeight: 700, fontSize: 15, color: 'var(--jade)' }}>{pl ? vnd(pl.totalIncome) : '—'}</div><div style={{ fontSize: 9.5, color: 'var(--mut)' }}>Doanh thu</div></div>
                    <div><div className="mono" style={{ fontWeight: 700, fontSize: 15, color: 'var(--amber)' }}>{pl ? vnd(pl.totalExpense) : '—'}</div><div style={{ fontSize: 9.5, color: 'var(--mut)' }}>Chi phí</div></div>
                    <div><div className="mono" style={{ fontWeight: 700, fontSize: 15, color: pl && pl.netProfit >= 0 ? 'var(--jade)' : 'var(--rose)' }}>{pl ? vnd(pl.netProfit) : '—'}</div><div style={{ fontSize: 9.5, color: 'var(--mut)' }}>Lãi ròng</div></div>
                  </div>
                </div>
                {pl && (pl.income.length > 0 || pl.expense.length > 0) && (
                  <div className="card" style={{ padding: 15, borderRadius: 16, marginTop: 10 }}>
                    {pl.income.map((r) => <div key={r.name} style={{ display: 'flex', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--line)' }}><span style={{ color: 'var(--dim)' }}>{r.name}</span><span className="mono" style={{ marginLeft: 'auto', color: 'var(--jade)' }}>+{vnd(r.amount)}</span></div>)}
                    {pl.expense.map((r) => <div key={r.name} style={{ display: 'flex', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--line)' }}><span style={{ color: 'var(--dim)' }}>{r.name}</span><span className="mono" style={{ marginLeft: 'auto', color: 'var(--amber)' }}>−{vnd(r.amount)}</span></div>)}
                  </div>
                )}
                <p className="mono" style={{ padding: '12px 2px', fontSize: 10, color: 'var(--faint)' }}>Tính trực tiếp từ sổ cái GL (Σ Nợ = Σ Có). Sổ quỹ, công nợ, P&L cùng một nguồn sự thật.</p>
              </div>
            )}
          </>
        )}
        <div style={{ height: 14 }} />
      </div>
    </Shell>
  );
}
