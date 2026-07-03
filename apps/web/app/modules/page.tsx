'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { CompanyModuleWizard } from '../../components/CompanyModuleWizard';
import { api, getSession } from '../../lib/api';

interface Mod { id: string; name: string; icon: string; desc: string; tier: string; priceOm: number; group: string; route: string; status: string; rentOnly?: boolean; active: boolean; purchased: boolean; rentedUntil: string | null; rentDaysLeft: number | null }
interface CompanyReq { id: string; companyName: string; status: string; payload: any; createdAt: string }

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
  // R5 Phase B: popup xác nhận mua vật phẩm + số lượng + hiệu ứng thành công
  const [buySheet, setBuySheet] = useState<StoreItem | null>(null);
  const [buyQty, setBuyQty] = useState(1);
  const [justBought, setJustBought] = useState('');           // code vật phẩm vừa mua — nút ✓ + confetti
  // R5 Phase C: demo flow Automato Thư Ký — loading giả lập → popup ⚠️ → widget
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoWarn, setDemoWarn] = useState(false);
  const [companyWizard, setCompanyWizard] = useState(false);
  const [companyRequests, setCompanyRequests] = useState<CompanyReq[]>([]);

  const load = () => {
    api<{ modules: Mod[] }>('/api/v1/modules').then((d) => setMods(d.modules)).catch(() => setMods([]));
    api<{ items: StoreItem[] }>('/api/v1/store/items').then((d) => setStoreItems(d.items)).catch(() => setStoreItems([]));
    api<{ requests: CompanyReq[] }>('/api/v1/company-module/requests').then((d) => setCompanyRequests(d.requests)).catch(() => setCompanyRequests([]));
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

  // R5: xác nhận mua từ popup — gửi qty, hiệu ứng ✓ + confetti + ticker ví
  async function confirmBuy() {
    if (!buySheet) return;
    const it = buySheet;
    setBusy(it.code); setMsg('');
    try {
      const d = await api<any>(`/api/v1/store/items/${it.code}/buy`, { method: 'POST', body: JSON.stringify({ qty: buyQty }) });
      setBuySheet(null);
      setMsg(`Đã mua ${d.qtyBought > 1 ? `${d.qtyBought} × ` : ''}${it.name} (−${d.paidOm} Om)`);
      setJustBought(it.code);
      setTimeout(() => setJustBought(''), 1600);
      if (typeof d.balance === 'number') setBal(d.balance);
      load();
    } catch (e: any) { setMsg(e.message); }
    finally { setBusy(''); }
  }

  // R5: demo flow Automato Thư Ký — KHÔNG gọi API thật, chỉ FE
  function startSecretaryDemo() {
    setDemoLoading(true);
    setTimeout(() => { setDemoLoading(false); setDemoWarn(true); }, 1500);
  }
  function ackSecretaryWarn() {
    setDemoWarn(false);
    window.dispatchEvent(new Event('citadel:secretary-demo')); // Shell → SecretaryWidget xuất hiện
  }

  const enabled = mods?.filter((m) => m.active) ?? [];
  const renting = mods?.filter((m) => !m.purchased && m.rentedUntil && m.rentDaysLeft !== null) ?? []; // R5: đang thuê còn hạn
  const groups = ['May Đo Doanh Nghiệp', 'AI Automation', 'Kinh doanh', 'Tài chính', 'Vận hành', 'Nhân sự', 'Cốt lõi'];

  return (
    <Shell wide>
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

        {/* R5: Đang thuê — chỉ hiện khi có module thuê còn hạn, kèm ngày hết hạn + nút gia hạn */}
        {renting.length > 0 && (
          <>
            <div style={{ padding: '20px 20px 0', fontSize: 13, fontWeight: 700, color: 'var(--dim)', display: 'flex', alignItems: 'center', gap: 7 }}>
              <Icon name="clock" size={14} style={{ color: 'var(--amber)' }} /> Đang thuê
            </div>
            <div style={{ padding: '11px 20px 0', display: 'grid', gap: 9 }}>
              {renting.map((m) => (
                <div key={m.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderRadius: 16, borderColor: (m.rentDaysLeft ?? 0) <= 3 ? 'rgba(236,106,133,.35)' : 'rgba(232,179,102,.3)' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--amber-soft)', color: 'var(--amber)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name={m.icon} size={19} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 13.5 }}>{m.name}</b>
                    <div style={{ fontSize: 11, marginTop: 2, color: (m.rentDaysLeft ?? 0) <= 3 ? 'var(--rose)' : 'var(--mut)' }}>
                      Còn {m.rentDaysLeft} ngày · hết hạn {m.rentedUntil ? fmtDate(new Date(m.rentedUntil)) : '—'}
                    </div>
                  </div>
                  <button className="chip" style={{ fontSize: 11.5, padding: '7px 13px', color: 'var(--amber)', borderColor: 'rgba(232,179,102,.4)' }}
                    onClick={() => { setRentSheet(m); setRentDays(30); }}>
                    Gia hạn
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Cửa hàng theo nhóm — R4: mod-card grid (icon lớn, giá nổi bật, switch/badge trên đầu card) */}
        {groups.map((g) => {
          const list = mods?.filter((m) => m.group === g) ?? [];
          if (!list.length && mods !== null) return null;
          return (
            <div key={g}>
              <div style={{ padding: '20px 20px 0', fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: 'var(--faint)', textTransform: 'uppercase' }}>{g}</div>
              <div className="mod-grid">
                {list.map((m) => (
                  <div key={m.id} data-tut={m.id === 'company-module' ? 'company-module-card' : undefined} className={`mod-card ${m.status === 'coming_soon' ? 'off' : ''} ${m.id === 'company-module' ? 'company-custom' : ''}`}>
                    <div className="mod-top">
                      <div className="mod-ico" style={{ background: m.active ? 'var(--jade-soft)' : 'var(--s3)', color: m.active ? 'var(--jade)' : 'var(--dim)' }}><Icon name={m.icon} size={23} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="mod-name">{m.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
                          {m.tier === 'core' && <span className="bdg-s jade">CỐT LÕI</span>}
                          {m.status === 'coming_soon' && <span className="bdg-s violet">SẮP RA</span>}
                          {m.status === 'demo' && <span className="bdg-s violet">DEMO</span>}
                          {m.tier === 'paid' && m.purchased && <span className="bdg-s jade">SỞ HỮU</span>}
                          {m.tier === 'paid' && !m.purchased && m.rentedUntil && (
                            m.rentDaysLeft !== null
                              ? <span className={`bdg-s ${m.rentDaysLeft <= 3 ? 'rose' : 'amber'}`}>THUÊ · còn {m.rentDaysLeft} ngày</span>
                              : <span className="bdg-s rose">THUÊ · HẾT HẠN</span>
                          )}
                          {m.tier === 'free' && m.status === 'ready' && !m.active && <span className="bdg-s mut">MIỄN PHÍ</span>}
                          {m.tier === 'custom' && <span className="bdg-s jade">MAY ĐO</span>}
                          {m.id === 'company-module' && companyRequests[0] && <span className="bdg-s amber">HỒ SƠ · {companyRequests[0].status}</span>}
                        </div>
                      </div>
                      {m.status === 'ready' && m.tier !== 'core' && (m.purchased || m.rentDaysLeft !== null) && (
                        confirmOff === m.id ? (
                          <div className="sw-confirm">
                            <span>Tắt?</span>
                            <button className="no" onClick={() => setConfirmOff('')}>Hủy</button>
                            <button className="yes" disabled={busy === m.id} onClick={() => act(m, 'deactivate')}>Tắt</button>
                          </div>
                        ) : (
                          <button role="switch" aria-checked={m.active} aria-label={`${m.active ? 'Tắt' : 'Bật'} ${m.name}`}
                            className={`sw ${m.active ? 'on' : ''}`} disabled={busy === m.id}
                            onClick={() => m.active ? setConfirmOff(m.id) : act(m, 'activate')} />
                        )
                      )}
                    </div>
                    <div className="mod-desc">{m.desc}</div>
                    <div className="mod-foot">
                      {m.id === 'company-module' ? (
                        <>
                          <span className="mod-price"><Icon name="coin" size={14} /> Báo giá sau <small>khi nhận hồ sơ</small></span>
                          {companyRequests[0] ? <button className="chip" onClick={() => setCompanyWizard(true)} style={{ marginLeft: 'auto', fontSize: 11, padding: '7px 12px', color: 'var(--jade)' }}>Hồ sơ {companyRequests[0].companyName}: Đã tiếp nhận ⏳</button> : <button onClick={() => setCompanyWizard(true)} style={{ marginLeft: 'auto', border: 'none', borderRadius: 12, padding: '9px 14px', fontWeight: 800, fontSize: 12, background: 'linear-gradient(135deg,var(--jade),var(--amber))', color: '#04231f' }}>＋ Add Module Company</button>}
                        </>
                      ) : m.status === 'demo' ? (
                        <>
                          <span className="mod-price"><Icon name="coin" size={14} /> {m.priceOm} <small>Om · thuê — đang xây dựng</small></span>
                          <button disabled={demoLoading} onClick={startSecretaryDemo}
                            style={{ marginLeft: 'auto', border: 'none', borderRadius: 11, padding: '8px 14px', fontWeight: 700, fontSize: 12, background: 'linear-gradient(135deg, var(--jade), var(--violet, #9889e8))', color: '#04231f', display: 'flex', alignItems: 'center', gap: 6, opacity: demoLoading ? .7 : 1 }}>
                            {demoLoading ? <><span className="spin" style={{ width: 13, height: 13, border: '2px solid rgba(4,35,31,.35)', borderTopColor: '#04231f', borderRadius: '50%', display: 'inline-block', animation: 'spin .7s linear infinite' }} /> Khởi tạo…</> : 'Dùng thử'}
                          </button>
                        </>
                      ) : m.tier === 'paid' && !m.purchased
                        ? <span className="mod-price"><Icon name="coin" size={14} /> {m.priceOm} <small>Om · mua 1 lần</small></span>
                        : m.tier === 'core'
                          ? <span className="mono" style={{ fontSize: 11, color: 'var(--jade)', fontWeight: 700 }}>Luôn bật</span>
                          : <span className="mono" style={{ fontSize: 11, color: 'var(--mut)', fontWeight: 600 }}>{m.active ? 'Đang hoạt động' : m.purchased ? 'Đã mua · đang tắt' : m.tier === 'free' ? '0 Om' : ''}</span>}
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
                        {m.status === 'ready' && m.tier === 'paid' && !m.purchased && m.rentDaysLeft !== null && (
                          <button className="chip" onClick={() => { setRentSheet(m); setRentDays(30); }} style={{ fontSize: 11, padding: '6px 11px' }}>Gia hạn</button>
                        )}
                        {m.status === 'ready' && m.tier !== 'core' && !m.purchased && m.rentDaysLeft === null && (
                          <>
                            {m.tier === 'paid' && (
                              <button disabled={busy === m.id} onClick={() => { setRentSheet(m); setRentDays(30); }}
                                style={{ borderRadius: 11, padding: '8px 13px', fontWeight: 700, fontSize: 12, background: 'transparent', border: '1.5px solid rgba(232,179,102,.4)', color: 'var(--amber)', opacity: busy === m.id ? .6 : 1 }}>
                                Thuê
                              </button>
                            )}
                            <button disabled={busy === m.id} onClick={() => m.tier === 'paid' ? act(m, 'purchase') : act(m, 'activate')}
                              style={{ border: 'none', borderRadius: 11, padding: '8px 14px', fontWeight: 700, fontSize: 12, background: 'var(--amber)', color: '#2a1c08', opacity: busy === m.id ? .6 : 1 }}>
                              {m.tier === 'paid' ? 'Mua' : 'Bật'}
                            </button>
                          </>
                        )}
                        {m.active && <button className="chip" onClick={() => router.push(m.route)} style={{ fontSize: 11, padding: '6px 11px' }}>Mở →</button>}
                      </div>
                    </div>
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
              <button disabled={busy === it.code} onClick={() => { setBuySheet(it); setBuyQty(1); }}
                style={{ position: 'relative', border: 'none', borderRadius: 11, padding: '9px 14px', fontWeight: 700, fontSize: 12, background: justBought === it.code ? 'var(--jade)' : 'var(--amber)', color: justBought === it.code ? '#04231f' : '#2a1c08', opacity: busy === it.code ? .6 : 1, transition: 'background .25s' }}>
                {justBought === it.code ? <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="check" size={13} /> Đã mua</span> : 'Mua'}
                {justBought === it.code && <span className="confetti-burst"><i /><i /><i /><i /><i /><i /><i /><i /></span>}
              </button>
            </div>
          ))}
        </div>
        <div style={{ height: 14 }} />
      </div>

      {/* ── R5: popup cảnh báo ⚠️ demo Automato Thư Ký ── */}
      {demoWarn && (
        <div className="sh-scrim" onClick={ackSecretaryWarn}>
          <div className="sh-panel warn-pop" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="wp-ico"><Icon name="alert" size={30} /></div>
            <b className="fd" style={{ display: 'block', fontSize: 17, marginTop: 14 }}>Automato Thư Ký — bản demo</b>
            <p style={{ fontSize: 13, color: 'var(--mut)', lineHeight: 1.6, margin: '10px 4px 0' }}>
              Đây là thư ký auto — đang trong quá trình build. Tương lai sẽ có model LLM riêng.
            </p>
            <button className="btn-p" style={{ marginTop: 18 }} onClick={ackSecretaryWarn}>Đã hiểu</button>
          </div>
        </div>
      )}

      {/* ── R5: popup xác nhận mua vật phẩm — stepper số lượng + tổng Om ── */}
      {buySheet && (
        <div className="sh-scrim" onClick={() => setBuySheet(null)}>
          <div className="sh-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sh-head">
              <div className="sh-ico" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}><Icon name={buySheet.icon ?? 'gift'} size={19} /></div>
              <div>
                <b className="fd" style={{ fontSize: 16 }}>Mua {buySheet.name}</b>
                <div style={{ fontSize: 11.5, color: 'var(--mut)', marginTop: 2 }}>{ITEM_CAT_LABEL[buySheet.category] ?? buySheet.category} · {buySheet.price} Om/cái</div>
              </div>
              <button className="sh-x" onClick={() => setBuySheet(null)}><Icon name="x" size={14} /></button>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--mut)', margin: '12px 2px 0', lineHeight: 1.5 }}>{buySheet.description}</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Số lượng</span>
              <div className="qty-step">
                <button aria-label="Giảm" disabled={buyQty <= 1} onClick={() => setBuyQty((q) => Math.max(1, q - 1))}>−</button>
                <span className="qty-n">{buyQty}</span>
                <button aria-label="Tăng" onClick={() => setBuyQty((q) => Math.min(99, q + 1))} disabled={buyQty >= 99}>+</button>
              </div>
            </div>
            <div className="card" style={{ marginTop: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', background: 'var(--amber-soft)', borderColor: 'rgba(232,179,102,.25)' }}>
              <span style={{ fontSize: 12.5, color: 'var(--mut)' }}>Tổng thanh toán</span>
              <span className="mono" style={{ marginLeft: 'auto', fontSize: 16, fontWeight: 800, color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Icon name="coin" size={14} /> {(buyQty * buySheet.price).toLocaleString('vi')} Om
              </span>
            </div>
            {bal !== null && buyQty * buySheet.price > bal && (
              <div style={{ marginTop: 9, padding: '9px 12px', borderRadius: 11, background: 'rgba(236,106,133,.12)', color: 'var(--rose)', fontSize: 12 }}>Không đủ Om — số dư hiện có {bal.toLocaleString('vi')} Om</div>
            )}
            <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
              <button onClick={() => setBuySheet(null)} style={{ flex: 1, borderRadius: 13, padding: '13px 0', fontWeight: 700, fontSize: 13.5, background: 'var(--s3)', border: '1px solid var(--bd)', color: 'var(--dim)' }}>Hủy</button>
              <button className="btn-p" onClick={confirmBuy} disabled={busy === buySheet.code || (bal !== null && buyQty * buySheet.price > bal)}
                style={{ flex: 2, opacity: busy === buySheet.code || (bal !== null && buyQty * buySheet.price > bal) ? .55 : 1 }}>
                {busy === buySheet.code ? 'Đang mua…' : `Xác nhận mua · ${(buyQty * buySheet.price).toLocaleString('vi')} Om`}
              </button>
            </div>
            {bal !== null && <div style={{ fontSize: 11, color: 'var(--mut)', textAlign: 'center', marginTop: 9 }}>Số dư ví: {bal.toLocaleString('vi')} Om</div>}
          </div>
        </div>
      )}

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
    <CompanyModuleWizard open={companyWizard} onClose={() => setCompanyWizard(false)} onCreated={(r) => setCompanyRequests((xs) => [r, ...xs])} />
    </Shell>
  );
}
