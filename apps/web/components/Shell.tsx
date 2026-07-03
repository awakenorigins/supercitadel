'use client';
// SUPERCITADEL Shell V2 — desktop: sidebar collapsible + topbar (breadcrumb/search/bell/energy pill);
// mobile: bottom nav 5 mục (giữ V7A). Tiểu Tâm sheet SSE streaming GIỮ NGUYÊN hoạt động.
import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from './Icon';
import { OwnedBar } from './OwnedBar';
import { API, api, getSession } from '../lib/api';
import { applyTheme, applyStoredTheme } from '../lib/theme';

interface Msg { who: 'ai' | 'me'; text: string; tool?: any; suggestions?: string[] }
interface SoulState { energy: number; status: string; statusLabel: string; mood: string; engine?: string }

const STATUS_COLOR: Record<string, string> = {
  tran_day: 'var(--jade)',
  on_dinh: 'var(--sky, #5fb8f0)',
  met: 'var(--amber, #e8b366)',
  kiet_suc: 'var(--rose, #e87a8a)',
};
const MOOD_EMOJI: Record<string, string> = { vui: '😊', binh_thuong: '🙂', met: '😮‍💨', kiet_suc: '🥺' };

// Nav groups V2 (học pattern shadcn-admin/Kiranism — group label + items)
const NAV_GROUPS: { label: string; items: { to: string; icon: string; label: string }[] }[] = [
  { label: 'Tổng quan', items: [
    { to: '/home', icon: 'home', label: 'Trang chủ' },
    { to: '/chat', icon: 'chat', label: 'Nhắn tin' },
  ]},
  { label: 'Nghiệp vụ', items: [
    { to: '/accounting', icon: 'book', label: 'Kế toán' },
    { to: '/crm', icon: 'target', label: 'CRM' },
    { to: '/inventory', icon: 'box', label: 'Kho hàng' },
    { to: '/hr', icon: 'users', label: 'Nhân sự' },
  ]},
  { label: 'Kinh tế', items: [
    { to: '/om', icon: 'coin', label: 'Ví Om' },
    { to: '/modules', icon: 'grid', label: 'Cửa hàng' },
    { to: '/items', icon: 'bag', label: 'Kho vật phẩm' },
  ]},
];
const PAGE_LABEL: Record<string, string> = {
  '/home': 'Trang chủ', '/chat': 'Nhắn tin', '/accounting': 'Kế toán', '/crm': 'CRM',
  '/inventory': 'Kho hàng', '/hr': 'Nhân sự', '/om': 'Ví Om', '/modules': 'Cửa hàng Module',
  '/items': 'Kho vật phẩm', '/tieu-tam': 'Tiểu Tâm', '/settings': 'Cài đặt',
  '/notifications': 'Thông báo', '/search': 'Tìm kiếm',
};
// R2: breadcrumb 2 cấp — tên nhóm lấy từ NAV_GROUPS (+ các trang ngoài nav groups)
const GROUP_EXTRA: Record<string, string> = {
  '/tieu-tam': 'Tiểu Tâm', '/settings': 'Hệ thống', '/notifications': 'Hệ thống', '/search': 'Hệ thống',
};
function groupOf(path: string): string | null {
  for (const g of NAV_GROUPS) if (g.items.some((it) => path === it.to || path.startsWith(it.to + '/'))) return g.label;
  const k = Object.keys(GROUP_EXTRA).find((p) => path === p || path.startsWith(p + '/'));
  return k ? GROUP_EXTRA[k] : null;
}

