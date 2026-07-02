'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { api, getSession } from '../../lib/api';

interface Summary { kpis: any; team: { members: number }; pulse: { status: string; note: string } }

export default function Home() {
  const router = useRouter();
  const [sum, setSum] = useState<Summary | null>(null);
  const [name, setName] = useState('bạn');
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    const s = getSession();
    if (!s) { router.replace('/'); return; }
    setName(s.user.displayName ?? 'bạn');
    api<Summary>('/api/v1/dashboard/summary').then(setSum).catch(() => {});
    api<{ notifications: any[] }>('/api/v1/notifications?unread=true').then((d) => setUnread(d.notifications.length)).catch(() => {});
  }, [router]);

  const hour = new Date().getHours();
  const greet = hour < 11 ? 'Chào buổi sáng' : hour < 16 ? 'Chào buổi trưa' : hour < 19 ? 'Chào buổi chiều' : 'Chào buổi tối';

  return (
    <Shell badge={0}>
      <div className="scroll">
        <div style={{ padding: '16px 20px 0', display: 'flex', alignItems: 'center', gap: 11 }}>
          <div className="ava amber" style={{ width: 36, height: 36, borderRadius: 12 }}><Icon name="coffee" size={19} /></div>
          <b style={{ fontSize: 15 }}>Cà Phê Nhà Mình</b>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={() => router.push('/search')} style={{ width: 34, height: 34, borderRadius: 11, background: 'var(--s1)', border: '1px solid var(--bd)', color: 'var(--dim)', display: 'grid', placeItems: 'center' }}><Icon name="search" size={16} /></button>
            <button onClick={() => router.push('/notifications')} style={{ width: 34, height: 34, borderRadius: 11, background: 'var(--s1)', border: '1px solid var(--bd)', color: 'var(--dim)', display: 'grid', placeItems: 'center', position: 'relative' }}>
              <Icon name="bell" size={16} />
              {unread > 0 && <span className="mono" style={{ position: 'absolute', top: -4, right: -4, background: 'var(--rose)', color: '#fff', fontSize: 8.5, fontWeight: 700, borderRadius: 99, minWidth: 14, height: 14, display: 'grid', placeItems: 'center', padding: '0 3px' }}>{unread}</span>}
            </button>
          </div>
        </div>
        <div className="pg-h" style={{ paddingTop: 14 }}>
          <div className="k">{new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h1>{greet}, {name}</h1>
        </div>

        {/* pulse hero */}
        <div style={{ margin: '18px 20px 0', background: 'linear-gradient(145deg,var(--s2),var(--base))', border: '1px solid var(--bd2)', borderRadius: 24, padding: 20, position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div className={`core ${sum?.pulse.status?.includes('warning') ? 'warn' : ''}`} style={{ width: 72, height: 72, flexShrink: 0 }}>
              <div className="pulse" /><div className="pulse" />
              <div className="orb"><Icon name="spark" size={26} /></div>
            </div>
            <div>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--jade)', letterSpacing: '.08em', textTransform: 'uppercase' }}>● Nhịp quán hôm nay</div>
              <h2 className="fd" style={{ fontWeight: 700, fontSize: 18, marginTop: 6, lineHeight: 1.2 }}>
                {sum ? sum.pulse.note : 'Đang lắng nghe nhịp quán…'}
              </h2>
            </div>
          </div>
        </div>

        <div style={{ padding: '22px 20px 0', fontSize: 13, fontWeight: 700, color: 'var(--dim)' }}>Tổng quan hôm nay</div>
        {/* bento */}
        <div style={{ padding: '12px 20px 0', display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 11 }}>
          <div className="card" style={{ gridRow: 'span 2', padding: 15, background: 'linear-gradient(160deg,var(--jade-soft),var(--s1))', borderColor: 'rgba(52,211,184,.22)' }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--jade-soft)', color: 'var(--jade)', display: 'grid', placeItems: 'center' }}><Icon name="up" size={16} /></div>
            <div style={{ fontSize: 11.5, color: 'var(--mut)', marginTop: 11 }}>Doanh thu hôm nay</div>
            {sum ? (
              <>
                <div className="mono" style={{ fontWeight: 700, fontSize: 34, marginTop: 8 }}>{sum.kpis.revenueToday.value}</div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--jade)', marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="up" size={12} /> {sum.kpis.revenueToday.trend}</div>
              </>
            ) : <div className="skel" style={{ height: 40, marginTop: 10 }} />}
          </div>
          <div className="card" style={{ padding: 15 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--amber-soft)', color: 'var(--amber)', display: 'grid', placeItems: 'center' }}><Icon name="cart" size={16} /></div>
            <div style={{ fontSize: 11.5, color: 'var(--mut)', marginTop: 11 }}>Đơn hàng</div>
            {sum ? <div className="mono" style={{ fontWeight: 700, fontSize: 23, marginTop: 3 }}>{sum.kpis.orders.value}</div> : <div className="skel" style={{ height: 26, marginTop: 6 }} />}
          </div>
          <div className="card" style={{ padding: 15 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--s3)', color: 'var(--dim)', display: 'grid', placeItems: 'center' }}><Icon name="users" size={16} /></div>
            <div style={{ fontSize: 11.5, color: 'var(--mut)', marginTop: 11 }}>Thành viên</div>
            {sum ? <div className="mono" style={{ fontWeight: 700, fontSize: 23, marginTop: 3 }}>{sum.team.members}</div> : <div className="skel" style={{ height: 26, marginTop: 6 }} />}
          </div>
        </div>

        <div style={{ padding: '22px 20px 0', fontSize: 13, fontWeight: 700, color: 'var(--dim)' }}>Tiểu Tâm gợi ý</div>
        <div style={{ padding: '12px 20px 0' }}>
          {[
            { icon: 'users', tint: 'var(--jade-soft)', color: 'var(--jade)', t: 'Ca tối thường đông — xếp thêm 1 người?', m: 'Dựa trên 4 tuần gần đây' },
            { icon: 'user', tint: 'rgba(152,137,232,.14)', color: 'var(--violet)', t: 'Cô Hoa (VIP) 5 ngày chưa quay lại', m: 'Gửi ưu đãi giữ chân?' },
            { icon: 'box', tint: 'var(--amber-soft)', color: 'var(--amber)', t: 'Đặt sữa tươi trước 15h cho ca tối', m: 'Còn ~10 hộp' },
          ].map((f) => (
            <div key={f.t} className="card" style={{ display: 'flex', gap: 12, padding: 13, borderRadius: 15, marginBottom: 8, alignItems: 'center' }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, background: f.tint, color: f.color, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name={f.icon} size={17} /></div>
              <div><div style={{ fontSize: 13, fontWeight: 500 }}>{f.t}</div><div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 2 }}>{f.m}</div></div>
            </div>
          ))}
        </div>
        <div style={{ height: 14 }} />
      </div>
    </Shell>
  );
}
