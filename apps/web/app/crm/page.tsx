'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { ModuleLocked } from '../../components/ModuleGate';
import { api, getSession } from '../../lib/api';

interface Deal { id: string; title: string; valueVnd: number; stage: string }
interface Contact { id: string; name: string; tag: string; phone: string | null }
const STAGES = [['lead', 'Liên hệ'], ['quote', 'Báo giá'], ['negotiation', 'Đàm phán'], ['won', 'Thành công']] as const;
const ORDER = ['lead', 'quote', 'negotiation', 'won'];
const fmt = (v: number) => (v / 1e6).toFixed(1) + 'tr';
/** "22", "22.5", "22,5", "22tr" → 22.5 (triệu) */
const parseTr = (s: string) => { const n = parseFloat(s.replace(',', '.').replace(/[^\d.]/g, '')); return Number.isFinite(n) ? n : 0; };
const inputSt = { padding: '10px 12px', borderRadius: 11, border: '1.5px solid var(--bd)', background: 'var(--s2)', color: 'var(--txt)', fontSize: 13, outline: 'none' } as const;

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
      .catch((e) => { if (String(e.message).includes('kích hoạt')) setLocked(true); else setDeals([]); });
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

  async function moveStage(d: Deal) {
    const idx = ORDER.indexOf(d.stage);
    if (idx < 0 || idx >= ORDER.length - 1) return;
    const next = ORDER[idx + 1];
    setDeals((p) => p?.map((x) => x.id === d.id ? { ...x, stage: next } : x) ?? null);
    try {
      await api(`/api/v1/crm/deals/${d.id}/stage`, { method: 'PATCH', body: JSON.stringify({ stage: next }) });
      api<{ openDeals: number; totalValueVnd: number }>('/api/v1/crm/stats').then(setStats).catch(() => {});
    } catch (e: any) {
      setDeals((p) => p?.map((x) => x.id === d.id ? { ...x, stage: d.stage } : x) ?? null);
      setMsg({ t: e.message, ok: false });
    }
  }

  return (
    <Shell>
      <div className="scroll">
        <div className="pg-h" style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}><div className="k">Kinh doanh</div><h1>CRM</h1></div>
          <div style={{ display: 'flex', gap: 7 }}>
            <button onClick={() => { setShowAdd('deal'); setMsg(null); }} style={{ background: 'var(--jade)', border: 'none', borderRadius: 99, padding: '7px 13px', color: '#04231f', fontWeight: 700, fontSize: 12 }}>+ Deal</button>
            <button onClick={() => { setShowAdd('contact'); setMsg(null); }} style={{ background: 'var(--s1)', border: '1px solid var(--bd2)', borderRadius: 99, padding: '7px 13px', color: 'var(--txt)', fontWeight: 600, fontSize: 12 }}>+ Khách</button>
          </div>
        </div>
        {locked ? <ModuleLocked name="CRM" /> : (
          <>
            {msg && <div className="card" style={{ margin: '11px 20px 0', padding: '10px 13px', fontSize: 12.5, color: msg.ok ? 'var(--jade)' : 'var(--amber)', borderColor: msg.ok ? 'rgba(52,211,184,.3)' : 'rgba(232,179,102,.35)' }}>{msg.t}</div>}
            {showAdd && (
              <div style={{ margin: '12px 20px 0', padding: 13, borderRadius: 15, background: 'var(--s1)', border: '1px solid var(--bd2)', display: 'grid', gap: 8 }}>
                <b style={{ fontSize: 13 }}>{showAdd === 'deal' ? 'Deal mới (vào cột Liên hệ)' : 'Khách hàng mới'}</b>
                <input value={f1} onChange={(e) => setF1(e.target.value)} placeholder={showAdd === 'deal' ? 'Tên deal (vd: HĐ Chị Lan)' : 'Tên khách'} style={inputSt} />
                <input value={f2} onChange={(e) => setF2(e.target.value)} placeholder={showAdd === 'deal' ? 'Giá trị triệu (vd: 22 hoặc 22,5)' : 'Tag (vip / regular)'} style={inputSt} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={submitAdd} className="btn-p" style={{ flex: 1, opacity: f1.trim() ? 1 : .5 }}>{showAdd === 'deal' ? 'Tạo deal' : 'Tạo khách'}</button>
                  <button onClick={() => { setShowAdd(''); setMsg(null); }} style={{ padding: '0 16px', borderRadius: 12, background: 'var(--s2)', border: '1px solid var(--bd)', color: 'var(--dim)' }}>Hủy</button>
                </div>
              </div>
            )}

            {/* Stats */}
            <div style={{ margin: '13px 20px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
              <div className="card" style={{ padding: 13, borderRadius: 14 }}><div className="mono" style={{ fontWeight: 700, fontSize: 20, color: 'var(--jade)' }}>{stats?.openDeals ?? '—'}</div><div style={{ fontSize: 10.5, color: 'var(--mut)', marginTop: 2 }}>Deal đang mở</div></div>
              <div className="card" style={{ padding: 13, borderRadius: 14 }}><div className="mono" style={{ fontWeight: 700, fontSize: 20, color: 'var(--amber)' }}>{stats ? fmt(stats.totalValueVnd) : '—'}</div><div style={{ fontSize: 10.5, color: 'var(--mut)', marginTop: 2 }}>Tổng giá trị mở</div></div>
            </div>

            {/* Khách hàng */}
            <button onClick={() => setShowContacts((v) => !v)} style={{ margin: '14px 20px 0', width: 'calc(100% - 40px)', display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderRadius: 13, background: 'var(--s1)', border: '1px solid var(--bd)', color: 'var(--txt)', fontSize: 13, fontWeight: 700 }}>
              <Icon name="users" size={15} /> Khách hàng ({contacts?.length ?? 0})
              <span className="mono" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--mut)' }}>{showContacts ? 'thu gọn' : 'mở'}</span>
            </button>
            {showContacts && (
              <div style={{ padding: '8px 20px 0' }}>
                {contacts?.length === 0 && <p className="mut" style={{ padding: 8, fontSize: 12.5 }}>Chưa có khách — bấm "+ Khách" ở trên.</p>}
                {contacts?.map((c) => (
                  <div key={c.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', borderRadius: 13, marginBottom: 7 }}>
                    <span className={`ava ${c.tag === 'vip' ? 'amber' : 'mint'}`} style={{ width: 32, height: 32, borderRadius: 10, fontSize: 11 }}>{c.name.slice(0, 2)}</span>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{c.name}</div>{c.phone && <div className="mono" style={{ fontSize: 10.5, color: 'var(--mut)' }}>{c.phone}</div>}</div>
                    <span className="mono" style={{ fontSize: 9, padding: '2px 8px', borderRadius: 6, background: c.tag === 'vip' ? 'var(--amber-soft)' : 'var(--s3)', color: c.tag === 'vip' ? 'var(--amber)' : 'var(--dim)' }}>{c.tag.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Kanban */}
            <div style={{ display: 'flex', gap: 10, padding: '15px 20px 4px', overflowX: 'auto', alignItems: 'flex-start' }}>
              {STAGES.map(([key, label]) => {
                const col = deals?.filter((d) => d.stage === key) ?? [];
                return (
                  <div key={key} style={{ minWidth: 200, flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 2px 9px' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--dim)' }}>{label}</span>
                      <span className="mono" style={{ fontSize: 10, color: 'var(--faint)' }}>{col.length}</span>
                    </div>
                    {deals === null && <div className="skel" style={{ height: 76, borderRadius: 14 }} />}
                    {col.map((d) => (
                      <div key={d.id} onClick={() => moveStage(d)} className="card" style={{ padding: 13, borderRadius: 14, marginBottom: 9, cursor: d.stage !== 'won' ? 'pointer' : 'default', ...(d.title.includes('Hoa') ? { borderColor: 'rgba(232,179,102,.35)', background: 'linear-gradient(160deg,var(--amber-soft),var(--s1))' } : {}) }}>
                        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>{d.title}</div>
                        <div className="mono" style={{ fontWeight: 700, fontSize: 16, color: 'var(--jade)', marginTop: 6 }}>{fmt(d.valueVnd)}</div>
                        {d.stage !== 'won' && <div className="mono" style={{ fontSize: 9, color: 'var(--faint)', marginTop: 5 }}>chạm = chuyển bước</div>}
                      </div>
                    ))}
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
