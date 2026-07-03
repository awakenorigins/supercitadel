'use client';
// R2 redesign: .dt data table + .stat-row + form thêm hàng → .sheet thống nhất + .bdg-s semantic.
// Data/endpoint GIỮ NGUYÊN.
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { ModuleLocked } from '../../components/ModuleGate';
import { EmptyState } from '../../components/EmptyState';
import { api, getSession } from '../../lib/api';

interface Item { id: string; name: string; unit: string; qty: number; lowThreshold: number }

export default function InventoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<Item[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [nm, setNm] = useState(''); const [q0, setQ0] = useState(''); const [th, setTh] = useState('');
  const load = () => api<{ items: Item[] }>('/api/v1/inventory/items').then((d) => { setItems(d.items); setLocked(false); })
    .catch((e) => { if (/kích hoạt|hết hạn thuê/.test(String(e.message))) setLocked(true); else setItems([]); });
  useEffect(() => { if (!getSession()) { router.replace('/'); return; } load(); }, [router]);

  async function add() {
    if (!nm.trim()) return;
    await api('/api/v1/inventory/items', { method: 'POST', body: JSON.stringify({ name: nm, qty: Number(q0) || 0, lowThreshold: Number(th) || 5 }) }).catch(() => {});
    setNm(''); setQ0(''); setTh(''); setShowAdd(false); load();
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

  const lowCount = items?.filter((i) => i.qty <= i.lowThreshold).length ?? 0;
  const totalQty = items?.reduce((s, i) => s + i.qty, 0) ?? 0;
  const adjBtn = (bg: string, bd: string, color: string) => ({ width: 28, height: 28, borderRadius: 8, background: bg, border: `1px solid ${bd}`, color, fontSize: 15, fontWeight: 700, lineHeight: 1 } as const);

  return (
    <Shell wide>
      <div className="scroll">
        <div className="pg-h" style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ flex: 1 }}><div className="k">Vận hành</div><h1>Kho Hàng</h1></div>
          <button onClick={() => setShowAdd(true)} style={{ background: 'var(--jade)', border: 'none', borderRadius: 99, padding: '7px 13px', color: '#04231f', fontWeight: 700, fontSize: 12 }}>+ Mặt hàng</button>
        </div>
        {locked ? <ModuleLocked name="Kho Hàng" id="inventory" /> : (
          <div className="biz-cols">
          <div className="biz-main">
            {items === null && <div className="skel" style={{ height: 140, margin: '13px 20px 0', borderRadius: 16 }} />}
            {items?.length === 0 && (
              <EmptyState icon="box" title="Kho đang trống" sub="Thêm mặt hàng đầu tiên để theo dõi tồn kho và nhận cảnh báo sắp hết." cta="+ Thêm mặt hàng" onCta={() => setShowAdd(true)} />
            )}
            {items && items.length > 0 && (
              <div className="dt-wrap fade-up">
                <table className="dt">
                  <thead><tr><th>Mặt hàng</th><th>Trạng thái</th><th>Ngưỡng báo</th><th className="num">Tồn</th><th style={{ textAlign: 'center' }}>Điều chỉnh</th></tr></thead>
                  <tbody>
                    {items.map((it) => {
                      const low = it.qty <= it.lowThreshold;
                      return (
                        <tr key={it.id}>
                          <td style={{ fontWeight: 600 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                              <span style={{ width: 30, height: 30, borderRadius: 9, background: low ? 'var(--amber-soft)' : 'var(--s3)', color: low ? 'var(--amber)' : 'var(--dim)', display: 'grid', placeItems: 'center' }}><Icon name="box" size={15} /></span>
                              {it.name}
                            </span>
                          </td>
                          <td><span className={`bdg-s ${low ? 'amber' : 'jade'}`}>{low ? 'SẮP HẾT' : 'ĐỦ HÀNG'}</span></td>
                          <td>
                            <button onClick={() => editTh(it)} className="mono" style={{ fontSize: 11, color: 'var(--mut)', background: 'none', border: 'none', padding: 0, textDecoration: 'underline dotted', cursor: 'pointer' }}>
                              ≤ {it.lowThreshold} {it.unit} · sửa
                            </button>
                          </td>
                          <td className="num" style={{ fontWeight: 700, fontSize: 15, color: low ? 'var(--amber)' : 'var(--txt)' }}>{it.qty}</td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <button onClick={() => adj(it, -1)} style={adjBtn('var(--s2)', 'var(--bd)', 'var(--dim)')}>−</button>
                            <span style={{ display: 'inline-block', width: 8 }} />
                            <button onClick={() => adj(it, +1)} style={adjBtn('var(--jade-soft)', 'rgba(52,211,184,.3)', 'var(--jade)')}>+</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mono" style={{ padding: '10px 22px 0', fontSize: 10, color: 'var(--faint)' }}>Ngưỡng báo = cảnh báo sắp hết (không phải giới hạn — tồn kho không giới hạn)</p>
          </div>

          {/* ── R4 aside: tổng quan kho + cảnh báo sắp hết ── */}
          <aside className="biz-aside">
            <div className="as-panel">
              <div className="as-h"><Icon name="box" /> Tổng quan kho</div>
              <div className="as-kpis">
                <div className="as-kpi">
                  <div className="ii" style={{ background: 'var(--s3)', color: 'var(--dim)' }}><Icon name="grid" size={14} /></div>
                  <div className="v">{items?.length ?? '—'}</div>
                  <div className="l">Mặt hàng (SKU)</div>
                </div>
                <div className="as-kpi">
                  <div className="ii" style={{ background: 'var(--jade-soft)', color: 'var(--jade)' }}><Icon name="box" size={14} /></div>
                  <div className="v" style={{ color: 'var(--jade)' }}>{items ? totalQty : '—'}</div>
                  <div className="l">Tổng tồn kho</div>
                </div>
              </div>
            </div>
            <div className="as-panel">
              <div className="as-h" style={{ color: lowCount > 0 ? 'var(--amber)' : undefined }}>
                <Icon name="alert" /> Cảnh báo sắp hết
                <span className={`bdg-s ${lowCount > 0 ? 'amber' : 'jade'}`} style={{ marginLeft: 'auto' }}>{items ? lowCount : '—'}</span>
              </div>
              {items === null && <div className="skel" style={{ height: 70, borderRadius: 12 }} />}
              {items !== null && lowCount === 0 && <p className="mut" style={{ fontSize: 12, padding: '4px 0' }}>Kho ổn định — không mặt hàng nào dưới ngưỡng.</p>}
              {items?.filter((i) => i.qty <= i.lowThreshold).slice(0, 7).map((it) => {
                const zero = it.qty === 0;
                return (
                  <div key={it.id} className="as-it">
                    <div className="ai-ico" style={{ background: zero ? 'var(--rose-soft)' : 'var(--amber-soft)', color: zero ? 'var(--rose)' : 'var(--amber)' }}>
                      <Icon name="alert" size={14} />
                    </div>
                    <div className="ai-t"><b>{it.name}</b><span>ngưỡng ≤ {it.lowThreshold} {it.unit}</span></div>
                    <div className="ai-r" style={{ color: zero ? 'var(--rose)' : 'var(--amber)' }}>{it.qty}</div>
                  </div>
                );
              })}
              {items && lowCount > 0 && (
                <button className="es-cta" style={{ width: '100%', marginTop: 12, border: 'none', borderRadius: 12, background: 'var(--amber-soft)', color: 'var(--amber)', fontWeight: 700, fontSize: 12, padding: '10px 0' }}
                  onClick={() => setShowAdd(true)}>+ Nhập thêm hàng</button>
              )}
            </div>
          </aside>
          </div>
        )}
        <div style={{ height: 14 }} />
      </div>

      {/* Form thêm — .sheet thống nhất */}
      {showAdd && (
        <div className="sh-scrim" onClick={() => setShowAdd(false)}>
          <div className="sh-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sh-head">
              <div className="sh-ico" style={{ background: 'var(--jade-soft)', color: 'var(--jade)' }}><Icon name="box" size={18} /></div>
              <b style={{ fontSize: 15 }}>Thêm mặt hàng</b>
              <button className="sh-x" onClick={() => setShowAdd(false)}><Icon name="x" size={15} /></button>
            </div>
            <div style={{ display: 'grid', gap: 9 }}>
              <input value={nm} onChange={(e) => setNm(e.target.value)} placeholder="Tên mặt hàng…" className="inp" autoFocus />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
                <input value={q0} onChange={(e) => setQ0(e.target.value)} placeholder="Tồn ban đầu" inputMode="numeric" className="inp" />
                <input value={th} onChange={(e) => setTh(e.target.value)} placeholder="Báo khi ≤ (mặc định 5)" inputMode="numeric" className="inp" />
              </div>
              <button onClick={add} className="btn-p" style={{ opacity: nm.trim() ? 1 : .5 }}><Icon name="plus" size={15} /> Thêm vào kho</button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
