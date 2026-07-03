'use client';
// R2 redesign: .kb kanban đủ 5 stage (lead/quote/negotiation/won/lost — khớp enum deal_stage),
// .stat-row trên đầu, form → .sheet thống nhất. Data/endpoint GIỮ NGUYÊN.
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { ModuleLocked } from '../../components/ModuleGate';
import { EmptyState } from '../../components/EmptyState';
import { api, getSession } from '../../lib/api';

interface Deal { id: string; title: string; valueVnd: number; stage: string }
interface Contact { id: string; name: string; tag: string; phone: string | null }
// đủ 5 cột — khớp enum deal_stage trong DB ('lead','quote','negotiation','won','lost')
const STAGES = [
  ['lead', 'Liên hệ', 'var(--sky)'],
  ['quote', 'Báo giá', 'var(--violet)'],
  ['negotiation', 'Đàm phán', 'var(--amber)'],
  ['won', 'Thành công', 'var(--jade)'],
  ['lost', 'Thất bại', 'var(--rose)'],
] as const;
const ORDER = ['lead', 'quote', 'negotiation', 'won'];
const fmt = (v: number) => (v / 1e6).toFixed(1) + 'tr';
/** "22", "22.5", "22,5", "22tr" → 22.5 (triệu) */
const parseTr = (s: string) => { const n = parseFloat(s.replace(',', '.').replace(/[^\d.]/g, '')); return Number.isFinite(n) ? n : 0; };

