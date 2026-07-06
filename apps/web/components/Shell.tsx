'use client';
// SUPERCITADEL Shell V2 — desktop: sidebar collapsible + topbar (breadcrumb/search/bell/energy pill);
// mobile: bottom nav 5 mục (giữ V7A). Tiểu Tâm sheet SSE streaming GIỮ NGUYÊN hoạt động.
import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from './Icon';
import { OwnedBar } from './OwnedBar';
import { SecretaryWidget } from './SecretaryWidget';
import { Tutorial, TutorialHelpButton, TutorialFab } from './Tutorial';
import { API, api, getSession } from '../lib/api';
import { applyTheme, applyStoredTheme } from '../lib/theme';

interface Msg { who: 'ai' | 'me'; text: string; tool?: any; suggestions?: string[]; pendingAction?: any; replyTo?: { text: string; who: 'ai' | 'me' } }
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
              <div key={g.label} {...(g.label === 'Nghiệp vụ' ? { 'data-tut': 'biz-group' } : {})}>
                <div className="sb-gl">{g.label}</div>
                {g.items.map((it) => (
                  <button key={it.to} className={`sb-it ${is(it.to) ? 'active' : ''}`} onClick={nav(it.to)} title={it.label}
                    {...(it.to === '/om' ? { 'data-tut': 'nav-om' } : it.to === '/modules' ? { 'data-tut': 'nav-modules' } : {})}>
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
              <div className="sb-ava">{(userName || 'C').slice(0, 1)}</div>
              <div className="sb-ui">
                <b>{userName || '—'}</b>
                <span>Cà Phê Nhà Mình</span>
                {role && <span className="sb-role">{roleLabel[role] ?? role}</span>}
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
              <TutorialHelpButton />
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
      <SecretaryWidget />
      <Tutorial />
      <TutorialFab />
    </>
  );
}

/** R7.6: render text AI — đỡ markdown thô: **bold** → <b>, dọn `code`, giữ xuống dòng. */
function renderAiText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <b key={i}>{p.slice(2, -2)}</b>;
    return <span key={i}>{p.replace(/`([^`]+)`/g, '$1')}</span>;
  });
}

// Định dạng tiền VND gọn
function fmtVND(v: any): string {
  const n = Number(v);
  if (!isFinite(n)) return String(v ?? '');
  return n.toLocaleString('vi-VN') + '\u00a0₫';
}

// Tải file qua fetch (kèm Bearer) rồi mở/blob — dùng cho export hoá đơn PDF/Excel.
async function downloadAuthed(path: string, filename: string, openInline = false) {
  const s = getSession();
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${s?.jwt ?? ''}` } });
  if (!res.ok) { alert('Không tải được file — thử lại nhé'); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  if (openInline) { window.open(url, '_blank'); }
  else { const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Nhận diện kết quả action là hoá đơn → trả data hoá đơn để render thẻ đẹp + nút xuất file.
function invoiceOf(tool: any): any | null {
  if (!Array.isArray(tool)) return null;
  for (const t of tool) {
    const r = t?.result ?? t;
    const d = r?.data ?? r;
    const action = r?.action ?? t?.tool ?? '';
    if (d && (d.docNo || d.doc_no) && (/hoa_don|invoice/i.test(String(action)) || d.total !== undefined)) {
      return { docNo: d.docNo ?? d.doc_no, docDate: d.docDate ?? d.doc_date, total: d.total, subtotal: d.subtotal, taxRate: d.taxRate ?? d.tax_rate, taxAmount: d.taxAmount ?? d.tax_amount, status: d.status, amountPaid: d.amountPaid ?? d.amount_paid };
    }
  }
  return null;
}

// Thẻ hoá đơn đẹp thay cho JSON thô + nút xem PDF / tải Excel.
function InvoiceCard({ inv }: { inv: any }) {
  const key = encodeURIComponent(inv.docNo);
  return (
    <div className="tcard" style={{ borderColor: 'rgba(20,163,127,.35)' }}>
      <div className="th" style={{ background: 'rgba(20,163,127,.1)' }}>
        🧾 Hoá đơn {inv.docNo}
        <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: inv.status === 'POSTED' ? 'rgba(52,211,184,.18)' : 'rgba(245,197,84,.18)', color: inv.status === 'POSTED' ? 'var(--jade)' : 'var(--amber)' }}>{inv.status}</span>
      </div>
      <div style={{ padding: '11px 13px', fontSize: 12.5, display: 'grid', gap: 6 }}>
        {inv.docDate && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--mut)' }}>Ngày</span><span>{inv.docDate}</span></div>}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--mut)' }}>Tiền hàng</span><span>{fmtVND(inv.subtotal)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--mut)' }}>Thuế ({inv.taxRate ?? 0}%)</span><span>{fmtVND(inv.taxAmount)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 6, fontWeight: 800, fontSize: 15, color: 'var(--jade)' }}><span>Tổng cộng</span><span>{fmtVND(inv.total)}</span></div>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '0 13px 12px' }}>
        <button className="btn-p" style={{ width: 'auto', flex: 1, padding: '9px 10px', fontSize: 12.5 }} onClick={() => downloadAuthed(`/api/v1/ke-toan-10a/invoices/${key}/print.html`, `hoa-don-${inv.docNo}.html`, true)}>📄 Xem / In PDF</button>
        <button className="chip" style={{ padding: '9px 12px', fontSize: 12.5 }} onClick={() => downloadAuthed(`/api/v1/ke-toan-10a/invoices/${key}/export.xlsx`, `hoa-don-${inv.docNo}.xlsx`)}>📊 Excel</button>
      </div>
    </div>
  );
}

