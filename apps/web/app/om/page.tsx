'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { api, getSession } from '../../lib/api';

interface Txn { id: string; delta: number; reason: string; module: string | null; createdAt: string }

export default function OmPage() {
  const router = useRouter();
  const [bal, setBal] = useState<number | null>(null);
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const load = () => {
    api<{ balance: number }>('/api/v1/om/balance').then((d) => setBal(d.balance)).catch(() => {});
    api<{ transactions: Txn[] }>('/api/v1/om/transactions').then((d) => setTxns(d.transactions)).catch(() => setTxns([]));
  };
  useEffect(() => { if (!getSession()) { router.replace('/'); return; } load(); }, [router]);
  async function topup() {
    await api('/api/v1/om/topup', { method: 'POST', body: JSON.stringify({ amount: 500 }) });
    load();
  }
  return (
    <Shell>
      <div className="scroll">
        <div className="pg-h"><div className="k">Om Economy</div><h1>Ví Om</h1></div>
        <div style={{ margin: '16px 20px 0', background: 'linear-gradient(150deg,#27210f,#11151c)', border: '1px solid rgba(232,179,102,.3)', borderRadius: 24, padding: 22, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', bottom: -40, right: -20, color: 'var(--amber)', opacity: .07 }}><Icon name="coin" size={170} /></div>
          <div style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 600, letterSpacing: '.05em' }}>SỐ DƯ KHẢ DỤNG</div>
          {bal !== null
            ? <div className="mono" style={{ fontWeight: 700, fontSize: 44, color: 'var(--amber)', marginTop: 6, lineHeight: 1 }}>{bal.toLocaleString('vi')} <small style={{ fontSize: 18 }}>Om</small></div>
            : <div className="skel" style={{ height: 48, marginTop: 8, width: 180 }} />}
          <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>Dùng cho AI, module & dịch vụ</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18, position: 'relative' }}>
            <button onClick={topup} style={{ flex: 1, border: 'none', fontWeight: 700, fontSize: 13.5, padding: 13, borderRadius: 13, background: 'var(--amber)', color: '#2a1c08', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}><Icon name="plus" size={16} /> Nạp 500 Om</button>
          </div>
        </div>
        <div style={{ padding: '22px 20px 0', fontSize: 13, fontWeight: 700, color: 'var(--dim)' }}>Giao dịch gần đây</div>
        <div style={{ padding: '8px 20px 0' }}>
          {txns === null && [1, 2].map((i) => <div key={i} className="skel" style={{ height: 56, marginBottom: 8 }} />)}
          {txns?.length === 0 && <p className="mut" style={{ padding: 12, fontSize: 13 }}>Chưa có giao dịch.</p>}
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
        <div style={{ height: 14 }} />
      </div>
    </Shell>
  );
}