export default function CrmPage() {
  const router = useRouter();
  const [locked, setLocked] = useState(false);
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [stats, setStats] = useState<{ openDeals: number; totalValueVnd: number } | null>(null);
  const [showAdd, setShowAdd] = useState<'' | 'deal' | 'contact'>('');
  const [showContacts, setShowContacts] = useState(false);
  const [f1, setF1] = useState(''); const [f2, setF2] = useState('');
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  const load = useCallback(() => {
    api<{ deals: Deal[] }>('/api/v1/crm/deals').then((d) => { setDeals(d.deals); setLocked(false); })
      .catch((e) => { if (/kích hoạt|hết hạn thuê/.test(String(e.message))) setLocked(true); else setDeals([]); });
    api<{ contacts: Contact[] }>('/api/v1/crm/contacts').then((d) => setContacts(d.contacts)).catch(() => {});
    api<{ openDeals: number; totalValueVnd: number }>('/api/v1/crm/stats').then(setStats).catch(() => {});
  }, []);
  useEffect(() => { if (!getSession()) { router.replace('/'); return; } load(); }, [router, load]);

  async function submitAdd() {
    if (!f1.trim()) return;
    try {
      if (showAdd === 'contact') {
        await api('/api/v1/crm/contacts', { method: 'POST', body: JSON.stringify({ name: f1.trim(), tag: f2.trim() || 'regular' }) });
        setMsg({ t: `Đã tạo khách "${f1.trim()}" — xem trong danh sách Khách hàng bên dưới.`, ok: true });
        setShowContacts(true);
      } else {
        const tr = parseTr(f2);
        await api('/api/v1/crm/deals', { method: 'POST', body: JSON.stringify({ title: f1.trim(), valueVnd: Math.round(tr * 1e6), stage: 'lead' }) });
        setMsg({ t: `Đã tạo deal "${f1.trim()}" (${tr}tr) — đang ở cột Liên hệ. Chạm deal để chuyển bước.`, ok: true });
      }
      setShowAdd(''); setF1(''); setF2(''); load();
    } catch (e: any) { setMsg({ t: e.message, ok: false }); } // KHÔNG đóng form khi lỗi
  }

  async function setStage(d: Deal, next: string) {
    const prev = d.stage;
    setDeals((p) => p?.map((x) => x.id === d.id ? { ...x, stage: next } : x) ?? null);
    try {
      await api(`/api/v1/crm/deals/${d.id}/stage`, { method: 'PATCH', body: JSON.stringify({ stage: next }) });
      api<{ openDeals: number; totalValueVnd: number }>('/api/v1/crm/stats').then(setStats).catch(() => {});
    } catch (e: any) {
      setDeals((p) => p?.map((x) => x.id === d.id ? { ...x, stage: prev } : x) ?? null);
      setMsg({ t: e.message, ok: false });
    }
  }
  // tap card = tiến bước tiếp theo (lead→quote→negotiation→won)
  function moveStage(d: Deal) {
    const idx = ORDER.indexOf(d.stage);
    if (idx < 0 || idx >= ORDER.length - 1) return;
    setStage(d, ORDER[idx + 1]);
  }

  const wonValue = deals?.filter((d) => d.stage === 'won').reduce((s, d) => s + d.valueVnd, 0) ?? 0;

  return (
    <Shell wide>
      <div className="scroll">
        <div className="pg-h" style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}><div className="k">Kinh doanh</div><h1>CRM</h1></div>
          <div style={{ display: 'flex', gap: 7 }}>
            <button onClick={() => { setShowAdd('deal'); setMsg(null); }} style={{ background: 'var(--jade)', border: 'none', borderRadius: 99, padding: '7px 13px', color: '#04231f', fontWeight: 700, fontSize: 12 }}>+ Deal</button>
            <button onClick={() => { setShowAdd('contact'); setMsg(null); }} style={{ background: 'var(--s1)', border: '1px solid var(--bd2)', borderRadius: 99, padding: '7px 13px', color: 'var(--txt)', fontWeight: 600, fontSize: 12 }}>+ Khách</button>
          </div>
        </div>
        {locked ? <ModuleLocked name="CRM" id="crm" /> : (
          <div className="biz-cols">
          <div className="biz-main">
            {msg && <div className="card" style={{ margin: '11px 20px 0', padding: '10px 13px', fontSize: 12.5, color: msg.ok ? 'var(--jade)' : 'var(--amber)', borderColor: msg.ok ? 'rgba(52,211,184,.3)' : 'rgba(232,179,102,.35)' }}>{msg.t}</div>}

            {/* Khách hàng */}
            <button onClick={() => setShowContacts((v) => !v)} style={{ margin: '14px 20px 0', width: 'calc(100% - 40px)', display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderRadius: 13, background: 'var(--s1)', border: '1px solid var(--bd)', color: 'var(--txt)', fontSize: 13, fontWeight: 700 }}>
              <Icon name="users" size={15} /> Khách hàng ({contacts?.length ?? 0})
              <span className="mono" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--mut)' }}>{showContacts ? 'thu gọn' : 'mở'}</span>
            </button>
            {showContacts && (
              <div style={{ padding: '8px 20px 0' }}>
                {contacts?.length === 0 && (
                  <EmptyState icon="people" title="Chưa có khách hàng" sub="Thêm khách đầu tiên để bắt đầu chăm sóc và gắn deal." cta="+ Thêm khách" onCta={() => { setShowAdd('contact'); setMsg(null); }} />
                )}
                {contacts && contacts.length > 0 && (
                  <div className="dt-wrap" style={{ margin: 0 }}>
                    <table className="dt">
                      <thead><tr><th>Khách</th><th>SĐT</th><th>Tag</th></tr></thead>
                      <tbody>
                        {contacts.map((c) => (
                          <tr key={c.id}>
                            <td style={{ fontWeight: 600 }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                                <span className={`ava ${c.tag === 'vip' ? 'amber' : 'mint'}`} style={{ width: 28, height: 28, borderRadius: 9, fontSize: 10 }}>{c.name.slice(0, 2)}</span>
                                {c.name}
                              </span>
                            </td>
                            <td className="mono" style={{ color: 'var(--mut)', fontSize: 11 }}>{c.phone ?? '—'}</td>
                            <td><span className={`bdg-s ${c.tag === 'vip' ? 'amber' : 'mut'}`}>{c.tag.toUpperCase()}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Kanban 5 cột — DS .kb */}
            {deals !== null && deals.length === 0 && (
              <EmptyState icon="search" title="Pipeline đang trống" sub="Tạo deal đầu tiên — deal mới vào cột Liên hệ, chạm để chuyển bước." cta="+ Tạo deal" onCta={() => { setShowAdd('deal'); setMsg(null); }} />
            )}
            <div className="kb">
              {STAGES.map(([key, label, color]) => {
                const col = deals?.filter((d) => d.stage === key) ?? [];
                return (
                  <div key={key} className="kb-col">
                    <div className="kb-h">
                      <span className="kb-dot" style={{ background: color }} />
                      {label}
                      <span className="kb-n">{col.length}</span>
                    </div>
                    {deals === null && <div className="skel" style={{ height: 76, borderRadius: 13 }} />}
                    {deals !== null && col.length === 0 && <div className="mono" style={{ fontSize: 10, color: 'var(--faint)', padding: '6px 4px 10px', textAlign: 'center' }}>trống</div>}
                    {col.map((d) => (
                      <div key={d.id} onClick={() => moveStage(d)} className="kb-card" style={{ cursor: ORDER.includes(d.stage) && d.stage !== 'won' ? 'pointer' : 'default' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>{d.title}</div>
                        <div className="mono" style={{ fontWeight: 700, fontSize: 15, color, marginTop: 6 }}>{fmt(d.valueVnd)}</div>
                        {d.stage !== 'won' && d.stage !== 'lost' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7 }}>
                            <span className="mono" style={{ fontSize: 9, color: 'var(--faint)', flex: 1 }}>chạm = chuyển bước</span>
                            <button onClick={(e) => { e.stopPropagation(); setStage(d, 'lost'); }} className="bdg-s rose" title="Đánh dấu thất bại"
                              style={{ border: '1px solid rgba(236,106,133,.3)', cursor: 'pointer' }}>✕ thua</button>
                          </div>
                        )}
                        {d.stage === 'lost' && (
                          <button onClick={(e) => { e.stopPropagation(); setStage(d, 'lead'); }} className="bdg-s sky" title="Mở lại deal"
                            style={{ border: '1px solid rgba(95,184,240,.3)', cursor: 'pointer', marginTop: 7 }}>↺ mở lại</button>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── R4 aside: thống kê pipeline + khách mới nhất ── */}
          <aside className="biz-aside">
            <div className="as-panel">
              <div className="as-h"><Icon name="target" /> Pipeline</div>
              <div className="as-kpis">
                <div className="as-kpi">
                  <div className="ii" style={{ background: 'var(--jade-soft)', color: 'var(--jade)' }}><Icon name="target" size={14} /></div>
                  <div className="v" style={{ color: 'var(--jade)' }}>{stats?.openDeals ?? '—'}</div>
                  <div className="l">Deal đang mở</div>
                </div>
                <div className="as-kpi">
                  <div className="ii" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}><Icon name="coin" size={14} /></div>
                  <div className="v" style={{ color: 'var(--amber)' }}>{stats ? fmt(stats.totalValueVnd) : '—'}</div>
                  <div className="l">Giá trị mở</div>
                </div>
                <div className="as-kpi">
                  <div className="ii" style={{ background: 'var(--sky-soft)', color: 'var(--sky)' }}><Icon name="check" size={14} /></div>
                  <div className="v" style={{ color: 'var(--sky)' }}>{deals ? fmt(wonValue) : '—'}</div>
                  <div className="l">Đã thắng</div>
                </div>
                <div className="as-kpi">
                  <div className="ii" style={{ background: 'var(--violet-soft)', color: 'var(--violet)' }}><Icon name="users" size={14} /></div>
                  <div className="v" style={{ color: 'var(--violet)' }}>{contacts?.length ?? '—'}</div>
                  <div className="l">Khách hàng</div>
                </div>
              </div>
              {/* giá trị từng stage — bar mini */}
              <div style={{ marginTop: 12 }}>
                {STAGES.map(([key, label, color]) => {
                  const val = deals?.filter((d) => d.stage === key).reduce((s, d) => s + d.valueVnd, 0) ?? 0;
                  const maxVal = Math.max(...STAGES.map(([k]) => deals?.filter((d) => d.stage === k).reduce((s, d) => s + d.valueVnd, 0) ?? 0), 1);
                  return (
                    <div key={key} className="as-bar">
                      <span className="lb">{label}</span>
                      <span className="tr"><i style={{ width: `${Math.max(2, (val / maxVal) * 100)}%`, background: color }} /></span>
                      <span className="n">{val > 0 ? fmt(val) : '—'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="as-panel">
              <div className="as-h"><Icon name="users" /> Khách mới nhất
                <button className="as-more" onClick={() => setShowContacts(true)}>tất cả <Icon name="chevron" size={11} /></button>
              </div>
              {contacts === null && <div className="skel" style={{ height: 80, borderRadius: 12 }} />}
              {contacts?.length === 0 && <p className="mut" style={{ fontSize: 12, padding: '4px 0' }}>Chưa có khách nào.</p>}
              {contacts?.slice(0, 5).map((c) => (
                <div key={c.id} className="as-it">
                  <span className={`ava ${c.tag === 'vip' ? 'amber' : 'mint'}`} style={{ width: 30, height: 30, borderRadius: 9, fontSize: 10 }}>{c.name.slice(0, 2)}</span>
                  <div className="ai-t"><b>{c.name}</b><span>{c.phone ?? 'chưa có SĐT'}</span></div>
                  <span className={`bdg-s ${c.tag === 'vip' ? 'amber' : 'mut'}`}>{c.tag.toUpperCase()}</span>
                </div>
              ))}
            </div>
          </aside>
          </div>
        )}
        <div style={{ height: 14 }} />
      </div>

      {/* Form thêm — .sheet thống nhất */}
      {showAdd && (
        <div className="sh-scrim" onClick={() => { setShowAdd(''); setMsg(null); }}>
          <div className="sh-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sh-head">
              <div className="sh-ico" style={{ background: 'var(--jade-soft)', color: 'var(--jade)' }}><Icon name={showAdd === 'deal' ? 'target' : 'users'} size={18} /></div>
              <b style={{ fontSize: 15 }}>{showAdd === 'deal' ? 'Deal mới (vào cột Liên hệ)' : 'Khách hàng mới'}</b>
              <button className="sh-x" onClick={() => { setShowAdd(''); setMsg(null); }}><Icon name="x" size={15} /></button>
            </div>
            <div style={{ display: 'grid', gap: 9 }}>
              <input value={f1} onChange={(e) => setF1(e.target.value)} placeholder={showAdd === 'deal' ? 'Tên deal (vd: HĐ Chị Lan)' : 'Tên khách'} className="inp" autoFocus />
              <input value={f2} onChange={(e) => setF2(e.target.value)} placeholder={showAdd === 'deal' ? 'Giá trị triệu (vd: 22 hoặc 22,5)' : 'Tag (vip / regular)'} className="inp" />
              <button onClick={submitAdd} className="btn-p" style={{ opacity: f1.trim() ? 1 : .5 }}>{showAdd === 'deal' ? 'Tạo deal' : 'Tạo khách'}</button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
