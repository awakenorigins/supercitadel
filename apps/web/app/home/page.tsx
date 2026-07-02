'use client';
// SUPERCITADEL Home V2 — KPI cards (tremor-style glow + sparkline), quick actions,
// hoạt động gần đây (audit-logs thật), Tiểu Tâm chào theo mood. Data THẬT từ endpoints hiện có.
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { api, getSession } from '../../lib/api';

interface Summary { kpis: any; team: { members: number }; pulse: { status: string; note: string } }
interface CrmStats { openDeals: number; totalValueVnd: number }
interface Soul { energy: number; status: string; statusLabel: string; mood: string }
interface AuditLog { id: string; action: string; createdAt: string; detail?: any }

const MOOD_GREET: Record<string, string> = {
  vui: 'Em đang tràn đầy năng lượng, hôm nay mình làm gì cũng được nè! 🦊',
  binh_thuong: 'Em sẵn sàng rồi — hỏi em về doanh thu, deal, tồn kho nhé.',
  met: 'Em hơi mệt xíu… nhưng việc nhẹ thì em vẫn cân được nha.',
  kiet_suc: 'Em kiệt sức rồi 🥺 cho em ăn gì đó ở Kho vật phẩm được không…',
};
const MOOD_EMOJI: Record<string, string> = { vui: '😊', binh_thuong: '🙂', met: '😮‍💨', kiet_suc: '🥺' };

