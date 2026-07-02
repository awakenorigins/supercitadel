'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { api, getSession } from '../../lib/api';

interface Mod { id: string; name: string; icon: string; desc: string; tier: string; priceOm: number; group: string; route: string; status: string; active: boolean; purchased: boolean }
interface StoreItem { code: string; name: string; description: string; category: string; price: number; icon: string | null }

const ITEM_CAT_LABEL: Record<string, string> = { food: 'Đồ ăn', decor: 'Trang trí', boost: 'Tăng lực' };

export default function ModulesPage() {
  const router = useRouter();
  const [mods, setMods] = useState<Mod[] | null>(null);
  const [storeItems, setStoreItems] = useState<StoreItem[] | null>(null);
  const [bal, setBal] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => {
    api<{ modules: Mod[] }>('/api/v1/modules').then((d) => setMods(d.modules)).catch(() => setMods([]));
    api<{ items: StoreItem[] }>('/api/v1/store/items').then((d) => setStoreItems(d.items)).catch(() => setStoreItems([]));
    api<{ balance: number }>('/api/v1/om/balance').then((d) => setBal(d.balance)).catch(() => {});
  };
  useEffect(() => { if (!getSession()) { router.replace('/'); return; } load(); }, [router]);

  async function act(m: Mod, action: 'purchase' | 'activate' | 'deactivate') {
    setBusy(m.id); setMsg('');
    try {
      const d = await api<any>(`/api/v1/modules/${m.id}/${action}`, { method: 'POST' });
      if (action === 'purchase') setMsg(`Đã mua ${m.name} (−${d.paidOm} Om · còn ${d.balance.toLocaleString('vi')})`);
      load();
    } catch (e: any) { setMsg(e.message); }
    finally { setBusy(''); }
  }

  async function buyItem(it: StoreItem) {
    setBusy(it.code); setMsg('');
    try {
      const d = await api<any>(`/api/v1/store/items/${it.code}/buy`, { method: 'POST' });
      setMsg(d.message ?? `Đã mua ${it.name}`);
      load();
    } catch (e: any) { setMsg(e.message); }
    finally { setBusy(''); }
  }

  const enabled = mods?.filter((m) => m.active) ?? [];
  const groups = ['Kinh doanh', 'Tài chính', 'Vận hành', 'Nhân sự', 'Cốt lõi'];

  return (
    <Shell>
      <div className="scroll">
        <div className="pg-h" style={{ display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}><div className="k">Marketplace</div><h1>Cửa Hàng Module</h1></div>
          {bal !== null && <span className="mono" style={{ background: 'var(--amber-soft)', border: '1px solid rgba(232,179,102,.26)', borderRadius: 99, padding: '7px 13px', color: 'var(--amber)', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="coin" size={13} /> {bal.toLocaleString('vi')}</span>}
        </div>
        {msg && <div className="card" style={{ margin: '12px 20px 0', padding: '11px 14px', fontSize: 12.5, color: 'var(--jade)', borderColor: 'rgba(52,211,184,.3)' }}>{msg}</div>}

        {/* Đã bật — đi nhanh vào module */}
        <div style={{ padding: '18px 20px 0', fontSize: 13, fontWeight: 700, color: 'var(--dim)' }}>Đã bật · chạm để mở</div>
        <div style={{ display: 'flex', gap: 9, padding: '11px 20px 0', overflowX: 'auto' }}>
          {mods === null && [1, 2, 3].map((i) => <div key={i} className="skel" style={{ minWidth: 86, height: 86, borderRadius: 16 }} />)}
          {enabled.map((m) => (
            <button key={m.id} onClick={() => router.push(m.route)} className="card" style={{ minWidth: 86, padding: '13px 8px', borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, borderColor: 'rgba(52,211,184,.25)' }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, background: 'var(--jade-soft)', color: 'var(--jade)', display: 'grid', placeItems: 'center' }}><Icon name={m.icon} size={18} /></div>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt)' }}>{m.name}</span>
            </button>
          ))}
        </div>

        {/* Cửa hàng theo nhóm */}
        {groups.map((g) => {
          const list = mods?.filter((m) => m.group === g) ?? [];
          if (!list.length && mods !== null) return null;
          return (
            <div key={g}>
              <div style={{ padding: '20px 20px 0', fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: 'var(--faint)', textTransform: 'uppercase' }}>{g}</div>
              <div style={{ padding: '10px 20px 0' }}>
                {list.map((m) => (
                  <div key={m.id} className="card" style={{ display: 'flex', gap: 12, padding: 14, borderRadius: 16, marginBottom: 9, alignItems: 'center', opacity: m.status === 'coming_soon' ? .55 : 1 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 13, background: m.active ? 'var(--jade-soft)' : 'var(--s3)', color: m.active ? 'var(--jade)' : 'var(--dim)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name={m.icon} size={20} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <b style={{ fontSize: 14 }}>{m.name}</b>
                        {m.tier === 'core' && <span className="mono" style={{ fontSize: 8.5, color: 'var(--jade)', border: '1px solid rgba(52,211,184,.3)', borderRadius: 5, padding: '1px 6px' }}>CỐT LÕI</span>}
                        {m.status === 'coming_soon' && <span className="mono" style={{ fontSize: 8.5, color: 'var(--violet)', border: '1px solid rgba(152,137,232,.3)', borderRadius: 5, padding: '1px 6px' }}>SẮP RA</span>}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--mut)', marginTop: 3 }}>{m.desc}</div>
                      {m.tier === 'paid' && !m.purchased && <div className="mono" style={{ fontSize: 11.5, color: 'var(--amber)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="coin" size={11} /> {m.priceOm} Om · mua 1 lần</div>}
                    </div>
                    {m.status === 'ready' && m.tier !== 'core' && (
                      m.purchased ? (
                        <button disabled={busy === m.id} onClick={() => act(m, m.active ? 'deactivate' : 'activate')}
                          style={{ border: 'none', borderRadius: 11, padding: '9px 14px', fontWeight: 700, fontSize: 12, background: m.active ? 'var(--s3)' : 'var(--jade)', color: m.active ? 'var(--dim)' : '#04231f', opacity: busy === m.id ? .6 : 1 }}>
                          {m.active ? 'Tắt' : 'Bật'}
                        </button>
                      ) : (
                        <button disabled={busy === m.id} onClick={() => act(m, 'purchase')}
                          style={{ border: 'none', borderRadius: 11, padding: '9px 14px', fontWeight: 700, fontSize: 12, background: 'var(--amber)', color: '#2a1c08', opacity: busy === m.id ? .6 : 1 }}>
                          Mua
                        </button>
                      )
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Vật phẩm (V7A P3) — đồ ăn / trang trí / tăng lực cho Tiểu Tâm */}
        <div style={{ padding: '24px 20px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: 'var(--faint)', textTransform: 'uppercase' }}>Vật phẩm</span>
          <button onClick={() => router.push('/items')} className="mono" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--jade)', background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
            Kho của tôi <Icon name="chevron" size={12} />
          </button>
        </div>
        <div style={{ padding: '10px 20px 0' }}>
          {storeItems === null && [1, 2].map((i) => <div key={i} className="skel" style={{ height: 68, borderRadius: 16, marginBottom: 9 }} />)}
          {storeItems?.map((it) => (
            <div key={it.code} className="card" style={{ display: 'flex', gap: 12, padding: 14, borderRadius: 16, marginBottom: 9, alignItems: 'center' }}>
              <div style={{ width: 42, height: 42, borderRadius: 13, background: 'var(--amber-soft)', color: 'var(--amber)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name={it.icon ?? 'gift'} size={20} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <b style={{ fontSize: 14 }}>{it.name}</b>
                  <span className="mono" style={{ fontSize: 8.5, color: 'var(--dim)', border: '1px solid var(--bd)', borderRadius: 5, padding: '1px 6px' }}>{ITEM_CAT_LABEL[it.category] ?? it.category}</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--mut)', marginTop: 3 }}>{it.description}</div>
                <div className="mono" style={{ fontSize: 11.5, color: 'var(--amber)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="coin" size={11} /> {it.price} Om</div>
              </div>
              <button disabled={busy === it.code} onClick={() => buyItem(it)}
                style={{ border: 'none', borderRadius: 11, padding: '9px 14px', fontWeight: 700, fontSize: 12, background: 'var(--amber)', color: '#2a1c08', opacity: busy === it.code ? .6 : 1 }}>
                Mua
              </button>
            </div>
          ))}
        </div>
        <div style={{ height: 14 }} />
      </div>
    </Shell>
  );
}
