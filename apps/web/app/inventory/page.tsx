'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { ModuleLocked } from '../../components/ModuleGate';
import { api, getSession } from '../../lib/api';

interface Item { id: string; name: string; unit: string; qty: number; lowThreshold: number }

export default function InventoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<Item[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [nm, setNm] = useState(''); const [q0, setQ0] = useState(''); const [th, setTh] = useState('');
  const load = () => api<{ items: Item[] }>('/api/v1/inventory/items').then((d) => { setItems(d.items); setLocked(false); })
    .catch((e) => { if (String(e.message).includes('kích hoạt')) setLocked(true); else setItems([]); });
  useEffect(() => { if (!getSession()) { router.replace('/'); return; } load(); }, [router]);

  async function add() {
    if (!nm.trim()) return;
    await api('/api/v1/inventory/items', { method: 'POST', body: JSON.stringify({ name: nm, qty: Number(q0) || 0, lowThreshold: Number(th) || 5 }) }).catch(() => {});
    setNm(''); setQ0(''); setTh(''); load();
  }
  async function adj(it: Item, delta: number) {
    setItems((p) => p?.map((x) => x.id === it.id ? { ...x, qty: Math.max(0, x.qty + delta) } : x) ?? null);
    await api(`/api/v1/inventory/items/${it.id}/qty`, { method: 'PATCH', body: JSON.stringify({ delta }) }).catch(() => load());
  }
  async function editTh(it: Item) {
    const v = window.prompt(`Báo "sắp hết" khi số lượng ≤ ? (hiện: ${it.lowThreshold})`, String(it.lowThreshold));
    if (v === null) return;
    const n = Math.max(0, Number(v) || 0);
    setItems((p) => p?.map((x) => x.id === it.id ? { ...x, lowThreshold: n } : x) ?? null);
    await api(`/api/v1/inventory/items/${it.id}`, { method: 'PATCH', body: JSON.stringify({ lowThreshold: n }) }).catch(() => load());
  }

  const inputSt = { padding: '11px 12px', borderRadius: 12, border: '1.5px solid var(--bd)', background: 'var(--s1)', color: 'var(--txt)', fontSize: 13, outline: 'none' } as const;
  return (
    <Shell>
      <div className="scroll">
        <div className="pg-h"><div className="k">Vận hành</div><h1>Kho Hàng</h1></div>
        {locked ? <ModuleLocked name="Kho Hàng" /> : (
          <>
            <div style={{ margin: '14px 20px 0', display: 'grid', gridTemplateColumns: '1fr 64px 64px 42px', gap: 7 }}>
              <input value={nm} onChange={(e) => setNm(e.target.value)} placeholder="Tên mặt hàng…" style={inputSt} />
              <input value={q0} onChange={(e) => setQ0(e.target.value)} placeholder="SL" inputMode="numeric" style={inputSt} />
              <input value={th} onChange={(e) => setTh(e.target.value)} placeholder="Báo ≤" inputMode="numeric" style={inputSt} />
              <button onClick={add} style={{ borderRadius: 12, border: 'none', background: 'var(--jade)', color: '#04231f', display: 'grid', placeItems: 'center' }}><Icon name="plus" size={18} /></button>
            </div>
            <p className="mono" style={{ padding: '7px 22px 0', fontSize: 10, color: 'var(--faint)' }}>SL = tồn ban đầu · "Báo ≤" = ngưỡng cảnh báo sắp hết (không phải giới hạn — tồn kho không giới hạn)</p>
            <div style={{ padding: '12px 20px 0' }}>
              {items === null && [1, 2].map((i) => <div key={i} className="skel" style={{ height: 64, marginBottom: 9 }} />)}
              {items?.length === 0 && <p className="mut" style={{ padding: 12, fontSize: 13 }}>Kho trống — thêm mặt hàng đầu tiên ở trên.</p>}
              {items?.map((it) => {
                const low = it.qty <= it.lowThreshold;
                return (
                  <div key={it.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: 13, borderRadius: 15, marginBottom: 9, ...(low ? { borderColor: 'rgba(232,179,102,.35)', background: 'linear-gradient(160deg,var(--amber-soft),var(--s1))' } : {}) }}>
                    <div style={{ width: 38, height: 38, borderRadius: 12, background: low ? 'var(--amber-soft)' : 'var(--s3)', color: low ? 'var(--amber)' : 'var(--dim)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name="box" size={18} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{it.name}</div>
                      <button onClick={() => editTh(it)} className="mono" style={{ fontSize: 10.5, color: low ? 'var(--amber)' : 'var(--mut)', marginTop: 2, background: 'none', border: 'none', padding: 0, textDecoration: 'underline dotted', cursor: 'pointer' }}>
                        {low ? 'SẮP HẾT · ' : ''}báo khi ≤ {it.lowThreshold} {it.unit} · sửa
                      </button>
                    </div>
                    <button onClick={() => adj(it, -1)} style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--s2)', border: '1px solid var(--bd)', color: 'var(--dim)', fontSize: 17, fontWeight: 700 }}>−</button>
                    <span className="mono" style={{ fontWeight: 700, fontSize: 17, minWidth: 40, textAlign: 'center', color: low ? 'var(--amber)' : 'var(--txt)' }}>{it.qty}</span>
                    <button onClick={() => adj(it, +1)} style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--jade-soft)', border: '1px solid rgba(52,211,184,.3)', color: 'var(--jade)', fontSize: 17, fontWeight: 700 }}>+</button>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <div style={{ height: 14 }} />
      </div>
    </Shell>
  );
}