// Nhãn tiếng Việt cho audit actions (feed hoạt động)
const ACTION_LABEL: Record<string, { label: string; icon: string; color: string; tint: string }> = {
  'auth.login': { label: 'Đăng nhập hệ thống', icon: 'shield', color: 'var(--sky)', tint: 'var(--sky-soft)' },
  'module.purchase': { label: 'Mua module', icon: 'grid', color: 'var(--amber)', tint: 'var(--amber-soft)' },
  'module.activate': { label: 'Bật module', icon: 'grid', color: 'var(--jade)', tint: 'var(--jade-soft)' },
  'module.deactivate': { label: 'Tắt module', icon: 'grid', color: 'var(--mut)', tint: 'var(--s3)' },
  'om.spend': { label: 'Chi Om', icon: 'coin', color: 'var(--amber)', tint: 'var(--amber-soft)' },
  'om.topup': { label: 'Nạp Om', icon: 'coin', color: 'var(--jade)', tint: 'var(--jade-soft)' },
  'store.item_purchase': { label: 'Mua vật phẩm', icon: 'bag', color: 'var(--violet)', tint: 'var(--violet-soft)' },
  'item.use': { label: 'Dùng vật phẩm', icon: 'gift', color: 'var(--violet)', tint: 'var(--violet-soft)' },
  'accounting.invoice_create': { label: 'Tạo hóa đơn', icon: 'book', color: 'var(--jade)', tint: 'var(--jade-soft)' },
  'accounting.payment_create': { label: 'Phiếu thu/chi', icon: 'book', color: 'var(--jade)', tint: 'var(--jade-soft)' },
  'hr.leave_decide': { label: 'Duyệt nghỉ phép', icon: 'users', color: 'var(--sky)', tint: 'var(--sky-soft)' },
  'tieu_tam.engine_change': { label: 'Đổi bộ não Tiểu Tâm', icon: 'spark', color: 'var(--jade)', tint: 'var(--jade-soft)' },
  'tieu_tam.memory_delete': { label: 'Xóa trí nhớ Tiểu Tâm', icon: 'spark', color: 'var(--rose)', tint: 'var(--rose-soft)' },
};

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ`;
  return `${Math.floor(h / 24)} ngày`;
}

// Sparkline trang trí (SVG thuần, không dependency) — nét jade mềm dưới KPI hero
function Spark({ color = 'var(--jade)' }: { color?: string }) {
  return (
    <svg className="kspark" width="72" height="26" viewBox="0 0 72 26" fill="none">
      <path d="M1 20 Q 8 18 13 15 T 26 13 T 39 15 T 52 8 T 71 3" stroke={color} strokeWidth="1.6" strokeLinecap="round" opacity=".8" />
      <path d="M1 20 Q 8 18 13 15 T 26 13 T 39 15 T 52 8 T 71 3 V 26 H 1 Z" fill={color} opacity=".08" />
    </svg>
  );
}

export default function Home() {
  const router = useRouter();
  const [sum, setSum] = useState<Summary | null>(null);
  const [crm, setCrm] = useState<CrmStats | null>(null);
  const [lowStock, setLowStock] = useState<number | null>(null);
  const [soul, setSoul] = useState<Soul | null>(null);
  const [logs, setLogs] = useState<AuditLog[] | null>(null);
  const [name, setName] = useState('bạn');
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const s = getSession();
    if (!s) { router.replace('/'); return; }
    setName(s.user.displayName ?? 'bạn');
    api<Summary>('/api/v1/dashboard/summary').then(setSum).catch(() => {});
    api<CrmStats>('/api/v1/crm/stats').then(setCrm).catch(() => setCrm(null));           // 403 nếu module tắt → ẩn số
    api<{ items: any[] }>('/api/v1/inventory/low-stock').then((d) => setLowStock(d.items.length)).catch(() => setLowStock(null));
    api<Soul>('/api/v1/tieu-tam/state').then(setSoul).catch(() => {});
    api<{ logs: AuditLog[] }>('/api/v1/audit-logs?limit=6').then((d) => setLogs(d.logs)).catch(() => setLogs([])); // staff không xem được → feed trống
    api<{ notifications: any[] }>('/api/v1/notifications?unread=true').then((d) => setUnread(d.notifications.length)).catch(() => {});
  }, [router]);

  const hour = new Date().getHours();
  const greet = hour < 11 ? 'Chào buổi sáng' : hour < 16 ? 'Chào buổi trưa' : hour < 19 ? 'Chào buổi chiều' : 'Chào buổi tối';

  const quickActions = [
    { icon: 'book', label: 'Hóa đơn', to: '/accounting', color: 'var(--jade)', tint: 'var(--jade-soft)' },
    { icon: 'target', label: 'Deal mới', to: '/crm', color: 'var(--violet)', tint: 'var(--violet-soft)' },
    { icon: 'box', label: 'Nhập kho', to: '/inventory', color: 'var(--amber)', tint: 'var(--amber-soft)' },
    { icon: 'users', label: 'Ca làm', to: '/hr', color: 'var(--sky)', tint: 'var(--sky-soft)' },
  ];

  return (
    <Shell badge={0}>
      <div className="scroll">
        {/* org row (mobile) */}
        <div style={{ padding: '16px 20px 0', display: 'flex', alignItems: 'center', gap: 11 }}>
          <div className="ava amber" style={{ width: 36, height: 36, borderRadius: 12 }}><Icon name="coffee" size={19} /></div>
          <b style={{ fontSize: 15 }}>Cà Phê Nhà Mình</b>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={() => router.push('/items')} title="Kho vật phẩm" className="tb-act" style={{ display: 'grid' }}><Icon name="bag" size={16} /></button>
            <button onClick={() => router.push('/search')} title="Tìm kiếm" className="tb-act" style={{ display: 'grid' }}><Icon name="search" size={16} /></button>
            <button onClick={() => router.push('/notifications')} title="Thông báo" className="tb-act" style={{ display: 'grid' }}>
              <Icon name="bell" size={16} />
              {unread > 0 && <span className="tb-bdg">{unread}</span>}
            </button>
          </div>
        </div>

        <div className="pg-h" style={{ paddingTop: 14 }}>
          <div className="k">{new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h1>{greet}, {name}</h1>
        </div>

        {/* ── Tiểu Tâm chào theo mood ── */}
        <div className="tt-greet">
          <div style={{ display: 'flex', alignItems: 'center', gap: 15, position: 'relative' }}>
            <div className={`core ${sum?.pulse.status?.includes('warning') ? 'warn' : ''}`} style={{ width: 64, height: 64, flexShrink: 0 }}>
              <div className="pulse" /><div className="pulse" />
              <div className="orb"><Icon name="spark" size={24} /></div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--jade)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                {soul ? `${MOOD_EMOJI[soul.mood] ?? '🦊'} ${soul.statusLabel} · ${Math.round(soul.energy)}%` : '● Nhịp quán hôm nay'}
              </div>
              <h2 className="fd" style={{ fontWeight: 700, fontSize: 16.5, marginTop: 6, lineHeight: 1.35 }}>
                {soul ? (MOOD_GREET[soul.mood] ?? MOOD_GREET.binh_thuong) : (sum ? sum.pulse.note : 'Đang lắng nghe nhịp quán…')}
              </h2>
              {soul && sum && <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>{sum.pulse.note}</div>}
            </div>
          </div>
          <button className="chip" style={{ marginTop: 13 }} onClick={() => window.dispatchEvent(new Event('citadel:tt-chat'))}>
            💬 Hỏi Tiểu Tâm ngay
          </button>
        </div>

        {/* ── KPI grid (tremor-style) ── */}
        <div className="sect">Tổng quan hôm nay</div>
        <div className="kpi-grid">
          <div className="kpi hero">
            <div className="ki" style={{ background: 'var(--jade-soft)', color: 'var(--jade)' }}><Icon name="up" size={16} /></div>
            <div className="kl">Doanh thu hôm nay</div>
            {sum ? (
              <>
                <div className="kv">{sum.kpis.revenueToday.value}</div>
                <div className="kt" style={{ color: 'var(--jade)' }}><Icon name="up" size={11} /> {sum.kpis.revenueToday.trend}</div>
              </>
            ) : <div className="skel" style={{ height: 34, marginTop: 8 }} />}
            <Spark />
          </div>
          <div className="kpi">
            <div className="ki" style={{ background: 'var(--violet-soft)', color: 'var(--violet)' }}><Icon name="target" size={16} /></div>
            <div className="kl">Deal đang mở</div>
            {crm !== null ? (
              <>
                <div className="kv">{crm.openDeals}</div>
                <div className="kt" style={{ color: 'var(--violet)' }}>{(crm.totalValueVnd / 1e6).toLocaleString('vi', { maximumFractionDigits: 1 })}tr giá trị</div>
              </>
            ) : <div className="kv" style={{ color: 'var(--faint)', fontSize: 15, marginTop: 8 }}>Module tắt</div>}
          </div>
          <div className="kpi">
            <div className="ki" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}><Icon name="box" size={16} /></div>
            <div className="kl">Hàng sắp hết</div>
            {lowStock !== null ? (
              <>
                <div className="kv" style={lowStock > 0 ? { color: 'var(--amber)' } : {}}>{lowStock}</div>
                <div className="kt" style={{ color: lowStock > 0 ? 'var(--amber)' : 'var(--mut)' }}>{lowStock > 0 ? 'cần nhập thêm' : 'kho ổn định'}</div>
              </>
            ) : <div className="kv" style={{ color: 'var(--faint)', fontSize: 15, marginTop: 8 }}>Module tắt</div>}
          </div>
          <div className="kpi">
            <div className="ki" style={{ background: 'var(--sky-soft)', color: 'var(--sky)' }}><Icon name="users" size={16} /></div>
            <div className="kl">Thành viên</div>
            {sum ? (
              <>
                <div className="kv">{sum.team.members}</div>
                <div className="kt" style={{ color: 'var(--mut)' }}>trong tổ chức</div>
              </>
            ) : <div className="skel" style={{ height: 26, marginTop: 6 }} />}
          </div>
        </div>

        {/* ── quick actions ── */}
        <div className="sect">Thao tác nhanh</div>
        <div className="qa-grid">
          {quickActions.map((a) => (
            <button key={a.label} className="qa" onClick={() => router.push(a.to)}>
              <div className="qi" style={{ background: a.tint, color: a.color }}><Icon name={a.icon} size={17} /></div>
              {a.label}
            </button>
          ))}
        </div>

        {/* ── hoạt động gần đây (audit-logs thật) ── */}
        <div className="sect">
          Hoạt động gần đây
          {logs && logs.length > 0 && (
            <button className="more" onClick={() => router.push('/settings')}>Xem tài khoản <Icon name="chevron" size={12} /></button>
          )}
        </div>
        <div className="feed">
          {logs === null && [0, 1, 2].map((i) => <div key={i} className="skel" style={{ height: 54, marginBottom: 8 }} />)}
          {logs !== null && logs.length === 0 && (
            <div className="card" style={{ padding: '18px 16px', textAlign: 'center', color: 'var(--mut)', fontSize: 12.5 }}>
              Chưa có hoạt động — hoặc cần quyền chủ tổ chức để xem nhật ký.
            </div>
          )}
          {logs?.map((l, i) => {
            const meta = ACTION_LABEL[l.action] ?? { label: l.action, icon: 'check', color: 'var(--dim)', tint: 'var(--s3)' };
            return (
              <div key={l.id} className="feed-it" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="fi" style={{ background: meta.tint, color: meta.color }}><Icon name={meta.icon} size={15} /></div>
                <div className="ft">
                  <b>{meta.label}</b>
                  <span className="mono">{l.action}</span>
                </div>
                <time>{timeAgo(l.createdAt)}</time>
              </div>
            );
          })}
        </div>

        {/* ── Tiểu Tâm gợi ý ── */}
        <div className="sect">Tiểu Tâm gợi ý</div>
        <div className="feed">
          {[
            { icon: 'users', tint: 'var(--jade-soft)', color: 'var(--jade)', t: 'Ca tối thường đông — xếp thêm 1 người?', m: 'Dựa trên 4 tuần gần đây' },
            { icon: 'user', tint: 'var(--violet-soft)', color: 'var(--violet)', t: 'Cô Hoa (VIP) 5 ngày chưa quay lại', m: 'Gửi ưu đãi giữ chân?' },
            { icon: 'box', tint: 'var(--amber-soft)', color: 'var(--amber)', t: 'Đặt sữa tươi trước 15h cho ca tối', m: 'Còn ~10 hộp' },
          ].map((f) => (
            <div key={f.t} className="feed-it">
              <div className="fi" style={{ background: f.tint, color: f.color }}><Icon name={f.icon} size={16} /></div>
              <div className="ft"><b>{f.t}</b><span>{f.m}</span></div>
            </div>
          ))}
        </div>
        <div style={{ height: 14 }} />
      </div>
    </Shell>
  );
}
