'use client';
// App shell: ambient bg + bottom nav + Tiểu Tâm sheet (SSE streaming thật).
import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from './Icon';
import { API, getSession } from '../lib/api';
import { applyTheme, applyStoredTheme } from '../lib/theme';

interface Msg { who: 'ai' | 'me'; text: string; tool?: any; suggestions?: string[] }

export function Shell({ children, badge }: { children: React.ReactNode; badge?: number }) {
  const path = usePathname();
  const router = useRouter();
  const [ttOpen, setTtOpen] = useState(false);

  // V7A P5: trang /tieu-tam (hoặc bất kỳ trang nào) mở sheet chat qua custom event
  useEffect(() => {
    const open = () => setTtOpen(true);
    window.addEventListener('citadel:tt-chat', open);
    return () => window.removeEventListener('citadel:tt-chat', open);
  }, []);

  // theme từ vật phẩm decor (V7A P3) — áp ngay từ cache, sync lại từ server
  useEffect(() => {
    applyStoredTheme();
    const s = getSession();
    if (!s) return;
    fetch(`${API}/api/v1/tieu-tam/state`, { headers: { Authorization: `Bearer ${s.jwt}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.theme && applyTheme(d.theme))
      .catch(() => {});
  }, []);

  // time-aware ambient
  useEffect(() => {
    const h = new Date().getHours(); const r = document.documentElement.style;
    if (h >= 5 && h < 11) { r.setProperty('--amb1', 'rgba(232,179,102,.09)'); r.setProperty('--amb2', 'rgba(52,211,184,.07)'); }
    else if (h >= 11 && h < 16) { r.setProperty('--amb1', 'rgba(52,211,184,.11)'); r.setProperty('--amb2', 'rgba(95,184,240,.07)'); }
    else if (h >= 16 && h < 19) { r.setProperty('--amb1', 'rgba(232,179,102,.08)'); r.setProperty('--amb2', 'rgba(152,137,232,.07)'); }
    else { r.setProperty('--amb1', 'rgba(52,211,184,.07)'); r.setProperty('--amb2', 'rgba(152,137,232,.08)'); }
  }, []);

  const nav = (to: string) => () => router.push(to);
  const is = (p: string) => path === p || path?.startsWith(p + '/');

  return (
    <>
      <div className="ambient" />
      <div className="shell">
        {children}
        <nav className="botnav">
          <button className={`bn ${is('/home') ? 'active' : ''}`} onClick={nav('/home')}><Icon name="home" />Trang chủ</button>
          <button className={`bn ${is('/chat') ? 'active' : ''}`} onClick={nav('/chat')}>
            <Icon name="chat" />Nhắn tin{badge ? <span className="bdg">{badge}</span> : null}
          </button>
          <button className={`bn bn-c ${is('/tieu-tam') ? 'active' : ''}`} onClick={nav('/tieu-tam')}>
            <div className="core"><div className="pulse" /><div className="orb"><Icon name="spark" size={20} /></div></div>
            <span>Tiểu Tâm</span>
          </button>
          <button className={`bn ${is('/modules') || is('/items') || is('/crm') || is('/inventory') || is('/hr') || is('/accounting') ? 'active' : ''}`} onClick={nav('/modules')}><Icon name="grid" />Module</button>
          <button className={`bn ${is('/settings') ? 'active' : ''}`} onClick={nav('/settings')}><Icon name="user" />Tôi</button>
        </nav>
      </div>
      <TieuTamSheet open={ttOpen} onClose={() => setTtOpen(false)} />
    </>
  );
}

interface SoulState { energy: number; status: string; statusLabel: string; mood: string; engine?: string }

const STATUS_COLOR: Record<string, string> = {
  tran_day: 'var(--jade)',
  on_dinh: 'var(--sky, #5fb8f0)',
  met: 'var(--amber, #e8b366)',
  kiet_suc: 'var(--rose, #e87a8a)',
};
const MOOD_EMOJI: Record<string, string> = { vui: '😊', binh_thuong: '🙂', met: '😮‍💨', kiet_suc: '🥺' };

function TieuTamSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([
    { who: 'ai', text: 'Chào bạn! Tôi là Tiểu Tâm. Hỏi tôi về doanh thu, deal, tồn kho, ca làm…', suggestions: ['Doanh thu hôm nay', 'Deal đang mở', 'Tồn kho thế nào'] },
  ]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [soul, setSoul] = useState<SoulState | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => { boxRef.current?.scrollTo({ top: 1e9 }); }, [msgs, streaming]);

  // mở sheet → lấy trạng thái hồn (mood + energy + engine)
  useEffect(() => {
    if (!open) return;
    const s = getSession();
    fetch(`${API}/api/v1/tieu-tam/state`, { headers: { Authorization: `Bearer ${s?.jwt ?? ''}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSoul(d))
      .catch(() => {});
  }, [open]);

  async function ask(q: string) {
    if (!q.trim() || streaming) return;
    setDraft('');
    setMsgs((m) => [...m, { who: 'me', text: q }, { who: 'ai', text: '' }]);
    setStreaming(true);
    const s = getSession();
    try {
      const res = await fetch(`${API}/api/v1/tieu-tam/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s?.jwt ?? ''}` },
        body: JSON.stringify({ message: q, userName: s?.user.displayName ?? undefined }),
      });
      if (!res.ok || !res.body) throw new Error('stream fail');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const events = buf.split('\n\n'); buf = events.pop() ?? '';
        for (const ev of events) {
          const type = /event: (\w+)/.exec(ev)?.[1];
          const data = /data: ([\s\S]*)/.exec(ev)?.[1] ?? '';
          if (type === 'energy') { try { setSoul((prev) => ({ ...prev, ...JSON.parse(data) })); } catch {} continue; }
          setMsgs((m) => {
            const last = { ...m[m.length - 1] };
            if (type === 'token') last.text += data;
            if (type === 'tool') { try { last.tool = JSON.parse(data); } catch {} }
            if (type === 'suggestions') { try { last.suggestions = JSON.parse(data); } catch {} }
            return [...m.slice(0, -1), last];
          });
        }
      }
    } catch {
      setMsgs((m) => [...m.slice(0, -1), { who: 'ai', text: 'Không kết nối được. Kiểm tra đăng nhập / API.' }]);
    } finally { setStreaming(false); }
  }

  return (
    <>
      <div className={`tt-scrim ${open ? 'open' : ''}`} onClick={onClose} />
      <div className={`tt-sheet ${open ? 'open' : ''}`}>
        <div style={{ width: 38, height: 4, borderRadius: 3, background: 'var(--bd2)', margin: '10px auto 2px' }} />
        <div style={{ padding: '8px 18px 13px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--line)' }}>
          <div className="core" style={{ width: 40, height: 40 }}><div className="pulse" /><div className="orb"><Icon name="spark" size={18} /></div></div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <b className="fd" style={{ fontSize: 16 }}>Tiểu Tâm</b>
            {soul ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                <span style={{ fontSize: 12 }}>{MOOD_EMOJI[soul.mood] ?? '😊'}</span>
                <div style={{ flex: 1, maxWidth: 110, height: 5, borderRadius: 3, background: 'var(--s1)', border: '1px solid var(--bd)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(3, Math.min(100, soul.energy))}%`, height: '100%', borderRadius: 3, background: STATUS_COLOR[soul.status] ?? 'var(--jade)', transition: 'width .4s ease' }} />
                </div>
                <span style={{ fontSize: 11, color: STATUS_COLOR[soul.status] ?? 'var(--jade)', whiteSpace: 'nowrap' }}>{soul.statusLabel ?? ''} · {Math.round(soul.energy)}%</span>
              </div>
            ) : (
              <div style={{ fontSize: 11.5, color: 'var(--jade)' }}>● trực tuyến</div>
            )}
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', width: 34, height: 34, borderRadius: 10, background: 'var(--s1)', border: '1px solid var(--bd)', color: 'var(--dim)', display: 'grid', placeItems: 'center' }}><Icon name="x" size={15} /></button>
        </div>
        <div ref={boxRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
          {msgs.map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 9, maxWidth: '88%', alignSelf: m.who === 'me' ? 'flex-end' : 'flex-start', flexDirection: m.who === 'me' ? 'row-reverse' : 'row' }}>
              {m.who === 'ai'
                ? <div style={{ width: 28, height: 28, borderRadius: 9, background: 'linear-gradient(135deg,var(--jade),var(--jade-d))', display: 'grid', placeItems: 'center', alignSelf: 'flex-end', color: '#04231f', flexShrink: 0 }}><Icon name="spark" size={15} /></div>
                : <div className="ava sky" style={{ width: 28, height: 28, fontSize: 11, alignSelf: 'flex-end' }}>{'M'}</div>}
              <div style={{ minWidth: 0 }}>
                {m.text || m.who === 'me' ? <div className={`bub ${m.who === 'me' ? 'me' : 'ai'}`}>{m.text}{m.who === 'ai' && streaming && i === msgs.length - 1 ? <span className="blink" /> : null}</div>
                  : <div className="typing"><span /><span /><span /></div>}
                {m.tool && (
                  <div className="tcard"><div className="th">{m.tool[0]?.tool} · {m.tool[0]?.module} <span style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: 'var(--jade)' }} /></div>
                    <pre className="mono" style={{ padding: 12, fontSize: 11, color: 'var(--dim)', overflow: 'auto' }}>{JSON.stringify(m.tool[0]?.result, null, 1)}</pre></div>
                )}
                {m.suggestions && !streaming && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
                    {m.suggestions.map((sg) => <button key={sg} className="chip" onClick={() => ask(sg)}>{sg}</button>)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--s1)', border: '1.5px solid var(--bd)', borderRadius: 14, padding: '7px 7px 7px 14px' }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask(draft)} placeholder="Hỏi Tiểu Tâm bất cứ điều gì…" style={{ flex: 1, background: 'none', border: 'none', color: 'var(--txt)', fontSize: 14, outline: 'none' }} />
            <button onClick={() => ask(draft)} style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: 'var(--jade)', color: '#04231f', display: 'grid', placeItems: 'center' }}><Icon name="send" size={17} /></button>
          </div>
        </div>
      </div>
    </>
  );
}
