'use client';
// R4 redesign: 2 cột — trái lịch sử giao dịch, phải wallet-hero (port ý tưởng kokonutui
// currency-transfer → CSS thuần: gradient border, số dư lớn, nút nạp/chi) + thống kê thu/chi tháng.
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { NumberTicker } from '../../components/NumberTicker';
import { EmptyState } from '../../components/EmptyState';
import { api, getSession } from '../../lib/api';

interface Txn { id: string; delta: number; reason: string; module: string | null; createdAt: string }

export default function OmPage() {
  const router = useRouter();
  const [bal, setBal] = useState<number | null>(null);
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => {
    api<{ balance: number }>('/api/v1/om/balance').then((d) => setBal(d.balance)).catch(() => {});
    api<{ transactions: Txn[] }>('/api/v1/om/transactions').then((d) => setTxns(d.transactions)).catch(() => setTxns([]));
  };
  useEffect(() => { if (!getSession()) { router.replace('/'); return; } load(); }, [router]);
  async function topup() {
    if (busy) return;
    setBusy(true);
    try { await api('/api/v1/om/topup', { method: 'POST', body: JSON.stringify({ amount: 500 }) }); load(); }
    finally { setBusy(false); }
  }

  // thống kê thu/chi tháng này (tính từ transactions thật)
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthTx = txns?.filter((t) => t.createdAt.slice(0, 7) === monthKey) ?? [];
  const inMonth = monthTx.filter((t) => t.delta > 0).reduce((s, t) => s + t.delta, 0);
  const outMonth = monthTx.filter((t) => t.delta < 0).reduce((s, t) => s - t.delta, 0);

  return (
    <Shell wide>
      <div className="scroll">
        <div className="pg-h"><div className="k">Om Economy</div><h1>Ví Om</h1></div>
        <div className="biz-cols">
        <div className="biz-main">
          <div className="sect">Giao dịch gần đây</div>
          <div style={{ padding: '8px 20px 0' }}>
            {txns === null && [1, 2].map((i) => <div key={i} className="skel" style={{ height: 56, marginBottom: 8 }} />)}
            {txns?.length === 0 && (
              <EmptyState icon="coin" title="Chưa có giao dịch" sub="Nạp Om hoặc mua module/vật phẩm — mọi biến động ví hiện tại đây." cta="Nạp 500 Om" onCta={topup} />
            )}
            {txns?.map((t) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ width: 36, height: 36, borderRadius: 11, background: t.delta > 0 ? 'var(--amber-soft)' : 'var(--jade-soft)', color: t.delta > 0 ? 'var(--amber)' : 'var(--jade)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Icon name={t.delta > 0 ? 'plus' : 'spark'} size={17} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{t.reason}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--mut)', marginTop: 2 }}>{new Date(t.createdAt).toLocaleString('vi-VN')}</div>
                </div>
                <div className="mono" style={{ fontWeight: 700, fontSize: 15, color: t.delta > 0 ? 'var(--jade)' : 'var(--rose)' }}>{t.delta > 0 ? '+' : ''}{t.delta}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── R4 aside: wallet-hero + thống kê tháng ── */}
        <aside className="biz-aside">
          <div className="wallet-hero fade-up">
            <div className="wh-in">
              <div style={{ position: 'absolute', bottom: -44, right: -22, color: 'var(--amber)', opacity: .07 }}><Icon name="coin" size={170} /></div>
              <div style={{ fontSize: 11.5, color: 'var(--amber)', fontWeight: 700, letterSpacing: '.08em' }}>SỐ DƯ KHẢ DỤNG</div>
              {bal !== null
                ? <div className="wh-bal" style={{ marginTop: 10 }}><NumberTicker value={bal} duration={900} /> <small style={{ fontSize: 16, fontWeight: 600 }}>Om</small></div>
                : <div className="skel" style={{ height: 44, marginTop: 10, width: 170 }} />}
              <div className="dim" style={{ fontSize: 11.5, marginTop: 8 }}>Dùng cho AI, module & dịch vụ</div>
              <div style={{ display: 'flex', gap: 9, marginTop: 18, position: 'relative' }}>
                <button className="wh-btn p" disabled={busy} onClick={topup} style={{ opacity: busy ? .6 : 1 }}><Icon name="plus" size={15} /> Nạp 500 Om</button>
                <button className="wh-btn s" onClick={() => router.push('/modules')}><Icon name="cart" size={15} /> Chi tiêu</button>
              </div>
            </div>
          </div>
          <div className="as-panel">
            <div className="as-h"><Icon name="up" /> Tháng này</div>
            <div className="as-kpis">
              <div className="as-kpi">
                <div className="ii" style={{ background: 'var(--jade-soft)', color: 'var(--jade)' }}><Icon name="plus" size={14} /></div>
                <div className="v" style={{ color: 'var(--jade)' }}>{txns ? `+${inMonth.toLocaleString('vi')}` : '—'}</div>
                <div className="l">Om nạp vào</div>
              </div>
              <div className="as-kpi">
                <div className="ii" style={{ background: 'var(--rose-soft)', color: 'var(--rose)' }}><Icon name="coin" size={14} /></div>
                <div className="v" style={{ color: 'var(--rose)' }}>{txns ? `−${outMonth.toLocaleString('vi')}` : '—'}</div>
                <div className="l">Om chi ra</div>
              </div>
            </div>
            <div className="as-bar" style={{ marginTop: 10 }}>
              <span className="lb">Nạp</span>
              <span className="tr"><i style={{ width: `${Math.max(3, (inMonth / Math.max(inMonth, outMonth, 1)) * 100)}%`, background: 'var(--jade)' }} /></span>
              <span className="n">{inMonth.toLocaleString('vi')}</span>
            </div>
            <div className="as-bar">
              <span className="lb">Chi</span>
              <span className="tr"><i style={{ width: `${Math.max(3, (outMonth / Math.max(inMonth, outMonth, 1)) * 100)}%`, background: 'var(--rose)' }} /></span>
              <span className="n">{outMonth.toLocaleString('vi')}</span>
            </div>
            <p className="mono" style={{ fontSize: 10, color: 'var(--faint)', marginTop: 10 }}>{monthTx.length} giao dịch trong tháng {monthKey.slice(5)}</p>
          </div>
        </aside>
        </div>
        <div style={{ height: 14 }} />
      </div>
    </Shell>
  );
}
