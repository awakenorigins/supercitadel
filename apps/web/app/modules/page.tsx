'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { api, getSession } from '../../lib/api';

interface Mod { id: string; name: string; icon: string; desc: string; tier: string; priceOm: number; group: string; route: string; status: string; active: boolean; purchased: boolean; rentedUntil: string | null; rentDaysLeft: number | null }

const RENT_PLANS = [
  { days: 7, pct: 0.10, label: '7 ngày' },
  { days: 30, pct: 0.25, label: '30 ngày' },
  { days: 90, pct: 0.60, label: '90 ngày' },
];
const rentPrice = (priceOm: number, pct: number) => Math.ceil(priceOm * pct);
const fmtDate = (d: Date) => d.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric', year: 'numeric' });
interface StoreItem { code: string; name: string; description: string; category: string; price: number; icon: string | null }

const ITEM_CAT_LABEL: Record<string, string> = { food: 'Đồ ăn', decor: 'Trang trí', boost: 'Tăng lực' };

export default function ModulesPage() {
  const router = useRouter();
  const [mods, setMods] = useState<Mod[] | null>(null);
  const [storeItems, setStoreItems] = useState<StoreItem[] | null>(null);
  const [bal, setBal] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [confirmOff, setConfirmOff] = useState('');           // id module đang hỏi "Tắt module này?"
  const [rentSheet, setRentSheet] = useState<Mod | null>(null); // sheet thuê/gia hạn
  const [rentDays, setRentDays] = useState(30);

  const load = () => {
    api<{ modules: Mod[] }>('/api/v1/modules').then((d) => setMods(d.modules)).catch(() => setMods([]));
    api<{ items: StoreItem[] }>('/api/v1/store/items').then((d) => setStoreItems(d.items)).catch(() => setStoreItems([]));
    api<{ balance: number }>('/api/v1/om/balance').then((d) => setBal(d.balance)).catch(() => {});
  };
  useEffect(() => { if (!getSession()) { router.replace('/'); return; } load(); }, [router]);

  // ?rent=<id> — OwnedBar/ModuleGate nhảy tới đây để mở sheet gia hạn ngay
  useEffect(() => {
    if (!mods) return;
    const id = new URLSearchParams(window.location.search).get('rent');
    if (!id) return;
    const m = mods.find((x) => x.id === id && x.tier === 'paid' && !x.purchased);
    if (m) { setRentSheet(m); setRentDays(30); }
    window.history.replaceState(null, '', '/modules');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mods === null]);

  async function act(m: Mod, action: 'purchase' | 'activate' | 'deactivate') {
    setBusy(m.id); setMsg(''); setConfirmOff('');
    try {
      const d = await api<any>(`/api/v1/modules/${m.id}/${action}`, { method: 'POST' });
      if (action === 'purchase') setMsg(`Đã mua ${m.name} (−${d.paidOm} Om · còn ${d.balance.toLocaleString('vi')})`);
      load();
    } catch (e: any) { setMsg(e.message); }
    finally { setBusy(''); }
  }

  async function doRent(m: Mod, days: number) {
    setBusy(m.id); setMsg('');
    try {
      const d = await api<any>(`/api/v1/modules/${m.id}/rent`, { method: 'POST', body: JSON.stringify({ days }) });
      setMsg(`Đã thuê ${m.name} ${days} ngày (−${d.paidOm} Om · còn ${d.balance.toLocaleString('vi')}) · hạn ${fmtDate(new Date(d.rentedUntil))}`);
      setRentSheet(null);
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
            <button key={m.id} onClick={() => router.push(m.route)} className="card store-card" style={{ minWidth: 86, padding: '13px 8px', borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, borderColor: 'rgba(52,211,184,.25)' }}>
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
                  <div key={m.id} className="card store-card" style={{ display: 'flex', gap: 12, padding: 14, borderRadius: 16, marginBottom: 9, alignItems: 'center', opacity: m.status === 'coming_soon' ? .55 : 1 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 13, background: m.active ? 'var(--jade-soft)' : 'var(--s3)', color: m.active ? 'var(--jade)' : 'var(--dim)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name={m.icon} size={20} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <b style={{ fontSize: 14 }}>{m.name}</b>
                        {m.tier === 'core' && <span className="bdg-s jade">CỐT LÕI</span>}
                        {m.status === 'coming_soon' && <span className="bdg-s violet">SẮP RA</span>}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--mut)', marginTop: 3 }}>{m.desc}</div>
                      {m.tier === 'paid' && !m.purchased && !m.rentedUntil && <div className="mono" style={{ fontSize: 11.5, color: 'var(--amber)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="coin" size={11} /> {m.priceOm} Om · mua 1 lần</div>}
                      {m.tier === 'paid' && !m.purchased && m.rentedUntil && (
                        m.rentDaysLeft !== null
                          ? <span className={`bdg-s ${m.rentDaysLeft <= 3 ? 'rose' : 'amber'}`} style={{ marginTop: 5 }}>THUÊ · còn {m.rentDaysLeft} ngày</span>
                          : <span className="bdg-s rose" style={{ marginTop: 5 }}>THUÊ · HẾT HẠN</span>
                      )}
                    </div>
                    {m.status === 'ready' && m.tier !== 'core' && (
                      (m.purchased || (m.rentDaysLeft !== null)) ? (
                        // đã sở hữu (mua hoặc thuê còn hạn) → switch bật/tắt (+ Gia hạn nếu đang thuê)
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
                          {!m.purchased && (
                            <button className="chip" onClick={() => { setRentSheet(m); setRentDays(30); }} style={{ fontSize: 11, padding: '5px 10px' }}>Gia hạn</button>
                          )}
                          {confirmOff === m.id ? (
                            <div className="sw-confirm">
                              <span>Tắt module này?</span>
                              <button className="no" onClick={() => setConfirmOff('')}>Hủy</button>
                              <button className="yes" disabled={busy === m.id} onClick={() => act(m, 'deactivate')}>Tắt</button>
                            </div>
                          ) : (
                            <button role="switch" aria-checked={m.active} aria-label={`${m.active ? 'Tắt' : 'Bật'} ${m.name}`}
                              className={`sw ${m.active ? 'on' : ''}`} disabled={busy === m.id}
                              onClick={() => m.active ? setConfirmOff(m.id) : act(m, 'activate')} />
                          )}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
                          {m.tier === 'paid' && (
                            <button disabled={busy === m.id} onClick={() => { setRentSheet(m); setRentDays(30); }}
                              style={{ borderRadius: 11, padding: '9px 13px', fontWeight: 700, fontSize: 12, background: 'transparent', border: '1.5px solid rgba(232,179,102,.4)', color: 'var(--amber)', opacity: busy === m.id ? .6 : 1 }}>
                              Thuê
                            </button>
                          )}
                          <button disabled={busy === m.id} onClick={() => m.tier === 'paid' ? act(m, 'purchase') : act(m, 'activate')}
                            style={{ border: 'none', borderRadius: 11, padding: '9px 14px', fontWeight: 700, fontSize: 12, background: 'var(--amber)', color: '#2a1c08', opacity: busy === m.id ? .6 : 1 }}>
                            {m.tier === 'paid' ? 'Mua' : 'Bật'}
                          </button>
                        </div>
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
            <div key={it.code} className="card store-card warm" style={{ display: 'flex', gap: 12, padding: 14, borderRadius: 16, marginBottom: 9, alignItems: 'center' }}>
              <div style={{ width: 42, height: 42, borderRadius: 13, background: 'var(--amber-soft)', color: 'var(--amber)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name={it.icon ?? 'gift'} size={20} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <b style={{ fontSize: 14 }}>{it.name}</b>
                  <span className="bdg-s mut">{ITEM_CAT_LABEL[it.category] ?? it.category}</span>
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

      {/* ── sheet thuê/gia hạn module (pattern sh-scrim/sh-panel DS v2) ── */}
      {rentSheet && (
        <div className="sh-scrim" onClick={() => setRentSheet(null)}>
          <div className="sh-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sh-head">
              <div className="sh-ico" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}><Icon name={rentSheet.icon} size={19} /></div>
              <div>
                <b className="fd" style={{ fontSize: 16 }}>{rentSheet.rentedUntil ? 'Gia hạn' : 'Thuê'} {rentSheet.name}</b>
                <div style={{ fontSize: 11.5, color: 'var(--mut)', marginTop: 2 }}>
                  Giá mua đứt: {rentSheet.priceOm} Om
                  {rentSheet.rentDaysLeft !== null && ` · đang thuê còn ${rentSheet.rentDaysLeft} ngày`}
                </div>
              </div>
              <button className="sh-x" onClick={() => setRentSheet(null)}><Icon name="x" size={14} /></button>
            </div>
            {RENT_PLANS.map((p) => {
              const price = rentPrice(rentSheet.priceOm, p.pct);
              const base = rentSheet.rentDaysLeft !== null && rentSheet.rentedUntil
                ? new Date(rentSheet.rentedUntil) : new Date();
              const until = new Date(base.getTime() + p.days * 86_400_000);
              return (
                <button key={p.days} className={`rent-opt ${rentDays === p.days ? 'sel' : ''}`} onClick={() => setRentDays(p.days)}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: rentDays === p.days ? 'var(--jade-soft)' : 'var(--s3)', color: rentDays === p.days ? 'var(--jade)' : 'var(--dim)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }} className="mono">{p.days}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 13.5 }}>{p.label}</b>
                    <div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 2 }}>Hạn dự kiến: {fmtDate(until)}</div>
                  </div>
                  <span className="mono" style={{ color: 'var(--amber)', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="coin" size={12} /> {price}</span>
                </button>
              );
            })}
            <button className="btn-p" disabled={busy === rentSheet.id} style={{ marginTop: 10, opacity: busy === rentSheet.id ? .6 : 1 }}
              onClick={() => doRent(rentSheet, rentDays)}>
              {busy === rentSheet.id ? 'Đang xử lý…' : `Xác nhận ${rentSheet.rentedUntil ? 'gia hạn' : 'thuê'} ${rentDays} ngày · ${rentPrice(rentSheet.priceOm, RENT_PLANS.find((p) => p.days === rentDays)!.pct)} Om`}
            </button>
            {bal !== null && <div style={{ fontSize: 11, color: 'var(--mut)', textAlign: 'center', marginTop: 9 }}>Số dư ví: {bal.toLocaleString('vi')} Om</div>}
          </div>
        </div>
      )}
    </Shell>
  );
}