export function Shell({ children, badge, wide }: { children: React.ReactNode; badge?: number; wide?: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const [ttOpen, setTtOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [soul, setSoul] = useState<SoulState | null>(null);
  const [unread, setUnread] = useState(0);
  const [userName, setUserName] = useState('');
  const [role, setRole] = useState('');

  // V7A P5: trang /tieu-tam (hoặc bất kỳ trang nào) mở sheet chat qua custom event
  useEffect(() => {
    const open = () => setTtOpen(true);
    window.addEventListener('citadel:tt-chat', open);
    return () => window.removeEventListener('citadel:tt-chat', open);
  }, []);

  // sidebar collapse — nhớ qua localStorage
  useEffect(() => {
    try { if (localStorage.getItem('citadel.sb') === '1') setCollapsed(true); } catch {}
  }, []);
  const toggleSb = () => setCollapsed((c) => {
    try { localStorage.setItem('citadel.sb', c ? '0' : '1'); } catch {}
    return !c;
  });

  // theme từ vật phẩm decor (V7A P3) + soul state cho energy pill/dot
  useEffect(() => {
    applyStoredTheme();
    const s = getSession();
    if (!s) return;
    setUserName(s.user.displayName ?? 'Người dùng');
    setRole(s.user.role);
    fetch(`${API}/api/v1/tieu-tam/state`, { headers: { Authorization: `Bearer ${s.jwt}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setSoul(d); if (d.theme) applyTheme(d.theme); } })
      .catch(() => {});
    api<{ notifications: any[] }>('/api/v1/notifications?unread=true')
      .then((d) => setUnread(d.notifications.length)).catch(() => {});
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
  const roleLabel: Record<string, string> = { super_admin: 'Quản trị hệ thống', owner: 'Chủ quán', manager: 'Quản lý', staff: 'Nhân viên' };
  const pageLabel = PAGE_LABEL[Object.keys(PAGE_LABEL).find((p) => is(p)) ?? ''] ?? 'SUPERCITADEL';
  const groupLabel = groupOf(path ?? '');
  const energyColor = soul ? (STATUS_COLOR[soul.status] ?? 'var(--jade)') : 'var(--jade)';

  return (
    <>
      <div className="ambient" />
      <div className={`app ${collapsed ? 'sb-collapsed' : ''}`}>
        {/* ── sidebar (desktop) ── */}
        <aside className="sidebar">
          <div className="sb-head">
            <div className="sb-logo"><Icon name="fox" size={21} /></div>
            <div className="sb-brand">
              <b>SUPERCITADEL</b>
              <span>Tiểu Tâm-First OS</span>
            </div>
          </div>
          <div className="sb-body">
            {NAV_GROUPS.map((g) => (
              <div key={g.label}>
                <div className="sb-gl">{g.label}</div>
                {g.items.map((it) => (
                  <button key={it.to} className={`sb-it ${is(it.to) ? 'active' : ''}`} onClick={nav(it.to)} title={it.label}>
                    <Icon name={it.icon} /><span className="sb-lb">{it.label}</span>
                    {it.to === '/chat' && badge ? <span className="sb-dot" style={{ background: 'var(--rose)' }} /> : null}
                  </button>
                ))}
              </div>
            ))}
            <div className="sb-gl">Tiểu Tâm</div>
            <button className={`sb-it ${is('/tieu-tam') ? 'active' : ''}`} onClick={nav('/tieu-tam')} title="Nhà của Tiểu Tâm">
              <Icon name="spark" /><span className="sb-lb">Nhà của em</span>
              <span className="sb-dot" style={{ background: energyColor }} />
            </button>
            <div className="sb-gl">Hệ thống</div>
            <button className={`sb-it ${is('/notifications') ? 'active' : ''}`} onClick={nav('/notifications')} title="Thông báo">
              <Icon name="bell" /><span className="sb-lb">Thông báo</span>
              {unread > 0 ? <span className="sb-dot" style={{ background: 'var(--rose)' }} /> : null}
            </button>
            <button className={`sb-it ${is('/settings') ? 'active' : ''}`} onClick={nav('/settings')} title="Cài đặt">
              <Icon name="cog" /><span className="sb-lb">Cài đặt</span>
            </button>
          </div>
          <div className="sb-foot">
            <button className="sb-user" onClick={nav('/settings')} title="Tài khoản">
              <div className="ava mint" style={{ width: 34, height: 34, borderRadius: 10, fontSize: 14 }}>{(userName || 'C').slice(0, 1)}</div>
              <div className="sb-ui">
                <b>{userName || '—'}</b>
                <span>{roleLabel[role] ?? role} · Cà Phê Nhà Mình</span>
              </div>
            </button>
            <button className="sb-toggle" onClick={toggleSb} title={collapsed ? 'Mở rộng' : 'Thu gọn'}>
              <Icon name="back" size={14} />
            </button>
          </div>
        </aside>

        {/* ── main ── */}
        <div className="main">
          <header className="topbar">
            <div className="tb-crumb">
              <span>SUPERCITADEL</span>
              {groupLabel && <><span className="sep">/</span><span>{groupLabel}</span></>}
              <span className="sep">/</span><b>{pageLabel}</b>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 9 }}>
              <button className="tb-act" onClick={nav('/search')} title="Tìm kiếm"><Icon name="search" size={16} /></button>
              <button className="tb-act" onClick={nav('/notifications')} title="Thông báo">
                <Icon name="bell" size={16} />
                {unread > 0 && <span className="tb-bdg">{unread}</span>}
              </button>
              <button className="tb-energy" onClick={() => setTtOpen(true)} title="Tiểu Tâm">
                <span style={{ fontSize: 13 }}>{soul ? (MOOD_EMOJI[soul.mood] ?? '🦊') : '🦊'}</span>
                <span className="bar"><i style={{ width: `${soul ? Math.max(3, Math.min(100, soul.energy)) : 100}%`, background: energyColor }} /></span>
                <span className="mono" style={{ fontSize: 10.5, color: energyColor }}>{soul ? `${Math.round(soul.energy)}%` : '·'}</span>
              </button>
            </div>
          </header>

          <div className={`shell${wide ? ' wide' : ''}`}>
            <OwnedBar />
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
              <button className={`bn ${is('/modules') || is('/items') || is('/crm') || is('/inventory') || is('/hr') || is('/accounting') || is('/om') ? 'active' : ''}`} onClick={nav('/modules')}><Icon name="grid" />Module</button>
              <button className={`bn ${is('/settings') ? 'active' : ''}`} onClick={nav('/settings')}><Icon name="user" />Tôi</button>
            </nav>
          </div>
        </div>
      </div>
      <TieuTamSheet open={ttOpen} onClose={() => setTtOpen(false)} />
    </>
  );
}

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
