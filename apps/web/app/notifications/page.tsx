'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { api, getSession } from '../../lib/api';

interface Notif { id: string; kind: string; title: string; bodyText: string | null; readAt: string | null; createdAt: string }
const KIND_STYLE: Record<string, { icon: string; bg: string; color: string }> = {
  chat: { icon: 'chat', bg: 'var(--jade-soft)', color: 'var(--jade)' },
  crm: { icon: 'users', bg: 'rgba(152,137,232,.14)', color: 'var(--violet)' },
  inventory: { icon: 'box', bg: 'var(--amber-soft)', color: 'var(--amber)' },
  om: { icon: 'coin', bg: 'var(--amber-soft)', color: 'var(--amber)' },
  system: { icon: 'shield', bg: 'var(--s3)', color: 'var(--dim)' },
};
const ago = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'vừa xong'; if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} giờ`;
  return `${Math.floor(h / 24)} ngày`;
};

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Notif[] | null>(null);
  const load = () => api<{ notifications: Notif[] }>('/api/v1/notifications').then((d) => setItems(d.notifications)).catch(() => setItems([]));
  useEffect(() => { if (!getSession()) { router.replace('/'); return; } load(); }, [router]);

  async function readOne(n: Notif) {
    if (n.readAt) return;
    setItems((p) => p?.map((x) => x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x) ?? null);
    await api(`/api/v1/notifications/${n.id}/read`, { method: 'PUT' }).catch(() => {});
  }
  async function readAll() {
    setItems((p) => p?.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })) ?? null);
    await api('/api/v1/notifications/read-all', { method: 'PUT' }).catch(() => {});
  }
  const unread = items?.filter((x) => !x.readAt).length ?? 0;

  return (
    <Shell>
      <div className="scroll">
        <div className="pg-h" style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
          <div style={{ flex: 1 }}><div className="k">Cập nhật{unread ? ` · ${unread} chưa đọc` : ''}</div><h1>Thông Báo</h1></div>
          {unread > 0 && <button className="chip" onClick={readAll}>Đọc hết</button>}
        </div>
        <div style={{ marginTop: 10 }}>
          {items === null && [1, 2, 3].map((i) => <div key={i} className="skel" style={{ height: 62, margin: '0 20px 8px' }} />)}
          {items?.length === 0 && <p className="mut" style={{ padding: 20, fontSize: 13 }}>Chưa có thông báo nào.</p>}
          {items?.map((n) => {
            const st = KIND_STYLE[n.kind] ?? KIND_STYLE.system;
            return (
              <div key={n.id} onClick={() => readOne(n)} style={{ display: 'flex', gap: 12, padding: '13px 20px', borderBottom: '1px solid var(--line)', alignItems: 'flex-start', cursor: 'pointer', background: !n.readAt ? 'linear-gradient(90deg,var(--jade-soft),transparent 60%)' : 'transparent' }}>
                <div style={{ width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center', flexShrink: 0, background: st.bg, color: st.color }}><Icon name={st.icon} size={17} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.4 }}>{n.title}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--mut)', marginTop: 3 }}>{ago(n.createdAt)} · {n.kind}{n.bodyText ? ` · ${n.bodyText}` : ''}</div>
                </div>
                {!n.readAt && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--jade)', marginTop: 6, flexShrink: 0 }} />}
              </div>
            );
          })}
        </div>
        <div style={{ height: 14 }} />
      </div>
    </Shell>
  );
}