const TT_GREETING: Msg = { who: 'ai', text: 'Chào bạn! Tôi là Tiểu Tâm. Hỏi tôi về doanh thu, deal, tồn kho, ca làm…', suggestions: ['Doanh thu hôm nay', 'Deal đang mở', 'Tồn kho thế nào'] };

function TieuTamSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([TT_GREETING]);
  const [histLoaded, setHistLoaded] = useState(false);
  // R7.6: mở sheet → load lịch sử hội thoại thật từ backend (chat bền vững như messenger)
  useEffect(() => {
    if (!open || histLoaded) return;
    const s = getSession();
    if (!s) return;
    fetch(`${API}/api/v1/tieu-tam/chat/history?limit=40`, { headers: { Authorization: `Bearer ${s.jwt}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.messages?.length) setMsgs([TT_GREETING, ...d.messages.map((m: any) => ({ who: m.role === 'user' ? 'me' as const : 'ai' as const, text: m.content }))]);
        setHistLoaded(true);
      })
      .catch(() => setHistLoaded(true));
  }, [open, histLoaded]);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<{ text: string; who: 'ai' | 'me' } | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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

  async function ask(q: string, opts: { confirm?: boolean; pendingAction?: any } = {}) {
    // Có file chờ + caption → gửi file kèm caption 1 lượt (không bắt buộc có text)
    if (pendingFile && !opts.confirm) { const f = pendingFile; setPendingFile(null); await uploadFile(f, q.trim()); setDraft(''); return; }
    if (!q.trim() || streaming) return;
    setDraft('');
    const rt = replyTo; setReplyTo(null);
    const composed = rt ? `[Trả lời tin: "${rt.text.slice(0, 80)}"]\n${q}` : q;
    setMsgs((m) => [...m, { who: 'me', text: q, replyTo: rt ?? undefined }, { who: 'ai', text: '' }]);
    setStreaming(true);
    const s = getSession();
    try {
      const res = await fetch(`${API}/api/v1/tieu-tam/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s?.jwt ?? ''}` },
        body: JSON.stringify({ message: composed, userName: s?.user.displayName ?? undefined, confirm: !!opts.confirm, pendingAction: opts.pendingAction }),
      });
      if (res.status === 401 || res.status === 403) {
        setMsgs((m) => [...m.slice(0, -1), { who: 'ai', text: 'Phiên đăng nhập đã hết hạn — đăng nhập lại giúp em nha (mở trang đăng nhập, dán token của bạn). 🔑' }]);
        return;
      }
      if (!res.ok) throw new Error('chat fail');
      const d = await res.json();
      if (typeof d.energy === 'number') setSoul((prev) => ({ ...(prev ?? { mood: d.mood ?? 'binh_thuong', status: d.status ?? 'on_dinh', statusLabel: '', energy: d.energy }), ...d }));
      const firstTool = Array.isArray(d.toolCalls) ? d.toolCalls[0] : undefined;
      const pending = firstTool?.result?.pendingAction;
      setMsgs((m) => [...m.slice(0, -1), { who: 'ai', text: d.text ?? '', tool: d.toolCalls, suggestions: d.suggestions, pendingAction: pending }]);
    } catch {
      setMsgs((m) => [...m.slice(0, -1), { who: 'ai', text: 'Mạng đang chập chờn, em chưa nhận được câu này — bấm gửi lại giúp em nha. Các lệnh nghiệp vụ (tạo phiếu, thêm khách, nhập kho…) vẫn chạy bình thường. 📡', suggestions: [q] }]);
    } finally { setStreaming(false); }
  }

  async function uploadFile(f: File, caption = '') {
    const s = getSession(); const fd = new FormData(); fd.append('file', f); if (caption) fd.append('caption', caption);
    const label = caption ? `📎 ${f.name}\n${caption}` : `📎 ${f.name}`;
    setMsgs((m) => [...m, { who: 'me', text: label }, { who: 'ai', text: '' }]);
    try {
      const res = await fetch(`${API}/api/v1/tieu-tam/files`, { method: 'POST', headers: { Authorization: `Bearer ${s?.jwt ?? ''}` }, body: fd });
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      setMsgs((m) => [...m.slice(0, -1), { who: 'ai', text: `Đã nhận file: ${d.file.filename}\n${d.file.summary}\nEm nhớ file này rồi — nói em cần làm gì: nhập kho, thêm nhân viên, hay nhập danh bạ/hóa đơn K10A.`, suggestions: ['Nhập vào kho', 'Thêm nhân viên', 'File này có gì'] }]);
    } catch { setMsgs((m) => [...m.slice(0, -1), { who: 'ai', text: 'Em chưa nhận được file này. Chỉ hỗ trợ .xlsx/.csv/.txt tối đa 5MB nha.' }]); }
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
              <div style={{ minWidth: 0 }} className="tt-msg-wrap">
                {m.replyTo && (
                  <div style={{ fontSize: 11, color: 'var(--mut)', borderLeft: '3px solid var(--jade)', paddingLeft: 8, margin: '0 0 4px', opacity: .85, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>↳ {m.replyTo.text}</div>
                )}
                {m.text || m.who === 'me' ? <div className={`bub ${m.who === 'me' ? 'me' : 'ai'}`} style={{ whiteSpace: 'pre-wrap', position: 'relative' }}>{m.who === 'ai' ? renderAiText(m.text) : m.text}{m.who === 'ai' && streaming && i === msgs.length - 1 ? <span className="blink" /> : null}
                    {m.text && !(streaming && i === msgs.length - 1) && (
                      <button onClick={() => setReplyTo({ text: m.text.replace(/\n/g, ' ').slice(0, 120), who: m.who })} title="Trả lời tin này" className="tt-reply-btn" style={{ position: 'absolute', top: -9, right: -9, width: 24, height: 24, borderRadius: 7, background: 'var(--s2)', border: '1px solid var(--bd)', color: 'var(--mut)', fontSize: 12, display: 'grid', placeItems: 'center', cursor: 'pointer', opacity: 0 }}>↩</button>
                    )}
                  </div>
                  : <div className="typing"><span /><span /><span /></div>}
                {m.pendingAction && (
                  <div className="tcard confirm"><div className="th">Xem trước hành động <span style={{ marginLeft: 'auto', color: 'var(--amber)' }}>Cần xác nhận</span></div>
                    <div style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--mut)' }}>{m.tool?.[0]?.result?.preview?.description ?? m.pendingAction.name}</div>
                    <pre className="mono" style={{ margin: '0 12px 10px', padding: 10, fontSize: 11, color: 'var(--dim)', overflow: 'auto', background: 'var(--s1)', borderRadius: 10 }}>{JSON.stringify(m.pendingAction.params, null, 1)}</pre>
                    <div style={{ display: 'flex', gap: 8, padding: '0 12px 12px' }}>
                      <button className="btn-p" style={{ width: 'auto', padding: '8px 12px', fontSize: 12 }} onClick={() => ask('Xác nhận', { confirm: true, pendingAction: m.pendingAction })}>Xác nhận</button>
                      <button className="chip" style={{ padding: '8px 12px', fontSize: 12 }} onClick={() => setMsgs((all) => all.map((x) => x === m ? { ...x, pendingAction: undefined, text: `${x.text}\n\nĐã hủy hành động xem trước.` } : x))}>Hủy</button>
                    </div></div>
                )}
                {m.tool && !m.pendingAction && (
                  invoiceOf(m.tool)
                    ? <InvoiceCard inv={invoiceOf(m.tool)} />
                    : <details className="tcard"><summary className="th" style={{ cursor: 'pointer', listStyle: 'none' }}>{m.tool[0]?.tool} · {m.tool[0]?.module} <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--mut)' }}>chi tiết ↓</span></summary>
                        <pre className="mono" style={{ padding: 12, fontSize: 11, color: 'var(--dim)', overflow: 'auto' }}>{JSON.stringify(m.tool[0]?.result, null, 1)}</pre></details>
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
          {replyTo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '7px 10px', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 10, borderLeft: '3px solid var(--jade)' }}>
              <span style={{ fontSize: 11.5, color: 'var(--mut)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>↳ Trả lời: {replyTo.text}</span>
              <button onClick={() => setReplyTo(null)} style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--s3)', border: 'none', color: 'var(--dim)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Icon name="x" size={12} /></button>
            </div>
          )}
          {pendingFile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '7px 10px', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 10 }}>
              <span style={{ fontSize: 12 }}>📎 {pendingFile.name}</span>
              <span style={{ fontSize: 10.5, color: 'var(--mut)', marginLeft: 2 }}>— gõ chú thích rồi gửi (không bắt buộc)</span>
              <button onClick={() => setPendingFile(null)} style={{ marginLeft: 'auto', width: 22, height: 22, borderRadius: 6, background: 'var(--s3)', border: 'none', color: 'var(--dim)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Icon name="x" size={12} /></button>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--s1)', border: '1.5px solid var(--bd)', borderRadius: 14, padding: '7px 7px 7px 14px' }}>
            <input ref={fileRef} type="file" accept=".xlsx,.csv,.txt" style={{ display: 'none' }} onChange={(e) => { const f=e.target.files?.[0]; if (f) setPendingFile(f); e.currentTarget.value=''; }} />
            <button onClick={() => fileRef.current?.click()} aria-label="Tải file cho Tiểu Tâm" title="Tải file" style={{ width: 38, height: 38, borderRadius: 11, border: '1px solid var(--bd)', background: 'var(--s2)', color: 'var(--txt)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>📎</button>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask(draft)} placeholder={pendingFile ? 'Chú thích cho file (tùy chọn) rồi gửi…' : 'Hỏi Tiểu Tâm bất cứ điều gì…'} style={{ flex: 1, background: 'none', border: 'none', color: 'var(--txt)', fontSize: 14, outline: 'none', minWidth: 0 }} />
            {/* R7.6: touch target 46px — dễ bấm trên điện thoại */}
            <button onClick={() => ask(draft)} disabled={streaming} aria-label="Gửi tin nhắn" style={{ width: 46, height: 46, borderRadius: 13, border: 'none', background: streaming ? 'var(--s3)' : 'var(--jade)', color: streaming ? 'var(--dim)' : '#04231f', display: 'grid', placeItems: 'center', flexShrink: 0, cursor: 'pointer', touchAction: 'manipulation' }}><Icon name="send" size={20} /></button>
          </div>
        </div>
      </div>
    </>
  );
}
